import { describe, expect, it, vi } from 'vitest'
import type { Candidate, Source, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { claimStuck, claimWithdrawn } from '../src/claiming.js'

vi.mock('../src/state.js', () => ({
  readState: async () => undefined, writeState: async () => true, appendRecord: async () => {},
}))
const { runItem, planCycle } = await import('../src/loop.js')

const ME = 'igor-frontend[bot]'
const role = {
  name: 'frontend', sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue' } as Source],
  lane: { labels: { includes: [['frontend']] } }, instructions: [], reviewers: [], allow: ['comment'], commands: [], completion: 'unassign',
  settleSeconds: 0, cooldownMinutes: 60, pollMinutes: 10,
} as unknown as Role

function setup(releaseClears: boolean) {
  let labels = ['igor:frontend', 'backend-only']
  const posted: { at: string; body: string; author: string }[] = []
  let verifies = 0
  const item = (): Candidate => ({
    id: 'github:o/r#1', tracker: 'github', repo: 'o/r', native: '1', url: '', title: 'API bug', body: '',
    author: 'adam', state: 'open', labels, assignees: [], holders: labels.filter((l) => l.startsWith('igor:')),
    paths: [], createdAt: '2026-10-10T10:00:00Z', updatedAt: new Date().toISOString(), ageDays: 0, idleDays: 0,
  }) as Candidate
  const tracker = {
    name: 'github', holder: 'igor:frontend', nativeHolderField: true,
    holderField: { holds: 'list', distinctFromAssignee: true },
    claim: async () => true,
    report: async (_c: Candidate, m: string) => { posted.push({ at: new Date().toISOString(), body: m, author: ME }); return 'u' },
    verifyClaim: async () => { verifies += 1; if (verifies === 1) throw new Error('HTTP 502'); return { status: 'held' } },
    release: async () => {
      if (releaseClears) labels = labels.filter((l) => l !== 'igor:frontend')
      return releaseClears
    },
    commentsSince: async () => posted,
    search: async () => [item()],
    directed: async () => (labels.includes('igor:frontend') ? [item()] : []),
    holderSetBy: async () => (labels.includes('igor:frontend') ? { self: false, by: 'adam', at: '2026-10-10T11:00:00Z' } : undefined),
    linkage: () => 'Closes #1',
  } as unknown as Tracker
  const deps = { tracker, codeHost: { name: 'github' }, trees: { name: 'x' }, destination: 'o/state' } as never
  return { deps, item, posted }
}

describe('a directed claim whose claim window fails', () => {
  it('withdraws, and says how to hand it over again, since the release spent the hand-over', async () => {
    const { deps, item, posted } = setup(true)
    const run = await runItem(deps, item(), role, ME, { claim: { directed: true } })
    expect(run.outcome).toBe('refused')
    expect(posted.at(-1)!.body).toBe(claimWithdrawn(role, true))
    expect(posted.at(-1)!.body).toContain('add the `igor:frontend` label again')
    const next = await planCycle(deps, role, { identity: ME, preview: true })
    expect(next.toClaim).toEqual([])
  })

  it('where the label is stuck, says to remove it and add it again', async () => {
    const { deps, item, posted } = setup(false)
    await runItem(deps, item(), role, ME, { claim: { directed: true } })
    const said = posted.at(-1)!.body
    expect(said).toBe(claimStuck(role, true))
    expect(said.startsWith(claimStuck(role))).toBe(true)
    expect(said).toContain('remove the label and add it again')
  })

  it('says neither to an undirected claim', () => {
    expect(claimWithdrawn(role)).not.toMatch(/label again|add it again/)
    expect(claimStuck(role)).not.toMatch(/add it again/)
  })
})
