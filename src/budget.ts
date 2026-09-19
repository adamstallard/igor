import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import type { NoFigure, Observation, SeatBound, SeatBounds } from './capacity.js'
import { keyCheck } from './keys.js'
import { resolveRecentReset } from './reset.js'

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
  /** A starting capacity per window, in dollars, needing neither an observation nor recorded
   *  spend — which is what it is for: a reserved seat with no figure at all is passed over
   *  rather than spent from, so without one nothing ever accumulates for a derivation to
   *  divide. Superseded outright by the first observation of this window that yields a
   *  figure. */
  capacityEstimate?: DeclaredEstimate
}

/**
 * Dollars of list-price spend a window holds, for each window a seat declares one for. An
 * undeclared window is unobserved until it is observed, never the other window's figure scaled
 * by the cadence ratio: two limits exist because they are not proportional, and were a session
 * exactly a 168th of a week the weekly limit would forbid nothing the session limit already
 * forbids.
 */
export type DeclaredEstimate = { [W in Window]?: number }

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

/**
 * Whether the gate may spend this seat, asked at the precision the report prints.
 *
 * `100 - reserve * 100 - used` subtracts three binaries, and at a 0.57 reserve and 43% used it
 * lands on 7.1e-15 rather than on nothing. A bare `> 0` spends a seat sitting exactly on its
 * reserve while its row reads `0%` — the report and the gate saying opposite things about the
 * same seat, with nothing on the row to show it. Rounding here and printing there round the
 * same, so a sliver too small to print is refused as the nothing it prints as.
 *
 * Not in `seatStatus`: the field has exactly two numeric readers and they are both this
 * question, so rounding it at the source would round it for a reader that never asked.
 */
export const hasHeadroom = (s: SeatStatus): boolean => Number(s.headroomPercent.toFixed(PERCENT_DP)) > 0

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

/**
 * What became of a seat the gate looked at, in a word rather than a sentence.
 *
 * `why` is for a person and cannot be branched on: a composer that matched its prose would be
 * guessing at a distinction the gate already knows, which is the rule #41 set. Each verdict
 * sends its reader somewhere different — `spent` to a clock, `credential` to configuration,
 * `no-figure` to `igor observe` or a declared capacity, `share` to the role's own ceiling —
 * and telling a caller only that no seat was chosen sends them to the wrong one.
 *
 * Open rather than closed: `capacity-from-observation` §5 named three states, the code holds
 * more, and a credential the provider has rejected (#56) is a member added here with a case
 * added wherever this is switched on.
 */
export type SeatVerdict = 'chosen' | 'absent' | 'credential' | 'no-figure' | 'spent' | 'share'

export interface Choice {
  seat?: Seat
  reason: string
  /** Every seat considered, in pool order, with why each was passed over. */
  considered: { seat: string; why: string; verdict: SeatVerdict }[]
}

/**
 * What stopped a pool, where nothing in it was chosen.
 *
 * `spent` wins outright: one seat that really ran out makes "the budget is used up" a true
 * sentence about the pool, whatever else is also wrong. Where nothing ran out, the first seat
 * in pool order answers, because pool order is allocation order and that seat is the one that
 * should have been used.
 */
function poolVerdict(considered: Choice['considered']): SeatVerdict | undefined {
  // The two that mean a bound was reached, in that order: one seat that ran out makes "the
  // budget is used up" true of the pool whatever else is wrong, and a role at its own ceiling
  // is the next most specific thing to say. Leaving `share` out of this let a pool-mate's
  // unreadable token outrank it on declaration order alone, and the sentence that came out
  // said nothing had been spent on a seat whose spend was the whole problem.
  for (const winner of ['spent', 'share'] as const) {
    if (considered.some((c) => c.verdict === winner)) return winner
  }
  return considered.find((c) => c.verdict !== 'chosen')?.verdict
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
): {
  remainingUsd?: number
  blocked?: string
  /** Which of the two ways to be blocked this is, so a caller never reads it out of `blocked`. */
  verdict?: Extract<SeatVerdict, 'spent' | 'no-figure'>
  resetAt?: string
  estimated?: boolean
} {
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
        `(${capacity.basis} capacity $${capacity.capacityUsd.toFixed(2)}, ${percent(seat.reserve * 100)} reserved)`

  const spent = bound?.spent
  if (spent !== undefined) {
    const { from, resetsAt, estimated } = spent
    const spentWhy =
      `its ${window} was ${percent(from.percentUsed)} used when observed at ${from.at}, and ` +
      (estimated
        ? `the provider named no reset, so it stands until ${resetsAt} at the latest`
        : `does not reset until ${resetsAt}`)
    if (!overBound) return { blocked: spentWhy, verdict: 'spent', resetAt: resetsAt, estimated }

    // Both hold, so the seat is back only once the later clears, and the sentence names both
    // rather than leave a reason the stated hour does not account for. A rolling window has no
    // boundary at all, which makes when its sum clears unknown rather than merely later — and
    // the refusal's hour is a confident answer to a question nothing here can settle.
    const both = `${spentWhy}; ${overWhy}`
    if (bound?.resetsAt === undefined) return { blocked: both, verdict: 'spent' }
    return Date.parse(bound.resetsAt) > Date.parse(resetsAt)
      ? { blocked: both, verdict: 'spent', resetAt: bound.resetsAt, estimated: false }
      : { blocked: both, verdict: 'spent', resetAt: resetsAt, estimated }
  }

  if (capacity === undefined || allowance === undefined) {
    // A third state rather than an arithmetic verdict, and subordinate to a refusal: the
    // division is undefined without a figure, so this seat waits on a reading, not on a clock.
    if (seat.reserve <= 0) return {}
    // Which reading it waits on depends on whether one has already been taken. A seat observed
    // and still uncalibrated is waiting on spend inside an instance, or on a declared capacity;
    // telling its owner to go and observe it is telling them to repeat what they just did.
    const seen = bound?.noFigure
    return {
      blocked:
        seen === undefined
          ? `${NO_CAPACITY_FIGURE}: its ${window} has never been observed and none is declared`
          : `${NO_CAPACITY_FIGURE}: its ${window} was ${percent(seen.from.percentUsed)} used when observed at ` +
            `${seen.from.at}, but ${seen.why}, and none is declared`,
      verdict: 'no-figure',
    }
  }
  if (overBound) {
    return {
      blocked: overWhy,
      verdict: 'spent',
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
      considered.push({ seat: id, why: 'declared in the pool but not among the seats', verdict: 'absent' })
      continue
    }
    if (reading.usage === undefined) {
      // Only a credential that answered and reported no window is bounded here. Anything else
      // that stopped the reading leaves the credential in doubt, and a bound says what a seat
      // may spend without giving it anything to spend with: chosen, it claims an item, fails on
      // the worker's spawn, and does it again next cycle.
      if (reading.unmeasured !== true) {
        considered.push({ seat: id, why: reading.error ?? 'its usage could not be read', verdict: 'credential' })
        continue
      }

      const derived = (['session', 'week'] as Window[]).map((window) => ({
        window,
        bound: bounds.get(id)?.[window],
        ...derivedWindow(reading.seat, window, bounds.get(id)?.[window]),
      }))

      const stopped = derived.find((d) => d.blocked !== undefined)
      if (stopped) {
        considered.push({ seat: id, why: stopped.blocked!, verdict: stopped.verdict ?? 'spent' })
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
          considered.push({
            seat: id,
            why: `role "${role.name}" is at its ${role.budgetShare} ceiling for the ${over.window}`,
            verdict: 'share',
          })
          continue
        }
      }

      considered.push({ seat: id, why: 'chosen', verdict: 'chosen' })
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
      .find((s) => !hasHeadroom(s))
    if (blocked) {
      considered.push({
        seat: id,
        why:
          `${blocked.window} is ${percent(blocked.percentUsed)} used, ` +
          `past its ${percent(blocked.reservePercent)} reserve`,
        verdict: 'spent',
      })
      continue
    }

    if (role.budgetShare !== undefined) {
      const ceiling = role.budgetShare * 100
      const over = (['session', 'week'] as Window[]).find(
        (w) => roleSharePercent(records, id, role.name, limitFor(usage, w).percentUsed) >= ceiling,
      )
      if (over) {
        considered.push({
          seat: id,
          why: `role "${role.name}" is at its ${role.budgetShare} ceiling for the ${over}`,
          verdict: 'share',
        })
        continue
      }
    }

    considered.push({ seat: id, why: 'chosen', verdict: 'chosen' })
    const session = seatStatus(reading.seat, usage, 'session')
    const left = percent(session.headroomPercent)
    return { seat: reading.seat, reason: `${id} has ${left} of the session left`, considered }
  }

  // "No headroom" only where a seat actually ran out. A pool none of whose seats could be read
  // has headroom nobody counted, and reporting it as spent sends its reader to look at spend
  // when the fix is a credential — #49.
  const verdict = poolVerdict(considered)
  const detail = considered.map((c) => `${c.seat} — ${c.why}`).join('; ')
  return {
    reason:
      considered.length === 0
        ? `pool "${pool.id}" declares no seats`
        : verdict === 'spent'
          ? `no seat in "${pool.id}" has headroom`
          : `no seat in "${pool.id}" could be used: ${detail}`,
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

/**
 * The instant a reset names, whether it arrived as an ISO instant derived here or as the phrase
 * a provider printed. `undefined` for a reset neither reading places, which is left out of an
 * ordering rather than ordered arbitrarily.
 *
 * A phrase carries no year and a reading carries no timestamp, so it is read from the horizon
 * `resolveRecentReset` applies rather than from `now`: a reading is taken before the gate runs,
 * and the hour it names can already have gone by.
 */
function resetInstant(resetAt: string, now: string): Temporal.Instant | undefined {
  try {
    return Temporal.Instant.from(resetAt)
  } catch {
    const resolved = resolveRecentReset(resetAt, now)
    if (resolved === undefined) return undefined
    try {
      return Temporal.Instant.from(resolved)
    } catch {
      return undefined
    }
  }
}

/**
 * The earliest return among a pool's candidates, stated in whatever words it arrived in.
 *
 * A candidate `resetInstant` cannot place sits the race out rather than being ordered on its
 * text: `"Friday 9am"` sorts before `"Sep 18 at 4pm (America/Los_Angeles)"` as a string and
 * after it as a moment. Where none can be placed the first candidate answers, which is the
 * readable seats in pool order and then the derived figure — an unplaceable phrase is still the
 * provider's own answer for that seat, and dropping it says "not known" about an hour somebody
 * printed.
 */
function earliestReturn(
  candidates: readonly { resetAt: string; estimated: boolean }[],
  now: string,
): { resetAt: string; estimated: boolean } | undefined {
  let best: { candidate: { resetAt: string; estimated: boolean }; at: Temporal.Instant } | undefined
  for (const candidate of candidates) {
    const at = resetInstant(candidate.resetAt, now)
    if (at === undefined) continue
    if (best === undefined || Temporal.Instant.compare(at, best.at) < 0) best = { candidate, at }
  }
  return best?.candidate ?? candidates[0]
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
   *  none, or the week where both of a readable seat's windows are shut and the week is
   *  preferred over the session. It can be late or early, so the handoff hedges the hour
   *  rather than bounding it. */
  resetApproximate?: boolean
  /**
   * Why nothing was chosen, where nothing was. Absent on a gate that is not exhausted.
   *
   * A handoff is composed from this rather than from `reason`, which is prose for a log. Only
   * `spent` and `share` mean the budget ran out; the rest mean the pool could not be used, and
   * a reader sent to look at spend for one of those looks in the wrong place — #49.
   */
  blocked?: SeatVerdict
  /**
   * Every seat the pool passed over, with its own verdict, so a sentence composed from this
   * can be true of each of them rather than of the one that won the summary.
   *
   * Verdict words only, never a seat's error text: that can quote whatever the provider or a
   * token command printed, and a handoff is posted where anyone can read it.
   */
  passedOver?: readonly { seat: string; verdict: SeatVerdict }[]
  reason: string
}

export function budgetGate(
  org: OrgBudget,
  role: { name: string; budgetShare?: number; seat?: string },
  readings: readonly SeatUsage[],
  records: readonly SpendRecord[],
  bounds: SeatBounds = new Map(),
  now: string = Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
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
      // Not a budget that ran out: a name in configuration that resolves to nothing. The
      // handoff says so rather than sending its reader to look at spend.
      blocked: 'absent',
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
        (w) => !hasHeadroom(seatStatus(reading.seat, usage, w)),
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
      // always is. The week is taken by preference rather than by comparing the two hours: it
      // is wrong only inside the last session of one, so it errs by under five hours where
      // naming the session errs by up to a week, the same direction. A preference is not a
      // reading, which is what `estimated` marks here.
      return [{ resetAt: resets[0]!, estimated: shut.length > 1 }]
    })
    // Every seat's return in one race, however it was arrived at, because the first seat back
    // is the first Igor back. A reading answers for its own seat in the provider's words and a
    // derived figure for a seat nothing could read; `resetInstant` places both on one clock, so
    // neither wins by being the kind of figure it is.
    const derived = derivedReset(pool, readings, bounds)
    const soonest = earliestReturn([...live, ...(derived === undefined ? [] : [derived])], now)
    // An empty pool is a configuration fault like any other name that resolves to nothing, and
    // not a budget that ran out: there was never anything there to spend.
    const blocked = poolVerdict(choice.considered) ?? 'absent'
    return {
      exhausted: () => true,
      ...(soonest === undefined ? {} : { resetAt: soonest.resetAt }),
      ...(soonest?.estimated === true ? { resetApproximate: true } : {}),
      ...(blocked === undefined
        ? {}
        : {
            blocked,
            passedOver: choice.considered
              .filter((c) => c.verdict !== 'chosen')
              .map((c) => ({ seat: c.seat, verdict: c.verdict })),
          }),
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

/**
 * What the report says about one window of a seat nothing can read.
 *
 * The axis §5 is about. Each state has a different remedy and a different person to reach for
 * it — `spent` and `at-bound` want a clock, `bounded` wants nothing, `unobserved` wants
 * `igor observe` run on the owner's machine, `unmeasured` wants spend inside an observed
 * instance or a declared capacity — so a report that merges any two of them sends somebody to
 * fix the wrong thing.
 *
 * Open rather than closed, like `SeatVerdict`: a credential the provider has rejected (#56) is
 * a member added here and a case added in `describeWindow`.
 */
export type WindowState = 'spent' | 'at-bound' | 'bounded' | 'unobserved' | 'unmeasured'

export interface WindowReport {
  state: WindowState
  /** Whether the gate would spend this window. An uncalibrated seat carrying no reserve runs
   *  anyway, and "no capacity figure" alone does not say which of those an operator is looking
   *  at — one is a seat to leave alone, the other a seat to go and calibrate. */
  usable: boolean
  /** Dollars, where the live path's columns are percentages: capacity derived from a division
   *  is a quantity of spend, and the seat it describes reports no percentage to anybody. */
  used?: string
  headroom?: string
  resets?: string
  /** The state in a sentence, with whatever it rests on. */
  note: string
}

const money = (n: number): string => `$${n.toFixed(2)}`

/** Where every printed percentage is rounded, and where `hasHeadroom` asks its question. */
const PERCENT_DP = 4

/**
 * A percentage, without the noise a binary multiply leaves behind.
 *
 * A reserve is stored as the fraction it is written as, and `0.29 * 100` is
 * `28.999999999999996`; a subtraction from it carries the noise on into headroom. In a report
 * whose whole job is to be believed, that reads as an arithmetic bug rather than a rounding
 * one. Rounded here, where the figure is printed, and never in `seatStatus`, whose
 * `headroomPercent` is the raw arithmetic — `hasHeadroom` rounds the same way, so the gate and
 * the row cannot disagree about a seat.
 */
export const percent = (n: number): string => `${Number(n.toFixed(PERCENT_DP))}%`

/**
 * An observation in the two terms §5.1 asks for: what it said, and when it was taken.
 *
 * Neither is enough alone. "Headroom derived from a limit error an hour ago and headroom
 * derived from a month-old reading are not the same claim", and a figure printed without its
 * observation's age is a claim whose strength nobody can judge.
 */
const cameFrom = (o: Observation): string =>
  `${percent(o.percentUsed)} used at ${o.at} (${o.source}${o.model === undefined ? '' : `, ${o.model}`})`

/** Two readings of one seat and window are the same reading, by value: `spentFor` and
 *  `whyNoFigure` pick their row independently and frequently pick the same one. */
const sameReading = (a: Observation, b: Observation | undefined): boolean =>
  b !== undefined && a.at === b.at && a.source === b.source && a.percentUsed === b.percentUsed

/**
 * The reading that divided into nothing, and what stopped it.
 *
 * `named` where the sentence has already introduced that reading, since naming it twice in one
 * sentence reads as two readings.
 */
const unexplained = (seen: NoFigure, named: boolean): string =>
  named ? seen.why : `observed ${cameFrom(seen.from)}, but ${seen.why}`

export function describeWindow(seat: Seat, window: Window, bound: SeatBound | undefined): WindowReport {
  const capacity = bound?.capacity
  const allowance = capacity === undefined ? undefined : (1 - seat.reserve) * capacity.capacityUsd
  const seen = bound?.noFigure
  // What the figures on this row rest on: the capacity they were divided against, or — where
  // there is none and the window is refused — the reading that divided into nothing. §5.1 wants
  // the dollars beside a spent window to say what they are, not stand there as a bare amount.
  const rests =
    capacity !== undefined
      ? capacity.from === undefined
        ? `${money(capacity.capacityUsd)} capacity declared, no observation having yielded one`
        : `${money(capacity.capacityUsd)} capacity observed, from ${cameFrom(capacity.from)}`
      : seen === undefined
        ? ''
        : `${
            seen.spentUsd === undefined
              ? 'no capacity figure bounds this window'
              : `the ${money(seen.spentUsd)} is Igor spend inside the current instance, which no capacity figure bounds`
          } — ${unexplained(seen, sameReading(seen.from, bound?.spent?.from))}`
  const resets = bound?.resetsAt === undefined ? {} : { resets: bound.resetsAt }

  // A window can be refused *and* over its bound, and it is back only once the later of the two
  // clears; naming the earlier promises a return the seat does not keep. Where the bound is
  // tiled this takes the later, as `derivedWindow` does.
  //
  // Where it is rolling it states the refusal's hour, which `derivedWindow` declines to. The
  // two are answering different questions and the divergence is deliberate: a rolling sum has
  // no boundary, so it clears by dollars ageing out rather than at an instant, and a handoff
  // that named one would be promising something. A report showing the hour the refusal itself
  // ends, beside the spend that is ageing, withholds nothing and invents nothing.
  const overBound = capacity !== undefined && allowance !== undefined && allowance - capacity.spentUsd <= 0
  const overWhy =
    capacity === undefined || allowance === undefined
      ? ''
      : `Igors have spent ${money(capacity.spentUsd)} of the ${window}'s ${money(allowance)} bound`
  // Igor spend inside the current instance, from whichever half of the bound is carrying it.
  // The two are mutually exclusive: `noFigure` exists only where no capacity was derived.
  const spentSoFar = capacity?.spentUsd ?? bound?.noFigure?.spentUsd

  const spent = bound?.spent
  if (spent !== undefined) {
    // A rolling window names no boundary at all, so where one is missing the refusal's hour is
    // the only one there is.
    const later =
      overBound && bound?.resetsAt !== undefined && Date.parse(bound.resetsAt) > Date.parse(spent.resetsAt)
        ? { resetsAt: bound.resetsAt, estimated: false }
        : { resetsAt: spent.resetsAt, estimated: spent.estimated }
    const spentWhy =
      `spent — observed ${cameFrom(spent.from)}, back at ${later.resetsAt}` +
      // The hedge belongs to the refusal's own hour and to no other. Attached to an instance
      // boundary it says "at the latest" of a figure that is not a ceiling at all.
      //
      // A ceiling is not a boundary either, so it does not have to agree with the instance the
      // dollars beside it were summed inside: §1 has an unresolved reset "place no window
      // boundary" while still expiring one length on. Two hours on one row is not two windows,
      // and pairing them would assert a boundary the spec denies.
      (later.estimated ? ' (the provider named no reset, so that is the cadence ceiling)' : '')
    return {
      state: 'spent',
      usable: false,
      // Dollars, like every other figure on this path; the 100% is in the note, where it can
      // say which observation it came from. A refusal on the first run of an instance derives
      // no capacity, so the sum is on `noFigure` instead — and a window whose spend printed as
      // a dash reads as a window Igor never touched.
      ...(spentSoFar === undefined ? {} : { used: money(spentSoFar) }),
      headroom: 'none',
      resets: later.resetsAt,
      note: overBound ? `${spentWhy}; ${overWhy}; ${rests}` : spentWhy + (rests === '' ? '' : `; ${rests}`),
    }
  }

  if (capacity === undefined || allowance === undefined) {
    const runs = seat.reserve <= 0
    const figure =
      seen === undefined
        ? `no capacity figure — the ${window} has never been observed, and none is declared`
        : `no capacity figure — ${unexplained(seen, false)}; none is declared`
    const consequence = runs
      ? 'No reserve stands against it, so it runs uncalibrated until its first limit error'
      : `Passed over while a ${percent(seat.reserve * 100)} reserve stands against it: ` +
        (seen === undefined
          ? `run \`igor observe ${seat.id}\` on the owner's machine, or declare a capacity_estimate`
          : 'declaring a capacity_estimate is what starts a seat no observation has bounded')
    return {
      state: seen === undefined ? 'unobserved' : 'unmeasured',
      usable: runs,
      // Spent, though nothing bounds it: §5.1 asks for Igor spend on every window, and a
      // window with no denominator has still had a numerator.
      ...(seen?.spentUsd === undefined ? {} : { used: money(seen.spentUsd) }),
      ...resets,
      // Falling back to the instance `spentUsd` was summed inside, which is the window this row
      // is about even though no capacity came of it. Whichever row resolved a reset placed that
      // instance, and it is frequently not the row the sentence explains.
      ...(bound?.resetsAt === undefined && seen?.resetsAt !== undefined ? { resets: seen.resetsAt } : {}),
      note: `${figure}. ${consequence}`,
    }
  }

  const remaining = allowance - capacity.spentUsd
  if (remaining <= 0) {
    return {
      state: 'at-bound',
      usable: false,
      used: money(capacity.spentUsd),
      headroom: money(0),
      ...resets,
      note: `at its bound — ${overWhy}; ${rests}`,
    }
  }
  return {
    state: 'bounded',
    usable: true,
    used: money(capacity.spentUsd),
    headroom: money(remaining),
    ...resets,
    // Says the bound as well as the distance from it: the columns give the headroom, and what
    // it is headroom against is the figure a reserve was taken out of.
    note: `within its bound — ${money(remaining)} left of ${money(allowance)}; ${rests}`,
  }
}

/**
 * The report's column widths, and the only statement of them: the heading is printed through
 * the same `row`, so a column cannot be widened for the figures and left narrow in the heading.
 *
 * `used` and `headroom` carry dollars on the derived path, where a declared weekly capacity
 * reaches four figures in ordinary use. A `$3000.00` printed into a five-wide column does not
 * truncate: it pushes the reserve, the headroom and the state prose along on that row alone, and
 * the table stops being one.
 */
const WIDTH = { seat: 16, window: 8, used: 9, reserve: 8, headroom: 9 } as const

/**
 * Every seat, in the state it is actually in.
 *
 * Three things stop a seat being spent from and the remedies are not the same: a credential is
 * fixed by the operator, an uncalibrated seat by a reading taken on its owner's machine, a
 * spent one by waiting. Before §5 this report had one line for all of them, and a seat with
 * three observations behind it read as broken.
 *
 * A seat that could be read is reported on its reading alone, because that is what the gate
 * judges it on. Printing a derived figure beside a live one would show two answers to a
 * question only one of them is being asked.
 */
export function renderBudget(
  readings: readonly SeatUsage[],
  bounds: SeatBounds = new Map(),
  observations: readonly Observation[] = [],
): string {
  if (readings.length === 0) return 'no seats configured\n'
  /** One window's row. An absent figure prints as a dash rather than a blank, so a column with
   *  nothing in it is visibly nothing rather than a hole in the table. */
  const row = (
    id: string,
    window: string,
    c: { used?: string; reserve: string; headroom?: string; resets?: string; state: string },
  ): string =>
    `${id.padEnd(WIDTH.seat)} ${window.padEnd(WIDTH.window)} ${(c.used ?? '—').padStart(WIDTH.used)} ` +
    `${c.reserve.padStart(WIDTH.reserve)} ${(c.headroom ?? '—').padStart(WIDTH.headroom)}  ` +
    `${c.resets ?? '—'}  ${c.state}`
  const heading = { used: 'used', reserve: 'reserve', headroom: 'headroom', resets: 'resets', state: '' }
  const lines = [row('seat', 'window', heading).trimEnd()]

  for (const r of readings) {
    if (r.usage === undefined) {
      if (r.unmeasured !== true) {
        // The one state no record rescues, and so the one seat that gets no window rows: the
        // credential itself is in doubt, the gate passes the seat over whatever has been
        // observed of it, and a headroom figure here would be one nothing will ever spend.
        lines.push(
          `${r.seat.id.padEnd(WIDTH.seat)} —  credential unreadable, so the seat is passed over whatever is ` +
            `recorded of it: ${r.error ?? 'unreadable'}`,
        )
        continue
      }
      for (const w of ['session', 'week'] as Window[]) {
        const d = describeWindow(r.seat, w, bounds.get(r.seat.id)?.[w])
        lines.push(row(r.seat.id, w, { ...d, reserve: percent(r.seat.reserve * 100), state: d.note }))
      }
      // The per-model cap the live path shows, from the log instead of from a reading. Igor
      // enforces neither; a fleet concentrated on one model exhausts one of these first, and a
      // report that dropped the rows would leave that invisible on the derived path alone.
      //
      // Log order, deliberately, where the seat's own rows above are ordered by `at`. Nothing
      // derives from a per-model row, and where the two orders disagree it is because two
      // machines disagree about the clock — in which case the row written last is the reading
      // taken last, and the `at` beside it lets a reader judge either way.
      const latest = new Map<string, Observation>()
      for (const o of observations) {
        if (o.seat === r.seat.id && o.model !== undefined) latest.set(o.model, o)
      }
      for (const [model, o] of latest) {
        lines.push(
          `${''.padEnd(WIDTH.seat)} ${`wk:${model}`.padEnd(WIDTH.window)} ` +
            `${percent(o.percentUsed).padStart(WIDTH.used)}  observed at ${o.at}`,
        )
      }
      lines.push(`${''.padEnd(WIDTH.seat)} !  the rows above are derived, not read: ${r.error ?? 'unreadable'}`)
      continue
    }
    for (const w of ['session', 'week'] as Window[]) {
      const s = seatStatus(r.seat, r.usage, w)
      lines.push(
        row(r.seat.id, w, {
          used: percent(s.percentUsed),
          reserve: percent(s.reservePercent),
          headroom: percent(s.headroomPercent),
          ...(s.resetsAt === undefined ? {} : { resets: s.resetsAt }),
          state: 'read live',
        }),
      )
    }
    for (const m of r.usage.perModel) {
      lines.push(
        `${''.padEnd(WIDTH.seat)} ${`wk:${m.model}`.padEnd(WIDTH.window)} ` +
          `${percent(m.percentUsed).padStart(WIDTH.used)}`,
      )
    }
    // Reading a seat inherits this process's environment, so a keychain or an ambient login
    // answers for it — and a worker's does not, being written out rather than inherited. A
    // seat with no token source therefore reports healthy here and cannot pay for a single
    // item, which is the one misconfiguration this command would otherwise conceal.
    if (r.seat.tokenEnv === undefined && r.seat.tokenFile === undefined && r.seat.tokenCommand === undefined) {
      lines.push(
        `${''.padEnd(WIDTH.seat)} !  readable here but cannot pay: no token source, and a worker ` +
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
 * Reads the capacity estimates a seat declares.
 *
 * A figure that names no window is refused rather than taken for both: spent as a session
 * capacity, a weekly figure over-states the session bound by the cadence ratio, and a seat
 * whose owner's floor rests on that bound would never know.
 */
function parseDeclaredEstimate(raw: unknown, seatId: string): DeclaredEstimate | undefined {
  if (raw === undefined) return undefined
  const windows: Window[] = ['session', 'week']
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new BudgetError(
      `seat "${seatId}".capacity_estimate must name a window: ${windows.join(', ')}, or both, ` +
        `each a positive number of dollars`,
    )
  }
  const declared = raw as Record<string, unknown>
  for (const key of Object.keys(declared)) {
    if (!windows.includes(key as Window)) {
      throw new BudgetError(
        `seat "${seatId}".capacity_estimate names "${key}", which is not a window: ${windows.join(', ')}`,
      )
    }
  }
  const estimate: DeclaredEstimate = {}
  for (const window of windows) {
    const value = declared[window]
    if (value === undefined) continue
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      throw new BudgetError(`seat "${seatId}".capacity_estimate.${window} must be a positive number of dollars`)
    }
    estimate[window] = value
  }
  if (Object.keys(estimate).length === 0) {
    throw new BudgetError(
      `seat "${seatId}".capacity_estimate names no window: declare ${windows.join(' or ')}, or leave it out`,
    )
  }
  return estimate
}

const refuseUnknownKeys = keyCheck(BudgetError)

/** Every key a seat may name. Anything else is refused by name — see `keyCheck`. */
const SEAT_KEYS = [
  'id',
  'owner',
  'dedicated',
  'reserve',
  'capacity_estimate',
  'token_env',
  'token_file',
  'token_command',
]

const BUDGET_KEYS = ['seats', 'pools']

const POOL_KEYS = ['id', 'seats']

/**
 * A list left out is empty; a list that is present and is not one is refused.
 *
 * Taken as empty, a misspelt or malformed `seats:` is not a smaller budget but no budget at
 * all: every ceiling disappears, no seat is ever passed over, and the report says budget is
 * not being enforced — which is what it says for an operator who meant that.
 */
function requireList(raw: unknown, subject: string): unknown[] {
  if (raw === undefined) return []
  if (!Array.isArray(raw)) {
    throw new BudgetError(`${subject} must be a list, or left out entirely`)
  }
  return raw
}

/**
 * What to call an entry in a refusal: its id, or its position while the id is still unread.
 *
 * The keys are checked before the id is required, so a misspelt `id` reads as the typo on the
 * line rather than as an absence — and at that point there is no id to quote.
 */
function subjectOf(entry: Record<string, unknown>, kind: string, position: string): string {
  const id = entry['id']
  return typeof id === 'string' && id.trim() !== '' ? `${kind} "${id}"` : position
}

export function parseOrgBudget(raw: unknown): OrgBudget {
  if (raw === undefined || raw === null) return { seats: [], pools: [] }
  if (typeof raw !== 'object' || Array.isArray(raw)) throw new BudgetError('budget must be a mapping')
  const data = raw as Record<string, unknown>
  refuseUnknownKeys(data, BUDGET_KEYS, 'budget', 'a budget key')

  const seats: Seat[] = []
  for (const [index, entry] of requireList(data['seats'], 'budget.seats').entries()) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new BudgetError('each seat must be a mapping')
    }
    const s = entry as Record<string, unknown>
    refuseUnknownKeys(s, SEAT_KEYS, subjectOf(s, 'seat', `budget.seats[${index}]`), 'a seat key')
    if (typeof s['id'] !== 'string' || s['id'].trim() === '') throw new BudgetError('each seat needs an id')
    const dedicated = s['dedicated'] === true
    const reserveRaw = s['reserve']
    if (reserveRaw !== undefined && (typeof reserveRaw !== 'number' || reserveRaw < 0 || reserveRaw >= 1)) {
      throw new BudgetError(`seat "${s['id']}".reserve must be between 0 and 1`)
    }
    if (dedicated && typeof reserveRaw === 'number' && reserveRaw > 0) {
      throw new BudgetError(`seat "${s['id']}" is dedicated, so nobody is there to reserve capacity for`)
    }
    const capacityEstimate = parseDeclaredEstimate(s['capacity_estimate'], s['id'])
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
      ...(capacityEstimate === undefined ? {} : { capacityEstimate }),
      reserve: dedicated ? 0 : ((reserveRaw as number) ?? 0),
    })
  }

  const pools: Pool[] = []
  for (const [index, entry] of requireList(data['pools'], 'budget.pools').entries()) {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new BudgetError('each pool must be a mapping')
    }
    const p = entry as Record<string, unknown>
    refuseUnknownKeys(p, POOL_KEYS, subjectOf(p, 'pool', `budget.pools[${index}]`), 'a pool key')
    if (typeof p['id'] !== 'string' || p['id'].trim() === '') throw new BudgetError('each pool needs an id')
    const list = requireList(p['seats'], `pool "${p['id']}".seats`)
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
