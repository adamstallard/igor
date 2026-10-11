import { describe, expect, it } from 'vitest'
import type { Candidate, CodeHost, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { catchUpItem, findDirected } from '../src/loop.js'
import { blobSha, type TreeProvider } from '../src/worktree.js'
import { tempDir } from './tmp.js'

const role = { name: 'triage', reviewers: [], allow: ['comment', 'draft-pr', 'unassign'], commands: [], completion: 'unassign',
  instructions: [], settleSeconds: 0, cooldownMinutes: 60, pollMinutes: 10, lane: {},
  sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue is:open' }] } as unknown as Role
const item = (): Candidate => ({ id: 'github:o/r#7', tracker: 'github', repo: 'o/r', native: '7', title: 'x', body: '',
  author: 'r', state: 'open', labels: ['igor:triage'], assignees: [], holders: ['igor:triage'], paths: [], createdAt: '2026-09-13T00:00:00Z',
  updatedAt: '2026-09-13T00:00:00Z', ageDays: 0, idleDays: 0,
  inFlight: { kind: 'pull-request', ref: '#71', url: 'u', draft: true, author: 'igor-bot', mergeable: 'conflicting', branch: 'igor/triage/7', base: 'main' } } as unknown as Candidate)

describe('a stop during a catch-up', () => {
  it('takes the label off for a stop that arrives after the resolution is pushed', async () => {
    const labels = new Set(['igor:triage'])
    const setter = { self: false, by: 'adam', at: '2026-10-10T00:00:00Z' }
    const said: string[] = []
    let pushed = false
    const verdicts: string[] = []
    const tracker: Tracker = {
      name: 'github', nativeHolderField: true, holderField: { holds: 'list', distinctFromAssignee: true }, holder: 'igor:triage',
      holderSetBy: async () => (labels.has('igor:triage') ? setter : undefined), directed: async () => [], findLinking: async () => undefined,
      createIssue: async () => '', identity: async () => 'igor-bot', search: async () => [],
      claim: async () => { labels.add('igor:triage'); return true },
      // The stop `verifyClaim` reports is bob's comment, on the item from the moment he made it.
      commentsSince: async () => (pushed ? [{ author: 'bob', at: '2026-10-11T01:00:00Z', body: 'stop' }] : []),
      verifyClaim: async () => { const v = pushed ? { status: 'stopped', by: 'bob', at: '2026-10-11T01:00:00Z' } : { status: 'held' }; verdicts.push(v.status); return v as any },
      report: async (_c, m) => { said.push(m); return 'x' },
      release: async (_c, _a, how) => { labels.delete('igor:triage'); return true }, linkage: () => '',
    } as unknown as Tracker
    let asks = 0
    const codeHost = { name: 'github', produce: async () => ({}),
      catchUp: async () => { asks += 1; return asks === 1 ? { outcome: 'conflict' } : { outcome: 'already-current' } },
      resolve: async () => { pushed = true; return 'sha' } } as unknown as CodeHost
    const trees: TreeProvider = { name: 'f', provision: async () => ({
      path: tempDir('s6-'), outbox: tempDir('s6o-'), repo: 'o/r',
      changes: async () => [{ path: 'src/a.ts', content: 'resolved\n', kind: 'modified' }],
      merge: async () => ({ conflicts: ['src/a.ts'], head: 'h', broughtIn: 'b',
        baseChanges: [{ path: 'src/a.ts', before: blobSha('base\n'), after: blobSha('theirs\n'), head: blobSha('ours\n') }] }),
      release: async () => {},
    }) } as any
    await catchUpItem({ tracker, codeHost, trees, destination: 'o/lore' } as any, item(), role, 'igor-bot',
      // The run starts at 00:30, so bob's stop at 01:00 lands during it.
      { claim: { wait: async () => {}, now: () => Date.parse('2026-10-11T00:30:00Z') }, worker: async () => ({ result: 'ok', total_cost_usd: 0 }) } as any)
    // Is the item directed afterwards? stop comment by bob at 01:00 after handover 00:00
    const t = Object.assign(Object.create(tracker), {
      directed: async () => [{ ...item(), inFlight: undefined }],
      commentsSince: async () => [{ author: 'bob', at: '2026-10-11T01:00:00Z', body: 'stop' }],
    })
    const r = await findDirected(t, role, 'igor-bot', { holder: 'igor:triage', distinctFromAssignee: true } as any, { failures: [] })
    expect([...labels]).toEqual([])
    expect(r.directed).toHaveLength(0)
  })
})
