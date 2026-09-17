import { appendRecord } from './state.js'
import { parseNdjson, type SpendRecord, type Window } from './budget.js'

/**
 * How full a window was, and when it resets — one shape whether the figure came from a
 * `/usage` reading or a provider limit error, per `capacity-from-observation` §1.
 */
export interface Observation {
  /** ISO instant the observation was taken. */
  at: string
  seat: string
  window: Window
  percentUsed: number
  /** ISO instant, present only when `resetsPhrase` resolved. */
  resetsAt?: string
  /** What the provider actually printed. Kept even when `resetsAt` resolves, and always kept
   *  when it does not. */
  resetsPhrase?: string
  source: 'usage' | 'limit'
  /** Set only where the window is scoped to one model, never for the all-models `week`. */
  model?: string
}

const MONTHS: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
}

// "Sep 13 at 8pm (America/Los_Angeles)" / "Sep 15 at 2:30pm (America/Los_Angeles)".
const RESET_RE = /^([A-Za-z]{3}) (\d{1,2}) at (\d{1,2})(?::(\d{2}))? ?(am|pm) ?\(([^)]+)\)$/i

/**
 * The 24-hour hour a 12-hour reading names, or `undefined` for a reading no clock face has.
 * Temporal would take `0am` as midnight and `13am` as 13:00, so the 1–12 range is checked here
 * rather than left to `overflow: 'reject'`.
 */
function hour24(hour12: number, ampm: string): number | undefined {
  if (hour12 < 1 || hour12 > 12) return undefined
  const pm = ampm.toLowerCase() === 'pm'
  if (hour12 === 12) return pm ? 12 : 0
  return pm ? hour12 + 12 : hour12
}

/**
 * Resolves a reset phrase like `"Sep 18 at 4pm (America/Los_Angeles)"` to an ISO instant, or
 * `undefined` when the phrase does not match that shape, names a zone the time-zone database
 * lacks, or names a wall time no single instant answers to: a day the month does not have, an
 * hour a spring-forward skipped, or an hour a fall-back ran twice.
 *
 * Both halves of a transition are refused rather than settled by a policy. The provider picked
 * one of the two instants such a phrase names and did not say which, so resolving it would put
 * the window an hour from where it may be, and `capacity-from-observation` §1 would rather keep
 * the phrase and derive nothing than invent a position.
 *
 * The phrase carries no year. Per `capacity-from-observation` §1, a reset is always in the
 * future relative to `at`, so this takes the first occurrence of that month/day/time at or
 * after `at` — this year in the phrase's zone, or next year if this year's has already passed.
 */
export function resolveReset(phrase: string, at: string): string | undefined {
  const m = RESET_RE.exec(phrase.trim())
  if (m === null) return undefined
  const [, monthStr, dayStr, hourStr, minuteStr, ampm, zone] = m as unknown as [
    string,
    string,
    string,
    string,
    string | undefined,
    string,
    string,
  ]

  const month = MONTHS[monthStr.toLowerCase()]
  if (month === undefined) return undefined
  const hour = hour24(Number(hourStr), ampm)
  if (hour === undefined) return undefined
  const day = Number(dayStr)
  const minute = minuteStr === undefined ? 0 : Number(minuteStr)

  // Every RangeError from here is Temporal refusing to name an instant — a malformed `at`, a
  // zone it has no rules for, a day the month lacks, a wall time a transition skipped or
  // repeated — and each leaves `resetsAt` unset the same way, so one catch serves. A candidate
  // that fails ends the search rather than deferring to next year's, which is a date the
  // provider cannot have meant by a reset.
  try {
    const atInstant = Temporal.Instant.from(at)
    const thisYear = atInstant.toZonedDateTimeISO(zone).year
    for (const year of [thisYear, thisYear + 1]) {
      const candidate = Temporal.PlainDateTime.from({ year, month, day, hour, minute }, { overflow: 'reject' })
        .toZonedDateTime(zone, { disambiguation: 'reject' })
        .toInstant()
      if (Temporal.Instant.compare(candidate, atInstant) >= 0) {
        return candidate.toString({ fractionalSecondDigits: 3 })
      }
    }
  } catch {
    return undefined
  }
  // Unreachable: next year's occurrence is always at or after `at`.
  return undefined
}

export const CAPACITY_PATH = 'capacity.ndjson'

/** Appends one observation to `capacity.ndjson`, day-partitioned by `appendRecord`. Never
 *  rewrites or deletes a row — see `capacity-from-observation` §1. */
export async function recordObservation(
  destination: string,
  observation: Observation,
  write: typeof appendRecord = appendRecord,
): Promise<void> {
  await write(
    destination,
    CAPACITY_PATH,
    { ...observation },
    `Record capacity: seat "${observation.seat}" ${observation.window}`,
  )
}

/** Mirrors `loadSpend`: the whole observation log, oldest first. */
export async function loadObservations(read: (path: string) => Promise<string | undefined>): Promise<Observation[]> {
  return parseNdjson<Observation>((await read(CAPACITY_PATH)) ?? '')
}

/**
 * How long each window runs, per `capacity-from-observation` §3.
 *
 * Session is measured rather than guessed: two readings one afternoon reset at 2:30pm and then
 * at 7:30pm (`scheduled-observation/design.md`). Week is the plain reading of "Current week",
 * which nothing has measured yet. Both are built in, not configurable — `scheduled-observation`
 * §4 derives a length from the gap between two observed resets and supersedes this.
 *
 * Expressed in hours because a cadence fixed in exact time is what lets one observed reset fix
 * every boundary either side of it, and because `Temporal.Instant` arithmetic refuses date
 * units for exactly that reason: a "day" is a calendar quantity and two of them are 23 hours
 * long each year.
 */
export const WINDOW_LENGTH: Record<Window, Temporal.Duration> = {
  session: Temporal.Duration.from({ hours: 5 }),
  week: Temporal.Duration.from({ hours: 7 * 24 }),
}

export interface InstanceBounds {
  /** ISO instant the instance began. Counted. */
  start: string
  /** ISO instant the instance resets. Not counted: it is the next instance's `start`. */
  end: string
}

/**
 * The window instance an observation belongs to: it ends at that observation's resolved reset
 * and began one window length earlier. `undefined` for a reset that is not an instant, which is
 * how an observation whose phrase never resolved derives nothing.
 *
 * Instances tile the timeline, so the interval is half-open: a moment on a boundary belongs to
 * the instance starting there and not to the one ending there, and no moment belongs to neither.
 */
export function instanceBounds(resetsAt: string, length: Temporal.Duration): InstanceBounds | undefined {
  let end: Temporal.Instant
  try {
    end = Temporal.Instant.from(resetsAt)
  } catch {
    return undefined
  }
  return {
    start: end.subtract(length).toString({ fractionalSecondDigits: 3 }),
    end: end.toString({ fractionalSecondDigits: 3 }),
  }
}

/**
 * Recorded Igor spend for one seat inside one window instance — the numerator of the division,
 * and not spend over all recorded history. `spendByRole` sums with no time filter at all, so it
 * answers a different question and cannot stand in here.
 *
 * A row with no cost, or a cost or instant the log cannot be trusted for, is skipped rather than
 * poisoning a figure a bound will later be computed from.
 */
export function spendInInstance(records: readonly SpendRecord[], seat: string, bounds: InstanceBounds): number {
  const start = Temporal.Instant.from(bounds.start)
  const end = Temporal.Instant.from(bounds.end)
  let total = 0
  for (const record of records) {
    if (record.seat !== seat) continue
    const cost = record.costUsd
    if (cost === undefined || !Number.isFinite(cost)) continue
    let at: Temporal.Instant
    try {
      at = Temporal.Instant.from(record.at)
    } catch {
      continue
    }
    if (Temporal.Instant.compare(at, start) < 0 || Temporal.Instant.compare(at, end) >= 0) continue
    total += cost
  }
  return total
}

/**
 * The capacity one observation implies: spend inside its instance over the fraction that
 * instance was consumed. The only place the division happens.
 *
 * `undefined` rather than a number where the instance holds no recorded spend, or where the
 * fraction is not a positive one. Dividing by an unrelated numerator produces a number, and
 * nothing about that number is true.
 *
 * A fraction above 100 is left uncapped. It can only lower the quotient, and low is the
 * direction that cannot overrun anybody's floor.
 */
export function capacityFrom(spendInInstanceUsd: number, percentUsed: number): number | undefined {
  if (!Number.isFinite(percentUsed) || percentUsed <= 0) return undefined
  if (!Number.isFinite(spendInInstanceUsd) || spendInInstanceUsd <= 0) return undefined
  return spendInInstanceUsd / (percentUsed / 100)
}

/** Where a capacity figure came from, so an assumption is never reported as a measurement. */
export type CapacityEstimate =
  | { capacityUsd: number; basis: 'observed'; from: Observation }
  | { capacityUsd: number; basis: 'declared' }

/** `undefined` for an instant no comparison can be made against, so such a row is left out of
 *  the ordering rather than ordered arbitrarily. */
function instantOf(iso: string): Temporal.Instant | undefined {
  try {
    return Temporal.Instant.from(iso)
  } catch {
    return undefined
  }
}

/**
 * The part of an observation's instance the observation vouches for: from the instance start to
 * the moment the reading was taken.
 *
 * `percentUsed` is a snapshot at `at`, so spend recorded after it consumed none of that
 * fraction. Counting it would raise the estimate as Igor spends against it, and the bound
 * derived from the estimate would grow faster than the spend it exists to stop — a seat that
 * never stops rather than one that stops early.
 *
 * `undefined` where the reading precedes its own instance, which `resolveReset` permits: it
 * promises a reset at or after the reading, never one within a window of it.
 */
function observedSpan(observation: Observation, length: Temporal.Duration): InstanceBounds | undefined {
  if (observation.resetsAt === undefined) return undefined
  const instance = instanceBounds(observation.resetsAt, length)
  if (instance === undefined) return undefined
  const at = instantOf(observation.at)
  if (at === undefined) return undefined
  if (Temporal.Instant.compare(at, Temporal.Instant.from(instance.start)) <= 0) return undefined
  // Compared as instants: `at` comes from the log and may carry an offset, where text order and
  // instant order disagree.
  if (Temporal.Instant.compare(at, Temporal.Instant.from(instance.end)) >= 0) return instance
  return { start: instance.start, end: at.toString({ fractionalSecondDigits: 3 }) }
}

/**
 * A seat's capacity for a window: the figure implied by the most recent observation that yields
 * one, or the declared starting estimate until such an observation exists.
 *
 * Newest-wins is what makes the estimate self-correcting. A limit error is by construction the
 * newest observation at the moment it is written, so a refusal lowers whatever estimate
 * permitted the run, with nobody re-running a reading. Which observations to combine when there
 * are several is deliberately not decided here: `capacity-from-observation` §3 wants a season of
 * them first, and warns specifically against concluding that a shared seat is stuck with an
 * underestimate.
 *
 * The numerator is the spend the observation could have seen — inside its instance and no later
 * than the reading itself, per `observedSpan`.
 *
 * A declared figure is superseded outright rather than averaged — but only by an observation
 * that yields a figure. One whose reset never resolved "contributes neither an expiry nor a
 * capacity derivation", and erasing a declared figure would be contributing something.
 *
 * Observations scoped to a single model are skipped: a per-model limit is a separate cap from
 * the all-models one, and no bound is derived against it in this change.
 *
 * Where the seat has consumers Igor cannot see, the figure comes out below true capacity,
 * because the numerator counts only Igor's share of a denominator everybody moved. That is the
 * safe direction and is not corrected for.
 */
export function capacityFor(
  observations: readonly Observation[],
  records: readonly SpendRecord[],
  seat: string,
  window: Window,
  declaredUsd?: number,
): CapacityEstimate | undefined {
  const ordered = observations
    .filter((o) => o.seat === seat && o.window === window && o.model === undefined)
    .flatMap((o) => {
      const at = instantOf(o.at)
      return at === undefined ? [] : [{ o, at }]
    })
    // Reversing before a stable sort makes the row written last win a tie on `at`, which is the
    // append-only log's own answer to which of two simultaneous observations is the later.
    .reverse()
  ordered.sort((a, b) => Temporal.Instant.compare(b.at, a.at))

  for (const { o } of ordered) {
    const span = observedSpan(o, WINDOW_LENGTH[window])
    if (span === undefined) continue
    const capacityUsd = capacityFrom(spendInInstance(records, seat, span), o.percentUsed)
    if (capacityUsd === undefined) continue
    return { capacityUsd, basis: 'observed', from: o }
  }

  if (declaredUsd !== undefined && Number.isFinite(declaredUsd) && declaredUsd > 0) {
    return { capacityUsd: declaredUsd, basis: 'declared' }
  }
  return undefined
}

/**
 * The instance of a window containing `now`, stepped from an observed reset by whole window
 * lengths.
 *
 * Two different instances are in play and confusing them is the way to a bound that never
 * bites. Capacity's numerator is spend inside the *observation's* instance; the bound's sum is
 * spend inside the *current* one. A three-day-old observation's instance is not the current
 * one, and summing against it would let spend that has already reset count forever.
 *
 * Half-open, like `instanceBounds`: a moment on a boundary belongs to the instance starting
 * there. `undefined` for a reset or a `now` that is not an instant.
 */
export function currentInstance(resetsAt: string, length: Temporal.Duration, now: string): InstanceBounds | undefined {
  const observed = instanceBounds(resetsAt, length)
  const at = instantOf(now)
  if (observed === undefined || at === undefined) return undefined
  const lengthMs = length.total({ unit: 'milliseconds' })
  const observedEnd = Temporal.Instant.from(observed.end)
  // Whole lengths from the observed reset to the reset at or after `now`. Negative where the
  // observation is in the future of `now`, which steps backwards and is still the right answer.
  const steps = Math.floor((at.epochMilliseconds - observedEnd.epochMilliseconds) / lengthMs) + 1
  const start = observedEnd.add({ milliseconds: lengthMs * (steps - 1) })
  return {
    start: start.toString({ fractionalSecondDigits: 3 }),
    end: start.add({ milliseconds: lengthMs }).toString({ fractionalSecondDigits: 3 }),
  }
}

/**
 * What bounds one seat in one window: a capacity figure, and the Igor spend already counted
 * against it.
 *
 * The two arrive as separate fields from separate calls on purpose. Recomputing the capacity
 * from the same interval the spend is summed over makes the spend cancel out of
 * `spend ≥ (1 − reserve) × capacity`, leaving a comparison of the observed fraction against
 * the reserve that no amount of spending ever crosses.
 */
export interface SeatBound {
  capacityUsd: number
  /** `declared` for a figure somebody named, so an assumption is never reported as a
   *  measurement. */
  basis: 'observed' | 'declared'
  /** Recorded Igor spend inside the current instance of this window, across every role and
   *  every Igor on the seat — the one shared sum the reserve is a bound on. */
  spentUsd: number
  /** The observation the capacity came from. Absent for a declared figure. */
  from?: Observation
}

/** Per seat id, per window. A window with no entry has no capacity figure at all. */
export type SeatBounds = Map<string, Partial<Record<Window, SeatBound>>>

/**
 * Everything the gate needs to bound the seats it cannot read, computed here and handed over
 * as data.
 *
 * `budget.ts` calls nothing in this module: this one imports `parseNdjson` from it, so an
 * import back would close a runtime cycle. The gate is left with policy — the reserve, pool
 * order, and what to say about a seat it passes over.
 */
export function boundsForSeats(
  observations: readonly Observation[],
  records: readonly SpendRecord[],
  seats: readonly { id: string; capacity?: { [W in Window]?: number } }[],
  now: string = Temporal.Now.instant().toString({ fractionalSecondDigits: 3 }),
): SeatBounds {
  const bounds: SeatBounds = new Map()
  const present = instantOf(now)
  if (present === undefined) return bounds

  // An observation cannot describe a moment that has not happened, and one dated ahead of `now`
  // is what a hand-written log produces on a mistyped `at`. `observedSpan` answers such a row
  // with its whole instance, which makes the capacity's numerator and the bound's sum the same
  // interval: the spend cancels out of `spend ≥ (1 − reserve) × capacity` and no amount of
  // spending ever crosses it.
  const vouched = observations.filter((o) => {
    const at = instantOf(o.at)
    return at === undefined || Temporal.Instant.compare(at, present) <= 0
  })

  for (const seat of seats) {
    const windows: Partial<Record<Window, SeatBound>> = {}
    for (const window of ['session', 'week'] as Window[]) {
      const estimate = capacityFor(vouched, records, seat.id, window, seat.capacity?.[window])
      if (estimate === undefined) continue
      const length = WINDOW_LENGTH[window]
      // Why a declared figure gets a rolling window: it has no observed reset behind it, and
      // the case one exists for is a seat never observed at all, so there is no boundary to
      // tile from and none may be invented.
      //
      // Why rolling back one length is safe: the elapsed part of the true instance began at
      // most one length ago and so is always inside it, making the sum an over-count rather
      // than an under-count. The cost is that spend late in one instance keeps counting into
      // the next until it ages out, which is an argument for observing a seat rather than
      // declaring at it.
      const instance =
        estimate.basis === 'observed' && estimate.from.resetsAt !== undefined
          ? currentInstance(estimate.from.resetsAt, length, now)
          : instanceBounds(now, length)
      if (instance === undefined) continue
      windows[window] = {
        capacityUsd: estimate.capacityUsd,
        basis: estimate.basis,
        spentUsd: spendInInstance(records, seat.id, instance),
        ...(estimate.basis === 'observed' ? { from: estimate.from } : {}),
      }
    }
    if (Object.keys(windows).length > 0) bounds.set(seat.id, windows)
  }
  return bounds
}
