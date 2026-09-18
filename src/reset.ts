/**
 * Reading the reset a provider prints.
 *
 * Its own module because both `capacity.ts` and `budget.ts` need it, and `capacity.ts` already
 * imports from `budget.ts`: parsing lives below the pair rather than inside either of them, so
 * ordering a phrase against an instant costs no import cycle.
 */

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

/**
 * How far before the present a reset phrase is read from, where the caller does not know when
 * the reading was taken.
 *
 * A week, because a provider states a reset no further ahead than the longest window it
 * reports. Occurrences of a phrase are a year apart, so any horizon well short of half a year
 * places it unambiguously; a week is the smallest one that covers every reset a reading can
 * carry.
 *
 * That bound is the precondition, not a detail. Shifting back moves which year `resolveReset`
 * tries first, so a phrase naming a date months ahead, read in the first week of January, can
 * fail to resolve where the unshifted call would have placed it. Widen this only alongside
 * whatever starts printing resets that far out.
 */
export const RESET_HORIZON = Temporal.Duration.from({ hours: 7 * 24 })

/**
 * Resolves a reset phrase for a caller holding the present rather than the reading's own
 * moment — the gate, which is handed readings with no timestamp on them.
 *
 * `resolveReset` answers with the first occurrence at or after the moment it is given, so
 * giving it the present sends a reset that passed a minute ago a full year out. That is not a
 * late answer but a wrong one: the seat it belongs to is back *now*, and a year is the largest
 * error the phrase can express. Reading from `RESET_HORIZON` back keeps a reset just gone in
 * the past where it belongs, and moves no reset that is still ahead.
 *
 * `undefined` for a phrase that does not resolve and for a `now` that is not an instant.
 */
export function resolveRecentReset(phrase: string, now: string): string | undefined {
  let present: Temporal.Instant
  try {
    present = Temporal.Instant.from(now)
  } catch {
    return undefined
  }
  return resolveReset(phrase, present.subtract(RESET_HORIZON).toString({ fractionalSecondDigits: 3 }))
}
