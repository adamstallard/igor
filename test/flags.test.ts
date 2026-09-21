import { describe, expect, it } from 'vitest'
import { claimRequested, contradictoryRunFlags } from '../src/flags.js'

describe('run refuses --plan together with --claim', () => {
  it('refuses the pair', () => {
    // `--claim` returns before triage and never reads the plan flag, so a run given both
    // claims — assigning the item, commenting on it, and spending a worker run.
    expect(contradictoryRunFlags({ plan: true, claim: 'github:o/r#5' })).toBeDefined()
  })

  it('names both flags, so the message says what was refused rather than that something was', () => {
    const message = contradictoryRunFlags({ plan: true, claim: 'github:o/r#5' })!
    expect(message).toContain('--plan')
    expect(message).toContain('--claim')
  })

  it('says which flag to drop for either thing the operator meant', () => {
    // The trap is prepending `--plan` to the `igor run <role> --claim <id>` line the preview
    // itself prints. Whoever does that is told to drop the flag they just added.
    const message = contradictoryRunFlags({ plan: true, claim: 'github:o/r#5' })!
    expect(message).toContain('drop --claim')
    expect(message).toContain('drop --plan')
  })

  it('allows either flag on its own, and a run with neither', () => {
    expect(contradictoryRunFlags({ plan: true })).toBeUndefined()
    expect(contradictoryRunFlags({ claim: 'github:o/r#5' })).toBeUndefined()
    expect(contradictoryRunFlags({})).toBeUndefined()
  })

  it('refuses an empty --claim too, which commander still reports as given', () => {
    // `--claim ''` is a mistyped id rather than an absent flag, so it contradicts --plan the
    // same way a real id does.
    expect(contradictoryRunFlags({ plan: true, claim: '' })).toBeDefined()
  })
})

describe('one definition of whether --claim was given', () => {
  it('counts an empty id as given', () => {
    // A shell expanding an unset variable produces `--claim ""`. Reading that as absent sends
    // the run past the single-item path into the full autonomous cycle, which claims and spends
    // across the backlog rather than failing on the one item it could not find.
    expect(claimRequested({ claim: '' })).toBe(true)
  })

  it('counts an absent flag as not given', () => {
    expect(claimRequested({})).toBe(false)
    expect(claimRequested({ claim: undefined })).toBe(false)
  })

  it('counts a real id as given', () => {
    expect(claimRequested({ claim: 'github:o/r#5' })).toBe(true)
  })

  it('refuses exactly the values it counts as given', () => {
    // Both sides pinned against literals rather than against each other. Asserting only that
    // they agree passes whenever they are wrong together, which is the state this exists to
    // catch: two predicates for one flag, disagreeing about the empty string.
    const cases = [
      { claim: '', given: true },
      { claim: 'github:o/r#5', given: true },
      { claim: undefined, given: false },
    ]
    for (const { claim, given } of cases) {
      expect(claimRequested({ claim })).toBe(given)
      expect(contradictoryRunFlags({ plan: true, claim }) !== undefined).toBe(given)
    }
  })
})
