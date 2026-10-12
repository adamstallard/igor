import { describe, expect, it, vi } from 'vitest'
import type { Candidate } from '../src/adapter.js'

const gh = vi.hoisted(() => ({ answers: new Map<string, () => unknown>() }))
vi.mock('../src/gh.js', async (actual) => {
  const real = await actual<typeof import('../src/gh.js')>()
  const call = async (args: readonly string[]) => {
    const answer = gh.answers.get(args[1]!)
    return answer === undefined ? [] : answer()
  }
  return { ...real, gh: call, ghPaginated: call }
})

const { GitHubTracker } = await import('../src/github-adapter.js')

const item = { id: 'github:o/r#7', tracker: 'github', repo: 'o/r', native: '7' } as unknown as Candidate

describe('accounts run, iteration 2', () => {
  it('a comment that mentions nobody carries an empty record, as Comment.accounts and design.md say', async () => {
    gh.answers.set('repos/o/r/issues/7/comments?since=2026-10-11T10%3A00%3A00Z&per_page=100', () => [
      { body: 'Stop — @alice is taking over', user: { login: 'bob' }, created_at: '2026-10-11T10:05:00Z' },
      { body: 'looks good to me', user: { login: 'bob' }, created_at: '2026-10-11T10:06:00Z' },
    ])
    gh.answers.set('users/alice%5Bbot%5D', () => ({ type: 'User' }))
    const t = new GitHubTracker({ role: 'frontend', account: { login: 'igor-frontend[bot]', id: 99 } })
    const comments = await t.commentsSince(item, '2026-10-11T10:00:00Z')
    expect(comments[0]!.accounts).toEqual({ alice: 'other' })
    expect(comments[1]!.accounts).toEqual({})
  })
})
