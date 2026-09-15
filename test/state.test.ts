import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Contents API, in memory. Only what `state.ts` asks of it: a branch ref, a file read by
 * path, a directory read as a listing, and a PUT that replaces a file whole.
 */
const files = new Map<string, string>()
const puts: { path: string; content: string; sha?: string }[] = []

class FakeGhError extends Error {}

function shaOf(path: string): string {
  return `sha-${path}-${files.get(path)?.length ?? 0}`
}

function read(path: string, jq: string | undefined): unknown {
  const content = files.get(path)
  if (content !== undefined) {
    const encoded = Buffer.from(content, 'utf8').toString('base64')
    return jq === '{sha}' ? { sha: shaOf(path) } : { content: encoded, sha: shaOf(path) }
  }
  const prefix = `${path}/`
  const children = [...files.keys()].filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
  if (children.length === 0) throw new FakeGhError('404')
  // Returned in an order no reader may rely on.
  return children
    .map((p) => ({ name: p.slice(prefix.length), path: p, type: 'file' }))
    .sort((a, b) => b.name.localeCompare(a.name))
}

vi.mock('../src/gh.js', () => ({
  GhError: FakeGhError,
  gh: async (args: readonly string[], input?: string) => {
    const endpoint = args[1] ?? ''
    if (endpoint.includes('/git/ref/heads/')) return { ref: 'refs/heads/igor-state' }
    const contents = /^repos\/[^/]+\/[^/]+\/contents\/(.+?)(?:\?ref=.+)?$/.exec(endpoint)
    if (contents === null) throw new FakeGhError(`unexpected endpoint: ${endpoint}`)
    const path = decodeURIComponent(contents[1] as string)
    if (args.includes('PUT')) {
      const body = JSON.parse(input ?? '{}') as { content: string; sha?: string }
      const content = Buffer.from(body.content, 'base64').toString('utf8')
      puts.push({ path, content, ...(body.sha === undefined ? {} : { sha: body.sha }) })
      files.set(path, content)
      return { content: { path } }
    }
    const jqAt = args.indexOf('--jq')
    return read(path, jqAt === -1 ? undefined : args[jqAt + 1])
  },
}))

const { appendRecord, partitionPath, readLog } = await import('../src/state.js')
const { parseNdjson } = await import('../src/budget.js')

function at(iso: string): void {
  vi.setSystemTime(Date.parse(iso))
}

beforeEach(() => {
  files.clear()
  puts.length = 0
  vi.useFakeTimers()
  return () => vi.useRealTimers()
})

describe('partition paths', () => {
  it('puts a record in its UTC day', () => {
    expect(partitionPath('decisions.ndjson', '2026-09-15T04:31:00.000Z')).toBe('decisions/2026-09-15.ndjson')
  })

  it('sorts by name in the order it happened', () => {
    const days = ['2026-10-01', '2026-09-30', '2026-09-09'].map((d) => partitionPath('executions.ndjson', `${d}T00:00:00Z`))
    expect([...days].sort()).toEqual([
      'executions/2026-09-09.ndjson',
      'executions/2026-09-30.ndjson',
      'executions/2026-10-01.ndjson',
    ])
  })
})

describe('appending a record', () => {
  it('writes to the day partition, never the log path', async () => {
    at('2026-09-15T04:31:00Z')
    await appendRecord('o/r', 'decisions.ndjson', { role: 'triage' }, 'Triage decisions')

    expect(puts.map((p) => p.path)).toEqual(['decisions/2026-09-15.ndjson'])
    expect(files.has('decisions.ndjson')).toBe(false)
  })

  it('re-uploads only the day it is appending to', async () => {
    at('2026-09-15T01:00:00Z')
    await appendRecord('o/r', 'decisions.ndjson', { n: 1 }, 'first')
    at('2026-09-16T01:00:00Z')
    await appendRecord('o/r', 'decisions.ndjson', { n: 2 }, 'second')
    at('2026-09-16T02:00:00Z')
    await appendRecord('o/r', 'decisions.ndjson', { n: 3 }, 'third')

    const last = puts.at(-1)
    expect(last?.path).toBe('decisions/2026-09-16.ndjson')
    expect(parseNdjson<{ n: number }>(last?.content ?? '').map((r) => r.n)).toEqual([2, 3])
  })

  it('stamps a record with the day it is filed under', async () => {
    at('2026-09-15T23:59:59.999Z')
    await appendRecord('o/r', 'executions.ndjson', { item: 'a' }, 'one')

    const [record] = parseNdjson<{ at: string }>(files.get('executions/2026-09-15.ndjson') ?? '')
    expect(record?.at.slice(0, 10)).toBe('2026-09-15')
  })

  it('keeps the existing partition sha, so a concurrent write still conflicts', async () => {
    at('2026-09-15T01:00:00Z')
    await appendRecord('o/r', 'firings.ndjson', { item: 'a' }, 'one')
    await appendRecord('o/r', 'firings.ndjson', { item: 'b' }, 'two')

    expect(puts[0]?.sha).toBeUndefined()
    expect(puts[1]?.sha).toBe(`sha-firings/2026-09-15.ndjson-${puts[0]?.content.length ?? 0}`)
  })
})

describe('reading a log', () => {
  it('spans partitions, oldest first', async () => {
    for (const [day, n] of [
      ['2026-09-14', 1],
      ['2026-09-15', 2],
      ['2026-10-02', 3],
    ] as const) {
      at(`${day}T09:00:00Z`)
      await appendRecord('o/r', 'executions.ndjson', { n }, 'append')
    }

    const records = parseNdjson<{ n: number }>(await readLog('o/r', 'executions.ndjson'))
    expect(records.map((r) => r.n)).toEqual([1, 2, 3])
  })

  it('still reads a log written before partitioning, ahead of the partitions', async () => {
    files.set('executions.ndjson', '{"at":"2026-01-01T00:00:00Z","n":0}\n')
    at('2026-09-15T09:00:00Z')
    await appendRecord('o/r', 'executions.ndjson', { n: 1 }, 'append')

    const records = parseNdjson<{ n: number }>(await readLog('o/r', 'executions.ndjson'))
    expect(records.map((r) => r.n)).toEqual([0, 1])
  })

  it('separates parts whose last line lost its newline', async () => {
    files.set('executions.ndjson', '{"n":0}')
    files.set('executions/2026-09-15.ndjson', '{"n":1}')
    expect(parseNdjson<{ n: number }>(await readLog('o/r', 'executions.ndjson')).map((r) => r.n)).toEqual([0, 1])
  })

  it('is empty when the log has never been written', async () => {
    expect(await readLog('o/r', 'decisions.ndjson')).toBe('')
  })
})
