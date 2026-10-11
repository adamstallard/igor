import { describe, expect, it } from 'vitest'
import { isStop } from '../src/signals.js'
import { labelVerdictFrom } from '../src/github-adapter.js'

const BACKEND = 'igor-backend[bot]'
const FRONTEND = 'igor-frontend[bot]'

describe('the Igors a stop names', () => {
  it('reads a name that ends the sentence', () => {
    expect(isStop('stop @igor-backend.', BACKEND)).toBe(true)
    expect(isStop('stop @igor-backend. The frontend can carry on.', BACKEND)).toBe(true)
    expect(isStop('stop @igor-backend.', FRONTEND)).toBe(false)
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
      expect([body, isStop(body, FRONTEND)]).toEqual([body, false])
      expect([body, isStop(body, BACKEND)]).toEqual([body, true])
    }
  })

  it('keeps an underscore inside a login', () => {
    expect(isStop('stop @igor_backend', 'igor_backend[bot]')).toBe(true)
    expect(isStop('stop @igor_backend', 'igor[bot]')).toBe(false)
  })

  it('reads names joined by an ampersand', () => {
    expect(isStop('stop @igor-backend & @igor-frontend', FRONTEND)).toBe(true)
  })
})

describe('a stop a go-ahead lifted before the claim', () => {
  const self = { login: FRONTEND, accountId: 1, holder: 'igor:frontend' }
  const at = (body: string, time: string) => ({ body, user: { login: 'alice' }, created_at: `2026-10-11T${time}:00Z` })
  const verdict = (comments: ReturnType<typeof at>[], liftable?: boolean) =>
    labelVerdictFrom(self, ['igor:frontend'], [], comments, '2026-10-11T10:00:00Z', liftable)

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
