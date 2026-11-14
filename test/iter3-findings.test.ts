import { describe, expect, it } from 'vitest'
import { isStop } from '../src/signals.js'
import { IGORS } from './igors.js'

const BACKEND = 'igor-backend[bot]'
const FRONTEND = 'igor-frontend[bot]'

describe('iteration 3 findings', () => {
  it('misses the last Igor of a stop list written with an Oxford comma', () => {
    // `stop @a, @b and @c` stops all three; the serial comma before "and" must not drop @c.
    expect(isStop('stop @igor-backend, @igor-docs and @igor-frontend', FRONTEND, IGORS)).toBe(true)
    expect(isStop('stop @igor-backend, @igor-docs, and @igor-frontend', FRONTEND, IGORS)).toBe(true)
    expect(isStop('stop @igor-backend, and @igor-frontend', FRONTEND, IGORS)).toBe(true)
  })

  it('misses a later "@this stop" where the comment mentions this Igor earlier in prose', () => {
    expect(isStop('stop @igor-backend, it broke the build.\n\n@igor-frontend stop too', FRONTEND, IGORS)).toBe(true)
    expect(
      isStop('stop @igor-backend, it broke what @igor-frontend built.\n\n@igor-frontend stop too', FRONTEND, IGORS),
    ).toBe(true)
  })

  it('stops neither Igor where the mentions before the verb are joined by a slash or a plus', () => {
    // The same separators after the verb name both: `stop @igor-backend/@igor-frontend`.
    expect(isStop('stop @igor-backend/@igor-frontend', FRONTEND, IGORS)).toBe(true)
    expect(isStop('stop @igor-backend + @igor-frontend', FRONTEND, IGORS)).toBe(true)
    expect(isStop('@igor-backend/@igor-frontend stop', BACKEND, IGORS)).toBe(true)
    expect(isStop('@igor-backend/@igor-frontend stop', FRONTEND, IGORS)).toBe(true)
    expect(isStop('@igor-backend + @igor-frontend stop', BACKEND, IGORS)).toBe(true)
  })

  it('does not read a quoted "@this stop" as a stop', () => {
    expect(isStop('> @igor-frontend stop\n\nignore that', FRONTEND, IGORS)).toBe(false)
  })

  it('does not read a team or a path ending in this Igor\'s name as addressing it', () => {
    expect(isStop('@org/igor-frontend stop', FRONTEND, IGORS)).toBe(false)
    expect(isStop('github.com/igor-frontend stop', FRONTEND, IGORS)).toBe(false)
  })

  it('does not read a file path after this Igor\'s name as a stop', () => {
    expect(isStop('@igor-frontend/stop.ts is broken', FRONTEND, IGORS)).toBe(false)
  })
})
