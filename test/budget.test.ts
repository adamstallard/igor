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
    const broken: SeatUsage[] = [{ seat: seat({ id: 'igor-1' }), error: 'token missing' }]
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

  it('reads a declared capacity as a starting estimate', () => {
    const b = parseOrgBudget({ seats: [{ id: 'adam', reserve: 0.5, capacity: 250 }] })
    expect(b.seats[0]?.capacity).toBe(250)
  })

  it('leaves capacity unset on a seat that declares none', () => {
    const b = parseOrgBudget({ seats: [{ id: 'adam', reserve: 0.5 }] })
    expect(b.seats[0]).toStrictEqual({ id: 'adam', reserve: 0.5 })
  })

  it('rejects a declared capacity that is not a positive number of dollars', () => {
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity: 0 }] })).toThrow(/\.capacity must be/)
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity: -1 }] })).toThrow(/\.capacity must be/)
    expect(() => parseOrgBudget({ seats: [{ id: 'x', capacity: '250' }] })).toThrow(/\.capacity must be/)
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
