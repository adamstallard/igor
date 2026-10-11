import { describe, expect, it } from 'vitest'
import { isGoAhead, isStop } from '../src/signals.js'

const BACKEND = 'igor-backend[bot]'
const FRONTEND = 'igor-frontend[bot]'

describe('run 4, iteration 3 findings', () => {
  it('a mention list addressed to stop runs across a paragraph break and stops an Igor thanked above it', () => {
    expect(isStop("Nice work @igor-backend\n\n@igor-frontend stop, that file is backend's", BACKEND)).toBe(false)
    expect(isStop("Nice work @igor-backend\n\n@igor-frontend stop, that file is backend's", FRONTEND)).toBe(true)
  })

  it('an opening stop in bold or code markup is missed', () => {
    for (const body of ['**Stop**', '**Stop.** This is the wrong approach.', '`stop`']) {
      expect([body, isStop(body, FRONTEND)]).toEqual([body, true])
    }
  })

  it('a stop addressed to an Igor is missed when the verb is in markup', () => {
    for (const body of ['@igor-frontend **stop**', '@igor-frontend: **STOP**']) {
      expect([body, isStop(body, FRONTEND)]).toEqual([body, true])
    }
  })
  it('a code span, strikethrough or hyphenated word in markup is not a stop', () => {
    for (const body of ['`stop()` is called twice', '~~stop~~ never mind', '**Stop-gap** fix', '`stop` is called on teardown']) {
      expect([body, isStop(body, FRONTEND)]).toEqual([body, false])
    }
  })

  it('a name on one line and the verb alone on the next is still a stop', () => {
    expect(isStop('@igor-frontend\nstop', FRONTEND)).toBe(true)
  })

  it('a line break after a separator still joins two mentions addressed to stop', () => {
    expect(isStop('@igor-backend,\n@igor-frontend stop', BACKEND)).toBe(true)
    expect(isStop('@igor-backend,\n@igor-frontend stop', FRONTEND)).toBe(true)
  })

  it('a go-ahead in bold reads its names as a plain one does', () => {
    expect(isGoAhead('**Go ahead** @igor-backend', BACKEND)).toBe(true)
    expect(isGoAhead('**Go ahead** @igor-backend', FRONTEND)).toBe(false)
  })
})
