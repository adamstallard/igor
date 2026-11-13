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
import { labelVerdictFrom } from '../src/github-adapter.js'
import { tempDir } from './tmp.js'
import { IGORS } from './igors.js'

/**
 * Fixture times, counted back from when the suite runs. Discovery reads `updatedAt` against the
 * real clock (`sinceDays` below), so a fixed date would age out of the window.
 */
const STARTED = Date.now()
const ago = (minutes: number): string => new Date(STARTED - minutes * 60_000).toISOString()

const role = (over: Partial<Role> = {}): Role =>
  ({
    name: 'triage',
    reviewers: [],
    allow: ['comment', 'draft-pr'],
    commands: [],
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
    holders: [],
    paths: [],
    createdAt: ago(120),
    updatedAt: ago(120),
    ageDays: 0,
    idleDays: 0,
  }) as unknown as Candidate

function deps(found: Candidate[], opts: { searchThrows?: boolean; verdict?: ClaimVerdict; caughtUp?: CatchUp[]; provisionThrows?: boolean; provisionThrowsOn?: readonly number[] } = {}) {
  let searches = 0
  const tracker: Tracker = {
    name: 'github',
    nativeHolderField: true,
    holderField: { holds: 'list', distinctFromAssignee: true },
    holder: 'igor:triage',
    holderSetBy: async () => undefined,
    directed: async () => [],
    findLinking: async () => undefined,
    createIssue: async () => 'https://github.com/o/r/issues/100',
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
    release: async () => true,
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
  let provisions = 0
  const trees: TreeProvider = {
    name: 'fake',
    provision: async (): Promise<WorkingTree> => {
      if (opts.provisionThrows === true) throw new Error('disk on fire')
      // Named attempts wedged and the rest healthy — deterministic item faults, not an
      // outage. Which attempts matters: whether two failures were adjacent is the whole
      // question the counter answers.
      provisions += 1
      if (opts.provisionThrowsOn?.includes(provisions) === true) {
        throw new Error('422 Reference already exists')
      }
      return {
        path: tempDir('igor-serve-'),
        outbox: tempDir('igor-serve-outbox-'),
        repo: 'o/r',
        changes: async () => [],
        release: async () => {},
      }
    },
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

  it('abandons the cycle when a surface stops answering, rather than doing it to every item', async () => {
    // Converting the throw into a per-item refusal removed the abandonment a throw used to
    // cause here. Without this the loop walks the whole pool doing the same thing to each —
    // two comments per item per poll for as long as the outage lasts, at a volume that is
    // itself what trips the rate limit.
    const events: ServeEvent[] = []
    const onEvent = (e: ServeEvent) => events.push(e)
    const { d } = deps([issue(1), issue(2), issue(3)], { provisionThrows: true })
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1, onEvent })

    // Two items attempted, not three: the second consecutive failure is what ends the cycle,
    // because one on its own does not say whether the surface or the item is at fault.
    expect(events.filter((e) => e.kind === 'working')).toHaveLength(2)
    expect(events.filter((e) => e.kind === 'cycle-failed')).toHaveLength(1)
    expect(s.failures).toBe(1)
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

  it('abandons the cycle on a surface failure here too, and this loop runs first', async () => {
    // The catch-up loop runs before the claim loop, so a surface that stops answering is met
    // here first. A break in only the second loop lets the whole catch-up pool be walked —
    // a claim and a handoff on each — before the guarded one is ever reached.
    const events: ServeEvent[] = []
    const onEvent = (e: ServeEvent) => events.push(e)
    const { d } = deps([rotting(7), rotting(8), rotting(9)], {
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'conflict' }, { outcome: 'conflict' }],
      provisionThrows: true,
    })
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1, onEvent })

    expect(events.filter((e) => e.kind === 'working')).toHaveLength(2)
    expect(events.filter((e) => e.kind === 'cycle-failed')).toHaveLength(1)
    expect(s.failures).toBe(1)
  })

  it('stops the claim loop on an outage the catch-up loop met, and counts it once', async () => {
    // A mixed pool, because a pool of only catch-ups never reaches the second loop and so
    // cannot tell whether it was stopped. Both halves ride on this: the claim pool is not
    // walked against a surface already known to be dead, and one cycle fails once — without
    // the cross-loop guard the breaker fires again below and counts the same outage twice.
    const events: ServeEvent[] = []
    const onEvent = (e: ServeEvent) => events.push(e)
    const { d } = deps([rotting(7), issue(8), issue(9)], {
      caughtUp: [{ outcome: 'conflict' }],
      provisionThrows: true,
    })
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1, onEvent })

    expect(events.filter((e) => e.kind === 'working')).toHaveLength(2)
    expect(events.filter((e) => e.kind === 'cycle-failed')).toHaveLength(1)
    expect(s.failures).toBe(1)
    // The item that ended the cycle is still reported as worked. `worked` is the only route
    // by which a run's execution reaches the ledger, so breaking before it would drop the
    // spend of a run that published — silently, since the cycle total is added earlier.
    expect(events.filter((e) => e.kind === 'worked')).toHaveLength(2)
  })

  it('does not abandon on one failure, because one does not say whose fault it is', async () => {
    // The pole the counter creates. A branch an earlier run orphaned makes `produce` fail
    // `422 Reference already exists` on that item and no other, deterministically. Abandoning
    // on the first would stop every cycle for the life of that item — and since the claim is
    // now released rather than held, the item comes back next cycle and the worker spends on
    // it again.
    const events: ServeEvent[] = []
    const onEvent = (e: ServeEvent) => events.push(e)
    const { d } = deps([issue(1), issue(2), issue(3)], { provisionThrowsOn: [1] })
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1, onEvent })

    // That the fault happened at all, before anything about what the cycle then did: without
    // it every assertion below is also true of a pool where nothing went wrong.
    const failed = events.filter((e) => e.kind === 'worked' && e.run.surfaceFailed === true)
    expect(failed).toHaveLength(1)
    expect(events.filter((e) => e.kind === 'working')).toHaveLength(3)
    expect(events.filter((e) => e.kind === 'cycle-failed')).toHaveLength(0)
    expect(s.failures).toBe(0)
  })

  it('counts consecutively, so a healthy item between two faults does not add up to an outage', async () => {
    // What "consecutive" is for, and the only shape that tells it from a per-cycle tally: two
    // wedged items with a healthy one between them. A tally would end the cycle at the second
    // fault, which is the behaviour the counter was introduced to stop.
    const events: ServeEvent[] = []
    const onEvent = (e: ServeEvent) => events.push(e)
    const { d } = deps([issue(1), issue(2), issue(3)], { provisionThrowsOn: [1, 3] })
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1, onEvent })

    expect(events.filter((e) => e.kind === 'worked' && e.run.surfaceFailed === true)).toHaveLength(2)
    expect(events.filter((e) => e.kind === 'working')).toHaveLength(3)
    expect(events.filter((e) => e.kind === 'cycle-failed')).toHaveLength(0)
    expect(s.failures).toBe(0)
  })

  it('abandons one cycle, not every cycle after it', async () => {
    // The breaker is per cycle: the next poll is the retry. A flag that outlived its cycle
    // would leave the claim loop switched off for the life of the process, which no
    // single-cycle test can tell apart from abandoning correctly.
    const events: ServeEvent[] = []
    const onEvent = (e: ServeEvent) => events.push(e)
    const { d } = deps([rotting(7), issue(8), issue(9)], {
      caughtUp: [{ outcome: 'conflict' }],
      provisionThrows: true,
    })
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 2, onEvent })

    // Each cycle abandons on its own, and the next poll is the retry — so the count rises
    // across cycles rather than the breaker latching. What matters is the second line: one
    // failure per cycle, not one per item and not one for the process.
    expect(events.filter((e) => e.kind === 'working')).toHaveLength(5)
    expect(s.failures).toBe(2)
  })
})

describe('a surface credential refused while serving', () => {
  it('takes no new item, says which identity was refused, and resumes once a token mints', async () => {
    const { d, searches } = deps([issue(1)])
    const { events, onEvent } = collect()
    const answers: (true | string)[] = ['GitHub would not mint a token for the App "triage": 401 Bad credentials', true, true]
    const s = await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 2,
      onEvent,
      credential: async () => answers.shift() ?? true,
    })
    const refused = events.filter((e) => e.kind === 'credential-refused')
    expect(refused).toEqual([
      { kind: 'credential-refused', cycle: 1, reason: 'GitHub would not mint a token for the App "triage": 401 Bad credentials' },
    ])
    // The refused cycle searched nothing and worked nothing; the next one did both.
    expect(searches()).toBe(1)
    expect(s.worked).toBe(1)
  })

  it('stops between items when the credential is refused mid-cycle', async () => {
    const { d } = deps([issue(1), issue(2)])
    const { events, onEvent } = collect()
    const answers: (true | string)[] = [true, true, 'refused']
    const s = await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 1,
      onEvent,
      credential: async () => answers.shift() ?? 'refused',
    })
    expect(s.worked).toBe(1)
    expect(events.filter((e) => e.kind === 'credential-refused')).toHaveLength(1)
  })
})

describe('items a person hands to this Igor by label', () => {
  it('claims a handed-over item without triage, without writing the label, and without the settle interval', async () => {
    const handed = { ...issue(5), holders: ['igor:triage'], assignees: ['adam'] } as Candidate
    const { d } = deps([])
    const claimed: string[] = []
    const reported: string[] = []
    let triaged = 0
    Object.assign(d.tracker, {
      directed: async () => [handed],
      holderSetBy: async () => ({ self: false, by: 'adam', at: ago(120) }),
      claim: async (c: Candidate) => {
        claimed.push(c.id)
        return true
      },
      report: async (_c: Candidate, m: string) => {
        reported.push(m)
      },
    })
    const s = await serve(d, role({ settleSeconds: 3600 }), 'igor-bot', {
      ...base,
      maxCycles: 1,
      triage: async (cs) => {
        triaged += cs.length
        return approveAll(cs)
      },
      claim: { wait: async () => { throw new Error('waited the settle interval') } },
    })
    expect(s.worked).toBe(1)
    expect(claimed).toEqual([])
    expect(triaged).toBe(0)
    expect(reported[0]).toContain('picked this up')
  })

  it("posts one notice, and claims nothing, where another Igor's label is there too", async () => {
    const both = { ...issue(6), holders: ['igor:triage', 'igor:backend'] } as Candidate
    const { d } = deps([])
    const reported: string[] = []
    Object.assign(d.tracker, {
      directed: async () => [both],
      holderSetBy: async () => ({ self: false, by: 'adam', at: ago(120) }),
      report: async (_c: Candidate, m: string) => {
        reported.push(m)
      },
    })
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1 })
    expect(s.worked).toBe(0)
    expect(reported).toHaveLength(1)
    expect(reported[0]).toContain('`igor:backend` holds it')
  })
})

describe('an item handed over while a pull request is open for it', () => {
  it('posts one notice naming the pull request, and claims nothing', async () => {
    const handed = {
      ...issue(7), holders: ['igor:triage'],
      inFlight: { kind: 'pull-request', ref: '#8', url: 'https://github.com/o/r/pull/8', draft: true, author: 'someone', mergeable: 'clean', branch: 'b', base: 'main' },
    } as Candidate
    const { d } = deps([])
    const reported: string[] = []
    Object.assign(d.tracker, {
      directed: async () => [handed],
      holderSetBy: async () => ({ self: false, by: 'adam', at: ago(120) }),
      report: async (_c: Candidate, m: string) => {
        reported.push(m)
      },
    })
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1 })
    expect(s.worked).toBe(0)
    expect(reported).toHaveLength(1)
    expect(reported[0]).toContain('[#8](https://github.com/o/r/pull/8) is already open for it')
  })
})

describe('an item handed over whose own artifact the cycle is catching up', () => {
  it('is caught up, and gets no in-flight notice the catch-up has already made untrue', async () => {
    const item = { ...rotting(7), holders: ['igor:triage'] } as Candidate
    const { d, caughtUp } = deps([item], { caughtUp: [{ outcome: 'conflict' }] })
    const reported: string[] = []
    Object.assign(d.tracker, {
      directed: async () => [item],
      holderSetBy: async () => ({ self: false, by: 'adam', at: ago(120) }),
      report: async (_c: Candidate, m: string) => {
        reported.push(m)
      },
    })
    await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1 })
    expect(caughtUp()).toHaveLength(1)
    expect(reported.some((m) => m.includes('is already open for it'))).toBe(false)
  })
})

describe('a handed-over item whose own pull request the cycle catches up', () => {
  it('is caught up when a person handed it over after a stop, without waiting the cooldown', async () => {
    const now = Date.now()
    const iso = (m: number) => new Date(now - m * 60000).toISOString()
    const item = { ...rotting(7), holders: ['igor:triage'], labels: ['igor:triage'] } as Candidate
    const { d, caughtUp } = deps([item])
    const reported: string[] = []
    const comments = [{ author: 'adam', at: iso(10), body: 'stop' }]
    Object.assign(d.tracker, {
      directed: async () => [item],
      holderSetBy: async () => ({ self: false, by: 'adam', at: iso(5) }),
      commentsSince: async (_c: Candidate, since: string) => comments.filter((c) => Date.parse(c.at) >= Date.parse(since)),
      report: async (_c: Candidate, m: string) => { reported.push(m) },
    })
    const { events, onEvent } = collect()
    await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1, onEvent })
    const p = events.find((e) => e.kind === 'planned') as any
    expect(p.report.toCatchUp).toHaveLength(1)
    expect(caughtUp()).toHaveLength(1)
  })

  it('keeps the person\'s label, so the in-flight notice\'s promise holds once the pull request starts conflicting', async () => {
    let cycle = 0
    const said: { author: string; at: string; body: string }[] = []
    const cur = () => ({ ...rotting(7, { mergeable: cycle <= 1 ? 'unknown' : 'conflicting' }), holders: ['igor:triage'], labels: ['igor:triage'] }) as Candidate
    const { d, caughtUp } = deps([], { caughtUp: [{ outcome: 'conflict' }] })
    const reported: string[] = []
    const released: string[] = []
    Object.assign(d.tracker, {
      search: async () => { cycle += 1; return [cur()] },
      directed: async () => [cur()],
      holderSetBy: async () => ({ self: false, by: 'adam', at: ago(120) }),
      commentsSince: async () => said,
      report: async (_c: Candidate, m: string) => { reported.push(`cycle${cycle}: ${m.slice(0, 120)}`); said.push({ author: 'igor-bot', at: new Date().toISOString(), body: m }) },
      release: async () => { released.push(`cycle${cycle}`); return true },
    })
    await serve(d, role(), 'igor-bot', { ...base, maxCycles: 2 })
    expect(caughtUp()).toHaveLength(1)
    expect(reported.some((r) => r.includes('is already open for it'))).toBe(true)
    expect(released).toEqual([])
  })
})

describe('a handed-over item stopped while nothing ran', () => {
  it('loses its label as a stop and gets a receipt, and is not claimed', async () => {
    const handed = { ...issue(9), holders: ['igor:triage'], labels: ['igor:triage'] } as Candidate
    const { d } = deps([])
    const reported: string[] = []
    const released: boolean[] = []
    Object.assign(d.tracker, {
      directed: async () => [handed],
      holderSetBy: async () => ({ self: false, by: 'adam', at: ago(120) }),
      commentsSince: async () => [{ author: 'bob', at: ago(60), body: 'stop' }],
      release: async (_c: Candidate, _as: string, how?: { stop?: boolean }) => { released.push(how?.stop === true); return true },
      report: async (_c: Candidate, m: string) => { reported.push(m) },
    })
    const s = await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1 })
    expect(s.worked).toBe(0)
    expect(released).toEqual([true])
    expect(reported).toHaveLength(1)
    expect(reported[0]).toContain("stopped at bob's request and released this")
  })
})

describe('a stop said while the cycle works another item', () => {
  it('is seen by the claim on that item, which stands down with a receipt', async () => {
    const { d } = deps([issue(1), issue(2)])
    // Comments per item, as GitHub keeps them: `since` filters on the edit time, the verdict on
    // the creation time.
    const comments: Record<string, { body: string; user: { login: string }; created_at: string; updated_at: string }[]> = {}
    const say = (id: string, login: string, body: string) => {
      const at = new Date().toISOString()
      ;(comments[id] ??= []).push({ body, user: { login }, created_at: at, updated_at: at })
    }
    const outcomes: Record<string, string> = {}
    Object.assign(d.tracker, {
      verifyClaim: async (c: Candidate, as: string, since: string) =>
        labelVerdictFrom({ login: as, accountId: 1, holder: 'igor:triage' }, ['igor:triage'], undefined,
          (comments[c.id] ?? []).filter((m) => Date.parse(m.updated_at) >= Date.parse(since)), since, IGORS),
      report: async (c: Candidate, m: string) => { say(c.id, 'igor-bot', m) },
    })
    const { events, onEvent } = collect()
    await serve(d, role({ settleSeconds: 0 }), 'igor-bot', {
      ...base,
      maxCycles: 1,
      onEvent,
      // While item 1 is worked, somebody stops item 2, and the claim on item 2 comes later than
      // its own settle window reaches back.
      worker: async () => {
        if (!(comments['github:o/r#2'] ?? []).some((m) => m.user.login === 'bob')) {
          say('github:o/r#2', 'bob', 'stop')
          // Longer than the checkpoint's one-second look back, so only the claim's scan can see it.
          await new Promise((r) => setTimeout(r, 1500))
        }
        return { result: 'no change needed', total_cost_usd: 0 }
      },
    })
    for (const e of events) if (e.kind === 'worked') outcomes[e.item.id] = e.run.outcome
    expect(outcomes['github:o/r#2']).toBe('stopped')
    expect((comments['github:o/r#2'] ?? []).some((m) => m.body.includes("stopped at bob's request"))).toBe(true)
  })
})

describe('a condition whose cooldown has passed lets exactly one item through', () => {
  const probing: Gate = { ...open, probes: ['role:triage:commands'] }

  it('says the item is the probe before it is claimed, and nothing more once it has an outcome', async () => {
    const said: string[] = []
    const { d } = deps([issue(1)])
    await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 1,
      gate: async () => probing,
      probe: async (keys, outcome) => {
        said.push(`${outcome} ${keys.join(',')}`)
      },
      worker: async () => {
        said.push('worked')
        return { result: 'no change needed', total_cost_usd: 0 }
      },
    })
    expect(said).toEqual(['taken role:triage:commands', 'worked'])
  })

  it('says the probe ended with no outcome where the item was never worked, so the next may probe', async () => {
    const said: string[] = []
    const { d } = deps([issue(1)], { verdict: { status: 'lost', by: 'someone-else' } })
    await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 1,
      gate: async () => probing,
      probe: async (keys, outcome) => {
        said.push(`${outcome} ${keys.join(',')}`)
      },
    })
    expect(said).toEqual(['taken role:triage:commands', 'void role:triage:commands'])
  })

  it('takes no further item once a condition stops the role mid-cycle, and says which', async () => {
    const { d } = deps([issue(1), issue(2)])
    const { events, onEvent } = collect()
    const stopped: Gate = { exhausted: () => true, reason: 'role "triage" is stopped: `role:triage:commands` met 3 times' }
    // The gate passes its first two asks, for triage and the first item, and stops every later
    // one, standing for the first item's run opening the condition.
    let asked = 0
    const gate = async () => (++asked <= 2 ? open : stopped)
    await serve(d, role(), 'igor-bot', { ...base, maxCycles: 1, onEvent, gate })
    expect(events.filter((e) => e.kind === 'working')).toHaveLength(1)
    const stopping = events.find((e) => e.kind === 'stopping')
    expect(stopping?.kind === 'stopping' && stopping.reason).toContain('role:triage:commands')
  })
})

describe('iteration 3: a probe that never reached its run', () => {
  it('leaves no probe row standing where the lore could not be read', async () => {
    const said: string[] = []
    const { d } = deps([issue(1)])
    await serve(d, role(), 'igor-bot', {
      ...base,
      maxCycles: 1,
      gate: async () => ({ ...open, probes: ['role:triage:commands'] }),
      loreFor: () => {
        throw new Error('malformed entry')
      },
      probe: async (keys, outcome) => {
        said.push(`${outcome} ${keys.join(',')}`)
      },
    })
    expect(said).not.toEqual(['taken role:triage:commands'])
  })
})
