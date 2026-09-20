import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Candidate, Source, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'

/**
 * The state branch, in memory. `planCycle` reads and writes the watermark through these, and
 * the question here is whether a cycle that could not consider its items moves it.
 */
const stored = new Map<string, unknown>()
/** Every decision record this cycle wrote, so what a reader would find can be asserted on. */
const recorded: Record<string, unknown>[] = []
/** Flipped by the one test that asks what a cycle does when its decisions cannot be written. */
const branch = vi.hoisted(() => ({ writable: true }))
vi.mock('../src/state.js', () => ({
  readState: async (_repo: string, path: string) => stored.get(path),
  writeState: async (_repo: string, path: string, value: unknown) => {
    stored.set(path, value)
    return true
  },
  appendRecord: async (_repo: string, _path: string, record: Record<string, unknown>) => {
    if (!branch.writable) throw new Error('state branch is unreachable')
    recorded.push(record)
  },
}))

const { planCycle } = await import('../src/loop.js')
const { sourceKey, STATE_PATH } = await import('../src/discovery.js')
const { defer, NO_DEFERRALS, STATE_PATH: DEFERRALS_PATH } = await import('../src/deferred.js')
const { triageBatch } = await import('../src/triage.js')

const NOW = Date.parse('2026-09-14T12:00:00Z')
const ago = (minutes: number) => new Date(NOW - minutes * 60000).toISOString()

const candidate = (n: number, minutes: number): Candidate =>
  ({
    id: `github:o/r#${n}`, tracker: 'github', repo: 'o/r', native: String(n),
    url: '', title: 'A bug', body: '', author: 'reporter', state: 'open',
    labels: [], assignees: [], paths: [], createdAt: ago(minutes), updatedAt: ago(minutes),
    ageDays: 0, idleDays: 0,
  }) as Candidate

const role = (): Role =>
  ({
    name: 'triage', sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue' } as Source],
    lane: {}, instructions: [], reviewers: [], allow: ['comment'], completion: 'unassign',
    settleSeconds: 0, cooldownMinutes: 60, pollMinutes: 10,
  }) as unknown as Role

/** `unreadable` names the items the tracker refuses to answer for; everything else reads clean. */
function deps(items: Candidate[], unreadable: (c: Candidate) => boolean) {
  const tracker = {
    name: 'github',
    search: async () => items,
    commentsSince: async (c: Candidate) => {
      if (unreadable(c)) throw new Error('API rate limit exceeded')
      return []
    },
  } as unknown as Tracker
  return { tracker, codeHost: {}, trees: {}, destination: 'o/state' } as never
}

const none = () => false
const all = () => true

const triage: typeof triageBatch = async (cs: readonly Candidate[]) => ({
  results: cs.map((candidate) => ({
    candidate,
    verdict: { outcome: 'proceed' as const, reason: 'worth a look', stage: 'model' as const },
  })),
  failures: [],
  costUsd: 0,
  costUnreported: 0,
})

describe('a cycle that could not read the tracker', () => {
  it('brings back every item it could not read', async () => {
    // The items were dropped unexamined. Moving the watermark past them would turn one
    // outage into their silent removal from the pool: nothing touches the item, so nothing
    // ever makes it fresh again.
    stored.clear()
    const items = [candidate(7, 40), candidate(8, 20), candidate(9, 5)]

    const first = await planCycle(deps(items, all), role(), { now: NOW, identity: 'igor-bot', triage })
    expect(first.fresh).toBe(3)
    expect(first.skippedUnreadable).toBe(3)
    expect(first.toClaim).toEqual([])
    // Visible, rather than three items quietly missing from a healthy-looking cycle.
    expect(first.failures.join(' ')).toContain('comments')

    const second = await planCycle(deps(items, none), role(), { now: NOW, identity: 'igor-bot', triage })
    expect(second.fresh).toBe(3)
    expect(second.toClaim).toHaveLength(3)
  })

  it('still advances past the items it did read, which the model has already answered', async () => {
    // Freezing the mark for the whole cycle would re-bill triage for every decision already
    // made, for as long as the outage lasts.
    stored.clear()
    const items = [candidate(1, 50), candidate(2, 40), candidate(3, 30), candidate(4, 20), candidate(5, 10)]
    const asked: string[][] = []
    const watch: typeof triageBatch = async (cs) => {
      asked.push(cs.map((c) => c.native))
      return triage(cs, '', '')
    }
    const failing = (c: Candidate) => c.native === '4' || c.native === '5'

    const first = await planCycle(deps(items, failing), role(), { now: NOW, identity: 'igor-bot', triage: watch })
    expect(asked).toEqual([['1', '2', '3']])
    expect(first.skippedUnreadable).toBe(2)

    const second = await planCycle(deps(items, none), role(), { now: NOW, identity: 'igor-bot', triage: watch })
    // Only the two it never managed to read come back; the other three are settled.
    expect(second.fresh).toBe(2)
    expect(asked[1]).toEqual(['4', '5'])
  })

  it('advances it on a cycle that read everything', async () => {
    stored.clear()
    const items = [candidate(7, 40)]
    await planCycle(deps(items, none), role(), { now: NOW, identity: 'igor-bot', triage })
    const key = sourceKey({ tracker: 'github', repo: 'o/r', query: 'is:issue' })
    expect(stored.get(STATE_PATH)).toEqual({ watermarks: { [key]: { lastSeen: ago(40) } } })
  })
})

describe('one comment fetch per candidate', () => {
  const said = (author: string, minutes: number, body: string) => ({ author, at: ago(minutes), body })

  /** Filters on `since` the way a tracker does, so the window each read asks for is the one under test. */
  function watching(items: Candidate[], spoken: Record<string, { author: string; at: string; body: string }[]> = {}) {
    const reads: { id: string; since: string }[] = []
    const tracker = {
      name: 'github',
      search: async () => items,
      commentsSince: async (c: Candidate, since: string) => {
        reads.push({ id: c.id, since })
        return (spoken[c.id] ?? []).filter((m) => Date.parse(m.at) >= Date.parse(since))
      },
    } as unknown as Tracker
    return { d: { tracker, codeHost: {}, trees: {}, destination: 'o/state' } as never, reads }
  }

  it('reads an item that is both awake and deferred once', async () => {
    // The stop gate and the deferral gate ask different questions of the same comments.
    stored.clear()
    const c = candidate(7, 40)
    stored.set(DEFERRALS_PATH, defer(NO_DEFERRALS, c, 'could not reproduce', NOW - 3 * 24 * 60 * 60000))
    const { d, reads } = watching([c])

    const report = await planCycle(d, role(), { now: NOW, identity: 'igor-bot', triage })
    expect(report.skippedDeferred).toBe(1)
    expect(reads).toHaveLength(1)
    // At the deferral, which is older than the cooldown window, not at both in turn.
    expect(reads[0]?.since).toBe(ago(3 * 24 * 60))
  })

  it('lifts a deferral on a reply older than the stop window', async () => {
    // The windows do not contain each other. Reading the deferral over the cooldown window
    // would hide the answer, and the Igor would ignore an answered question for good.
    stored.clear()
    const c = candidate(7, 40)
    stored.set(DEFERRALS_PATH, defer(NO_DEFERRALS, c, 'could not reproduce', NOW - 5 * 24 * 60 * 60000))
    const { d, reads } = watching([c], { 'github:o/r#7': [said('alice', 3 * 24 * 60, 'here is the repro')] })

    const report = await planCycle(d, role(), { now: NOW, identity: 'igor-bot', triage })
    expect(report.skippedDeferred).toBe(0)
    expect(report.toClaim).toHaveLength(1)
    expect(reads).toHaveLength(1)
  })

  it('keeps the cooldown window for an item whose deferral no longer stands', async () => {
    // A record the item has outgrown is not a reason to pull days of comments for it.
    stored.clear()
    const c = candidate(7, 40)
    const stale = defer(NO_DEFERRALS, candidate(7, 40), 'could not reproduce', NOW - 3 * 24 * 60 * 60000)
    stale.items[c.id]!.fingerprint = 'nolongermatching'
    stored.set(DEFERRALS_PATH, stale)
    const { d, reads } = watching([c])

    const report = await planCycle(d, role(), { now: NOW, identity: 'igor-bot', triage })
    expect(report.toClaim).toHaveLength(1)
    expect(reads).toEqual([{ id: c.id, since: ago(60) }])
  })
})

describe('triage spends the seat the gate chose, not whatever is ambient', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('gives triage the token of the chosen seat', async () => {
    vi.stubEnv('IGOR_SEAT_1', 'ambient-token')
    vi.stubEnv('IGOR_SEAT_2', 'seat-two-token')
    stored.clear()
    const items = [candidate(7, 40)]
    let seenEnv: NodeJS.ProcessEnv | undefined
    const watch: typeof triageBatch = async (cs, system, model, env) => {
      seenEnv = env
      return triage(cs, system, model)
    }

    await planCycle(deps(items, none), role(), {
      now: NOW,
      identity: 'igor-bot',
      triage: watch,
      gate: async () => ({
        exhausted: () => false,
        seat: 'seat-2',
        token: { tokenEnv: 'IGOR_SEAT_2' },
        reason: 'chosen',
      }),
    })

    expect(seenEnv?.['CLAUDE_CODE_OAUTH_TOKEN']).toBe('seat-two-token')
    expect(seenEnv?.['IGOR_SEAT_1']).toBeUndefined()
  })

  it('records which seat triage spent from, so the cost is attributable', async () => {
    stored.clear()
    const items = [candidate(7, 40)]

    const report = await planCycle(deps(items, none), role(), {
      now: NOW,
      identity: 'igor-bot',
      triage,
      gate: async () => ({ exhausted: () => false, seat: 'seat-2', reason: 'chosen' }),
    })

    expect(report.triageSeat).toBe('seat-2')
  })

  it('never calls the gate when a cycle has nothing to triage', async () => {
    stored.clear()
    let calls = 0
    await planCycle(deps([], none), role(), {
      now: NOW,
      identity: 'igor-bot',
      triage,
      gate: async () => {
        calls += 1
        return { exhausted: () => false, seat: 'seat-2', reason: 'chosen' }
      },
    })
    expect(calls).toBe(0)
  })
})

describe('an item nobody examined holds the mark below it', () => {
  const source = (repo: string): Source => ({ tracker: 'github', repo, query: 'is:issue' }) as Source
  const stop = (minutes: number) => ({ author: 'alice', at: ago(minutes), body: 'stop' })

  /**
   * Serves each source its own items, and each item its own comments, filtered on `since`.
   * An undatable comment comes back whatever the window, which is how the cycle sees one.
   */
  function watching(
    bySource: Record<string, Candidate[]>,
    spoken: Record<string, { author: string; at: string; body: string }[]> = {},
  ) {
    const tracker = {
      name: 'github',
      search: async (s: Source) => bySource[s.repo] ?? [],
      commentsSince: async (c: Candidate, since: string) =>
        (spoken[c.id] ?? []).filter(
          (m) => Number.isNaN(Date.parse(m.at)) || Date.parse(m.at) >= Date.parse(since),
        ),
    } as unknown as Tracker
    return { tracker, codeHost: {}, trees: {}, destination: 'o/state' } as never
  }

  const mark = (repo = 'o/r') =>
    (stored.get(STATE_PATH) as { watermarks: Record<string, { lastSeen: string }> })
      .watermarks[sourceKey(source(repo))]?.lastSeen

  it('brings a stopped item back once its cooldown elapses, with nobody touching it', async () => {
    // The requirement: an item nobody takes after a stop is not permanently removed from the
    // pool. A mark past the stop receipt removes it, because the cooldown ends with the clock
    // and nothing then lifts the item above the mark.
    stored.clear()
    const held = candidate(7, 50)
    const items = [held, candidate(8, 10)]
    const d = watching({ 'o/r': items }, { [held.id]: [stop(50)] })

    const first = await planCycle(d, role(), { now: NOW, identity: 'igor-bot', triage })
    expect(first.skippedStopped).toBe(1)
    expect(first.toClaim.map((c) => c.candidate.id)).toEqual(['github:o/r#8'])

    // Same items, same timestamps: only the cooldown has run out.
    const second = await planCycle(d, role(), { now: NOW + 70 * 60000, identity: 'igor-bot', triage })
    expect(second.toClaim.map((c) => c.candidate.id)).toContain(held.id)
    // And the mark is past it again, so the re-triage lasts the cooldown and no longer.
    expect(mark()).toBe(ago(10))
  })

  it('lets the mark past an item somebody else holds', async () => {
    // That item was considered, and whoever has it will move `updatedAt` when they let it go.
    stored.clear()
    const taken = { ...candidate(7, 50), assignees: ['alice'] }
    const d = watching({ 'o/r': [taken, candidate(8, 10)] })

    const report = await planCycle(d, role(), { now: NOW, identity: 'igor-bot', triage })
    expect(report.skippedUniversal).toBe(1)
    expect(mark()).toBe(ago(10))
  })

  it('lets the mark past a deferred item, which an answer lifts by itself', async () => {
    // A deferral is lifted by a reply or an edit, and both move `updatedAt`. Holding the mark
    // for one would re-triage everything newer for as long as thirty days.
    stored.clear()
    const quiet = candidate(7, 50)
    stored.set(DEFERRALS_PATH, defer(NO_DEFERRALS, quiet, 'could not reproduce', NOW - 50 * 60000))
    const d = watching({ 'o/r': [quiet, candidate(8, 10)] })

    const report = await planCycle(d, role(), { now: NOW, identity: 'igor-bot', triage })
    expect(report.skippedDeferred).toBe(1)
    expect(mark()).toBe(ago(10))
  })

  it('lets the mark past a stop nobody can date, which no cooldown will lift', async () => {
    // Only a go-ahead can lift that stop, and the comment saying it brings the item back on
    // its own. Waiting for a clock that never runs out would pin the mark for good.
    stored.clear()
    const undated = candidate(7, 50)
    const d = watching(
      { 'o/r': [undated, candidate(8, 10)] },
      { [undated.id]: [{ author: 'alice', at: 'whenever', body: 'stop' }] },
    )

    const first = await planCycle(d, role(), { now: NOW, identity: 'igor-bot', triage })
    expect(first.skippedStopped).toBe(1)
    expect(mark()).toBe(ago(10))

    // Days later, and the item newer than it is not being re-triaged every cycle.
    const second = await planCycle(d, role(), { now: NOW + 7 * 24 * 60 * 60000, identity: 'igor-bot', triage })
    expect(second.fresh).toBe(0)
  })

  it('holds one source back without touching another', async () => {
    stored.clear()
    const held = candidate(7, 50)
    const elsewhere = { ...candidate(9, 30), id: 'github:o/other#9', repo: 'o/other' }
    const two = { ...role(), sources: [source('o/r'), source('o/other')] } as Role
    const d = watching({ 'o/r': [held], 'o/other': [elsewhere] }, { [held.id]: [stop(50)] })

    await planCycle(d, two, { now: NOW, identity: 'igor-bot', triage })
    expect(mark()).toBe(new Date(NOW - 50 * 60000 - 1).toISOString())
    expect(mark('o/other')).toBe(ago(30))
  })
})

describe('a cycle whose decisions could not be recorded', () => {
  afterEach(() => {
    branch.writable = true
  })

  it('reports the loss rather than swallowing it', async () => {
    // The record is what answers, afterwards, what the lane rejected and what the model cost.
    // Losing it quietly leaves a cycle that looks healthy and has no account of itself.
    stored.clear()
    branch.writable = false

    const report = await planCycle(deps([candidate(7, 40)], none), role(), {
      now: NOW, identity: 'igor-bot', triage,
    })

    expect(report.toClaim).toHaveLength(1)
    expect(report.failures.join(' ')).toMatch(/could not record decisions/)
    expect(report.failures.join(' ')).toContain('state branch is unreachable')
  })
})

describe('a cycle with no seat to pay for triage', () => {
  const source = (repo: string): Source => ({ tracker: 'github', repo, query: 'is:issue' }) as Source

  /** Counts what nobody should have called: the model, and anything posted to an item. */
  function watching(
    items: Candidate[],
    spoken: Record<string, { author: string; at: string; body: string }[]> = {},
  ) {
    const calls = { triaged: 0, posted: 0 }
    const tracker = {
      name: 'github',
      search: async () => items,
      commentsSince: async (c: Candidate, since: string) =>
        (spoken[c.id] ?? []).filter((m) => Date.parse(m.at) >= Date.parse(since)),
      report: async () => {
        calls.posted += 1
      },
    } as unknown as Tracker
    const counted: typeof triageBatch = async (cs, system, model) => {
      calls.triaged += 1
      return triage(cs, system, model)
    }
    return { d: { tracker, codeHost: {}, trees: {}, destination: 'o/state' } as never, calls, counted }
  }

  const mark = () =>
    (stored.get(STATE_PATH) as { watermarks: Record<string, { lastSeen: string }> })
      .watermarks[sourceKey(source('o/r'))]?.lastSeen

  /** Every seat spent, with the hour the first of them comes back. */
  const held = (over: Record<string, unknown> = {}) => async () =>
    ({
      exhausted: () => true,
      blocked: 'spent',
      resetAt: new Date(NOW + 4 * 60 * 60000).toISOString(),
      reason: 'every seat in the pool is past its reserve',
      ...over,
    }) as never

  const withSeat = () => async () => ({ exhausted: () => false, seat: 'seat-2', reason: 'chosen' }) as never

  it('makes no model call, and holds the mark below every candidate it never asked about', async () => {
    // The part a "skip the call" implementation gets wrong. These items were never dropped, so
    // nothing in `skipped` holds them; a mark let past them drops them from the pool for good,
    // and nothing about them will ever lift them back above it. That is worse than the spend
    // this refuses, because today they at least get a verdict.
    stored.clear()
    const items = [candidate(7, 50), candidate(8, 20), candidate(9, 5)]
    const first = watching(items)

    const report = await planCycle(first.d, role(), {
      now: NOW, identity: 'igor-bot', triage: first.counted, gate: held(),
    })

    expect(first.calls.triaged).toBe(0)
    expect(report.triaged).toBe(0)
    expect(report.toClaim).toEqual([])
    expect(report.untriaged.map((u) => u.candidate.id)).toEqual(items.map((i) => i.id))
    expect(mark()).toBe(new Date(NOW - 50 * 60000 - 1).toISOString())

    // Same items, nobody has touched them, and the pool has capacity again.
    const next = watching(items)
    const second = await planCycle(next.d, role(), {
      now: NOW, identity: 'igor-bot', triage: next.counted, gate: withSeat(),
    })
    expect(second.fresh).toBe(3)
    expect(second.toClaim.map((c) => c.candidate.id)).toEqual(items.map((i) => i.id))
  })

  it('records them as untriaged rather than as anything triage decided', async () => {
    stored.clear()
    const first = watching([candidate(7, 40)])

    const report = await planCycle(first.d, role(), {
      now: NOW, identity: 'igor-bot', triage: first.counted, gate: held(),
    })

    expect(report.skipped).toEqual([])
    expect(report.skippedDeferred).toBe(0)
    expect(report.verdicts).toEqual([])
    expect(report.untriaged[0]?.reason).toContain('no seat')
  })

  it('posts nothing to an item nobody claimed', async () => {
    stored.clear()
    const first = watching([candidate(7, 40)])

    await planCycle(first.d, role(), { now: NOW, identity: 'igor-bot', triage: first.counted, gate: held() })

    expect(first.calls.posted).toBe(0)
  })

  it('still reads comments, so a stop arriving while the pool is held is acted on', async () => {
    // The boundary is the model call and nothing above it. Comments are fetched per discovered
    // candidate, so an Igor that stopped discovering would stop hearing — exactly while
    // somebody is most likely to be trying to reach it.
    stored.clear()
    const stopped = candidate(7, 50)
    const first = watching([stopped, candidate(8, 10)], {
      [stopped.id]: [{ author: 'alice', at: ago(50), body: 'stop' }],
    })

    const report = await planCycle(first.d, role(), {
      now: NOW, identity: 'igor-bot', triage: first.counted, gate: held(),
    })

    expect(report.skippedStopped).toBe(1)
    expect(report.untriaged.map((u) => u.candidate.id)).toEqual(['github:o/r#8'])
  })

  it('still reads the reply that answers a handed-back item, and leaves the record alone', async () => {
    stored.clear()
    const quiet = candidate(7, 40)
    const record = defer(NO_DEFERRALS, quiet, 'could not reproduce', NOW - 5 * 24 * 60 * 60000)
    stored.set(DEFERRALS_PATH, record)
    const first = watching([quiet], {
      [quiet.id]: [{ author: 'alice', at: ago(3 * 24 * 60), body: 'here is the repro' }],
    })

    const report = await planCycle(first.d, role(), {
      now: NOW, identity: 'igor-bot', triage: first.counted, gate: held(),
    })

    // The reply lifted the deferral, and the item waits for a seat rather than for an answer.
    expect(report.skippedDeferred).toBe(0)
    expect(report.untriaged.map((u) => u.candidate.id)).toEqual([quiet.id])
    expect(stored.get(DEFERRALS_PATH)).toEqual(record)
  })

  it('says how many it left, why, and when capacity returns', async () => {
    stored.clear()
    const first = watching([candidate(7, 40), candidate(8, 20)])

    const report = await planCycle(first.d, role(), {
      now: NOW, identity: 'igor-bot', triage: first.counted, gate: held(),
    })

    expect(report.untriaged).toHaveLength(2)
    expect(report.heldPool?.blocked).toBe('spent')
    expect(report.heldPool?.resetAt).toBe(new Date(NOW + 4 * 60 * 60000).toISOString())
  })

  it('tells a pool that could not be used from one that ran out', async () => {
    // #49: only `spent` and `share` mean the budget ran out. A reader sent to look at spend for
    // an unreadable seat looks in the wrong place, and no hour brings that one back.
    stored.clear()
    const first = watching([candidate(7, 40)])

    const report = await planCycle(first.d, role(), {
      now: NOW,
      identity: 'igor-bot',
      triage: first.counted,
      gate: held({ blocked: 'credential', resetAt: undefined, passedOver: [{ seat: 'seat-2', verdict: 'credential' }] }),
    })

    expect(report.heldPool?.blocked).toBe('credential')
    expect(report.heldPool?.resetAt).toBeUndefined()
    expect(report.heldPool?.passedOver).toEqual([{ seat: 'seat-2', verdict: 'credential' }])
  })

  it('is distinguishable from a cycle that had nothing to triage', async () => {
    stored.clear()
    const empty = watching([])

    const report = await planCycle(empty.d, role(), {
      now: NOW, identity: 'igor-bot', triage: empty.counted, gate: held(),
    })

    expect(report.triaged).toBe(0)
    expect(report.untriaged).toEqual([])
    expect(report.heldPool).toBeUndefined()
  })

  it('writes what it could not do into the decision record', async () => {
    stored.clear()
    recorded.length = 0
    const first = watching([candidate(7, 40)])

    await planCycle(first.d, role(), { now: NOW, identity: 'igor-bot', triage: first.counted, gate: held() })

    const written = recorded[0]!
    expect(written['untriaged']).toBe(1)
    expect(written['heldPool']).toMatchObject({ blocked: 'spent' })
    const decisions = written['decisions'] as { item: string; outcome: string; stage: string }[]
    expect(decisions).toEqual([
      { item: 'github:o/r#7', stage: 'model', outcome: 'untriaged', reason: expect.stringContaining('no seat') },
    ])
  })

  it('triages as before where no seats are declared, which the gate reports as unenforced', async () => {
    stored.clear()
    const first = watching([candidate(7, 40)])

    const report = await planCycle(first.d, role(), {
      now: NOW,
      identity: 'igor-bot',
      triage: first.counted,
      gate: async () => ({ exhausted: () => false, reason: 'no seats configured, so budget is not enforced' }) as never,
    })

    expect(first.calls.triaged).toBe(1)
    expect(report.toClaim).toHaveLength(1)
    expect(report.heldPool).toBeUndefined()
  })
})

describe('a seat the gate named and nothing could read', () => {
  const source = (repo: string): Source => ({ tracker: 'github', repo, query: 'is:issue' }) as Source

  const mark = () =>
    (stored.get(STATE_PATH) as { watermarks: Record<string, { lastSeen: string }> })
      .watermarks[sourceKey(source('o/r'))]?.lastSeen

  /** The gate chose a seat; its token source resolves to nothing, which `workerEnv` refuses. */
  const unreadable = () => async () =>
    ({
      exhausted: () => false,
      seat: 'seat-2',
      token: { tokenEnv: 'IGOR_SEAT_NOWHERE' },
      reason: 'chosen',
    }) as never

  it('holds the mark below candidates no call was ever made about', async () => {
    // The same permanent loss as a held pool, one branch over: the gate named a seat, the
    // credential behind it did not resolve, and nothing about these items caused that.
    stored.clear()
    const items = [candidate(7, 50), candidate(8, 20)]
    let calls = 0
    const counted: typeof triageBatch = async (cs, system, model) => {
      calls += 1
      return triage(cs, system, model)
    }

    const report = await planCycle(deps(items, none), role(), {
      now: NOW, identity: 'igor-bot', triage: counted, gate: unreadable(),
    })

    expect(calls).toBe(0)
    expect(report.untriaged.map((u) => u.candidate.id)).toEqual(items.map((i) => i.id))
    expect(report.failures.join(' ')).toContain('triage:')
    expect(mark()).toBe(new Date(NOW - 50 * 60000 - 1).toISOString())
  })

  it('is not reported as a held pool, which would send the reader to look at spend', async () => {
    stored.clear()

    const report = await planCycle(deps([candidate(7, 40)], none), role(), {
      now: NOW, identity: 'igor-bot', triage, gate: unreadable(),
    })

    expect(report.heldPool).toBeUndefined()
    expect(report.untriaged[0]?.reason).toContain('credential')
  })
})

describe('more candidates than one cycle may triage', () => {
  const source = (repo: string): Source => ({ tracker: 'github', repo, query: 'is:issue' }) as Source
  const mark = () =>
    (stored.get(STATE_PATH) as { watermarks: Record<string, { lastSeen: string }> })
      .watermarks[sourceKey(source('o/r'))]?.lastSeen

  it('works the backlog a limit at a time instead of dropping its tail', async () => {
    // The cap truncates, and what it truncates was never examined — so a mark let past it drops
    // those items for good, the same loss a held pool would cause one stage later.
    //
    // The cap has to fall on the newest for that to work, which is why the survivors are
    // ordered. Holding the mark below an arbitrary tail pulls it under items this cycle already
    // decided, and the next cycle triages them again: a full limit of calls every cycle, on a
    // backlog that never drains. Asserting each candidate is asked about exactly once is what
    // pins both halves.
    stored.clear()
    // Newest first, which is the order a search with no `sort:` qualifier may return.
    const items = Array.from({ length: 15 }, (_, i) => candidate(i + 1, 10 + i * 10))
    const asked: string[][] = []
    const watch: typeof triageBatch = async (cs, system, model) => {
      asked.push(cs.map((c) => c.native))
      return triage(cs, system, model)
    }
    const d = deps(items, none)
    const run = () => planCycle(d, role(), { now: NOW, identity: 'igor-bot', triage: watch, limit: 10 })

    const first = await run()
    expect(first.triaged).toBe(10)
    expect(first.untriaged).toHaveLength(5)
    // The five it did not reach are the five newest, and the mark waits below the oldest of them.
    expect(first.untriaged.map((u) => u.candidate.native).sort()).toEqual(['1', '2', '3', '4', '5'])
    expect(mark()).toBe(new Date(NOW - 50 * 60000 - 1).toISOString())

    const second = await run()
    expect(second.fresh).toBe(5)
    expect(second.triaged).toBe(5)
    expect(second.untriaged).toEqual([])

    const third = await run()
    expect(third.fresh).toBe(0)

    const all = asked.flat()
    expect(all).toHaveLength(15)
    expect(new Set(all).size).toBe(15)
  })

  it('records the tail as untriaged rather than as a decision about it', async () => {
    stored.clear()
    const items = Array.from({ length: 4 }, (_, i) => candidate(i + 1, 10 + i * 10))

    const report = await planCycle(deps(items, none), role(), {
      now: NOW, identity: 'igor-bot', triage, limit: 2,
    })

    expect(report.skipped).toEqual([])
    expect(report.heldPool).toBeUndefined()
    expect(report.untriaged[0]?.reason).toContain('limit')
  })
})

describe('candidates a mark cannot tell apart', () => {
  it('concedes a tie rather than triaging the same items every cycle', async () => {
    // One bulk edit gives a page of items the same `updatedAt`, and tracker timestamps are
    // coarse enough for that to be exact. A mark cannot sit between two of them, so holding it
    // below the untriaged tail would put it below the triaged head as well, and every cycle
    // would pay for the same verdicts again. The tail is passed over instead, as it was before
    // any of this — the one case the cap cannot rescue.
    stored.clear()
    const items = Array.from({ length: 4 }, (_, i) => candidate(i + 1, 30))
    const asked: string[][] = []
    const watch: typeof triageBatch = async (cs, system, model) => {
      asked.push(cs.map((c) => c.native))
      return triage(cs, system, model)
    }
    const d = deps(items, none)
    const run = () => planCycle(d, role(), { now: NOW, identity: 'igor-bot', triage: watch, limit: 2 })

    const first = await run()
    expect(first.triaged).toBe(2)
    expect(first.untriaged).toHaveLength(2)

    const second = await run()
    expect(second.fresh).toBe(0)
    expect(asked.map((a) => a.length)).toEqual([2])
  })
})
