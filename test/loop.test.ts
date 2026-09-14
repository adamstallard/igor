import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Artifact, Candidate, ClaimVerdict, CodeHost, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import type { TreeProvider, WorkingTree, ChangedFile } from '../src/worktree.js'
import { runItem, type ItemDeps } from '../src/loop.js'

const candidate = (over: Partial<Candidate> = {}): Candidate =>
  ({ id: 'github:o/r#7', repo: 'o/r', native: '7', title: 'A bug', body: '', author: 'reporter', assignees: [], labels: [], paths: [], state: 'open' }) as Candidate

const role = (over: Partial<Role> = {}): Role =>
  ({ name: 'triage', reviewers: ['alice'], allow: ['comment', 'draft-pr', 'unassign'], completion: 'unassign', instructions: [], settleSeconds: 0, cooldownMinutes: 60, ...over }) as Role

function deps(opts: {
  verdicts?: ClaimVerdict[]
  claimSticks?: boolean
  changes?: ChangedFile[]
} = {}) {
  const posts: string[] = []
  const released: string[] = []
  let i = 0
  const verdicts = opts.verdicts ?? [{ status: 'held' }]

  const tracker: Tracker = {
    name: 'fake',
    nativeHolderField: true,
    identity: async () => 'igor-bot',
    search: async () => [],
    claim: async () => opts.claimSticks ?? true,
    verifyClaim: async () => verdicts[Math.min(i++, verdicts.length - 1)]!,
    report: async (_c, m) => { posts.push(m) },
    release: async (_c, as) => { released.push(as) },
    linkage: () => 'Closes #7',
  }
  const codeHost: CodeHost = {
    name: 'fake',
    produce: async (): Promise<Artifact> => ({ kind: 'pull-request', ref: '#9', url: 'https://example.test/9' }),
  }
  const trees: TreeProvider = {
    name: 'fake',
    provision: async (): Promise<WorkingTree> => ({
      path: mkdtempSync(join(tmpdir(), 'igor-loop-')),
      repo: 'o/r',
      changes: async () => opts.changes ?? [],
      release: async () => {},
    }),
  }
  return { d: { tracker, codeHost, trees } as ItemDeps, posts, released }
}

const noWait = { claim: { wait: async () => {} } }

/** A worker that fails the way a missing CLI would, without spawning anything. */
const brokenWorker = async () => { throw new Error('claude: command not found') }
/** A worker that runs fine and touches nothing. */
const idleWorker = async () => ({ result: 'I looked and there is nothing to change.', total_cost_usd: 0.01 })

describe('an Igor never goes silent on something it claimed', () => {
  it('hands off when the budget is gone before it starts', async () => {
    const { d, posts, released } = deps()
    const r = await runItem(d, candidate(), role(), 'igor-bot', {
      ...noWait,
      budget: { exhausted: () => true, seat: 'igor-1', resetAt: new Date(Date.now() + 3600_000).toISOString() },
    })
    expect(r.outcome).toBe('handed-off')
    expect(r.spoke).toBe(true)
    expect(posts.at(-1)).toMatch(/budget.*igor-1/s)
    expect(released).toEqual(['igor-bot'])
  })

  it('hands off rather than retrying when the worker cannot run', async () => {
    // A silent retry on a claimed item is the failure the claim protocol makes worst.
    const { d, posts } = deps()
    const r = await runItem(d, candidate(), role(), 'igor-bot', {
      ...noWait,
      worker: brokenWorker,
    })
    expect(r.outcome).toBe('handed-off')
    expect(r.spoke).toBe(true)
    expect(posts.at(-1)).toMatch(/will not try again/i)
  })

  it('explains itself even when it found nothing to change', async () => {
    // Releasing an unchanged item unremarked leaves it looking handled when it is not.
    const { d, posts } = deps({ changes: [] })
    const r = await runItem(d, candidate(), role(), 'igor-bot', { ...noWait, worker: idleWorker })
    expect(r.spoke).toBe(true)
    expect(posts.at(-1)).toMatch(/Still to do/)
  })

  it('every path that held a claim leaves a message behind', async () => {
    const cases = [
      { name: 'budget', opts: { budget: { exhausted: () => true } } },
      { name: 'worker failure', opts: { worker: brokenWorker } },
    ]
    for (const c of cases) {
      const { d, posts } = deps()
      const r = await runItem(d, candidate(), role(), 'igor-bot', { ...noWait, ...c.opts })
      expect(r.spoke, c.name).toBe(true)
      expect(posts.length, c.name).toBeGreaterThan(0)
    }
  })
})

describe('a stop gets a receipt, not a handoff', () => {
  it('on a stop found at the settle check', async () => {
    const { d, posts, released } = deps({ verdicts: [{ status: 'stopped', by: 'bob' }] })
    const r = await runItem(d, candidate(), role(), 'igor-bot', noWait)
    expect(r.outcome).toBe('stopped')
    // The receipt is one line naming who stopped it, not a full handoff.
    expect(posts.at(-1)).toMatch(/stopped at bob's request/)
    expect(posts.at(-1)).not.toMatch(/Still to do/)
    expect(released).toContain('igor-bot')
  })
})

describe('paths that owe nothing', () => {
  it('says nothing when the claim was never recorded', async () => {
    // It never told anyone to stand off, so there is nobody to explain anything to.
    const { d, posts } = deps({ claimSticks: false })
    const r = await runItem(d, candidate(), role(), 'igor-bot', noWait)
    expect(r.outcome).toBe('refused')
    expect(r.spoke).toBe(false)
    expect(posts).toEqual([])
  })

  it('says nothing when another party won the claim', async () => {
    // Somebody else is visibly on it; a handoff would only add noise.
    const { d } = deps({ verdicts: [{ status: 'lost', by: 'alice' }] })
    const r = await runItem(d, candidate(), role(), 'igor-bot', noWait)
    expect(r.outcome).toBe('lost')
    expect(r.spoke).toBe(false)
  })
})
