import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from '../src/adapter.js'
import type { Config } from '../src/config.js'
import type { Denial, ExecutionResult } from '../src/execute.js'
import type { Role } from '../src/role.js'
import type { Seat } from '../src/budget.js'
import { EXECUTIONS_PATH } from '../src/budget.js'
import { CAPACITY_PATH } from '../src/capacity.js'
import { wire } from '../src/wiring.js'
import { tempDir } from './tmp.js'

/**
 * The state branch is a repository over the network, and it throws here on purpose: a warning
 * about a denial that only survives a successful write is a warning nobody gets on the day the
 * state branch is unwritable, which is exactly a day worth diagnosing.
 */
const logs = vi.hoisted(() => ({ rows: {} as Record<string, string> }))

vi.mock('../src/state.js', async (actual) => ({
  ...(await actual<typeof import('../src/state.js')>()),
  appendRecord: async () => {
    throw new Error('no state branch')
  },
  writeState: async () => {
    throw new Error('no state branch')
  },
  readLog: async (_destination: string, path: string) => logs.rows[path] ?? '',
}))

/**
 * The #30 condition, without the subprocess that produces it: the seat's token resolves fine
 * and the provider still reports no window against it, because a `setup-token` credential
 * carries no subscription. That is the seat the derived bound exists for.
 */
vi.mock('../src/budget.js', async (actual) => ({
  ...(await actual<typeof import('../src/budget.js')>()),
  readAllSeats: async (seats: readonly import('../src/budget.js').Seat[]) =>
    seats.map((seat) => ({
      seat,
      error: `seat "${seat.id}" is authenticated but its credential carries no subscription`,
      unmeasured: true,
    })),
}))

const config = { destination: '/nowhere', experts: [], budget: { seats: [], pools: [] } } as unknown as Config
const role = { name: 'generalist' } as unknown as Role
const item = { id: 'github:o/r#7', repo: 'o/r', url: 'https://example.test/7' } as unknown as Candidate

function reporter() {
  const said: string[] = []
  const warned: string[] = []
  return {
    out: { say: (l: string) => said.push(l), warn: (l: string) => warned.push(l) },
    said,
    warned,
    /** The state branch is unwritable here throughout, so its own warning rides along. */
    denials: () => warned.filter((l) => l.startsWith('sandbox denied')),
  }
}

function ran(denials?: Denial[]): ExecutionResult {
  return {
    outcome: 'produced',
    changed: [],
    refusals: [],
    transcript: '',
    costUsd: 0.02,
    ...(denials === undefined ? {} : { denials }),
    reason: 'opened #42',
  }
}

const denied = (command: string): Denial => ({ tool: 'Bash', command, cure: 'role:generalist:commands' })

describe('a command the sandbox refused reaches the operator', () => {
  const wiring = async (out: ReturnType<typeof reporter>['out']) =>
    await wire(config, role, 'o/r', out, { root: tempDir('igor-wiring-test-') })

  it('says the command and the cure key', async () => {
    const { out, denials } = reporter()

    await (await wiring(out)).record(item, ran([denied('npm install')]))

    expect(denials()).toEqual(['sandbox denied npm install — cure key role:generalist:commands'])
  })

  it('says it once however many times the worker tried', async () => {
    // Six identical refusals are one thing to fix, and six lines read as six problems.
    const { out, denials } = reporter()

    await (await wiring(out)).record(item, ran(Array.from({ length: 6 }, () => denied('npm install'))))

    expect(denials()).toHaveLength(1)
  })

  it('says both where two commands were refused under one cure', async () => {
    // Widening the list takes both strings, so collapsing on the key hides the second.
    const { out, denials } = reporter()

    await (await wiring(out)).record(item, ran([denied('npm install'), denied('npx vitest run')]))

    expect(denials()).toHaveLength(2)
    expect(denials()[1]).toContain('npx vitest run')
  })

  it('names the tool where no role setting would have permitted it', async () => {
    const { out, denials } = reporter()

    await (await wiring(out)).record(item, ran([{ tool: 'WebFetch' }]))

    expect(denials()).toEqual(['sandbox denied WebFetch'])
  })

  it('stays quiet about a run nothing was refused on', async () => {
    const { out, denials } = reporter()

    await (await wiring(out)).record(item, ran())

    expect(denials()).toEqual([])
  })
})

describe('a run that could not be recorded is said out loud', () => {
  const wiring = async (out: ReturnType<typeof reporter>['out']) =>
    await wire(config, role, 'o/r', out, { root: tempDir('igor-wiring-test-') })

  it('names the item and what the state branch said', async () => {
    // The record is the numerator a seat's capacity is derived from, so one dropped in silence
    // is spend that happened, was never counted, and reads back as capacity nobody has.
    const { out, warned } = reporter()

    await (await wiring(out)).record(item, ran())

    expect(warned).toEqual(['could not record the run of github:o/r#7: no state branch'])
  })

  it('still lets the item finish, because housekeeping never stops a cycle', async () => {
    const { out } = reporter()

    await expect((await wiring(out)).record(item, ran())).resolves.toBeUndefined()
  })
})

describe('the gate both commands go through', () => {
  // `run` and `serve` drifted once because each built this itself. A seat bounded by
  // observation is only bounded if the rows reach the gate, and the rows only reach it here.
  const unreadable: Seat = { id: 'adam', owner: 'adam@example.test', reserve: 0.25, tokenEnv: 'IGOR_SEAT_ABSENT' }
  const budget = { seats: [unreadable], pools: [{ id: 'eng', seats: ['adam'] }] }

  // `wire` reads the clock, so the rows are written around it: an observation an hour old
  // inside an instance that has not reset, and ten dollars of Igor spend it could have seen.
  const HOUR = 3_600_000
  const iso = (offsetMs: number) => new Date(Date.now() + offsetMs).toISOString()
  const observation = (window: 'session' | 'week', percentUsed: number, resetsIn: number) =>
    JSON.stringify({ at: iso(-HOUR), seat: 'adam', window, percentUsed, resetsAt: iso(resetsIn), source: 'usage' })
  const paid = (offsetMs: number, costUsd: number) => JSON.stringify({ seat: 'adam', costUsd, at: iso(offsetMs) })

  beforeEach(() => {
    logs.rows = {
      [CAPACITY_PATH]: `${observation('session', 50, 3 * HOUR)}\n${observation('week', 5, 72 * HOUR)}\n`,
      [EXECUTIONS_PATH]: `${paid(-1.5 * HOUR, 10)}\n`,
    }
  })

  const gateFor = async () => {
    const { out, warned } = reporter()
    const wiring = await wire({ ...config, budget } as unknown as Config, role, 'o/r', out, {
      root: tempDir('igor-wiring-test-'),
    })
    return { gate: await wiring.gate(), warned }
  }

  it('bounds a seat it could not read instead of reporting the pool empty', async () => {
    const { gate } = await gateFor()
    expect(gate.exhausted()).toBe(false)
    expect(gate.seat).toBe('adam')
    expect(gate.token).toEqual({ tokenEnv: 'IGOR_SEAT_ABSENT' })
  })

  it('still says out loud that the credential could not be read', async () => {
    // The seat is usable on its derived bound, which is exactly why nobody would notice the
    // credential is broken unless this line says so.
    const { warned } = await gateFor()
    expect(warned.some((l) => l.startsWith('seat "adam":'))).toBe(true)
  })

  it('reports the pool empty once the recorded spend reaches the bound', async () => {
    // Capacity $20 from the observation, a quarter of it reserved, so $15 is the whole of it.
    logs.rows[EXECUTIONS_PATH] += `${paid(-0.5 * HOUR, 6)}\n`
    const { gate } = await gateFor()
    expect(gate.exhausted()).toBe(true)
    expect(gate.reason).toBe('no seat in "eng" has headroom')
  })
})
