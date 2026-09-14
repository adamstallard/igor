/**
 * Seats, pools, and what an Igor is allowed to spend.
 *
 * The provider does not publish a cap in dollars, so it cannot be looked up. It is
 * **calibrated**: a person runs `/usage`, reads the percentage consumed, and submits it. Since
 * the loop already records what every invocation cost, a percentage plus a known spend implies
 * a cap. Nothing here ever discovers a limit by hitting it.
 */

export class BudgetError extends Error {}

export const CALIBRATIONS_PATH = 'calibrations.ndjson'
export const EXECUTIONS_PATH = 'executions.ndjson'

export interface Seat {
  id: string
  /** Who can read this seat's usage, and whose capacity the reserve protects. */
  owner?: string
  /** Where the runner finds this seat's token. */
  tokenEnv?: string
  /** Nobody works on a dedicated seat, so its reserve is zero. */
  dedicated?: boolean
  /** Fraction of capacity Igors must not consume. */
  reserve: number
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

export type Window = '5h' | 'week'

export const WINDOW_MS: Record<Window, number> = {
  '5h': 5 * 60 * 60 * 1000,
  week: 7 * 24 * 60 * 60 * 1000,
}

/**
 * A human's reading, plus what the loop had recorded at that moment.
 *
 * The implied cap is deliberately conservative. Recorded spend counts only what Igors spent,
 * so on a seat a person also uses, the percentage reflects more consumption than the loop
 * knows about — which makes the implied cap *lower* than the real one. Erring toward a smaller
 * cap means stopping early, which is the harmless direction.
 */
export interface Calibration {
  seat: string
  at: string
  window: Window
  percentUsed: number
  observedSpendUsd: number
  impliedCapUsd: number
  resetAt?: string
}

export interface SpendRecord {
  at: string
  seat?: string
  costUsd?: number
}

export function impliedCap(percentUsed: number, observedSpendUsd: number): number {
  if (percentUsed <= 0 || percentUsed > 100) {
    throw new BudgetError('percent used must be greater than 0 and no more than 100')
  }
  if (observedSpendUsd <= 0) {
    throw new BudgetError(
      'no recorded spend for this seat, so a percentage implies nothing — let an Igor work first, then calibrate',
    )
  }
  return observedSpendUsd / (percentUsed / 100)
}

/**
 * A trailing sum over the window ending now, never a counter that resets.
 *
 * The provider's limits roll continuously, so there is no boundary to detect and an
 * implementation waiting for one would wait forever.
 */
export function trailingSpend(
  records: readonly SpendRecord[],
  seat: string,
  window: Window,
  now: number = Date.now(),
): number {
  const floor = now - WINDOW_MS[window]
  let total = 0
  for (const r of records) {
    if (r.seat !== seat) continue
    const at = Date.parse(r.at)
    if (!Number.isFinite(at) || at < floor) continue
    total += r.costUsd ?? 0
  }
  return total
}

export interface SeatStatus {
  seat: Seat
  window: Window
  /** Absent when never calibrated. Nothing is guessed in its place. */
  capUsd?: number
  calibratedAt?: string
  calibrationAgeDays?: number
  spentUsd: number
  reserveUsd?: number
  headroomUsd?: number
  /** False when uncalibrated: unknown headroom is not the same as no headroom. */
  known: boolean
  note?: string
}

export function latestCalibration(
  calibrations: readonly Calibration[],
  seat: string,
  window: Window,
): Calibration | undefined {
  return calibrations
    .filter((c) => c.seat === seat && c.window === window)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))[0]
}

export function seatStatus(
  seat: Seat,
  window: Window,
  calibrations: readonly Calibration[],
  records: readonly SpendRecord[],
  now: number = Date.now(),
): SeatStatus {
  const spentUsd = trailingSpend(records, seat.id, window, now)
  const cal = latestCalibration(calibrations, seat.id, window)

  if (cal === undefined) {
    return {
      seat,
      window,
      spentUsd,
      known: false,
      note: `never calibrated — type /usage, then: igor budget calibrate --seat ${seat.id} --five-hour <n> --weekly <n>`,
    }
  }

  const reserveUsd = cal.impliedCapUsd * seat.reserve
  return {
    seat,
    window,
    capUsd: cal.impliedCapUsd,
    calibratedAt: cal.at,
    calibrationAgeDays: Math.max(0, Math.floor((now - Date.parse(cal.at)) / 86_400_000)),
    spentUsd,
    reserveUsd,
    // The reserve is subtracted before anything else, and independently of any role's ceiling.
    headroomUsd: Math.max(0, cal.impliedCapUsd - reserveUsd - spentUsd),
    known: true,
  }
}

export interface Choice {
  seat?: Seat
  window: Window
  reason: string
  /** Every seat considered, in pool order, with why each was passed over. */
  considered: { seat: string; headroomUsd?: number; why: string }[]
}

/**
 * Picks the first seat in the pool with room, applying the role's ceiling as a **ceiling**.
 *
 * A ceiling bounds what one role may draw from the pool; it reserves nothing, so several roles
 * may each declare the same one and shares need not sum to anything. Adding an Igor therefore
 * requires editing no other role.
 */
export function chooseSeat(
  pool: Pool,
  seats: readonly Seat[],
  window: Window,
  calibrations: readonly Calibration[],
  records: readonly SpendRecord[],
  role: { name: string; budgetShare?: number },
  now: number = Date.now(),
): Choice {
  const considered: Choice['considered'] = []

  for (const id of pool.seats) {
    const seat = seats.find((s) => s.id === id)
    if (seat === undefined) {
      considered.push({ seat: id, why: 'declared in the pool but not among the seats' })
      continue
    }
    const status = seatStatus(seat, window, calibrations, records, now)

    if (!status.known) {
      // Unknown is not permission. An uncalibrated seat reports honestly rather than being
      // treated as empty, which would spend someone's capacity on an assumption.
      considered.push({ seat: id, why: 'not calibrated, so headroom is unknown' })
      continue
    }
    if ((status.headroomUsd ?? 0) <= 0) {
      considered.push({ seat: id, headroomUsd: 0, why: 'at its reserve floor' })
      continue
    }

    if (role.budgetShare !== undefined) {
      const roleSpend = trailingSpend(
        records.filter((r) => (r as { role?: string }).role === role.name),
        id,
        window,
        now,
      )
      const ceiling = (status.capUsd ?? 0) * role.budgetShare
      if (roleSpend >= ceiling) {
        considered.push({
          seat: id,
          ...(status.headroomUsd === undefined ? {} : { headroomUsd: status.headroomUsd }),
          why: `role "${role.name}" is at its own ceiling of ${role.budgetShare} of this seat`,
        })
        continue
      }
    }

    considered.push({
      seat: id,
      ...(status.headroomUsd === undefined ? {} : { headroomUsd: status.headroomUsd }),
      why: 'chosen',
    })
    return { seat, window, reason: `${id} has $${status.headroomUsd?.toFixed(2)} of headroom`, considered }
  }

  return {
    window,
    reason:
      considered.length === 0
        ? `pool "${pool.id}" declares no seats`
        : `no seat in "${pool.id}" has headroom`,
    considered,
  }
}

/**
 * An exhaustion the provider reports is evidence about the cap, so it is worth comparing with
 * what calibration claimed. A large gap means the reading is stale or the seat is shared more
 * than anyone realised — either way, the number governing the buffer is wrong.
 */
export interface CrossCheck {
  seat: string
  window: Window
  claimedCapUsd?: number
  spentAtExhaustionUsd: number
  contradicted: boolean
  note: string
}

export function crossCheck(
  seat: string,
  window: Window,
  calibrations: readonly Calibration[],
  records: readonly SpendRecord[],
  now: number = Date.now(),
): CrossCheck {
  const spent = trailingSpend(records, seat, window, now)
  const cal = latestCalibration(calibrations, seat, window)
  if (cal === undefined) {
    return {
      seat,
      window,
      spentAtExhaustionUsd: spent,
      contradicted: false,
      note: `exhausted after $${spent.toFixed(2)} with no calibration to compare against`,
    }
  }
  // Exhausting well below the claimed cap means the claim is wrong, not that the provider is.
  const contradicted = spent < cal.impliedCapUsd * 0.8
  return {
    seat,
    window,
    claimedCapUsd: cal.impliedCapUsd,
    spentAtExhaustionUsd: spent,
    contradicted,
    note: contradicted
      ? `exhausted after $${spent.toFixed(2)} but calibration implied a cap of $${cal.impliedCapUsd.toFixed(2)} — ` +
        `that reading is ${Math.floor((now - Date.parse(cal.at)) / 86_400_000)} days old and the evidence contradicts it`
      : `exhausted after $${spent.toFixed(2)}, consistent with the calibrated cap`,
  }
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
    seats.push({
      id: s['id'],
      ...(typeof s['owner'] === 'string' ? { owner: s['owner'] } : {}),
      ...(typeof s['token_env'] === 'string' ? { tokenEnv: s['token_env'] } : {}),
      ...(dedicated ? { dedicated } : {}),
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

/** NDJSON on the state branch, so history is kept and staleness is visible. */
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

/** Reads the raw NDJSON logs off the state branch. Absent files are empty, never an error. */
export async function loadLedger(
  repo: string,
  read: (path: string) => Promise<string | undefined>,
): Promise<{ calibrations: Calibration[]; spend: SpendRecord[] }> {
  const [cal, exec] = await Promise.all([read(CALIBRATIONS_PATH), read(EXECUTIONS_PATH)])
  return {
    calibrations: parseNdjson<Calibration>(cal ?? ''),
    spend: parseNdjson<SpendRecord>(exec ?? ''),
  }
}

export function renderBudget(statuses: readonly SeatStatus[], staleAfterDays = 30): string {
  if (statuses.length === 0) return 'no seats configured\n'
  const money = (n?: number) => (n === undefined ? '     ?' : `$${n.toFixed(2)}`.padStart(7))
  const lines = [
    `seat            window   cap    spent  reserve headroom  calibrated`,
  ]
  for (const s of statuses) {
    const stale = s.calibrationAgeDays !== undefined && s.calibrationAgeDays > staleAfterDays
    const age =
      s.calibrationAgeDays === undefined
        ? 'never'
        : `${s.calibrationAgeDays}d ago${stale ? '  ← stale' : ''}`
    lines.push(
      `${s.seat.id.padEnd(15)} ${s.window.padEnd(6)} ${money(s.capUsd)} ${money(s.spentUsd)} ` +
        `${money(s.reserveUsd)} ${money(s.headroomUsd)}  ${age}`,
    )
    if (s.note) lines.push(`  ${s.note}`)
  }
  return `${lines.join('\n')}\n`
}

/**
 * The shape the loop consumes. Resolving which seat pays happens here, once, before work
 * starts — so an Igor that cannot afford the item says so on the item rather than discovering
 * it halfway through and going quiet.
 */
export interface Gate {
  exhausted: () => boolean
  seat?: string
  resetAt?: string
  reason: string
}

export function budgetGate(
  org: OrgBudget,
  role: { name: string; budgetShare?: number; seat?: string },
  calibrations: readonly Calibration[],
  records: readonly SpendRecord[],
  now: number = Date.now(),
): Gate {
  // No seats declared at all means budget is not being enforced, which is a legitimate
  // configuration and must not read as "exhausted".
  if (org.seats.length === 0) {
    return { exhausted: () => false, reason: 'no seats configured, so budget is not enforced' }
  }

  const target = role.seat ?? ''
  const pool =
    org.pools.find((p) => p.id === target.replace(/^pool:/, '')) ??
    // A role may name a single seat instead of a pool, for an Igor that must never borrow.
    (org.seats.some((s) => s.id === target) ? { id: target, seats: [target] } : org.pools[0])

  if (pool === undefined) {
    return { exhausted: () => true, reason: `role "${role.name}" names no pool and none is declared` }
  }

  // Both windows must have room: the five-hour limit is the one that bites first, and the
  // weekly one is the one that bites longest.
  const choices = (['5h', 'week'] as Window[]).map((w) =>
    chooseSeat(pool, org.seats, w, calibrations, records, role, now),
  )
  const blocked = choices.find((c) => c.seat === undefined)
  if (blocked) {
    const reset = latestCalibration(calibrations, pool.seats[0] ?? '', blocked.window)?.resetAt
    return {
      exhausted: () => true,
      ...(reset === undefined ? {} : { resetAt: reset }),
      reason: `${blocked.reason} (${blocked.window})`,
    }
  }
  const seat = choices[0]?.seat
  return {
    exhausted: () => false,
    ...(seat === undefined ? {} : { seat: seat.id }),
    reason: choices[0]?.reason ?? 'has headroom',
  }
}

export const STALE_AFTER_DAYS = 30

/**
 * What a person needs telling, unprompted, about the state of their budget readings.
 *
 * A calibration nobody revisits silently governs every stop decision, and the failure is
 * invisible: the numbers keep looking authoritative as they drift. So the commands people
 * actually run say something, rather than leaving it to whoever thinks to look.
 */
export function calibrationNotices(
  seats: readonly Seat[],
  calibrations: readonly Calibration[],
  now: number = Date.now(),
  staleAfterDays: number = STALE_AFTER_DAYS,
): string[] {
  const notices: string[] = []
  for (const seat of seats) {
    const missing = (['5h', 'week'] as Window[]).filter(
      (w) => latestCalibration(calibrations, seat.id, w) === undefined,
    )
    if (missing.length === 2) {
      notices.push(`seat "${seat.id}" has never been calibrated, so it will not be used at all.`)
      continue
    }
    if (missing.length === 1) {
      notices.push(`seat "${seat.id}" has no ${missing[0]} reading, so that window blocks it.`)
    }
    for (const w of ['5h', 'week'] as Window[]) {
      const cal = latestCalibration(calibrations, seat.id, w)
      if (cal === undefined) continue
      const age = Math.floor((now - Date.parse(cal.at)) / 86_400_000)
      if (age > staleAfterDays) {
        notices.push(`seat "${seat.id}" ${w} reading is ${age} days old and is still governing when work stops.`)
      }
    }
  }
  if (notices.length > 0) {
    notices.push(
      'Type /usage in any Claude Code session, then run:\n' +
        '  igor budget calibrate --seat <id> --five-hour <n> --weekly <n>',
    )
  }
  return notices
}
