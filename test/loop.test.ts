import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type {
  Artifact,
  ArtifactRequest,
  Candidate,
  CatchUp,
  CatchUpRequest,
  ClaimVerdict,
  CodeHost,
  InFlight,
  ResolutionRequest,
  Tracker,
} from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { blobSha, type TreeProvider, type WorkingTree, type ChangedFile, type MergeState, type BaseChange } from '../src/worktree.js'
import {
  catchUpItem, declineReason, dropDeferred, dropStopped, oneFetchPerItem, recordDecisions, runItem,
  type CommentSource, type CycleReport, type ItemDeps,
} from '../src/loop.js'
import { defer, NO_DEFERRALS, shouldDefer } from '../src/deferred.js'
import { DECLARATION_PATH, ExecutionError } from '../src/execute.js'
import { budgetGate } from '../src/budget.js'
import { tempDir } from './tmp.js'

const candidate = (over: Partial<Candidate> = {}): Candidate =>
  ({ id: 'github:o/r#7', tracker: 'github', repo: 'o/r', native: '7', title: 'A bug', body: '', author: 'reporter', assignees: [], labels: [], paths: [], state: 'open', ...over }) as unknown as Candidate

const role = (over: Partial<Role> = {}): Role =>
  ({ name: 'triage', reviewers: ['alice'], allow: ['comment', 'draft-pr', 'unassign'], commands: [], completion: 'unassign', instructions: [], settleSeconds: 0, cooldownMinutes: 60, ...over }) as Role

function deps(opts: {
  caughtUp?: CatchUp[]
  merge?: MergeState
  verdicts?: ClaimVerdict[]
  claimSticks?: boolean
  changes?: ChangedFile[]
  /** What the worker left at `DECLARATION_PATH` in the tree, which is read off disk. */
  declaration?: string
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
  const asked: CatchUpRequest[] = []
  const resolved: ResolutionRequest[] = []
  const answers = [...(opts.caughtUp ?? [])]
  const codeHost: CodeHost = {
    name: 'fake',
    produce: async (r): Promise<Artifact> => {
      produced.push(r)
      return { kind: 'pull-request', ref: '#9', url: 'https://example.test/9' }
    },
    catchUp: async (r): Promise<CatchUp> => {
      asked.push(r)
      return answers.shift() ?? { outcome: 'already-current' }
    },
    resolve: async (r): Promise<string> => {
      resolved.push(r)
      return 'resolvedsha'
    },
  }
  const provisioned: (string | undefined)[] = []
  const merged: string[] = []
  const trees: TreeProvider = {
    name: 'fake',
    provision: async (_repo, ref): Promise<WorkingTree> => {
      provisioned.push(ref)
      const path = tempDir('igor-loop-')
      // Written where a worker writes it, because that is where it is read from: a repository
      // that ignores the directory — igor's own does — reports the file in no status.
      if (opts.declaration !== undefined) {
        mkdirSync(join(path, dirname(DECLARATION_PATH)), { recursive: true })
        writeFileSync(join(path, DECLARATION_PATH), opts.declaration)
      }
      return {
        path,
        repo: 'o/r',
        changes: async () => opts.changes ?? [],
        ...(opts.merge === undefined
          ? {}
          : {
              merge: async (into: string): Promise<MergeState> => {
                merged.push(into)
                return opts.merge!
              },
            }),
        release: async () => {},
      }
    },
  }
  return {
    d: { tracker, codeHost, trees } as ItemDeps,
    posts, released, produced, asked, resolved, provisioned, merged,
  }
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

  it('carries the gate’s own verdict into what it posts, rather than always saying used up', async () => {
    // The seam #49 lives on: the gate knows no seat could be read, and every hop between it
    // and the posted sentence rebuilds its object field by field. A real gate is used here
    // rather than a hand-made one, because a field dropped in one of those hops typechecks.
    const gate = budgetGate(
      { seats: [{ id: 'igor-1', reserve: 0 }], pools: [{ id: 'eng', seats: ['igor-1'] }] },
      { name: 'triage', seat: 'pool:eng' },
      [{ seat: { id: 'igor-1', reserve: 0 }, error: 'seat "igor-1" names $IGOR_SEAT_1, which is not set' }],
      [],
    )
    const { d, posts } = deps()
    const r = await runItem(d, candidate(), role(), 'igor-bot', { ...noWait, budget: gate })
    expect(r.handoff).toBe('budget')
    expect(posts.at(-1)).toContain("no seat's usage could be read")
    expect(posts.at(-1)).toContain('igor-1')
    expect(posts.at(-1)).not.toContain('is used up')
  })

  it('hands off on budget when the seat runs out mid-run, not on failure', async () => {
    // The seat dying part-way through and the gate catching it beforehand are one condition,
    // so they owe the same message: when capacity returns, rather than a crash nobody can act
    // on. Left as a failure this reads "worker exited 1" and defers the item for good.
    const resets = Math.floor(Date.now() / 1000) + 2 * 3600
    const wallClock = `${new Date(resets * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`
    const { d, posts, released } = deps({ changes: [] })
    const r = await runItem(d, candidate(), role(), 'igor-bot', {
      ...noWait,
      budget: { exhausted: () => false, seat: 'igor-1' },
      worker: async () => {
        throw new ExecutionError('worker exited 1', {
          is_error: true,
          result: `Claude AI usage limit reached|${resets}`,
        })
      },
    })

    expect(r.outcome).toBe('handed-off')
    expect(r.handoff).toBe('budget')
    expect(posts.at(-1)).toContain(wallClock)
    expect(posts.at(-1)).not.toMatch(/will not retry/)
    expect(released).toEqual(['igor-bot'])
    // Nothing about the item caused this, so it must come back when the capacity does.
    expect(shouldDefer(r.outcome, r.handoff)).toBe(false)
  })

  it('says the reset time was not reported rather than inventing one', async () => {
    const { d, posts } = deps({ changes: [] })
    const r = await runItem(d, candidate(), role(), 'igor-bot', {
      ...noWait,
      // The gate's own reset time is the soonest across the pool, which is not necessarily
      // this seat's, so an envelope that named none leaves the handoff saying so.
      budget: { exhausted: () => false, seat: 'igor-1', resetAt: new Date(Date.now() + 7200_000).toISOString() },
      worker: async () => {
        throw new ExecutionError('worker exited 1', { is_error: true, result: 'API Error: 429' })
      },
    })

    expect(r.handoff).toBe('budget')
    expect(posts.at(-1)).toMatch(/when it returns is not known/)
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

  it('does not defer an item over a command the allowlist refused', async () => {
    // The cure key names the role's commands, so the handoff was the Igor's configuration and
    // not the item: no comment on it would help, and the next item meets the same wall.
    const { d, posts } = deps({ changes: [] })
    const r = await runItem(d, candidate(), role(), 'igor-bot', {
      ...noWait,
      worker: async () => {
        throw new ExecutionError('worker exited 1', {
          is_error: true,
          result: 'permission denied',
          permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'npm test' } }],
        })
      },
    })
    expect(r.handoff).toBe('failure')
    expect(r.cures).toEqual(['role:triage:commands'])
    expect(shouldDefer(r.outcome, r.handoff, r.cures)).toBe(false)
    // Nothing suppresses the item, so a promise not to retry would be false by next poll.
    expect(posts.at(-1)).not.toMatch(/will not retry/i)
    expect(posts.at(-1)).toContain('role:triage:commands')
  })

  it('defers a handoff whose refusal named no configuration', async () => {
    // Only a refused command is known to be the role's list. Anything else the sandbox stopped
    // is an incident with no cure to name, and the item is where the deferral belongs.
    const { d } = deps({ changes: [] })
    const r = await runItem(d, candidate(), role(), 'igor-bot', {
      ...noWait,
      worker: async () => {
        throw new ExecutionError('worker exited 1', {
          is_error: true,
          result: 'permission denied',
          permission_denials: [{ tool_name: 'WebFetch', tool_input: { url: 'https://example.test' } }],
        })
      },
    })
    expect(r.handoff).toBe('failure')
    expect(r.cures).toEqual([])
    expect(shouldDefer(r.outcome, r.handoff, r.cures)).toBe(true)
  })

  it('keeps every cure one run earned, not the first of them', async () => {
    // A role that may not publish is as much a fact about the Igor as a command its allowlist
    // refuses, and this run proved both wrong at once. Recording either alone parks the item
    // behind the other: the handoff names a cure, somebody makes it, and the next run stops
    // on the one nothing told them about.
    const { d, posts } = deps({ changes: [{ path: 'a.ts', kind: 'modified', content: 'x' }] })
    const r = await runItem(d, candidate(), role({ allow: ['comment', 'unassign'] }), 'igor-bot', {
      ...noWait,
      worker: async () => ({
        result: 'Fixed it.',
        total_cost_usd: 0.02,
        permission_denials: [{ tool_name: 'Bash', tool_input: { command: 'npm test' } }],
      }),
    })
    expect(r.handoff).toBe('failure')
    // In the order the run met them: the command was refused while it worked, and the action
    // space only once it had something to publish.
    expect(r.cures).toEqual(['role:triage:commands', 'role:triage:allow'])
    expect(shouldDefer(r.outcome, r.handoff, r.cures)).toBe(false)
    expect(posts.at(-1)).not.toMatch(/will not retry/i)
    expect(posts.at(-1)).toContain('`role:triage:commands` and `role:triage:allow` are what would change it')
  })

  it('names the seat whose token could not be read, which is how the worker failed to start', async () => {
    // Issue #22's own shape: an Igor handed every item back as `worker exited 1` because no
    // seat token was set, and each stayed parked for a day after the cause was fixed. The key
    // is minted where the token is read, not guessed at from an exit code afterwards.
    const { d, posts } = deps()
    const r = await runItem(d, candidate(), role(), 'igor-bot', {
      ...noWait,
      budget: { exhausted: () => false, seat: 'team-seat', token: { tokenEnv: 'IGOR_SEAT_UNSET_48' } },
      worker: async () => { throw new Error('the worker must never be reached') },
    })
    expect(r.handoff).toBe('failure')
    expect(r.cures).toEqual(['seat:team-seat:token'])
    expect(shouldDefer(r.outcome, r.handoff, r.cures)).toBe(false)
    expect(posts.at(-1)).toContain('seat:team-seat:token')
    expect(posts.at(-1)).not.toMatch(/will not retry/i)
  })

  it('mints nothing for a worker that failed for reasons of its own', async () => {
    // The line this change must not cross. A crash nobody can name is not a configuration,
    // the next item might well go fine, and the item is where the deferral belongs.
    const { d, posts } = deps()
    const r = await runItem(d, candidate(), role(), 'igor-bot', {
      ...noWait,
      budget: { exhausted: () => false, seat: 'team-seat' },
      worker: brokenWorker,
    })
    expect(r.handoff).toBe('failure')
    expect(r.cures).toEqual([])
    expect(shouldDefer(r.outcome, r.handoff, r.cures)).toBe(true)
    expect(posts.at(-1)).toMatch(/will not retry/i)
  })

  it('defers what the worker decided about the item itself', async () => {
    // The behaviour the record exists for: nothing refused it, so an unanswered item would
    // otherwise be re-worked every poll interval at full worker cost.
    const { d } = deps({ changes: [] })
    const r = await runItem(d, candidate(), role(), 'igor-bot', { ...noWait, worker: idleWorker })
    expect(r.cures).toEqual([])
    expect(shouldDefer(r.outcome, r.handoff, r.cures)).toBe(true)
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
    untriaged: [],
    toCatchUp: [],
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

  it('names the seat triage spent from, so the cost is attributable', async () => {
    let written: Record<string, unknown> | undefined
    await recordDecisions('o/lore', role(), { ...report, triageSeat: 'seat-2' } as never, async (_r, _p, rec) => {
      written = rec
    })
    expect(written!['seat']).toBe('seat-2')
  })

  it('names no seat where none was chosen, rather than a false attribution', async () => {
    let written: Record<string, unknown> | undefined
    await recordDecisions('o/lore', role(), report as never, async (_r, _p, rec) => {
      written = rec
    })
    expect(written!['seat']).toBeUndefined()
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

/** An item carrying an artifact of this Igor's own that no longer merges. */
const stale = (over: Partial<InFlight> = {}): Candidate =>
  candidate({
    inFlight: {
      kind: 'pull-request',
      ref: '#21',
      url: 'https://example.test/21',
      draft: true,
      author: 'igor-bot',
      mergeable: 'conflicting',
      branch: 'igor/triage/7-a-bug',
      base: 'main',
      ...over,
    },
  })

/**
 * A conflict on one path, with the base's own change to it in hand — the shape every
 * resolution is checked against, rather than an empty base diff no conflicted merge produces.
 */
const conflicted: MergeState = {
  conflicts: ['src/a.ts'],
  head: 'headsha',
  broughtIn: 'basesha',
  baseChanges: [
    { path: 'src/a.ts', before: blobSha('base\n'), after: blobSha('theirs\n'), head: blobSha('ours\n') },
  ],
}

describe('catching an artifact of its own back up', () => {
  it('asks the code host to merge, and finishes there when that is clean', async () => {
    // The whole point of the cheap path: one request, no clone, no worker, no model.
    const { d, provisioned, asked } = deps({ caughtUp: [{ outcome: 'merged', sha: 'mergesha' }] })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot')

    expect(run.outcome).toBe('caught-up')
    expect(run.costUsd).toBe(0)
    expect(asked).toEqual([{ repo: 'o/r', branch: 'igor/triage/7-a-bug', base: 'main' }])
    expect(provisioned).toEqual([])
  })

  it('says nothing on the item when nothing had to be thought about', async () => {
    // A silent, clean catch-up is not news, and the merge commit on the branch is the record.
    // An Igor that commented every cycle would be the noise people mute.
    for (const outcome of [{ outcome: 'merged' as const, sha: 's' }, { outcome: 'already-current' as const }]) {
      const { d, posts, released } = deps({ caughtUp: [outcome] })
      const run = await catchUpItem(d, stale(), role(), 'igor-bot')
      expect(posts).toEqual([])
      expect(released).toEqual([])
      expect(run.spoke).toBe(false)
    }
  })

  it('leaves the item alone when the host cannot be asked', async () => {
    // Nothing was claimed, so nobody was told to stand off and no receipt is owed. The next
    // cycle asks again, which is what a rate limit wants.
    const { d, posts } = deps()
    d.codeHost.catchUp = async () => { throw new Error('API rate limit exceeded') }
    const run = await catchUpItem(d, stale(), role(), 'igor-bot')
    expect(run.outcome).toBe('refused')
    expect(run.reason).toContain('rate limit')
    expect(posts).toEqual([])
  })

  it('resolves a conflict on the branch that exists, never a new one', async () => {
    // Regenerating the artifact would be cheaper for the Igor and would throw away whatever
    // review has accumulated on it — a cost paid by the reviewer.
    const { d, provisioned, merged, resolved, produced, posts } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: conflicted,
      changes: [{ path: 'src/a.ts', content: 'resolved\n', kind: 'modified' }],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(run.outcome).toBe('produced')
    // The claim comment said the Igor picked the item up. An ordinary run then ends in a pull
    // request that announces itself; this one ends on a branch that is already there, so
    // without a word the item goes quiet mid-sentence.
    expect(posts.at(-1)).toContain('#21')
    expect(posts.at(-1)).toContain('main')
    expect(provisioned).toEqual(['igor/triage/7-a-bug'])
    expect(merged).toEqual(['main'])
    expect(produced).toEqual([])
    expect(resolved).toEqual([
      {
        repo: 'o/r',
        branch: 'igor/triage/7-a-bug',
        parents: ['headsha', 'basesha'],
        files: [{ path: 'src/a.ts', content: 'resolved\n' }],
        deletions: [],
        message: 'Merge main into igor/triage/7-a-bug',
      },
    ])
  })

  it('hands off rather than publishing a tree the worker left markers in', async () => {
    // Read off the content, because a worker may have staged its edits. Without this the
    // markers themselves go onto the branch and the artifact is worse than it was.
    const { d, resolved, posts } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: conflicted,
      changes: [{ path: 'src/a.ts', content: '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> x\n', kind: 'modified' }],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    expect(run.outcome).toBe('handed-off')
    expect(run.reason).toContain('#21')
    expect(posts.join(' ')).toContain('src/a.ts')
  })

  it('hands off once when the published resolution did not resolve anything', async () => {
    // Task 4.2. A resolution that leaves the artifact conflicting is the one way this could
    // spend a worker on the same merge every cycle forever. One request after publishing
    // turns that into a single handoff, which the deferral record then keeps quiet.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'conflict' }],
      merge: conflicted,
      changes: [{ path: 'src/a.ts', content: 'resolved\n', kind: 'modified' }],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toHaveLength(1)
    expect(run.outcome).toBe('handed-off')
    expect(run.handoff).toBe('failure')
    expect(shouldDefer(run.outcome, run.handoff, run.cures)).toBe(true)
  })

  it('hands off naming the artifact when the tree provider cannot merge at all', async () => {
    // `merge` is optional on a working tree, because nothing about a tree provider promises
    // git. A caller that cannot get one says so rather than guessing at a resolution.
    const { d, resolved } = deps({ caughtUp: [{ outcome: 'conflict' }] })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    expect(run.outcome).toBe('handed-off')
    expect(run.reason).toContain('#21')
  })

  it('spends no worker when the conflict cleared between the host and the clone', async () => {
    // Somebody pushed in between. The merge is already in the tree, so paying a model to look
    // at a tree with nothing left to decide would be paying for the race.
    let ran = 0
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: { conflicts: [], head: 'headsha', broughtIn: 'basesha', baseChanges: [] },
      changes: [{ path: 'src/a.ts', content: 'merged\n', kind: 'modified' }],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', {
      ...noWait,
      worker: async () => { ran += 1; return { result: 'x', total_cost_usd: 0.02 } },
    })

    expect(ran).toBe(0)
    expect(run.outcome).toBe('produced')
    expect(resolved).toHaveLength(1)
  })
})

describe('what a resolution is allowed to publish', () => {
  it('carries a deletion the base made, rather than resurrecting the file', async () => {
    // The resolution commit has two parents, so the host records the base as merged. A path
    // the base deleted and this commit does not is therefore not merely missing from the
    // artifact — merging the artifact reverts the deletion on the base, silently, in a diff
    // nobody asked for. That is worse than the produce path's gap, and cannot ride on it.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: conflicted,
      changes: [
        { path: 'src/a.ts', content: 'resolved\n', kind: 'modified' },
        { path: 'src/gone.ts', content: '', kind: 'deleted' },
      ],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(run.outcome).toBe('produced')
    expect(resolved[0]?.files).toEqual([{ path: 'src/a.ts', content: 'resolved\n' }])
    expect(resolved[0]?.deletions).toEqual(['src/gone.ts'])
  })

  it('refuses a half-resolved hunk, not only one with its opening marker left', async () => {
    // A worker that edits the top of a hunk and stops leaves `=======` and `>>>>>>>` behind.
    // Matching only the opening marker passes that straight through onto the branch, which is
    // the exact thing the check is here to stop.
    for (const content of [
      '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> main\n',
      'ours\n=======\ntheirs\n>>>>>>> main\n',
      'ours\n=======\ntheirs\n',
    ]) {
      const { d, resolved } = deps({
        caughtUp: [{ outcome: 'conflict' }],
        merge: conflicted,
        changes: [{ path: 'src/a.ts', content, kind: 'modified' }],
      })
      const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })
      expect(resolved).toEqual([])
      expect(run.outcome).toBe('handed-off')
    }
  })

  it('leaves a marker-shaped line alone in a file the merge did not conflict on', async () => {
    // `=======` is a markdown rule as often as it is half a conflict. Only the files git
    // reported unmerged are read for markers; refusing on the rest would park a resolution
    // over a heading somebody underlined.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: conflicted,
      changes: [
        { path: 'src/a.ts', content: 'resolved\n', kind: 'modified' },
        { path: 'README.md', content: 'Heading\n=======\n\ntext\n', kind: 'modified' },
      ],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })
    expect(run.outcome).toBe('produced')
    expect(resolved).toHaveLength(1)
  })

  it('stands down like any other run when the item is taken over mid-resolution', async () => {
    // The produce path degrades on a lost claim and this one did not degrade at all, so the
    // new holder got a note claiming credit on an item they now own.
    const { d, resolved, posts, released } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: conflicted,
      changes: [{ path: 'src/a.ts', content: 'resolved\n', kind: 'modified' }],
      verdicts: [{ status: 'held' }, { status: 'lost', by: 'alice' }],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    // The branch is the Igor's own, so bringing it up to date is still the right move.
    expect(resolved).toHaveLength(1)
    expect(run.outcome).toBe('lost')
    expect(released).toContain('igor-bot')
    expect(posts.join(' ')).not.toContain('resolved a merge conflict')
  })

  it('goes quiet when the tree comes back empty because somebody already caught it up', async () => {
    // A 409 answered by a clean local merge with nothing in it means the base landed on the
    // branch between the two requests. Routed through "the worker made no changes" that
    // becomes a claim, a handoff comment and a deferral on an artifact that merges fine.
    const { d, resolved, posts } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: { conflicts: [], head: 'headsha', broughtIn: 'basesha', baseChanges: [] },
      changes: [],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    expect(run.outcome).toBe('produced')
    expect(shouldDefer(run.outcome, run.handoff, run.cures)).toBe(false)
    expect(posts.join(' ')).not.toContain('resolved a merge conflict')
  })

  it('hands off when a conflicted merge comes back with an empty tree', async () => {
    // Not the same thing at all: the merge conflicted, so the tree held files, and something
    // threw them away. Reporting that as already up to date would call an abandoned conflict
    // a success.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: conflicted,
      changes: [],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    expect(run.outcome).toBe('handed-off')
    expect(run.reason).toContain('#21')
  })
})

describe('a base change is undone only where the resolution says so', () => {
  // Three contents and the blobs they hash to: what stood at the merge base, what the base
  // holds now, and what the artifact's own branch holds. A resolution publishing the first of
  // these for a path the base changed is the revert this guard is for.
  const BASE = 'base\n'
  const THEIRS = 'theirs\n'
  const OURS = 'ours\n'

  /** A path the base rewrote and the artifact also touched: the ordinary conflicted file. */
  const rewritten = (path: string): BaseChange => ({
    path,
    before: blobSha(BASE),
    after: blobSha(THEIRS),
    head: blobSha(OURS),
  })

  /** A path the base deleted, which the artifact's branch still holds untouched. */
  const removed = (path: string): BaseChange => ({ path, before: blobSha(BASE), head: blobSha(BASE) })

  const merging = (...baseChanges: BaseChange[]): MergeState => ({
    conflicts: ['src/a.ts'],
    head: 'headsha',
    broughtIn: 'basesha',
    baseChanges,
  })

  /** What the worker writes to say it meant to drop a base change. */
  const declares = (...reverts: { path: string; discards: string }[]): string =>
    JSON.stringify({ reverts })

  /** The same file arriving through the change list, where the repository does not ignore it. */
  const declaring = (...reverts: { path: string; discards: string }[]): ChangedFile => ({
    path: DECLARATION_PATH,
    content: declares(...reverts),
    kind: 'added',
  })

  /** A resolution the guard has nothing to say about, so a test can carry one and mean it. */
  const resolvedConflict: ChangedFile = { path: 'src/a.ts', content: 'ours\ntheirs\n', kind: 'modified' }

  it('refuses a resolution that republishes a file as it stood before the base rewrote it', async () => {
    // The published tree is the artifact's head with the resolution laid over it, so content
    // equal to the merge base is not a gap in the resolution — it is the base's rewrite gone,
    // and it lands the moment the artifact merges.
    const { d, resolved, posts } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: merging(rewritten('src/a.ts')),
      changes: [{ path: 'src/a.ts', content: BASE, kind: 'modified' }],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    expect(run.outcome).toBe('handed-off')
    expect(run.reason).toContain('src/a.ts')
    expect(posts.join(' ')).toContain('src/a.ts')
  })

  it('refuses a resolution that keeps a file the base deleted', async () => {
    // Nothing in the change list names the path: a worker that restores head's own copy
    // leaves a tree that differs from head in nothing, so the revert is invisible in exactly
    // the input the resolution is built from.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: merging(rewritten('src/a.ts'), removed('src/gone.ts')),
      changes: [resolvedConflict],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    expect(run.outcome).toBe('handed-off')
    expect(run.reason).toContain('src/gone.ts')
    expect(run.reason).toContain('deleted')
  })

  it('refuses a rename the base made and the resolution publishes the old side of', async () => {
    // A rename arrives as a removal and an addition, so the new path rides along with the
    // merge and only the old one is restored — the file is then published twice under two
    // names, which reads in review as nothing having happened to it.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: merging(rewritten('src/a.ts'), removed('src/old.ts'), {
        path: 'src/new.ts',
        after: blobSha(BASE),
      }),
      changes: [resolvedConflict, { path: 'src/new.ts', content: BASE, kind: 'added' }],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    expect(run.reason).toContain('src/old.ts')
    expect(run.reason).not.toContain('src/new.ts')
  })

  it('publishes the same two where the resolution declares them, and says so', async () => {
    const { d, resolved, posts } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: merging(rewritten('src/a.ts'), removed('src/gone.ts')),
      changes: [{ path: 'src/a.ts', content: BASE, kind: 'modified' }],
      declaration: declares(
        { path: 'src/a.ts', discards: blobSha(THEIRS) },
        { path: 'src/gone.ts', discards: 'deleted' },
      ),
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(run.outcome).toBe('produced')
    expect(resolved).toHaveLength(1)
    // On the resolution itself, because the commit is what review reads and an undone base
    // change leaves no other trace in it.
    expect(resolved[0]?.message).toContain('src/a.ts')
    expect(resolved[0]?.message).toContain(blobSha(THEIRS))
    expect(resolved[0]?.message).toContain('src/gone.ts')
    // And with the run, in the place a refusal would have been reported.
    expect(run.execution?.reverts).toEqual([
      `src/a.ts (base blob ${blobSha(THEIRS)})`,
      'src/gone.ts, which the base deleted',
    ])
    expect(posts.join(' ')).toContain('src/a.ts')
  })

  it('reads the declaration out of the tree rather than out of the change list', async () => {
    // A repository that ignores the directory reports the file in no status — igor's own
    // `.gitignore` covers `.igor/` — so a channel read from the change list is dead exactly
    // where an Igor works on itself, and every declared revert refuses.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: merging(rewritten('src/a.ts')),
      changes: [{ path: 'src/a.ts', content: BASE, kind: 'modified' }],
      declaration: declares({ path: 'src/a.ts', discards: blobSha(THEIRS) }),
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(run.outcome).toBe('produced')
    expect(resolved).toHaveLength(1)
    expect(run.execution?.changed.map((c) => c.path)).not.toContain(DECLARATION_PATH)
  })

  it('refuses a file kept against a deletion the base made, whatever it now holds', async () => {
    // A delete/modify conflict leaves the surviving copy on disk and the instructions invite
    // keeping it. The path is then present where the base deleted it, which undoes the
    // deletion — and asking for the merge base's own content there would catch only the
    // deletion nobody meant to drop, never the one a worker chose.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: merging(rewritten('src/a.ts'), { path: 'src/kept.ts', before: blobSha(BASE), head: blobSha(OURS) }),
      changes: [resolvedConflict, { path: 'src/kept.ts', content: OURS, kind: 'modified' }],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    expect(run.reason).toContain('src/kept.ts')
    expect(run.reason).toContain('deleted')
  })

  it('publishes that same kept file where the resolution declares the deletion it discards', async () => {
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: merging(rewritten('src/a.ts'), { path: 'src/kept.ts', before: blobSha(BASE), head: blobSha(OURS) }),
      changes: [resolvedConflict, { path: 'src/kept.ts', content: OURS, kind: 'modified' }],
      declaration: declares({ path: 'src/kept.ts', discards: 'deleted' }),
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(run.outcome).toBe('produced')
    expect(resolved[0]?.message).toContain('src/kept.ts')
    expect(run.execution?.reverts).toEqual(['src/kept.ts, which the base deleted'])
  })

  it('refuses where one of two reverts is declared, naming only the undeclared path', async () => {
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: merging(rewritten('src/a.ts'), removed('src/gone.ts')),
      changes: [{ path: 'src/a.ts', content: BASE, kind: 'modified' }],
      declaration: declares({ path: 'src/a.ts', discards: blobSha(THEIRS) }),
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    expect(run.reason).toContain('src/gone.ts')
    expect(run.reason).not.toContain('src/a.ts')
  })

  it('does not let a declaration cover a second path that discards the same state', async () => {
    // A declaration is a permission for one path. Two paths the base deleted discard the
    // identical state, so matching on the state alone would have one entry authorize both.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: merging(rewritten('src/a.ts'), removed('src/gone.ts'), removed('src/also-gone.ts')),
      changes: [resolvedConflict],
      declaration: declares({ path: 'src/gone.ts', discards: 'deleted' }),
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    expect(run.reason).toContain('src/also-gone.ts')
  })

  it('refuses a declaration naming a base state the base does not hold', async () => {
    // A declaration is a statement about one specific change. Naming a state the base moved
    // off is a statement about some other one, and it authorizes nothing — which is what
    // stops a declaration written early in a run from covering what became true after it.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: merging(rewritten('src/a.ts')),
      changes: [{ path: 'src/a.ts', content: BASE, kind: 'modified' }],
      declaration: declares({ path: 'src/a.ts', discards: blobSha('something the base moved off\n') }),
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    expect(run.reason).toContain('src/a.ts')
  })

  it('refuses a declaration that names no path, however it tries to say everything', async () => {
    // The blanket form is the one that gets set once and forgotten, so there is none to
    // parse: a wildcard, a whole-resolution flag and an entry with no path alike authorize
    // nothing, and every revert is handed off as if undeclared.
    for (const reverts of [
      [{ path: '*', discards: blobSha(THEIRS) }],
      [{ path: '', discards: blobSha(THEIRS) }],
      [{ discards: blobSha(THEIRS) } as unknown as { path: string; discards: string }],
    ]) {
      const { d, resolved } = deps({
        caughtUp: [{ outcome: 'conflict' }],
        merge: merging(rewritten('src/a.ts')),
        changes: [{ path: 'src/a.ts', content: BASE, kind: 'modified' }],
        declaration: declares(...reverts),
      })
      const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })
      expect(resolved).toEqual([])
      expect(run.reason).toContain('src/a.ts')
    }

    // The same, for a declaration that is not the documented shape at all.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: merging(rewritten('src/a.ts')),
      changes: [{ path: 'src/a.ts', content: BASE, kind: 'modified' }],
      declaration: '{"all": true}',
    })
    expect((await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })).outcome)
      .toBe('handed-off')
    expect(resolved).toEqual([])
  })

  it('publishes unremarked where a declaration names a path that is not being reverted', async () => {
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: merging(rewritten('src/a.ts')),
      changes: [resolvedConflict],
      declaration: declares({ path: 'src/a.ts', discards: blobSha(THEIRS) }),
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(run.outcome).toBe('produced')
    expect(resolved[0]?.message).toBe('Merge main into igor/triage/7-a-bug')
    expect(run.execution?.reverts).toBeUndefined()
  })

  it('publishes a resolution that keeps what the base did, however it keeps it', async () => {
    // Taking the base's side, combining both sides, and honouring a deletion the base made
    // restore nothing. The comparison reads outcomes, so none of the three needs a word.
    const cases: { what: string; base: BaseChange[]; changes: ChangedFile[] }[] = [
      {
        what: "the base's side",
        base: [rewritten('src/a.ts')],
        changes: [{ path: 'src/a.ts', content: THEIRS, kind: 'modified' }],
      },
      {
        what: 'both sides',
        base: [rewritten('src/a.ts')],
        changes: [{ path: 'src/a.ts', content: `${OURS}${THEIRS}`, kind: 'modified' }],
      },
      {
        what: "the base's deletion",
        base: [rewritten('src/a.ts'), removed('src/gone.ts')],
        changes: [resolvedConflict, { path: 'src/gone.ts', content: '', kind: 'deleted' }],
      },
    ]
    for (const { what, base, changes } of cases) {
      const { d, resolved, posts } = deps({
        caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
        merge: merging(...base),
        changes,
      })
      const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })
      expect(run.outcome, what).toBe('produced')
      expect(resolved, what).toHaveLength(1)
      expect(resolved[0]?.message, what).toBe('Merge main into igor/triage/7-a-bug')
      expect(posts.join(' '), what).not.toContain('would undo')
    }
  })

  it('publishes where all the base changed about a path was its mode', async () => {
    // The same blob on both sides is a mode change, and this comparison reads content. Read as
    // a restoration it would refuse every resolution that so much as leaves the file alone.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: merging(rewritten('src/a.ts'), {
        path: 'run.sh',
        before: blobSha('#!/bin/sh\n'),
        after: blobSha('#!/bin/sh\n'),
        head: blobSha('#!/bin/sh\n'),
      }),
      changes: [resolvedConflict],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(run.outcome).toBe('produced')
    expect(resolved).toHaveLength(1)
  })

  it('publishes a path the base changed that the artifact branch already matched', async () => {
    // Both sides arrived at the same content, so keeping head's copy keeps the base's change
    // rather than undoing it. Comparing content rather than which paths were touched is what
    // makes this fall out instead of needing a case of its own.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: merging(rewritten('src/a.ts'), {
        path: 'src/same.ts',
        before: blobSha(BASE),
        after: blobSha(THEIRS),
        head: blobSha(THEIRS),
      }),
      changes: [resolvedConflict],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(run.outcome).toBe('produced')
    expect(resolved).toHaveLength(1)
  })

  it('publishes no declaration onto the branch, declared or not', async () => {
    // A declaration committed onto the artifact would be a standing permission outliving the
    // run that made it, so it is read out of the tree and never laid over it.
    for (const reverts of [
      [{ path: 'src/a.ts', discards: blobSha(THEIRS) }],
      [{ path: 'src/untouched.ts', discards: blobSha(THEIRS) }],
    ]) {
      const { d, resolved } = deps({
        caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
        merge: merging(rewritten('src/a.ts')),
        // Both routes at once: on disk, where it is read, and in the change list, which is
        // what a repository that does not ignore the directory reports.
        changes: [{ path: 'src/a.ts', content: BASE, kind: 'modified' }, declaring(...reverts)],
        declaration: declares(...reverts),
      })
      await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })
      for (const request of resolved) {
        expect(request.files.map((f) => f.path)).not.toContain(DECLARATION_PATH)
        expect(request.deletions).not.toContain(DECLARATION_PATH)
      }
    }
  })

  it('refuses before the host is asked to do anything at all', async () => {
    // The refusal is a decision about the commit, so it precedes it: not the post-publish
    // re-ask in another guise, which asks whether the branch merges — and a revert merges
    // perfectly cleanly.
    const { d, resolved, asked } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: merging(rewritten('src/a.ts')),
      changes: [{ path: 'src/a.ts', content: BASE, kind: 'modified' }],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    // The one ask is the question that sent this down the resolution path in the first place.
    expect(asked).toHaveLength(1)
    expect(run.outcome).toBe('handed-off')
  })

  it('holds where the claim was lost mid-execution, which publishes and returns', async () => {
    // That path publishes before the post-publish re-ask and returns, so a guard living
    // anywhere after the commit does not run on it at all.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: merging(rewritten('src/a.ts')),
      changes: [{ path: 'src/a.ts', content: BASE, kind: 'modified' }],
      verdicts: [{ status: 'held' }, { status: 'lost', by: 'alice' }],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    expect(run.outcome).not.toBe('produced')
  })

  it('catches both instances from PR #64 as published trees rather than as status codes', async () => {
    // Each was a different route to one outcome: a path the base changed, published as the
    // artifact's older copy. A guard per route is a guard that misses the next route, so
    // both are stated as the tree that would have been published.
    const instances: { what: string; changes: ChangedFile[]; names: string }[] = [
      // The base deleted a path and the resolution's change list lost the deletion.
      { what: 'a dropped deletion', changes: [resolvedConflict], names: 'src/gone.ts' },
      // The merge staged the base's rewrite, the worker removed the file, and the record was
      // skipped — so the resolution mentions the path nowhere and head's older copy stands.
      { what: 'a skipped record', changes: [resolvedConflict], names: 'src/stale.ts' },
    ]
    for (const { what, changes, names } of instances) {
      const { d, resolved } = deps({
        caughtUp: [{ outcome: 'conflict' }],
        merge: merging(rewritten('src/a.ts'), removed('src/gone.ts'), {
          path: 'src/stale.ts',
          before: blobSha(BASE),
          after: blobSha(THEIRS),
          head: blobSha(BASE),
        }),
        changes,
      })
      const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })
      expect(resolved, what).toEqual([])
      expect(run.reason, what).toContain(names)
    }
  })
})

describe('markers and silence after a claim was taken', () => {
  it('refuses markers in a file the worker itself created', async () => {
    // The conflicted-path list is read before the worker runs, so a file it creates after
    // that is in no list. A worker restructuring a hunk into a new file carries the markers
    // with it, and scoping the check to the paths git named lets them straight through.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: conflicted,
      changes: [
        { path: 'src/a.ts', content: 'clean\n', kind: 'modified' },
        { path: 'src/b.ts', content: '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> main\n', kind: 'added' },
      ],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(resolved).toEqual([])
    expect(run.outcome).toBe('handed-off')
  })

  it('still leaves a heading rule alone in a file the merge did not conflict on', async () => {
    // `=======` is the one marker with a real false-positive rate, so it alone stays scoped
    // to the paths git reported unmerged. Widening it would park a resolution over a heading.
    const { d, resolved } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: conflicted,
      changes: [
        { path: 'src/a.ts', content: 'resolved\n', kind: 'modified' },
        { path: 'docs/x.md', content: 'Heading\n=======\n\ntext\n', kind: 'added' },
      ],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })
    expect(run.outcome).toBe('produced')
    expect(resolved).toHaveLength(1)
  })

  it('does not take a claim and then go quiet when the base had already landed', async () => {
    // The claim comment has already gone out by the time the empty tree is discovered, so
    // saying nothing after it is the "goes quiet mid-sentence" failure, not the clean-path
    // exemption — that path never claims anything.
    const { d, posts } = deps({
      caughtUp: [{ outcome: 'conflict' }],
      merge: { conflicts: [], head: 'headsha', broughtIn: 'basesha', baseChanges: [] },
      changes: [],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(run.outcome).toBe('produced')
    expect(run.spoke).toBe(true)
    expect(posts).toHaveLength(2)
    expect(posts.at(-1)).toContain('#21')
  })

  it('does not tell somebody the work is gone when it is on the artifact', async () => {
    // A handoff that links the published artifact and says in the same breath that the edits
    // "are gone with the working copy" is wrong twice, and it is the catch-up paths that
    // reach it — they are the ones that hand off holding an artifact.
    const { d, posts } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'conflict' }],
      merge: conflicted,
      changes: [{ path: 'src/a.ts', content: 'resolved\n', kind: 'modified' }],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })

    expect(run.outcome).toBe('handed-off')
    const note = posts.at(-1) ?? ''
    expect(note).not.toContain('never published')
    expect(note).not.toContain('as a draft')
    expect(note).toContain('#21')
  })
})

describe('what the note on the item claims', () => {
  it('does not claim a conflict was resolved when no worker ever saw one', async () => {
    // The host answered 409 and the clone's merge came out clean — somebody pushed in
    // between. Nothing was resolved and nothing was asked to resolve it, so saying a conflict
    // was resolved is a claim about work that did not happen.
    let ran = 0
    const { d, posts } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: { conflicts: [], head: 'headsha', broughtIn: 'basesha', baseChanges: [] },
      changes: [{ path: 'src/a.ts', content: 'merged\n', kind: 'modified' }],
    })
    const run = await catchUpItem(d, stale(), role(), 'igor-bot', {
      ...noWait,
      worker: async () => { ran += 1; return { result: 'x', total_cost_usd: 0.02 } },
    })

    expect(ran).toBe(0)
    expect(run.outcome).toBe('produced')
    expect(posts.at(-1)).not.toContain('resolved a merge conflict')
    expect(posts.at(-1)).toContain('#21')
  })

  it('does claim it where a worker actually resolved one', async () => {
    const { d, posts } = deps({
      caughtUp: [{ outcome: 'conflict' }, { outcome: 'already-current' }],
      merge: conflicted,
      changes: [{ path: 'src/a.ts', content: 'resolved\n', kind: 'modified' }],
    })
    await catchUpItem(d, stale(), role(), 'igor-bot', { ...noWait, worker: busyWorker })
    expect(posts.at(-1)).toContain('resolved a merge conflict')
  })
})
