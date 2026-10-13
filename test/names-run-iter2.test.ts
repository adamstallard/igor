import { describe, expect, it } from 'vitest'
import { isGoAhead, isStop, namesToResolve, type Accounts } from '../src/signals.js'
import { IGORS } from './igors.js'

const FRONTEND = 'igor-frontend[bot]'
const BACKEND = 'igor-backend[bot]'

/** What a tracker would hand back: only the names `namesToResolve` asked about, resolved. */
function resolved(body: string, kinds: Record<string, 'igor' | 'other'>): Accounts {
  return Object.fromEntries(namesToResolve(body).flatMap((n) => (kinds[n] === undefined ? [] : [[n, kinds[n]!]])))
}

describe('iteration 2 finder', () => {
  it('a go-ahead whose separator comes before a line break reads as bare, so "go ahead,\\n@igor-backend" lifts the frontend Igor\'s stop', () => {
    expect(isGoAhead('go ahead,\n@igor-backend', BACKEND, IGORS)).toBe(true)
    expect(isGoAhead('go ahead,\n@igor-backend', FRONTEND, IGORS)).toBe(false)
  })

  it('a stop whose separator comes before a line break reads as bare, so "stop:\\n@igor-backend" stops the frontend Igor', () => {
    expect(isStop('stop:\n@igor-backend', FRONTEND, IGORS)).toBe(false)
  })

  it('later mentions that run on into a word keep their last name, so "go ahead and resume, @igor-backend, @igor-frontend keep waiting" lifts the frontend Igor\'s stop', () => {
    const body = 'go ahead and resume, @igor-backend, @igor-frontend keep waiting'
    expect(isGoAhead(body, BACKEND, IGORS)).toBe(true)
    expect(isGoAhead(body, FRONTEND, IGORS)).toBe(false)
  })

  it('a go-ahead naming only a person straight after the phrase ignores the Igor named later on its line, so it lifts every Igor\'s stop', () => {
    const body = 'carry on, @alice approved it for @igor-backend'
    const accounts = resolved(body, { alice: 'other', 'igor-backend': 'igor' })
    expect(isGoAhead(body, BACKEND, accounts)).toBe(true)
    expect(isGoAhead(body, FRONTEND, accounts)).toBe(false)
  })
})

describe('where a line break and a person meet the go-ahead', () => {
  it('reads a go-ahead whose opening line ends on a separator as bare', () => {
    expect(isGoAhead('go ahead,\nthanks @igor-backend for waiting', FRONTEND, IGORS)).toBe(true)
  })

  it('reads "go ahead:" on its own line as bare, whatever the next line names (Adam, 2026-10-13)', () => {
    expect(isGoAhead('go ahead:\nthanks @igor-backend', FRONTEND, IGORS)).toBe(true)
    expect(isGoAhead('go ahead:\nthanks @igor-backend', BACKEND, IGORS)).toBe(true)
  })

  it('reads a list that crossed a line break as naming only the list (Adam, 2026-10-13)', () => {
    const body = 'go ahead @alice,\nthanks @igor-backend'
    const accounts = resolved(body, { alice: 'other', 'igor-backend': 'igor' })
    expect(isGoAhead(body, FRONTEND, accounts)).toBe(true)
    expect(isGoAhead(body, BACKEND, accounts)).toBe(true)
  })

  it('does not read later mentions past a line break the list crossed', () => {
    const body = 'carry on @alice,\nthanks @igor-frontend'
    expect(isGoAhead(body, BACKEND, resolved(body, { alice: 'other', 'igor-frontend': 'igor' }))).toBe(true)
  })

  it('keeps a single later name', () => {
    const body = 'go ahead and resume, @igor-backend please'
    expect(isGoAhead(body, BACKEND, IGORS)).toBe(true)
    expect(isGoAhead(body, FRONTEND, IGORS)).toBe(false)
  })

  it('reads a stop whose names follow a blank line as bare', () => {
    expect(isStop('stop:\n\n@igor-backend did X', FRONTEND, IGORS)).toBe(true)
  })
})
