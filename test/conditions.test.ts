import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  budgetGate, chooseSeat, credentialFingerprint, loadSpend, readAllSeats, renderBudget, renderCredentials,
  type OrgBudget, type Seat, type SeatUsage, type SpendRecord,
} from '../src/budget.js'
import {
  CONDITION_DEFAULTS, conditionOf, conditionsFrom, cureFor, describeCondition, roleConditions, scopeOf,
  type Condition,
} from '../src/conditions.js'
import { ConfigError, resolveConfig } from '../src/config.js'
import { resolveRole, RoleError } from '../src/role.js'
import { SWEEP_AFTER_MS } from '../src/sweep.js'
import { tempDir } from './tmp.js'

/** The `now` every test passes; `ago` dates rows back from it, so no result depends on the date. */
const NOW = Date.UTC(2030, 0, 1, 12)
const MINUTE = 60_000
const ago = (minutes: number): string => new Date(NOW - minutes * MINUTE).toISOString()

const settings = CONDITION_DEFAULTS
const A = credentialFingerprint({ CLAUDE_CODE_OAUTH_TOKEN: 'token-a' })!
const B = credentialFingerprint({ CLAUDE_CODE_OAUTH_TOKEN: 'token-b' })!

/**
 * A run row for role `web` on seat `fleet`, `minutes` before `NOW`, meeting the keys in `cures`.
 * `refused` below is a run the provider refused, carrying the refused credential's hash.
 */
const run = (minutes: number, cures: string[] = [], over: Partial<SpendRecord> = {}): SpendRecord => ({
  at: ago(minutes),
  role: 'web',
  seat: 'fleet',
  costUsd: 0.1,
  ...(cures.length === 0 ? {} : { cures }),
  ...over,
})
const refused = (minutes: number, seen = A): SpendRecord =>
  run(minutes, ['seat:fleet:credential'], { tokenFingerprint: seen })
const commands = (minutes: number, role = 'web'): SpendRecord => run(minutes, [`role:${role}:commands`], { role })
const probe = (minutes: number, key: string, over: Partial<SpendRecord> = {}): SpendRecord => ({
  at: ago(minutes), kind: 'probe', key, role: 'web', ...over,
})

describe('a condition is keyed by its cure, and its scope is read off the key', () => {
  it('scopes a role, a seat and an Igor from the key alone', () => {
    expect(scopeOf('role:web:commands')).toEqual({ kind: 'role', name: 'web' })
    expect(scopeOf('seat:fleet:credential')).toEqual({ kind: 'seat', name: 'fleet' })
    expect(scopeOf('app:web:credential')).toEqual({ kind: 'igor', name: 'web' })
    expect(scopeOf('nonsense')).toBeUndefined()
  })

  it('says what would cure each kind of key', () => {
    expect(cureFor('role:web:commands')).toContain('`commands`')
    expect(cureFor('role:web:allow')).toContain('`allow`')
    expect(cureFor('seat:fleet:token')).toContain('token source')
    expect(cureFor('seat:fleet:credential')).toContain('different credential')
    expect(cureFor('app:web:credential')).toContain('App "web"')
  })
})

describe('a recurring condition stops its scope', () => {
  it('lets a first occurrence through, because one occurrence is what finds the cure', () => {
    const c = conditionOf([commands(5)], 'role:web:commands', settings, NOW)
    expect(c?.state).toBe('counting')
  })

  it('opens once the key has been met as often as the threshold', () => {
    const c = conditionOf([commands(30), commands(20), commands(10)], 'role:web:commands', settings, NOW)
    expect(c).toMatchObject({ state: 'open', count: 3, first: ago(30), last: ago(10) })
    expect(c?.probeAt).toBe(new Date(NOW - 10 * MINUTE + 15 * MINUTE).toISOString())
  })

  it('counts several Igors meeting one key as one condition, counted once', () => {
    // Each row stands for a different Igor of role `web`. They share one log, so the condition
    // is counted across all of them, not once per Igor.
    const rows = [1, 2, 3, 4, 5].map((n) => commands(50 - n, 'web'))
    const all = conditionsFrom(rows, settings, NOW)
    expect(all).toHaveLength(1)
    expect(all[0]).toMatchObject({ key: 'role:web:commands', count: 5 })
  })

  it('reads the count back after a restart, since nothing but the log holds it', () => {
    const rows = [commands(30), commands(20), commands(10)]
    const before = conditionOf(rows, 'role:web:commands', settings, NOW)
    const after = conditionOf(JSON.parse(JSON.stringify(rows)) as SpendRecord[], 'role:web:commands', settings, NOW)
    expect(after).toEqual(before)
  })

  it('scopes a seat condition to the seat, whatever role met it', () => {
    const rows = [
      refused(3),
      run(2, ['seat:fleet:credential'], { role: 'docs', tokenFingerprint: A }),
      refused(1),
    ]
    const c = conditionOf(rows, 'seat:fleet:credential', settings, NOW, A)
    expect(c).toMatchObject({ scope: { kind: 'seat', name: 'fleet' }, count: 3, state: 'open' })
  })

  it('leaves a role that shares nothing with the stopped one alone', () => {
    const rows = [commands(30), commands(20), commands(10), run(5, [], { role: 'docs', seat: 'other' })]
    const all = conditionsFrom(rows, settings, NOW)
    expect(roleConditions(all, 'web')).toHaveLength(1)
    expect(roleConditions(all, 'docs')).toEqual([])
  })

  it('opens a refused App credential at once', () => {
    const rows: SpendRecord[] = [
      { at: ago(1), kind: 'check', key: 'app:web:credential', role: 'web', met: true, discriminator: 'k1' },
    ]
    expect(conditionOf(rows, 'app:web:credential', settings, NOW, 'k1')).toMatchObject({ state: 'open', count: 1 })
  })
})

describe('a condition carrying a discriminator counts per occurrence', () => {
  it("counts a seat's second credential from one rather than inheriting the first's count", () => {
    const rows = [refused(40), refused(30), refused(20), refused(10, B)]
    const c = conditionOf(rows, 'seat:fleet:credential', settings, NOW, B)
    expect(c).toMatchObject({ discriminator: B, count: 1, state: 'counting' })
  })

  it('clears at once where a different credential resolves, with no cooldown and no item', () => {
    const rows = [refused(3), refused(2), refused(1)]
    expect(conditionOf(rows, 'seat:fleet:credential', settings, NOW, A)?.state).toBe('open')
    expect(conditionOf(rows, 'seat:fleet:credential', settings, NOW, B)).toBeUndefined()
  })

  it('holds nothing against a refusal no credential can be named for', () => {
    // Refusals with no `tokenFingerprint`, as a seat records when its login lives in a `~/.claude`
    // the environment does not carry: with no credential to hash, they neither count nor clear.
    const rows = [1, 2, 3].map((n) => run(n, ['seat:fleet:credential']))
    expect(conditionOf(rows, 'seat:fleet:credential', settings, NOW, undefined)).toBeUndefined()
  })
})

describe('a condition clears by not recurring, and a probe observes that', () => {
  const opened = [commands(60), commands(50), commands(40)]

  it('lets one item through once the cooldown has passed', () => {
    expect(conditionOf(opened, 'role:web:commands', settings, NOW)?.state).toBe('due')
  })

  it('takes one probe, and stops again until its outcome is in the log', () => {
    const c = conditionOf([...opened, probe(5, 'role:web:commands')], 'role:web:commands', settings, NOW)
    expect(c?.state).toBe('probing')
  })

  it('closes on a probe that does not meet it', () => {
    const rows = [...opened, probe(5, 'role:web:commands'), run(1)]
    expect(conditionOf(rows, 'role:web:commands', settings, NOW)).toBeUndefined()
  })

  it('stops again for longer where the probe meets it', () => {
    const rows = [...opened, probe(5, 'role:web:commands'), commands(1)]
    const c = conditionOf(rows, 'role:web:commands', settings, NOW)
    expect(c).toMatchObject({ state: 'open', count: 4 })
    expect(Date.parse(c!.probeAt!) - Date.parse(c!.last)).toBe(30 * MINUTE)
  })

  it('caps the cooldown, however long the condition lasts', () => {
    const rows = Array.from({ length: 20 }, (_, i) => commands(20 - i))
    const c = conditionOf(rows, 'role:web:commands', settings, NOW)
    expect(Date.parse(c!.probeAt!) - Date.parse(c!.last)).toBe(settings.maxCooldownMs)
  })

  it('leaves the condition open where a probe produced no outcome, and lets the next item probe', () => {
    const rows = [...opened, probe(5, 'role:web:commands'), probe(4, 'role:web:commands', { void: true })]
    expect(conditionOf(rows, 'role:web:commands', settings, NOW)?.state).toBe('due')
  })

  it('stops waiting on a probe whose process died', () => {
    const lapsed = (SWEEP_AFTER_MS + MINUTE) / MINUTE
    const rows = [commands(lapsed + 60), commands(lapsed + 50), commands(lapsed + 40), probe(lapsed, 'role:web:commands')]
    expect(conditionOf(rows, 'role:web:commands', settings, NOW)?.state).toBe('due')
  })

  it('closes a credential condition on a clean probe with the unchanged credential too', () => {
    const rows = [refused(60), refused(50), refused(40), probe(5, 'seat:fleet:credential'), run(1)]
    expect(conditionOf(rows, 'seat:fleet:credential', settings, NOW, A)).toBeUndefined()
  })

  it('reads a probe row as neither an occurrence nor an outcome', () => {
    const rows = [commands(30), commands(20), probe(15, 'role:web:commands'), commands(10)]
    expect(conditionOf(rows, 'role:web:commands', settings, NOW)?.count).toBe(3)
  })
})

describe('the decline names the key and what would cure it', () => {
  it('says the key, the count and the cure in one sentence', () => {
    const c = conditionOf([commands(30), commands(20), commands(10)], 'role:web:commands', settings, NOW)!
    const said = describeCondition(c)
    expect(said).toContain('`role:web:commands`')
    expect(said).toContain('3 times')
    expect(said).toContain(cureFor('role:web:commands'))
  })
})

const seat = (id: string, over: Partial<Seat> = {}): Seat => ({ id, reserve: 0, ...over })
const reading = (id: string, fingerprint?: string): SeatUsage => ({
  seat: seat(id, { tokenEnv: `TOKEN_${id}` }),
  usage: { session: { percentUsed: 10 }, week: { percentUsed: 10 }, perModel: [] },
  ...(fingerprint === undefined ? {} : { fingerprint }),
})
const org: OrgBudget = { seats: [seat('fleet'), seat('spare')], pools: [{ id: 'eng', seats: ['fleet', 'spare'] }] }

describe('a seat whose credential the provider refuses is passed over', () => {
  const rows = [refused(60), refused(50), refused(40)]
  const atNow = (fingerprint = A, extra: SpendRecord[] = []): Condition[] =>
    conditionsFrom([...rows, ...extra], settings, NOW - 30 * MINUTE, () => fingerprint)

  it('before its headroom is checked, saying the provider refused it', () => {
    const choice = chooseSeat(org.pools[0]!, [reading('fleet', A), reading('spare', B)], [], { name: 'web' }, new Map(), atNow())
    expect(choice.seat?.id).toBe('spare')
    expect(choice.considered[0]).toMatchObject({ seat: 'fleet', verdict: 'rejected' })
    expect(choice.considered[0]!.why).toContain('refused this credential')
  })

  it('whatever its reading says, including nothing at all', () => {
    const silent: SeatUsage = { seat: seat('fleet'), error: 'claude exited 1', fingerprint: A }
    const choice = chooseSeat({ id: 'one', seats: ['fleet'] }, [silent], [], { name: 'web' }, new Map(), atNow())
    expect(choice.considered[0]?.verdict).toBe('rejected')
  })

  it('is chosen again as soon as a different credential resolves, with no probe taken', () => {
    const gate = budgetGate(
      { seats: [seat('fleet')], pools: [{ id: 'one', seats: ['fleet'] }] },
      { name: 'web', seat: 'pool:one' },
      [reading('fleet', B)],
      [],
      new Map(),
      new Date(NOW - 30 * MINUTE).toISOString(),
      atNow(B),
    )
    expect(gate.seat).toBe('fleet')
    expect(gate.probes).toBeUndefined()
  })

  it('is chosen as a probe once the cooldown has passed', () => {
    const due = conditionsFrom(rows, settings, NOW, () => A)
    const gate = budgetGate(
      { seats: [seat('fleet')], pools: [{ id: 'one', seats: ['fleet'] }] },
      { name: 'web', seat: 'pool:one' },
      [reading('fleet', A)],
      [],
      new Map(),
      new Date(NOW).toISOString(),
      due,
    )
    expect(gate).toMatchObject({ seat: 'fleet', probes: ['seat:fleet:credential'] })
  })

  it('is held by one mechanism, and a failure of any other kind holds nothing', () => {
    const others = [1, 2, 3, 4].map((n) => run(n, [], { tokenFingerprint: A }))
    const choice = chooseSeat(
      { id: 'one', seats: ['fleet'] }, [reading('fleet', A)], [], { name: 'web' }, new Map(),
      conditionsFrom(others, settings, NOW, () => A),
    )
    expect(choice.seat?.id).toBe('fleet')
  })
})

describe('the budget report tells a refused credential from an unreadable one', () => {
  const open = conditionsFrom([refused(30), refused(20), refused(10)], settings, NOW, () => A)

  it('says so once, for the seat, and never calls it unreadable', () => {
    const silent: SeatUsage = { seat: seat('fleet', { tokenEnv: 'T' }), error: 'claude exited 1', fingerprint: A }
    const text = renderBudget([silent], new Map(), [], open)
    expect(text.match(/stopped on `seat:fleet:credential`/g)).toHaveLength(1)
    expect(text).not.toContain('credential unreadable')
  })

  it('prints the credential, the refusals and the next probe, and changes nothing by being read', () => {
    const rows = [refused(30), refused(20), refused(10)]
    const copy = JSON.stringify(rows)
    const text = renderCredentials([reading('fleet', A)], conditionsFrom(rows, settings, NOW, () => A), 3)
    expect(text).toContain(A)
    expect(text).toContain('refused this credential on the last 3 runs')
    expect(text).toContain(new Date(NOW - 10 * MINUTE + 15 * MINUTE).toISOString())
    expect(text).toContain('different credential resolves or when a probe')
    expect(JSON.stringify(rows)).toBe(copy)
  })
})

describe('readers that count runs skip condition rows', () => {
  it('loads runs only for spend', async () => {
    const lines = [run(3), probe(2, 'role:web:commands'), { at: ago(1), kind: 'check', key: 'app:web:credential', met: true }]
    const spend = await loadSpend(async () => lines.map((l) => JSON.stringify(l)).join('\n'))
    expect(spend).toHaveLength(1)
    expect(spend[0]?.kind).toBeUndefined()
  })
})

describe('reading a seat resolves its credential once and keeps the hash', () => {
  it('keeps the hash of what resolved even where the reading fails', async () => {
    const [r] = await readAllSeats(
      [seat('fleet', { tokenEnv: 'FLEET_TOKEN' })],
      { FLEET_TOKEN: 'token-a' },
      async () => {
        throw new Error('claude exited 1')
      },
    )
    expect(r).toMatchObject({ error: 'claude exited 1', fingerprint: A })
  })

  it('names the ambient credential for a seat naming no token source', async () => {
    const [r] = await readAllSeats([seat('fleet')], { ANTHROPIC_API_KEY: 'k' }, async () => 'Current session: 1% used')
    expect(r?.fingerprint).toBe(credentialFingerprint({ ANTHROPIC_API_KEY: 'k' }))
  })
})

describe('the threshold and cooldown are configurable, and nothing grades a condition', () => {
  const dir = tempDir('igor-conditions-config-')

  it('takes the provisional defaults where nothing is set', () => {
    expect(resolveConfig({ destination: '.' }, dir).conditions).toEqual(CONDITION_DEFAULTS)
  })

  it('reads the three settings in minutes', () => {
    const c = resolveConfig(
      { destination: '.', conditions: { threshold: 5, cooldown_minutes: 10, max_cooldown_minutes: 120 } },
      dir,
    ).conditions
    expect(c).toEqual({ threshold: 5, cooldownMs: 10 * MINUTE, maxCooldownMs: 120 * MINUTE })
  })

  it('refuses a severity in the config, saying why rather than naming an unknown key', () => {
    expect(() => resolveConfig({ destination: '.', conditions: { fatal: ['role:web:commands'] } }, dir)).toThrow(
      /counted, not graded/,
    )
  })

  it('refuses a role or its org base that declares a condition fatal or degraded', () => {
    const store = tempDir('igor-conditions-roles-')
    mkdirSync(join(store, 'roles'))
    writeFileSync(join(store, 'roles', 'org.yaml'), 'severity: { "role:web:commands": fatal }\n')
    writeFileSync(join(store, 'roles', 'web.yaml'), 'allow: [comment]\n')
    expect(() => resolveRole(store, 'web')).toThrow(RoleError)
    expect(() => resolveRole(store, 'web')).toThrow(/counted, not graded/)

    writeFileSync(join(store, 'roles', 'org.yaml'), 'allow: [comment]\n')
    writeFileSync(join(store, 'roles', 'web.yaml'), 'conditions: { degraded: [seat:fleet:token] }\n')
    expect(() => resolveRole(store, 'web')).toThrow(/counted, not graded/)
  })

  it('refuses a ceiling below the first cooldown', () => {
    expect(() =>
      resolveConfig({ destination: '.', conditions: { cooldown_minutes: 60, max_cooldown_minutes: 30 } }, dir),
    ).toThrow(ConfigError)
  })
})

describe('iteration 2: probes and the report', () => {
  const opened = [commands(60), commands(50), commands(40)]

  it('ends a probe whose run started no worker, so the next item may probe', () => {
    const workerless = run(5, [], { workerless: true, item: 'github:o/r#9' })
    // #8's row lands after the probe row (`at` is when a row is written), but its run began before
    // the probe: while a probe runs, the scope takes no other item. Only the row for the probe's
    // own item, #9, ends the probe, so the condition is still `probing` after #8's row.
    const earlier = run(5.5, [], { workerless: true, item: 'github:o/r#8' })
    const rows = [...opened, probe(6, 'role:web:commands', { item: 'github:o/r#9' }), earlier]
    expect(conditionOf(rows, 'role:web:commands', settings, NOW)?.state).toBe('probing')
    rows.push(workerless)
    expect(conditionOf(rows, 'role:web:commands', settings, NOW)?.state).toBe('due')
  })

  it('does not clear a role condition on a probe the provider refused before any command ran', () => {
    const rows = [...opened, probe(6, 'role:web:commands'), refused(5)]
    expect(conditionOf(rows, 'role:web:commands', settings, NOW)).toBeDefined()
  })

  it('reports a seat whose probe is due as due, not as stopped', () => {
    const due = conditionsFrom([refused(60), refused(50), refused(40)], settings, NOW, () => A)
    const text = renderBudget([reading('fleet', A)], new Map(), [], due)
    expect(text).not.toContain('stopped on')
    expect(text).toContain('`seat:fleet:credential`')
    expect(text).toContain('next item')
  })
})

describe('iteration 3: the report', () => {
  it('reports a due seat whose reading failed as passed over, not as due a probe', () => {
    const due = conditionsFrom([refused(60), refused(50), refused(40)], settings, NOW, () => A)
    const failed: SeatUsage = { seat: seat('fleet', { tokenEnv: 'T' }), error: 'claude exited 1', fingerprint: A }
    const text = renderBudget([failed], new Map(), [], due)
    expect(text).not.toContain('due a probe')
    expect(text).toContain('passed over')
  })
})
