import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import type { SeatBound, SeatBounds } from './capacity.js'

/**
 * Seats, pools, and what an Igor is allowed to spend.
 *
 * Two answers to one question, and which one a seat gets depends on its credential.
 *
 * Where `claude -p '/usage'` answers "how much of this seat is gone", it is asked whenever it
 * matters and the answer is never stored: it costs nothing, it comes from that seat's own
 * token, and it counts the owner's consumption as well as Igor's. That path works in **percent
 * of the limit**, the unit the provider exposes.
 *
 * A `setup-token` credential resolves no subscription, so the provider reports no percentages
 * to it at all. Such a seat is bounded in **dollars** instead: Igor spend recorded inside the
 * current window instance, against a capacity `capacity.ts` derives from an observation taken
 * elsewhere. That figure is stored, it does age, and the gate takes it as data — see
 * `SeatBounds`. Dollars still apportion a shared seat between roles, as they always did; they
 * now also decide when to stop on a seat nothing can read.
 */

export class BudgetError extends Error {}

/**
 * A seat whose credential authenticates locally and carries no subscription, so no window will
 * ever be reported against it however often it is asked.
 *
 * The one unreadable seat a derived bound applies to. Every other way a reading fails means the
 * seat could not be asked at all — an unset token, a `claude` that is not on the path — and
 * bounding one of those puts a seat at the head of a pool that claims an item every cycle and
 * fails it. Those stay passed over.
 *
 * What this does **not** separate is a valid `setup-token` from a revoked one. Neither `/usage`
 * nor `claude auth status` leaves the machine, so both answer identically for either, and a
 * rejected token lands here and is spent from until somebody notices. Telling them apart needs
 * a round trip nothing here makes, or a record of runs that failed on the seat.
 */
export class SeatUnmeasurableError extends BudgetError {}

export const EXECUTIONS_PATH = 'executions.ndjson'

/**
 * Where a seat's token comes from — a name, a path, or a command, never the value, so nothing
 * carrying this ever holds the credential itself. At most one is ever set: `parseOrgBudget`
 * rejects a seat naming more than one, and none named means "read through whatever login is
 * ambient," unchanged from before these existed.
 */
export interface TokenSource {
  /** Environment variable holding the token, from `claude setup-token`. */
  tokenEnv?: string
  /** Path to a file holding the token — a decrypted `LoadCredential=`, for instance. */
  tokenFile?: string
  /** Command whose stdout is the token — `pass show ...`, `op read ...`, and the like. */
  tokenCommand?: string
}

export interface Seat extends TokenSource {
  id: string
  /** Who can read this seat's usage, and whose capacity the reserve protects. */
  owner?: string
  /** Nobody works on a dedicated seat, so its reserve is zero. */
  dedicated?: boolean
  /** Fraction of the limit Igors must not consume. */
  reserve: number
  /** Starting capacity estimate, superseded outright by the first observation of this seat and
   *  window that yields one. It exists so a seat carrying a reserve can be drawn on before it
   *  has ever been observed, which is otherwise impossible: a reserve needs a capacity, a
   *  capacity needs spend inside an observed window, and a reserved seat is not spent from. */
  capacity?: SeatCapacity
}

/**
 * Dollars of list-price spend a window holds, for each window a seat declares one for. An
 * undeclared window is unobserved until it is observed, never the other window's figure scaled
 * by the cadence ratio: two limits exist because they are not proportional, and were a session
 * exactly a 168th of a week the weekly limit would forbid nothing the session limit already
 * forbids.
 */
export type SeatCapacity = { [W in Window]?: number }

/**
 * How long a `token_command` may run before it is treated as failed. Provisional: no real
 * secret-store command has been timed. Long enough for a network round trip to a vault, short
 * enough that a command left waiting on an interactive prompt — `pass`/`gpg` with no TTY under
 * a service, `op read` wanting a fresh sign-in — fails rather than hanging `igor budget` or a
 * worker spawn forever.
 */
export const TOKEN_COMMAND_TIMEOUT_MS = 10_000

/** Runs a `token_command` and takes its trimmed stdout — what `pass`, `op read`, and
 *  `security find-generic-password` need, without a wrapper. */
function runTokenCommand(command: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, stdio: ['ignore', 'pipe', 'pipe'], timeout: timeoutMs })
    // Text, not raw chunks: a multi-byte character the pipe splits in two decodes to replacement
    // characters, and a secret or a failure message comes back wrong without anything failing.
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('error', reject)
    child.on('close', (code, signal) => {
      // A signal here is `timeout` reaching for `killSignal`: nothing else in this function
      // sends the child one.
      if (signal !== null) return reject(new Error(`timed out after ${timeoutMs / 1000}s`))
      if (code !== 0) return reject(new Error(err.trim() || `exited ${code}`))
      resolve(out.trim())
    })
  })
}

/**
 * Reads the token a source names, whichever of the three it is. Undefined when it names none.
 *
 * Throws a message meant to follow a subject a caller supplies — `seat "x"` or `the chosen
 * seat` — so `readUsage` and `workerEnv` keep their own wording around one resolution.
 */
export async function resolveToken(
  source: TokenSource,
  env: NodeJS.ProcessEnv,
  commandTimeoutMs = TOKEN_COMMAND_TIMEOUT_MS,
): Promise<string | undefined> {
  if (source.tokenEnv !== undefined) {
    const token = env[source.tokenEnv]
    if (token === undefined || token === '') {
      throw new Error(
        `reads its token from ${source.tokenEnv}, which is not set. ` +
          `Run \`claude setup-token\` signed in as that seat and export it.`,
      )
    }
    return token
  }
  if (source.tokenFile !== undefined) {
    let text: string
    try {
      text = await readFile(source.tokenFile, 'utf8')
    } catch (e) {
      throw new Error(`reads its token from ${source.tokenFile}, which could not be read: ${(e as Error).message}`)
    }
    const token = text.trim()
    if (token === '') throw new Error(`reads its token from ${source.tokenFile}, which is empty`)
    return token
  }
  if (source.tokenCommand !== undefined) {
    let token: string
    try {
      token = await runTokenCommand(source.tokenCommand, commandTimeoutMs)
    } catch (e) {
      throw new Error(`reads its token by running \`${source.tokenCommand}\`, which failed: ${(e as Error).message}`)
    }
    if (token === '') throw new Error(`reads its token by running \`${source.tokenCommand}\`, which printed nothing`)
    return token
  }
  return undefined
}

/** Ordered. The order is the allocation mechanism: dedicated capacity drains first. */
export interface Pool {
  id: string
  seats: string[]
}

export interface OrgBudget {
  seats: Seat[]
  pools: Pool[]
}

export type Window = 'session' | 'week'

export interface Limit {
  percentUsed: number
  resetsAt?: string
}

export interface Usage {
  session: Limit
  week: Limit
  /**
   * Per-model weekly limits, which exist alongside the all-models one. Recorded rather than
   * enforced: a fleet concentrated on one model can exhaust a limit the other figures do not
   * show, and leaving it out of the report would make that failure unexplainable.
   */
  perModel: { model: string; percentUsed: number; resetsAt?: string }[]
}

export interface SpendRecord {
  at: string
  seat?: string
  role?: string
  costUsd?: number
}

const LINE = /^Current (session|week)(?:\s*\(([^)]+)\))?:\s*(\d+(?:\.\d+)?)%\s*used(?:\s*·\s*resets\s+(.+?))?\s*$/gim

/**
 * Reads the shapes `/usage` prints. Unrecognised lines are ignored rather than fatal: the
 * format is not a contract, and a new line in it should not take the budget report down.
 */
export function parseUsage(text: string): Usage {
  const usage: Usage = { session: { percentUsed: 0 }, week: { percentUsed: 0 }, perModel: [] }
  let recognised = false

  for (const m of text.matchAll(LINE)) {
    const [, kind, qualifier, percent, resets] = m
    const limit: Limit = {
      percentUsed: Number(percent),
      ...(resets === undefined ? {} : { resetsAt: resets.trim() }),
    }
    recognised = true
    if (kind === 'session') {
      usage.session = limit
    } else if (qualifier === undefined || /all models/i.test(qualifier)) {
      usage.week = limit
    } else {
      usage.perModel.push({ model: qualifier, ...limit })
    }
  }

  if (!recognised) throw new BudgetError(`no usage figures in output: ${text.slice(0, 200)}`)
  return usage
}

export function limitFor(usage: Usage, window: Window): Limit {
  return window === 'session' ? usage.session : usage.week
}

function runUsage(env: NodeJS.ProcessEnv): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('claude', ['-p', '/usage', '--output-format', 'json', '--allowed-tools', ''], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) return reject(new BudgetError(err.trim() || `claude exited ${code}`))
      try {
        resolve((JSON.parse(out) as { result?: string }).result ?? '')
      } catch {
        reject(new BudgetError(`unparseable output from claude: ${out.slice(0, 200)}`))
      }
    })
  })
}

/**
 * Asks the seat's own credential.
 *
 * A seat naming a token source it cannot read is an error, never a fall-through to whatever
 * login happens to be ambient. Reading one seat and recording it as another is exactly the
 * mistake asking-per-seat exists to make impossible.
 */
export async function readUsage(
  seat: Seat,
  env: NodeJS.ProcessEnv = process.env,
  run: (env: NodeJS.ProcessEnv) => Promise<string> = runUsage,
  describe: (env: NodeJS.ProcessEnv) => Promise<AuthContext | undefined> = runAuthStatus,
): Promise<Usage> {
  const childEnv = { ...env }
  let token: string | undefined
  try {
    token = await resolveToken(seat, env)
  } catch (e) {
    throw new BudgetError(`seat "${seat.id}" ${(e as Error).message}`)
  }
  if (token !== undefined) childEnv['CLAUDE_CODE_OAUTH_TOKEN'] = token

  // Outside the try: a command that failed to run is already its own message, and running it
  // through the diagnosis below would relabel it as something it is not.
  const text = await run(childEnv)
  try {
    return parseUsage(text)
  } catch (error) {
    if (!(error instanceof BudgetError)) throw error
    const auth = await describe(childEnv)
    if (auth === undefined || hasSubscription(auth)) throw error
    throw new SeatUnmeasurableError(
      `seat "${seat.id}" is authenticated${auth.authMethod === undefined ? '' : ` as ${auth.authMethod}`} ` +
        `but its credential carries no subscription, and a window is only ever reported against ` +
        `one. The seat can still spend; it cannot be measured.`,
    )
  }
}

/** The part of `claude auth status` that decides whether a window can exist. */
export interface AuthContext {
  authMethod?: string
  subscriptionType?: string
}

/**
 * Whether a credential resolves to a subscription at all.
 *
 * Measured: an interactive login reports `authMethod: "claude.ai"` with a `subscriptionType`,
 * while a `claude setup-token` credential reports `authMethod: "oauth_token"` and no identity
 * fields whatever. `/usage` reports windows against a subscription, so the second gets a
 * session cost summary instead and `parseUsage` finds no figures in it.
 *
 * Without this the seat is reported unreadable with the text of the cost summary attached,
 * which reads like a parser that needs fixing rather than a credential that cannot answer.
 */
export function hasSubscription(auth: AuthContext): boolean {
  return typeof auth.subscriptionType === 'string' && auth.subscriptionType !== ''
}

/** Never rejects: a diagnosis that fails leaves the original error standing, never replaces it. */
function runAuthStatus(env: NodeJS.ProcessEnv): Promise<AuthContext | undefined> {
  return new Promise((resolve) => {
    const child = spawn('claude', ['auth', 'status'], { env, stdio: ['ignore', 'pipe', 'ignore'] })
    child.stdout.setEncoding('utf8')
    let out = ''
    child.stdout.on('data', (c) => (out += c))
    child.on('error', () => resolve(undefined))
    child.on('close', () => {
      try {
        resolve(JSON.parse(out) as AuthContext)
      } catch {
        resolve(undefined)
      }
    })
  })
}

export interface SeatUsage {
  seat: Seat
  usage?: Usage
  error?: string
  /** The credential answered and carries no subscription, so only the measurement is missing
   *  and a derived bound applies. Unset for every other failure, where the credential itself is
   *  in doubt and nothing a record says makes the seat safe to spend. */
  unmeasured?: boolean
}

/** Tolerates individual failures, so one bad token does not blind the whole report. */
export async function readAllSeats(
  seats: readonly Seat[],
  env: NodeJS.ProcessEnv = process.env,
  run?: (env: NodeJS.ProcessEnv) => Promise<string>,
  describe?: (env: NodeJS.ProcessEnv) => Promise<AuthContext | undefined>,
): Promise<SeatUsage[]> {
  return Promise.all(
    seats.map(async (seat) => {
      try {
        return { seat, usage: await readUsage(seat, env, run, describe) }
      } catch (e) {
        return {
          seat,
          error: e instanceof Error ? e.message : String(e),
          ...(e instanceof SeatUnmeasurableError ? { unmeasured: true } : {}),
        }
      }
    }),
  )
}

export interface SeatStatus {
  seat: Seat
  window: Window
  percentUsed: number
  reservePercent: number
  headroomPercent: number
  resetsAt?: string
}

export function seatStatus(seat: Seat, usage: Usage, window: Window): SeatStatus {
  const limit = limitFor(usage, window)
  const reservePercent = seat.reserve * 100
  return {
    seat,
    window,
    percentUsed: limit.percentUsed,
    reservePercent,
    // Taken off the top, and independently of any role's ceiling.
    headroomPercent: Math.max(0, 100 - reservePercent - limit.percentUsed),
    ...(limit.resetsAt === undefined ? {} : { resetsAt: limit.resetsAt }),
  }
}

export function spendByRole(
  records: readonly SpendRecord[],
  seat: string,
): { total: number; byRole: Map<string, number> } {
  const byRole = new Map<string, number>()
  let total = 0
  for (const r of records) {
    if (r.seat !== seat) continue
    const cost = r.costUsd ?? 0
    const role = r.role ?? '(unknown)'
    total += cost
    byRole.set(role, (byRole.get(role) ?? 0) + cost)
  }
  return { total, byRole }
}

/**
 * A role's share of the seat, in percentage points of the limit.
 *
 * Igor knows what each role cost in dollars and what fraction of the limit is gone, but not
 * the rate between them. Their ratio suffices: a role responsible for half of Igor's spend
 * accounts for half of Igor's share of the limit. On a seat a person also uses this counts
 * only Igor's consumption, which is the part a ceiling is meant to bound.
 */
export function roleSharePercent(
  records: readonly SpendRecord[],
  seat: string,
  role: string,
  percentUsed: number,
): number {
  const { total, byRole } = spendByRole(records, seat)
  if (total <= 0) return 0
  return ((byRole.get(role) ?? 0) / total) * percentUsed
}

export interface Choice {
  seat?: Seat
  reason: string
  /** Every seat considered, in pool order, with why each was passed over. */
  considered: { seat: string; why: string }[]
}

/**
 * Said of a seat passed over for having no capacity figure, and deliberately not the wording
 * of the credential error an unreadable seat carries. An operator has to be able to tell
 * "never observed" from "bad token": the first is a seat waiting on a reading, the second is a
 * seat waiting on a token, and the two are fixed by different people.
 */
export const NO_CAPACITY_FIGURE = 'no capacity figure exists for it'

/**
 * One window of a seat with no reading, judged against what was derived for it.
 *
 * A reserve is a fraction of capacity, so with no capacity figure it expresses no quantity at
 * all — which is why the same ignorance blocks a reserved seat and permits an unreserved one.
 * Spending somebody's subscription against a denominator nobody supplied is invisible to them
 * until their own work is refused; where nobody's floor is at stake it costs a failed run,
 * which is the calibration the seat was missing.
 */
function derivedWindow(
  seat: Seat,
  window: Window,
  bound: SeatBound | undefined,
): { remainingUsd?: number; blocked?: string; resetAt?: string; estimated?: boolean } {
  // Two independent reasons to stop, per `capacity-from-observation` §2, so the arithmetic is
  // settled before the refusal answers. A refusal is not an estimate to be weighed against a
  // capacity figure: one on the first run of an instance leaves no spend to divide and derives
  // no capacity at all, and a later reading of the window would otherwise supersede it on
  // recency alone. It is also not always the only thing holding the seat, and the hour a
  // handoff states has to outlast everything that is.
  const capacity = bound?.capacity
  const allowance = capacity === undefined ? undefined : (1 - seat.reserve) * capacity.capacityUsd
  const overBound = capacity !== undefined && allowance !== undefined && allowance - capacity.spentUsd <= 0
  const overWhy =
    capacity === undefined || allowance === undefined
      ? ''
      : `Igors have spent $${capacity.spentUsd.toFixed(2)} of the ${window}'s $${allowance.toFixed(2)} bound ` +
        `(${capacity.basis} capacity $${capacity.capacityUsd.toFixed(2)}, ${seat.reserve * 100}% reserved)`

  const spent = bound?.spent
  if (spent !== undefined) {
    const { from, resetsAt, estimated } = spent
    const spentWhy =
      `its ${window} was ${from.percentUsed}% used when observed at ${from.at}, and ` +
      (estimated
        ? `the provider named no reset, so it stands until ${resetsAt} at the latest`
        : `does not reset until ${resetsAt}`)
    if (!overBound) return { blocked: spentWhy, resetAt: resetsAt, estimated }

    // Both hold, so the seat is back only once the later clears, and the sentence names both
    // rather than leave a reason the stated hour does not account for. A rolling window has no
    // boundary at all, which makes when its sum clears unknown rather than merely later — and
    // the refusal's hour is a confident answer to a question nothing here can settle.
    const both = `${spentWhy}; ${overWhy}`
    if (bound?.resetsAt === undefined) return { blocked: both }
    return Date.parse(bound.resetsAt) > Date.parse(resetsAt)
      ? { blocked: both, resetAt: bound.resetsAt, estimated: false }
      : { blocked: both, resetAt: resetsAt, estimated }
  }

  if (capacity === undefined || allowance === undefined) {
    // A third state rather than an arithmetic verdict, and subordinate to a refusal: the
    // division is undefined without a figure, so this seat waits on a reading, not on a clock.
    if (seat.reserve <= 0) return {}
    return { blocked: `${NO_CAPACITY_FIGURE}: its ${window} has never been observed and none is declared` }
  }
  if (overBound) {
    return {
      blocked: overWhy,
      // The sum clears when its instance does, and a tiled boundary is an observed figure
      // rather than an estimate. A rolling window names none.
      ...(bound?.resetsAt === undefined ? {} : { resetAt: bound.resetsAt }),
    }
  }
  return { remainingUsd: allowance - capacity.spentUsd }
}

/**
 * Picks the first seat in the pool with room in **both** windows. The session limit bites
 * first and the weekly one bites longest, so a seat is usable only when neither blocks it.
 * Each window is judged on its own figures, so a seat calibrated for one window and not the
 * other is still blocked by the uncalibrated one where it carries a reserve.
 *
 * A seat whose usage could be read is judged on that reading, in percent. A seat whose usage
 * could not is judged on `bounds` instead, in dollars — passed over for being unreadable only
 * when nothing was derived for it either.
 *
 * `budget_share` is a ceiling on what one role may draw, not capacity set aside for it:
 * several roles may declare the same one, an idle role holds nothing back, and adding an Igor
 * requires editing no other role.
 */
export function chooseSeat(
  pool: Pool,
  readings: readonly SeatUsage[],
  records: readonly SpendRecord[],
  role: { name: string; budgetShare?: number },
  bounds: SeatBounds = new Map(),
): Choice {
  const considered: Choice['considered'] = []

  for (const id of pool.seats) {
    const reading = readings.find((r) => r.seat.id === id)
    if (reading === undefined) {
      considered.push({ seat: id, why: 'declared in the pool but not among the seats' })
      continue
    }
    if (reading.usage === undefined) {
      // Only a credential that answered and reported no window is bounded here. Anything else
      // that stopped the reading leaves the credential in doubt, and a bound says what a seat
      // may spend without giving it anything to spend with: chosen, it claims an item, fails on
      // the worker's spawn, and does it again next cycle.
      if (reading.unmeasured !== true) {
        considered.push({ seat: id, why: reading.error ?? 'its usage could not be read' })
        continue
      }

      const derived = (['session', 'week'] as Window[]).map((window) => ({
        window,
        bound: bounds.get(id)?.[window],
        ...derivedWindow(reading.seat, window, bounds.get(id)?.[window]),
      }))

      const stopped = derived.find((d) => d.blocked !== undefined)
      if (stopped) {
        considered.push({ seat: id, why: stopped.blocked! })
        continue
      }

      if (role.budgetShare !== undefined) {
        const ceiling = role.budgetShare * 100
        // The share is of Igor's own consumption here, where the live path's percentage
        // includes the owner's. A window with no capacity figure has no denominator, so the
        // ceiling is not checkable against it at all.
        const over = derived.find((d) => {
          const capacity = d.bound?.capacity
          return (
            capacity !== undefined &&
            roleSharePercent(records, id, role.name, (capacity.spentUsd / capacity.capacityUsd) * 100) >= ceiling
          )
        })
        if (over) {
          considered.push({ seat: id, why: `role "${role.name}" is at its ${role.budgetShare} ceiling for the ${over.window}` })
          continue
        }
      }

      considered.push({ seat: id, why: 'chosen' })
      const left = derived.find((d) => d.window === 'session')?.remainingUsd
      return {
        seat: reading.seat,
        reason:
          left === undefined
            ? `${id} has no capacity figure and no reserve, so it runs uncalibrated`
            : `${id} has $${left.toFixed(2)} of its session bound left`,
        considered,
      }
    }
    const usage = reading.usage

    const blocked = (['session', 'week'] as Window[])
      .map((w) => seatStatus(reading.seat, usage, w))
      .find((s) => s.headroomPercent <= 0)
    if (blocked) {
      considered.push({
        seat: id,
        why: `${blocked.window} is ${blocked.percentUsed}% used, past its ${blocked.reservePercent}% reserve`,
      })
      continue
    }

    if (role.budgetShare !== undefined) {
      const ceiling = role.budgetShare * 100
      const over = (['session', 'week'] as Window[]).find(
        (w) => roleSharePercent(records, id, role.name, limitFor(usage, w).percentUsed) >= ceiling,
      )
      if (over) {
        considered.push({ seat: id, why: `role "${role.name}" is at its ${role.budgetShare} ceiling for the ${over}` })
        continue
      }
    }

    considered.push({ seat: id, why: 'chosen' })
    const session = seatStatus(reading.seat, usage, 'session')
    return { seat: reading.seat, reason: `${id} has ${session.headroomPercent}% of the session left`, considered }
  }

  return {
    reason: considered.length === 0 ? `pool "${pool.id}" declares no seats` : `no seat in "${pool.id}" has headroom`,
    considered,
  }
}

/**
 * What a role's `seat` names: a declared pool, or a declared seat as a pool of one, for an Igor
 * that must never borrow. Undefined when nothing declares it — the answer that must never be
 * substituted, since a name resolved to a default spends whatever seat happens to be first.
 */
export function poolFor(org: OrgBudget, seat: string): Pool | undefined {
  const target = seat.replace(/^pool:/, '')
  return (
    org.pools.find((p) => p.id === target) ??
    (org.seats.some((s) => s.id === target) ? { id: target, seats: [target] } : undefined)
  )
}

/**
 * When the pool's unreadable seats next have room, as an instant a handoff can state.
 *
 * Per seat, the **latest** of its blocked windows: a seat shut out of the session until 15:00
 * and out of the week until Friday is back on Friday, and stating 15:00 would be a return
 * nobody keeps. Across the pool, the **earliest** of those, because the first seat back is the
 * first Igor back.
 *
 * A seat whose return is not on a clock contributes nothing rather than a guess — one passed
 * over for an unreadable credential, for having no capacity figure at all, or for a role's own
 * ceiling. Where no seat contributes, the handoff says when capacity returns is not known,
 * which is the truth.
 */
function derivedReset(
  pool: Pool,
  readings: readonly SeatUsage[],
  bounds: SeatBounds,
): { resetAt: string; estimated: boolean } | undefined {
  let soonest: { resetAt: string; estimated: boolean } | undefined
  for (const id of pool.seats) {
    const reading = readings.find((r) => r.seat.id === id)
    if (reading === undefined || reading.usage !== undefined || reading.unmeasured !== true) continue

    let latest: { resetAt: string; estimated: boolean } | undefined
    let onTheClock = true
    for (const window of ['session', 'week'] as Window[]) {
      const outcome = derivedWindow(reading.seat, window, bounds.get(id)?.[window])
      if (outcome.blocked === undefined) continue
      if (outcome.resetAt === undefined) {
        onTheClock = false
        break
      }
      if (latest === undefined || Date.parse(outcome.resetAt) > Date.parse(latest.resetAt)) {
        latest = { resetAt: outcome.resetAt, estimated: outcome.estimated === true }
      }
    }
    if (!onTheClock || latest === undefined) continue
    if (soonest === undefined || Date.parse(latest.resetAt) < Date.parse(soonest.resetAt)) soonest = latest
  }
  return soonest
}

export interface Gate {
  exhausted: () => boolean
  seat?: string
  /**
   * The chosen seat's token source — a name, a path, or a command, never the value — so the
   * seat that is billed is the seat that pays without a credential travelling through
   * everything a gate is passed to.
   */
  token?: TokenSource
  resetAt?: string
  /** `resetAt` is not a return the provider stated: a cadence ceiling where a refusal named
   *  none, or the earlier of two shut windows where two provider phrases cannot be ordered. It
   *  can be late or early, so the handoff hedges the hour rather than bounding it. */
  resetApproximate?: boolean
  reason: string
}

export function budgetGate(
  org: OrgBudget,
  role: { name: string; budgetShare?: number; seat?: string },
  readings: readonly SeatUsage[],
  records: readonly SpendRecord[],
  bounds: SeatBounds = new Map(),
): Gate {
  // No seats declared means budget is not being enforced, which is a legitimate configuration
  // and must not read as exhausted.
  if (org.seats.length === 0) {
    return { exhausted: () => false, reason: 'no seats configured, so budget is not enforced' }
  }

  // A role that names nothing falls to the first pool declared. A role that names something
  // must resolve: `loadRole` rejects an undeclared name, and refusing here too keeps a role
  // built in code from quietly spending a pool it never asked for.
  const pool = role.seat === undefined ? org.pools[0] : poolFor(org, role.seat)
  if (pool === undefined) {
    return {
      exhausted: () => true,
      reason:
        role.seat === undefined
          ? `role "${role.name}" names no pool and none is declared`
          : `role "${role.name}" names "${role.seat}", which is not declared`,
    }
  }

  const choice = chooseSeat(pool, readings, records, role, bounds)
  if (choice.seat === undefined) {
    // A seat that could be read answers for itself, in the provider's own words. Only where
    // none did does the figure come from `bounds`, which is the whole pool on the #30
    // credential and was until now the case that handed off saying nothing.
    //
    // Only a seat its own reading shut may answer, on the test `chooseSeat` uses: one passed
    // over for a role's `budget_share` ceiling is not waiting on a reset — no hour clears a
    // share of Igor's own spend — and it would displace the instant a refused pool-mate is.
    const live = pool.seats.flatMap((id) => {
      const reading = readings.find((r) => r.seat.id === id)
      const usage = reading?.usage
      if (reading === undefined || usage === undefined) return []
      const shut = (['week', 'session'] as Window[]).filter(
        (w) => seatStatus(reading.seat, usage, w).headroomPercent <= 0,
      )
      if (shut.length === 0) return []
      const resets = shut.map((w) => limitFor(usage, w).resetsAt)
      // The week is answered for first below, so a shut week with no reset takes the seat off
      // the clock entirely, as it already does on the derived path. Falling through to the
      // session's would state the hour one window opens while the week still holds the seat,
      // which is early by up to a week. A shut session with no reset is no such problem: the
      // week's stated hour is either the later of the two or under a session-length early.
      if (resets[0] === undefined) return []
      // Where both windows are shut the seat returns on the later, which the week almost
      // always is. Why "almost" is settled by preference rather than comparison: these are
      // provider phrases, and ordering them needs `resolveReset` from `capacity.ts`, which
      // imports from here. The week is wrong only inside the last session of one, so it errs
      // by under five hours where naming the session errs by up to a week, the same direction.
      // A preference is not a reading, which is what `estimated` marks here.
      return [{ resetAt: resets[0]!, estimated: shut.length > 1 }]
    })[0]
    // A live reading answers for its own seat and a derived figure for a seat nothing could
    // read, and the pool is back on the earlier of the two. They cannot be ordered: one is a
    // provider phrase, and resolving it needs `resolveReset` from `capacity.ts`, which imports
    // from here. So the reading wins where there is one, and a pool-mate back sooner goes
    // unstated — see the change's `design.md`.
    const derived = live === undefined ? derivedReset(pool, readings, bounds) : undefined
    const soonest = live ?? derived
    return {
      exhausted: () => true,
      ...(soonest === undefined ? {} : { resetAt: soonest.resetAt }),
      ...(soonest?.estimated === true ? { resetApproximate: true } : {}),
      reason: choice.reason,
    }
  }
  return {
    exhausted: () => false,
    seat: choice.seat.id,
    token: {
      ...(choice.seat.tokenEnv === undefined ? {} : { tokenEnv: choice.seat.tokenEnv }),
      ...(choice.seat.tokenFile === undefined ? {} : { tokenFile: choice.seat.tokenFile }),
      ...(choice.seat.tokenCommand === undefined ? {} : { tokenCommand: choice.seat.tokenCommand }),
    },
    reason: choice.reason,
  }
}

export function renderBudget(readings: readonly SeatUsage[]): string {
  if (readings.length === 0) return 'no seats configured\n'
  const lines = ['seat             window    used  reserve  headroom  resets']
  for (const r of readings) {
    if (r.usage === undefined) {
      lines.push(`${r.seat.id.padEnd(16)} —  ${r.error ?? 'unreadable'}`)
      continue
    }
    for (const w of ['session', 'week'] as Window[]) {
      const s = seatStatus(r.seat, r.usage, w)
      lines.push(
        `${r.seat.id.padEnd(16)} ${w.padEnd(8)} ${`${s.percentUsed}%`.padStart(5)} ` +
          `${`${s.reservePercent}%`.padStart(8)} ${`${s.headroomPercent}%`.padStart(9)}  ${s.resetsAt ?? ''}`,
      )
    }
    for (const m of r.usage.perModel) {
      lines.push(`${''.padEnd(16)} ${`wk:${m.model}`.padEnd(8)} ${`${m.percentUsed}%`.padStart(5)}`)
    }
    // Reading a seat inherits this process's environment, so a keychain or an ambient login
    // answers for it — and a worker's does not, being written out rather than inherited. A
    // seat with no token source therefore reports healthy here and cannot pay for a single
    // item, which is the one misconfiguration this command would otherwise conceal.
    if (r.seat.tokenEnv === undefined && r.seat.tokenFile === undefined && r.seat.tokenCommand === undefined) {
      lines.push(
        `${''.padEnd(16)} !  readable here but cannot pay: no token source, and a worker ` +
          `inherits nothing. See docs/seats.md.`,
      )
    }
  }
  return `${lines.join('\n')}\n`
}

export function parseNdjson<T>(text: string): T[] {
  const out: T[] = []
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (t === '') continue
    try {
      out.push(JSON.parse(t) as T)
    } catch {
      // A truncated final line is not worth failing a budget report over.
    }
  }
  return out
}

export async function loadSpend(read: (path: string) => Promise<string | undefined>): Promise<SpendRecord[]> {
  return parseNdjson<SpendRecord>((await read(EXECUTIONS_PATH)) ?? '')
}

/**
 * Reads the capacities a seat declares.
 *
 * A figure that names no window is refused rather than taken for both: spent as a session
 * capacity, a weekly figure over-states the session bound by the cadence ratio, and a seat
 * whose owner's floor rests on that bound would never know.
 */
function parseSeatCapacity(raw: unknown, seatId: string): SeatCapacity | undefined {
  if (raw === undefined) return undefined
  const windows: Window[] = ['session', 'week']
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BudgetError(
      `seat "${seatId}".capacity must name a window: ${windows.join(', ')}, or both, ` +
        `each a positive number of dollars`,
    )
  }
  const declared = raw as Record<string, unknown>
  for (const key of Object.keys(declared)) {
    if (!windows.includes(key as Window)) {
      throw new BudgetError(`seat "${seatId}".capacity names "${key}", which is not a window: ${windows.join(', ')}`)
    }
  }
  const capacity: SeatCapacity = {}
  for (const window of windows) {
    const value = declared[window]
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new BudgetError(`seat "${seatId}".capacity.${window} must be a positive number of dollars`)
    }
    capacity[window] = value
  }
  if (Object.keys(capacity).length === 0) {
    throw new BudgetError(
      `seat "${seatId}".capacity names no window: declare ${windows.join(' or ')}, or leave it out`,
    )
  }
  return capacity
}

export function parseOrgBudget(raw: unknown): OrgBudget {
  if (raw === undefined || raw === null) return { seats: [], pools: [] }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new BudgetError('budget must be a mapping')
  const data = raw as Record<string, unknown>

  const seats: Seat[] = []
  for (const entry of Array.isArray(data['seats']) ? data['seats'] : []) {
    if (typeof entry !== 'object' || entry === null) throw new BudgetError('each seat must be a mapping')
    const s = entry as Record<string, unknown>
    if (typeof s['id'] !== 'string' || s['id'].trim() === '') throw new BudgetError('each seat needs an id')
    const dedicated = s['dedicated'] === true
    const reserveRaw = s['reserve']
    if (reserveRaw !== undefined && (typeof reserveRaw !== 'number' || reserveRaw < 0 || reserveRaw >= 1)) {
      throw new BudgetError(`seat "${s['id']}".reserve must be between 0 and 1`)
    }
    if (dedicated && typeof reserveRaw === 'number' && reserveRaw > 0) {
      throw new BudgetError(`seat "${s['id']}" is dedicated, so nobody is there to reserve capacity for`)
    }
    const capacity = parseSeatCapacity(s['capacity'], s['id'])
    const tokenEnv = typeof s['token_env'] === 'string' ? s['token_env'] : undefined
    const tokenFile = typeof s['token_file'] === 'string' ? s['token_file'] : undefined
    const tokenCommand = typeof s['token_command'] === 'string' ? s['token_command'] : undefined
    if ([tokenEnv, tokenFile, tokenCommand].filter((v) => v !== undefined).length > 1) {
      throw new BudgetError(`seat "${s['id']}" may name only one of token_env, token_file, token_command`)
    }
    seats.push({
      id: s['id'],
      ...(typeof s['owner'] === 'string' ? { owner: s['owner'] } : {}),
      ...(tokenEnv === undefined ? {} : { tokenEnv }),
      ...(tokenFile === undefined ? {} : { tokenFile }),
      ...(tokenCommand === undefined ? {} : { tokenCommand }),
      ...(dedicated ? { dedicated } : {}),
      ...(capacity === undefined ? {} : { capacity }),
      reserve: dedicated ? 0 : ((reserveRaw as number) ?? 0),
    })
  }

  const pools: Pool[] = []
  for (const entry of Array.isArray(data['pools']) ? data['pools'] : []) {
    if (typeof entry !== 'object' || entry === null) throw new BudgetError('each pool must be a mapping')
    const p = entry as Record<string, unknown>
    if (typeof p['id'] !== 'string' || p['id'].trim() === '') throw new BudgetError('each pool needs an id')
    const list = Array.isArray(p['seats']) ? p['seats'] : []
    if (list.some((x) => typeof x !== 'string')) throw new BudgetError(`pool "${p['id']}".seats must be seat ids`)
    for (const id of list as string[]) {
      if (!seats.some((s) => s.id === id)) {
        throw new BudgetError(`pool "${p['id']}" lists seat "${id}", which is not declared`)
      }
    }
    pools.push({ id: p['id'], seats: list as string[] })
  }
  return { seats, pools }
}
