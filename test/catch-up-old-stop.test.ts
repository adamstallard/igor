import { describe, expect, it } from 'vitest'
import type { Candidate, CodeHost, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { catchUpItem, findDirected } from '../src/loop.js'

const role = { name: 'triage', reviewers: [], allow: ['comment', 'draft-pr', 'unassign'], commands: [], completion: 'unassign',
  instructions: [], settleSeconds: 0, cooldownMinutes: 60, pollMinutes: 10, lane: {},
  sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue is:open' }] } as unknown as Role
const item = (): Candidate => ({ id: 'github:o/r#7', tracker: 'github', repo: 'o/r', native: '7', title: 'x', body: '',
  author: 'r', state: 'open', labels: ['igor:triage'], assignees: [], holders: ['igor:triage'], paths: [], createdAt: '2026-09-13T00:00:00Z',
  updatedAt: '2026-09-13T00:00:00Z', ageDays: 0, idleDays: 0,
  inFlight: { kind: 'pull-request', ref: '#71', url: 'u', draft: true, author: 'igor-bot', mergeable: 'conflicting', branch: 'igor/triage/7', base: 'main' } } as unknown as Candidate)

// GitHub's issue comments: `since` filters on updated_at, `at` is created_at (commentsFrom).
function world(raw: { author: string; created: string; updated: string; body: string }[]) {
  const labels = new Set(['igor:triage'])
  const setter = { self: false, by: 'adam', at: '2026-10-10T00:00:00Z' }
  const said: string[] = []
  const tracker: Tracker = {
    name: 'github', nativeHolderField: true, holderField: { holds: 'list', distinctFromAssignee: true }, holder: 'igor:triage',
    holderSetBy: async () => (labels.has('igor:triage') ? setter : undefined), directed: async () => [], findLinking: async () => undefined,
    createIssue: async () => '', identity: async () => 'igor-bot', search: async () => [],
    claim: async () => { labels.add('igor:triage'); return true },
    commentsSince: async (_c: Candidate, since: string) => raw.filter((c) => Date.parse(c.updated) >= Date.parse(since))
      .map((c) => ({ author: c.author, at: c.created, body: c.body })),
    verifyClaim: async () => ({ status: 'held' }),
    report: async (_c, m) => { said.push(m); return 'x' },
    release: async () => { labels.delete('igor:triage'); return true }, linkage: () => '',
  } as unknown as Tracker
  const codeHost = { name: 'github', produce: async () => ({}), catchUp: async () => ({ outcome: 'conflict' }), resolve: async () => '' } as unknown as CodeHost
  const trees = { name: 'f', provision: async () => { throw new Error('disk on fire') } }
  return { deps: { tracker, codeHost, trees, destination: 'o/lore' } as any, labels, said }
}

describe('a catch-up and a stop it did not meet', () => {
  it('a stop said before the hand-over, edited after it, does not cancel the hand-over', async () => {
    const w = world([{ author: 'bob', created: '2026-10-09T00:00:00Z', updated: '2026-10-10T05:00:00Z', body: 'stop — waiting on the design (edit: design done)' }])
    const run = await catchUpItem(w.deps, item(), role, 'igor-bot')
    expect([...w.labels]).toEqual(['igor:triage'])
  })
  it('a stop lifted by a go-ahead before this catch-up began; the catch-up ends by failure', async () => {
    const w = world([
      { author: 'bob', created: '2026-10-10T01:00:00Z', updated: '2026-10-10T01:00:00Z', body: '@igor-bot stop' },
      { author: 'bob', created: '2026-10-10T02:00:00Z', updated: '2026-10-10T02:00:00Z', body: '@igor-bot go ahead' },
    ])
    const run = await catchUpItem(w.deps, item(), role, 'igor-bot')
    expect([...w.labels]).toEqual(['igor:triage'])
  })
  it('findDirected answers a hand-over whose only stop was created before it and edited after it', async () => {
    const w = world([{ author: 'bob', created: '2026-10-09T00:00:00Z', updated: '2026-10-10T05:00:00Z', body: 'stop — waiting on the design (edit: design done)' }])
    const t = Object.assign(Object.create(w.deps.tracker), { directed: async () => [{ ...item(), inFlight: undefined }] })
    const r = await findDirected(t, role, 'igor-bot', { holder: 'igor:triage', distinctFromAssignee: true } as any, { failures: [] })
    expect(r.directed).toHaveLength(1)
  })
})
