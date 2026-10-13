import { describe, expect, it } from 'vitest'
import { isGoAhead, isStop } from '../src/signals.js'
import { IGORS } from './igors.js'

const FRONTEND = 'igor-frontend[bot]'
const BACKEND = 'igor-backend[bot]'

describe('iteration 3 finder', () => {
  it('a list separator carries the names over a blank line, so "go ahead @igor-backend,\\n\\n@igor-frontend, please keep holding" lifts the frontend Igor\'s stop', () => {
    const body = 'go ahead @igor-backend,\n\n@igor-frontend, please keep holding until the review lands.'
    expect(isGoAhead(body, BACKEND, IGORS)).toBe(true)
    expect(isGoAhead(body, FRONTEND, IGORS)).toBe(false)
  })

  it('a list separator carries the names over a blank line, so "stop @igor-backend,\\n\\n@igor-frontend, carry on" stops the frontend Igor', () => {
    const body = 'stop @igor-backend,\n\n@igor-frontend, carry on with yours.'
    expect(isStop(body, BACKEND, IGORS)).toBe(true)
    expect(isStop(body, FRONTEND, IGORS)).toBe(false)
  })
})

describe('a separator carries the list over one line break, never a blank line', () => {
  it('reads a list over a single line break after a comma, so "stop @igor-backend,\\n@igor-frontend" stops both', () => {
    const body = 'stop @igor-backend,\n@igor-frontend'
    expect(isStop(body, BACKEND, IGORS)).toBe(true)
    expect(isStop(body, FRONTEND, IGORS)).toBe(true)
  })

  it('ends the list at a blank line after "and", so "stop @igor-backend and\\n\\n@igor-frontend" stops only the backend Igor', () => {
    const body = 'stop @igor-backend and\n\n@igor-frontend'
    expect(isStop(body, BACKEND, IGORS)).toBe(true)
    expect(isStop(body, FRONTEND, IGORS)).toBe(false)
  })

  it('still stops an Igor addressed in a later paragraph, so "stop @igor-backend,\\n\\n@igor-frontend stop too" stops the frontend Igor', () => {
    const body = 'stop @igor-backend,\n\n@igor-frontend stop too'
    expect(isStop(body, BACKEND, IGORS)).toBe(true)
    expect(isStop(body, FRONTEND, IGORS)).toBe(true)
  })
})
