import { describe, expect, it, vi } from 'vitest'
import type { Candidate, Source, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import type { TreeProvider, WorkingTree } from '../src/worktree.js'
import { tempDir } from './tmp.js'

vi.mock('../src/state.js', () => ({
  readState: async () => undefined, writeState: async () => true, appendRecord: async () => {},
}))
const { runItem, planCycle } = await import('../src/loop.js')
const { shouldDefer } = await import('../src/deferred.js')

const ME = 'igor-frontend[bot]'
const role = {
  name: 'frontend', sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue' } as Source],
  lane: { labels: { includes: [['frontend']] } }, instructions: [], reviewers: [], allow: ['comment'], commands: [], completion: 'unassign',
  settleSeconds: 0, cooldownMinutes: 60, pollMinutes: 10,
} as unknown as Role

describe('a directed item handed back with a cure', () => {
  it('names the cure and says how to hand it over again, since nothing brings it back', async () => {
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
      holderSetBy: async () => (labels.includes('igor:frontend') ? { self: false, by: 'adam', at: '2026-10-10T11:00:00Z' } : undefined),
      linkage: () => 'Closes #1',
    } as unknown as Tracker
    const trees = { name: 'x', provision: async (): Promise<WorkingTree> => ({
      path: tempDir('igor-cure-'), outbox: tempDir('igor-cure-outbox-'), repo: 'o/r', changes: async () => [], release: async () => {},
    }) } as unknown as TreeProvider
    const deps = { tracker, codeHost: { name: 'github' }, trees, destination: 'o/state' } as never

    const first = await planCycle(deps, role, { identity: ME, preview: true })
    expect(first.toClaim.map((c) => [c.candidate.native, c.directed])).toEqual([['1', true]])
    const run = await runItem(deps, item(), role, ME, {
      claim: { directed: true },
      budget: { exhausted: () => false, seat: 'team-seat', token: { tokenEnv: 'IGOR_SEAT_UNSET_99' } },
      worker: async () => { throw new Error('the worker must never be reached') },
    } as never)
    // The cure still keeps the item out of the deferral record.
    expect(run.cures).toEqual(['seat:team-seat:token'])
    expect(shouldDefer(run.outcome, run.handoff, run.cures)).toBe(false)

    const second = await planCycle(deps, role, { identity: ME, preview: true })
    expect(second.toClaim).toEqual([])
    const handoff = posted.at(-1)!
    expect(handoff).toContain('`seat:team-seat:token` is what would change it')
    expect(handoff).toContain('add the `igor:frontend` label again')
    expect(handoff).not.toMatch(/comes back to this/)
  })
})
