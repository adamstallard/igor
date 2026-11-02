import { describe, expect, it } from 'vitest'
import { isGoAhead, isStop } from '../src/signals.js'
import { labelVerdictFrom } from '../src/github-adapter.js'
import { IGORS } from './igors.js'

const BACKEND = 'igor-backend[bot]'
const FRONTEND = 'igor-frontend[bot]'

describe('the Igors a stop names', () => {
  it('reads a name that ends the sentence', () => {
    expect(isStop('stop @igor-backend.', BACKEND, IGORS)).toBe(true)
    expect(isStop('stop @igor-backend. The frontend can carry on.', BACKEND, IGORS)).toBe(true)
    expect(isStop('stop @igor-backend.', FRONTEND, IGORS)).toBe(false)
  })

  it('reads a name followed by punctuation or wrapped in markup as naming it', () => {
    for (const body of [
      'stop @igor-backend: you broke the build',
      'stop @igor-backend!',
      'stop @igor-backend?',
      "stop @igor-backend's run",
      'stop (@igor-backend)',
      'stop `@igor-backend`',
      'stop **@igor-backend**',
    ]) {
      expect([body, isStop(body, FRONTEND, IGORS)]).toEqual([body, false])
      expect([body, isStop(body, BACKEND, IGORS)]).toEqual([body, true])
    }
  })

  it('keeps an underscore inside a login', () => {
    expect(isStop('stop @igor_backend', 'igor_backend[bot]', IGORS)).toBe(true)
    expect(isStop('stop @igor_backend', 'igor[bot]', IGORS)).toBe(false)
  })

  it('reads names joined by an ampersand', () => {
    expect(isStop('stop @igor-backend & @igor-frontend', FRONTEND, IGORS)).toBe(true)
  })
})

describe('a stop a go-ahead lifted before the claim', () => {
  const self = { login: FRONTEND, accountId: 1, holder: 'igor:frontend' }
  const at = (body: string, time: string) => ({ body, user: { login: 'alice' }, created_at: `2026-10-11T${time}:00Z` })
  const verdict = (comments: ReturnType<typeof at>[], liftable?: boolean) =>
    labelVerdictFrom(self, ['igor:frontend'], [], comments, '2026-10-11T10:00:00Z', IGORS, liftable)

  it('does not stand a claim down', () => {
    expect(verdict([at('stop', '10:05'), at('go ahead', '10:10')], true).status).toBe('held')
  })

  it('still stops a directed claim or a checkpoint, which cannot be lifted', () => {
    expect(verdict([at('stop', '10:05'), at('go ahead', '10:10')]).status).toBe('stopped')
    expect(verdict([at('stop', '10:05'), at('go ahead', '10:10')], false).status).toBe('stopped')
  })

  it('still stops where a second stop follows the go-ahead', () => {
    const v = verdict([at('stop', '10:05'), at('go ahead', '10:10'), at('stop again', '10:15')], true)
    expect(v).toMatchObject({ status: 'stopped', at: '2026-10-11T10:15:00Z' })
  })

  it('is not lifted by the Igor itself, nor by a stop that also reads as a go-ahead', () => {
    expect(
      verdict([at('stop', '10:05'), { body: 'go ahead', user: { login: FRONTEND }, created_at: '2026-10-11T10:10:00Z' }], true)
        .status,
    ).toBe('stopped')
  })
})

describe('the Igors a go-ahead names', () => {
  it('lifts a stop for every Igor where it names none', () => {
    expect(isGoAhead('go ahead', FRONTEND, IGORS)).toBe(true)
    expect(isGoAhead('carry on, both of you', BACKEND, IGORS)).toBe(true)
  })

  it('lifts a stop only for the Igors it names', () => {
    expect(isGoAhead('go ahead @igor-backend', BACKEND, IGORS)).toBe(true)
    expect(isGoAhead('go ahead @igor-backend', FRONTEND, IGORS)).toBe(false)
    expect(isGoAhead('carry on @igor-backend, the build is fixed.', FRONTEND, IGORS)).toBe(false)
    expect(isGoAhead('resume @igor-backend and @igor-frontend', FRONTEND, IGORS)).toBe(true)
    expect(isGoAhead('continue @igor-backend, @igor-docs, and @igor-frontend', FRONTEND, IGORS)).toBe(true)
  })

  it('reads its names as a stop does', () => {
    for (const names of ['@igor-backend.', '**@igor-backend**', '(@igor-backend)', '@igor-backend & @igor-docs']) {
      expect(isStop(`stop ${names}`, FRONTEND, IGORS)).toBe(false)
      expect(isGoAhead(`go ahead ${names}`, FRONTEND, IGORS)).toBe(false)
      expect(isStop(`stop ${names}`, BACKEND, IGORS)).toBe(true)
      expect(isGoAhead(`go ahead ${names}`, BACKEND, IGORS)).toBe(true)
    }
  })

  it('still lifts it for an Igor the same comment goes on to address', () => {
    expect(isGoAhead('go ahead @igor-backend.\n\n@igor-frontend carry on too', FRONTEND, IGORS)).toBe(true)
  })

  it('treats a go-ahead on a line of its own, then a paragraph to a person, as bare', () => {
    expect(isGoAhead('go ahead\n\n@alice can you review what it makes?', FRONTEND, IGORS)).toBe(true)
  })
})

describe('a stop a go-ahead to another Igor answered', () => {
  const self = { login: FRONTEND, accountId: 1, holder: 'igor:frontend' }
  const at = (body: string, time: string) => ({ body, user: { login: 'alice' }, created_at: `2026-10-11T${time}:00Z` })

  it('still stands this Igor\'s claim down', () => {
    const comments = [at('stop', '10:05'), at('go ahead @igor-backend', '10:10')]
    expect(labelVerdictFrom(self, ['igor:frontend'], [], comments, '2026-10-11T10:00:00Z', IGORS, true).status).toBe('stopped')
  })

  it('is lifted by a go-ahead that names this Igor', () => {
    const comments = [at('stop', '10:05'), at('go ahead @igor-frontend', '10:10')]
    expect(labelVerdictFrom(self, ['igor:frontend'], [], comments, '2026-10-11T10:00:00Z', IGORS, true).status).toBe('held')
  })
})

describe('a stop addressed further on, whatever the spelling of the identity', () => {
  // The name is matched as `bareName` spells the identity: without `@` or `[bot]`, in any case.
  it('reads the mention whether or not the identity carries `@`, `[bot]` or capitals', () => {
    for (const identity of ['igor-backend', '@igor-backend', 'igor-backend[bot]', 'IGOR-Backend[BOT]']) {
      expect(isStop('Thanks. @igor-backend stop', identity, IGORS)).toBe(true)
      expect(isStop('Thanks. @IGOR-BACKEND[bot] stop', identity, IGORS)).toBe(true)
    }
  })

  it('reads nothing for an identity that is only `@` or `[bot]`', () => {
    expect(isStop('Thanks. @ stop', '@', IGORS)).toBe(false)
    expect(isStop('Thanks. [bot] stop', '[bot]', IGORS)).toBe(false)
  })
})
