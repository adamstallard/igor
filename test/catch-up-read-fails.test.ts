import { describe, expect, it } from 'vitest'
import type { Candidate, CodeHost, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { catchUpItem } from '../src/loop.js'

const role = { name: 'triage', reviewers: [], allow: ['comment', 'draft-pr'], commands: [],
  instructions: [], settleSeconds: 0, cooldownMinutes: 60, pollMinutes: 10, lane: {},
  sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue is:open' }] } as unknown as Role
const item = (holders: string[] = []): Candidate => ({ id: 'github:o/r#7', tracker: 'github', repo: 'o/r', native: '7', title: 'x', body: '',
  author: 'r', state: 'open', labels: [...holders], assignees: [], holders, paths: [], createdAt: '2026-09-13T00:00:00Z',
  updatedAt: '2026-09-13T00:00:00Z', ageDays: 0, idleDays: 0,
  inFlight: { kind: 'pull-request', ref: '#71', url: 'u', draft: true, author: 'igor-bot', mergeable: 'conflicting', branch: 'igor/triage/7', base: 'main' } } as unknown as Candidate)

describe('a catch-up that cannot read who set the label when it gives its claim back', () => {
// Exits other than a stop. A stop removes the label without asking who set it (catch-up-hand-over.test.ts).
for (const verdict of [{ status: 'held' }, { status: 'lost', by: 'igor-other[bot]' }]) {
  it(`releases the label its own claim put on an item the cycle read without it (${verdict.status})`, async () => {
    const w = world(new Set<string>(), verdict)
    await catchUpItem(w.deps, item(), role, 'igor-bot')
    expect([...w.labels]).toEqual([])
    expect(w.reads).toBe(1)
  })

  it(`keeps a label the cycle read on the item and says nothing about it (${verdict.status})`, async () => {
    const w = world(new Set(['igor:triage']), verdict)
    await catchUpItem(w.deps, item(['igor:triage']), role, 'igor-bot')
    expect([...w.labels]).toEqual(['igor:triage'])
    expect(w.said.some((m) => m.startsWith('This still carries the `igor:triage` label'))).toBe(false)
  })
}
})

// Who set the label cannot be read; everything else answers.
function world(labels: Set<string>, verdict: unknown) {
  const said: string[] = []
  const w = { labels, said, reads: 0, deps: undefined as any }
  const tracker = {
    name: 'github', nativeHolderField: true, holderField: { holds: 'list', distinctFromAssignee: true }, holder: 'igor:triage',
    holderSetBy: async () => { w.reads++; throw new Error('HTTP 502') },
    directed: async () => [], findLinking: async () => undefined, createIssue: async () => '', identity: async () => 'igor-bot', search: async () => [],
    claim: async () => { labels.add('igor:triage'); return true },
    commentsSince: async () => [], verifyClaim: async () => verdict,
    report: async (_c: any, m: string) => { said.push(m); return 'x' },
    release: async () => { labels.delete('igor:triage'); return true }, linkage: () => '',
  } as unknown as Tracker
  const codeHost = { name: 'github', produce: async () => ({}), catchUp: async () => ({ outcome: 'conflict' }), resolve: async () => '' } as unknown as CodeHost
  const trees = { name: 'f', provision: async () => { throw new Error('disk on fire') } }
  w.deps = { tracker, codeHost, trees, destination: 'o/lore' }
  return w
}
