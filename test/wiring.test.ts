import { describe, expect, it, vi } from 'vitest'
import type { Candidate } from '../src/adapter.js'
import type { Config } from '../src/config.js'
import type { Denial, ExecutionResult } from '../src/execute.js'
import type { Role } from '../src/role.js'
import { wire } from '../src/wiring.js'
import { tempDir } from './tmp.js'

/**
 * The state branch is a repository over the network, and it throws here on purpose: a warning
 * about a denial that only survives a successful write is a warning nobody gets on the day the
 * state branch is unwritable, which is exactly a day worth diagnosing.
 */
vi.mock('../src/state.js', async (actual) => ({
  ...(await actual<typeof import('../src/state.js')>()),
  appendRecord: async () => {
    throw new Error('no state branch')
  },
  writeState: async () => {
    throw new Error('no state branch')
  },
}))

const config = { destination: '/nowhere', experts: [], budget: { seats: [], pools: [] } } as unknown as Config
const role = { name: 'generalist' } as unknown as Role
const item = { id: 'github:o/r#7', repo: 'o/r', url: 'https://example.test/7' } as unknown as Candidate

function reporter() {
  const said: string[] = []
  const warned: string[] = []
  return { out: { say: (l: string) => said.push(l), warn: (l: string) => warned.push(l) }, said, warned }
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
    const { out, warned } = reporter()

    await (await wiring(out)).record(item, ran([denied('npm install')]))

    expect(warned).toEqual(['sandbox denied npm install — cure key role:generalist:commands'])
  })

  it('says it once however many times the worker tried', async () => {
    // Six identical refusals are one thing to fix, and six lines read as six problems.
    const { out, warned } = reporter()

    await (await wiring(out)).record(item, ran(Array.from({ length: 6 }, () => denied('npm install'))))

    expect(warned).toHaveLength(1)
  })

  it('says both where two commands were refused under one cure', async () => {
    // Widening the list takes both strings, so collapsing on the key hides the second.
    const { out, warned } = reporter()

    await (await wiring(out)).record(item, ran([denied('npm install'), denied('npx vitest run')]))

    expect(warned).toHaveLength(2)
    expect(warned[1]).toContain('npx vitest run')
  })

  it('names the tool where no role setting would have permitted it', async () => {
    const { out, warned } = reporter()

    await (await wiring(out)).record(item, ran([{ tool: 'WebFetch' }]))

    expect(warned).toEqual(['sandbox denied WebFetch'])
  })

  it('stays quiet about a run nothing was refused on', async () => {
    const { out, warned } = reporter()

    await (await wiring(out)).record(item, ran())

    expect(warned).toEqual([])
  })
})
