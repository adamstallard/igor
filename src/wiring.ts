import type { Candidate } from './adapter.js'
import type { Config } from './config.js'
import type { Role } from './role.js'
import type { Gate } from './budget.js'
import type { Entry } from './entry.js'
import type { ExecutionResult, TranscriptStore } from './execute.js'
import { budgetGate, EXECUTIONS_PATH, fingerprintToken, loadLog, readAllSeats, runsOf } from './budget.js'
import {
  appCredentialKey, conditionOf, conditionsFrom, describeCondition, roleConditions, scopeOf, stops,
  type Condition,
} from './conditions.js'
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
  /**
   * The seat this role spends next, or why none. Where a condition stops the role, `exhausted()`
   * is true and `condition` names it; where the item it admits is a condition's probe, `probes`
   * says which.
   */
  gate: () => Promise<Gate>
  /**
   * The condition that stops this role from taking any item, read from the execution log alone.
   * Asked once per cycle before triage, so a stopped role spends no model call.
   */
  stopped: () => Promise<Condition | undefined>
  /**
   * Appends the row saying `item` is being taken as the probe for these keys, or, with `void`,
   * that the probe ended with no run so the next item may probe. The run row of `item` ends the
   * probe, whatever it observed.
   */
  probe: (keys: readonly string[], outcome: 'taken' | 'void', item: string) => Promise<void>
  /**
   * `serve`'s check of the App credential. The answer of the mint attempt decides the stop; the
   * check also records it in the execution log as the Igor-scoped condition
   * `app:<identity>:credential`, when the state branch can be written. `key` is the App's private
   * key, which is hashed here and goes no further.
   */
  appCredential: (key: string, check: () => Promise<true | string>) => () => Promise<true | string>
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

  const settings = config.conditions
  /**
   * Run rows not yet written. `serve` records a run without waiting for it, and a gate that read
   * the log before the row landed would take the next item on a condition the last one opened.
   */
  const pending = new Set<Promise<void>>()
  const settled = async (): Promise<void> => {
    await Promise.allSettled([...pending])
  }
  const read = (path: string) => readLog(destination, path)
  const append = (row: Record<string, unknown>, message: string) =>
    appendRecord(destination, EXECUTIONS_PATH, row, message)
  /** A hash of the App's private key, once `appCredential` has been given it. */
  let appKey: string | undefined
  const appKeyFor = (key: string): string | undefined =>
    scopeOf(key)?.kind === 'igor' && key === appCredentialKey(role.name) ? appKey : undefined
  /** The first condition on the role that keeps it from taking an item, and every one now due. */
  const ownStop = (conditions: readonly Condition[]) => {
    const own = roleConditions(conditions, role.name)
    return { stop: own.find(stops), due: own.filter((c) => c.state === 'due').map((c) => c.key) }
  }

  return {
    // Named in a pull request only where the store is public. Unknown visibility discloses
    // nothing, which is the side to be wrong on.
    store: { destination, isPublic: config.publicStore === true },

    gate: async () => {
      await settled()
      // Seats are read, and their credentials resolved and hashed, before any condition is
      // judged: a seat stopped on one credential and given another clears at once, and only a
      // resolution taken first can see that.
      const [readings, rows, observations] = await Promise.all([
        readAllSeats(config.budget.seats),
        loadLog(read),
        loadObservations(read),
      ])
      // An unreadable seat is bounded by observation and record rather than skipped, so
      // nothing further in the cycle mentions the credential. Still worth one line: a seat
      // read live is judged on the owner's consumption too, and a derived one is not.
      for (const r of readings) {
        if (r.error !== undefined) out.warn(`seat "${r.seat.id}": ${r.error}`)
      }
      const now = Date.now()
      const conditions = conditionsFrom(rows, settings, now, (key) => {
        const scope = scopeOf(key)
        if (scope?.kind === 'seat') return readings.find((r) => r.seat.id === scope.name)?.fingerprint
        return appKeyFor(key)
      })
      const { stop, due } = ownStop(conditions)
      if (stop !== undefined) {
        return { exhausted: () => true, condition: stop, reason: `role "${role.name}" is stopped: ${describeCondition(stop)}` }
      }
      const spend = runsOf(rows)
      const gate = budgetGate(
        config.budget,
        role,
        readings,
        spend,
        boundsForSeats(observations, spend, config.budget.seats),
        new Date(now).toISOString(),
        conditions,
      )
      const probes = [...due, ...(gate.probes ?? [])]
      return probes.length === 0 ? gate : { ...gate, probes }
    },

    stopped: async () => {
      await settled()
      const rows = await loadLog(read)
      return ownStop(conditionsFrom(rows, settings, Date.now(), appKeyFor)).stop
    },

    probe: async (keys, outcome, item) => {
      for (const key of keys) {
        const scope = scopeOf(key)
        await append(
          {
            kind: 'probe',
            key,
            item,
            role: role.name,
            ...(scope?.kind === 'seat' ? { seat: scope.name } : {}),
            ...(outcome === 'void' ? { void: true } : {}),
          },
          outcome === 'void' ? `Probe for ${key} ended with no outcome` : `Probe for ${key}`,
        ).catch(warnOnly(`could not record the probe for ${key}`))
      }
    },

    appCredential: (key, check) => {
      const discriminator = fingerprintToken(key)
      appKey = discriminator
      const name = appCredentialKey(role.name)
      return async () => {
        const answer = await check()
        await settled()
        // The stop holds whether or not the row lands. A refused App frequently cannot write to
        // the state branch at all, since that write goes through the App's own token.
        try {
          const open = conditionOf(await loadLog(read), name, settings, Date.now(), discriminator)
          const met = answer !== true
          if (met === (open !== undefined && open.state !== 'counting')) return answer
          await append(
            { kind: 'check', key: name, role: role.name, met, ...(met ? { discriminator } : {}) },
            met ? `GitHub refused the App ${role.name}` : `GitHub accepts the App ${role.name} again`,
          )
        } catch (error) {
          warnOnly(`could not record the App credential check for ${role.name}`)(error)
        }
        return answer
      }
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
      const written = recordExecution(
        destination,
        item,
        role,
        execution,
        seat,
        warnOnly(`could not capture the refusal envelope from ${item.id}`),
      ).catch(warnOnly(`could not record the run of ${item.id}`))
      pending.add(written)
      await written
      pending.delete(written)
    },
  }
}
