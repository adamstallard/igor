import { describe, expect, it } from 'vitest'
import { isGoAhead, isStop, namesToResolve, type Accounts } from '../src/signals.js'
import { IGORS } from './igors.js'

const FRONTEND = 'igor-frontend[bot]'

/** What a tracker would hand back: only the names `namesToResolve` asked about, resolved. */
function resolved(body: string, kinds: Record<string, 'igor' | 'other'>): Accounts {
  return Object.fromEntries(namesToResolve(body).flatMap((n) => (kinds[n] === undefined ? [] : [[n, kinds[n]!]])))
}

describe('iteration 1 finder', () => {
  it('namesToResolve misses a name after "/" that namesAfter reads, so "stop @alice/@igor-backend" stops the frontend Igor', () => {
    const body = 'stop @alice/@igor-backend'
    const accounts = resolved(body, { alice: 'other', 'igor-backend': 'igor' })
    expect(isStop(body, FRONTEND, accounts)).toBe(false)
  })

  it('a go-ahead naming an Igor in underscore emphasis reads as bare and lifts every Igor', () => {
    expect(isGoAhead('go ahead _@igor-backend_', FRONTEND, IGORS)).toBe(false)
  })

  it('a go-ahead whose run-on list drops its only Igor and keeps a person lifts the stop for the Igor told to keep waiting', () => {
    const body = 'go ahead @alice, @igor-frontend keep waiting'
    const accounts = resolved(body, { alice: 'other', 'igor-frontend': 'igor' })
    expect(isGoAhead(body, FRONTEND, accounts)).toBe(false)
  })

  it('namesToResolve asks about mentions past the opening line that neither isStop nor isGoAhead reads', () => {
    expect(namesToResolve('Continue reading the logs below.\n\ncc @a @b @c')).toEqual([])
  })

  it('a go-ahead naming a person and an Igor after "/" later on its line lifts the stop for that Igor alone', () => {
    const body = 'go ahead and pick it up, @alice/@igor-frontend'
    const accounts = resolved(body, { alice: 'other', 'igor-frontend': 'igor' })
    expect(isGoAhead(body, 'igor-backend[bot]', accounts)).toBe(false)
    expect(isGoAhead(body, FRONTEND, accounts)).toBe(true)
  })

  it('reading a mention followed by a long run of underscores stays linear', () => {
    // CPU time rather than elapsed, so time spent waiting for a core on a loaded machine does not
    // count.
    const before = process.cpuUsage()
    isStop('@igor-frontend @a' + '_'.repeat(32000) + '!', FRONTEND, IGORS)
    const { user, system } = process.cpuUsage(before)
    expect((user + system) / 1000).toBeLessThan(100)
  })

  it('a stop addressed to an Igor in underscore emphasis stops it', () => {
    expect(isStop('_@igor-frontend_ stop', FRONTEND, IGORS)).toBe(true)
  })
})
