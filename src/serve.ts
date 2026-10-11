import type { Candidate } from './adapter.js'
import type { CycleDeps, CycleOptions, CycleReport, ItemRun } from './loop.js'
import { catchUpItem, honourIdleStop, planCycle, runItem } from './loop.js'
import type { Gate } from './budget.js'
import { windsDownOnSignal } from './execute.js'
import { noteHandoff, shouldDefer } from './deferred.js'
import type { Role } from './role.js'
import { waitingNotice } from './claiming.js'

/**
 * The loop. One cycle, sleep, repeat.
 *
 * Two properties matter more than throughput. **A failing cycle must not end the process** —
 * a tracker outage, a rate limit, a malformed response are all ordinary, and an Igor that
 * exits on the first of them is an Igor somebody has to nurse. And **a shutdown must not
 * abandon a claim silently**: the whole claim protocol rests on an Igor either finishing or
 * saying why not, and being killed is not an exemption.
 */

export interface ServeOptions extends CycleOptions {
  /** Defaults to the role's own poll interval. */
  pollMinutes?: number
  /** Stop after this many cycles. Absent means run until told to stop. */
  maxCycles?: number
  gate: () => Promise<Gate>
  /**
   * Rendered lore for the item about to be worked. Supplied per item rather than per cycle:
   * the store is a repository someone may have merged to while the loop was sleeping.
   *
   * Keep this required. If it were optional, a caller could leave it out and the Igor would
   * run with no lore at all, while every test stayed green, because the tests supply lore
   * directly. A caller that wants no lore has to say so.
   */
  loreFor: (item: Candidate) => string | Promise<string>
  /** Injected in tests, so the wiring is exercised rather than only the rule it applies. */
  note?: typeof noteHandoff
  onEvent?: (event: ServeEvent) => void
  sleep?: (ms: number) => Promise<void>
  /** Resolves when the process should wind down. */
  until?: Promise<void>
  /**
   * Whether the Igor can still act as its surface identity: `true`, or why not. Asked before each
   * cycle's work and before each item, so a credential GitHub stops accepting stops new work
   * until it is accepted again.
   */
  credential?: () => Promise<true | string>
}

export type ServeEvent =
  | { kind: 'cycle-start'; cycle: number }
  | { kind: 'planned'; cycle: number; report: CycleReport }
  | { kind: 'working'; item: Candidate; seat?: string }
  // Carries the seat because spend is attributed by it: recording an execution without one
  // detaches it from the role's share, which is computed per seat.
  | { kind: 'worked'; item: Candidate; run: ItemRun; seat?: string }
  | { kind: 'cycle-failed'; cycle: number; error: Error }
  /** The surface credential was refused, so the cycle takes no new item. */
  | { kind: 'credential-refused'; cycle: number; reason: string }
  | { kind: 'sleeping'; minutes: number }
  | { kind: 'stopping'; reason: string }

export interface ServeSummary {
  cycles: number
  worked: number
  failures: number
  costUsd: number
}

const sleepFor = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export async function serve(
  deps: CycleDeps,
  role: Role,
  identity: string,
  options: ServeOptions,
): Promise<ServeSummary> {
  const poll = (options.pollMinutes ?? role.pollMinutes) * 60_000
  const sleep = options.sleep ?? sleepFor
  const emit = options.onEvent ?? (() => {})
  const summary: ServeSummary = { cycles: 0, worked: 0, failures: 0, costUsd: 0 }

  let winding = false
  void options.until?.then(() => {
    winding = true
  })

  for (let cycle = 1; options.maxCycles === undefined || cycle <= options.maxCycles; cycle++) {
    if (winding) break
    summary.cycles = cycle
    emit({ kind: 'cycle-start', cycle })

    // **A surface that does not answer ends the cycle.** Nothing about the items caused it, so
    // every remaining item would get the same answer, and each one refused posts two comments
    // per poll for as long as the outage lasts. That volume alone can trip a rate limit.
    //
    // Both item loops share `abandon`. The catch-up loop runs first, so a check only in the
    // claim loop would miss an outage the catch-up loop meets.
    //
    // **The second one in a row ends the cycle, not the first.** A run cannot tell whether a
    // failure is the surface's or the item's: `codeHost.produce` fails inside `execute` for a
    // branch the item already owns, while a tracker that does not answer the completion
    // unassign fails outside it, so neither the error nor what the run reached separates them.
    // How many items fail does: an outage fails every item, and a bad item fails one. A table
    // of error shapes is rejected, because the first error it doesn't list falls through.
    //
    // The count is of consecutive failures, so one wedged item cannot add up to a stop across a
    // healthy cycle.
    let abandoned = false
    let inARow = 0
    const abandon = (run: ItemRun): boolean => {
      if (run.surfaceFailed !== true) {
        inARow = 0
        return false
      }
      // The first one is not reported as a cycle failure: the run reports its own reason
      // per item, and a cycle that recovered on the next item did not fail.
      if ((inARow += 1) < 2) return false
      abandoned = true
      summary.failures += 1
      emit({ kind: 'cycle-failed', cycle, error: new Error(run.reason) })
      return true
    }

    // **A refused credential takes no new item, and says whose it was.** The question costs a
    // mint at most, never an item, and it is asked again next cycle, which is how the Igor
    // resumes once the credential works without waiting for an item to probe it.
    const refused = async (): Promise<boolean> => {
      const answer = (await options.credential?.()) ?? true
      if (answer === true) return false
      emit({ kind: 'credential-refused', cycle, reason: answer })
      // The claim loop checks this before its own question, so one refusal is reported once.
      abandoned = true
      return true
    }

    if (!(await refused())) try {
      // Identity comes from the argument, never from the options: if the two disagreed, the
      // loop would screen holders as one Igor and claim as another.
      //
      // `options.gate` reaches `planCycle` through the spread. `planCycle` calls it only where
      // there is something to triage, so triage spends the seat a worker would have chosen.
      const report = await planCycle(deps, role, { ...options, identity })
      summary.costUsd += report.triageCostUsd
      emit({ kind: 'planned', cycle, report })

      // Before new work. An artifact already published and no longer merging is the closest
      // thing this Igor has to unfinished business, and the ordinary case of it is one request.
      for (const { candidate } of report.toCatchUp) {
        if (winding) {
          emit({ kind: 'stopping', reason: 'asked to stop between items' })
          break
        }
        if (await refused()) break
        // Catching up counts against the gate like any other work. The quiet path spends
        // nothing, but the conflicting one spends a worker, and it is the same gate that
        // decides whether there is a worker to spend.
        const gate = await options.gate()
        if (gate.exhausted()) {
          emit({ kind: 'stopping', reason: gate.reason })
          break
        }
        emit({ kind: 'working', item: candidate, ...(gate.seat === undefined ? {} : { seat: gate.seat }) })
        const run = await catchUpItem(deps, candidate, role, identity, {
          ...options,
          budget: gate,
          claim: { ...options.claim, since: report.readAt },
        })
        summary.worked += 1
        summary.costUsd += run.costUsd ?? 0
        if (shouldDefer(run.outcome, run.handoff, run.cures)) {
          await (options.note ?? noteHandoff)(deps.destination, candidate, run.reason).catch(() => undefined)
        }
        emit({ kind: 'worked', item: candidate, run, ...(gate.seat === undefined ? {} : { seat: gate.seat }) })
        if (abandon(run)) break
      }

      // A person handed these to this Igor while another Igor holds them. One notice each, which
      // the cycle stops finding once it is posted; nothing is claimed.
      // Stops said while nothing was running: the label comes off, with a receipt.
      for (const { candidate, stop } of report.stopped) {
        if (abandoned || winding || stop === undefined) continue
        await honourIdleStop(deps.tracker, candidate, role, identity, stop).catch(() => undefined)
      }

      for (const { candidate, holders, notice } of report.waiting) {
        if (abandoned || winding) break
        await deps.tracker.report(candidate, notice ?? waitingNotice(role, holders ?? [])).catch(() => undefined)
      }

      for (const { candidate, directed, handedOverAt } of report.toClaim) {
        // The outage the catch-up loop met answers every claim here the same way, and claiming
        // is the louder of the two — a claim comment and a handoff on each.
        if (abandoned) break
        // Checked between items rather than once per cycle: an item can take minutes, and a
        // shutdown or an exhausted budget should stop the next one rather than the next cycle.
        if (winding) {
          emit({ kind: 'stopping', reason: 'asked to stop between items' })
          break
        }
        if (await refused()) break
        const gate = await options.gate()
        if (gate.exhausted()) {
          emit({ kind: 'stopping', reason: gate.reason })
          break
        }
        emit({ kind: 'working', item: candidate, ...(gate.seat === undefined ? {} : { seat: gate.seat }) })
        const lore = await options.loreFor(candidate)
        const run = await runItem(deps, candidate, role, identity, {
          ...options,
          budget: gate,
          lore,
          // A claim scans for stops from when the cycle read the item, or for a handed-over item
          // from the hand-over, so a stop said while the cycle worked other items stops it.
          claim:
            directed === true
              ? { ...options.claim, directed: true, since: handedOverAt ?? report.readAt }
              : { ...options.claim, since: report.readAt },
        })
        summary.worked += 1
        // A run whose cost never arrived adds nothing here, so this total is a floor. The
        // ledger records the absence rather than a zero.
        summary.costUsd += run.costUsd ?? 0
        if (shouldDefer(run.outcome, run.handoff, run.cures)) {
          await (options.note ?? noteHandoff)(deps.destination, candidate, run.reason).catch(() => undefined)
        }
        emit({ kind: 'worked', item: candidate, run, ...(gate.seat === undefined ? {} : { seat: gate.seat }) })
        if (abandon(run)) break
      }
    } catch (error) {
      // A cycle is allowed to fail, and the next one retries.
      //
      // **This catch cannot tell a cycle that failed holding nothing from one that failed
      // holding an item.** It reports only the cycle, so an operator would see a cycle-level
      // error and never the item left silent underneath it. Nothing holding a claim reaches
      // here: `takeClaim` guards its claim window and `runItem` guards everything after it, and
      // both release and refuse rather than throw. What reaches this catch is the cycle's own
      // work: discovery, planning and triage. Any new path that can throw while holding a claim
      // must release it itself, because nothing here will.
      summary.failures += 1
      emit({ kind: 'cycle-failed', cycle, error: error instanceof Error ? error : new Error(String(error)) })
    }

    if (winding) break
    if (options.maxCycles !== undefined && cycle >= options.maxCycles) break
    emit({ kind: 'sleeping', minutes: poll / 60_000 })
    await sleep(poll)
  }

  return summary
}

/** Resolves on the first interrupt, so the loop finishes what it holds rather than vanishing. */
export function untilSignalled(
  on: (signal: string, handler: () => void) => void = (s, h) => {
    process.on(s as NodeJS.Signals, h)
  },
): Promise<void> {
  // Without this, Igor's own signal handler kills every running worker and exits the moment
  // the signal lands. Declaring a graceful shutdown lets the worker in hand finish while the
  // loop winds down.
  windsDownOnSignal()
  return new Promise((resolve) => {
    for (const signal of ['SIGINT', 'SIGTERM']) on(signal, () => resolve())
  })
}
