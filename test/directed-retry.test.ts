import { describe, expect, it, vi } from 'vitest'
import type { Candidate, Source, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'

vi.mock('../src/state.js', () => ({
  readState: async () => undefined, writeState: async () => true, appendRecord: async () => {},
}))
const { runItem, planCycle } = await import('../src/loop.js')

const ME = 'igor-frontend[bot]'
const role = {
  name: 'frontend', sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue' } as Source],
  lane: { labels: { includes: [['frontend']] } }, instructions: [], reviewers: [], allow: ['comment'],
  settleSeconds: 0, cooldownMinutes: 60, pollMinutes: 10,
} as unknown as Role

describe('a directed item whose run fails before the worker', () => {
  it('says how to hand it over again, since the release spent the hand-over', async () => {
    let labels = ['igor:frontend', 'backend-only']
    const posted: string[] = []
    const item = (): Candidate => ({
      id: 'github:o/r#1', tracker: 'github', repo: 'o/r', native: '1', url: '', title: 'API bug', body: '',
      author: 'adam', state: 'open', labels, assignees: [], holders: labels.filter((l) => l.startsWith('igor:')),
      paths: [], createdAt: '2026-10-10T10:00:00Z', updatedAt: new Date().toISOString(), ageDays: 0, idleDays: 0,
    }) as Candidate
    const tracker = {
      name: 'github', holder: 'igor:frontend', nativeHolderField: true,
      holderField: { holds: 'list', distinctFromAssignee: true },
      claim: async () => true,
      report: async (_c: Candidate, m: string) => { posted.push(m); return 'u' },
      verifyClaim: async () => ({ status: 'held' }),
      release: async () => { labels = labels.filter((l) => l !== 'igor:frontend'); return true },
      commentsSince: async () => [],
      search: async () => [item()],
      directed: async () => (labels.includes('igor:frontend') ? [item()] : []),
      holderSetBy: async () => ({ self: false, by: 'adam', at: '2026-10-10T11:00:00Z' }),
      linkage: () => 'Closes #1',
    } as unknown as Tracker
    const deps = { tracker, codeHost: { name: 'github' }, trees: { name: 'x', provision: async () => { throw new Error('clone failed: 503') } }, destination: 'o/state' } as never

    const first = await planCycle(deps, role, { identity: ME, preview: true })
    const run = await runItem(deps, item(), role, ME, { claim: { directed: true } })
    const second = await planCycle(deps, role, { identity: ME, preview: true })
    // The release is owed, so the hand-over is spent; the handoff must say how to renew it,
    // not promise a retry the lane will refuse.
    expect(second.toClaim.map((c) => c.candidate.native)).toEqual([])
    const handoff = posted.find((p) => p.includes('clone failed'))!
    expect(handoff).not.toContain('try again next cycle')
    expect(handoff).toContain('add the `igor:frontend` label again')
  })
})
