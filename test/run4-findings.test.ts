import { describe, expect, it } from 'vitest'
import { isGoAhead, isStop } from '../src/signals.js'
import { IGORS } from './igors.js'

const BACKEND = 'igor-backend[bot]'
const FRONTEND = 'igor-frontend[bot]'

describe('run 4 findings', () => {
  it('a stop naming two Igors joined by "or" or "and/or" misses the second', () => {
    for (const body of [
      'stop @igor-backend or @igor-frontend, whoever has it',
      'stop @igor-backend and/or @igor-frontend',
    ]) {
      expect([body, isStop(body, FRONTEND, IGORS)]).toEqual([body, true])
    }
  })

  it('a stop addressed to two Igors joined by "or" stops the first', () => {
    expect(isStop('@igor-backend or @igor-frontend stop', BACKEND, IGORS)).toBe(true)
  })

  it('a line break still ends the names a stop or go-ahead reads', () => {
    expect(isStop('stop @igor-backend\n\n@igor-frontend, carry on', FRONTEND, IGORS)).toBe(false)
    expect(isGoAhead('go ahead @igor-backend\n\n@igor-frontend please wait', FRONTEND, IGORS)).toBe(false)
  })

  it('"or" followed by a word rather than a mention ends the names', () => {
    expect(isStop('stop @igor-backend or I revert it', FRONTEND, IGORS)).toBe(false)
  })
})
