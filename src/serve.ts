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
      }

      for (const { candidate } of report.toClaim) {
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
      }
    } catch (error) {
      // A cycle is allowed to fail. Nothing here is holding a claim — `runItem` owns that, and
      // it hands off from inside its own error handling — so the next cycle simply retries.
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
