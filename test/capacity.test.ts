import { describe, expect, it } from 'vitest'
import { CAPACITY_PATH, loadObservations, recordObservation, resolveReset, type Observation } from '../src/capacity.js'
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

  it('is unresolvable for a zone Intl does not know', () => {
    expect(resolveReset('Sep 13 at 8pm (Mars/Standard)', BEFORE)).toBeUndefined()
  })

  it('is unresolvable for junk input', () => {
    expect(resolveReset('sometime next week, probably', BEFORE)).toBeUndefined()
    expect(resolveReset('', BEFORE)).toBeUndefined()
  })
})
