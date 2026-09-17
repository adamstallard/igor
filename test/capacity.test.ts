import { describe, expect, it } from 'vitest'
import {
  CAPACITY_PATH,
  WINDOW_LENGTH,
  boundsForSeats,
  capacityFor,
  capacityFrom,
  currentInstance,
  instanceBounds,
  loadObservations,
  recordObservation,
  resolveReset,
  spendInInstance,
  type Observation,
} from '../src/capacity.js'
import { parseOrgBudget, type SpendRecord } from '../src/budget.js'
import type { appendRecord } from '../src/state.js'

/** A `write` that captures what it was called with, instead of touching `appendRecord`. */
function fakeWrite(): {
  write: typeof appendRecord
  calls: { path: string; record: Record<string, unknown>; message: string }[]
} {
  const calls: { path: string; record: Record<string, unknown>; message: string }[] = []
  const write: typeof appendRecord = async (_destination, path, record, message) => {
    calls.push({ path, record, message })
  }
  return { write, calls }
}

describe('recording an observation', () => {
  it('records a usage reading and a limit error as the same shape', async () => {
    const sessionAt = '2026-09-13T12:00:00.000Z'
    const sessionPhrase = 'Sep 13 at 8pm (America/Los_Angeles)'
    const sessionResolved = resolveReset(sessionPhrase, sessionAt)
    if (sessionResolved === undefined) throw new Error('expected the session phrase to resolve')
    const usageObs: Observation = {
      at: sessionAt,
      seat: 'adam',
      window: 'session',
      percentUsed: 17,
      resetsAt: sessionResolved,
      resetsPhrase: sessionPhrase,
      source: 'usage',
    }

    const weekAt = '2026-09-13T20:05:00.000Z'
    const weekPhrase = 'Sep 18 at 4pm (America/Los_Angeles)'
    const weekResolved = resolveReset(weekPhrase, weekAt)
    if (weekResolved === undefined) throw new Error('expected the week phrase to resolve')
    const limitObs: Observation = {
      at: weekAt,
      seat: 'adam',
      window: 'week',
      percentUsed: 100,
      resetsAt: weekResolved,
      resetsPhrase: weekPhrase,
      source: 'limit',
    }

    const { write, calls } = fakeWrite()
    await recordObservation('o/r', usageObs, write)
    await recordObservation('o/r', limitObs, write)

    expect(calls[0]?.path).toBe(CAPACITY_PATH)
    expect(calls[1]?.path).toBe(CAPACITY_PATH)
    expect(Object.keys(calls[0]?.record ?? {}).sort()).toEqual(Object.keys(calls[1]?.record ?? {}).sort())
    expect(calls[0]?.record).toEqual(usageObs)
    expect(calls[1]?.record).toEqual(limitObs)
  })

  it('records an unresolvable reset with its phrase and no instant', async () => {
    const obs: Observation = {
      at: '2026-09-13T20:00:00.000Z',
      seat: 'adam',
      window: 'week',
      percentUsed: 42,
      resetsPhrase: 'sometime next week, probably',
      source: 'usage',
    }
    const { write, calls } = fakeWrite()
    await recordObservation('o/r', obs, write)

    expect('resetsAt' in (calls[0]?.record ?? {})).toBe(false)
    expect(calls[0]?.record['resetsPhrase']).toBe('sometime next week, probably')
  })

  it('keeps a per-model observation scoped to its model, not the all-models week', async () => {
    const obs: Observation = {
      at: '2026-09-13T00:00:00.000Z',
      seat: 'adam',
      window: 'week',
      percentUsed: 0,
      source: 'usage',
      model: 'Fable',
    }
    const { write, calls } = fakeWrite()
    await recordObservation('o/r', obs, write)

    expect(calls[0]?.record['model']).toBe('Fable')
    expect(calls[0]?.record['window']).toBe('week')
  })

  it('appends a second observation for the same seat and window rather than replacing the first', async () => {
    let log = ''
    const write: typeof appendRecord = async (_destination, _path, record) => {
      log += `${JSON.stringify(record)}\n`
    }
    const read = async (path: string) => (path === CAPACITY_PATH ? log : undefined)

    await recordObservation('o/r', { at: 't1', seat: 'adam', window: 'session', percentUsed: 10, source: 'usage' }, write)
    await recordObservation('o/r', { at: 't2', seat: 'adam', window: 'session', percentUsed: 20, source: 'usage' }, write)

    const rows = await loadObservations(read)
    expect(rows.map((r) => r.percentUsed)).toEqual([10, 20])
    expect(rows[0]).toEqual({ at: 't1', seat: 'adam', window: 'session', percentUsed: 10, source: 'usage' })
  })
})

describe('resolving a reset phrase', () => {
  // The three phrases actually observed, read from a moment before all of them.
  const BEFORE = '2026-09-01T00:00:00.000Z'

  it('resolves "Sep 13 at 8pm (America/Los_Angeles)"', () => {
    expect(resolveReset('Sep 13 at 8pm (America/Los_Angeles)', BEFORE)).toBe('2026-09-14T03:00:00.000Z')
  })

  it('resolves "Sep 15 at 2:30pm (America/Los_Angeles)", a :30 minute', () => {
    expect(resolveReset('Sep 15 at 2:30pm (America/Los_Angeles)', BEFORE)).toBe('2026-09-15T21:30:00.000Z')
  })

  it('resolves "Sep 18 at 4pm (America/Los_Angeles)"', () => {
    expect(resolveReset('Sep 18 at 4pm (America/Los_Angeles)', BEFORE)).toBe('2026-09-18T23:00:00.000Z')
  })

  it('tells am from pm', () => {
    expect(resolveReset('Jan 5 at 9am (UTC)', '2026-01-01T00:00:00.000Z')).toBe('2026-01-05T09:00:00.000Z')
    expect(resolveReset('Jan 5 at 9pm (UTC)', '2026-01-01T00:00:00.000Z')).toBe('2026-01-05T21:00:00.000Z')
  })

  it('resolves midnight and noon, the 12am/12pm edge', () => {
    expect(resolveReset('Jan 1 at 12am (UTC)', '2025-12-01T00:00:00.000Z')).toBe('2026-01-01T00:00:00.000Z')
    expect(resolveReset('Jun 1 at 12pm (UTC)', '2026-05-01T00:00:00.000Z')).toBe('2026-06-01T12:00:00.000Z')
  })

  it('rolls over the year when the date has already passed this year', () => {
    // A reset is always in the future, so "Jan 2" read on "Dec 30" means next January.
    expect(resolveReset('Jan 2 at 9am (UTC)', '2026-12-30T00:00:00.000Z')).toBe('2027-01-02T09:00:00.000Z')
  })

  // 6:30am is a reset time this account really sees, and these are the two days a year the
  // zone's offset changes underneath it.
  it('resolves a 6:30am reset on the day the clocks spring forward', () => {
    expect(resolveReset('Mar 8 at 6:30am (America/Los_Angeles)', '2026-03-01T00:00:00.000Z')).toBe(
      '2026-03-08T13:30:00.000Z',
    )
  })

  it('resolves a 6:30am reset on the day the clocks fall back', () => {
    expect(resolveReset('Nov 1 at 6:30am (America/Los_Angeles)', '2026-10-25T00:00:00.000Z')).toBe(
      '2026-11-01T14:30:00.000Z',
    )
  })

  it('is unresolvable for an hour a spring-forward skipped', () => {
    expect(resolveReset('Mar 8 at 2:30am (America/Los_Angeles)', '2026-03-01T00:00:00.000Z')).toBeUndefined()
  })

  it('is unresolvable for an hour a fall-back ran twice', () => {
    expect(resolveReset('Nov 1 at 1:30am (America/Los_Angeles)', '2026-10-25T00:00:00.000Z')).toBeUndefined()
  })

  it('is unresolvable for a day the month does not have, rather than the next month', () => {
    expect(resolveReset('Feb 30 at 9am (UTC)', '2026-02-01T00:00:00.000Z')).toBeUndefined()
  })

  // Guards Temporal does not supply: `overflow: 'reject'` admits hour 0 and hour 13, which no
  // 12-hour clock face has.
  it('is unresolvable for an hour off the 12-hour clock face', () => {
    expect(resolveReset('Sep 13 at 0am (UTC)', BEFORE)).toBeUndefined()
    expect(resolveReset('Sep 13 at 0pm (UTC)', BEFORE)).toBeUndefined()
    expect(resolveReset('Sep 13 at 13am (UTC)', BEFORE)).toBeUndefined()
    expect(resolveReset('Sep 13 at 13pm (UTC)', BEFORE)).toBeUndefined()
  })

  it('is unresolvable for a day no month has, or a minute past :59', () => {
    expect(resolveReset('Sep 0 at 9am (UTC)', BEFORE)).toBeUndefined()
    expect(resolveReset('Sep 32 at 9am (UTC)', BEFORE)).toBeUndefined()
    expect(resolveReset('Sep 13 at 8:60pm (UTC)', BEFORE)).toBeUndefined()
  })

  it('is unresolvable when `at` is not an ISO instant', () => {
    expect(resolveReset('Sep 13 at 8pm (UTC)', 't1')).toBeUndefined()
    expect(resolveReset('Sep 13 at 8pm (UTC)', '')).toBeUndefined()
  })

  it('is unresolvable for a zone Intl does not know', () => {
    expect(resolveReset('Sep 13 at 8pm (Mars/Standard)', BEFORE)).toBeUndefined()
  })

  it('is unresolvable for junk input', () => {
    expect(resolveReset('sometime next week, probably', BEFORE)).toBeUndefined()
    expect(resolveReset('', BEFORE)).toBeUndefined()
  })
})

// One session instance: 16:30 → 21:30 on 15 Sep, the reset measured in
// `scheduled-observation/design.md`.
const INSTANCE_START = '2026-09-15T16:30:00.000Z'
const INSTANCE_END = '2026-09-15T21:30:00.000Z'

function spend(at: string, costUsd: number, seat = 'adam'): SpendRecord {
  return { at, seat, role: 'triage', costUsd }
}

function observed(fields: Partial<Observation> = {}): Observation {
  return {
    at: '2026-09-15T20:00:00.000Z',
    seat: 'adam',
    window: 'session',
    percentUsed: 36,
    resetsAt: INSTANCE_END,
    source: 'usage',
    ...fields,
  }
}

describe('window instance boundaries', () => {
  it('bounds the session instance by its reset and the five-hour cadence', () => {
    expect(instanceBounds(INSTANCE_END, WINDOW_LENGTH.session)).toEqual({
      start: INSTANCE_START,
      end: INSTANCE_END,
    })
  })

  it('bounds the weekly instance by seven days', () => {
    expect(instanceBounds(INSTANCE_END, WINDOW_LENGTH.week)).toEqual({
      start: '2026-09-08T21:30:00.000Z',
      end: INSTANCE_END,
    })
  })

  it('subtracts exact time rather than calendar days across a daylight-saving transition', () => {
    // US Pacific falls back on 2026-11-01, so the seven days before this reset are 169 hours of
    // local wall clock. Counting them as calendar days would put the boundary at 20:30Z — an
    // hour of spend into the instance before, or out of this one.
    expect(instanceBounds('2026-11-03T21:30:00.000Z', WINDOW_LENGTH.week)?.start).toBe(
      '2026-10-27T21:30:00.000Z',
    )
    // Spring forward, the other direction: 2026-03-08.
    expect(instanceBounds('2026-03-10T21:30:00.000Z', WINDOW_LENGTH.week)?.start).toBe(
      '2026-03-03T21:30:00.000Z',
    )
  })

  it('has no instance for a reset that is not an instant', () => {
    expect(instanceBounds('Sep 15 at 2:30pm (America/Los_Angeles)', WINDOW_LENGTH.session)).toBeUndefined()
  })
})

describe('spend inside one instance', () => {
  const bounds = { start: INSTANCE_START, end: INSTANCE_END }

  it('counts the instant the instance begins and not the instant it resets', () => {
    const records: SpendRecord[] = [
      // Instances tile, so the boundary belongs to the instance starting there.
      spend(INSTANCE_START, 3),
      spend('2026-09-15T19:00:00.000Z', 15),
      spend(INSTANCE_END, 400),
      spend('2026-09-15T16:29:59.999Z', 400),
    ]
    expect(spendInInstance(records, 'adam', bounds)).toBe(18)
  })

  it('counts only the seat asked about', () => {
    const records = [spend('2026-09-15T19:00:00.000Z', 18), spend('2026-09-15T19:00:00.000Z', 400, 'fleet-1')]
    expect(spendInInstance(records, 'adam', bounds)).toBe(18)
  })

  it('skips a row with no cost or an unreadable instant', () => {
    const records: SpendRecord[] = [
      spend('2026-09-15T19:00:00.000Z', 18),
      { at: '2026-09-15T19:30:00.000Z', seat: 'adam' },
      { at: 'whenever', seat: 'adam', costUsd: 400 },
    ]
    expect(spendInInstance(records, 'adam', bounds)).toBe(18)
  })
})

describe('the division', () => {
  it('divides spend in the instance by the fraction consumed', () => {
    expect(capacityFrom(18, 36)).toBeCloseTo(50, 10)
  })

  it('derives nothing from a fraction that is not positive', () => {
    expect(capacityFrom(18, 0)).toBeUndefined()
    expect(capacityFrom(18, -5)).toBeUndefined()
    expect(capacityFrom(18, Number.NaN)).toBeUndefined()
  })

  it('derives nothing from an instance holding no spend', () => {
    expect(capacityFrom(0, 36)).toBeUndefined()
  })
})

describe('a seat capacity estimate', () => {
  it('divides only the spend inside the observation own instance', () => {
    const records = [
      spend('2026-09-15T14:00:00.000Z', 400), // the instance before
      spend('2026-09-15T19:00:00.000Z', 18),
      spend('2026-09-15T22:00:00.000Z', 400), // the instance after
    ]
    const estimate = capacityFor([observed()], records, 'adam', 'session')
    expect(estimate?.capacityUsd).toBeCloseTo(50, 10)
    expect(estimate?.basis).toBe('observed')
  })

  it('names the observation it derived from', () => {
    const observation = observed()
    const estimate = capacityFor([observation], [spend('2026-09-15T19:00:00.000Z', 18)], 'adam', 'session')
    expect(estimate).toEqual({ capacityUsd: expect.closeTo(50, 10), basis: 'observed', from: observation })
  })

  it('derives nothing when the instance holds no recorded spend', () => {
    const records = [spend('2026-09-15T14:00:00.000Z', 400)]
    expect(capacityFor([observed()], records, 'adam', 'session')).toBeUndefined()
  })

  it('derives nothing from an observation whose reset never resolved', () => {
    const unresolved = observed({ resetsPhrase: 'sometime next week, probably' })
    delete unresolved.resetsAt
    expect(capacityFor([unresolved], [spend('2026-09-15T19:00:00.000Z', 18)], 'adam', 'session')).toBeUndefined()
  })

  it('ignores another seat and another window', () => {
    const records = [spend('2026-09-15T19:00:00.000Z', 18)]
    expect(capacityFor([observed({ seat: 'fleet-1' })], records, 'adam', 'session')).toBeUndefined()
    expect(capacityFor([observed({ window: 'week' })], records, 'adam', 'session')).toBeUndefined()
  })

  it('counts only the spend the observation could have seen', () => {
    // A reading taken a third of the way into its instance says nothing about the two thirds
    // after it. Counting those would make an estimate rise as Igor spends against it, and the
    // bound derived from it grow faster than the spend it is there to stop.
    const records = [spend('2026-09-15T19:00:00.000Z', 18), spend('2026-09-15T21:00:00.000Z', 180)]
    expect(capacityFor([observed()], records, 'adam', 'session')?.capacityUsd).toBeCloseTo(50, 10)
  })

  it('compares the observation instant against the instance, not its text', () => {
    // 23:00+05:00 is 18:00Z — inside the instance, and lexicographically past its 22:00Z end.
    const reset = '2026-09-15T22:00:00.000Z'
    const offset = observed({ at: '2026-09-15T23:00:00.000+05:00', resetsAt: reset })
    const records = [spend('2026-09-15T17:30:00.000Z', 18), spend('2026-09-15T19:00:00.000Z', 180)]
    expect(capacityFor([offset], records, 'adam', 'session')?.capacityUsd).toBeCloseTo(50, 10)
  })

  it('derives nothing from an observation taken before its own instance began', () => {
    // `resolveReset` only promises a reset at or after the reading, never one within a window
    // of it, so a phrase naming a distant reset leaves every dollar in the instance unobserved.
    const distant = observed({ at: '2026-09-15T10:00:00.000Z' })
    expect(capacityFor([distant], [spend('2026-09-15T19:00:00.000Z', 18)], 'adam', 'session')).toBeUndefined()
  })

  it('measures a weekly observation against the seven-day cadence', () => {
    // Six days before the reset: inside the weekly instance, nowhere near a five-hour one.
    const records = [spend('2026-09-09T21:30:00.000Z', 18)]
    const weekly = observed({ window: 'week' })
    expect(capacityFor([weekly], records, 'adam', 'week')?.capacityUsd).toBeCloseTo(50, 10)
  })

  it('takes the row written last when two observations share an instant', () => {
    const records = [spend('2026-09-15T19:00:00.000Z', 18)]
    const earlierRow = observed({ percentUsed: 18 })
    const laterRow = observed({ percentUsed: 36 })
    expect(capacityFor([earlierRow, laterRow], records, 'adam', 'session')?.capacityUsd).toBeCloseTo(50, 10)
    expect(capacityFor([laterRow, earlierRow], records, 'adam', 'session')?.capacityUsd).toBeCloseTo(100, 10)
  })

  it('ignores an observation scoped to one model', () => {
    const records = [spend('2026-09-15T19:00:00.000Z', 18)]
    const perModel = observed({ at: '2026-09-15T21:00:00.000Z', percentUsed: 100, source: 'limit', model: 'opus' })
    const estimate = capacityFor([observed(), perModel], records, 'adam', 'session')
    expect(estimate?.capacityUsd).toBeCloseTo(50, 10)
    expect(estimate?.basis === 'observed' && estimate.from).toEqual(observed())
  })
})

describe('a limit error lowers the estimate that permitted it', () => {
  const records = [
    spend('2026-09-15T19:00:00.000Z', 18),
    // The next session instance: 21:30 → 02:30.
    spend('2026-09-15T23:00:00.000Z', 30),
  ]
  const refusal = observed({
    at: '2026-09-16T01:00:00.000Z',
    percentUsed: 100,
    resetsAt: '2026-09-16T02:30:00.000Z',
    source: 'limit',
  })

  it('estimates from the reading before the refusal', () => {
    expect(capacityFor([observed()], records, 'adam', 'session')?.capacityUsd).toBeCloseTo(50, 10)
  })

  it('lowers the estimate to what the refusal implies', () => {
    const before = capacityFor([observed()], records, 'adam', 'session')
    const after = capacityFor([observed(), refusal], records, 'adam', 'session')
    expect(after?.capacityUsd).toBe(30)
    expect(after?.capacityUsd).toBeLessThan(before?.capacityUsd ?? 0)
    expect(after?.basis === 'observed' && after.from).toEqual(refusal)
  })

  it('holds the figure the refusal implied when later spend lands in the same instance', () => {
    // Another Igor's run was already in flight when the refusal was written, and `appendRecord`
    // stamps a run at completion. Those dollars are not part of the 100% the provider reported.
    const inFlight = [...records, spend('2026-09-16T01:15:00.000Z', 5)]
    expect(capacityFor([refusal], inFlight, 'adam', 'session')?.capacityUsd).toBe(30)
  })

  it('takes the later observation whichever order the rows are read in', () => {
    expect(capacityFor([refusal, observed()], records, 'adam', 'session')?.capacityUsd).toBe(30)
  })

  it('falls back to an older observation when the newest derives nothing', () => {
    // The refusal's own instance holds no spend, so it yields no figure and the reading stands.
    const onlyEarlier = [spend('2026-09-15T19:00:00.000Z', 18)]
    const estimate = capacityFor([observed(), refusal], onlyEarlier, 'adam', 'session')
    expect(estimate?.capacityUsd).toBeCloseTo(50, 10)
  })
})

describe('a co-consumer makes the estimate low, not high', () => {
  it('yields a smaller figure the more of the window somebody else moved', () => {
    // The same $18 of Igor spend in the same instance. At 18% consumed Igor moved the window
    // alone; at 36% the seat owner moved as much again, and the same spend now stands for half
    // as much of the window.
    const records = [spend('2026-09-15T19:00:00.000Z', 18)]
    const alone = capacityFor([observed({ percentUsed: 18 })], records, 'adam', 'session')
    const shared = capacityFor([observed({ percentUsed: 36 })], records, 'adam', 'session')
    expect(alone?.capacityUsd).toBeCloseTo(100, 10)
    expect(shared?.capacityUsd).toBeCloseTo(50, 10)
    expect(shared?.capacityUsd).toBeLessThan(alone?.capacityUsd ?? 0)
  })
})

describe('a declared capacity', () => {
  const records = [spend('2026-09-15T19:00:00.000Z', 18)]

  it('stands, reported as declared, while the seat has no observation', () => {
    expect(capacityFor([], records, 'adam', 'session', 250)).toEqual({ capacityUsd: 250, basis: 'declared' })
  })

  it('is superseded outright by an observation rather than averaged with it', () => {
    const estimate = capacityFor([observed()], records, 'adam', 'session', 250)
    expect(estimate?.capacityUsd).toBeCloseTo(50, 10)
    expect(estimate?.basis).toBe('observed')
  })

  it('survives an observation that yields no figure of its own', () => {
    const unresolved = observed({ resetsPhrase: 'sometime next week, probably' })
    delete unresolved.resetsAt
    expect(capacityFor([unresolved], records, 'adam', 'session', 250)).toEqual({
      capacityUsd: 250,
      basis: 'declared',
    })
  })

  it('leaves a seat with neither an observation nor a declared figure with no capacity at all', () => {
    expect(capacityFor([], records, 'adam', 'session')).toBeUndefined()
  })

  it('is superseded only for the window observed, leaving the other window as declared', () => {
    const { seats } = parseOrgBudget({
      seats: [{ id: 'adam', reserve: 0.5, capacity: { session: 12, week: 250 } }],
    })
    const declared = seats[0]?.capacity
    const weekly = observed({ window: 'week' })
    // Six days before the reset: inside the weekly instance, nowhere near a five-hour one.
    const inWeek = [spend('2026-09-09T21:30:00.000Z', 18)]

    expect(capacityFor([weekly], inWeek, 'adam', 'week', declared?.week)).toEqual({
      capacityUsd: expect.closeTo(50, 10),
      basis: 'observed',
      from: weekly,
    })
    expect(capacityFor([weekly], inWeek, 'adam', 'session', declared?.session)).toEqual({
      capacityUsd: 12,
      basis: 'declared',
    })
  })
})

describe('the instance containing now, stepped from an observed reset', () => {
  const SESSION = WINDOW_LENGTH['session']
  const RESET = '2026-09-13T14:00:00.000Z'

  it('gives the observation’s own instance while now is still inside it', () => {
    expect(currentInstance(RESET, SESSION, '2026-09-13T13:00:00.000Z')).toEqual({
      start: '2026-09-13T09:00:00.000Z',
      end: '2026-09-13T14:00:00.000Z',
    })
  })

  it('steps whole lengths forward for an observation days behind', () => {
    // Five hours does not divide a day, so the boundaries walk: three days on, the instance
    // containing 13:30 runs 12:00 to 17:00 and not 09:00 to 14:00. Reading the observed reset
    // as a time of day rather than stepping whole lengths gets this wrong every day but the
    // first, and gets it wrong in the direction of counting spend that has already reset.
    expect(currentInstance(RESET, SESSION, '2026-09-16T13:30:00.000Z')).toEqual({
      start: '2026-09-16T12:00:00.000Z',
      end: '2026-09-16T17:00:00.000Z',
    })
  })

  it('puts a moment on a boundary in the instance starting there, not the one ending', () => {
    // Instances tile: no moment belongs to neither, and none to both.
    expect(currentInstance(RESET, SESSION, RESET)).toEqual({
      start: '2026-09-13T14:00:00.000Z',
      end: '2026-09-13T19:00:00.000Z',
    })
  })

  it('steps backwards for an observation whose reset is still ahead', () => {
    expect(currentInstance(RESET, SESSION, '2026-09-13T08:00:00.000Z')).toEqual({
      start: '2026-09-13T04:00:00.000Z',
      end: '2026-09-13T09:00:00.000Z',
    })
  })

  it('names no instance for a reset or a moment that is not an instant', () => {
    expect(currentInstance('Sep 13 at 8pm', SESSION, '2026-09-13T13:00:00.000Z')).toBeUndefined()
    expect(currentInstance(RESET, SESSION, 'now-ish')).toBeUndefined()
  })
})

describe('the bounds the gate is handed', () => {
  const NOW = '2026-09-13T13:00:00.000Z'
  const spent = (at: string, usd: number): SpendRecord => ({ seat: 'adam', costUsd: usd, at })
  const observation: Observation = {
    at: '2026-09-13T12:00:00.000Z',
    seat: 'adam',
    window: 'session',
    percentUsed: 50,
    resetsAt: '2026-09-13T14:00:00.000Z',
    source: 'usage',
  }

  it('reports the capacity and the current instance’s spend as separate figures', () => {
    const records = [spent('2026-09-13T11:00:00.000Z', 10), spent('2026-09-13T12:30:00.000Z', 6)]
    const bound = boundsForSeats([observation], records, [{ id: 'adam' }], NOW).get('adam')?.session
    expect(bound).toEqual({ capacityUsd: 20, basis: 'observed', spentUsd: 16, from: observation })
  })

  it('leaves out a window with neither an observation nor a declared figure', () => {
    const bounds = boundsForSeats([observation], [spent('2026-09-13T11:00:00.000Z', 10)], [{ id: 'adam' }], NOW)
    expect(bounds.get('adam')?.week).toBeUndefined()
  })

  it('rolls a declared figure’s window back from now, having no observed reset to tile from', () => {
    // The case a declared capacity exists for is a seat never observed at all, so there is no
    // boundary to step from. A length back from now always covers the elapsed part of the real
    // instance, which over-counts rather than under-counts.
    const records = [spent('2026-09-13T10:00:00.000Z', 4), spent('2026-09-13T07:00:00.000Z', 99)]
    const bound = boundsForSeats([], records, [{ id: 'adam', capacity: { session: 30 } }], NOW).get('adam')?.session
    expect(bound).toEqual({ capacityUsd: 30, basis: 'declared', spentUsd: 4 })
  })

  it('derives nothing from an observation dated after now', () => {
    // A row nothing but a person writes, with a mistyped `at`. `observedSpan` answers it with
    // its whole instance, which would make the capacity's numerator and the bound's sum the
    // same interval — capacity then tracks spend one for one and the bound never bites.
    const ahead = { ...observation, at: '2026-10-13T12:00:00.000Z' }
    const records = [spent('2026-09-13T11:00:00.000Z', 10), spent('2026-09-13T12:30:00.000Z', 6)]
    expect(boundsForSeats([ahead], records, [{ id: 'adam' }], NOW).get('adam')?.session).toBeUndefined()
  })

  it('names no seat at all where nothing was derived for either window', () => {
    expect(boundsForSeats([], [], [{ id: 'adam' }], NOW).has('adam')).toBe(false)
  })
})
