import { describe, expect, it, vi } from 'vitest'
import type { Candidate, Source, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'

/**
 * The state branch, in memory. `planCycle` reads and writes the watermark through these, and
 * the question here is whether a cycle that could not consider its items moves it.
 */
const stored = new Map<string, unknown>()
vi.mock('../src/state.js', () => ({
  readState: async (_repo: string, path: string) => stored.get(path),
  writeState: async (_repo: string, path: string, value: unknown) => {
    stored.set(path, value)
    return true
  },
  appendRecord: async () => undefined,
}))

const { planCycle } = await import('../src/loop.js')
const { sourceKey, STATE_PATH } = await import('../src/discovery.js')
const { triageBatch } = await import('../src/triage.js')

const NOW = Date.parse('2026-09-14T12:00:00Z')
const ago = (minutes: number) => new Date(NOW - minutes * 60000).toISOString()

const candidate = (n: number, minutes: number): Candidate =>
  ({
    id: `github:o/r#${n}`, tracker: 'github', repo: 'o/r', native: String(n),
    url: '', title: 'A bug', body: '', author: 'reporter', state: 'open',
    labels: [], assignees: [], paths: [], createdAt: ago(minutes), updatedAt: ago(minutes),
    ageDays: 0, idleDays: 0,
  }) as Candidate

const role = (): Role =>
  ({
    name: 'triage', sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue' } as Source],
    lane: {}, instructions: [], reviewers: [], allow: ['comment'], completion: 'unassign',
    settleSeconds: 0, cooldownMinutes: 60, pollMinutes: 10,
  }) as unknown as Role

/** `unreadable` names the items the tracker refuses to answer for; everything else reads clean. */
function deps(items: Candidate[], unreadable: (c: Candidate) => boolean) {
  const tracker = {
    name: 'github',
    search: async () => items,
    commentsSince: async (c: Candidate) => {
      if (unreadable(c)) throw new Error('API rate limit exceeded')
      return []
    },
  } as unknown as Tracker
  return { tracker, codeHost: {}, trees: {}, destination: 'o/state' } as never
}

const none = () => false
const all = () => true

const triage: typeof triageBatch = async (cs: readonly Candidate[]) => ({
  results: cs.map((candidate) => ({
    candidate,
    verdict: { outcome: 'proceed' as const, reason: 'worth a look', stage: 'model' as const },
  })),
  failures: [],
  costUsd: 0,
})

describe('a cycle that could not read the tracker', () => {
  it('brings back every item it could not read', async () => {
    // The items were dropped unexamined. Moving the watermark past them would turn one
    // outage into their silent removal from the pool: nothing touches the item, so nothing
    // ever makes it fresh again.
    stored.clear()
    const items = [candidate(7, 40), candidate(8, 20), candidate(9, 5)]

    const first = await planCycle(deps(items, all), role(), { now: NOW, identity: 'igor-bot', triage })
    expect(first.fresh).toBe(3)
    expect(first.skippedUnreadable).toBe(3)
    expect(first.toClaim).toEqual([])
    // Visible, rather than three items quietly missing from a healthy-looking cycle.
    expect(first.failures.join(' ')).toContain('comments')

    const second = await planCycle(deps(items, none), role(), { now: NOW, identity: 'igor-bot', triage })
    expect(second.fresh).toBe(3)
    expect(second.toClaim).toHaveLength(3)
  })

  it('still advances past the items it did read, which the model has already answered', async () => {
    // Freezing the mark for the whole cycle would re-bill triage for every decision already
    // made, for as long as the outage lasts.
    stored.clear()
    const items = [candidate(1, 50), candidate(2, 40), candidate(3, 30), candidate(4, 20), candidate(5, 10)]
    const asked: string[][] = []
    const watch: typeof triageBatch = async (cs) => {
      asked.push(cs.map((c) => c.native))
      return triage(cs, '', '')
    }
    const failing = (c: Candidate) => c.native === '4' || c.native === '5'

    const first = await planCycle(deps(items, failing), role(), { now: NOW, identity: 'igor-bot', triage: watch })
    expect(asked).toEqual([['1', '2', '3']])
    expect(first.skippedUnreadable).toBe(2)

    const second = await planCycle(deps(items, none), role(), { now: NOW, identity: 'igor-bot', triage: watch })
    // Only the two it never managed to read come back; the other three are settled.
    expect(second.fresh).toBe(2)
    expect(asked[1]).toEqual(['4', '5'])
  })

  it('advances it on a cycle that read everything', async () => {
    stored.clear()
    const items = [candidate(7, 40)]
    await planCycle(deps(items, none), role(), { now: NOW, identity: 'igor-bot', triage })
    const key = sourceKey({ tracker: 'github', repo: 'o/r', query: 'is:issue' })
    expect(stored.get(STATE_PATH)).toEqual({ watermarks: { [key]: { lastSeen: ago(40) } } })
  })
})
