import type { Candidate } from './adapter.js'
import type { Config } from './config.js'
import type { Role } from './role.js'
import type { Gate } from './budget.js'
import type { Entry } from './entry.js'
import type { ExecutionResult } from './execute.js'
import { budgetGate, loadSpend, readAllSeats } from './budget.js'
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
  // Before the first cycle, because exit is the path that does not run. Housekeeping never
  // stops a cycle, so nothing here is allowed to throw.
  await sweepAbandonedTrees(out, sweep).catch(() => undefined)

  return {
    gate: async () => {
      const [readings, spend] = await Promise.all([
        readAllSeats(config.budget.seats),
        loadSpend((path) => readLog(destination, path)),
      ])
      // An unreadable seat is passed over rather than treated as free, so saying why is the
      // only way anyone learns the fleet slowed down because of a bad token.
      for (const r of readings) {
        if (r.error !== undefined) out.warn(`seat "${r.seat.id}": ${r.error}`)
      }
      return budgetGate(config.budget, role, readings, spend)
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
      void recordFiring(destination, item.id, role, result, appendRecord).catch(() => undefined)
      return renderLore(result.fired)
    },

    record: async (item, execution, seat) => {
      await recordExecution(destination, item, role, execution, seat).catch(() => undefined)
    },
  }
}
