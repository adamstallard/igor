import type { Candidate } from './adapter.js'
import type { CycleDeps, CycleOptions, CycleReport, ItemRun } from './loop.js'
import { catchUpItem, planCycle, runItem } from './loop.js'
import type { Gate } from './budget.js'
import { windsDownOnSignal } from './execute.js'
import { noteHandoff, shouldDefer } from './deferred.js'
import type { Role } from './role.js'

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
   * Required, not optional. It was optional, and `igor serve` simply never passed it — so the
   * whole lore-firing capability was absent from the only command that runs continuously,
   * while the tests that supply it directly stayed green. A caller that wants no lore has to
   * say so.
   */
  loreFor: (item: Candidate) => string | Promise<string>
  /** Injected in tests, so the wiring is exercised rather than only the rule it applies. */
  note?: typeof noteHandoff
  onEvent?: (event: ServeEvent) => void
  sleep?: (ms: number) => Promise<void>
  /** Resolves when the process should wind down. */
  until?: Promise<void>
}

export type ServeEvent =
  | { kind: 'cycle-start'; cycle: number }
  | { kind: 'planned'; cycle: number; report: CycleReport }
  | { kind: 'working'; item: Candidate; seat?: string }
  // Carries the seat because spend is attributed by it: recording an execution without one
  // detaches it from the role's share, which is computed per seat.
  | { kind: 'worked'; item: Candidate; run: ItemRun; seat?: string }
  | { kind: 'cycle-failed'; cycle: number; error: Error }
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

    // **A surface that did not answer ends the cycle.** Nothing about the item produced it, so
    // the next one gets the same answer — and doing that to a whole pool is two comments each
    // per poll, for as long as the outage lasts, at a volume that is itself what trips a rate
    // limit. Abandoning is what a throw used to do here, before the item-level paths learned to
    // release and refuse instead of propagating.
    //
    // Shared by both item loops rather than written into one. The catch-up loop runs first, so
    // a guard only on the second is a guard the outage never reaches.
    //
    // **The second one in a row ends the cycle, not the first.** Whether a failure is the
    // surface's or the item's is not something the run can tell — `codeHost.produce` fails
    // inside `execute` for a branch the item already owns, while a tracker refusing the
    // completion unassign fails outside it, so neither the error nor what the run holds
    // separates them. What does separate them is how many items they affect: an outage fails
    // every item and a bad item fails one. Counting is that distinction, drawn from behaviour
    // rather than from a table of error shapes — which is the guard-per-route mistake
    // `docs/architecture.md:1538` records.
    //
    // Consecutive, so one wedged item does not accumulate a stop across a healthy cycle.
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

    try {
      // Identity comes from the argument, never from the options: the two disagreeing would
      // mean the loop screening holders as one Igor and claiming as another.
      // `options.gate` rides along in the spread — `planCycle` reads it itself, only where
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
        // Catching up counts against the gate like any other work. The quiet path spends
        // nothing, but the conflicting one spends a worker, and it is the same gate that
        // decides whether there is a worker to spend.
        const gate = await options.gate()
        if (gate.exhausted()) {
          emit({ kind: 'stopping', reason: gate.reason })
          break
        }
        emit({ kind: 'working', item: candidate, ...(gate.seat === undefined ? {} : { seat: gate.seat }) })
        const run = await catchUpItem(deps, candidate, role, identity, { ...options, budget: gate })
        summary.worked += 1
        summary.costUsd += run.costUsd ?? 0
        if (shouldDefer(run.outcome, run.handoff, run.cures)) {
          await (options.note ?? noteHandoff)(deps.destination, candidate, run.reason).catch(() => undefined)
        }
        emit({ kind: 'worked', item: candidate, run, ...(gate.seat === undefined ? {} : { seat: gate.seat }) })
        if (abandon(run)) break
      }

      for (const { candidate } of report.toClaim) {
        // The outage the catch-up loop met answers every claim here the same way, and claiming
        // is the louder of the two — a claim comment and a handoff on each.
        if (abandoned) break
        // Checked between items rather than once per cycle: an item can take minutes, and a
        // shutdown or an exhausted budget should stop the next one rather than the next cycle.
        if (winding) {
          emit({ kind: 'stopping', reason: 'asked to stop between items' })
          break
        }
        const gate = await options.gate()
        if (gate.exhausted()) {
          emit({ kind: 'stopping', reason: gate.reason })
          break
        }
        emit({ kind: 'working', item: candidate, ...(gate.seat === undefined ? {} : { seat: gate.seat }) })
        const lore = await options.loreFor(candidate)
        const run = await runItem(deps, candidate, role, identity, { ...options, budget: gate, lore })
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
      // A cycle is allowed to fail, and the next one simply retries.
      //
      // **This catch cannot tell a cycle that failed holding nothing from one that failed
      // holding an item.** It reports the cycle, so an operator sees a cycle-level error string
      // and never the item-level silence underneath it. Nothing holding a claim should arrive
      // here at all: `takeClaim` guards the assignment call through the verdict, and `runItem`
      // guards everything after, both releasing and refusing rather than propagating. What
      // reaches this catch is the cycle's own work — planning, triage, discovery. Any new path
      // that can throw while holding a claim owes its own release; nothing here will do it.
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
  // The worker is detached, so nothing else signals it. Saying so here keeps it running while
  // the loop winds down, rather than being killed the moment the signal lands.
  windsDownOnSignal()
  return new Promise((resolve) => {
    for (const signal of ['SIGINT', 'SIGTERM']) on(signal, () => resolve())
  })
}
