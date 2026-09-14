import { describe, expect, it } from 'vitest'
import {
  budgetGate,
  BudgetError,
  chooseSeat,
  crossCheck,
  impliedCap,
  latestCalibration,
  parseOrgBudget,
  seatStatus,
  trailingSpend,
  type Calibration,
  type Seat,
  type SpendRecord,
} from '../src/budget.js'

const NOW = Date.parse('2026-09-13T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3600_000).toISOString()
const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

const seat = (over: Partial<Seat> = {}): Seat => ({ id: 'adam', owner: 'adam@x.com', reserve: 0.5, ...over })

const cal = (over: Partial<Calibration> = {}): Calibration => ({
  seat: 'adam',
  at: hoursAgo(1),
  window: '5h',
  percentUsed: 50,
  observedSpendUsd: 5,
  impliedCapUsd: 10,
  ...over,
})

const spend = (seatId: string, usd: number, at: string, role?: string): SpendRecord =>
  ({ seat: seatId, costUsd: usd, at, ...(role ? { role } : {}) }) as SpendRecord

describe('calibration derives a cap the provider does not publish', () => {
  it('implies a cap from a percentage and what was actually spent', () => {
    expect(impliedCap(50, 5)).toBe(10)
    expect(impliedCap(25, 5)).toBe(20)
  })

  it('refuses to imply anything from no recorded spend', () => {
    // A percentage over an unknown spend is not information.
    expect(() => impliedCap(50, 0)).toThrow(/no recorded spend/)
  })

  it('rejects a percentage outside the range', () => {
    expect(() => impliedCap(0, 5)).toThrow(BudgetError)
    expect(() => impliedCap(101, 5)).toThrow(BudgetError)
  })

  it('errs low on a shared seat, which is the harmless direction', () => {
    // Recorded spend counts only Igors. A human also using the seat drives the percentage up
    // without the loop seeing the spend, so the implied cap comes out below the real one.
    const igorOnly = impliedCap(80, 4)
    expect(igorOnly).toBeLessThan(impliedCap(40, 4))
  })

  it('takes the most recent reading for the window', () => {
    const older = cal({ at: daysAgo(3), impliedCapUsd: 99 })
    const newer = cal({ at: hoursAgo(2), impliedCapUsd: 42 })
    expect(latestCalibration([older, newer], 'adam', '5h')?.impliedCapUsd).toBe(42)
  })

  it('does not mix windows', () => {
    expect(latestCalibration([cal({ window: 'week' })], 'adam', '5h')).toBeUndefined()
  })
})

describe('spend is a trailing sum, never a counter that resets', () => {
  const records = [spend('adam', 1, hoursAgo(1)), spend('adam', 2, hoursAgo(4)), spend('adam', 4, hoursAgo(9))]

  it('sums only what falls inside the window ending now', () => {
    expect(trailingSpend(records, 'adam', '5h', NOW)).toBe(3)
  })

  it('a wider window includes more of the same records', () => {
    expect(trailingSpend(records, 'adam', 'week', NOW)).toBe(7)
  })

  it('a record leaves the window by the passage of time alone', () => {
    // No boundary is detected and nothing is reset; the sum simply stops including it.
    // Two hours on, the 4-hour-old record has aged out and only the 1-hour-old one remains.
    expect(trailingSpend(records, 'adam', '5h', NOW + 2 * 3600_000)).toBe(1)
    // Five hours on, everything has.
    expect(trailingSpend(records, 'adam', '5h', NOW + 5 * 3600_000)).toBe(0)
  })

  it('ignores other seats', () => {
    expect(trailingSpend([...records, spend('kapo', 100, hoursAgo(1))], 'adam', '5h', NOW)).toBe(3)
  })

  it('tolerates a record with no cost or an unparseable time', () => {
    const messy = [{ seat: 'adam', at: 'not a date', costUsd: 5 }, { seat: 'adam', at: hoursAgo(1) }]
    expect(trailingSpend(messy, 'adam', '5h', NOW)).toBe(0)
  })
})

describe('an uncalibrated seat reports honestly', () => {
  const s = seatStatus(seat(), '5h', [], [spend('adam', 3, hoursAgo(1))], NOW)

  it('reports unknown rather than estimating a cap', () => {
    expect(s.known).toBe(false)
    expect(s.capUsd).toBeUndefined()
    expect(s.headroomUsd).toBeUndefined()
  })

  it('still reports what was actually spent, which it does know', () => {
    expect(s.spentUsd).toBe(3)
  })

  it('says what to do about it', () => {
    expect(s.note).toMatch(/igor budget calibrate --seat adam/)
  })
})

describe('the reserve is subtracted first and independently', () => {
  it('leaves the owner their fraction', () => {
    const s = seatStatus(seat({ reserve: 0.5 }), '5h', [cal()], [spend('adam', 2, hoursAgo(1))], NOW)
    expect(s.capUsd).toBe(10)
    expect(s.reserveUsd).toBe(5)
    expect(s.headroomUsd).toBe(3)
  })

  it('reports no headroom rather than a negative number once past the floor', () => {
    const s = seatStatus(seat({ reserve: 0.5 }), '5h', [cal()], [spend('adam', 9, hoursAgo(1))], NOW)
    expect(s.headroomUsd).toBe(0)
  })

  it('gives a dedicated seat its whole capacity', () => {
    const s = seatStatus(seat({ id: 'igor-1', dedicated: true, reserve: 0 }), '5h', [cal({ seat: 'igor-1' })], [], NOW)
    expect(s.headroomUsd).toBe(10)
  })

  it('reports the age of the reading, since a stale one silently governs the buffer', () => {
    const s = seatStatus(seat(), '5h', [cal({ at: daysAgo(40) })], [], NOW)
    expect(s.calibrationAgeDays).toBe(40)
  })
})

describe('pool order is the allocation mechanism', () => {
  const seats = [
    seat({ id: 'igor-1', dedicated: true, reserve: 0 }),
    seat({ id: 'adam', reserve: 0.5 }),
  ]
  const cals = [cal({ seat: 'igor-1' }), cal({ seat: 'adam' })]
  const pool = { id: 'engineering', seats: ['igor-1', 'adam'] }
  const role = { name: 'triage' }

  it('drains dedicated capacity before touching a person’s', () => {
    const c = chooseSeat(pool, seats, '5h', cals, [], role, NOW)
    expect(c.seat?.id).toBe('igor-1')
  })

  it('passes over an exhausted seat rather than stopping', () => {
    const c = chooseSeat(pool, seats, '5h', cals, [spend('igor-1', 10, hoursAgo(1))], role, NOW)
    expect(c.seat?.id).toBe('adam')
    expect(c.considered[0]?.why).toMatch(/reserve floor/)
  })

  it('reports no seat when the whole pool is spent, rather than picking one anyway', () => {
    const c = chooseSeat(pool, seats, '5h', cals, [spend('igor-1', 10, hoursAgo(1)), spend('adam', 10, hoursAgo(1))], role, NOW)
    expect(c.seat).toBeUndefined()
    expect(c.reason).toMatch(/no seat in "engineering" has headroom/)
  })

  it('will not spend an uncalibrated seat on an assumption', () => {
    const c = chooseSeat(pool, seats, '5h', [], [], role, NOW)
    expect(c.seat).toBeUndefined()
    expect(c.considered.every((x) => /not calibrated/.test(x.why))).toBe(true)
  })

  it('explains every seat it passed over, in order', () => {
    const c = chooseSeat(pool, seats, '5h', cals, [spend('igor-1', 10, hoursAgo(1))], role, NOW)
    expect(c.considered.map((x) => x.seat)).toEqual(['igor-1', 'adam'])
  })
})

describe('budget_share is a ceiling, not a reservation', () => {
  const seats = [seat({ id: 'igor-1', dedicated: true, reserve: 0 })]
  const cals = [cal({ seat: 'igor-1', impliedCapUsd: 100 })]
  const pool = { id: 'p', seats: ['igor-1'] }

  it('stops a role at its own ceiling while the seat still has room', () => {
    const records = [spend('igor-1', 45, hoursAgo(1), 'triage')]
    const c = chooseSeat(pool, seats, '5h', cals, records, { name: 'triage', budgetShare: 0.4 }, NOW)
    expect(c.seat).toBeUndefined()
    expect(c.considered[0]?.why).toMatch(/at its own ceiling/)
  })

  it('lets another role use what the first is not', () => {
    // The whole point of a ceiling over a reservation: nothing is set aside for the idle role.
    const records = [spend('igor-1', 45, hoursAgo(1), 'triage')]
    const c = chooseSeat(pool, seats, '5h', cals, records, { name: 'docs', budgetShare: 0.4 }, NOW)
    expect(c.seat?.id).toBe('igor-1')
  })

  it('allows several roles to declare the same ceiling', () => {
    // Shares need not sum to one, so adding an Igor requires editing no other role.
    for (const name of ['a', 'b', 'c']) {
      expect(chooseSeat(pool, seats, '5h', cals, [], { name, budgetShare: 0.4 }, NOW).seat?.id).toBe('igor-1')
    }
  })

  it('does not let a ceiling reach past the seat’s reserve', () => {
    // The reserve is checked first and independently, so a generous ceiling cannot cross it.
    const shared = [seat({ id: 'adam', reserve: 0.9 })]
    const c = chooseSeat({ id: 'p', seats: ['adam'] }, shared, '5h', [cal({ seat: 'adam', impliedCapUsd: 10 })],
      [spend('adam', 1.5, hoursAgo(1), 'greedy')], { name: 'greedy', budgetShare: 1 }, NOW)
    expect(c.seat).toBeUndefined()
    expect(c.considered[0]?.why).toMatch(/reserve floor/)
  })
})

describe('exhaustion cross-checks the calibration', () => {
  it('flags a reading the evidence contradicts', () => {
    const c = crossCheck('adam', '5h', [cal({ impliedCapUsd: 100, at: daysAgo(40) })], [spend('adam', 20, hoursAgo(1))], NOW)
    expect(c.contradicted).toBe(true)
    expect(c.note).toMatch(/40 days old/)
  })

  it('does not flag an exhaustion consistent with the cap', () => {
    const c = crossCheck('adam', '5h', [cal({ impliedCapUsd: 10 })], [spend('adam', 9.5, hoursAgo(1))], NOW)
    expect(c.contradicted).toBe(false)
  })

  it('says so plainly when there is nothing to compare against', () => {
    const c = crossCheck('adam', '5h', [], [spend('adam', 9.5, hoursAgo(1))], NOW)
    expect(c.contradicted).toBe(false)
    expect(c.note).toMatch(/no calibration/)
  })
})

describe('parsing org budget config', () => {
  it('reads seats and pools', () => {
    const b = parseOrgBudget({
      seats: [{ id: 'igor-1', dedicated: true }, { id: 'adam', owner: 'a@x', reserve: 0.5, token_env: 'T' }],
      pools: [{ id: 'eng', seats: ['igor-1', 'adam'] }],
    })
    expect(b.seats[0]).toEqual({ id: 'igor-1', dedicated: true, reserve: 0 })
    expect(b.seats[1]?.tokenEnv).toBe('T')
    expect(b.pools[0]?.seats).toEqual(['igor-1', 'adam'])
  })

  it('rejects a pool naming a seat that does not exist', () => {
    // Otherwise the typo surfaces as an Igor mysteriously never running.
    expect(() => parseOrgBudget({ seats: [], pools: [{ id: 'eng', seats: ['ghost'] }] })).toThrow(/not declared/)
  })

  it('rejects a reserve on a dedicated seat', () => {
    expect(() => parseOrgBudget({ seats: [{ id: 'x', dedicated: true, reserve: 0.5 }] })).toThrow(/nobody is there/)
  })

  it('rejects a reserve of the whole seat', () => {
    expect(() => parseOrgBudget({ seats: [{ id: 'x', reserve: 1 }] })).toThrow(/between 0 and 1/)
  })

  it('treats absent budget config as no seats rather than an error', () => {
    expect(parseOrgBudget(undefined)).toEqual({ seats: [], pools: [] })
  })
})

describe('the gate the loop consumes', () => {
  const seats = [seat({ id: 'igor-1', dedicated: true, reserve: 0 })]
  const org = { seats, pools: [{ id: 'eng', seats: ['igor-1'] }] }
  const cals = [cal({ seat: 'igor-1', window: '5h' }), cal({ seat: 'igor-1', window: 'week' })]

  it('does not read as exhausted when no seats are configured at all', () => {
    // Not enforcing a budget is a legitimate configuration, not a spent one.
    expect(budgetGate({ seats: [], pools: [] }, { name: 'r' }, [], [], NOW).exhausted()).toBe(false)
  })

  it('passes when both windows have room', () => {
    const g = budgetGate(org, { name: 'r', seat: 'pool:eng' }, cals, [], NOW)
    expect(g.exhausted()).toBe(false)
    expect(g.seat).toBe('igor-1')
  })

  it('blocks when the five-hour window is spent even though the week is not', () => {
    // The short window bites first; checking only the long one would sail past it.
    const records = [spend('igor-1', 10, hoursAgo(1))]
    const g = budgetGate(org, { name: 'r', seat: 'pool:eng' }, cals, records, NOW)
    expect(g.exhausted()).toBe(true)
    expect(g.reason).toContain('5h')
  })

  it('blocks when the week is spent even though the last five hours are quiet', () => {
    const records = [spend('igor-1', 10, hoursAgo(30))]
    const weekly = [cal({ seat: 'igor-1', window: '5h' }), cal({ seat: 'igor-1', window: 'week', impliedCapUsd: 10 })]
    const g = budgetGate(org, { name: 'r', seat: 'pool:eng' }, weekly, records, NOW)
    expect(g.exhausted()).toBe(true)
    expect(g.reason).toContain('week')
  })

  it('honours a role pinned to a single seat rather than a pool', () => {
    const g = budgetGate(org, { name: 'r', seat: 'igor-1' }, cals, [], NOW)
    expect(g.seat).toBe('igor-1')
  })

  it('carries the reset time through, so the handoff can say when capacity returns', () => {
    const resetAt = new Date(NOW + 3600_000).toISOString()
    const withReset = [cal({ seat: 'igor-1', window: '5h', resetAt }), cal({ seat: 'igor-1', window: 'week' })]
    const g = budgetGate(org, { name: 'r', seat: 'pool:eng' }, withReset, [spend('igor-1', 10, hoursAgo(1))], NOW)
    expect(g.resetAt).toBe(resetAt)
  })
})
