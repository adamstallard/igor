import { describe, expect, it, vi } from 'vitest'
import type { Candidate, ReleaseHow, Source, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { stopReceipt } from '../src/claiming.js'
import { labelVerdictFrom } from '../src/github-adapter.js'

vi.mock('../src/state.js', () => ({
  readState: async () => undefined, writeState: async () => true, appendRecord: async () => {},
}))
const { runItem } = await import('../src/loop.js')

const ME = 'igor-frontend[bot]'
const role = {
  name: 'frontend', sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue' } as Source],
  lane: { labels: { includes: [['frontend']] } }, instructions: [], reviewers: [], allow: ['comment'], commands: [], completion: 'unassign',
  settleSeconds: 10, cooldownMinutes: 60, pollMinutes: 10,
} as unknown as Role

const HANDED_OVER = '2026-10-10T10:00:00Z'
const CLAIMED = Date.parse('2026-10-10T10:07:00Z')

describe('a directed claim', () => {
  it('is stopped by a stop said after the hand-over and before the claim', async () => {
    // Said between the cycle reading the item and the claim, minutes before it.
    const comments = [{ body: 'stop', user: { login: 'bob' }, created_at: '2026-10-10T10:05:00Z', updated_at: '2026-10-10T10:05:00Z' }]
    const posted: string[] = []
    const releases: (ReleaseHow | undefined)[] = []
    const item = { id: 'github:o/r#1', tracker: 'github', repo: 'o/r', native: '1', url: '', title: 't', body: '', author: 'adam',
      state: 'open', labels: ['igor:frontend'], assignees: [], holders: ['igor:frontend'], paths: [] } as unknown as Candidate
    const tracker = {
      name: 'github', holder: 'igor:frontend', nativeHolderField: true,
      holderField: { holds: 'list', distinctFromAssignee: true },
      claim: async () => true,
      report: async (_c: Candidate, m: string) => { posted.push(m); return 'u' },
      // GitHub's `since` filters on the edit time; the verdict then reads the creation time.
      verifyClaim: async (_c: Candidate, _as: string, since: string) =>
        labelVerdictFrom({ login: ME, accountId: 1, holder: 'igor:frontend' }, ['igor:frontend'], undefined,
          comments.filter((c) => Date.parse(c.updated_at) >= Date.parse(since)), since),
      release: async (_c: Candidate, _as: string, how?: ReleaseHow) => { releases.push(how); return true },
    } as unknown as Tracker
    const deps = { tracker, codeHost: { name: 'github' }, trees: { name: 'x' }, destination: 'o/state' } as never

    const run = await runItem(deps, item, role, ME, {
      claim: { directed: true, since: HANDED_OVER, now: () => CLAIMED, wait: async () => {} },
    })

    expect(run.outcome).toBe('stopped')
    expect(releases).toEqual([{ stop: true }])
    expect(posted.at(-1)).toBe(stopReceipt(role, { status: 'stopped', by: 'bob' }))
  })
})
