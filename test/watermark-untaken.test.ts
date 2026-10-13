import { describe, expect, it, vi } from 'vitest'
import type { Artifact, Candidate, CodeHost, Source, Tracker } from '../src/adapter.js'
import type { Gate } from '../src/budget.js'
import type { Role } from '../src/role.js'
import type { TreeProvider, WorkingTree } from '../src/worktree.js'
import { tempDir } from './tmp.js'

/** The state branch, in memory, so the watermark one cycle saves is the one the next reads. */
const stored = vi.hoisted(() => new Map<string, unknown>())
vi.mock('../src/state.js', () => ({
  readState: async (_repo: string, path: string) => stored.get(path),
  writeState: async (_repo: string, path: string, value: unknown) => {
    stored.set(path, value)
    return true
  },
  appendRecord: async () => {},
  readLog: async () => '',
}))

const { serve } = await import('../src/serve.js')
const { planCycle } = await import('../src/loop.js')

/**
 * Counted back from when the suite runs. Discovery looks back a bounded window from now on its
 * first run, so a fixed date would fall outside it and the items would never be read.
 */
const STARTED = Date.now()
const ago = (minutes: number): string => new Date(STARTED - minutes * 60_000).toISOString()

const issue = (n: number, minutes: number): Candidate =>
  ({
    id: `github:o/r#${n}`, tracker: 'github', repo: 'o/r', native: String(n), url: `u${n}`, title: `Issue ${n}`,
    body: '', author: 'reporter', state: 'open', labels: [], assignees: [], holders: [], paths: [],
    createdAt: ago(minutes), updatedAt: ago(minutes), ageDays: 0, idleDays: 0,
  }) as unknown as Candidate

const role = {
  name: 'triage', sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue' } as Source], lane: {},
  instructions: [], reviewers: [], allow: ['comment', 'draft-pr'], commands: [], settleSeconds: 0,
  cooldownMinutes: 60, pollMinutes: 10,
} as unknown as Role

function deps(found: Candidate[], claim: (c: Candidate) => Promise<boolean> = async () => true) {
  const tracker = {
    name: 'github', nativeHolderField: true, holderField: { holds: 'list', distinctFromAssignee: true },
    holder: 'igor:triage', holderSetBy: async () => undefined, directed: async () => [],
    findLinking: async () => undefined, identity: async () => 'igor-bot', search: async () => found,
    claim, commentsSince: async () => [], verifyClaim: async () => ({ status: 'held' }),
    report: async () => {}, release: async () => true, linkage: () => 'Closes #1',
  } as unknown as Tracker
  const codeHost: CodeHost = {
    name: 'github',
    produce: async (): Promise<Artifact> => ({ kind: 'pull-request', ref: '#9', url: 'u' }),
    catchUp: async () => ({ outcome: 'already-current' }),
    resolve: async () => 'sha',
  }
  const trees: TreeProvider = {
    name: 'fake',
    provision: async (): Promise<WorkingTree> => ({
      path: tempDir('igor-untaken-'), outbox: tempDir('igor-untaken-outbox-'), repo: 'o/r',
      changes: async () => [], release: async () => {},
    }),
  }
  return { tracker, codeHost, trees, destination: 'o/lore' }
}

describe('an item triaged to proceed and never taken', () => {
  it('is triaged again next cycle, rather than passed by the watermark', async () => {
    const found = [issue(1, 30), issue(2, 20)]
    const open: Gate = { exhausted: () => false, seat: 'igor-1', reason: 'room' }
    const spent: Gate = { exhausted: () => true, reason: 'the budget ran out mid-cycle' }
    // Open for triage and for the first item; the budget is gone by the second.
    let asked = 0
    const asks: string[][] = []
    const triage = async (cs: readonly Candidate[]) => {
      asks.push(cs.map((c) => c.native))
      return {
        results: cs.map((candidate) => ({
          candidate, verdict: { outcome: 'proceed' as const, stage: 'model' as const, reason: 'in lane' },
        })),
        costUsd: 0, costUnreported: 0, failures: [],
      }
    }
    await serve(deps(found), role, 'igor-bot', {
      maxCycles: 1, sleep: async () => {}, loreFor: () => '', triage, triageModel: 'unused',
      gate: async () => (++asked <= 2 ? open : spent),
      worker: async () => ({ result: 'no change needed', total_cost_usd: 0 }),
    })
    expect(asks).toEqual([['1', '2']])

    await planCycle(deps(found), role, { identity: 'igor-bot', triage, budget: open })
    // Only the untaken item: the mark still passes the item that was worked.
    expect(asks).toEqual([['1', '2'], ['2']])
  })
})

describe('the mark a long cycle settles', () => {
  const proceed = async (cs: readonly Candidate[]) => ({
    results: cs.map((candidate) => ({
      candidate, verdict: { outcome: 'proceed' as const, stage: 'model' as const, reason: 'in lane' },
    })),
    costUsd: 0, costUnreported: 0, failures: [],
  })
  const open: Gate = { exhausted: () => false, seat: 'igor-1', reason: 'room' }

  it('keeps the marks other roles saved while its items were worked', async () => {
    stored.clear()
    await serve(deps([issue(1, 30)]), role, 'igor-bot', {
      maxCycles: 1, sleep: async () => {}, loreFor: () => '', triage: proceed, triageModel: 'unused',
      gate: async () => open,
      worker: async () => {
        // Another role's cycle, finishing while this one's worker runs.
        const now = stored.get('discovery.json') as { watermarks: Record<string, unknown> } | undefined
        stored.set('discovery.json', {
          watermarks: { ...(now?.watermarks ?? {}), 'other-role-source': { lastSeen: ago(1) } },
        })
        return { result: 'no change needed', total_cost_usd: 0 }
      },
    })
    const after = stored.get('discovery.json') as { watermarks: Record<string, { lastSeen: string }> }
    expect(after.watermarks['other-role-source']?.lastSeen).toBe(ago(1))
  })

  it('holds the mark below an item whose claim never landed', async () => {
    stored.clear()
    const found = [issue(1, 30), issue(2, 20)]
    const asks: string[][] = []
    const triage = async (cs: readonly Candidate[]) => {
      asks.push(cs.map((c) => c.native))
      return proceed(cs)
    }
    const outage = async (c: Candidate) => {
      if (c.native === '1') throw new Error('503 from the tracker')
      return true
    }
    await serve(deps(found, outage), role, 'igor-bot', {
      maxCycles: 1, sleep: async () => {}, loreFor: () => '', triage, triageModel: 'unused',
      gate: async () => open,
      worker: async () => ({ result: 'no change needed', total_cost_usd: 0 }),
    })
    await planCycle(deps(found), role, { identity: 'igor-bot', triage, budget: open })
    expect(asks[1]).toEqual(['1'])
  })
})

describe('a claim the tracker refuses outright', () => {
  const open: Gate = { exhausted: () => false, seat: 'igor-1', reason: 'room' }
  const proceed = async (cs: readonly Candidate[]) => ({
    results: cs.map((candidate) => ({
      candidate, verdict: { outcome: 'proceed' as const, stage: 'model' as const, reason: 'in lane' },
    })),
    costUsd: 0, costUnreported: 0, failures: [],
  })

  /**
   * One serve cycle whose tracker claims through `claim`, which the tests use to refuse only #1,
   * then a bare `planCycle` that claims nothing. Returns the items each triage call was asked about, so a second entry
   * means the second cycle found something fresh to triage again.
   */
  async function afterRefusal(claim: (c: Candidate) => Promise<boolean>): Promise<string[][]> {
    stored.clear()
    const found = [issue(1, 30), issue(2, 20)]
    const asks: string[][] = []
    const triage = async (cs: readonly Candidate[]) => {
      asks.push(cs.map((c) => c.native))
      return proceed(cs)
    }
    await serve(deps(found, claim), role, 'igor-bot', {
      maxCycles: 1, sleep: async () => {}, loreFor: () => '', triage, triageModel: 'unused',
      gate: async () => open,
      worker: async () => ({ result: 'no change needed', total_cost_usd: 0 }),
    })
    await planCycle(deps(found), role, { identity: 'igor-bot', triage, budget: open })
    return asks
  }

  it('lets the mark pass an item whose claim the tracker answered and did not record', async () => {
    // The mark moved past #1, which a retry would only see refused again, so the second cycle
    // finds nothing fresh and makes no triage call.
    const asks = await afterRefusal(async (c) => c.native !== '1')
    expect(asks).toEqual([['1', '2']])
  })

  it('lets the mark pass an item whose claim the tracker refused with a 4xx', async () => {
    const { GhError } = await import('../src/gh.js')
    const asks = await afterRefusal(async (c) => {
      if (c.native === '1') throw new GhError('gh api failed: Resource not accessible by integration (HTTP 403)', 403)
      return true
    })
    expect(asks).toEqual([['1', '2']])
  })

  it('holds the mark below an item whose claim met a rate limit GitHub answers with a 403', async () => {
    const { GhError } = await import('../src/gh.js')
    const asks = await afterRefusal(async (c) => {
      if (c.native === '1') {
        throw new GhError(
          'gh api failed: You have exceeded a secondary rate limit. Please wait a few minutes before you try again. (HTTP 403)',
          403,
        )
      }
      return true
    })
    expect(asks).toEqual([['1', '2'], ['1']])
  })

  it('holds the mark below an item whose claim met a 5xx, which a later cycle can retry', async () => {
    const { GhError } = await import('../src/gh.js')
    const asks = await afterRefusal(async (c) => {
      if (c.native === '1') throw new GhError('gh api failed: Server Error (HTTP 502)', 502)
      return true
    })
    expect(asks).toEqual([['1', '2'], ['1']])
  })
})
