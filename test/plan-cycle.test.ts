import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Candidate, InFlight, Source, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'

/**
 * The state branch, in memory. `planCycle` reads and writes the watermark through these, and
 * the question here is whether a cycle that could not consider its items moves it.
 */
const stored = new Map<string, unknown>()
/** Flipped by the one test that asks what a cycle does when its decisions cannot be written. */
const branch = vi.hoisted(() => ({ writable: true }))
vi.mock('../src/state.js', () => ({
  readState: async (_repo: string, path: string) => stored.get(path),
  writeState: async (_repo: string, path: string, value: unknown) => {
    stored.set(path, value)
    return true
  },
  appendRecord: async () => {
    if (!branch.writable) throw new Error('state branch is unreachable')
  },
}))

const { planCycle, recordDecisions } = await import('../src/loop.js')
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

/** An item whose own artifact is in flight, with the mergeability the case under test needs. */
const withArtifact = (n: number, minutes: number, over: Partial<InFlight> = {}): Candidate => ({
  ...candidate(n, minutes),
  inFlight: {
    kind: 'pull-request',
    ref: `#${n + 100}`,
    url: `https://github.com/o/r/pull/${n + 100}`,
    draft: true,
    author: 'igor-bot',
    mergeable: 'conflicting',
    branch: `igor/triage/${n}-a-bug`,
    base: 'main',
    ...over,
  },
})

describe('an artifact of the Igor\'s own that stopped merging', () => {
  it('is noticed although nothing touched the item', async () => {
    // This is #21 exactly. `main` advanced eight commits and the *issue* never moved, so the
    // watermark holds the item below it forever — and the artifact reports work in flight,
    // which triage skips. Read over everything the query returned, not over what was fresh.
    stored.clear()
    const items = [withArtifact(7, 40)]

    const first = await planCycle(deps(items, none), role(), { now: NOW, identity: 'igor-bot', triage })
    expect(first.toCatchUp).toHaveLength(1)

    // A second cycle with the item untouched: below the mark, and still noticed.
    const second = await planCycle(deps(items, none), role(), { now: NOW, identity: 'igor-bot', triage })
    expect(second.fresh).toBe(0)
    expect(second.toCatchUp.map((c) => c.candidate.id)).toEqual(['github:o/r#7'])
    expect(second.toCatchUp[0]?.reason).toContain('#107')
  })

  it('costs no model call to decide on, and is not also queued as ordinary work', async () => {
    // The whole design rests on this: one request per published artifact per cycle. An item
    // that reached triage would pay for a verdict on work it has already done.
    stored.clear()
    const asked: string[] = []
    const counting: typeof triageBatch = async (cs) => {
      for (const c of cs) asked.push(c.id)
      return { results: [], failures: [], costUsd: 0, costUnreported: 0 }
    }

    const report = await planCycle(deps([withArtifact(7, 40)], none), role(), {
      now: NOW, identity: 'igor-bot', triage: counting,
    })
    expect(asked).toEqual([])
    expect(report.triaged).toBe(0)
    expect(report.triageCostUsd).toBe(0)
    expect(report.toClaim).toEqual([])
    expect(report.toCatchUp).toHaveLength(1)
  })

  it('leaves a healthy artifact, and somebody else\'s broken one, alone', async () => {
    stored.clear()
    const items = [
      withArtifact(7, 40, { mergeable: 'clean' }),
      withArtifact(8, 40, { mergeable: 'unknown' }),
      withArtifact(9, 40, { author: 'alice' }),
    ]
    const report = await planCycle(deps(items, none), role(), { now: NOW, identity: 'igor-bot', triage })
    expect(report.toCatchUp).toEqual([])
    expect(report.skippedUniversal).toBe(3)
  })

  it('stays off it once somebody has said stop', async () => {
    // A stop means the artifact too. Nothing about a catch-up exempts it.
    stored.clear()
    const item = withArtifact(7, 40)
    const tracker = {
      name: 'github',
      search: async () => [item],
      commentsSince: async () => [{ author: 'alice', at: ago(5), body: 'stop' }],
    } as unknown as Tracker

    const report = await planCycle(
      { tracker, codeHost: {}, trees: {}, destination: 'o/state' } as never,
      role(),
      { now: NOW, identity: 'igor-bot', triage },
    )
    expect(report.toCatchUp).toEqual([])
    expect(report.skippedStopped).toBeGreaterThan(0)
  })

  it('stops retrying a conflict it already handed back, until somebody answers', async () => {
    // Task 4.2's stopper. A conflict the worker cannot resolve is handed off; the handoff is
    // recorded; and the record is what keeps the next cycle from spending another worker on
    // the same unresolvable merge, every poll interval, forever.
    stored.clear()
    const item = withArtifact(7, 40)
    stored.set(DEFERRALS_PATH, defer(NO_DEFERRALS, item, 'the conflict needs a decision', NOW - 60000))

    const quiet = await planCycle(deps([item], none), role(), { now: NOW, identity: 'igor-bot', triage })
    expect(quiet.toCatchUp).toEqual([])
    expect(quiet.skippedDeferred).toBe(1)

    // And an answer brings it straight back, because the artifact is still rotting.
    const tracker = {
      name: 'github',
      search: async () => [item],
      commentsSince: async () => [{ author: 'alice', at: ago(1), body: 'take the base side here' }],
    } as unknown as Tracker
    const answered = await planCycle(
      { tracker, codeHost: {}, trees: {}, destination: 'o/state' } as never,
      role(),
      { now: NOW, identity: 'igor-bot', triage },
    )
    expect(answered.toCatchUp).toHaveLength(1)
  })
})

describe('a catch-up must not move the watermark', () => {
  it('leaves the mark where it was when the tracker will not answer for a rotting artifact', async () => {
    // A catch-up item is old by construction — the premise of the whole change is that the
    // base moved and the item never did. `heldBelow` pulls the mark back below anything
    // nobody examined, which for an ordinary item is bounded by the mark itself. For this one
    // it is not: one rate limit on a 200-day-old artifact resets the mark 200 days and every
    // cycle after re-triages the backlog. Holding it buys nothing either way, because a stale
    // artifact is found by scanning everything the query returned.
    stored.clear()
    const old = withArtifact(9, 200 * 24 * 60)
    const recent = candidate(1, 10)

    await planCycle(deps([old, recent], none), role(), { now: NOW, identity: 'igor-bot', triage })
    const after = structuredClone(stored.get(STATE_PATH))

    const report = await planCycle(
      deps([old, recent], (c) => c.id === old.id),
      role(),
      { now: NOW, identity: 'igor-bot', triage },
    )
    expect(report.skippedUnreadable).toBe(1)
    expect(report.toCatchUp).toEqual([])
    expect(stored.get(STATE_PATH)).toEqual(after)
  })

  it('leaves the mark where it was when somebody has stopped the item', async () => {
    stored.clear()
    const old = withArtifact(9, 200 * 24 * 60)

    await planCycle(deps([old], none), role(), { now: NOW, identity: 'igor-bot', triage })
    const after = structuredClone(stored.get(STATE_PATH))

    const tracker = {
      name: 'github',
      search: async () => [old],
      commentsSince: async () => [{ author: 'alice', at: ago(5), body: 'stop' }],
    } as unknown as Tracker
    const report = await planCycle(
      { tracker, codeHost: {}, trees: {}, destination: 'o/state' } as never,
      role(),
      { now: NOW, identity: 'igor-bot', triage },
    )
    expect(report.skippedStopped).toBe(1)
    expect(stored.get(STATE_PATH)).toEqual(after)
  })

  it('records the catch-up as a decision, the way every other decision is recorded', async () => {
    // A catch-up is decided at the universal stage and lands in neither `skipped` nor
    // `verdicts`, so it is the one decision a cycle can make and never write down — and
    // work-triage requires the ratio at each stage be determinable from the record.
    stored.clear()
    const written: unknown[] = []
    const report = await planCycle(deps([withArtifact(7, 40)], none), role(), {
      now: NOW, identity: 'igor-bot', triage,
    })
    await recordDecisions('o/state', role(), report, async (_r, _p, value) => {
      written.push(value)
    })
    const decisions = (written[0] as { decisions: { item: string; stage: string }[] }).decisions
    expect(decisions.some((d) => d.item === 'github:o/r#7' && d.stage === 'catch-up')).toBe(true)
  })

  it('writes a record for a cycle whose only decision was a catch-up', async () => {
    // Nothing fresh and no failures, so the early return would drop it — and that is the
    // cycle whose one decision is most worth being able to read back.
    stored.clear()
    const item = withArtifact(7, 40)
    await planCycle(deps([item], none), role(), { now: NOW, identity: 'igor-bot', triage })

    const written: unknown[] = []
    const second = await planCycle(deps([item], none), role(), { now: NOW, identity: 'igor-bot', triage })
    expect(second.fresh).toBe(0)
    await recordDecisions('o/state', role(), second, async (_r, _p, value) => {
      written.push(value)
    })
    expect(written).toHaveLength(1)
  })
})
