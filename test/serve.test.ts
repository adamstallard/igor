import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Artifact, Candidate, CodeHost, Tracker } from '../src/adapter.js'
import type { Gate } from '../src/budget.js'
import type { CycleDeps } from '../src/loop.js'
import type { Role } from '../src/role.js'
import type { TreeProvider, WorkingTree } from '../src/worktree.js'
import { serve, untilSignalled, type ServeEvent } from '../src/serve.js'

const role = (over: Partial<Role> = {}): Role =>
  ({
    name: 'triage',
    reviewers: [],
    allow: ['comment', 'draft-pr', 'unassign'],
    completion: 'unassign',
    instructions: [],
    settleSeconds: 0,
    cooldownMinutes: 60,
    pollMinutes: 10,
    lane: {},
    sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue is:open' }],
    ...over,
  }) as Role

const issue = (n: number): Candidate =>
  ({
    id: `github:o/r#${n}`,
    tracker: 'github',
    repo: 'o/r',
    native: String(n),
    title: `Issue ${n}`,
    body: '',
    author: 'reporter',
    state: 'open',
    labels: [],
    assignees: [],
    paths: [],
    createdAt: '2026-09-13T00:00:00Z',
    updatedAt: '2026-09-13T00:00:00Z',
    ageDays: 0,
    idleDays: 0,
  }) as unknown as Candidate

function deps(found: Candidate[], opts: { searchThrows?: boolean } = {}) {
  let searches = 0
  const tracker: Tracker = {
    name: 'github',
    nativeHolderField: true,
    identity: async () => 'igor-bot',
    search: async () => {
      searches += 1
      if (opts.searchThrows) throw new Error('tracker unreachable')
      return found
    },
    claim: async () => true,
    commentsSince: async () => [],
    verifyClaim: async () => ({ status: 'held' }),
    report: async () => {},
    release: async () => {},
    linkage: () => 'Closes #1',
  }
  const codeHost: CodeHost = {
    name: 'github',
    produce: async (): Promise<Artifact> => ({ kind: 'pull-request', ref: '#9', url: 'u' }),
  }
  const trees: TreeProvider = {
    name: 'fake',
    provision: async (): Promise<WorkingTree> => ({
      path: mkdtempSync(join(tmpdir(), 'igor-serve-')),
      repo: 'o/r',
      changes: async () => [],
      release: async () => {},
    }),
  }
  return {
    d: { tracker, codeHost, trees, destination: 'o/lore' } as CycleDeps,
    searches: () => searches,
  }
}

const open: Gate = { exhausted: () => false, seat: 'igor-1', reason: 'room' }
const shut: Gate = { exhausted: () => true, reason: 'the budget is spent' }

/** Approves everything, so the loop's own behaviour is what is under test. */
const approveAll = async (candidates: readonly Candidate[]) => ({
  results: candidates.map((candidate) => ({
    candidate,
    verdict: { outcome: 'proceed' as const, stage: 'model' as const, reason: 'in lane' },
  })),
  costUsd: 0,
  failures: [],
})

const base = {
  gate: async () => open,
  sleep: async () => {},
  sinceDays: 30,
  triageModel: 'unused',
  triage: approveAll,
  worker: async () => ({ result: 'no change needed', total_cost_usd: 0 }),
}

function collect() {
  const events: ServeEvent[] = []
  return { events, onEvent: (e: ServeEvent) => events.push(e) }
}

describe('the loop keeps going', () => {
  it('runs the requested number of cycles', async () => {
    const { d, searches } = deps([])
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 3 })
    expect(s.cycles).toBe(3)
    expect(searches()).toBe(3)
  })

  it('reports an unreachable source without failing the cycle', async () => {
    // Discovery already isolates a failing source, so the cycle continues and says so rather
    // than unwinding — the loop's own failure path is for everything discovery cannot absorb.
    const { d } = deps([], { searchThrows: true })
    const { events, onEvent } = collect()
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 3, onEvent })
    expect(s.cycles).toBe(3)
    expect(s.failures).toBe(0)
    const planned = events.filter((e) => e.kind === 'planned')
    expect(planned).toHaveLength(3)
    expect(planned[0]!.kind === 'planned' && planned[0]!.report.failures[0]).toMatch(/unreachable/)
  })

  it('survives a cycle that fails outright instead of exiting', async () => {
    const { d } = deps([issue(1)])
    const { events, onEvent } = collect()
    const s = await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 3,
      onEvent,
      triage: async () => {
        throw new Error('triage exploded')
      },
    })
    expect(s.cycles).toBe(3)
    expect(s.failures).toBe(3)
    expect(events.filter((e) => e.kind === 'cycle-failed')).toHaveLength(3)
  })

  it('sleeps between cycles but not after the last', async () => {
    const { d } = deps([])
    const { events, onEvent } = collect()
    await serve(d, role(), 'igor-bot', { ...base, maxCycles: 3, onEvent })
    expect(events.filter((e) => e.kind === 'sleeping')).toHaveLength(2)
  })

  it('uses the role’s own interval unless overridden', async () => {
    const { d } = deps([])
    const { events, onEvent } = collect()
    await serve(d, role({ pollMinutes: 7 }), 'igor-bot', { ...base, maxCycles: 2, onEvent })
    const slept = events.find((e) => e.kind === 'sleeping')
    expect(slept && slept.kind === 'sleeping' && slept.minutes).toBe(7)
  })
})

describe('shutdown does not abandon what it holds', () => {
  it('stops before starting the next cycle', async () => {
    const { d, searches } = deps([])
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 10, until: Promise.resolve() })
    // The cycle in flight finishes; no further one begins.
    expect(s.cycles).toBe(1)
    expect(searches()).toBe(1)
  })

  it('reports why it stopped rather than vanishing', async () => {
    const { d } = deps([])
    const { events, onEvent } = collect()
    let stop = () => {}
    const until = new Promise<void>((r) => (stop = r))
    const running = serve(d, role(), 'igor-bot', { ...base, maxCycles: 5, onEvent, until, sleep: async () => stop() })
    await running
    expect(events.some((e) => e.kind === 'sleeping')).toBe(true)
  })

  it('listens for both interrupt signals', async () => {
    const registered: string[] = []
    const p = untilSignalled((s, h) => {
      registered.push(s)
      if (s === 'SIGTERM') h()
    })
    await p
    expect(registered).toEqual(['SIGINT', 'SIGTERM'])
  })
})

describe('the budget stops the cycle, not the process', () => {
  it('works every item triage approved', async () => {
    const { d } = deps([issue(1), issue(2)])
    const { events, onEvent } = collect()
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1, onEvent })
    expect(s.worked).toBe(2)
    expect(events.filter((e) => e.kind === 'working')).toHaveLength(2)
  })

  it('re-checks the budget before each item, not once per cycle', async () => {
    // An item can take minutes. A budget that closes during the first must stop the second.
    let calls = 0
    const { d } = deps([issue(1), issue(2), issue(3)])
    const s = await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 1,
      gate: async () => {
        calls += 1
        return calls > 1 ? shut : open
      },
    })
    expect(s.worked).toBe(1)
    expect(calls).toBe(2)
  })

  it('says the budget is why it stopped', async () => {
    const { d } = deps([issue(1)])
    const { events, onEvent } = collect()
    await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1, gate: async () => shut, onEvent })
    const stopped = events.find((e) => e.kind === 'stopping')
    expect(stopped && stopped.kind === 'stopping' && stopped.reason).toMatch(/budget is spent/)
  })

  it('stops between items when asked to shut down mid-cycle', async () => {
    let stop = () => {}
    const until = new Promise<void>((r) => (stop = r))
    const { d } = deps([issue(1), issue(2), issue(3)])
    const { events, onEvent } = collect()
    const s = await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 1,
      until,
      onEvent,
      gate: async () => {
        stop()
        await Promise.resolve()
        return open
      },
    })
    expect(s.worked).toBe(1)
    expect(events.some((e) => e.kind === 'stopping' && /between items/.test(e.reason))).toBe(true)
  })
})

describe('the loop fires lore, not only the run command', () => {
  it('asks for lore per item and hands it to the worker', async () => {
    // The daemon is what actually runs. Wiring lore only into the one-shot command left the
    // requirement true of the command and false of the loop.
    const asked: string[] = []
    let seen: string | undefined
    const { d } = deps([issue(1), issue(2)])
    await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 1,
      loreFor: (item) => {
        asked.push(item.id)
        return `lesson for ${item.native}`
      },
      worker: async ({ system }) => {
        seen = system
        return { result: 'no change needed', total_cost_usd: 0 }
      },
    })
    expect(asked).toEqual(['github:o/r#1', 'github:o/r#2'])
    expect(seen).toContain('lesson for 2')
  })

  it('asks per item rather than once per cycle, since the store can change underneath', async () => {
    let calls = 0
    const { d } = deps([issue(1), issue(2), issue(3)])
    await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 1,
      loreFor: () => {
        calls += 1
        return ''
      },
    })
    expect(calls).toBe(3)
  })

  it('works without lore configured at all', async () => {
    const { d } = deps([issue(1)])
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1 })
    expect(s.worked).toBe(1)
  })
})
