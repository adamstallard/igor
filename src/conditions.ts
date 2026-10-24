import type { SpendRecord } from './budget.js'
import { SWEEP_AFTER_MS } from './sweep.js'

/**
 * Conditions: an Igor stuck on its own configuration, recorded against the key that would cure
 * it, and stopping exactly what that cure governs once it recurs.
 *
 * **Nothing here is stored.** Every condition is rebuilt from `executions.ndjson` each time it
 * is asked about: from the run rows that carry its cure key, and from the condition rows the
 * loop appends for what no run shows. A summary kept beside the log could disagree with it, and
 * appends from several Igors cannot overwrite each other the way writes to one record can.
 *
 * **Counted, never graded.** A condition stops its scope on recurrence alone. No configuration
 * may call one fatal or degraded, because how bad a condition's consequence is cannot be known in
 * advance: a refused test command yields pull requests nobody verified, and whether that is worse
 * than yielding nothing depends on the repository, the reviewer and the week. A wrong grade either
 * stops a working fleet or lets the repetition this exists to end go on.
 */

/** How many occurrences stop a scope, and how long it then waits before one item may probe. */
export interface ConditionSettings {
  threshold: number
  cooldownMs: number
  maxCooldownMs: number
}

/**
 * Provisional, all three: no run history has been fitted to them. They start from the reasoning
 * of the credential stop #65 built, which this mechanism absorbed:
 *
 * - **A threshold of 3.** The unit of cost is a burned item, so the threshold is the price of
 *   being sure: one occurrence trips on a blip, two can be coincidence, and three items is a
 *   tolerable cost against holding a working scope out.
 * - **A cooldown of 15 minutes, doubling to a ceiling of 6 hours.** A revoked credential can stay
 *   revoked for days: a fixed hour spends twenty-four items a day for as long as it lasts, where
 *   doubling spends about six in total, and a transient outage still clears in fifteen minutes.
 *   The ceiling means a condition fixed overnight is retested within 6 hours, not after a wait
 *   that has kept doubling all night.
 *
 * What a wasted repetition costs is not known to within an order of magnitude: the two items
 * whose cost is recorded are $1.19 and $11.18.
 */
export const CONDITION_DEFAULTS: ConditionSettings = {
  threshold: 3,
  cooldownMs: 15 * 60_000,
  maxCooldownMs: 6 * 60 * 60_000,
}

/**
 * Why no configuration may grade a condition, said wherever one tries. The refusal gives the
 * reason rather than naming an unknown key, because the reader is about to argue with the rule,
 * not to fix a spelling.
 */
export const COUNTED_NOT_GRADED =
  'conditions are counted, not graded: each one stops its scope on recurrence alone, and none may ' +
  'be declared fatal, degraded or otherwise ranked, because whether one outcome is worse than ' +
  'another depends on the repository, the reviewer and the week. Only threshold, cooldown_minutes ' +
  'and max_cooldown_minutes may be set, in igor.config.yaml under conditions, for every condition at once'

/** What a condition stops. Derived from the key, never declared beside it. */
export interface Scope {
  kind: 'role' | 'seat' | 'igor'
  /** The role, the seat, or the Igor's App identity, which is its role's name. */
  name: string
}

/**
 * The scope a cure key names: `role:<name>:<setting>` a role, `seat:<id>:<setting>` every role
 * drawing on that seat, and `app:<identity>:credential` the Igor acting as that App. A key of any
 * other shape names no scope, and nothing stops on it.
 */
export function scopeOf(key: string): Scope | undefined {
  const match = /^(role|seat|app):(.+):([^:]+)$/.exec(key)
  if (match === null) return undefined
  const kind = match[1] === 'app' ? 'igor' : (match[1] as 'role' | 'seat')
  return { kind, name: match[2]! }
}

/**
 * Whether the key leaves out what is stuck. `seat:<id>:credential` names the seat and not the
 * credential, so one seat's two tokens produce the same key, and each occurrence carries a full
 * hash of the credential it was observed against. Every other key already says what is stuck.
 */
export function carriesDiscriminator(key: string): boolean {
  return key.endsWith(':credential')
}

/** The key a refused GitHub App credential opens. */
export function appCredentialKey(identity: string): string {
  return `app:${identity}:credential`
}

/**
 * Occurrences that stop the scope. A refused App credential stops at its first: `app-identity`
 * requires an Igor whose App is refused to take no new item, and a refused App can do nothing on
 * GitHub, so no item it took could find the cure.
 */
function thresholdFor(key: string, settings: ConditionSettings): number {
  return scopeOf(key)?.kind === 'igor' ? 1 : settings.threshold
}

export interface Condition {
  key: string
  scope: Scope
  /** What the open occurrence was observed against, where the key does not say. */
  discriminator?: string
  /** How many consecutive rows, counted back from the newest, met the key. */
  count: number
  first: string
  last: string
  /**
   * - `counting`: met, and short of the threshold, so work continues.
   * - `open`: the scope takes no new item until `probeAt`.
   * - `due`: the cooldown has passed and no probe is running, so one item may be taken.
   * - `probing`: an Igor has appended a row saying it took the probe, and its outcome is not in.
   */
  state: 'counting' | 'open' | 'due' | 'probing'
  /** When one item may be taken to find out. Absent for a condition a check clears instead. */
  probeAt?: string
}

/** Whether the condition keeps its scope from taking a new item. */
export const stops = (c: Condition): boolean => c.state === 'open' || c.state === 'probing'

/** A run row carries no `kind`. Every other row says what it is. */
const isRun = (row: SpendRecord): boolean => row.kind === undefined

/**
 * Whether a row is an outcome this condition can read. A check speaks only to its own key. A run
 * speaks to every condition on its role and its seat, because a run that did not meet a condition
 * is the observation that clears it. A probe row is a marker, never an outcome.
 *
 * A run that exercised nothing speaks only to a condition it meets: see `exercisedNothing`.
 */
function observes(row: SpendRecord, key: string, scope: Scope): boolean {
  if (row.kind === 'check') return row.key === key
  if (!isRun(row)) return false
  if (exercisedNothing(row) && !meets(row, key)) return false
  if (scope.kind === 'role') return row.role === scope.name
  if (scope.kind === 'seat') return row.seat === scope.name
  return false
}

/**
 * Whether a run ended before it could exercise anything a condition is about. A run that started
 * no worker presented no credential and ran no command, and one whose credential the provider
 * refused ran no command either. Each is an occurrence of a condition it meets, such as
 * `seat:<id>:token` or `seat:<id>:credential`, and no evidence about any other: read as an
 * outcome of every condition on its role and seat, it would clear one it never tested.
 */
const exercisedNothing = (row: SpendRecord): boolean =>
  row.workerless === true || keysOf(row).some(carriesDiscriminator)

/**
 * Every key a run met: those in its `cures` and those its worker's denials name. Read from both,
 * because a run whose publish threw records its denials but no `cures` (a handoff carrying a cure
 * key is never deferred, and that item should be), and it met the key all the same.
 */
const keysOf = (row: SpendRecord): string[] => [
  ...(row.cures ?? []),
  ...(row.denials ?? []).flatMap((d) => (d.cure === undefined ? [] : [d.cure])),
]

const meets = (row: SpendRecord, key: string): boolean =>
  row.kind === 'check' ? row.met === true : keysOf(row).includes(key)

const discriminatorOf = (row: SpendRecord): string | undefined =>
  row.kind === 'check' ? row.discriminator : row.tokenFingerprint

/**
 * The condition one key names, as the log stands, or nothing where it is not met.
 *
 * Walks back from the newest row: consecutive outcomes meeting the key, observed against one
 * discriminator, are the open occurrence. An outcome of the scope that does not meet it ends the
 * occurrence, which is how a probe that ran clean closes it, and so does one observed against a
 * different discriminator, which starts a new count rather than adding to the old one.
 *
 * `current` is the discriminator resolving now. A condition observed against another one is
 * closed by that alone, with no cooldown and no item. For a key that carries a discriminator, no
 * condition is returned where nothing resolves: a credential that cannot be named cannot be the
 * one refused.
 */
export function conditionOf(
  rows: readonly SpendRecord[],
  key: string,
  settings: ConditionSettings,
  now: number,
  current?: string,
): Condition | undefined {
  const scope = scopeOf(key)
  if (scope === undefined) return undefined
  const named = carriesDiscriminator(key)

  let count = 0
  let newest = -1
  let first = ''
  let last = ''
  let discriminator: string | undefined
  for (let i = rows.length - 1; i >= 0; i--) {
    const row = rows[i]!
    if (!observes(row, key, scope)) continue
    if (!meets(row, key)) break
    const seen = named ? discriminatorOf(row) : undefined
    // A refusal nothing can attribute to a credential neither counts nor clears: a seat whose
    // login lives in a `~/.claude` the environment does not carry has no hash to hold against.
    if (named && seen === undefined) continue
    // A cooldown measured from a moment nothing can place never ends, so such a row ends the
    // occurrence rather than extending it.
    if (!Number.isFinite(Date.parse(row.at))) break
    if (count === 0) {
      discriminator = seen
      last = row.at
      newest = i
    } else if (seen !== discriminator) {
      break
    }
    count++
    first = row.at
  }
  if (count === 0) return undefined
  if (named && current !== discriminator) return undefined

  const base = { key, scope, ...(discriminator === undefined ? {} : { discriminator }), count, first, last }
  const threshold = thresholdFor(key, settings)
  if (count < threshold) return { ...base, state: 'counting' }
  // An Igor's own credential is checked by `serve`'s mint attempt, which spends no item, so it
  // has no cooldown to wait out and no probe item to take.
  if (scope.kind === 'igor') return { ...base, state: 'open' }

  const cooldown = Math.min(settings.cooldownMs * 2 ** (count - threshold), settings.maxCooldownMs)
  const probeAt = Date.parse(last) + cooldown
  const timed = { ...base, probeAt: new Date(probeAt).toISOString() }
  if (now < probeAt) return { ...timed, state: 'open' }
  return { ...timed, state: probeRunning(rows, key, newest, now) ? 'probing' : 'due' }
}

/**
 * Whether an Igor has taken the probe and its outcome is not yet in. Only a probe row newer than
 * the last occurrence counts.
 *
 * A probe ends with the run row of the item it named. Where that row met the condition it is the
 * last occurrence, and where it cleared it there is no condition, so a probe still found here
 * ended on a run that observed nothing, and the next item may probe. A row for any other item ends
 * nothing: it was written after the probe row, but its run began earlier. A probe that ended with no run
 * at all says so with a `void` row. A probe row older than the longest a run can hold a tree
 * belongs to a process that died, and holding the scope for it would hold it for good.
 */
function probeRunning(rows: readonly SpendRecord[], key: string, after: number, now: number): boolean {
  const ran = new Set<string>()
  for (let i = rows.length - 1; i > after; i--) {
    const row = rows[i]!
    if (isRun(row) && row.item !== undefined) ran.add(row.item)
    if (row.kind !== 'probe' || row.key !== key) continue
    if (row.void === true) return false
    if (row.item !== undefined && ran.has(row.item)) return false
    const at = Date.parse(row.at)
    return Number.isFinite(at) && now - at < SWEEP_AFTER_MS
  }
  return false
}

/**
 * Every condition the log holds, open or counting.
 *
 * `current` answers, for a key that carries a discriminator, what resolves for its scope now.
 */
export function conditionsFrom(
  rows: readonly SpendRecord[],
  settings: ConditionSettings,
  now: number,
  current: (key: string) => string | undefined = () => undefined,
): Condition[] {
  const keys = new Set<string>()
  for (const row of rows) {
    if (row.kind === 'check' && row.key !== undefined) keys.add(row.key)
    if (isRun(row)) for (const key of keysOf(row)) keys.add(key)
  }
  const out: Condition[] = []
  for (const key of keys) {
    const condition = conditionOf(rows, key, settings, now, current(key))
    if (condition !== undefined) out.push(condition)
  }
  return out
}

/** The conditions that stop a role on its own: those on the role and on the Igor acting as it. */
export function roleConditions(conditions: readonly Condition[], role: string): Condition[] {
  return conditions.filter((c) => c.scope.name === role && (c.scope.kind === 'role' || c.scope.kind === 'igor'))
}

/** What a person would change to cure the key, in words that name where. */
export function cureFor(key: string): string {
  const scope = scopeOf(key)
  const setting = key.slice(key.lastIndexOf(':') + 1)
  if (scope?.kind === 'role' && setting === 'commands') {
    return `role "${scope.name}"'s \`commands\` allowing the command the sandbox refused`
  }
  if (scope?.kind === 'role' && setting === 'allow') {
    return `role "${scope.name}"'s \`allow\` granting the action it was refused`
  }
  if (scope?.kind === 'seat' && setting === 'token') {
    return `seat "${scope.name}"'s token source becoming readable`
  }
  if (scope?.kind === 'seat' && setting === 'credential') {
    return (
      `a different credential resolving for seat "${scope.name}", which clears it at once, or a ` +
      `probe on this one that the provider does not refuse`
    )
  }
  if (scope?.kind === 'igor') return `GitHub minting a token for the App "${scope.name}" again`
  return `a change to \`${key}\``
}

/** The condition in one sentence: what stopped, since when, and what happens next. */
export function describeCondition(c: Condition): string {
  const met = `\`${c.key}\` met ${c.count} time${c.count === 1 ? '' : 's'} in a row, the most recent at ${c.last}`
  const next =
    c.state === 'probing'
      ? 'a probe item is running to find out whether it still holds'
      : c.state === 'due'
        ? 'the next item it takes is the probe'
        : c.probeAt === undefined
          ? 'it is checked again each cycle without spending an item'
          : `one item is let through at ${c.probeAt} to find out whether it still holds`
  return `${met}; ${next}. Cured by ${cureFor(c.key)}`
}
