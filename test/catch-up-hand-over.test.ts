import { describe, expect, it } from 'vitest'
import type { Candidate, CodeHost, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { catchUpItem, findDirected } from '../src/loop.js'
import { tempDir } from './tmp.js'

const role = { name: 'triage', reviewers: [], allow: ['comment', 'draft-pr', 'unassign'], commands: [], completion: 'unassign',
  instructions: [], settleSeconds: 0, cooldownMinutes: 60, pollMinutes: 10, lane: {},
  sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue is:open' }] } as unknown as Role
const item = (holders: string[]): Candidate => ({ id: 'github:o/r#7', tracker: 'github', repo: 'o/r', native: '7', title: 'x', body: '',
  author: 'r', state: 'open', labels: [...holders], assignees: [], holders, paths: [], createdAt: '2026-09-13T00:00:00Z',
  updatedAt: '2026-09-13T00:00:00Z', ageDays: 0, idleDays: 0,
  inFlight: { kind: 'pull-request', ref: '#71', url: 'u', draft: true, author: 'igor-bot', mergeable: 'conflicting', branch: 'igor/triage/7', base: 'main' } } as unknown as Candidate)

// The holder field as GitHub keeps it: who set the label is whoever last added it, and nobody
// once it is gone. Adding a label already there records nothing.
function world(live: string[], setBy: () => any, verdict: any = { status: 'held' }) {
  const labels = new Set(live)
  let setter = setBy()
  const said: string[] = []
  const tracker: Tracker = {
    name: 'github', nativeHolderField: true, holderField: { holds: 'list', distinctFromAssignee: true }, holder: 'igor:triage',
    holderSetBy: async () => (labels.has('igor:triage') ? setter : undefined), directed: async () => [], findLinking: async () => undefined,
    createIssue: async () => '', identity: async () => 'igor-bot', search: async () => [],
    claim: async () => {
      if (!labels.has('igor:triage')) setter = { self: true, by: 'igor-bot', at: '2026-10-11T01:00:00Z' }
      labels.add('igor:triage'); return true
    },
    commentsSince: async () => [], verifyClaim: async () => verdict,
    report: async (_c, m) => { said.push(m); return 'x' },
    release: async () => { labels.delete('igor:triage'); return true }, linkage: () => '',
  } as unknown as Tracker
  const codeHost = { name: 'github', produce: async () => ({}), catchUp: async () => ({ outcome: 'conflict' }), resolve: async () => '' } as unknown as CodeHost
  const trees = { name: 'f', provision: async () => { throw new Error('disk on fire') } }
  return { deps: { tracker, codeHost, trees, destination: 'o/lore' } as any, labels, said }
}

describe('a catch-up on an item a person handed over', () => {
  it('leaves no label of its own where the person took theirs off after the cycle read it', async () => {
    const w = world([], () => ({ self: false, by: 'adam', at: '2026-10-10T00:00:00Z' }))
    await catchUpItem(w.deps, item(['igor:triage']), role, 'igor-bot')
    expect([...w.labels]).toEqual([])
  })

  it('keeps a label a person added after the cycle read the item', async () => {
    const w = world(['igor:triage'], () => ({ self: false, by: 'adam', at: '2026-10-11T00:00:00Z' }))
    await catchUpItem(w.deps, item([]), role, 'igor-bot')
    expect([...w.labels]).toEqual(['igor:triage'])
  })
})
