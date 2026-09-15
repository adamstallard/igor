import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Artifact, ArtifactRequest, Candidate, ClaimVerdict, CodeHost, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import type { TreeProvider, WorkingTree, ChangedFile } from '../src/worktree.js'
import {
  declineReason, dropDeferred, dropStopped, oneFetchPerItem, recordDecisions, runItem,
  type CommentSource, type CycleReport, type ItemDeps,
} from '../src/loop.js'
import { defer, NO_DEFERRALS } from '../src/deferred.js'
import { tempDir } from './tmp.js'

const candidate = (over: Partial<Candidate> = {}): Candidate =>
  ({ id: 'github:o/r#7', tracker: 'github', repo: 'o/r', native: '7', title: 'A bug', body: '', author: 'reporter', assignees: [], labels: [], paths: [], state: 'open', ...over }) as unknown as Candidate

const role = (over: Partial<Role> = {}): Role =>
  ({ name: 'triage', reviewers: ['alice'], allow: ['comment', 'draft-pr', 'unassign'], commands: [], completion: 'unassign', instructions: [], settleSeconds: 0, cooldownMinutes: 60, ...over }) as Role

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
    commentsSince: async () => [],
    verifyClaim: async () => verdicts[Math.min(i++, verdicts.length - 1)]!,
    report: async (_c, m) => { posts.push(m) },
    release: async (_c, as) => { released.push(as) },
    linkage: () => 'Closes #7',
  }
  const produced: ArtifactRequest[] = []
  const codeHost: CodeHost = {
    name: 'fake',
    produce: async (r): Promise<Artifact> => {
      produced.push(r)
      return { kind: 'pull-request', ref: '#9', url: 'https://example.test/9' }
    },
  }
  const trees: TreeProvider = {
    name: 'fake',
    provision: async (): Promise<WorkingTree> => ({
      path: tempDir('igor-loop-'),
      repo: 'o/r',
      changes: async () => opts.changes ?? [],
      release: async () => {},
    }),
  }
  return { d: { tracker, codeHost, trees } as ItemDeps, posts, released, produced }
}

const noWait = { claim: { wait: async () => {} } }

/** A worker that fails the way a missing CLI would, without spawning anything. */
const brokenWorker = async () => { throw new Error('claude: command not found') }
/** A worker that runs fine and leaves the tree reporting changes. */
const busyWorker = async () => ({ result: 'Fixed it.', total_cost_usd: 0.02 })
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
    // Named, because running out of money says nothing about the item and must not defer it.
    expect(r.handoff).toBe('budget')
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
    expect(r.handoff).toBe('failure')
    expect(posts.at(-1)).toMatch(/will not retry/i)
  })

  it('explains itself even when it found nothing to change', async () => {
    // Releasing an unchanged item unremarked leaves it looking handled when it is not.
    const { d, posts } = deps({ changes: [] })
    const r = await runItem(d, candidate(), role(), 'igor-bot', { ...noWait, worker: idleWorker })
    expect(r.spoke).toBe(true)
    expect(r.handoff).toBe('nothing-to-do')
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

  it('on a stop during a run that changed nothing', async () => {
    // Nothing to publish is no excuse for skipping the claim read: a stop answered with a
    // handoff names reviewers at whoever just said stop, and then holds the item down as
    // handed back and unanswered.
    const { d, posts, released } = deps({ changes: [], verdicts: [{ status: 'held' }, { status: 'stopped', by: 'bob' }] })
    const r = await runItem(d, candidate(), role(), 'igor-bot', { ...noWait, worker: idleWorker })
    expect(r.outcome).toBe('stopped')
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

describe('what the run is given reaches the worker and the artifact', () => {
  it('hands the store down, so the pull request points at the transcript', async () => {
    // Nothing else in a run notices a store that never arrived: the body simply names no
    // repository, which is also what a private store looks like.
    const { d, produced } = deps({ changes: [{ path: 'src/a.ts', content: 'fixed', kind: 'modified' }] })
    await runItem(d, candidate(), role(), 'igor-bot', {
      ...noWait,
      worker: async () => ({ result: 'Rewrote the parser. '.repeat(60), total_cost_usd: 0.02 }),
      store: { destination: 'acme/lore', isPublic: true },
    })
    expect(produced[0]?.body).toContain('https://github.com/acme/lore/blob/igor-state/')
  })
})

describe('the worker explains its own refusal', () => {
  it('lifts the reason out of the report rather than leaving it in the transcript', async () => {
    // Nobody reading the issue opens the transcript, so the one useful sentence has to travel.
    const { d, posts } = deps({ changes: [] })
    await runItem(d, candidate(), role(), 'igor-bot', {
      ...noWait,
      worker: async () => ({
        result:
          'No changes made — no edits to the tree.\n\n**Why:** the issue asks me to fix ' +
          '`src/api/client.ts`, but that file does not exist in this repository.',
        total_cost_usd: 0.07,
      }),
    })
    expect(posts.at(-1)).toContain('does not exist in this repository')
    expect(posts.at(-1)).not.toMatch(/could not get past/)
  })

  it('falls back to a plain statement when the worker said nothing', async () => {
    const { d, posts } = deps({ changes: [] })
    await runItem(d, candidate(), role(), 'igor-bot', {
      ...noWait,
      worker: async () => ({ result: '', total_cost_usd: 0 }),
    })
    expect(posts.at(-1)).toMatch(/found nothing it could usefully change/)
  })

  it('reports each stage, since a worker can run for minutes', async () => {
    const steps: string[] = []
    const { d } = deps({ changes: [] })
    await runItem(d, candidate(), role(), 'igor-bot', {
      ...noWait,
      worker: async () => ({ result: 'nothing to do', total_cost_usd: 0 }),
      onStep: (s) => steps.push(s),
    })
    expect(steps).toEqual(['claiming', 'settling', 'working'])
  })
})

describe('what triage decided is written down, skips included', () => {
  const report = {
    role: 'triage',
    returned: 100,
    fresh: 10,
    coldStart: false,
    skippedUniversal: 2,
    skippedLane: 5,
    triaged: 3,
    skipped: [
      { candidate: candidate({ id: 'a' }), reason: 'item is closed', stage: 'universal' },
      { candidate: candidate({ id: 'b' }), reason: 'excluded by label: Human', stage: 'predicate' },
    ],
    verdicts: [
      { candidate: candidate({ id: 'c' }), outcome: 'skip' as const, reason: 'too vague' },
      { candidate: candidate({ id: 'd' }), outcome: 'proceed' as const, reason: 'concrete' },
    ],
    toClaim: [{ candidate: candidate({ id: 'd' }), reason: 'concrete' }],
    triageCostUsd: 0.048,
    failures: [],
  }

  it('records a skip as fully as a proceed', async () => {
    let written: Record<string, unknown> | undefined
    await recordDecisions('o/lore', role(), report as never, async (_r, _p, rec) => {
      written = rec
    })
    const decisions = written!['decisions'] as { item: string; outcome: string; reason: string }[]
    expect(decisions).toHaveLength(4)
    expect(decisions.filter((d) => d.outcome === 'skip')).toHaveLength(3)
    expect(decisions.every((d) => d.reason !== '')).toBe(true)
  })

  it('names the stage that decided each one, so the ratio is readable', async () => {
    // "Where are candidates being dropped" is the question a lane is tuned against.
    let written: Record<string, unknown> | undefined
    await recordDecisions('o/lore', role(), report as never, async (_r, _p, rec) => {
      written = rec
    })
    const decisions = written!['decisions'] as { stage: string }[]
    expect(decisions.map((d) => d.stage)).toEqual(['universal', 'predicate', 'model', 'model'])
    expect(written!['skippedLane']).toBe(5)
  })

  it('writes nothing when a cycle found nothing, rather than a line saying so', async () => {
    let calls = 0
    await recordDecisions('o/lore', role(), { ...report, fresh: 0, failures: [] } as never, async () => {
      calls += 1
    })
    expect(calls).toBe(0)
  })
})

describe('items handed back earlier', () => {
  const NOW = Date.parse('2026-09-14T12:00:00Z')
  const item = (n: number, over: Partial<Candidate> = {}) =>
    candidate({ id: `github:o/r#${n}`, native: String(n), ...over })

  function tracker(spoken: Record<string, { author: string; at: string; body: string }[]> = {}, throws = false) {
    let asked = 0
    const t = {
      commentsSince: async (c: Candidate) => {
        asked += 1
        if (throws) throw new Error('tracker unreachable')
        return spoken[c.id] ?? []
      },
    } as unknown as Tracker
    return { t, asked: () => asked }
  }

  const record = (c: Candidate, reason = 'could not reproduce') => defer(NO_DEFERRALS, c, reason, NOW)
  const blank = () => ({ skipped: [] as CycleReport['skipped'], skippedDeferred: 0 })

  it('drops an item nothing has answered', async () => {
    const c = item(7)
    const report = blank()
    const kept = await dropDeferred(tracker().t, [c], record(c), 'igor-bot', report)
    expect(kept).toEqual([])
    expect(report.skippedDeferred).toBe(1)
    expect(report.skipped[0]?.reason).toContain('could not reproduce')
    expect(report.skipped[0]?.stage).toBe('deferred')
  })

  it('keeps it once somebody replies', async () => {
    const c = item(7)
    const spoke = tracker({ 'github:o/r#7': [{ author: 'alice', at: '', body: 'here is the repro' }] })
    expect(await dropDeferred(spoke.t, [c], record(c), 'igor-bot', blank())).toEqual([c])
  })

  it('keeps it once it has been edited, without asking who spoke', async () => {
    // The fingerprint already settled it, so the request is not worth making.
    const before = item(7)
    const asker = tracker()
    expect(await dropDeferred(asker.t, [item(7, { title: 'Rewritten' })], record(before), 'igor-bot', blank()))
      .toHaveLength(1)
    expect(asker.asked()).toBe(0)
  })

  it('asks only about items that have a record', async () => {
    const c = item(7)
    const asker = tracker()
    await dropDeferred(asker.t, [c, item(8), item(9)], record(c), 'igor-bot', blank())
    expect(asker.asked()).toBe(1)
  })

  it('works the item when the tracker will not say, since the record is only a cache', async () => {
    const c = item(7)
    expect(await dropDeferred(tracker({}, true).t, [c], record(c), 'igor-bot', blank())).toEqual([c])
  })

  it('passes everything through when nothing was ever handed back', async () => {
    const all = [item(7), item(8)]
    expect(await dropDeferred(tracker().t, all, NO_DEFERRALS, 'igor-bot', blank())).toEqual(all)
  })
})

describe('items somebody stopped', () => {
  const NOW = Date.parse('2026-09-14T12:00:00Z')
  const ago = (minutes: number) => new Date(NOW - minutes * 60000).toISOString()
  const item = (n: number, over: Partial<Candidate> = {}) =>
    candidate({ id: `github:o/r#${n}`, native: String(n), ...over })
  const said = (author: string, minutes: number, body: string) => ({ author, at: ago(minutes), body })

  /** Filters on `since` the way a tracker does, so the window under test is the real one. */
  function tracker(spoken: Record<string, { author: string; at: string; body: string }[]> = {}, throws = false) {
    let asked = 0
    const t = {
      commentsSince: async (c: Candidate, since: string) => {
        asked += 1
        if (throws) throw new Error('tracker unreachable')
        return (spoken[c.id] ?? []).filter((m) => Date.parse(m.at) >= Date.parse(since))
      },
    } as unknown as Tracker
    return { t, asked: () => asked }
  }

  const blank = () => ({ skipped: [] as CycleReport['skipped'], skippedStopped: 0, skippedUnreadable: 0 })

  it('holds an item back on a stop sitting on it, with nothing remembered anywhere', async () => {
    // The rule is read off the tracker every cycle. No record of the stop exists, so an Igor
    // that lost its state — or never had it — still honours what a person put down.
    const c = item(7)
    const report = blank()
    const spoke = tracker({ 'github:o/r#7': [said('bob', 30, 'stop')] })
    expect(await dropStopped(spoke.t, [c], 60, 'igor-bot', report, NOW)).toEqual([])
    expect(report.skippedStopped).toBe(1)
    expect(report.skipped[0]?.reason).toContain('30 minutes left')
    expect(report.skipped[0]?.stage).toBe('stopped')
  })

  it('lets it back once the cooldown has elapsed', async () => {
    // The scan covers the cooldown and nothing earlier, so an older stop never comes back.
    const c = item(7)
    const spoke = tracker({ 'github:o/r#7': [said('bob', 90, 'stop')] })
    expect(await dropStopped(spoke.t, [c], 60, 'igor-bot', blank(), NOW)).toEqual([c])
  })

  it('lets it back early on a go-ahead', async () => {
    const c = item(7)
    const spoke = tracker({ 'github:o/r#7': [said('bob', 30, 'stop'), said('alice', 10, 'go ahead')] })
    expect(await dropStopped(spoke.t, [c], 60, 'igor-bot', blank(), NOW)).toEqual([c])
  })

  it('does not hear a go-ahead in its own receipt', async () => {
    // The receipt is the Igor talking to itself, and a stop is the wrong place to rely on a
    // phrase never happening to match.
    const c = item(7)
    const own = tracker({ 'github:o/r#7': [said('bob', 30, 'stop'), said('igor-bot', 10, 'carry on')] })
    expect(await dropStopped(own.t, [c], 60, 'igor-bot', blank(), NOW)).toEqual([])
  })

  it('does not let a go-ahead from before the stop lift it', async () => {
    // The window is the cooldown, so comments predating the stop are in hand — and somebody
    // who said carry on and then said stop meant the stop.
    const c = item(7)
    const spoke = tracker({
      'github:o/r#7': [said('bob', 50, 'stop'), said('alice', 40, 'go ahead'), said('bob', 20, 'stop')],
    })
    const report = blank()
    expect(await dropStopped(spoke.t, [c], 60, 'igor-bot', report, NOW)).toEqual([])
    // Measured from the last stop, not the first.
    expect(report.skipped[0]?.reason).toContain('40 minutes left')
  })

  it('does not let a stop lift itself', async () => {
    // One comment can be both: "stop" at the front matches isStop, and what follows the
    // address matches isGoAhead. Reading it as permission would undo the stop at once.
    const c = item(7)
    const both = tracker({
      'github:o/r#7': [said('bob', 30, 'stop @igor-bot — continue once I have looked')],
    })
    expect(await dropStopped(both.t, [c], 60, 'igor-bot', blank(), NOW)).toEqual([])
  })

  it('keeps waiting when the tracker will not say, unlike a handoff record', async () => {
    // A failed read cannot tell "no stop" from "cannot say", and a cycle of latency costs less
    // than claiming something a person put down.
    const c = item(7)
    const report = blank()
    expect(await dropStopped(tracker({}, true).t, [c], 60, 'igor-bot', report, NOW)).toEqual([])
    expect(report.skipped[0]?.reason).toContain('stopped answering')
  })

  it('stops asking the moment a read fails, instead of one failing request per item', async () => {
    // A tracker that cannot be read cannot be claimed on either, and an outage is precisely
    // when a request per survivor is worst: the reads that fail are what keeps it failing.
    const many = Array.from({ length: 20 }, (_, n) => item(n))
    const asker = tracker({}, true)
    const report = blank()
    expect(await dropStopped(asker.t, many, 60, 'igor-bot', report, NOW, 3)).toEqual([])
    expect(asker.asked()).toBe(1)
    // Reported as an outage, not as twenty people stopping twenty items.
    expect(report.skippedUnreadable).toBe(20)
    expect(report.skippedStopped).toBe(0)
    expect(report.skipped.map((s) => s.stage)).toEqual(Array(20).fill('unreadable'))
  })

  it('passes everything through when nothing was stopped', async () => {
    const all = [item(7), item(8)]
    expect(await dropStopped(tracker().t, all, 60, 'igor-bot', blank(), NOW)).toEqual(all)
  })

  it('stops once the cycle has the items it wanted', async () => {
    // One fetch per item examined, so the triage limit is also the cost bound.
    const fresh = Array.from({ length: 6 }, (_, n) => item(n))
    const asker = tracker()
    expect(await dropStopped(asker.t, fresh, 60, 'igor-bot', blank(), NOW, 3)).toHaveLength(3)
    expect(asker.asked()).toBe(3)
  })
})

describe('standing down after the settle window', () => {
  // The first verdict is the settle check, which must hold for execution to begin; the second
  // is the mid-execution checkpoint that finds the claim gone.
  const then = (v: ClaimVerdict) =>
    deps({ verdicts: [{ status: 'held' }, v], changes: [{ path: 'a.ts', content: 'x', kind: 'modified' }] })

  it('releases on a stop found mid-execution, so the receipt is true when it is read', async () => {
    const { d, posts, released } = then({ status: 'stopped', by: 'bob' })
    const r = await runItem(d, candidate(), role(), 'igor-bot', { ...noWait, worker: busyWorker })
    expect(r.outcome).toBe('stopped')
    expect(posts.at(-1)).toMatch(/released this/)
    expect(released).toContain('igor-bot')
  })

  it('releases on a claim lost mid-execution rather than leaving a second name on the item', async () => {
    const { d, released } = then({ status: 'lost', by: 'alice' })
    const r = await runItem(d, candidate(), role(), 'igor-bot', { ...noWait, worker: busyWorker })
    expect(r.outcome).toBe('lost')
    expect(released).toContain('igor-bot')
  })

  it('leaves what the worker produced as a draft rather than discarding it', async () => {
    // Somebody taking the item over is not asking for the diff to be destroyed, and the
    // working tree goes with the run.
    const { d, produced, posts } = then({ status: 'lost', by: 'alice' })
    const r = await runItem(d, candidate(), role(), 'igor-bot', { ...noWait, worker: busyWorker })
    expect(r.outcome).toBe('lost')
    expect(produced).toHaveLength(1)
    expect(produced[0]?.draft).toBe(true)
    // Nothing is asked of the person who took it over.
    expect(produced[0]?.reviewers).toEqual([])
    expect(posts.at(-1)).toMatch(/alice has it now/)
    expect(posts.at(-1)).toContain('https://example.test/9')
    expect(r.spoke).toBe(true)
  })

  it('publishes nothing on a stop, which is the case the re-check was built for', async () => {
    const { d, produced } = then({ status: 'stopped', by: 'bob' })
    const r = await runItem(d, candidate(), role(), 'igor-bot', { ...noWait, worker: busyWorker })
    expect(r.outcome).toBe('stopped')
    expect(produced).toEqual([])
  })

  it('does not complete an item it no longer holds', async () => {
    // Unassigning or moving an item somebody else took would undo their claim.
    const { d, released } = then({ status: 'lost', by: 'alice' })
    await runItem(d, candidate(), role(), 'igor-bot', { ...noWait, worker: busyWorker })
    // Exactly one release, the stand-down — not a second from the completion policy.
    expect(released).toEqual(['igor-bot'])
  })

  it('still publishes nothing where the role may not open a pull request', async () => {
    // Losing a claim does not widen what an Igor may do.
    const { d, produced, posts } = then({ status: 'lost', by: 'alice' })
    const r = await runItem(d, candidate(), role({ allow: ['comment'] }), 'igor-bot', {
      ...noWait,
      worker: busyWorker,
    })
    expect(produced).toEqual([])
    expect(r.spoke).toBe(false)
    expect(posts).toHaveLength(1)
  })
})

describe('the cost of checking deferrals', () => {
  const NOW2 = Date.parse('2026-09-14T12:00:00Z')

  it('stops looking once the cycle has as many items as it can triage', async () => {
    // Everything past the limit is dropped by the caller, so asking about it buys nothing.
    const items = Array.from({ length: 50 }, (_, n) => candidate({ id: `github:o/r#${n}`, native: String(n) }))
    let asked = 0
    const t = {
      commentsSince: async () => {
        asked += 1
        return []
      },
    } as unknown as Tracker
    let state = NO_DEFERRALS
    for (const c of items) state = defer(state, c, 'nothing to do', NOW2)
    const report = { skipped: [] as CycleReport['skipped'], skippedDeferred: 0 }
    // Every item is deferred, so nothing is kept and the scan runs to the end — the bound is
    // the survivor count, which the watermark is what limits.
    await dropDeferred(t, items, state, 'igor-bot', report, 10)
    expect(asked).toBe(50)

    asked = 0
    await dropDeferred(t, items, NO_DEFERRALS, 'igor-bot', report, 10)
    expect(asked).toBe(0)
  })

  it('asks about nothing once it has collected the items it wanted', async () => {
    const fresh = Array.from({ length: 5 }, (_, n) => candidate({ id: `github:o/r#f${n}`, native: `f${n}` }))
    const stale = candidate({ id: 'github:o/r#s', native: 's' })
    let asked = 0
    const t = { commentsSince: async () => { asked += 1; return [] } } as unknown as Tracker
    const report = { skipped: [] as CycleReport['skipped'], skippedDeferred: 0 }
    const kept = await dropDeferred(
      t, [...fresh, stale], defer(NO_DEFERRALS, stale, 'x', NOW2), 'igor-bot', report, 3,
    )
    expect(kept).toHaveLength(3)
    expect(asked).toBe(0)
  })
})

describe('one read, several windows', () => {
  const at = (iso: string) => ({ author: 'alice', at: iso, body: 'here is the repro' })
  const c = candidate({ id: 'github:o/r#7' })

  function source(spoken: { author: string; at: string; body: string }[]) {
    const asked: string[] = []
    const t: CommentSource = {
      commentsSince: async (_c, since) => {
        asked.push(since)
        return spoken.filter((m) => Date.parse(m.at) >= Date.parse(since))
      },
    }
    return { t, asked }
  }

  it('answers a narrower window out of the read it already made', async () => {
    const { t, asked } = source([at('2026-09-11T12:00:00Z')])
    const read = oneFetchPerItem(t, () => '2026-09-09T12:00:00Z')
    // The cooldown window first, then the deferral the read was taken for.
    expect(await read.commentsSince(c, '2026-09-14T11:00:00Z')).toEqual([])
    expect(await read.commentsSince(c, '2026-09-09T12:00:00Z')).toHaveLength(1)
    expect(asked).toEqual(['2026-09-09T12:00:00Z'])
  })

  it('reads again rather than answering a wider window short', async () => {
    // A truncated list is how a deferral outlives the reply that lifted it.
    const { t, asked } = source([at('2026-09-11T12:00:00Z')])
    const read = oneFetchPerItem(t, () => '2026-09-14T11:00:00Z')
    expect(await read.commentsSince(c, '2026-09-14T11:00:00Z')).toEqual([])
    expect(await read.commentsSince(c, '2026-09-09T12:00:00Z')).toHaveLength(1)
    expect(asked).toHaveLength(2)
  })

  it('replays a failed read instead of asking a tracker that is already refusing', async () => {
    let asked = 0
    const t: CommentSource = {
      commentsSince: async () => {
        asked += 1
        throw new Error('API rate limit exceeded')
      },
    }
    const read = oneFetchPerItem(t, () => '2026-09-09T12:00:00Z')
    await expect(read.commentsSince(c, '2026-09-14T11:00:00Z')).rejects.toThrow(/rate limit/)
    await expect(read.commentsSince(c, '2026-09-09T12:00:00Z')).rejects.toThrow(/rate limit/)
    expect(asked).toBe(1)
  })
})

describe('the seat that is chosen is the seat that pays', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('gives the worker the token of the seat the gate chose', async () => {
    vi.stubEnv('IGOR_SEAT_1', 'seat-one-token')
    vi.stubEnv('IGOR_SEAT_2', 'seat-two-token')
    const { d } = deps()
    let seen: NodeJS.ProcessEnv | undefined

    await runItem(d, candidate(), role(), 'igor-bot', {
      ...noWait,
      budget: { exhausted: () => false, seat: 'seat-2', token: { tokenEnv: 'IGOR_SEAT_2' } },
      worker: async (input) => {
        seen = input.env
        return { result: '' }
      },
    })

    expect(seen?.['CLAUDE_CODE_OAUTH_TOKEN']).toBe('seat-two-token')
    expect(seen?.['IGOR_SEAT_1']).toBeUndefined()
  })
})
