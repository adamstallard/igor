import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from '../src/adapter.js'

/**
 * The Contents API, in memory, with the compare-and-swap GitHub applies to a PUT: a write naming
 * a sha other than the file's current one answers 409, and a write naming none over a file that
 * exists answers 422.
 */
const files = new Map<string, { content: string; sha: string }>()
let version = 0
/** HTTP statuses the next reads fail with, one per read; writes are unaffected. */
const failing: number[] = []
/** Holds the first `size` reads of the record until all have arrived, so two writers interleave. */
const barrier = { size: 0, waiting: [] as (() => void)[] }

vi.mock('../src/gh.js', async (actual) => {
  const real = await actual<typeof import('../src/gh.js')>()
  return {
    ...real,
    gh: async (args: readonly string[], input?: string) => {
      const endpoint = args[1] ?? ''
      if (endpoint.includes('/git/ref/heads/')) return { ref: 'refs/heads/igor-state' }
      const path = /contents\/([^?]+)/.exec(endpoint)?.[1] ?? ''
      if (args.includes('PUT')) {
        const body = JSON.parse(input ?? '{}') as { content: string; sha?: string }
        const current = files.get(path)
        if (current !== undefined && body.sha === undefined) throw new real.GhError('"sha" wasn\'t supplied', 422)
        if (current !== undefined && body.sha !== current.sha) throw new real.GhError('is at another sha', 409)
        version += 1
        files.set(path, { content: Buffer.from(body.content, 'base64').toString('utf8'), sha: `v${version}` })
        return {}
      }
      const status = failing.shift()
      if (status !== undefined) throw new real.GhError(`HTTP ${status}`, status)
      if (barrier.size > 0) {
        await new Promise<void>((resolve) => {
          barrier.waiting.push(resolve)
          if (barrier.waiting.length >= barrier.size) {
            barrier.size = 0
            for (const go of barrier.waiting.splice(0)) go()
          }
        })
      }
      const file = files.get(path)
      if (file === undefined) throw new real.GhError('Not Found', 404)
      return { content: Buffer.from(file.content, 'utf8').toString('base64'), sha: file.sha }
    },
  }
})

const { loadDeferrals, noteHandoff, STATE_PATH } = await import('../src/deferred.js')

const item = (n: number): Candidate =>
  ({
    id: `github:o/r#${n}`, tracker: 'github', repo: 'o/r', native: String(n), title: 'A bug', body: '',
    author: 'reporter', assignees: [], holders: [], labels: [], paths: [], state: 'open',
  }) as unknown as Candidate

const NOW = Date.parse('2026-10-01T12:00:00Z')

function stored(): string[] {
  const file = files.get(STATE_PATH)
  return file === undefined ? [] : Object.keys((JSON.parse(file.content) as { items: object }).items).sort()
}

beforeEach(() => {
  files.clear()
  failing.length = 0
  barrier.size = 0
  barrier.waiting.length = 0
})

describe('the deferral record across a failed read', () => {
  it('keeps every entry when a handoff meets a read that fails', async () => {
    await noteHandoff('o/dest', item(1), 'asked a question', NOW)
    await noteHandoff('o/dest', item(2), 'asked a question', NOW)
    failing.push(503)

    await expect(noteHandoff('o/dest', item(3), 'asked a question', NOW)).rejects.toThrow(/503/)
    await noteHandoff('o/dest', item(3), 'asked a question', NOW)

    expect(stored()).toEqual(['github:o/r#1', 'github:o/r#2', 'github:o/r#3'])
  })

  it('fails the cycle that cannot read it, naming the record', async () => {
    await noteHandoff('o/dest', item(1), 'asked a question', NOW)
    failing.push(502)

    await expect(loadDeferrals('o/dest')).rejects.toThrow(/deferral record could not be read.*502/s)
  })

  it('reads a record that is not there as empty', async () => {
    expect(await loadDeferrals('o/dest')).toEqual({ items: {} })
  })
})

describe('two handoffs at once', () => {
  it('keeps both entries when both read before either writes', async () => {
    await noteHandoff('o/dest', item(1), 'asked a question', NOW)
    barrier.size = 2

    await Promise.all([
      noteHandoff('o/dest', item(2), 'asked a question', NOW),
      noteHandoff('o/dest', item(3), 'asked a question', NOW),
    ])

    expect(stored()).toEqual(['github:o/r#1', 'github:o/r#2', 'github:o/r#3'])
  })

  it('keeps both entries when both create the record at once', async () => {
    barrier.size = 2

    await Promise.all([
      noteHandoff('o/dest', item(2), 'asked a question', NOW),
      noteHandoff('o/dest', item(3), 'asked a question', NOW),
    ])

    expect(stored()).toEqual(['github:o/r#2', 'github:o/r#3'])
  })
})
