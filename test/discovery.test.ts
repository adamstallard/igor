import { describe, expect, it } from 'vitest'
import type { Candidate, Source, Tracker } from '../src/adapter.js'
import {
  advance,
  COLD_START_DAYS,
  discover,
  discoverSource,
  EMPTY_STATE,
  freshCandidates,
  nextWatermark,
  sourceKey,
  type DiscoveryState,
} from '../src/discovery.js'

const NOW = Date.parse('2026-09-13T00:00:00Z')
const at = (iso: string): Candidate =>
  ({ id: `github:o/r#${iso}`, updatedAt: iso, labels: [], paths: [], state: 'open' }) as unknown as Candidate

const source: Source = { tracker: 'github', repo: 'o/r', query: 'is:issue is:open' }

function fakeTracker(candidates: Candidate[], onSearch?: () => void): Tracker {
  return {
    name: 'github',
    nativeHolderField: true,
    identity: async () => 'igor-bot',
    search: async () => {
      onSearch?.()
      return candidates
    },
    claim: async () => true,
    verifyClaim: async () => ({ status: 'held' }),
    report: async () => {},
    release: async () => {},
    linkage: () => 'Closes #1',
  }
}

describe('source keys', () => {
  it('is stable for the same source', () => {
    expect(sourceKey(source)).toBe(sourceKey({ ...source }))
  })

  it('distinguishes two queries against one repository', () => {
    expect(sourceKey(source)).not.toBe(sourceKey({ ...source, query: 'is:issue label:bug' }))
  })

  it('does not depend on declaration order in config', () => {
    // A reordered config must not orphan every watermark and re-trigger a cold start.
    const keys = [source, { ...source, query: 'other' }].map(sourceKey)
    const reversed = [{ ...source, query: 'other' }, source].map(sourceKey).reverse()
    expect(keys).toEqual(reversed)
  })
})

describe('cold start', () => {
  it('looks back only a short way on the very first run', () => {
    // An Igor pointed at an established repository must not wake up facing its whole backlog.
    const candidates = [at('2020-01-01T00:00:00Z'), at('2026-09-12T00:00:00Z')]
    expect(freshCandidates(candidates, undefined, NOW)).toHaveLength(1)
  })

  it('reports that a run was a cold start, so the count can be read in context', async () => {
    const result = await discoverSource(fakeTracker([at('2026-09-12T00:00:00Z')]), source, EMPTY_STATE, NOW)
    expect(result.coldStart).toBe(true)
    expect(result.returned).toBe(1)
  })

  it('is not a cold start once a watermark exists', async () => {
    const state: DiscoveryState = { watermarks: { [sourceKey(source)]: { lastSeen: '2026-09-01T00:00:00Z' } } }
    expect((await discoverSource(fakeTracker([]), source, state, NOW)).coldStart).toBe(false)
  })

  it('bounds the look-back to the documented window', () => {
    const justInside = new Date(NOW - (COLD_START_DAYS - 1) * 86400000).toISOString()
    const justOutside = new Date(NOW - (COLD_START_DAYS + 1) * 86400000).toISOString()
    expect(freshCandidates([at(justInside), at(justOutside)], undefined, NOW)).toHaveLength(1)
  })
})

describe('watermark', () => {
  const previous = { lastSeen: '2026-09-10T00:00:00Z' }

  it('lets through only what changed since it was last seen', () => {
    const candidates = [at('2026-09-09T00:00:00Z'), at('2026-09-11T00:00:00Z')]
    expect(freshCandidates(candidates, previous, NOW).map((c) => c.updatedAt)).toEqual([
      '2026-09-11T00:00:00Z',
    ])
  })

  it('advances to the newest item seen, not to the time of the run', () => {
    // Advancing to now would skip anything updated between the query and the write.
    const w = nextWatermark([at('2026-09-11T00:00:00Z')], previous, NOW)
    expect(w.lastSeen).toBe('2026-09-11T00:00:00Z')
  })

  it('compares timestamps as instants, not as strings', () => {
    // GitHub returns `...T00:00:00Z`; anything generated here carries milliseconds, and
    // lexicographically `.000Z` sorts before `Z`.
    const w = { lastSeen: '2026-09-11T00:00:00.000Z' }
    expect(freshCandidates([at('2026-09-11T00:00:00Z')], w, NOW)).toEqual([])
  })

  it('does not move backwards when a run returns only older items', () => {
    expect(nextWatermark([at('2026-09-01T00:00:00Z')], previous, NOW).lastSeen).toBe(previous.lastSeen)
  })

  it('produces byte-identical state on a cycle that saw nothing new, so nothing is committed', () => {
    // Recording the run time in the watermark would make every cycle a commit.
    const candidates = [at('2026-09-11T00:00:00Z')]
    const once = nextWatermark(candidates, previous, NOW)
    const twice = nextWatermark(candidates, once, NOW + 600_000)
    expect(JSON.stringify(twice)).toBe(JSON.stringify(once))
  })

  it('yields nothing on a second run with no intervening activity', () => {
    const candidates = [at('2026-09-11T00:00:00Z')]
    const w = nextWatermark(candidates, previous, NOW)
    expect(freshCandidates(candidates, w, NOW)).toEqual([])
  })
})

describe('losing state costs re-examination, never a duplicate claim', () => {
  it('re-examines from the cold-start window rather than refusing to run', async () => {
    // The tracker is the source of truth for what is claimed; the watermark only saves calls.
    const candidates = [at('2026-09-12T00:00:00Z')]
    const withState = { watermarks: { [sourceKey(source)]: nextWatermark(candidates, undefined, NOW) } }
    expect((await discoverSource(fakeTracker(candidates), source, withState, NOW)).fresh).toEqual([])
    expect((await discoverSource(fakeTracker(candidates), source, EMPTY_STATE, NOW)).fresh).toHaveLength(1)
  })
})

describe('running every source', () => {
  it('polls each source and keys their watermarks apart', async () => {
    const two = [source, { ...source, query: 'label:bug' }]
    const { results } = await discover({ github: fakeTracker([at('2026-09-12T00:00:00Z')]) }, two, EMPTY_STATE, NOW)
    expect(results).toHaveLength(2)
    expect(new Set(results.map((r) => r.key)).size).toBe(2)
  })

  it('reports a source with no adapter instead of failing the cycle', async () => {
    const { results, failures } = await discover({ github: fakeTracker([]) }, [source, { ...source, tracker: 'linear' }], EMPTY_STATE, NOW)
    expect(results).toHaveLength(1)
    expect(failures[0]?.error.message).toContain('no adapter')
  })

  it('leaves a failed source’s watermark alone, so nothing is skipped because of an outage', async () => {
    const failing: Tracker = { ...fakeTracker([]), search: async () => { throw new Error('502') } }
    const before: DiscoveryState = { watermarks: { [sourceKey(source)]: { lastSeen: '2026-09-01T00:00:00Z' } } }
    const { results, failures } = await discover({ github: failing }, [source], before, NOW)
    expect(failures).toHaveLength(1)
    expect(advance(before, results).watermarks[sourceKey(source)]!.lastSeen).toBe('2026-09-01T00:00:00Z')
  })

  it('does not re-query a source whose results it already has', async () => {
    let calls = 0
    await discover({ github: fakeTracker([], () => calls++) }, [source], EMPTY_STATE, NOW)
    expect(calls).toBe(1)
  })
})
