import { describe, expect, it } from 'vitest'
import type { Candidate, InFlight } from '../src/adapter.js'
import type { Lane } from '../src/role.js'
import { countStages, laneVerdict, screen, staleOwnArtifact, universalSkip } from '../src/predicate.js'

function inFlight(over: Partial<InFlight> = {}): InFlight {
  return {
    kind: 'pull-request',
    ref: '#99',
    url: 'u',
    draft: false,
    author: 'someone-else',
    mergeable: 'clean',
    branch: 'igor/fixer/1-a-bug',
    base: 'main',
    ...over,
  }
}

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 'github:o/r#1',
    tracker: 'github',
    repo: 'o/r',
    native: '1',
    url: 'https://github.com/o/r/issues/1',
    title: 'A bug',
    body: '',
    author: 'reporter',
    state: 'open',
    labels: [],
    assignees: [],
    paths: [],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-12T00:00:00Z',
    ageDays: 12,
    idleDays: 1,
    ...over,
  }
}

describe('universal skips', () => {
  it('skips a closed item, whatever the query returned', () => {
    // Stage one is deliberately loose, so a source query may legitimately omit a state filter.
    const v = universalSkip(candidate({ state: 'closed' }))
    expect(v?.outcome).toBe('skip')
    expect(v?.stage).toBe('universal')
    expect(v?.reason).toContain('closed')
  })

  it('skips an item with work in flight and names the artifact', () => {
    const v = universalSkip(
      candidate({ inFlight: inFlight() }),
    )
    expect(v?.reason).toContain('#99')
  })

  it('admits an artifact of the Igor\'s own that no longer merges', () => {
    // The rule narrows rather than gains an exception. Work in flight is skipped because
    // duplicating work in review is never an organizational preference — and an artifact of
    // one's own that cannot merge is not duplication, it is the same work, unfinished.
    const own = candidate({ inFlight: inFlight({ author: 'igor-bot', mergeable: 'conflicting' }) })
    expect(universalSkip(own, 'igor-bot')).toBeUndefined()
    expect(staleOwnArtifact(own, 'igor-bot')?.ref).toBe('#99')
  })

  it('still skips an artifact of its own that merges cleanly', () => {
    const own = candidate({ inFlight: inFlight({ author: 'igor-bot', mergeable: 'clean' }) })
    expect(universalSkip(own, 'igor-bot')?.reason).toContain('#99')
    expect(staleOwnArtifact(own, 'igor-bot')).toBeUndefined()
  })

  it('does not adopt somebody else\'s conflicting artifact', () => {
    // Theirs. The holder rule already says so, and nothing here wants an exception to it.
    const theirs = candidate({ inFlight: inFlight({ author: 'alice', mergeable: 'conflicting' }) })
    expect(universalSkip(theirs, 'igor-bot')?.reason).toContain('in flight')
    expect(staleOwnArtifact(theirs, 'igor-bot')).toBeUndefined()
  })

  it('treats unknown mergeability as not yet, never as conflicted', () => {
    // GitHub computes it asynchronously, so a freshly opened artifact answers nothing. Read
    // as a conflict, that is a worker run per artifact on the cycle it was born.
    const fresh = candidate({ inFlight: inFlight({ author: 'igor-bot', mergeable: 'unknown' }) })
    expect(universalSkip(fresh, 'igor-bot')?.reason).toContain('in flight')
    expect(staleOwnArtifact(fresh, 'igor-bot')).toBeUndefined()
  })

  it('claims nothing as its own without an identity', () => {
    // A preview that does not know who would be running must not decide an artifact is ours.
    const own = candidate({ inFlight: inFlight({ author: 'igor-bot', mergeable: 'conflicting' }) })
    expect(universalSkip(own)?.reason).toContain('in flight')
    expect(staleOwnArtifact(own, '')).toBeUndefined()
  })

  it('leaves a stale artifact alone once somebody else has taken the item', () => {
    const taken = candidate({
      assignees: ['alice'],
      inFlight: inFlight({ author: 'igor-bot', mergeable: 'conflicting' }),
    })
    expect(universalSkip(taken, 'igor-bot')?.reason).toContain('alice')
  })

  it('passes an ordinary open item through', () => {
    expect(universalSkip(candidate())).toBeUndefined()
  })

  it('skips an item somebody else holds, and names them', () => {
    // Nothing else filters on this: not the loose query, not the lane, and triage never sees
    // the holder. Without it an Igor claims and retracts on a colleague's issue every cycle.
    const v = universalSkip(candidate({ assignees: ['alice'] }), 'igor-bot')
    expect(v?.outcome).toBe('skip')
    expect(v?.stage).toBe('universal')
    expect(v?.reason).toContain('alice')
  })

  it('skips an item held by the Igor and somebody else both', () => {
    // People add themselves to a holder list rather than replacing what is there, so a second
    // name reads as somebody taking the work — the same reading verifyClaim applies mid-run.
    expect(universalSkip(candidate({ assignees: ['igor-bot', 'alice'] }), 'igor-bot')?.reason).toContain('alice')
  })

  it('keeps an item only the Igor holds, which is a claim a dead process left', () => {
    expect(universalSkip(candidate({ assignees: ['igor-bot'] }), 'igor-bot')).toBeUndefined()
  })

  it('reads every holder as somebody else where no identity was supplied', () => {
    // A preview does not know who would be running, and over-reporting a skip is the safe
    // direction for one.
    expect(universalSkip(candidate({ assignees: ['igor-bot'] }))?.reason).toContain('igor-bot')
  })

  it('carries the identity through the whole screen, not only the direct call', () => {
    const held = screen({}, [candidate({ assignees: ['igor-bot'] })], 'igor-bot')
    expect(held[0]?.verdict.outcome).toBe('proceed')
    expect(screen({}, [candidate({ assignees: ['alice'] })], 'igor-bot')[0]?.verdict.outcome).toBe('skip')
  })
})

describe('label predicates', () => {
  it('excludes on any excluded label and says which', () => {
    const lane: Lane = { labels: { excludes: ['Human', 'wontfix'] } }
    const v = laneVerdict(lane, candidate({ labels: ['bug', 'Human'] }))
    expect(v.outcome).toBe('skip')
    expect(v.reason).toContain('Human')
  })

  it('satisfies a group by any one of its members', () => {
    const lane: Lane = { labels: { includes: [['ai', 'bot']] } }
    expect(laneVerdict(lane, candidate({ labels: ['bot'] })).outcome).toBe('proceed')
  })

  it('requires every group, so a role narrows rather than widens', () => {
    const lane: Lane = { labels: { includes: [['ai'], ['frontend']] } }
    expect(laneVerdict(lane, candidate({ labels: ['ai'] })).outcome).toBe('skip')
    expect(laneVerdict(lane, candidate({ labels: ['ai', 'frontend'] })).outcome).toBe('proceed')
  })

  it('checks exclusions before inclusions, since an exclusion is the stronger signal', () => {
    const lane: Lane = { labels: { includes: [['ai']], excludes: ['Human'] } }
    expect(laneVerdict(lane, candidate({ labels: ['ai', 'Human'] })).reason).toContain('Human')
  })

  it('proceeds when a lane constrains nothing', () => {
    expect(laneVerdict({}, candidate()).outcome).toBe('proceed')
  })
})

describe('path predicates', () => {
  const lane: Lane = { paths: { under: [['src/api/**']] } }

  it('matches a path by glob', () => {
    expect(laneVerdict(lane, candidate({ paths: ['src/api/client.ts'] })).outcome).toBe('proceed')
  })

  it('skips when no named path is under the pattern', () => {
    expect(laneVerdict(lane, candidate({ paths: ['src/ui/button.tsx'] })).outcome).toBe('skip')
  })

  it('says an item names no paths rather than blaming the pattern', () => {
    // The common case on a repository that discusses symptoms; the reason has to distinguish
    // "nothing to match" from "matched nothing".
    expect(laneVerdict(lane, candidate()).reason).toContain('names no paths')
  })

  it('requires every path group', () => {
    const two: Lane = { paths: { under: [['src/**'], ['**/*.tsx']] } }
    expect(laneVerdict(two, candidate({ paths: ['src/a.ts'] })).outcome).toBe('skip')
    expect(laneVerdict(two, candidate({ paths: ['src/a.tsx'] })).outcome).toBe('proceed')
  })
})

describe('age predicate', () => {
  it('skips an item older than the limit and gives the number', () => {
    const v = laneVerdict({ age: { maxDays: 30 } }, candidate({ ageDays: 867 }))
    expect(v.outcome).toBe('skip')
    expect(v.reason).toContain('867')
  })

  it('admits an item exactly at the limit', () => {
    expect(laneVerdict({ age: { maxDays: 30 } }, candidate({ ageDays: 30 })).outcome).toBe('proceed')
  })

  it('reads creation age, not idleness — the axis is named in the reason', () => {
    const v = laneVerdict({ age: { maxDays: 30 } }, candidate({ ageDays: 100, idleDays: 1 }))
    expect(v.reason).toContain('created')
  })
})

describe('screening a whole discovery result', () => {
  const lane: Lane = { labels: { includes: [['ai']], excludes: ['Human'] } }
  const triaged = screen(lane, [
    candidate({ id: 'a', labels: ['ai'] }),
    candidate({ id: 'b', labels: ['Human', 'ai'] }),
    candidate({ id: 'c', state: 'closed', labels: ['ai'] }),
    candidate({ id: 'd', labels: [] }),
  ])

  it('returns a verdict for every candidate, skips included', () => {
    // The skip ratio has to be determinable from the record rather than estimated.
    expect(triaged).toHaveLength(4)
    expect(triaged.every((t) => t.verdict.reason !== '')).toBe(true)
  })

  it('attributes each skip to the stage that decided it', () => {
    const by = Object.fromEntries(triaged.map((t) => [t.candidate.id, t.verdict]))
    expect(by['c']!.stage).toBe('universal')
    expect(by['b']!.stage).toBe('predicate')
    expect(by['a']!.outcome).toBe('proceed')
  })

  it('counts the funnel', () => {
    expect(countStages(triaged)).toEqual({ total: 4, universal: 1, predicate: 2, survivors: 1 })
  })

  it('does not let a universal skip be attributed to a lane', () => {
    // A closed item carrying every required label must still be skipped, and skipped as
    // universal, or an org could believe its lane is doing the work.
    const only = screen(lane, [candidate({ state: 'closed', labels: ['ai'] })])
    expect(only[0]!.verdict.stage).toBe('universal')
  })
})
