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
