import { appendRecord } from './state.js'
import { parseNdjson, type Window } from './budget.js'

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

function isKnownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * The instant `year`-`month`-`day` `hour`:`minute` names in `zone`, or `undefined` when no
 * single instant answers to it: a day the month does not have, an hour a spring-forward
 * skipped, or an hour a fall-back ran twice.
 *
 * Both halves of a transition are refused rather than settled by a policy. The provider picked
 * one of the two instants such a phrase names and did not say which, so resolving it would put
 * the window an hour from where it may be, and `capacity-from-observation` §1 would rather keep
 * the phrase and derive nothing than invent a position.
 */
function zonedToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  zone: string,
): Temporal.Instant | undefined {
  try {
    return Temporal.PlainDateTime.from({ year, month, day, hour, minute }, { overflow: 'reject' })
      .toZonedDateTime(zone, { disambiguation: 'reject' })
      .toInstant()
  } catch {
    return undefined
  }
}

/**
 * Resolves a reset phrase like `"Sep 18 at 4pm (America/Los_Angeles)"` to an ISO instant, or
 * `undefined` when the phrase does not match that shape, names a zone `Intl` does not know, or
 * names a wall time no single instant answers to.
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
  const day = Number(dayStr)
  if (day < 1 || day > 31) return undefined
  const minute = minuteStr === undefined ? 0 : Number(minuteStr)
  if (minute < 0 || minute > 59) return undefined
  let hour = Number(hourStr)
  if (hour < 1 || hour > 12) return undefined
  if (ampm.toLowerCase() === 'pm' && hour !== 12) hour += 12
  if (ampm.toLowerCase() === 'am' && hour === 12) hour = 0

  if (!isKnownZone(zone)) return undefined

  const atMs = Date.parse(at)
  if (Number.isNaN(atMs)) return undefined
  const atInstant = Temporal.Instant.fromEpochMilliseconds(atMs)

  const zonedYear = atInstant.toZonedDateTimeISO(zone).year
  for (const year of [zonedYear, zonedYear + 1]) {
    const candidate = zonedToInstant(year, month, day, hour, minute, zone)
    // A candidate naming no single instant ends the search rather than deferring to the next
    // year's, which is a date the provider cannot have meant by a reset.
    if (candidate === undefined) return undefined
    if (Temporal.Instant.compare(candidate, atInstant) >= 0) {
      return candidate.toString({ fractionalSecondDigits: 3 })
    }
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
