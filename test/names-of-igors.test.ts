import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from '../src/adapter.js'
import { isGoAhead, isStop } from '../src/signals.js'
import { IGORS } from './igors.js'

const gh = vi.hoisted(() => ({ calls: [] as string[], answers: new Map<string, () => unknown>() }))
vi.mock('../src/gh.js', async (actual) => {
  const real = await actual<typeof import('../src/gh.js')>()
  const call = async (args: readonly string[]) => {
    const key = args[1]!
    gh.calls.push(key)
    const answer = gh.answers.get(key)
    if (answer === undefined) return []
    return answer()
  }
  return { ...real, gh: call, ghPaginated: call }
})

const { GitHubTracker, labelVerdictFrom } = await import('../src/github-adapter.js')
const { GhError } = await import('../src/gh.js')

const BACKEND = 'igor-backend[bot]'
const FRONTEND = 'igor-frontend[bot]'

describe('a go-ahead errs toward lifting too little', () => {
  it('counts the mentions later on its opening line where none follows the phrase', () => {
    const body = 'go ahead and pick it back up, @igor-backend'
    expect(isGoAhead(body, BACKEND, IGORS)).toBe(true)
    expect(isGoAhead(body, FRONTEND, IGORS)).toBe(false)
  })

  it('drops the last name of a list that runs straight on into a word', () => {
    const body = 'go ahead @igor-backend, @igor-frontend keep waiting'
    expect(isGoAhead(body, BACKEND, IGORS)).toBe(true)
    expect(isGoAhead(body, FRONTEND, IGORS)).toBe(false)
    expect(isGoAhead('go ahead @igor-frontend keep going', FRONTEND, IGORS)).toBe(true)
  })

  it('leaves the stop reading those shapes as it did', () => {
    expect(isStop('stop now @igor-backend', FRONTEND, IGORS)).toBe(true)
    expect(isStop('stop @igor-backend, @igor-frontend keep going', FRONTEND, IGORS)).toBe(true)
  })

  it('reads mentions on a later line as no names', () => {
    expect(isGoAhead('go ahead\n\n@alice can you review what it makes?', FRONTEND, IGORS)).toBe(true)
  })
})

describe('a name that is no Igor counts as no name', () => {
  const people = { alice: 'other', 'igor-backend': 'igor' } as const

  it('makes a stop that names only a person stop every Igor', () => {
    expect(isStop('Stop — @alice is taking over', FRONTEND, people)).toBe(true)
    expect(isStop('Stop — @alice is taking over', BACKEND, people)).toBe(true)
    expect(isStop('stop @igor-backend and @alice', FRONTEND, people)).toBe(false)
  })

  it('makes a go-ahead that names only a person lift every stop', () => {
    expect(isGoAhead('carry on, @alice approved it', FRONTEND, people)).toBe(true)
    expect(isGoAhead('go ahead @igor-backend, @alice approved it', FRONTEND, people)).toBe(false)
  })

  it('stops every Igor, and lifts no stop, over a name nobody could resolve', () => {
    expect(isStop('stop @igor-docs', FRONTEND, {})).toBe(true)
    expect(isGoAhead('go ahead @igor-docs', FRONTEND, {})).toBe(false)
  })

  it('always counts this Igor as one', () => {
    expect(isStop('stop @igor-frontend', FRONTEND, {})).toBe(true)
    expect(isStop('stop @igor-frontend', BACKEND, { 'igor-frontend': 'igor' })).toBe(false)
    expect(isGoAhead('go ahead @igor-frontend', FRONTEND, {})).toBe(true)
  })
})

describe('the GitHub tracker tells an Igor from a person', () => {
  const item = { id: 'github:o/r#7', repo: 'o/r', native: '7', holders: ['igor:frontend'] } as unknown as Candidate
  const tracker = () => new GitHubTracker({ role: 'frontend', account: { login: FRONTEND, id: 99 } })
  const COMMENTS = 'repos/o/r/issues/7/comments?since=2026-10-11T10%3A00%3A00Z&per_page=100'

  beforeEach(() => {
    gh.calls.length = 0
    gh.answers.clear()
    gh.answers.set('users/igor-backend%5Bbot%5D', () => ({ type: 'Bot' }))
    gh.answers.set('users/alice%5Bbot%5D', () => {
      throw new GhError('Not Found', 404)
    })
  })

  it('reads a name as an Igor where GitHub has its bot account, and as no Igor on a 404', async () => {
    const t = tracker()
    expect(await t.accountsIn(['stop @igor-backend and @alice', 'thanks @carol', 'stop @igor-frontend'])).toEqual({
      'igor-backend': 'igor',
      alice: 'other',
      'igor-frontend': 'igor',
    })
    expect(gh.calls).toEqual(['users/igor-backend%5Bbot%5D', 'users/alice%5Bbot%5D'])
    await t.accountsIn(['stop @alice'])
    expect(gh.calls).toHaveLength(2)
  })

  it('leaves a name unresolved where GitHub fails otherwise, and asks again later', async () => {
    gh.answers.set('users/igor-docs%5Bbot%5D', () => {
      throw new GhError('Server Error', 502)
    })
    const t = tracker()
    expect(await t.accountsIn(['stop @igor-docs'])).toEqual({})
    await t.accountsIn(['stop @igor-docs'])
    expect(gh.calls).toEqual(['users/igor-docs%5Bbot%5D', 'users/igor-docs%5Bbot%5D'])
  })

  it('carries the answer on the comments it reads, so a stop naming a person stops this Igor', async () => {
    gh.answers.set(COMMENTS, () => [
      { body: 'Stop — @alice is taking over', user: { login: 'bob' }, created_at: '2026-10-11T10:05:00Z' },
      { body: 'thanks @alice', user: { login: 'bob' }, created_at: '2026-10-11T10:06:00Z' },
    ])
    const comments = await tracker().commentsSince(item, '2026-10-11T10:00:00Z')
    expect(comments[0]!.accounts).toEqual({ alice: 'other' })
    expect(comments[1]!.accounts).toEqual({})
    expect(isStop(comments[0]!.body, FRONTEND, comments[0]!.accounts)).toBe(true)
  })

  it('stands a claim down over a stop that names only a person', async () => {
    gh.answers.set('repos/o/r/issues/7/labels?per_page=100', () => [{ name: 'igor:frontend' }])
    gh.answers.set(COMMENTS, () => [
      { body: 'Stop — @alice is taking over', user: { login: 'bob' }, created_at: '2026-10-11T10:05:00Z' },
    ])
    expect((await tracker().verifyClaim(item, FRONTEND, '2026-10-11T10:00:00Z')).status).toBe('stopped')
  })

  it('lifts a stop for a claim over a go-ahead that names only a person', () => {
    const self = { login: FRONTEND, accountId: 99, holder: 'igor:frontend' }
    const at = (body: string, time: string) => ({ body, user: { login: 'bob' }, created_at: `2026-10-11T${time}:00Z` })
    const comments = [at('stop', '10:05'), at('carry on, @alice approved it', '10:10')]
    expect(labelVerdictFrom(self, ['igor:frontend'], [], comments, '2026-10-11T10:00:00Z', { alice: 'other' }, true).status).toBe('held')
    expect(labelVerdictFrom(self, ['igor:frontend'], [], comments, '2026-10-11T10:00:00Z', IGORS, true).status).toBe('stopped')
  })
})
