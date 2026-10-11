import { describe, expect, it } from 'vitest'
import type { Candidate, CodeHost, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { catchUpItem } from '../src/loop.js'
import { labelVerdictFrom } from '../src/github-adapter.js'

const role = { name: 'triage', reviewers: [], allow: ['comment', 'draft-pr', 'unassign'], commands: [], completion: 'unassign',
  instructions: [], settleSeconds: 0, cooldownMinutes: 60, pollMinutes: 10, lane: {},
  sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue is:open' }] } as unknown as Role
const item = (): Candidate => ({ id: 'github:o/r#7', tracker: 'github', repo: 'o/r', native: '7', title: 'x', body: '',
  author: 'r', state: 'open', labels: ['igor:triage'], assignees: [], holders: ['igor:triage'], paths: [], createdAt: '2026-09-13T00:00:00Z',
  updatedAt: '2026-09-13T00:00:00Z', ageDays: 0, idleDays: 0,
  inFlight: { kind: 'pull-request', ref: '#71', url: 'u', draft: true, author: 'igor-bot', mergeable: 'conflicting', branch: 'igor/triage/7', base: 'main' } } as unknown as Candidate)

it('keeps the person\'s label when a stop said before the hand-over is edited during the catch-up', async () => {
  const now = new Date(Date.now() + 60_000).toISOString()
  const raw = [{ author: 'bob', created: '2026-10-09T00:00:00Z', updated: now, body: 'stop — waiting on the design (edit: design done)' }]
  const labels = new Set(['igor:triage'])
  const said: string[] = []
  const tracker = {
    name: 'github', nativeHolderField: true, holderField: { holds: 'list', distinctFromAssignee: true }, holder: 'igor:triage',
    holderSetBy: async () => (labels.has('igor:triage') ? { self: false, by: 'adam', at: '2026-10-10T00:00:00Z' } : undefined),
    directed: async () => [], findLinking: async () => undefined, createIssue: async () => '', identity: async () => 'igor-bot', search: async () => [],
    claim: async () => { labels.add('igor:triage'); return true },
    commentsSince: async (_c: Candidate, since: string) => raw.filter((c) => Date.parse(c.updated) >= Date.parse(since)).map((c) => ({ author: c.author, at: c.created, body: c.body })),
    // As GitHub's `verifyClaim`: the comments `since` returns, which it filters on updated_at.
    verifyClaim: async (_c: Candidate, _as: string, since: string) => labelVerdictFrom(
      { login: 'igor-bot', accountId: 1, holder: 'igor:triage' }, [...labels], undefined,
      raw.filter((c) => Date.parse(c.updated) >= Date.parse(since)).map((c) => ({ body: c.body, user: { login: c.author }, created_at: c.created })),
      since,
    ),
    report: async (_c: Candidate, m: string) => { said.push(m); return 'x' },
    release: async () => { labels.delete('igor:triage'); return true }, linkage: () => '',
  } as unknown as Tracker
  const codeHost = { name: 'github', produce: async () => ({}), catchUp: async () => ({ outcome: 'conflict' }), resolve: async () => '' } as unknown as CodeHost
  const trees = { name: 'f', provision: async () => { throw new Error('x') } }
  const run = await catchUpItem({ tracker, codeHost, trees, destination: 'o/lore' } as any, item(), role, 'igor-bot', { claim: { wait: async () => {} } } as any)
  expect([...labels]).toEqual(['igor:triage'])
})
