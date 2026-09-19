import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { tempDir } from './tmp.js'
import {
  budgetGate,
  BudgetError,
  chooseSeat,
  parseOrgBudget,
  parseUsage,
  readAllSeats,
  hasSubscription,
  readUsage,
  NO_CAPACITY_FIGURE,
  describeWindow,
  renderBudget,
  type WindowState,
  resolveToken,
  roleSharePercent,
  seatStatus,
  type OrgBudget,
  type Seat,
  type SeatUsage,
  type SpendRecord,
  type Usage,
} from '../src/budget.js'
import { boundsForSeats, type Observation } from '../src/capacity.js'
import { composeHandoff } from '../src/handoff.js'
import type { Role } from '../src/role.js'

/** Exactly what `claude -p '/usage'` returns. */
const REAL = `You are currently using your subscription to power your Claude Code usage

Current session: 17% used · resets Sep 13 at 8pm (America/Los_Angeles)
Current week (all models): 12% used · resets Sep 18 at 4pm (America/Los_Angeles)
Current week (Fable): 0% used · resets Sep 18 at 4pm (America/Los_Angeles)

What's contributing to your limits usage?
Approximate, based on local sessions on this machine — does not include other devices.

Last 24h · 1073 requests · 29 sessions
  100% of your usage came from subagent-heavy sessions`

const seat = (over: Partial<Seat> = {}): Seat => ({ id: 'adam', owner: 'adam@x.com', reserve: 0.5, ...over })
const usage = (session: number, week = 0): Usage => ({
  session: { percentUsed: session },
  week: { percentUsed: week },
  perModel: [],
})
const spend = (seatId: string, usd: number, role?: string): SpendRecord =>
  ({ seat: seatId, costUsd: usd, at: '2026-09-13T12:00:00Z', ...(role ? { role } : {}) })

describe('reading what the provider actually prints', () => {
  const u = parseUsage(REAL)

  it('takes both headline figures', () => {
    expect(u.session.percentUsed).toBe(17)
    expect(u.week.percentUsed).toBe(12)
  })

  it('keeps the reset times as written, since they are for a person to read', () => {
    expect(u.session.resetsAt).toBe('Sep 13 at 8pm (America/Los_Angeles)')
  })

  it('records the per-model weekly limit rather than dropping it', () => {
    // A fleet concentrated on one model can exhaust a limit the headline figures never show.
    expect(u.perModel).toEqual([
      { model: 'Fable', percentUsed: 0, resetsAt: 'Sep 18 at 4pm (America/Los_Angeles)' },
    ])
  })

  it('does not mistake the prose underneath for a limit', () => {
    expect(u.perModel).toHaveLength(1)
  })

  it('refuses output with no figures in it rather than reporting zero', () => {
    // Reporting 0% used from unparseable output would read as a completely free seat.
    expect(() => parseUsage('command not found')).toThrow(BudgetError)
  })

  it('survives a line without a reset time', () => {
    expect(parseUsage('Current session: 40% used').session).toEqual({ percentUsed: 40 })
  })
})

describe('whether a credential can have a window at all', () => {
  it('a subscription login can', () => {
    expect(hasSubscription({ authMethod: 'claude.ai', subscriptionType: 'team' })).toBe(true)
  })

  it('a setup-token credential cannot, reporting no subscription of any kind', () => {
    expect(hasSubscription({ authMethod: 'oauth_token' })).toBe(false)
  })

  it('an empty subscription is no subscription', () => {
    expect(hasSubscription({ subscriptionType: '' })).toBe(false)
  })
})

describe('a seat is read through its own credential', () => {
  it('passes the seat token to the child rather than the ambient login', async () => {
    let seen: string | undefined
    await readUsage(seat({ tokenEnv: 'SEAT_ONE' }), { SEAT_ONE: 'tok-abc' }, async (env) => {
      seen = env['CLAUDE_CODE_OAUTH_TOKEN']
      return REAL
    })
    expect(seen).toBe('tok-abc')
  })

  it('refuses when the named variable is unset, rather than falling back', async () => {
    // Falling back would read one seat and record it as another — the whole failure this
    // approach removes.
    await expect(readUsage(seat({ tokenEnv: 'MISSING' }), {}, async () => REAL)).rejects.toThrow(/is not set/)
  })

  it('uses the ambient login when a seat names no token', async () => {
    let seen: string | undefined = 'unset'
    await readUsage(seat(), {}, async (env) => {
      seen = env['CLAUDE_CODE_OAUTH_TOKEN']
      return REAL
    })
    expect(seen).toBeUndefined()
  })

  it('reads the token from a file when the seat names token_file', async () => {
    const path = join(tempDir('igor-test-token-'), 'token')
    writeFileSync(path, 'tok-from-file\n')
    let seen: string | undefined
    await readUsage(seat({ tokenFile: path }), {}, async (env) => {
      seen = env['CLAUDE_CODE_OAUTH_TOKEN']
      return REAL
    })
    expect(seen).toBe('tok-from-file')
  })

  it('refuses when token_file cannot be read', async () => {
    await expect(
      readUsage(seat({ tokenFile: '/nonexistent/igor-token' }), {}, async () => REAL),
    ).rejects.toThrow(/could not be read/)
  })

  it('runs token_command and takes its trimmed stdout', async () => {
    let seen: string | undefined
    await readUsage(seat({ tokenCommand: 'printf tok-from-cmd' }), {}, async (env) => {
      seen = env['CLAUDE_CODE_OAUTH_TOKEN']
      return REAL
    })
    expect(seen).toBe('tok-from-cmd')
  })

  it('refuses when token_command fails', async () => {
    await expect(readUsage(seat({ tokenCommand: 'exit 1' }), {}, async () => REAL)).rejects.toThrow(/failed/)
  })

  it('refuses when token_command prints nothing', async () => {
    await expect(readUsage(seat({ tokenCommand: 'true' }), {}, async () => REAL)).rejects.toThrow(/printed nothing/)
  })

  it('refuses a token_command that hangs, rather than waiting on it forever', async () => {
    // A short timeout stands in for the real one, so the test does not wait 10s on a command
    // that is never going to answer — `pass`/`op` blocked on an interactive prompt is exactly
    // this shape.
    await expect(resolveToken({ tokenCommand: 'sleep 0.2' }, {}, 50)).rejects.toThrow(/timed out/)
  })

  it('names the credential when it carries no subscription, rather than blaming the parser', async () => {
    // A setup-token credential authenticates and spends, and `/usage` answers it with a cost
    // summary. Reporting that as unparseable output sends someone to read a regex.
    const COST = 'Total cost:  $0.0000\nTotal duration (API):  0s'
    await expect(
      readUsage(seat({ tokenEnv: 'S' }), { S: 'tok' }, async () => COST, async () => ({
        authMethod: 'oauth_token',
      })),
    ).rejects.toThrow(/carries no subscription/)
  })

  it('keeps the parse error when the credential does have a subscription', async () => {
    // Then the output changed shape, which is a different problem and wants its own text.
    await expect(
      readUsage(seat(), {}, async () => 'something else entirely', async () => ({
        authMethod: 'claude.ai',
        subscriptionType: 'team',
      })),
    ).rejects.toThrow(/no usage figures in output/)
  })

  it('keeps the parse error when the credential cannot be described at all', async () => {
    // A diagnosis that fails leaves the original standing; it never replaces it with a guess.
    await expect(
      readUsage(seat(), {}, async () => 'something else entirely', async () => undefined),
    ).rejects.toThrow(/no usage figures in output/)
  })

  it('does not ask about the credential when the reading parsed', async () => {
    let asked = false
    await readUsage(seat(), {}, async () => REAL, async () => {
      asked = true
      return undefined
    })
    expect(asked).toBe(false)
  })

  it('one unreadable seat does not blind the others', async () => {
    const readings = await readAllSeats(
      [seat({ id: 'good' }), seat({ id: 'bad', tokenEnv: 'NOPE' })],
      {},
      async () => REAL,
    )
    expect(readings[0]?.usage?.session.percentUsed).toBe(17)
    expect(readings[1]?.usage).toBeUndefined()
    expect(readings[1]?.error).toMatch(/is not set/)
  })
})

describe('headroom is percent, straight from the reading', () => {
  it('takes the reserve off the top', () => {
    const s = seatStatus(seat({ reserve: 0.5 }), usage(17), 'session')
    expect(s.percentUsed).toBe(17)
    expect(s.reservePercent).toBe(50)
    expect(s.headroomPercent).toBe(33)
  })

  it('gives a dedicated seat the whole limit', () => {
    expect(seatStatus(seat({ dedicated: true, reserve: 0 }), usage(17), 'session').headroomPercent).toBe(83)
  })

  it('reports none rather than a negative once past the floor', () => {
    expect(seatStatus(seat({ reserve: 0.5 }), usage(80), 'session').headroomPercent).toBe(0)
  })
})

describe('pool order is the allocation mechanism', () => {
  const readings = (a: number, b: number): SeatUsage[] => [
    { seat: seat({ id: 'igor-1', dedicated: true, reserve: 0 }), usage: usage(a, a) },
    { seat: seat({ id: 'adam', reserve: 0.5 }), usage: usage(b, b) },
  ]
  const pool = { id: 'eng', seats: ['igor-1', 'adam'] }
  const role = { name: 'triage' }

  it('drains dedicated capacity before a person’s', () => {
    expect(chooseSeat(pool, readings(10, 10), [], role).seat?.id).toBe('igor-1')
  })

  it('passes over a spent seat rather than stopping', () => {
    const c = chooseSeat(pool, readings(100, 10), [], role)
    expect(c.seat?.id).toBe('adam')
    expect(c.considered[0]?.why).toMatch(/session is 100% used/)
  })

  it('reports none when the whole pool is spent', () => {
    expect(chooseSeat(pool, readings(100, 100), [], role).seat).toBeUndefined()
  })

  it('blocks on the week even when the session is quiet', () => {
    // The session bites first and the week bites longest; either alone misses the other.
    const mixed: SeatUsage[] = [
      { seat: seat({ id: 'igor-1', dedicated: true, reserve: 0 }), usage: { session: { percentUsed: 5 }, week: { percentUsed: 100 }, perModel: [] } },
    ]
    const c = chooseSeat({ id: 'eng', seats: ['igor-1'] }, mixed, [], role)
    expect(c.seat).toBeUndefined()
    expect(c.considered[0]?.why).toMatch(/week is 100% used/)
  })

  it('skips a seat it could not read rather than assuming it is free', () => {
    // A seat whose credential answered and carries no subscription is bounded by observation
    // instead — see the derived-bound suite. This one's credential is in doubt, so no record
    // makes it safe to spend.
    const broken: SeatUsage[] = [{ seat: seat({ id: 'igor-1', reserve: 0.5 }), error: 'token missing' }]
    const c = chooseSeat({ id: 'eng', seats: ['igor-1'] }, broken, [], role)
    expect(c.seat).toBeUndefined()
    expect(c.considered[0]?.why).toBe('token missing')
  })
})

describe('budget_share is a ceiling, not a reservation', () => {
  const readings: SeatUsage[] = [{ seat: seat({ id: 'igor-1', dedicated: true, reserve: 0 }), usage: usage(50, 50) }]
  const pool = { id: 'p', seats: ['igor-1'] }

  it('apportions the limit by each role’s share of recorded spend', () => {
    // Half of Igor's spend is half of Igor's share of the limit: 50% used, so 25 points.
    const records = [spend('igor-1', 5, 'triage'), spend('igor-1', 5, 'docs')]
    expect(roleSharePercent(records, 'igor-1', 'triage', 50)).toBe(25)
  })

  it('stops a role at its ceiling while the seat still has room', () => {
    const records = [spend('igor-1', 9, 'triage'), spend('igor-1', 1, 'docs')]
    const c = chooseSeat(pool, readings, records, { name: 'triage', budgetShare: 0.4 })
    expect(c.seat).toBeUndefined()
    expect(c.considered[0]?.why).toMatch(/at its 0.4 ceiling/)
  })

  it('lets another role use what the first is not', () => {
    const records = [spend('igor-1', 9, 'triage'), spend('igor-1', 1, 'docs')]
    expect(chooseSeat(pool, readings, records, { name: 'docs', budgetShare: 0.4 }).seat?.id).toBe('igor-1')
  })

  it('allows several roles to declare the same ceiling', () => {
    for (const name of ['a', 'b', 'c']) {
      expect(chooseSeat(pool, readings, [], { name, budgetShare: 0.4 }).seat?.id).toBe('igor-1')
    }
  })

  it('cannot reach past the seat’s reserve however generous it is', () => {
    const shared: SeatUsage[] = [{ seat: seat({ id: 'adam', reserve: 0.9 }), usage: usage(15, 15) }]
    const c = chooseSeat({ id: 'p', seats: ['adam'] }, shared, [], { name: 'greedy', budgetShare: 1 })
    expect(c.seat).toBeUndefined()
    expect(c.considered[0]?.why).toMatch(/past its 90% reserve/)
  })

  it('attributes nothing when no spend is recorded yet', () => {
    expect(roleSharePercent([], 'igor-1', 'triage', 50)).toBe(0)
  })
})

describe('the gate the loop consumes', () => {
  const org = { seats: [seat({ id: 'igor-1', dedicated: true, reserve: 0 })], pools: [{ id: 'eng', seats: ['igor-1'] }] }

  it('does not read as exhausted when no seats are configured', () => {
    expect(budgetGate({ seats: [], pools: [] }, { name: 'r' }, [], []).exhausted()).toBe(false)
  })

  it('passes when there is room, naming the seat that pays', () => {
    const g = budgetGate(org, { name: 'r', seat: 'pool:eng' }, [{ seat: org.seats[0]!, usage: usage(10, 10) }], [])
    expect(g.exhausted()).toBe(false)
    expect(g.seat).toBe('igor-1')
  })

  it('carries the reset time through, so a handoff can say when capacity returns', () => {
    // Both windows are shut, so the seat waits on the later, and the week carries the reset it
    // waits on. A week with none leaves the return off the clock rather than borrowing the
    // session's, which is a different case and is tested with the rest of the live path.
    const full: SeatUsage[] = [
      { seat: org.seats[0]!, usage: {
        session: { percentUsed: 100, resetsAt: '8pm' },
        week: { percentUsed: 100, resetsAt: 'Friday 9am' },
        perModel: [],
      } },
    ]
    const g = budgetGate(org, { name: 'r', seat: 'pool:eng' }, full, [])
    expect(g.exhausted()).toBe(true)
    expect(g.resetAt).toBe('Friday 9am')
  })

  it('honours a role pinned to one seat rather than a pool', () => {
    const g = budgetGate(org, { name: 'r', seat: 'igor-1' }, [{ seat: org.seats[0]!, usage: usage(10, 10) }], [])
    expect(g.seat).toBe('igor-1')
  })

  it('refuses a name nothing declares rather than substituting the first pool', () => {
    const g = budgetGate(org, { name: 'r', seat: 'igor-2' }, [{ seat: org.seats[0]!, usage: usage(10, 10) }], [])
    expect(g.exhausted()).toBe(true)
    expect(g.seat).toBeUndefined()
    expect(g.reason).toMatch(/names "igor-2", which is not declared/)
  })

  it('still falls to the first declared pool for a role that names nothing', () => {
    const g = budgetGate(org, { name: 'r' }, [{ seat: org.seats[0]!, usage: usage(10, 10) }], [])
    expect(g.seat).toBe('igor-1')
  })
})

describe('reporting', () => {
  it('shows both windows and any per-model limit', () => {
    const out = renderBudget([{ seat: seat({ id: 'igor-1', dedicated: true, reserve: 0 }), usage: parseUsage(REAL) }])
    expect(out).toMatch(/session\s+17%/)
    expect(out).toMatch(/week\s+12%/)
    expect(out).toMatch(/wk:Fable/)
  })

  it('says why a seat could not be read instead of leaving a blank row', () => {
    expect(renderBudget([{ seat: seat(), error: 'token missing' }])).toMatch(/token missing/)
  })
})

describe('an operator can tell the states apart from the report alone', () => {
  const NOW = '2026-09-13T13:00:00.000Z'
  const at = '2026-09-13T12:00:00.000Z'
  const obs = (over: Partial<Observation>): Observation =>
    ({ at, seat: 'x', window: 'session', percentUsed: 50, resetsAt: '2026-09-13T14:00:00.000Z', source: 'usage', ...over })
  const paid = (seatId: string, usd: number, when = '2026-09-13T11:00:00.000Z'): SpendRecord =>
    ({ seat: seatId, costUsd: usd, at: when })
  const unmeasurable = (s: Seat): SeatUsage =>
    ({ seat: s, unmeasured: true, error: `seat "${s.id}" carries no subscription.` })

  const seats: Seat[] = [
    { id: 'live', reserve: 0, dedicated: true, tokenEnv: 'T' },
    { id: 'badtoken', reserve: 0.5, tokenEnv: 'GONE' },
    { id: 'virgin', reserve: 0.5, tokenEnv: 'T' },
    { id: 'freewheel', reserve: 0, tokenEnv: 'T' },
    { id: 'uncalibrated', reserve: 0.5, tokenEnv: 'T' },
    { id: 'calibrated', reserve: 0.25, tokenEnv: 'T' },
    { id: 'declared', reserve: 0.25, tokenEnv: 'T', capacityEstimate: { session: 40 } },
    { id: 'refused', reserve: 0.1, tokenEnv: 'T' },
  ]
  const observations: Observation[] = [
    // Read three times and still uncalibrated: 0% divides into nothing, and the 6% row has no
    // Igor spend inside the instance it saw. This is Adam's own seat, to the row.
    obs({ seat: 'uncalibrated', window: 'session', percentUsed: 0, resetsAt: '2026-09-13T14:00:00.000Z' }),
    obs({ seat: 'uncalibrated', window: 'week', percentUsed: 6, resetsAt: '2026-09-18T16:00:00.000Z' }),
    obs({ seat: 'uncalibrated', window: 'week', percentUsed: 0, resetsAt: '2026-09-18T16:00:00.000Z', model: 'Fable' }),
    obs({ seat: 'calibrated', window: 'session', percentUsed: 50 }),
    obs({ seat: 'refused', window: 'session', percentUsed: 100, source: 'limit' }),
  ]
  const records = [paid('calibrated', 10), paid('declared', 31, at)]
  const bounds = boundsForSeats(observations, records, seats, NOW)
  const readings: SeatUsage[] = [
    { seat: seats[0]!, usage: parseUsage(REAL) },
    { seat: seats[1]!, error: 'seat "badtoken" names $GONE, which is not set' },
    ...seats.slice(2).map((s) => unmeasurable(s)),
  ]
  const out = renderBudget(readings, bounds, observations)
  /** The seat's own lines. A report holding eight seats matches any phrase somewhere, so every
   *  assertion here is against the lines that actually carry the id. */
  const rows = (id: string): string => out.split('\n').filter((l) => l.startsWith(id)).join('\n')

  it('reports a seat that could be read on its reading, in percent', () => {
    expect(rows('live')).toMatch(/session\s+17%\s+0%\s+83%/)
    expect(rows('live')).toContain('read live')
    expect(rows('live')).not.toContain('$')
  })

  it('tells an unreadable credential from everything a record could say about the seat', () => {
    expect(rows('badtoken')).toContain('credential unreadable')
    expect(rows('badtoken')).toContain('$GONE')
    expect(rows('badtoken')).not.toContain('never been observed')
    expect(rows('badtoken')).not.toContain('no headroom')
  })

  it('tells a seat nobody has ever observed from one that is broken', () => {
    expect(rows('virgin')).toContain('the session has never been observed')
    expect(rows('virgin')).toContain('igor observe virgin')
    expect(rows('virgin')).not.toContain('unreadable')
  })

  it('says an unreserved uncalibrated seat runs anyway, rather than reading as passed over', () => {
    expect(rows('freewheel')).toContain('never been observed')
    expect(rows('freewheel')).toContain('runs uncalibrated')
    expect(rows('freewheel')).not.toContain('Passed over')
  })

  it('tells a seat observed and still uncalibrated from one never observed — the live #38 report', () => {
    // The whole test of the change. Before it, this seat printed one line saying its credential
    // carries no subscription and nothing else, and read as broken when it is merely unbounded.
    const text = rows('uncalibrated')
    expect(text).toContain('observed 0% used at 2026-09-13T12:00:00.000Z (usage)')
    expect(text).toContain('observed 6% used at 2026-09-13T12:00:00.000Z (usage)')
    expect(text).toContain('a window 0% used divides into no capacity')
    expect(text).toContain('no Igor spend is recorded inside the instance it observed')
    expect(text).not.toContain('never been observed')
    expect(text).not.toContain('unreadable')
    // And the remedy is the one that would work: another reading changes nothing here.
    expect(text).toContain('declaring a capacity_estimate')
    expect(text).not.toContain('igor observe')
    // The per-model row it wrote is shown too, rather than disappearing off the derived path.
    expect(out).toContain('wk:Fable')
  })

  it('shows Igor spend on a window nothing bounds, a window with no figure still having cost', () => {
    // §5.1 asks for Igor spend on every window, not only on the ones a division succeeded for.
    // A reset the provider named places the instance even where no capacity came of it.
    const s: Seat = { id: 'observed-unbounded', reserve: 0.5, tokenEnv: 'T' }
    const o = obs({ seat: s.id, window: 'session', percentUsed: 0, resetsAt: '2026-09-13T14:00:00.000Z' })
    const b = boundsForSeats([o], [paid(s.id, 4, '2026-09-13T12:30:00.000Z')], [s], NOW)
    expect(b.get(s.id)?.session?.noFigure?.spentUsd).toBe(4)
    const text = renderBudget([unmeasurable(s)], b, [o])
    expect(text).toContain('$4.00')
    expect(text).toContain('divides into no capacity')
  })

  it('keeps the columns aligned when a capacity runs to four figures', () => {
    // Adam's own config declares a $3000 week, so this is the report he gets, not a hypothetical
    // one. `padStart` does not truncate: `$3000.00` in a five-wide column pushed reserve,
    // headroom and the state prose three columns right on that row and nowhere else.
    const s: Seat = { id: 'big', reserve: 0.5, tokenEnv: 'T', capacityEstimate: { week: 3000 } }
    const text = renderBudget([unmeasurable(s)], boundsForSeats([], [paid(s.id, 1200, at)], [s], NOW), [])
    const lines = text.split('\n')
    const header = lines[0]!
    const week = lines.find((l) => l.startsWith('big') && l.includes('week'))!
    expect(week).toContain('$1200.00')
    // Right-aligned columns end where their heading ends, on every row and whatever is in them.
    for (const column of ['used', 'reserve', 'headroom'] as const) {
      const cell = { used: '$1200.00', reserve: '50%', headroom: '$300.00' }[column]
      expect(week.indexOf(cell) + cell.length, column).toBe(header.indexOf(column) + column.length)
    }
  })

  it('prints a reserve as a percentage rather than as the noise of a binary multiply', () => {
    // 0.29 * 100 is 28.999999999999996, and 100 minus that carries the noise on into headroom.
    // In a report whose job is to be believed, that reads as an arithmetic bug.
    const s: Seat = { id: 'noisy', reserve: 0.29, tokenEnv: 'T' }
    for (const text of [renderBudget([unmeasurable(s)]), renderBudget([{ seat: s, usage: parseUsage(REAL) }])]) {
      expect(text).toContain('29%')
      expect(text).not.toMatch(/\d\.\d{6,}/)
    }
  })

  it('says what a spent window’s dollars rest on where no capacity figure exists', () => {
    // §5.1 again: the amount is Igor spend inside the current instance, and a row that prints it
    // beside a refusal and says nothing about it leaves the reader to guess what it is a share
    // of. A refusal on the first run of an instance leaves nothing to divide, so this is the
    // ordinary shape of a spent window, not a corner.
    const d = describeWindow(seats.find((s) => s.id === 'refused')!, 'session', bounds.get('refused')?.session)
    expect(d.state).toBe('spent')
    expect(d.used).toBe('$0.00')
    expect(d.note).toContain('the $0.00 is Igor spend inside the current instance')
    expect(d.note).toContain('no capacity figure bounds')
    expect(d.note).toContain('there is nothing to divide')
    // `spentFor` and `whyNoFigure` settled on the same reading here, and naming it twice in one
    // sentence reads as two observations.
    expect(d.note.match(/100% used at/g)).toHaveLength(1)
  })

  it('shows a derived headroom figure with the observation it rests on and that observation’s time', () => {
    // §5.1: "Headroom derived from a limit error an hour ago and headroom derived from a
    // month-old reading are not the same claim." A number alone cannot be judged.
    const text = rows('calibrated')
    expect(text).toContain('$20.00 capacity observed')
    expect(text).toContain('from 50% used at 2026-09-13T12:00:00.000Z (usage)')
    expect(text).toMatch(/\$10\.00\s+25%\s+\$5\.00/)
  })

  it('says a declared figure is declared, so an assumption is never read as a measurement', () => {
    expect(rows('declared')).toContain('capacity declared, no observation having yielded one')
    expect(rows('declared')).not.toContain('capacity observed')
    // And it is at its bound, which is a different thing again from having no figure.
    expect(rows('declared')).toContain('at its bound')
  })

  it('tells a spent seat from an uncalibrated one, and says when it is back', () => {
    const text = rows('refused')
    expect(text).toContain('spent — observed 100% used at 2026-09-13T12:00:00.000Z (limit)')
    expect(text).toContain('back at 2026-09-13T14:00:00.000Z')
    // Its week is a different state on the same seat, and says so rather than inheriting this.
    expect(text).toContain('the week has never been observed')
  })

  it('gives every state a line no other state could have produced', () => {
    // The property 5.3 asks for, asserted rather than eyeballed. Two states whose sentences
    // differ only in a number are not told apart by a reader, so the shapes are compared with
    // the numbers and instants taken out.
    const shapes = new Map<string, WindowState>()
    for (const s of seats.slice(2)) {
      for (const w of ['session', 'week'] as const) {
        const d = describeWindow(s, w, bounds.get(s.id)?.[w])
        const shape = d.note
          .replace(/\d{4}-\d{2}-\d{2}T[\d:.]+Z/g, '<at>')
          .replace(/[\d.]+/g, '<n>')
          .replace(new RegExp(`\\b(${s.id}|session|week)\\b`, 'g'), '<w>')
        const seen = shapes.get(shape)
        expect(seen ?? d.state, shape).toBe(d.state)
        shapes.set(shape, d.state)
      }
    }
    expect(new Set(shapes.values())).toEqual(
      new Set<WindowState>(['unobserved', 'unmeasured', 'bounded', 'at-bound', 'spent']),
    )
  })

  it('classifies each seat as the state it is in, and not as a neighbouring one', () => {
    const state = (id: string, w: 'session' | 'week'): WindowState | undefined =>
      describeWindow(seats.find((s) => s.id === id)!, w, bounds.get(id)?.[w]).state
    expect(state('virgin', 'session')).toBe('unobserved')
    expect(state('freewheel', 'session')).toBe('unobserved')
    expect(state('uncalibrated', 'session')).toBe('unmeasured')
    expect(state('uncalibrated', 'week')).toBe('unmeasured')
    expect(state('calibrated', 'session')).toBe('bounded')
    expect(state('declared', 'session')).toBe('at-bound')
    expect(state('refused', 'session')).toBe('spent')
    // Never observed and observed-but-unbounded are one verdict and two states: both are
    // passed over, and they are fixed by different people doing different things.
    expect(describeWindow(seats[2]!, 'session', undefined).usable).toBe(false)
    expect(describeWindow(seats[3]!, 'session', undefined).usable).toBe(true)
  })

  it('keeps the credential fault beside the derived rows rather than instead of them', () => {
    // A seat bounded by observation still has a credential nothing can read, and the two are
    // both true at once: the window rows carry the headroom, the fault gets a line of its own.
    expect(out).toContain('carries no subscription')
    expect(rows('calibrated')).toContain('$20.00 capacity observed')
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
  })

  it('reads token_file and token_command alongside token_env', () => {
    const b = parseOrgBudget({
      seats: [
        { id: 'file', reserve: 0, token_file: '/run/secrets/igor-file' },
        { id: 'cmd', reserve: 0, token_command: 'pass show igor/seat' },
      ],
    })
    expect(b.seats[0]?.tokenFile).toBe('/run/secrets/igor-file')
    expect(b.seats[1]?.tokenCommand).toBe('pass show igor/seat')
  })

  it('rejects a seat naming more than one token source', () => {
    expect(() =>
      parseOrgBudget({ seats: [{ id: 'x', reserve: 0, token_env: 'T', token_file: '/f' }] }),
    ).toThrow(/only one of token_env, token_file, token_command/)
  })

  it('rejects a pool naming a seat that does not exist', () => {
    expect(() => parseOrgBudget({ seats: [], pools: [{ id: 'eng', seats: ['ghost'] }] })).toThrow(/not declared/)
  })

  it('rejects a reserve on a dedicated seat', () => {
    expect(() => parseOrgBudget({ seats: [{ id: 'x', dedicated: true, reserve: 0.5 }] })).toThrow(/nobody is there/)
  })

  it('reads a declared capacity estimate per window as a starting figure', () => {
    const b = parseOrgBudget({ seats: [{ id: 'adam', reserve: 0.5, capacity_estimate: { session: 12, week: 250 } }] })
    expect(b.seats[0]?.capacityEstimate).toStrictEqual({ session: 12, week: 250 })
  })

  it('takes a seat declaring one window and not the other', () => {
    const b = parseOrgBudget({ seats: [{ id: 'adam', reserve: 0.5, capacity_estimate: { week: 250 } }] })
    expect(b.seats[0]).toStrictEqual({ id: 'adam', reserve: 0.5, capacityEstimate: { week: 250 } })
  })

  it('leaves the estimate unset on a seat that declares none', () => {
    const b = parseOrgBudget({ seats: [{ id: 'adam', reserve: 0.5 }] })
    expect(b.seats[0]).toStrictEqual({ id: 'adam', reserve: 0.5 })
  })

  it('rejects an estimate that names no window, rather than spending it as both', () => {
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity_estimate: 250 }] })).toThrow(
      /seat "x"\.capacity_estimate must name a window: session, week/,
    )
    // `capacity_estimate:` with nothing under it, which YAML reads as null.
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity_estimate: null }] })).toThrow(/must name a window/)
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity_estimate: {} }] })).toThrow(
      /seat "x"\.capacity_estimate names no window/,
    )
  })

  it('rejects an estimate naming something that is not a window', () => {
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity_estimate: { weekly: 250 } }] })).toThrow(
      /seat "x"\.capacity_estimate names "weekly", which is not a window/,
    )
  })

  it('rejects a declared estimate that is not a positive number of dollars', () => {
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity_estimate: { session: 0 } }] })).toThrow(
      /seat "x"\.capacity_estimate\.session must be a positive number of dollars/,
    )
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity_estimate: { week: -1 } }] })).toThrow(
      /\.capacity_estimate\.week must be/,
    )
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity_estimate: { week: '250' } }] })).toThrow(
      /\.capacity_estimate\.week must be/,
    )
  })

  it('refuses a seat key it does not know, rather than dropping it in silence', () => {
    // The retired spelling is the case that matters: dropped in silence it leaves a reserved
    // seat with no figure, passed over, and a config that looks right.
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity: { week: 250 } }] })).toThrow(
      /seat "x" names "capacity", which is not a seat key/,
    )
    expect(() => parseOrgBudget({ seats: [{ id: 'x', reserv: 0.5 }] })).toThrow(/names "reserv"/)
    // Named in full, so the message says what was meant instead without guessing at it.
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity: 1 }] })).toThrow(/capacity_estimate/)
  })

  it('takes every seat key it documents', () => {
    const every = {
      id: 'x',
      owner: 'adamstallard',
      reserve: 0.5,
      capacity_estimate: { session: 12 },
      token_command: 'pass show igor/x',
    }
    expect(() => parseOrgBudget({ seats: [every] })).not.toThrow()
    expect(() => parseOrgBudget({ seats: [{ id: 'y', dedicated: true, token_env: 'T' }] })).not.toThrow()
    expect(() => parseOrgBudget({ seats: [{ id: 'z', token_file: '/tmp/t' }] })).not.toThrow()
  })

  it('refuses a budget key it does not know', () => {
    expect(() => parseOrgBudget({ seat: [{ id: 'x' }] })).toThrow(
      /budget names "seat", which is not a budget key: seats, pools/,
    )
  })

  it('refuses a seats list that is not one, rather than enforcing nothing', () => {
    // One level up from the seat key, and the worst of the family: read as empty, a misspelt
    // or malformed `seats:` leaves every ceiling gone and nothing saying so.
    expect(() => parseOrgBudget({ seats: { id: 'x' } })).toThrow(/budget\.seats must be a list/)
    expect(() => parseOrgBudget({ seats: null })).toThrow(/budget\.seats must be a list/)
    expect(() => parseOrgBudget({ pools: 'engineering' })).toThrow(/budget\.pools must be a list/)
  })

  it('names a misspelt id key rather than reporting the id absent', () => {
    // The same order the config level keeps: "each seat needs an id" over a line reading
    // `- di: adam` sends somebody looking for a key they can see. Positional until the id is
    // known to be readable, because `seat "undefined"` names nothing.
    expect(() => parseOrgBudget({ seats: [{ di: 'adam', reserve: 0.5 }] })).toThrow(
      /budget\.seats\[0\] names "di", which is not a seat key/,
    )
    expect(() => parseOrgBudget({ seats: [{ id: 'a' }], pools: [{ ip: 'eng', seats: ['a'] }] })).toThrow(
      /budget\.pools\[0\] names "ip", which is not a pool key/,
    )
    // An id that is simply missing still says so.
    expect(() => parseOrgBudget({ seats: [{ reserve: 0.5 }] })).toThrow(/each seat needs an id/)
  })

  it('refuses a seat or a pool written as a list, rather than naming its indices as keys', () => {
    expect(() => parseOrgBudget({ seats: [['adam', 0.5]] })).toThrow(/each seat must be a mapping/)
    expect(() => parseOrgBudget({ seats: [{ id: 'a' }], pools: [['a']] })).toThrow(
      /each pool must be a mapping/,
    )
  })

  it('refuses a pool key it does not know', () => {
    expect(() => parseOrgBudget({ seats: [{ id: 'x' }], pools: [{ id: 'p', seat: ['x'] }] })).toThrow(
      /pool "p" names "seat", which is not a pool key: id, seats/,
    )
  })

  it('refuses a pool whose seats are not a list, rather than reading it as an empty pool', () => {
    expect(() => parseOrgBudget({ seats: [{ id: 'x' }], pools: [{ id: 'p', seats: 'x' }] })).toThrow(
      /pool "p"\.seats must be a list/,
    )
  })

  it('treats absent budget config as no seats rather than an error', () => {
    // The discrimination the refusals must not swallow: no budget declared is the documented
    // way to run unenforced, and only a budget that is declared and misspelt fails.
    expect(parseOrgBudget(undefined)).toEqual({ seats: [], pools: [] })
    expect(parseOrgBudget(null)).toEqual({ seats: [], pools: [] })
    expect(parseOrgBudget({})).toEqual({ seats: [], pools: [] })
    expect(parseOrgBudget({ seats: [{ id: 'x' }] }).pools).toEqual([])
  })
})

describe('a pool nobody could read is not a pool that ran out', () => {
  // #49: `kind: 'budget'` said "the budget is used up" for every way of reaching no seat. It
  // is true of one of them. The rest send their reader to look at spend when the fix is a
  // credential nobody can resolve or a reading nobody has taken.
  const org = (seats: Seat[]): OrgBudget => ({ seats, pools: [{ id: 'eng', seats: seats.map((s) => s.id) }] })
  const role = { name: 'triage', seat: 'pool:eng' }

  it('says the credential is what stopped it, not the money', () => {
    const s = seat({ id: 'adam', reserve: 0 })
    const g = budgetGate(org([s]), role, [{ seat: s, error: 'seat "adam" names $GONE, which is not set' }], [])
    expect(g.exhausted()).toBe(true)
    expect(g.blocked).toBe('credential')
    expect(g.passedOver).toEqual([{ seat: 'adam', verdict: 'credential' }])
    expect(g.reason).not.toContain('has headroom')
  })

  it('says a reserved seat with nothing to bound it is uncalibrated, not spent', () => {
    const s = seat({ id: 'adam', reserve: 0.5 })
    const g = budgetGate(org([s]), role, [{ seat: s, unmeasured: true, error: 'no subscription' }], [])
    expect(g.blocked).toBe('no-figure')
    expect(g.passedOver).toEqual([{ seat: 'adam', verdict: 'no-figure' }])
  })

  it('still calls a spent pool spent, whatever else is also wrong with it', () => {
    // One seat that really ran out makes "the budget is used up" a true sentence about the
    // pool, so the verdict it always had is the one it keeps.
    const bad = seat({ id: 'badtoken', reserve: 0 })
    const done = seat({ id: 'full', reserve: 0 })
    const g = budgetGate(
      org([bad, done]),
      role,
      [{ seat: bad, error: 'token missing' }, { seat: done, usage: usage(100, 100) }],
      [],
    )
    expect(g.blocked).toBe('spent')
    // Every passed-over seat, not only the one that won: a sentence about the pool has to be
    // true of each of them.
    expect(g.passedOver).toEqual([
      { seat: 'badtoken', verdict: 'credential' },
      { seat: 'full', verdict: 'spent' },
    ])
    expect(g.reason).toBe('no seat in "eng" has headroom')
  })

  it('leaves a gate that chose a seat carrying no verdict at all', () => {
    const s = seat({ id: 'adam', reserve: 0 })
    const g = budgetGate(org([s]), role, [{ seat: s, usage: usage(10, 10) }], [])
    expect(g.exhausted()).toBe(false)
    expect(g.blocked).toBeUndefined()
  })

  it('calls an empty pool a configuration fault too, there never having been anything to spend', () => {
    const g = budgetGate({ seats: [], pools: [{ id: 'eng', seats: [] }] }, role, [], [])
    // No seats at all is the unenforced case and must stay that; an empty *pool* is not.
    const g2 = budgetGate({ seats: [seat({ id: 'other' })], pools: [{ id: 'eng', seats: [] }] }, role, [], [])
    expect(g.exhausted()).toBe(false)
    expect(g2.exhausted()).toBe(true)
    expect(g2.blocked).toBe('absent')
    expect(g2.reason).toContain('declares no seats')
  })

  it('calls a role naming a pool nothing declares a configuration fault, not a spent budget', () => {
    const s = seat({ id: 'adam', reserve: 0 })
    const g = budgetGate(org([s]), { name: 'triage', seat: 'pool:nope' }, [{ seat: s, usage: usage(1, 1) }], [])
    expect(g.exhausted()).toBe(true)
    expect(g.blocked).toBe('absent')
  })
})

describe('the gate names the source the chosen seat pays from', () => {
  it('carries the seat token variable beside the seat id', () => {
    const org: OrgBudget = {
      seats: [
        { id: 'igor-1', tokenEnv: 'IGOR_SEAT_1', reserve: 0 },
        { id: 'adam', tokenEnv: 'IGOR_SEAT_ADAM', reserve: 0 },
      ],
      pools: [{ id: 'eng', seats: ['igor-1', 'adam'] }],
    }
    const readings: SeatUsage[] = org.seats.map((seat) => ({ seat, usage: usage(10, 10) }))
    expect(budgetGate(org, { name: 'triage', seat: 'eng' }, readings, []).token?.tokenEnv).toBe('IGOR_SEAT_1')
  })

  it('carries a token_file or token_command just as well', () => {
    const org: OrgBudget = {
      seats: [{ id: 'igor-1', tokenFile: '/run/secrets/igor', reserve: 0 }],
      pools: [{ id: 'eng', seats: ['igor-1'] }],
    }
    const gate = budgetGate(org, { name: 'triage', seat: 'eng' }, [{ seat: org.seats[0]!, usage: usage(10, 10) }], [])
    expect(gate.token).toEqual({ tokenFile: '/run/secrets/igor' })
  })

  it('names nothing where the chosen seat declares no source', () => {
    const org: OrgBudget = { seats: [{ id: 'igor-1', reserve: 0 }], pools: [{ id: 'eng', seats: ['igor-1'] }] }
    const gate = budgetGate(org, { name: 'triage', seat: 'eng' }, [{ seat: org.seats[0]!, usage: usage(10, 10) }], [])
    expect(gate.token?.tokenEnv).toBeUndefined()
    expect(gate.token?.tokenFile).toBeUndefined()
    expect(gate.token?.tokenCommand).toBeUndefined()
  })
})

describe('a seat nothing can read is bounded by observation and record', () => {
  // One session instance, 09:00 → 14:00, observed half gone at 12:00. Ten dollars of Igor
  // spend inside it by then, so the capacity that implies is $20.
  const RESET = '2026-09-13T14:00:00.000Z'
  const OBSERVED_AT = '2026-09-13T12:00:00.000Z'
  const NOW = '2026-09-13T13:00:00.000Z'

  const sessionObs = (over: Partial<Observation> = {}): Observation => ({
    at: OBSERVED_AT,
    seat: 'adam',
    window: 'session',
    percentUsed: 50,
    resetsAt: RESET,
    source: 'usage',
    ...over,
  })
  /** Generous on purpose: these cases are about the session, and a blocked week would hide it. */
  const weekObs = (seatId = 'adam'): Observation => ({
    at: OBSERVED_AT,
    seat: seatId,
    window: 'week',
    percentUsed: 5,
    resetsAt: '2026-09-18T00:00:00.000Z',
    source: 'usage',
  })
  const paid = (at: string, usd: number, role?: string, seatId = 'adam'): SpendRecord => ({
    seat: seatId,
    costUsd: usd,
    at,
    ...(role === undefined ? {} : { role }),
  })
  /** The #30 seat: its credential answers and carries no subscription, so a window will never
   *  be reported against it. That is every seat in the configuration in use. */
  const unreadable = (s: Seat): SeatUsage => ({
    seat: s,
    error: 'seat "adam" is authenticated as oauth_token but its credential carries no subscription',
    unmeasured: true,
  })
  const choose = (
    s: Seat,
    obs: Observation[],
    records: SpendRecord[],
    role: { name: string; budgetShare?: number } = { name: 'triage' },
  ) =>
    chooseSeat({ id: 'p', seats: [s.id] }, [unreadable(s)], records, role, boundsForSeats(obs, records, [s], NOW))

  it('stops the seat at (1 − reserve) × capacity with the owner never observed', () => {
    // Capacity $20, reserve a quarter of it, so Igors may have $15 and have taken $16.
    const s = seat({ reserve: 0.25 })
    const records = [paid('2026-09-13T11:00:00.000Z', 10), paid('2026-09-13T12:30:00.000Z', 6)]
    const c = choose(s, [sessionObs(), weekObs()], records)
    expect(c.seat).toBeUndefined()
    expect(c.considered[0]?.why).toMatch(/spent \$16\.00 of the session's \$15\.00 bound/)
  })

  it('leaves the seat usable while the bound has room, and says how much', () => {
    const s = seat({ reserve: 0.25 })
    const c = choose(s, [sessionObs(), weekObs()], [paid('2026-09-13T11:00:00.000Z', 10)])
    expect(c.seat?.id).toBe('adam')
    expect(c.reason).toBe('adam has $5.00 of its session bound left')
  })

  it('does not let spend after the observation inflate the capacity it is measured against', () => {
    // The trap: recompute the capacity over the same interval the bound sums and the spend
    // cancels out of `spend ≥ (1 − reserve) × capacity`, so no amount of spending ever crosses
    // it. The numerator stops at the observation; the bound's sum runs to now.
    const s = seat({ reserve: 0.25 })
    const before = [paid('2026-09-13T11:00:00.000Z', 10)]
    const after = [...before, paid('2026-09-13T12:30:00.000Z', 6)]
    const bounds = boundsForSeats([sessionObs(), weekObs()], after, [s], NOW)
    expect(bounds.get('adam')?.session?.capacity?.capacityUsd).toBe(20)
    expect(bounds.get('adam')?.session?.capacity?.spentUsd).toBe(16)
    expect(choose(s, [sessionObs(), weekObs()], before).seat?.id).toBe('adam')
    expect(choose(s, [sessionObs(), weekObs()], after).seat).toBeUndefined()
  })

  it('sums two Igors against one bound and gives neither the whole of it', () => {
    const s = seat({ reserve: 0.25 })
    const obs = [sessionObs(), weekObs()]
    const triageOnly = [paid('2026-09-13T11:00:00.000Z', 10, 'triage')]
    const both = [...triageOnly, paid('2026-09-13T12:30:00.000Z', 6, 'docs')]
    // $15 is there for either of them while the other has not taken it.
    expect(choose(s, obs, triageOnly, { name: 'docs' }).seat?.id).toBe('adam')
    // Once both have spent, the same $15 is gone for both, not $15 each.
    expect(choose(s, obs, both, { name: 'docs' }).seat).toBeUndefined()
    expect(choose(s, obs, both, { name: 'triage' }).seat).toBeUndefined()
  })

  it('counts only the current instance, not spend that has already reset', () => {
    // $30 in the instance before this one, which ended at 09:00 and bounds nothing now.
    const s = seat({ reserve: 0.25 })
    const records = [paid('2026-09-13T08:00:00.000Z', 30), paid('2026-09-13T11:00:00.000Z', 10)]
    const c = choose(s, [sessionObs(), weekObs()], records)
    expect(c.seat?.id).toBe('adam')
  })

  it('does not pass a seat over on the unreadable ground alone', () => {
    const s = seat({ reserve: 0.25 })
    const c = choose(s, [sessionObs(), weekObs()], [paid('2026-09-13T11:00:00.000Z', 10)])
    expect(c.considered[0]?.why).toBe('chosen')
    expect(c.considered.some((x) => /token/.test(x.why))).toBe(false)
  })

  it('passes a reserved seat over where no capacity figure exists, in words of its own', () => {
    const c = choose(seat({ reserve: 0.5 }), [], [])
    expect(c.seat).toBeUndefined()
    expect(c.considered[0]?.why).toContain(NO_CAPACITY_FIGURE)
    // "never observed" and "bad token" are fixed by different people, so they read differently.
    expect(c.considered[0]?.why).not.toContain('IGOR_SEAT_ADAM')
    expect(c.considered[0]?.why).not.toBe(unreadable(seat()).error)
  })

  it('tells a reserved seat observed and still unbounded from one never observed', () => {
    // Both are passed over for the same verdict and they are not the same news. One wants a
    // reading taken; the other has had three and wants spend inside an instance, or a declared
    // capacity. Sending its owner to `igor observe` is sending them to repeat themselves.
    const s = seat({ reserve: 0.25 })
    const c = choose(s, [sessionObs({ percentUsed: 0 }), weekObs()], [])
    expect(c.seat).toBeUndefined()
    expect(c.considered[0]?.why).toContain(NO_CAPACITY_FIGURE)
    expect(c.considered[0]?.why).toContain(`observed at ${OBSERVED_AT}`)
    expect(c.considered[0]?.why).not.toContain('never been observed')
    expect(c.considered[0]?.verdict).toBe('no-figure')
  })

  it('runs a seat with no reserve and no figure at all, uncalibrated', () => {
    const c = choose(seat({ id: 'adam', dedicated: true, reserve: 0 }), [], [])
    expect(c.seat?.id).toBe('adam')
    expect(c.reason).toMatch(/uncalibrated/)
  })

  it('blocks on a window it cannot bound even when the other one is calibrated', () => {
    // Two limits exist because they are not proportional: a session figure says nothing about
    // the week, and a reserve over an unknown week bounds nothing.
    const s = seat({ reserve: 0.25 })
    const c = choose(s, [sessionObs()], [paid('2026-09-13T11:00:00.000Z', 10)])
    expect(c.seat).toBeUndefined()
    expect(c.considered[0]?.why).toContain('its week has never been observed')
  })

  it('lets an unreserved seat run on one window and no figure for the other', () => {
    const s = seat({ id: 'adam', dedicated: true, reserve: 0 })
    const c = choose(s, [sessionObs()], [paid('2026-09-13T11:00:00.000Z', 10)])
    expect(c.seat?.id).toBe('adam')
  })

  it('holds a role to its budget_share on the derived path too', () => {
    // Nine of the ten dollars are triage's, so triage is at 45% of a $20 capacity where its
    // ceiling is 40%. Skipping the check here would have made the ceiling readable-seats-only.
    const s = seat({ reserve: 0 })
    const records = [paid('2026-09-13T11:00:00.000Z', 9, 'triage'), paid('2026-09-13T11:30:00.000Z', 1, 'docs')]
    const obs = [sessionObs(), weekObs()]
    const c = choose(s, obs, records, { name: 'triage', budgetShare: 0.4 })
    expect(c.considered[0]?.why).toMatch(/at its 0.4 ceiling/)
    expect(choose(s, obs, records, { name: 'docs', budgetShare: 0.4 }).seat?.id).toBe('adam')
  })

  it('is never the pool’s fallback once the dedicated seats are spent', () => {
    const fleet = seat({ id: 'fleet-1', dedicated: true, reserve: 0 })
    const adam = seat({ reserve: 0.5 })
    const readings: SeatUsage[] = [{ seat: fleet, usage: usage(100, 100) }, unreadable(adam)]
    const c = chooseSeat({ id: 'eng', seats: ['fleet-1', 'adam'] }, readings, [], { name: 'triage' })
    expect(c.seat).toBeUndefined()
    expect(c.considered[1]?.why).toContain(NO_CAPACITY_FIGURE)
    const gate = budgetGate({ seats: [fleet, adam], pools: [{ id: 'eng', seats: ['fleet-1', 'adam'] }] },
      { name: 'triage', seat: 'pool:eng' }, readings, [])
    expect(gate.exhausted()).toBe(true)
  })

  it('passes over every seat whose credential is in doubt, bound or no bound', () => {
    // A bound says what a seat may spend; it does not give it anything to spend with. Chosen,
    // such a seat claims an item, fails on the worker's spawn, and does the same next cycle.
    // Only a credential that answered and reported no window gets the derived path.
    const obs = [sessionObs(), weekObs()]
    const records = [paid('2026-09-13T11:00:00.000Z', 10)]
    for (const [why, s] of [
      ['its token is not set', seat({ reserve: 0 })],
      ['the provider rejected it', seat({ reserve: 0.25 })],
    ] as const) {
      const readings: SeatUsage[] = [{ seat: s, error: why }]
      const c = chooseSeat({ id: 'p', seats: ['adam'] }, readings, records, { name: 'triage' },
        boundsForSeats(obs, records, [s], NOW))
      expect(c.seat, why).toBeUndefined()
      expect(c.considered[0]?.why).toBe(why)
    }
  })

  it('tells a credential that carries no subscription from one that failed', async () => {
    // The join: only the first is marked, and only the marked one reaches the bounded path.
    const noSubscription = await readAllSeats(
      [seat({ id: 'no-sub', reserve: 0 })],
      {},
      async () => 'Total cost: $1.23',
      async () => ({ authMethod: 'oauth_token' }),
    )
    expect(noSubscription[0]?.unmeasured).toBe(true)

    const noToken = await readAllSeats([seat({ id: 'no-token', reserve: 0, tokenEnv: 'NOPE' })], {}, async () => REAL)
    expect(noToken[0]?.error).toMatch(/is not set/)
    expect(noToken[0]?.unmeasured).toBeUndefined()
  })

  it('leaves a seat that could be read judged on its reading alone', () => {
    // The live path is above the branch and the derived figures must not reach it: this seat
    // is 17% used against a 50% reserve, and no dollar bound says otherwise.
    const s = seat({ reserve: 0.5 })
    const records = [paid('2026-09-13T11:00:00.000Z', 10), paid('2026-09-13T12:30:00.000Z', 99)]
    const bounds = boundsForSeats([sessionObs(), weekObs()], records, [s], NOW)
    const c = chooseSeat({ id: 'p', seats: ['adam'] }, [{ seat: s, usage: usage(17, 17) }], records, { name: 'triage' }, bounds)
    expect(c.seat?.id).toBe('adam')
    expect(c.reason).toBe('adam has 33% of the session left')
  })
})

describe('a seat the provider refused is spent until it resets', () => {
  const REFUSED_AT = '2026-09-13T12:00:00.000Z'
  const RESET = '2026-09-13T14:00:00.000Z'
  const NOW = '2026-09-13T13:00:00.000Z'

  const seat = (over: Partial<Seat> = {}): Seat => ({ id: 'adam', owner: 'adam', reserve: 0, ...over })
  const unreadable = (s: Seat): SeatUsage => ({ seat: s, error: 'its credential carries no subscription', unmeasured: true })
  const paid = (at: string, usd: number): SpendRecord => ({ seat: 'adam', costUsd: usd, at })
  const refusal = (over: Partial<Observation> = {}): Observation => ({
    at: REFUSED_AT, seat: 'adam', window: 'session', percentUsed: 100, resetsAt: RESET, source: 'limit', ...over,
  })
  const weekObs = (): Observation => ({
    at: REFUSED_AT, seat: 'adam', window: 'week', percentUsed: 5, resetsAt: '2026-09-18T00:00:00.000Z', source: 'usage',
  })
  const choose = (s: Seat, obs: Observation[], records: SpendRecord[], now = NOW) =>
    chooseSeat({ id: 'p', seats: [s.id] }, [unreadable(s)], records, { name: 'triage' },
      boundsForSeats(obs, records, [s], now))
  const gate = (s: Seat, obs: Observation[], records: SpendRecord[], now = NOW) =>
    budgetGate({ seats: [s], pools: [{ id: 'p', seats: [s.id] }] }, { name: 'triage', seat: 'pool:p' },
      [unreadable(s)], records, boundsForSeats(obs, records, [s], now), now)

  it('passes over a seat refused a minute ago, with nothing in the instance to divide', () => {
    // The refused run recorded no cost, so the derived arithmetic has no capacity to compare
    // against and the seat reads as one nobody has ever measured. Without the scan it is
    // chosen, told it is uncalibrated, and refused again.
    const c = choose(seat(), [refusal(), weekObs()], [])
    expect(c.seat).toBeUndefined()
    expect(c.considered[0]?.why).toContain('its session was 100% used when observed at')
    expect(c.considered[0]?.why).toContain(RESET)
  })

  it('tells a reserved seat that was refused from one never observed at all', () => {
    // Both were passed over; only one of them is waiting on a reading.
    const c = choose(seat({ reserve: 0.25 }), [refusal(), weekObs()], [])
    expect(c.considered[0]?.why).not.toContain(NO_CAPACITY_FIGURE)
    expect(c.considered[0]?.why).toContain('100% used when observed')
  })

  it('is not talked round by a later reading of the same unrefreshed window', () => {
    // Newest-wins settles which capacity figure to believe. It does not settle whether the
    // provider refused, which is not an estimate and did not stop being true.
    const later: Observation = {
      at: '2026-09-13T12:01:00.000Z', seat: 'adam', window: 'session', percentUsed: 50, resetsAt: RESET, source: 'usage',
    }
    const c = choose(seat(), [refusal(), later, weekObs()], [paid('2026-09-13T11:00:00.000Z', 10)])
    expect(c.seat).toBeUndefined()
  })

  it('holds a refusal that named no reset for one window length, then lets the seat run', () => {
    const noReset = (): Observation => {
      const { resetsAt, ...rest } = refusal()
      return rest
    }
    expect(choose(seat(), [noReset(), weekObs()], []).seat).toBeUndefined()
    expect(choose(seat(), [noReset(), weekObs()], [], '2026-09-13T17:00:00.000Z').seat?.id).toBe('adam')
  })

  it('lets the seat run again on the next cycle, with nothing having been run to clear it', () => {
    // One log, two cycles, and only `now` differs between them. An expiry computed anywhere
    // but at the moment of the comparison survives the first of these and fails the second.
    const obs = [refusal(), weekObs()]
    expect(choose(seat(), obs, [], '2026-09-13T13:59:59.999Z').seat).toBeUndefined()
    expect(choose(seat(), obs, [], RESET).seat?.id).toBe('adam')
  })

  it('states the reset recorded with the observation when it hands off', () => {
    const g = gate(seat(), [refusal(), weekObs()], [])
    expect(g.exhausted()).toBe(true)
    expect(g.resetAt).toBe(RESET)
    expect(g.resetApproximate).toBeUndefined()
  })

  it('states the cadence ceiling, marked as one, where the provider named no reset', () => {
    const { resetsAt, ...noReset } = refusal()
    const g = gate(seat(), [noReset, weekObs()], [])
    expect(g.resetAt).toBe('2026-09-13T17:00:00.000Z')
    expect(g.resetApproximate).toBe(true)
  })

  it('states the later reset where both windows are shut, not the first one to open', () => {
    // A seat back in the session at 14:00 and in the week on Friday is back on Friday.
    const weekRefusal: Observation = { ...refusal(), window: 'week', resetsAt: '2026-09-18T00:00:00.000Z' }
    expect(gate(seat(), [refusal(), weekRefusal], []).resetAt).toBe('2026-09-18T00:00:00.000Z')
  })

  it('states the earliest of the seats, since the first seat back is the first Igor back', () => {
    const adam = seat()
    const sam = seat({ id: 'sam', owner: 'sam' })
    const samRefusal: Observation = { ...refusal(), seat: 'sam', resetsAt: '2026-09-13T13:30:00.000Z' }
    const g = budgetGate(
      { seats: [adam, sam], pools: [{ id: 'p', seats: ['adam', 'sam'] }] },
      { name: 'triage', seat: 'pool:p' },
      [unreadable(adam), unreadable(sam)],
      [],
      boundsForSeats([refusal(), weekObs(), samRefusal], [], [adam, sam], NOW),
    )
    expect(g.exhausted()).toBe(true)
    expect(g.resetAt).toBe('2026-09-13T13:30:00.000Z')
  })

  it('states the current instance’s reset for a seat stopped by the derived bound', () => {
    // Nothing refused this seat: it reached `(1 − reserve) × capacity`. The reset was already
    // computed and was reaching nobody, so the handoff said only that it had stopped.
    const s = seat({ reserve: 0.25 })
    const observed: Observation = { ...refusal(), percentUsed: 50, source: 'usage' }
    const records = [paid('2026-09-13T11:00:00.000Z', 10), paid('2026-09-13T12:30:00.000Z', 6)]
    expect(choose(s, [observed, weekObs()], records).considered[0]?.why).toMatch(
      /spent \$16\.00 of the session's \$15\.00 bound/,
    )
    const g = gate(s, [observed, weekObs()], records)
    expect(g.exhausted()).toBe(true)
    expect(g.resetAt).toBe(RESET)
    expect(g.resetApproximate).toBeUndefined()
  })

  it('says nothing about a return for a seat that is not waiting on one', () => {
    // A seat with no capacity figure is waiting on a reading, not on a clock, and a handoff
    // that named an hour would be inventing one.
    const g = gate(seat({ reserve: 0.5 }), [], [])
    expect(g.exhausted()).toBe(true)
    expect(g.resetAt).toBeUndefined()
  })

  it('states the reset of what is actually blocking, not of a later instance', () => {
    // Two refusals in a row, the first with nothing spent after it: the capacity still comes
    // from the older one, whose instance has been stepped forward past the live refusal's
    // reset. The seat is released when the refusal expires, so that is the hour to state.
    const first = refusal({ at: '2026-09-13T09:00:00.000Z', resetsAt: '2026-09-13T13:30:00.000Z' })
    const second = refusal({ at: '2026-09-13T13:35:00.000Z', resetsAt: '2026-09-13T15:00:00.000Z' })
    const records = [paid('2026-09-13T08:45:00.000Z', 10)]
    const at14 = '2026-09-13T14:00:00.000Z'
    expect(gate(seat(), [first, second, weekObs()], records, at14).resetAt).toBe('2026-09-13T15:00:00.000Z')
    // And the seat really is back then, which is what makes the later hour a false promise.
    expect(choose(seat(), [first, second, weekObs()], records, '2026-09-13T15:00:01.000Z').seat?.id).toBe('adam')
  })

  it('keeps a cadence ceiling marked as one when an older instance reaches further out', () => {
    const first = refusal({ at: '2026-09-13T09:00:00.000Z', resetsAt: '2026-09-13T13:30:00.000Z' })
    const { resetsAt, ...second } = refusal({ at: '2026-09-13T12:00:00.000Z' })
    const records = [paid('2026-09-13T08:45:00.000Z', 10)]
    const g = gate(seat(), [first, second, weekObs()], records, '2026-09-13T14:00:00.000Z')
    expect(g.resetAt).toBe('2026-09-13T17:00:00.000Z')
    expect(g.resetApproximate).toBe(true)
  })

  it('does not let a readable seat that is not out of headroom answer for the pool', () => {
    // A seat passed over for a role's own ceiling is not waiting on a reset, and its reading's
    // reset phrase is not an answer to when the pool is back. The instant the refused seat is
    // waiting on was in `bounds` and was being thrown away.
    const fleet = seat({ id: 'fleet-1', owner: 'fleet' })
    const adam = seat()
    const readings: SeatUsage[] = [
      unreadable(fleet),
      { seat: adam, usage: { session: { percentUsed: 10, resetsAt: 'Sep 13 at 8pm (America/Los_Angeles)' }, week: { percentUsed: 10 }, perModel: [] } },
    ]
    const fleetRefusal: Observation = { ...refusal(), seat: 'fleet-1', at: '2026-09-13T11:00:00.000Z', resetsAt: '2026-09-13T12:00:00.000Z' }
    const now = '2026-09-13T11:30:00.000Z'
    const g = budgetGate(
      { seats: [fleet, adam], pools: [{ id: 'p', seats: ['fleet-1', 'adam'] }] },
      { name: 'triage', seat: 'pool:p', budgetShare: 0.05 },
      readings,
      [{ seat: 'adam', costUsd: 5, at: '2026-09-13T11:00:00.000Z', role: 'triage' }],
      boundsForSeats([fleetRefusal], [], [fleet, adam], now),
    )
    expect(g.exhausted()).toBe(true)
    expect(g.resetAt).toBe('2026-09-13T12:00:00.000Z')
  })

  it('states the reset of the window that shut a readable seat, not always the session’s', () => {
    // Late in the week the session is fine and the week is gone. Both resets are in the same
    // reading; naming the session's puts the return days early.
    const s = seat({ reserve: 0.2 })
    const g = budgetGate(
      { seats: [s], pools: [{ id: 'p', seats: ['adam'] }] },
      { name: 'triage', seat: 'pool:p' },
      [{ seat: s, usage: {
        session: { percentUsed: 10, resetsAt: 'Sep 13 at 8pm (America/Los_Angeles)' },
        week: { percentUsed: 80, resetsAt: 'Sep 20 at 9am (America/Los_Angeles)' },
        perModel: [],
      } }],
      [],
    )
    expect(g.exhausted()).toBe(true)
    expect(g.resetAt).toBe('Sep 20 at 9am (America/Los_Angeles)')
  })

  // The boundary the bound sums inside is tiled from the reset the provider last named, and
  // never from whichever row the spend log happens to make divisible.
  describe('the instance is anchored by the provider, not by the spend log', () => {
    const placed = refusal({ at: '2026-09-13T09:00:00.000Z', resetsAt: '2026-09-13T13:40:00.000Z' })
    const later = refusal({ at: '2026-09-13T13:35:00.000Z', resetsAt: '2026-09-13T15:00:00.000Z' })
    const obs = [placed, later]
    const base = [paid('2026-09-13T08:45:00.000Z', 10), paid('2026-09-13T13:45:00.000Z', 30)]
    // One dollar, 95 minutes before the last reading, in an instance nobody is asking about.
    const andOneMore = [...base, paid('2026-09-13T13:00:00.000Z', 1)]

    it('states the same return whether or not an unrelated dollar landed earlier', () => {
      const at14 = '2026-09-13T14:00:00.000Z'
      expect(gate(seat(), obs, base, at14).resetAt).toBe('2026-09-13T15:00:00.000Z')
      expect(gate(seat(), obs, andOneMore, at14).resetAt).toBe('2026-09-13T15:00:00.000Z')
    })

    it('never brings the seat back sooner for having spent more on it', () => {
      // A bound spending relaxes is not a bound. More spend may hold a seat longer; it may
      // never hand it back earlier.
      for (const records of [base, andOneMore]) {
        expect(choose(seat(), obs, records, '2026-09-13T14:59:59.999Z').seat).toBeUndefined()
        expect(choose(seat(), obs, records, '2026-09-13T15:00:01.000Z').seat?.id).toBe('adam')
      }
    })
  })

  it('does not promise the refusal’s hour where the sum is still over its bound then', () => {
    // The refusal holding the seat named no reset, so it is held for a cadence — to 15:00 —
    // while the instance the sum is taken over runs to 18:40. The window is open when the later
    // of the two clears, and stating the earlier one is a return the seat does not keep.
    const placed = refusal({ at: '2026-09-13T09:00:00.000Z', resetsAt: '2026-09-13T13:40:00.000Z' })
    const { resetsAt, ...unplaced } = refusal({ at: '2026-09-13T10:00:00.000Z' })
    // A run already in flight when the seat was last passed lands after both observations.
    const records = [paid('2026-09-13T08:45:00.000Z', 10), paid('2026-09-13T13:45:00.000Z', 30)]
    const at14 = '2026-09-13T14:00:00.000Z'
    expect(gate(seat(), [placed, unplaced], records, at14).resetAt).toBe('2026-09-13T18:40:00.000Z')
    // The seat really is still shut at the hour the refusal expires, which is what makes it one.
    expect(choose(seat(), [placed, unplaced], records, '2026-09-13T15:00:01.000Z').seat).toBeUndefined()
  })

  it('says nothing rather than promise an hour a rolling bound cannot keep', () => {
    // Nothing this seat has been observed for named a reset, so there is no boundary to tile
    // from and its sum clears at a moment nothing here can name. The refusal's own hour — a
    // cadence ceiling — is not an answer for a seat the arithmetic will still be holding.
    const s = seat({ capacityEstimate: { session: 10 } })
    const { resetsAt, ...unplaced } = refusal({ at: '2026-09-13T12:00:00.000Z' })
    const records = [paid('2026-09-13T12:50:00.000Z', 12)]
    const g = gate(s, [unplaced], records, '2026-09-13T13:00:00.000Z')
    expect(g.exhausted()).toBe(true)
    expect(g.resetAt).toBeUndefined()
  })

  it('leaves the seat whose return nothing knows out of the earliest-reset race', () => {
    // Earliest across the pool is what makes an unknowable return dangerous: contributed as the
    // refusal's own hour it wins the race, and the pool is then promised the one seat whose
    // hour means nothing over a pool-mate whose hour is real.
    const rolling = seat({ capacityEstimate: { session: 10 } })
    const clocked = seat({ id: 'sam', owner: 'sam' })
    const records = [paid('2026-09-13T12:50:00.000Z', 12)]
    // Nothing has ever named a reset for `adam`, so its bound has no boundary to clear at.
    const { resetsAt, ...unplaced } = refusal()
    const g = budgetGate(
      { seats: [rolling, clocked], pools: [{ id: 'p', seats: ['adam', 'sam'] }] },
      { name: 'triage', seat: 'pool:p' },
      [unreadable(rolling), unreadable(clocked)],
      records,
      boundsForSeats(
        [unplaced, refusal({ seat: 'sam', resetsAt: RESET })],
        records,
        [rolling, clocked],
        '2026-09-13T13:00:00.000Z',
      ),
      '2026-09-13T13:00:00.000Z',
    )
    expect(g.exhausted()).toBe(true)
    expect(g.resetAt).toBe(RESET)
  })

  it('does not answer for this pool with a seat outside it', () => {
    // The reset belongs to whichever seat carries it, and a readable seat elsewhere in the
    // configuration says nothing about when this pool is back.
    const adam = seat()
    const other = seat({ id: 'fleet-1', owner: 'fleet' })
    const readings: SeatUsage[] = [
      unreadable(adam),
      { seat: other, usage: { session: { percentUsed: 100, resetsAt: '8pm' }, week: { percentUsed: 100 }, perModel: [] } },
    ]
    const g = budgetGate(
      { seats: [adam, other], pools: [{ id: 'p', seats: ['adam'] }] },
      { name: 'triage', seat: 'pool:p' },
      readings,
      [],
      boundsForSeats([refusal(), weekObs()], [], [adam], NOW),
    )
    expect(g.resetAt).toBe(RESET)
  })

  it('says nothing where the window that shut a readable seat named no reset', () => {
    // The week is shut and gave no reset; the session's is an hour away and is not this seat's
    // return. Stating it promises a seat back within the hour that the week holds for days.
    const s = seat()
    const g = budgetGate(
      { seats: [s], pools: [{ id: 'p', seats: ['adam'] }] },
      { name: 'triage', seat: 'pool:p' },
      [{ seat: s, usage: {
        session: { percentUsed: 100, resetsAt: 'Sep 13 at 2pm (America/Los_Angeles)' },
        week: { percentUsed: 100 },
        perModel: [],
      } }],
      [],
    )
    expect(g.exhausted()).toBe(true)
    expect(g.resetAt).toBeUndefined()
  })

  it('hedges the hour where the week was preferred over a session nothing can order it against', () => {
    // Both windows are shut and the week is taken on preference, not on a comparison. Inside
    // the last session of a week the session is the later of the two, so the stated hour can
    // be early — a figure to hedge rather than a return to promise.
    const s = seat()
    const g = budgetGate(
      { seats: [s], pools: [{ id: 'p', seats: ['adam'] }] },
      { name: 'triage', seat: 'pool:p' },
      [{ seat: s, usage: {
        session: { percentUsed: 100, resetsAt: 'Sep 13 at 8pm (America/Los_Angeles)' },
        week: { percentUsed: 100, resetsAt: 'Sep 13 at 5pm (America/Los_Angeles)' },
        perModel: [],
      } }],
      [],
    )
    expect(g.resetAt).toBe('Sep 13 at 5pm (America/Los_Angeles)')
    expect(g.resetApproximate).toBe(true)
  })

  it('states a stated hour flatly where one window shut the seat on its own', () => {
    const s = seat()
    const g = budgetGate(
      { seats: [s], pools: [{ id: 'p', seats: ['adam'] }] },
      { name: 'triage', seat: 'pool:p' },
      [{ seat: s, usage: {
        session: { percentUsed: 100, resetsAt: 'Sep 13 at 8pm (America/Los_Angeles)' },
        week: { percentUsed: 10 },
        perModel: [],
      } }],
      [],
    )
    expect(g.resetAt).toBe('Sep 13 at 8pm (America/Los_Angeles)')
    expect(g.resetApproximate).toBeUndefined()
  })

  // The first seat back is the first Igor back, whichever seat it is and however its hour was
  // arrived at. Pinned in both directions: a rule that always prefers one kind of figure states
  // a return the pool does not keep on exactly the inputs the other kind gets right.
  describe('the pool is back on the earliest hour any of its seats has', () => {
    const refused = seat()
    const readable = seat({ id: 'sam', owner: 'sam' })
    const bothShut = (weekReset: string) =>
      budgetGate(
        { seats: [readable, refused], pools: [{ id: 'p', seats: ['sam', 'adam'] }] },
        { name: 'triage', seat: 'pool:p' },
        [
          { seat: readable, usage: {
            session: { percentUsed: 10 },
            week: { percentUsed: 100, resetsAt: weekReset },
            perModel: [],
          } },
          unreadable(refused),
        ],
        [],
        boundsForSeats([refusal(), weekObs()], [], [refused], NOW),
        NOW,
      )

    it('states the derived pool-mate’s hour where the reading is days out', () => {
      // The reading is this cycle's truth about `sam`, and says nothing about `adam`, who is
      // back within the hour. Answering `sam`'s Friday leaves the pool idle for five days.
      const g = bothShut('Sep 18 at 9am (America/Los_Angeles)')
      expect(g.exhausted()).toBe(true)
      expect(g.resetAt).toBe(RESET)
    })

    it('states the reading’s own words where the reading is the earlier', () => {
      // Resolved only to be ordered. What the handoff says is the phrase the provider printed,
      // not this module's rendering of the instant behind it.
      const g = bothShut('Sep 13 at 6:30am (America/Los_Angeles)')
      expect(g.resetAt).toBe('Sep 13 at 6:30am (America/Los_Angeles)')
    })

    it('takes the seat whose stated hour has just gone by over one still hours out', () => {
      // A reading is a snapshot taken before the gate runs, so the hour it names can already
      // have passed — that seat is back now and is the pool's answer. Reading the phrase from
      // `now` forward makes it next year's date instead, and the seat that is back loses every
      // race it should win.
      const back = seat({ id: 'sam', owner: 'sam' })
      const out = seat()
      const shutWeek = (s: Seat, resetsAt: string): SeatUsage => ({
        seat: s,
        usage: { session: { percentUsed: 10 }, week: { percentUsed: 100, resetsAt }, perModel: [] },
      })
      const g = budgetGate(
        { seats: [back, out], pools: [{ id: 'p', seats: ['sam', 'adam'] }] },
        { name: 'triage', seat: 'pool:p' },
        // 5:30am Pacific is 12:30Z, half an hour before `now`; 9am the next day is 16:00Z.
        [shutWeek(back, 'Sep 13 at 5:30am (America/Los_Angeles)'), shutWeek(out, 'Sep 14 at 9am (America/Los_Angeles)')],
        [],
        new Map(),
        NOW,
      )
      expect(g.exhausted()).toBe(true)
      expect(g.resetAt).toBe('Sep 13 at 5:30am (America/Los_Angeles)')
    })

    it('leaves a phrase nothing can place out of the race rather than ordering it on its text', () => {
      // `"next Friday morning"` sorts before every ISO instant as a string and is not a moment
      // at all. A placeable hour about another seat beats it: the handoff can say how long that
      // one is, where the phrase renders bare.
      const g = bothShut('next Friday morning')
      expect(g.resetAt).toBe(RESET)
    })
  })

  it('states a shut week’s hour though the session that also shut the seat named none', () => {
    // The seat returns on the later of its two shut windows. The week's is stated; the
    // session's is unknown but at most a cadence out, so the week is either the later of the
    // two or under five hours early — the same error the week preference already carries, and
    // hedged the same way. Dropping it answers "not known" for an hour the reading gave.
    const s = seat()
    const g = budgetGate(
      { seats: [s], pools: [{ id: 'p', seats: ['adam'] }] },
      { name: 'triage', seat: 'pool:p' },
      [{ seat: s, usage: {
        session: { percentUsed: 100 },
        week: { percentUsed: 100, resetsAt: 'Sep 18 at 4pm (America/Los_Angeles)' },
        perModel: [],
      } }],
      [],
    )
    expect(g.resetAt).toBe('Sep 18 at 4pm (America/Los_Angeles)')
    expect(g.resetApproximate).toBe(true)
  })

  it('leaves a seat that could be read judged on its reading, refusal or no refusal', () => {
    // The live figure is this cycle's; the observation is a snapshot of some earlier one.
    const s = seat()
    const bounds = boundsForSeats([refusal(), weekObs()], [], [s], NOW)
    const c = chooseSeat({ id: 'p', seats: ['adam'] }, [{ seat: s, usage: usage(17, 17) }], [], { name: 'triage' }, bounds)
    expect(c.seat?.id).toBe('adam')
  })
})

describe('regression: what the hunt on §5 found', () => {
  const NOW = '2026-09-13T13:00:00.000Z'
  const obs = (over: Partial<Observation>): Observation =>
    ({ at: '2026-09-13T12:00:00.000Z', seat: 'adam', window: 'session', percentUsed: 50,
       resetsAt: '2026-09-13T14:00:00.000Z', source: 'usage', ...over })

  it('does not say nothing was spent about a pool holding a seat that was read and spent', () => {
    // One seat's token did not resolve; the other was read fine and was passed over for the
    // role's own ceiling. "No seat's usage could be read" is false of the second, and so is
    // "nothing was spent" — it is the ceiling on Igor spend that stopped it.
    const a: Seat = { id: 'a', reserve: 0, tokenEnv: 'GONE' }
    const b: Seat = { id: 'b', reserve: 0, tokenEnv: 'T' }
    const g = budgetGate(
      { seats: [a, b], pools: [{ id: 'p', seats: ['a', 'b'] }] },
      { name: 'triage', seat: 'pool:p', budgetShare: 0.05 },
      [{ seat: a, error: 'seat "a" names $GONE, which is not set' }, { seat: b, usage: usage(10, 10) }],
      [{ seat: 'b', costUsd: 1, at: NOW, role: 'triage' }],
    )
    expect(g.exhausted()).toBe(true)
    const text = composeHandoff({ name: 'triage', reviewers: [] } as unknown as Role, { id: 'x' } as never, {
      reason: { kind: 'budget', ...(g.blocked === undefined ? {} : { blocked: g.blocked }),
                ...(g.passedOver === undefined ? {} : { passedOver: g.passedOver }) },
      done: [], remaining: [], suggested: [],
    }, Date.parse(NOW))
    // Both clauses of the credential sentence are false of `b`, which was read fine and was
    // stopped by the ceiling on Igor spend. Each seat gets a clause that is true of it.
    expect(text).not.toContain("no seat's usage could be read")
    expect(text).toContain("b is at this role's share")
    expect(text).toContain("a's usage could not be read")
  })

  it('states the same return in the table as the gate does, where two things hold the window', () => {
    // `derivedWindow` takes the later of the refusal's hour and the instance's, because the
    // seat is back only once both clear. A table naming the earlier one promises a return the
    // command's own pool line, printed directly beneath it, will not honour.
    const s: Seat = { id: 'adam', reserve: 0, tokenEnv: 'T' }
    const { resetsAt: _dropped, ...refusal } = obs({
      percentUsed: 100, source: 'limit', at: '2026-09-13T11:00:00.000Z', resetsPhrase: 'later',
    })
    const reading = obs({ percentUsed: 30, at: '2026-09-13T11:40:00.000Z', resetsAt: '2026-09-13T16:30:00.000Z' })
    const records = [
      { seat: 'adam', costUsd: 3, at: '2026-09-13T11:35:00.000Z' },
      { seat: 'adam', costUsd: 12, at: '2026-09-13T11:50:00.000Z' },
    ]
    const bounds = boundsForSeats([refusal, reading], records, [s], '2026-09-13T12:00:00.000Z')
    const gate = budgetGate(
      { seats: [s], pools: [{ id: 'p', seats: ['adam'] }] },
      { name: 'triage', seat: 'pool:p' },
      [{ seat: s, unmeasured: true, error: 'no subscription' }],
      records, bounds, '2026-09-13T12:00:00.000Z',
    )
    const d = describeWindow(s, 'session', bounds.get('adam')?.session)
    expect(gate.resetAt).toBe('2026-09-13T16:30:00.000Z')
    expect(d.resets).toBe(gate.resetAt)
    // And the bound it has passed is named, not only the refusal: the columns are dollars here.
    expect(d.note).toContain('$15.00')
  })

  it('shows the spend a refused window carries even where no capacity came of it', () => {
    // A refusal on the first run of an instance derives no capacity — there was nothing in the
    // observed span to divide — so `spent` arrives beside `noFigure`, and the dollars are on
    // the second. §5.1 asks for Igor spend on every window, this one included.
    const s: Seat = { id: 'adam', reserve: 0.5, tokenEnv: 'T' }
    const refusal = obs({ percentUsed: 100, source: 'limit', at: '2026-09-13T09:00:00.000Z',
                          resetsAt: '2026-09-13T13:00:00.000Z' })
    const records = [{ seat: 'adam', costUsd: 7, at: '2026-09-13T10:00:00.000Z' }]
    const bounds = boundsForSeats([refusal], records, [s], '2026-09-13T12:00:00.000Z')
    const d = describeWindow(s, 'session', bounds.get('adam')?.session)
    expect(d.state).toBe('spent')
    expect(bounds.get('adam')?.session?.noFigure?.spentUsd).toBe(7)
    expect(d.used).toBe('$7.00')
  })

  it('does not deny placing an instance on a row that prints spend counted inside one', () => {
    // The newest observation's reset did not resolve, so it places nothing — but an older one
    // did, and the spend figure beside the sentence was summed inside the instance it placed.
    const s: Seat = { id: 'adam', reserve: 0.5, tokenEnv: 'T' }
    const placed = obs({ percentUsed: 40, at: '2026-09-13T11:00:00.000Z', resetsAt: '2026-09-13T16:30:00.000Z' })
    const { resetsAt: _unresolved, ...unplaced } = obs({
      percentUsed: 50, at: '2026-09-13T12:00:00.000Z', resetsPhrase: '9pm',
    })
    const records = [{ seat: 'adam', costUsd: 7, at: '2026-09-13T12:00:00.000Z' }]
    const bounds = boundsForSeats([placed, unplaced], records, [s], '2026-09-13T12:30:00.000Z')
    const d = describeWindow(s, 'session', bounds.get('adam')?.session)
    expect(d.used).toBe('$7.00')
    expect(d.note).not.toContain('nothing places the instance')
    // An instance was placed, so the row can say when it ends rather than printing a dash.
    expect(d.resets).toBe('2026-09-13T16:30:00.000Z')
  })

})
