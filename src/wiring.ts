import type { Candidate } from './adapter.js'
import type { Config } from './config.js'
import type { Role } from './role.js'
import type { Gate } from './budget.js'
import type { Entry } from './entry.js'
import type { ExecutionResult, TranscriptStore } from './execute.js'
import { budgetGate, loadSpend, readAllSeats } from './budget.js'
import { boundsForSeats, loadObservations } from './capacity.js'
import { overBudgetMessage, recordFiring, renderLore, selectEntries } from './firing.js'
import { recordExecution } from './execute.js'
import { appendRecord, readLog } from './state.js'
import { loadAll } from './store.js'
import { sweepAbandonedTrees, type SweepOptions } from './sweep.js'

/**
 * What `run` and `serve` both need, built once.
 *
 * They used to build it separately, and drifted: `serve` fired no lore, reported no unreadable
 * seat, and recorded spend without the seat it came from — which silently disabled every
 * `budget_share` ceiling, since the seat is the join key the share is computed over. Each gap
 * was a key missing from an options object, invisible to a suite that tests the seam and not
 * the caller.
 *
 * Startup housekeeping belongs here for the same reason: a step each command has to remember
 * is a step one of them will forget.
 */

export interface Wiring {
  gate: () => Promise<Gate>
  /** Passed to every run, so a pull request can point at the transcript it will write. */
  store: TranscriptStore
  loreFor: (item: Candidate) => string
  record: (item: Candidate, execution: ExecutionResult, seat?: string) => Promise<void>
}

export interface Reporter {
  /** Progress a person watching wants to see. */
  say: (line: string) => void
  /** Something that went wrong but did not stop the cycle. */
  warn: (line: string) => void
}

export const QUIET: Reporter = { say: () => {}, warn: () => {} }

export async function wire(
  config: Config,
  role: Role,
  destination: string,
  out: Reporter = QUIET,
  sweep: SweepOptions = {},
): Promise<Wiring> {
  /**
   * Housekeeping never stops a cycle, so each of these is caught. Not stopping and saying
   * nothing are separate choices, though: an unwritable state branch is indistinguishable from
   * an Igor with nothing to do, and the spend on the records it drops is never counted again.
   */
  const warnOnly = (what: string) => (error: unknown) => {
    try {
      out.warn(`${what}: ${error instanceof Error ? error.message : String(error)}`)
    } catch {
      // A reporter that cannot write is not a reason to stop, and there is nowhere to say so.
    }
  }

  // Before the first cycle, because exit is the path that does not run.
  await sweepAbandonedTrees(out, sweep).catch(warnOnly('could not sweep abandoned trees'))

  return {
    // Named in a pull request only where the store is public. Unknown visibility discloses
    // nothing, which is the side to be wrong on.
    store: { destination, isPublic: config.publicStore === true },

    gate: async () => {
      const [readings, spend, observations] = await Promise.all([
        readAllSeats(config.budget.seats),
        loadSpend((path) => readLog(destination, path)),
        loadObservations((path) => readLog(destination, path)),
      ])
      // An unreadable seat is bounded by observation and record rather than skipped, so
      // nothing further in the cycle mentions the credential. Still worth one line: a seat
      // read live is judged on the owner's consumption too, and a derived one is not.
      for (const r of readings) {
        if (r.error !== undefined) out.warn(`seat "${r.seat.id}": ${r.error}`)
      }
      return budgetGate(config.budget, role, readings, spend, boundsForSeats(observations, spend, config.budget.seats))
    },

    // Read per item rather than per cycle: the store is a repository someone may have merged
    // to while the loop was sleeping.
    loreFor: (item: Candidate) => {
      const entries = loadAll(config.destination)
        .map((l) => l.entry)
        .filter((e): e is Entry => e !== undefined)
      const result = selectEntries(entries, role, { experts: config.experts })
      const over = overBudgetMessage(result)
      if (over) out.warn(over)
      else if (result.fired.length > 0) {
        out.say(`lore: ${result.fired.length} entries, ~${result.estimatedTokens} tokens`)
      }
      void recordFiring(destination, item.id, role, result, appendRecord).catch(
        warnOnly(`could not record the lore fired on ${item.id}`),
      )
      return renderLore(result.fired)
    },

    record: async (item, execution, seat) => {
      // Ahead of the record and outside its catch: a denial is why a run reports success and
      // the pull request it opened cannot be trusted, and a state branch nobody can write to
      // must not be what swallows it. Once per command — six refusals are one thing to fix.
      const said = new Set<string>()
      for (const d of execution.denials ?? []) {
        const line = `sandbox denied ${d.command ?? d.tool}${d.cure === undefined ? '' : ` — cure key ${d.cure}`}`
        if (said.has(line)) continue
        said.add(line)
        out.warn(line)
      }
      // Said out loud rather than swallowed: the refusal envelope is what three deferred
      // decisions are waiting on, and a capture that failed in silence leaves someone waiting
      // on evidence that is not coming until the next exhausted window.
      await recordExecution(
        destination,
        item,
        role,
        execution,
        seat,
        warnOnly(`could not capture the refusal envelope from ${item.id}`),
      ).catch(warnOnly(`could not record the run of ${item.id}`))
    },
  }
}
