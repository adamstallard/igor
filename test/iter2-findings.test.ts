import { describe, expect, it } from 'vitest'
import type { Candidate, CodeHost, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { checkpoint, takeClaim } from '../src/claiming.js'
import { labelVerdictFrom } from '../src/github-adapter.js'
import { isStop } from '../src/signals.js'
import { catchUpItem, dropStopped } from '../src/loop.js'
import { blobSha, type TreeProvider } from '../src/worktree.js'
import { tempDir } from './tmp.js'

const BACKEND = 'igor-backend[bot]'
const FRONTEND = 'igor-frontend[bot]'
const self = { login: FRONTEND, accountId: 1, holder: 'igor:frontend' }
const said = (body: string, time: string, login = 'alice') => ({ body, user: { login }, created_at: `2026-10-11T${time}Z` })

describe('iteration 2 findings', () => {
  it('misses a stop addressed to this Igor later in a comment that opens by stopping another Igor', () => {
    // "@igor-frontend stop" alone stops the frontend Igor; prefixing a stop for the backend one
    // must not cancel it.
    expect(isStop('@igor-frontend stop', FRONTEND)).toBe(true)
    expect(isStop('stop @igor-backend, it broke the build.\n\n@igor-frontend stop too', FRONTEND)).toBe(true)
  })

  it('misses a bare stop whose next line addresses a person', () => {
    // A stop on a line of its own names nobody; the paragraph after it talks to a human.
    expect(isStop('stop\n\n@alice can you look at what it did?', FRONTEND)).toBe(true)
  })

  it('misses a stop addressed to two Igors before the word, for the first one named', () => {
    expect(isStop('@igor-frontend stop', FRONTEND)).toBe(true)
    expect(isStop('@igor-backend @igor-frontend stop', BACKEND)).toBe(true)
  })

  it('lets a go-ahead said in the same second before the stop lift it', () => {
    // Comments arrive in creation order; GitHub dates them to the second.
    const v = labelVerdictFrom(self, ['igor:frontend'], [], [
      said('go ahead', '10:05:00'),
      said('stop', '10:05:00'),
    ], '2026-10-11T10:00:00Z', true)
    expect(v.status).toBe('stopped')
  })

  it('stops a run at its first checkpoint over a stop the claim\'s go-ahead already lifted', async () => {
    const NOW = Date.parse('2026-10-11T10:00:00Z')
    const comments = [said('stop', '10:00:03'), said('go ahead', '10:00:06')]
    const t = {
      name: 'github', nativeHolderField: false, holderField: { holds: 'list', distinctFromAssignee: true }, holder: 'igor:frontend',
      report: async () => 'x', release: async () => true,
      verifyClaim: async (_c: Candidate, _as: string, since: string, o?: { liftable?: boolean }) =>
        labelVerdictFrom(self, ['igor:frontend'], [], comments, since, o?.liftable === true),
    } as unknown as Tracker
    const role = { name: 'frontend', settleSeconds: 10, cooldownMinutes: 60 } as unknown as Role
    const item = { id: 'github:o/r#7', repo: 'o/r', native: '7', holders: [], labels: [] } as unknown as Candidate
    const claim = await takeClaim(t, item, role, FRONTEND, {
      wait: async () => {}, now: () => NOW, announce: false, since: '2026-10-11T09:59:00Z',
    })
    expect(claim.outcome).toBe('held')
    expect((await checkpoint(t, claim, FRONTEND)).status).toBe('held')
  })

  it('lifts an undatable stop by a go-ahead after it in the list', () => {
    const v = labelVerdictFrom(self, ['igor:frontend'], [], [
      { body: 'stop', user: { login: 'alice' }, created_at: 'unknown' },
      said('go ahead', '10:05:00'),
    ], '2026-10-11T10:00:00Z', true)
    expect(v).toEqual({ status: 'held', liftedAt: '2026-10-11T10:05:00Z' })
  })

  it('keeps a stopped item out of the cycle where the go-ahead preceded the stop in the same second', async () => {
    const report = { skipped: [] as any[], skippedStopped: 0, skippedUnreadable: 0 }
    const item = { id: 'github:o/r#7', repo: 'o/r', holders: [], labels: [], assignees: [], updatedAt: '2026-10-11T10:05:00Z' } as unknown as Candidate
    const kept = await dropStopped(
      { commentsSince: async () => [
        { author: 'alice', at: '2026-10-11T10:05:00Z', body: 'go ahead' },
        { author: 'alice', at: '2026-10-11T10:05:00Z', body: 'stop' },
      ] } as any,
      [item], 60, FRONTEND, report, Date.parse('2026-10-11T10:10:00Z'),
    )
    expect(kept).toEqual([])
  })

  it('keeps a person\'s label when a catch-up ends normally after its claim\'s go-ahead lifted a stop', async () => {
    const labels = new Set(['igor:triage'])
    const comments = [
      { body: 'stop', user: { login: 'bob' }, created_at: '2026-10-11T00:30:05Z' },
      { body: 'go ahead', user: { login: 'bob' }, created_at: '2026-10-11T00:30:08Z' },
    ]
    const me = { login: 'igor-bot', accountId: 1, holder: 'igor:triage' }
    const tracker: Tracker = {
      name: 'github', nativeHolderField: true, holderField: { holds: 'list', distinctFromAssignee: true }, holder: 'igor:triage',
      holderSetBy: async () => (labels.has('igor:triage') ? { self: false, by: 'adam', at: '2026-10-10T00:00:00Z' } : undefined),
      directed: async () => [], findLinking: async () => undefined,
      createIssue: async () => '', identity: async () => 'igor-bot', search: async () => [],
      claim: async () => { labels.add('igor:triage'); return true },
      commentsSince: async () => comments.map((c) => ({ author: c.user.login, at: c.created_at, body: c.body })),
      verifyClaim: async (_c: Candidate, _as: string, since: string, o?: { liftable?: boolean }) =>
        labelVerdictFrom(me, [...labels], [], comments, since, o?.liftable === true),
      report: async () => 'x',
      release: async () => { labels.delete('igor:triage'); return true }, linkage: () => '',
    } as unknown as Tracker
    let asks = 0
    const codeHost = { name: 'github', produce: async () => ({}),
      catchUp: async () => { asks += 1; return asks === 1 ? { outcome: 'conflict' } : { outcome: 'already-current' } },
      resolve: async () => 'sha' } as unknown as CodeHost
    const trees: TreeProvider = { name: 'f', provision: async () => ({
      path: tempDir('i2-'), outbox: tempDir('i2o-'), repo: 'o/r',
      changes: async () => [{ path: 'src/a.ts', content: 'resolved\n', kind: 'modified' }],
      merge: async () => ({ conflicts: ['src/a.ts'], head: 'h', broughtIn: 'b',
        baseChanges: [{ path: 'src/a.ts', before: blobSha('base\n'), after: blobSha('theirs\n'), head: blobSha('ours\n') }] }),
      release: async () => {},
    }) } as any
    const role = { name: 'triage', reviewers: [], allow: ['comment', 'draft-pr', 'unassign'], commands: [], completion: 'unassign',
      instructions: [], settleSeconds: 0, cooldownMinutes: 60, pollMinutes: 10, lane: {},
      sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue is:open' }] } as unknown as Role
    const item = { id: 'github:o/r#7', tracker: 'github', repo: 'o/r', native: '7', title: 'x', body: '',
      author: 'r', state: 'open', labels: ['igor:triage'], assignees: [], holders: ['igor:triage'], paths: [],
      createdAt: '2026-09-13T00:00:00Z', updatedAt: '2026-09-13T00:00:00Z', ageDays: 0, idleDays: 0,
      inFlight: { kind: 'pull-request', ref: '#71', url: 'u', draft: true, author: 'igor-bot', mergeable: 'conflicting',
        branch: 'igor/triage/7', base: 'main' } } as unknown as Candidate
    const run = await catchUpItem({ tracker, codeHost, trees, destination: 'o/lore' } as any, item, role, 'igor-bot',
      { claim: { wait: async () => {}, now: () => Date.parse('2026-10-11T00:30:00Z') },
        worker: async () => ({ result: 'ok', total_cost_usd: 0 }) } as any)
    expect(run.outcome).toBe('produced')
    expect([...labels]).toEqual(['igor:triage'])
  })
})
