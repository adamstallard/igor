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
  renderBudget,
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
    const full: SeatUsage[] = [
      { seat: org.seats[0]!, usage: { session: { percentUsed: 100, resetsAt: '8pm' }, week: { percentUsed: 100 }, perModel: [] } },
    ]
    const g = budgetGate(org, { name: 'r', seat: 'pool:eng' }, full, [])
    expect(g.exhausted()).toBe(true)
    expect(g.resetAt).toBe('8pm')
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

  it('reads a declared capacity per window as a starting estimate', () => {
    const b = parseOrgBudget({ seats: [{ id: 'adam', reserve: 0.5, capacity: { session: 12, week: 250 } }] })
    expect(b.seats[0]?.capacity).toStrictEqual({ session: 12, week: 250 })
  })

  it('takes a seat declaring one window and not the other', () => {
    const b = parseOrgBudget({ seats: [{ id: 'adam', reserve: 0.5, capacity: { week: 250 } }] })
    expect(b.seats[0]).toStrictEqual({ id: 'adam', reserve: 0.5, capacity: { week: 250 } })
  })

  it('leaves capacity unset on a seat that declares none', () => {
    const b = parseOrgBudget({ seats: [{ id: 'adam', reserve: 0.5 }] })
    expect(b.seats[0]).toStrictEqual({ id: 'adam', reserve: 0.5 })
  })

  it('rejects a capacity that names no window, rather than spending it as both', () => {
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity: 250 }] })).toThrow(
      /seat "x"\.capacity must name a window: session, week/,
    )
    // `capacity:` with nothing under it, which YAML reads as null.
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity: null }] })).toThrow(/must name a window/)
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity: {} }] })).toThrow(/seat "x"\.capacity names no window/)
  })

  it('rejects a capacity naming something that is not a window', () => {
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity: { weekly: 250 } }] })).toThrow(
      /seat "x"\.capacity names "weekly", which is not a window/,
    )
  })

  it('rejects a declared capacity that is not a positive number of dollars', () => {
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity: { session: 0 } }] })).toThrow(
      /seat "x"\.capacity\.session must be a positive number of dollars/,
    )
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity: { week: -1 } }] })).toThrow(/\.capacity\.week must be/)
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity: { week: '250' } }] })).toThrow(/\.capacity\.week must be/)
  })

  it('treats absent budget config as no seats rather than an error', () => {
    expect(parseOrgBudget(undefined)).toEqual({ seats: [], pools: [] })
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
      [unreadable(s)], records, boundsForSeats(obs, records, [s], now))

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

  it('does not promise the refusal’s hour where the sum is still over its bound then', () => {
    // A run already in flight when the seat was last passed lands after the refusal, so the
    // instance the sum is taken over outlives the refusal. The window is open when the later
    // of the two clears, and stating the earlier one is a return the seat does not keep.
    const first = refusal({ at: '2026-09-13T09:00:00.000Z', resetsAt: '2026-09-13T13:40:00.000Z' })
    const second = refusal({ at: '2026-09-13T13:35:00.000Z', resetsAt: '2026-09-13T15:00:00.000Z' })
    const records = [paid('2026-09-13T08:45:00.000Z', 10), paid('2026-09-13T13:45:00.000Z', 30)]
    const at14 = '2026-09-13T14:00:00.000Z'
    expect(gate(seat(), [first, second], records, at14).resetAt).toBe('2026-09-13T18:40:00.000Z')
    // The seat really is still shut at the hour the refusal expires, which is what makes it one.
    expect(choose(seat(), [first, second], records, '2026-09-13T15:00:01.000Z').seat).toBeUndefined()
  })

  it('says nothing rather than promise an hour a rolling bound cannot keep', () => {
    // A declared figure has no observed boundary, so nothing says when its sum clears. The
    // refusal's own hour is not an answer for a seat the arithmetic will still be holding.
    const s = seat({ capacity: { session: 10 } })
    const obs = [refusal({ at: '2026-09-13T12:00:00.000Z', resetsAt: '2026-09-13T13:30:00.000Z' })]
    const records = [paid('2026-09-13T12:50:00.000Z', 12)]
    const g = gate(s, obs, records, '2026-09-13T13:00:00.000Z')
    expect(g.exhausted()).toBe(true)
    expect(g.resetAt).toBeUndefined()
  })

  it('leaves the seat whose return nothing knows out of the earliest-reset race', () => {
    // Earliest across the pool is what makes an unknowable return dangerous: contributed as the
    // refusal's own hour it wins the race, and the pool is then promised the one seat whose
    // hour means nothing over a pool-mate whose hour is real.
    const rolling = seat({ capacity: { session: 10 } })
    const clocked = seat({ id: 'sam', owner: 'sam' })
    const records = [paid('2026-09-13T12:50:00.000Z', 12)]
    const g = budgetGate(
      { seats: [rolling, clocked], pools: [{ id: 'p', seats: ['adam', 'sam'] }] },
      { name: 'triage', seat: 'pool:p' },
      [unreadable(rolling), unreadable(clocked)],
      records,
      boundsForSeats(
        [refusal({ resetsAt: '2026-09-13T13:30:00.000Z' }), refusal({ seat: 'sam', resetsAt: RESET })],
        records,
        [rolling, clocked],
        '2026-09-13T13:00:00.000Z',
      ),
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

  it('leaves a seat that could be read judged on its reading, refusal or no refusal', () => {
    // The live figure is this cycle's; the observation is a snapshot of some earlier one.
    const s = seat()
    const bounds = boundsForSeats([refusal(), weekObs()], [], [s], NOW)
    const c = chooseSeat({ id: 'p', seats: ['adam'] }, [{ seat: s, usage: usage(17, 17) }], [], { name: 'triage' }, bounds)
    expect(c.seat?.id).toBe('adam')
  })
})
