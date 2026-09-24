import { describe, expect, it } from 'vitest'
import type { Candidate, Tracker } from '../src/adapter.js'
import type { ExecutionResult } from '../src/execute.js'
import type { Role } from '../src/role.js'
import { composeHandoff, handOffFrom, noCapacity, stepsFrom, suggest, type HandoffReason } from '../src/handoff.js'
import { shouldDefer } from '../src/deferred.js'

const NOW = Date.parse('2026-09-13T12:00:00Z')
const CLAIMED = new Date(NOW - 12 * 60_000).toISOString()

const candidate = (over: Partial<Candidate> = {}): Candidate =>
  ({ id: 'github:o/r#7', repo: 'o/r', native: '7', title: 'A bug', author: 'reporter', assignees: [], labels: [], paths: [], state: 'open', ...over }) as unknown as Candidate

const role = (over: Partial<Role> = {}): Role =>
  ({ name: 'triage', reviewers: ['alice'], allow: ['comment', 'draft-pr', 'unassign'], completion: 'unassign', instructions: [], ...over }) as unknown as Role

/**
 * An override of `undefined` means the field is absent, which is the distinction
 * `exactOptionalPropertyTypes` draws and which several cases here depend on.
 */
const result = (over: { [K in keyof ExecutionResult]?: ExecutionResult[K] | undefined } = {}): ExecutionResult => {
  const merged: Record<string, unknown> = {
    outcome: 'produced',
    changed: [{ path: 'a.ts', content: '', kind: 'modified' }],
    refusals: [],
    transcript: 'did the thing',
    costUsd: 0.1,
    reason: 'opened #9',
    artifact: { kind: 'pull-request', ref: '#9', url: 'https://example.test/9' },
    ...over,
  }
  for (const [k, v] of Object.entries(merged)) if (v === undefined) delete merged[k]
  return merged as unknown as ExecutionResult
}

function tracker(opts: { reportThrows?: boolean; releaseThrows?: boolean } = {}) {
  const log = { reported: [] as string[], released: [] as string[] }
  const t: Tracker = {
    name: 'fake',
    nativeHolderField: true,
    identity: async () => 'igor-bot',
    search: async () => [],
    claim: async () => true,
    commentsSince: async () => [],
    verifyClaim: async () => ({ status: 'held' }),
    report: async (_c, m) => {
      if (opts.reportThrows) throw new Error('surface unreachable')
      log.reported.push(m)
    },
    release: async (_c, as) => {
      if (opts.releaseThrows) throw new Error('cannot unassign')
      log.released.push(as)
    },
    linkage: () => 'Closes #7',
  }
  return { t, log }
}

describe('composed from state, never from a model', () => {
  it('derives what was done from the recorded result', () => {
    const { done } = stepsFrom(CLAIMED, result(), NOW)
    expect(done).toEqual(['claimed this 12 minutes ago', 'changed 1 file', 'opened #9 as a draft'])
  })

  it('says everything remains when the work never started', () => {
    // The case where no worker ran at all, which is exactly when a model call is impossible.
    const { done, remaining } = stepsFrom(CLAIMED, undefined, NOW)
    expect(done).toEqual(['claimed this 12 minutes ago'])
    expect(remaining[0]).toMatch(/never started/)
  })

  it('leaves nothing unsaid when a seat ran out part-way through', () => {
    const { remaining } = stepsFrom(CLAIMED, result({ outcome: 'budget', artifact: undefined }), NOW)
    expect(remaining.join(' ')).toMatch(/never published/)
  })

  it('is honest that unpublished edits are gone with the working copy', () => {
    const { remaining } = stepsFrom(CLAIMED, result({ outcome: 'failed', artifact: undefined }), NOW)
    expect(remaining.join(' ')).toMatch(/never published.*gone with the working copy/)
  })

  it('names each refusal as something still outstanding', () => {
    const { remaining } = stepsFrom(
      CLAIMED,
      result({ refusals: [{ action: 'draft-pr', why: 'role may not open one' }] }),
      NOW,
    )
    expect(remaining[0]).toContain('role may not open one')
  })

  it('counts a removal as work rather than as nothing', () => {
    // A run whose every change was a removal publishes a pull request. Counted only as edits,
    // the handoff says a draft was opened over no changes at all.
    const { done } = stepsFrom(
      CLAIMED,
      result({ changed: [{ path: 'src/gone.ts', content: '', kind: 'deleted' }] }),
      NOW,
    )
    expect(done).toEqual(['claimed this 12 minutes ago', 'removed 1 file', 'opened #9 as a draft'])
  })

  it('counts what the artifact carries, not what git reported twice', () => {
    // A path written back after being removed is two records for one file. Counted as both,
    // the handoff sends the reader looking for a deletion that is not in the diff.
    const { done } = stepsFrom(
      CLAIMED,
      result({
        changed: [
          { path: 'src/a.ts', content: '', kind: 'deleted' },
          { path: 'src/a.ts', content: 'rewritten', kind: 'added' },
        ],
      }),
      NOW,
    )
    expect(done).toEqual(['claimed this 12 minutes ago', 'changed 1 file', 'opened #9 as a draft'])
  })

  it('says a removal that was never published is gone too', () => {
    // The alternative branch reads "nothing usable was produced", one line under a Done list
    // that has just said a file was removed.
    const { remaining } = stepsFrom(
      CLAIMED,
      result({
        outcome: 'failed',
        artifact: undefined,
        changed: [{ path: 'src/gone.ts', content: '', kind: 'deleted' }],
      }),
      NOW,
    )
    expect(remaining.join(' ')).toMatch(/never published.*gone with the working copy/)
  })

  it('does not claim files were changed when none were', () => {
    const { done } = stepsFrom(CLAIMED, result({ changed: [], artifact: undefined, outcome: 'nothing-to-do' }), NOW)
    expect(done.join(' ')).not.toMatch(/changed/)
  })
})

describe('who could continue', () => {
  it('prefers reviewers, then whoever raised it', () => {
    expect(suggest(role(), candidate(), 'igor-bot')).toEqual(['alice', 'reporter'])
  })

  it('never suggests the Igor itself', () => {
    expect(suggest(role({ reviewers: ['igor-bot', 'alice'] }), candidate(), 'igor-bot')).toEqual(['alice', 'reporter'])
  })

  it('falls back to the author when no reviewers are configured', () => {
    expect(suggest(role({ reviewers: [] }), candidate(), 'igor-bot')).toEqual(['reporter'])
  })

  it('names nobody rather than saying "anyone", which an unassigned item already says', () => {
    const text = composeHandoff(role({ reviewers: [] }), candidate({ author: '' }), {
      reason: { kind: 'failure', detail: 'x' }, done: [], remaining: [], suggested: [],
    }, NOW)
    expect(text).not.toMatch(/could pick this up/)
  })
})

describe('a budget handoff says when capacity returns', () => {
  const resetAt = new Date(NOW + 3 * 3600_000).toISOString()

  it('states the reset time rather than reporting itself unavailable', () => {
    const text = composeHandoff(role(), candidate(), {
      reason: { kind: 'budget', seat: 'igor-1', resetAt }, done: [], remaining: [], suggested: ['alice'],
    }, NOW)
    // A person reads this: wall clock, not a machine timestamp with milliseconds.
    expect(text).toContain('2026-09-13 15:00 UTC')
    expect(text).not.toContain(resetAt)
    expect(text).toMatch(/in about 3 hours/)
    expect(text).toContain('igor-1')
  })

  it('hedges the time where it is not a return the provider stated', () => {
    // A refusal that named no reset bounds itself by the cadence; a week preferred over a
    // session nothing can order it against is a figure that may be early. Neither is an hour
    // the provider gave, and the sentence promises neither the hour nor a side of it.
    const text = composeHandoff(role(), candidate(), {
      reason: { kind: 'budget', seat: 'igor-1', resetAt, resetApproximate: true },
      done: [], remaining: [], suggested: [],
    }, NOW)
    expect(text).toContain('back around 2026-09-13 15:00 UTC')
    expect(text).not.toContain('back at')
  })

  it('admits when the reset time is unknown rather than inventing one', () => {
    // The cap is unpublished; guessing a time would be worse than saying so.
    const text = composeHandoff(role(), candidate(), {
      reason: { kind: 'budget' }, done: [], remaining: [], suggested: [],
    }, NOW)
    expect(text).toMatch(/not known/)
  })

  it('does not call the budget used up where no seat could be read — #49', () => {
    // One way to reach "no seat" is a spent budget and another is a token that did not
    // resolve. The first sends the reader to look at spend and the second at configuration,
    // and a sentence covering both sends half of them to the wrong place.
    const text = composeHandoff(role(), candidate(), {
      reason: { kind: 'budget', blocked: 'credential',
                passedOver: [{ seat: 'igor-1', verdict: 'credential' }, { seat: 'adam', verdict: 'credential' }] },
      done: [], remaining: [], suggested: [],
    }, NOW)
    expect(text).toContain("no seat's usage could be read")
    expect(text).toContain('igor-1, adam')
    expect(text).not.toContain('is used up')
    expect(text).not.toMatch(/not known/)
  })

  it('names an uncalibrated pool as uncalibrated rather than as spent', () => {
    const text = composeHandoff(role(), candidate(), {
      reason: { kind: 'budget', blocked: 'no-figure', passedOver: [{ seat: 'adam', verdict: 'no-figure' }] },
      done: [], remaining: [], suggested: [],
    }, NOW)
    expect(text).toContain('no seat has a capacity figure to spend against')
    expect(text).toContain('adam')
    expect(text).not.toContain('is used up')
  })

  it('still says used up where a seat really did run out', () => {
    // The verdict the sentence was always right about, and the reason it is kept: a pool with
    // one spent seat is a spent pool whatever else is also wrong with it.
    const text = composeHandoff(role(), candidate(), {
      reason: { kind: 'budget', seat: 'igor-1', resetAt, blocked: 'spent',
                passedOver: [{ seat: 'igor-1', verdict: 'spent' }] },
      done: [], remaining: [], suggested: [],
    }, NOW)
    expect(text).toContain('is used up')
    expect(text).toContain('2026-09-13 15:00 UTC')
  })

  it('stays a budget handoff whichever way there was no seat, so nothing parks the item', () => {
    // `shouldDefer` exempts `kind: 'budget'`. A credential fault reported as a kind of its own
    // would park every item an unreadable seat was offered, for something they had no part in
    // — the harm #49 rules out while asking for the distinction.
    const reason: HandoffReason = {
      kind: 'budget', blocked: 'credential', passedOver: [{ seat: 'igor-1', verdict: 'credential' }],
    }
    expect(shouldDefer('handed-off', reason.kind, [])).toBe(false)
  })

  it('offers no way to defer for being busy', () => {
    // Enforced by the type having only budget and failure — there is no busy variant to pass.
    const reasons = ['budget', 'failure']
    expect(reasons).not.toContain('busy')
  })
})

describe('a failure handoff', () => {
  const text = composeHandoff(role(), candidate(), {
    reason: { kind: 'failure', detail: 'worker exceeded 900s and was killed' },
    done: ['claimed this 12 minutes ago'],
    remaining: ['all of it'],
    suggested: ['alice'],
    artifact: { kind: 'pull-request', ref: '#9', url: 'https://example.test/9' },
  }, NOW)

  it('names the failure without pretending to understand it', () => {
    expect(text).toContain('worker exceeded 900s')
  })

  it('says plainly that it will not retry', () => {
    expect(text).toMatch(/will not retry/i)
  })

  it('promises no retry only where the item is what it is waiting on', () => {
    // An item nothing suppresses comes back next poll, so the sentence has to say so — and
    // name what would have to change, since a reply on the item would not.
    const refused = composeHandoff(role(), candidate(), {
      reason: { kind: 'failure', detail: 'worker exited 1', cures: ['role:triage:commands'] },
      done: ['claimed this 12 minutes ago'],
      remaining: ['all of it'],
      suggested: [],
    }, NOW)
    expect(refused).not.toMatch(/will not retry/i)
    expect(refused).toContain('role:triage:commands')
    expect(refused).toMatch(/comes back to this/)
  })

  it('reads as one sentence whether one configuration was wrong or several', () => {
    // A run refused an action after a command was denied has two things to fix, and a handoff
    // naming one parks the item behind the other once somebody makes that one change.
    const both = composeHandoff(role(), candidate(), {
      reason: {
        kind: 'failure',
        detail: 'the work is done but triage may not open a pull request',
        cures: ['role:triage:commands', 'role:triage:allow'],
      },
      done: ['claimed this 12 minutes ago'],
      remaining: ['all of it'],
      suggested: [],
    }, NOW)
    expect(both).toContain('`role:triage:commands` and `role:triage:allow` are what would change it')
    expect(both).not.toMatch(/will not retry/i)

    const three = composeHandoff(role(), candidate(), {
      reason: { kind: 'failure', detail: 'worker exited 1', cures: ['a:1', 'b:2', 'c:3'] },
      done: [], remaining: ['all of it'], suggested: [],
    }, NOW)
    expect(three).toContain('`a:1`, `b:2` and `c:3` are what would change it')

    // An empty list is a handoff that named nothing, and reads exactly as one.
    const none = composeHandoff(role(), candidate(), {
      reason: { kind: 'failure', detail: 'worker exited 1', cures: [] },
      done: [], remaining: ['all of it'], suggested: [],
    }, NOW)
    expect(none).toMatch(/will not retry/i)
  })

  it('links partial work so the next party resumes rather than restarts', () => {
    expect(text).toContain('https://example.test/9')
    expect(text).toMatch(/rather than starting over/)
  })

  it('states what was done, what remains, and who could continue', () => {
    expect(text).toMatch(/\*\*Done:\*\*/)
    expect(text).toMatch(/\*\*Left:\*\*/)
    expect(text).toMatch(/alice could pick this up/)
  })

  it('collapses to two lines when there is nothing to report but the claim', () => {
    // The common case. Seven headings around two facts is the thing being avoided.
    const brief = composeHandoff(role(), candidate(), {
      reason: { kind: 'budget', seat: 'igor-1' },
      done: ['claimed this 12 minutes ago'],
      remaining: ['everything — the work never started'],
      suggested: ['alice'],
    }, NOW)
    expect(brief.split('\n').filter((l) => l.trim() !== '')).toHaveLength(3)
    expect(brief.length).toBeLessThan(240)
  })
})

describe('posting it', () => {
  it('posts before releasing, so the item is never unclaimed and unexplained', async () => {
    const order: string[] = []
    const { t } = tracker()
    const spy: Tracker = {
      ...t,
      report: async () => { order.push('report') },
      release: async () => { order.push('release') },
    }
    await handOffFrom(spy, candidate(), role(), 'igor-bot', CLAIMED, { kind: 'budget' }, result(), NOW)
    expect(order).toEqual(['report', 'release'])
  })

  it('releases even when posting fails', async () => {
    // Holding a claim it has abandoned is worse than releasing without explanation.
    const { t, log } = tracker({ reportThrows: true })
    const out = await handOffFrom(t, candidate(), role(), 'igor-bot', CLAIMED, { kind: 'budget' }, result(), NOW)
    expect(out.posted).toBe(false)
    expect(out.error).toContain('surface unreachable')
    expect(log.released).toEqual(['igor-bot'])
  })

  it('reports honestly when it could not release either', async () => {
    const { t } = tracker({ releaseThrows: true })
    const out = await handOffFrom(t, candidate(), role(), 'igor-bot', CLAIMED, { kind: 'budget' }, result(), NOW)
    expect(out.posted).toBe(true)
    expect(out.released).toBe(false)
  })

  it('still posts when the worker could not be invoked at all', async () => {
    // The case the whole design is for: nothing ran, so nothing can be asked to explain it.
    const { t, log } = tracker()
    const out = await handOffFrom(
      t, candidate(), role(), 'igor-bot', CLAIMED,
      { kind: 'failure', detail: 'claude: command not found' }, undefined, NOW,
    )
    expect(out.posted).toBe(true)
    expect(log.reported[0]).toContain('command not found')
    expect(log.reported[0]).toMatch(/never started/)
  })
})

describe('finding nothing is a result, not a breakdown', () => {
  const text = composeHandoff(role(), candidate(), {
    reason: { kind: 'nothing-to-do', detail: 'it read this and found nothing it could usefully change' },
    done: ['claimed this 12 minutes ago'],
    remaining: ['all of it — nothing was changed, so this needs a person to look'],
    suggested: ['alice'],
  }, NOW)

  it('does not describe it as something it could not get past', () => {
    expect(text).not.toMatch(/could not get past/)
    expect(text).not.toMatch(/will not retry/)
  })

  it('still says what it did and what is left', () => {
    expect(text).toMatch(/found nothing it could usefully change/)
    expect(text).toMatch(/needs a person to look/)
  })
})

describe('the same sentence where nothing was claimed', () => {
  // A cycle that triaged nothing has no item to hand back and no seat to name, and still owes
  // the reader what a handoff owes them. One composer, so the two cannot come to disagree.
  const resetAt = new Date(NOW + 3 * 3600_000).toISOString()

  it('states the hour without naming a seat that ran out', () => {
    const text = noCapacity({ blocked: 'spent', resetAt }, NOW)
    expect(text).toBe('the budget is used up, back at 2026-09-13 15:00 UTC (in about 3 hours)')
  })

  it('hedges a derived hour here too', () => {
    expect(noCapacity({ blocked: 'spent', resetAt, resetApproximate: true }, NOW)).toContain('back around')
  })

  it('sends an unusable pool somewhere other than to look at spend', () => {
    const text = noCapacity({ blocked: 'absent' }, NOW)
    expect(text).toContain('not declared')
    expect(text).not.toContain('is used up')
    expect(text).not.toMatch(/not known/)
  })

  it('says the hour is unknown rather than inventing one', () => {
    expect(noCapacity({ blocked: 'spent' }, NOW)).toMatch(/not known/)
  })
})
