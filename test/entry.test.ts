import { describe, expect, it } from 'vitest'
import { validateFrontmatter } from '../src/entry.js'

function valid(overrides: Record<string, unknown> = {}) {
  return {
    id: 'use-query-hook',
    claim: 'Fetch with the shared query hook rather than inside useEffect.',
    scope: 'role:frontend',
    status: 'provisional',
    conditions: { paths: ['src/**/*.tsx'], prose: 'When changing data fetching.' },
    provenance: [{ url: 'https://example.invalid/pr/1', author: 'sarah', at: '2026-03-14' }],
    supersedes: [],
    ...overrides,
  }
}

const fields = (data: unknown) => validateFrontmatter(data).map((e) => e.field)

describe('validateFrontmatter', () => {
  it('accepts a well-formed entry', () => {
    expect(validateFrontmatter(valid())).toEqual([])
  })

  it('reports every problem rather than stopping at the first', () => {
    const errors = validateFrontmatter({ status: 'nonsense' })
    expect(errors.length).toBeGreaterThan(3)
    expect(fields({ status: 'nonsense' })).toContain('claim')
  })

  it('rejects a missing required field', () => {
    const { provenance, ...without } = valid()
    expect(fields(without)).toContain('provenance')
  })

  it('rejects an unrecognized scope prefix', () => {
    expect(fields(valid({ scope: 'team:frontend' }))).toContain('scope')
  })

  it('rejects an unrecognized status', () => {
    expect(fields(valid({ status: 'draft' }))).toContain('status')
  })

  describe('scope is a label, not a reference', () => {
    it('accepts role scope with no roles defined anywhere', () => {
      expect(validateFrontmatter(valid({ scope: 'role:frontend' }))).toEqual([])
    })

    it('accepts project scope', () => {
      expect(validateFrontmatter(valid({ scope: 'project:storefront' }))).toEqual([])
    })

    it('accepts global', () => {
      expect(validateFrontmatter(valid({ scope: 'global' }))).toEqual([])
    })
  })

  describe('derived scores must not be stored', () => {
    it('rejects a stored support field', () => {
      expect(fields(valid({ support: 14 }))).toContain('support')
    })

    it('rejects a stored recency field', () => {
      expect(fields(valid({ recency: 0.82 }))).toContain('recency')
    })
  })

  describe('provenance', () => {
    it('accepts a hand-authored item with no url', () => {
      const entry = valid({ provenance: [{ author: 'adam', at: '2026-09-13' }] })
      expect(validateFrontmatter(entry)).toEqual([])
    })

    it('rejects empty provenance', () => {
      expect(fields(valid({ provenance: [] }))).toContain('provenance')
    })

    it('requires an author on each item', () => {
      const entry = valid({ provenance: [{ at: '2026-09-13' }] })
      expect(fields(entry)).toContain('provenance[0].author')
    })

    it('requires an ISO date', () => {
      const entry = valid({ provenance: [{ author: 'adam', at: 'last March' }] })
      expect(fields(entry)).toContain('provenance[0].at')
    })
  })

  describe('reviewed', () => {
    it('is not required for a provisional entry', () => {
      expect(validateFrontmatter(valid({ status: 'provisional' }))).toEqual([])
    })

    it('is required once an entry is active', () => {
      expect(fields(valid({ status: 'active' }))).toContain('reviewed')
    })

    it('is accepted when complete', () => {
      const entry = valid({ status: 'active', reviewed: { by: 'sarah', at: '2026-09-13' } })
      expect(validateFrontmatter(entry)).toEqual([])
    })
  })

  describe('conditions', () => {
    it('requires prose even when a predicate is present', () => {
      expect(fields(valid({ conditions: { paths: ['src/**'] } }))).toContain('conditions.prose')
    })

    it('allows prose with no predicate', () => {
      const entry = valid({ conditions: { prose: 'When touching auth.' } })
      expect(validateFrontmatter(entry)).toEqual([])
    })
  })
})
