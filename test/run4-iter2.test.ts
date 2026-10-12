import { describe, expect, it } from 'vitest'
import { isStop } from '../src/signals.js'
import { IGORS } from './igors.js'

const BACKEND = 'igor-backend[bot]'
const FRONTEND = 'igor-frontend[bot]'

describe('run 4, iteration 2 findings', () => {
  it('a stop list misses every Igor named after a possessive mention', () => {
    for (const body of [
      "stop @igor-backend's and @igor-frontend's work",
      'stop @igor-backend’s and @igor-frontend’s work',
    ]) {
      expect([body, isStop(body, FRONTEND, IGORS)]).toEqual([body, true])
    }
  })

  it('a stop addressed to an Igor in markup or brackets is missed', () => {
    for (const body of ['**@igor-frontend** stop', '`@igor-frontend` stop', '(@igor-frontend) stop']) {
      expect([body, isStop(body, FRONTEND, IGORS)]).toEqual([body, true])
    }
  })

  it('a stop addressed to an Igor across an en dash is missed', () => {
    expect(isStop('@igor-frontend – stop', FRONTEND, IGORS)).toBe(true)
  })

  it('a possessive before a hyphenated word is not an address to stop', () => {
    expect(isStop("@igor-frontend's stop-gap idea", FRONTEND, IGORS)).toBe(false)
  })

  it('a possessive mention before a trailing stop stops neither Igor', () => {
    expect(isStop("@igor-backend's work, stop", BACKEND, IGORS)).toBe(false)
    expect(isStop("@igor-backend's work, stop", FRONTEND, IGORS)).toBe(false)
  })
})
