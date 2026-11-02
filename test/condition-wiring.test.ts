import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from '../src/adapter.js'
import type { Config } from '../src/config.js'
import type { ExecutionResult } from '../src/execute.js'
import type { Role } from '../src/role.js'
import type { SeatUsage, SpendRecord } from '../src/budget.js'
import { CONDITION_DEFAULTS } from '../src/conditions.js'
import { tempDir } from './tmp.js'

/** The execution log, in memory: appends land here, stamped as `appendRecord` stamps them. */
const log = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[], delayMs: 0, writable: true }))
vi.mock('../src/state.js', async (actual) => ({
  ...(await actual<typeof import('../src/state.js')>()),
  appendRecord: async (_repo: string, path: string, record: Record<string, unknown>) => {
    if (!log.writable) throw new Error('no state branch')
    if (log.delayMs > 0) await new Promise((r) => setTimeout(r, log.delayMs))
    if (path === 'executions.ndjson') log.rows.push({ at: new Date().toISOString(), ...record })
  },
  writeState: async () => true,
  readLog: async (_destination: string, path: string) =>
    path === 'executions.ndjson' ? log.rows.map((r) => JSON.stringify(r)).join('\n') : '',
}))

/** What each seat resolves to this time, without running `claude`. */
const seats = vi.hoisted(() => ({ fingerprint: undefined as string | undefined }))
vi.mock('../src/budget.js', async (actual) => ({
  ...(await actual<typeof import('../src/budget.js')>()),
  readAllSeats: async (list: readonly import('../src/budget.js').Seat[]): Promise<SeatUsage[]> =>
    list.map((seat) => ({
      seat,
      usage: { session: { percentUsed: 1 }, week: { percentUsed: 1 }, perModel: [] },
      ...(seats.fingerprint === undefined ? {} : { fingerprint: seats.fingerprint }),
    })),
}))

const { wire } = await import('../src/wiring.js')
const { credentialFingerprint, fingerprintToken } = await import('../src/budget.js')

const A = credentialFingerprint({ CLAUDE_CODE_OAUTH_TOKEN: 'token-a' })!
const B = credentialFingerprint({ CLAUDE_CODE_OAUTH_TOKEN: 'token-b' })!

const config = {
  destination: '/nowhere',
  experts: [],
  budget: { seats: [{ id: 'fleet', reserve: 0, tokenEnv: 'T' }], pools: [{ id: 'eng', seats: ['fleet'] }] },
  conditions: CONDITION_DEFAULTS,
} as unknown as Config
const role = { name: 'web', seat: 'pool:eng' } as unknown as Role
const quiet = { say: () => {}, warn: () => {} }
const wiring = () => wire(config, role, 'o/state', quiet, { root: tempDir('igor-condition-wiring-') })

/** A row as old as `minutes`, stamped from the real clock, since the gate reads the real clock. */
const row = (minutes: number, over: Partial<SpendRecord>): Record<string, unknown> => ({
  at: new Date(Date.now() - minutes * 60_000).toISOString(),
  ...over,
})
const refusedOn = (fingerprint: string) => [3, 2, 1].map((m) =>
  row(m, { role: 'web', seat: 'fleet', cures: ['seat:fleet:credential'], tokenFingerprint: fingerprint }))
const commandsRefused = (minutes: number[]) =>
  minutes.map((m) => row(m, { role: 'web', seat: 'fleet', cures: ['role:web:commands'] }))

beforeEach(() => {
  log.rows.length = 0
  log.delayMs = 0
  log.writable = true
  seats.fingerprint = A
})

describe("the gate resolves each seat's credential before it declines the seat", () => {
  it('passes over a seat stopped on the credential that still resolves', async () => {
    log.rows.push(...refusedOn(A))
    const gate = await (await wiring()).gate()
    expect(gate.exhausted()).toBe(true)
    expect(gate.blocked).toBe('rejected')
  })

  it('chooses a seat stopped on token A once token B resolves, with no probe taken', async () => {
    log.rows.push(...refusedOn(A))
    seats.fingerprint = B
    const gate = await (await wiring()).gate()
    expect(gate.seat).toBe('fleet')
    expect(gate.probes).toBeUndefined()
    expect(log.rows.filter((r) => r['kind'] === 'probe')).toEqual([])
  })
})

describe("a role's own condition", () => {
  it('stops the role before triage and at the gate, naming the key', async () => {
    log.rows.push(...commandsRefused([3, 2, 1]))
    const w = await wiring()
    expect((await w.stopped())?.key).toBe('role:web:commands')
    const gate = await w.gate()
    expect(gate.exhausted()).toBe(true)
    expect(gate.condition?.key).toBe('role:web:commands')
    expect(gate.reason).toContain('`role:web:commands`')
  })

  it('admits one item as the probe once the cooldown passes, and no second while it runs', async () => {
    log.rows.push(...commandsRefused([60, 50, 40]))
    const w = await wiring()
    const first = await w.gate()
    expect(first.probes).toEqual(['role:web:commands'])

    await w.probe(first.probes!, 'taken', 'github:o/r#1')
    const second = await w.gate()
    expect(second.exhausted()).toBe(true)
    expect(second.condition?.state).toBe('probing')

    await w.probe(first.probes!, 'void', 'github:o/r#1')
    expect((await w.gate()).probes).toEqual(['role:web:commands'])
  })

  it('reads the outcome of a run still being recorded before deciding the next item', async () => {
    log.rows.push(...commandsRefused([3, 2]))
    log.delayMs = 50
    const w = await wiring()
    const item = { id: 'github:o/r#1', repo: 'o/r', url: 'u' } as unknown as Candidate
    const ran = {
      outcome: 'failed', changed: [], refusals: [], transcript: '', costUsd: 0.1,
      cures: ['role:web:commands'], reason: 'denied',
    } as ExecutionResult
    const recording = w.record(item, ran, 'fleet')
    const gate = await w.gate()
    await recording
    expect(gate.condition?.key).toBe('role:web:commands')
  })
})

describe("serve's App credential check is a condition in the log", () => {
  const PEM = '-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----\n'
  const checks = () => log.rows.filter((r) => r['kind'] === 'check')

  it('opens on the first refusal, once, against a full hash of the key', async () => {
    const check = (await wiring()).appCredential(PEM, async () => 'GitHub refused the App "web"')
    expect(await check()).toBe('GitHub refused the App "web"')
    expect(await check()).toBe('GitHub refused the App "web"')
    expect(checks()).toHaveLength(1)
    expect(checks()[0]).toMatchObject({ key: 'app:web:credential', met: true, discriminator: fingerprintToken(PEM) })
    expect(JSON.stringify(checks())).not.toContain('abc')
  })

  it('clears on a mint that succeeds, spending no item, and writes nothing while healthy', async () => {
    let refused = true
    const check = (await wiring()).appCredential(PEM, async () => (refused ? 'refused' : true))
    await check()
    refused = false
    expect(await check()).toBe(true)
    expect(await check()).toBe(true)
    expect(checks().map((r) => r['met'])).toEqual([true, false])
  })

  it('still stops where the refusal cannot be written', async () => {
    log.writable = false
    const check = (await wiring()).appCredential(PEM, async () => 'refused')
    expect(await check()).toBe('refused')
  })
})
