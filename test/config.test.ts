import { describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.js'
import { tempDir } from './tmp.js'

const somewhere = () => tempDir('igor-config-')

describe('the config file refuses a key nobody reads', () => {
  it('names the offending key and the ones it accepts', () => {
    expect(() => resolveConfig({ destination: '.', reviewer: ['alice'] }, somewhere())).toThrow(
      /config names "reviewer", which is not a config key: destination, reviewers, experts, publicStore, budget/,
    )
  })

  it('reports a misspelt destination as the typo rather than as an absence', () => {
    // "destination is required" over a file whose second line is `destinaton: .` sends somebody
    // looking for the key they can see, so the spelling is checked before the requirement.
    expect(() => resolveConfig({ destinaton: '.' }, somewhere())).toThrow(/names "destinaton"/)
  })

  it('takes every key it documents', () => {
    const config = resolveConfig(
      {
        destination: '.',
        reviewers: ['alice'],
        experts: ['alice'],
        publicStore: true,
        budget: { seats: [{ id: 'adam', owner: 'alice', reserve: 0.5 }] },
      },
      somewhere(),
    )
    expect(config.budget.seats.map((s) => s.id)).toEqual(['adam'])
    expect(config.publicStore).toBe(true)
  })
})
