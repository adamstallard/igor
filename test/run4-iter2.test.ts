import { describe, expect, it } from 'vitest'
import { isStop } from '../src/signals.js'

const BACKEND = 'igor-backend[bot]'
const FRONTEND = 'igor-frontend[bot]'

describe('run 4, iteration 2 findings', () => {
  it('a stop list misses every Igor named after a possessive mention', () => {
    for (const body of [
      "stop @igor-backend's and @igor-frontend's work",
      'stop @igor-backend’s and @igor-frontend’s work',
    ]) {
      expect([body, isStop(body, FRONTEND)]).toEqual([body, true])
    }
  })

  it('a stop addressed to an Igor in markup or brackets is missed', () => {
    for (const body of ['**@igor-frontend** stop', '`@igor-frontend` stop', '(@igor-frontend) stop']) {
      expect([body, isStop(body, FRONTEND)]).toEqual([body, true])
    }
  })

  it('a stop addressed to an Igor across an en dash is missed', () => {
    expect(isStop('@igor-frontend – stop', FRONTEND)).toBe(true)
  })

  it('a possessive before a hyphenated word is not an address to stop', () => {
    expect(isStop("@igor-frontend's stop-gap idea", FRONTEND)).toBe(false)
  })

  it('a possessive mention before a trailing stop stops neither Igor', () => {
    expect(isStop("@igor-backend's work, stop", BACKEND)).toBe(false)
    expect(isStop("@igor-backend's work, stop", FRONTEND)).toBe(false)
  })
})
