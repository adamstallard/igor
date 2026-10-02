import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type {
  Artifact,
  Candidate,
  CatchUp,
  CatchUpRequest,
  ClaimVerdict,
  CodeHost,
  InFlight,
  Tracker,
} from '../src/adapter.js'
import type { Gate } from '../src/budget.js'
import type { CycleDeps } from '../src/loop.js'
import type { Role } from '../src/role.js'
import type { TreeProvider, WorkingTree } from '../src/worktree.js'
import { serve, untilSignalled, type ServeEvent } from '../src/serve.js'
import { tempDir } from './tmp.js'

const role = (over: Partial<Role> = {}): Role =>
  ({
    name: 'triage',
    reviewers: [],
    allow: ['comment', 'draft-pr', 'unassign'],
    commands: [],
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

function deps(found: Candidate[], opts: { searchThrows?: boolean; verdict?: ClaimVerdict; caughtUp?: CatchUp[] } = {}) {
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
    verifyClaim: async () => opts.verdict ?? { status: 'held' },
    report: async () => {},
    release: async () => {},
    linkage: () => 'Closes #1',
  }
  const caughtUp: CatchUpRequest[] = []
  const answers = [...(opts.caughtUp ?? [])]
  const codeHost: CodeHost = {
    name: 'github',
    produce: async (): Promise<Artifact> => ({ kind: 'pull-request', ref: '#9', url: 'u' }),
    catchUp: async (r): Promise<CatchUp> => {
      caughtUp.push(r)
      return answers.shift() ?? { outcome: 'already-current' }
    },
    resolve: async (): Promise<string> => 'resolvedsha',
  }
  const trees: TreeProvider = {
    name: 'fake',
    provision: async (): Promise<WorkingTree> => ({
      path: tempDir('igor-serve-'),
      outbox: tempDir('igor-serve-outbox-'),
      repo: 'o/r',
      changes: async () => [],
      release: async () => {},
    }),
  }
  return {
    d: { tracker, codeHost, trees, destination: 'o/lore' } as CycleDeps,
    searches: () => searches,
    caughtUp: () => caughtUp,
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
  costUnreported: 0,
  failures: [],
})

const base = {
  gate: async () => open,
  // Explicit rather than omitted: `loreFor` is required precisely because omitting it is how
  // `igor serve` silently ran without lore.
  loreFor: () => '',
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
    let spent = false
    const { d } = deps([issue(1), issue(2), issue(3)])
    const s = await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 1,
      gate: async () => {
        calls += 1
        return spent ? shut : open
      },
      worker: async () => {
        spent = true
        return { result: 'no change needed', total_cost_usd: 0 }
      },
    })
    expect(s.worked).toBe(1)
    // Once for the seat triage spends from, then once before each item it reached.
    expect(calls).toBe(3)
  })

  it('says the budget is why it triaged nothing, rather than going quiet', async () => {
    // The gate stops the cycle at the triage call, which is a spend like any other, so there
    // is nothing to claim and no item to stop before. The cycle's own report is where an
    // operator reads why it went quiet.
    const { d } = deps([issue(1)])
    const { events, onEvent } = collect()
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1, gate: async () => shut, onEvent })
    const planned = events.find((e) => e.kind === 'planned')
    if (planned?.kind !== 'planned') throw new Error('the cycle produced no plan')
    expect(planned.report.untriaged).toHaveLength(1)
    expect(planned.report.heldPool).toBeDefined()
    expect(planned.report.triaged).toBe(0)
    expect(events.some((e) => e.kind === 'working')).toBe(false)
    expect(s.worked).toBe(0)
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
      // Asked to stop while the first item is being worked, which is the moment the loop has
      // to notice: the item in hand finishes and the next one never starts.
      worker: async () => {
        stop()
        await Promise.resolve()
        return { result: 'no change needed', total_cost_usd: 0 }
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

describe('the loop records what it handed back', () => {
  const noted = () => {
    const items: string[] = []
    return { items, note: async (_d: string, c: Candidate) => { items.push(c.id) } }
  }

  it('records a handoff, so the item does not come back on its own comment', async () => {
    // The worker finds nothing to change, which hands the item back — and the handoff comment
    // is what lifts it above the watermark next cycle.
    const { d } = deps([issue(1)])
    const n = noted()
    await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1, note: n.note })
    expect(n.items).toEqual(['github:o/r#1'])
  })

  it('records nothing when the budget ran out, which says nothing about the item', async () => {
    const { d } = deps([issue(1)])
    const n = noted()
    const { events, onEvent } = collect()
    // Open when the loop asks, so the item is started, and shut when the claim is held — which
    // is the only path that produces a budget handoff rather than stopping the cycle.
    // Three readings: the seat triage spends from, the one before the item is started, and
    // the one inside the run. Only the last is shut.
    let checks = 0
    const fading: Gate = { exhausted: () => checks++ > 1, seat: 'igor-1', reason: 'spent' }
    await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1, note: n.note, onEvent, gate: async () => fading })
    const worked = events.find((e) => e.kind === 'worked')
    expect(worked?.kind === 'worked' && worked.run.handoff).toBe('budget')
    expect(n.items).toEqual([])
  })

  it('records nothing when a refused command caused the handoff', async () => {
    // A misconfigured allowlist parks every item the Igor touches, each then needing a person
    // to answer it — where the cure is one change to the role and nothing to do with the item.
    const { d } = deps([issue(1)])
    const n = noted()
    const { events, onEvent } = collect()
    await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 1,
      note: n.note,
      onEvent,
      worker: async () => ({
        result: 'no change needed',
        total_cost_usd: 0,
        permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'npm test' } }],
      }),
    })
    const worked = events.find((e) => e.kind === 'worked')
    expect(worked?.kind === 'worked' && worked.run.cures).toEqual(['role:triage:commands'])
    expect(n.items).toEqual([])
  })

  it('keeps going when the record cannot be written', async () => {
    const { d } = deps([issue(1)])
    const s = await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 1,
      note: async () => { throw new Error('state branch unreachable') },
    })
    expect(s.worked).toBe(1)
    expect(s.failures).toBe(0)
  })
})


/** An issue whose own artifact stopped merging — the state #21 sat in, unnoticed. */
const rotting = (n: number, over: Partial<InFlight> = {}): Candidate => ({
  ...issue(n),
  inFlight: {
    kind: 'pull-request',
    ref: `#${n}1`,
    url: `https://example.test/${n}1`,
    draft: true,
    author: 'igor-bot',
    mergeable: 'conflicting',
    branch: `igor/triage/${n}-issue`,
    base: 'main',
    ...over,
  },
})

describe('a published artifact that stopped merging', () => {
  it('is caught up with no worker and no model call', async () => {
    // Asserted as an absence rather than described. This is the property that makes the check
    // cheap enough to run on every artifact on every cycle: a triage stub that is never asked,
    // and a tree provider that would throw if anything tried to provision one.
    let triaged = 0
    const { d, caughtUp } = deps([rotting(7)], { caughtUp: [{ outcome: 'merged', sha: 'mergesha' }] })
    d.trees = {
      name: 'exploding',
      provision: async () => { throw new Error('a clean catch-up must never provision a tree') },
    }

    const s = await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 1,
      worker: async () => { throw new Error('a clean catch-up must never run a worker') },
      triage: async (cs) => {
        triaged += cs.length
        return { results: [], costUsd: 0, costUnreported: 0, failures: [] }
      },
    })

    expect(s.failures).toBe(0)
    expect(triaged).toBe(0)
    expect(s.costUsd).toBe(0)
    expect(caughtUp()).toEqual([{ repo: 'o/r', branch: 'igor/triage/7-issue', base: 'main' }])
  })

  it('counts against the same budget gate as any other work', async () => {
    // Free on the quiet path and a worker on the conflicting one, and only the gate knows
    // which it will be. An Igor with nothing to spend stops before finding out.
    const { d, caughtUp } = deps([rotting(7)])
    const { events, onEvent } = collect()
    await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1, gate: async () => shut, onEvent })

    expect(caughtUp()).toEqual([])
    expect(events.filter((e) => e.kind === 'stopping')).toHaveLength(1)
  })
})
