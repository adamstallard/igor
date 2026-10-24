import { describe, expect, it } from 'vitest'
import { instant } from '../src/time.js'

describe('instant', () => {
  it('reads a timestamp as the milliseconds it names', () => {
    expect(instant('2026-10-13T00:00:00Z')).toBe(Date.UTC(2026, 9, 13))
  })

  it('reads two spellings of one moment as the same instant, where the strings sort apart', () => {
    expect(instant('2026-10-13T00:00:00.000Z')).toBe(instant('2026-10-13T00:00:00Z'))
    expect('2026-10-13T00:00:00.000Z' < '2026-10-13T00:00:00Z').toBe(true)
  })

  it('reads an unparsable timestamp as the earliest instant, never the later of two', () => {
    expect(instant('not a date')).toBe(-Infinity)
    expect(instant('')).toBe(-Infinity)
    expect(instant('not a date') > instant('1970-01-01T00:00:00Z')).toBe(false)
  })
})
