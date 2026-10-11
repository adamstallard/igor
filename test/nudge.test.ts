import { describe, expect, it } from 'vitest'
import { newestNudge, nudgeBody } from '../src/nudge.js'

const NOW = new Date('2026-04-20T12:00:00Z')

function body(assignees = ['sarah', 'adam'], reviewers = ['abram']): string {
  return nudgeBody('2026-03-20', NOW, assignees, reviewers)
}

describe('the nudge distinguishes approving, rejecting and deferring', () => {
  it('states all three endings', () => {
    const text = body()
    expect(text).toMatch(/\*\*Merge\*\* to approve every candidate still in it/)
    expect(text).toMatch(/\*\*Delete a candidate's file, then merge\*\*, to reject that candidate/)
    expect(text).toMatch(/\*\*Close without merging\*\* to defer/)
  })

  it('marks rejection as permanent and the only ending that cannot be undone', () => {
    const text = body()
    expect(text).toContain('Rejection is permanent: the candidate is never proposed again.')
    expect(text).toContain('Of the three, only rejecting cannot be undone.')
  })

  it('states deferring as reversible', () => {
    expect(body()).toContain('Nothing is rejected, and every candidate may be proposed again.')
  })
})

describe('the nudge stands on its own', () => {
  it('says when the proposal went quiet and how long ago that was', () => {
    expect(body()).toContain('no activity since 2026-03-20, 31 days before this comment')
  })

  it('names the assignees and the store reviewers', () => {
    const text = body()
    expect(text).toContain('Assigned to review it: sarah, adam.')
    expect(text).toContain('the store reviewers can: abram.')
  })

  it('says where nobody is assigned and no store reviewers are configured', () => {
    const text = body([], [])
    expect(text).toContain('Nobody is assigned to review it.')
    expect(text).toContain('No store reviewers are configured.')
  })
})

describe('the nudge mentions nobody', () => {
  it('carries no @ anywhere, even for a reviewer configured with one', () => {
    expect(body(['sarah'], ['@abram'])).not.toContain('@')
  })
})

describe('a nudge is recognized by its marker', () => {
  const comment = (body: string, createdAt: string, author = 'sarah') => ({
    number: 7,
    author,
    body,
    createdAt,
  })

  it('finds none where nobody has commented', () => {
    expect(newestNudge([])).toBeUndefined()
  })

  it('finds the newest nudge among replies, whoever posted it', () => {
    const found = newestNudge([
      comment(nudgeBody('2026-01-01', NOW, ['sarah'], []), '2026-01-09T10:00:00Z', 'github-actions[bot]'),
      comment('I will look at this next week.', '2026-01-10T10:00:00Z'),
      comment(nudgeBody('2026-01-10', NOW, ['sarah'], []), '2026-01-18T10:00:00Z', 'sarah'),
      comment('Still meaning to.', '2026-01-19T10:00:00Z'),
    ])
    expect(found).toEqual({ at: '2026-01-18T10:00:00Z', quietSince: '2026-01-10' })
  })

  it('does not take a reply quoting a nudge for a nudge', () => {
    const raw = nudgeBody('2026-01-01', NOW, [], [])
    const quoted = raw.split('\n').map((l) => `> ${l}`).join('\n')
    const rendered = raw.split('\n').slice(1).join('\n')
    for (const reply of [quoted, `Done, see below.\n\n${raw}`, rendered]) {
      expect(newestNudge([comment(reply, '2026-01-09T10:00:00Z')])).toBeUndefined()
    }
  })
})
