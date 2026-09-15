import { describe, expect, it } from 'vitest'
import type { Candidate, Comment } from '../src/adapter.js'
import {
  defer,
  fingerprint,
  NO_DEFERRALS,
  prune,
  shouldDefer,
  stillDeferred,
  type Deferral,
} from '../src/deferred.js'

const NOW = Date.parse('2026-09-14T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000

function candidate(over: Partial<Candidate> = {}): Candidate {
  return {
    id: 'github:o/r#7',
    tracker: 'github',
    repo: 'o/r',
    native: '7',
    url: 'https://github.com/o/r/issues/7',
    title: 'A bug',
    body: 'It breaks.',
    author: 'reporter',
    state: 'open',
    labels: ['bug'],
    assignees: [],
    paths: [],
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-14T11:00:00Z',
    ageDays: 13,
    idleDays: 0,
    ...over,
  }
}

const said = (author: string): Comment => ({ author, at: '2026-09-14T11:30:00Z', body: 'here is why' })

describe('the fingerprint', () => {
  it('ignores the timestamp, which the Igor’s own handoff moves', () => {
    // The whole point: an item comes back because its updatedAt changed, so a fingerprint
    // including it would match nothing and defer nothing.
    expect(fingerprint(candidate({ updatedAt: '2026-09-20T00:00:00Z', idleDays: 6 }))).toBe(
      fingerprint(candidate()),
    )
  })

  it('changes when any field a person can edit changes', () => {
    const base = fingerprint(candidate())
    const edits: Partial<Candidate>[] = [
      { title: 'A different bug' },
      { body: 'It breaks differently.' },
      { labels: ['bug', 'urgent'] },
      { assignees: ['alice'] },
      { state: 'closed' },
    ]
    for (const edit of edits) expect(fingerprint(candidate(edit))).not.toBe(base)
  })

  it('does not change when labels are merely reordered', () => {
    expect(fingerprint(candidate({ labels: ['b', 'a'] }))).toBe(fingerprint(candidate({ labels: ['a', 'b'] })))
  })

  it('separates fields with something they cannot contain', () => {
    // Otherwise shifting the boundary between title and body is indistinguishable from an edit
    // to neither.
    expect(fingerprint(candidate({ title: 'A', body: 'B C' }))).not.toBe(
      fingerprint(candidate({ title: 'A B', body: 'C' })),
    )
  })
})

describe('whether an item is still deferred', () => {
  const entry: Deferral = { fingerprint: fingerprint(candidate()), at: '2026-09-14T11:00:00Z', reason: 'x' }

  it('holds when nothing has changed and nobody has spoken', () => {
    expect(stillDeferred(entry, candidate(), [], 'igor-bot')).toBe(true)
  })

  it('lifts when anyone else replies, since a handoff asks for one', () => {
    expect(stillDeferred(entry, candidate(), [said('alice')], 'igor-bot')).toBe(false)
  })

  it('holds when the only voice on the item is the Igor’s own', () => {
    expect(stillDeferred(entry, candidate(), [said('igor-bot'), said('igor-bot')], 'igor-bot')).toBe(true)
  })

  it('lifts on an edit even where nobody commented', () => {
    expect(stillDeferred(entry, candidate({ title: 'Rewritten' }), [], 'igor-bot')).toBe(false)
  })

  it('lifts when the holder changed, which is a person taking or releasing it', () => {
    expect(stillDeferred(entry, candidate({ assignees: ['alice'] }), [], 'igor-bot')).toBe(false)
  })

  it('defers nothing without a record, so a lost cache costs a repeat and not silence', () => {
    expect(stillDeferred(undefined, candidate(), [], 'igor-bot')).toBe(false)
  })
})

describe('recording a handoff', () => {
  it('keys on the item and stamps when it was handed back', () => {
    const state = defer(NO_DEFERRALS, candidate(), 'could not reproduce', NOW)
    expect(state.items['github:o/r#7']).toEqual({
      fingerprint: fingerprint(candidate()),
      at: '2026-09-14T12:00:00.000Z',
      reason: 'could not reproduce',
    })
  })

  it('replaces an earlier record for the same item rather than accumulating', () => {
    const once = defer(NO_DEFERRALS, candidate(), 'first', NOW)
    const twice = defer(once, candidate({ title: 'Edited' }), 'second', NOW + 1000)
    expect(Object.keys(twice.items)).toEqual(['github:o/r#7'])
    expect(twice.items['github:o/r#7']?.reason).toBe('second')
  })

  it('leaves the original untouched, since the caller may still be reading it', () => {
    const before = defer(NO_DEFERRALS, candidate(), 'first', NOW)
    defer(before, candidate({ id: 'github:o/r#8' }), 'second', NOW)
    expect(Object.keys(before.items)).toEqual(['github:o/r#7'])
  })
})

describe('pruning', () => {
  const aged = (id: string, daysAgo: number): [string, Deferral] => [
    id,
    { fingerprint: 'f', at: new Date(NOW - daysAgo * DAY).toISOString(), reason: 'x' },
  ]

  it('drops entries past thirty days, so a quiet Igor’s record shrinks', () => {
    const state = { ...NO_DEFERRALS, items: Object.fromEntries([aged('a', 5), aged('b', 31)]) }
    expect(Object.keys(prune(state, NOW).items)).toEqual(['a'])
  })

  it('caps the record and keeps the newest', () => {
    const items = Object.fromEntries(Array.from({ length: 520 }, (_, i) => aged(`i${i}`, i / 100)))
    const kept = Object.keys(prune({ ...NO_DEFERRALS, items }, NOW).items)
    expect(kept).toHaveLength(500)
    expect(kept).toContain('i0')
    expect(kept).not.toContain('i519')
  })
})

describe('which outcomes are about the item', () => {
  it('records an ordinary handoff', () => {
    expect(shouldDefer('handed-off', 'nothing-to-do')).toBe(true)
    expect(shouldDefer('handed-off', 'failure')).toBe(true)
  })

  it('does not record running out of money, which says nothing about the item', () => {
    expect(shouldDefer('handed-off', 'budget')).toBe(false)
  })

  it('records nothing for an outcome that was not a handoff', () => {
    for (const outcome of ['produced', 'stopped', 'lost', 'refused']) {
      expect(shouldDefer(outcome, undefined)).toBe(false)
    }
  })
})
