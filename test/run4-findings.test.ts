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

  it('timing probe: long comments stay fast', () => {
    const bodies = [
      'stop ' + '@a, '.repeat(20000) + 'x',
      'stop ' + '@a or '.repeat(10000) + 'x',
      'stop ' + '@a and/or '.repeat(10000) + 'x',
      '@igor-frontend' + '/@a-a'.repeat(5000) + '+x',
      '@igor-frontend ' + '@a-'.repeat(5000) + '!',
      '@igor-frontend' + (' or @' + 'a-'.repeat(30)).repeat(200) + '+',
      '@igor-frontend' + ' and/or @a'.repeat(5000) + '+x',
      ('@igor-frontend' + ' '.repeat(50)).repeat(500) + 'x',
      'go ahead ' + '(((('.repeat(5000),
      '@igor-frontend' + '—-'.repeat(10000) + 'x',
      'igor-frontend '.repeat(5000),
    ]
    for (const body of bodies) {
      const t = performance.now()
      isStop(body, FRONTEND, { ...IGORS, a: 'igor' })
      isGoAhead(body, FRONTEND, { ...IGORS, a: 'igor' })
      expect(performance.now() - t).toBeLessThan(200)
    }
  })

  it('quoted lines are skipped wherever the mentions fall among them', () => {
    expect(isStop('@igor-frontend hi\na\nb\n> c @igor-frontend stop', FRONTEND, IGORS)).toBe(false)
    expect(isStop('> @igor-frontend hi\na\n@igor-frontend stop', FRONTEND, IGORS)).toBe(true)
    expect(isStop('> quoted @igor-frontend stop\n@igor-frontend stop', FRONTEND, IGORS)).toBe(true)
    expect(isStop('x\n  > @igor-frontend stop', FRONTEND, IGORS)).toBe(false)
    expect(isStop('x\n  @igor-frontend stop > y', FRONTEND, IGORS)).toBe(true)
  })

  // Reads the same number of mentions in two shapes and compares their CPU time, so a slow
  // runner does not fail it as a bound in milliseconds would. The short shape is sixteen rounds of
  // 1,500 mentions; the long shape is one round of 24,000. Each round reads two comments, one with
  // `@` before each name and one without, and both count as mentions. When the scan is linear the
  // two shapes cost about the same; when it is quadratic the long one costs about sixteen times as
  // much. The bound of 5 sits between: linear code measured up to 4.6 with the CPU heavily
  // oversubscribed. Elapsed time would count time spent waiting for the CPU. CPU time counts only
  // this process, and vitest runs each test file in a process of its own.
  it('the cost of reading mentions grows in step with their number', { timeout: 60_000 }, () => {
    const read = (copies: number, rounds: number): number => {
      const bodies = ['igor-frontend '.repeat(copies), '@igor-frontend x '.repeat(copies)]
      const before = process.cpuUsage()
      for (let i = 0; i < rounds; i++) {
        for (const body of bodies) {
          isStop(body, FRONTEND, IGORS)
          isGoAhead(body, FRONTEND, IGORS)
        }
      }
      const { user, system } = process.cpuUsage(before)
      return user + system
    }
    // Warms up the compiler before anything is measured.
    read(1500, 16)
    read(24000, 1)
    const short = Math.min(...Array.from({ length: 5 }, () => read(1500, 16)))
    // Garbage collection or a stall can slow any one run. The short shape takes the best of five;
    // the long one gets up to three tries and stops at the first under the bound.
    let long = Infinity
    for (let i = 0; i < 3 && long >= 5 * short; i++) long = Math.min(long, read(24000, 1))
    expect(long).toBeLessThan(5 * short)
  })
})
