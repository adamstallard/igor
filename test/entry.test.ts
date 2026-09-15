import { describe, expect, it } from 'vitest'
import { ProvenanceInputError, provenanceFromCitations, validateFrontmatter } from '../src/entry.js'

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

    it('ignores a field it does not know, rather than refusing the entry', () => {
      // Only derived fields are refused. An unrecognised key is not an error, which is why
      // `recency` stopped being listed once nothing derived one.
      expect(fields(valid({ recency: 0.82 }))).toEqual([])
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

describe('provenanceFromCitations', () => {
  it('builds a single dated-today item, matching the old single-author behaviour', () => {
    expect(provenanceFromCitations(['adam'], undefined, undefined, '2026-09-13')).toEqual([
      { author: 'adam', at: '2026-09-13' },
    ])
  })

  it('builds one item per author, citing a whole cluster', () => {
    const items = provenanceFromCitations(['sarah', 'jose'], undefined, undefined, '2026-09-13')
    expect(items).toEqual([
      { author: 'sarah', at: '2026-09-13' },
      { author: 'jose', at: '2026-09-13' },
    ])
  })

  it('pairs url and at to each author positionally', () => {
    const items = provenanceFromCitations(
      ['sarah', 'jose'],
      ['https://example.invalid/pr/1', 'https://example.invalid/pr/2'],
      ['2026-03-14', '2026-03-20'],
      '2026-09-13',
    )
    expect(items).toEqual([
      { author: 'sarah', url: 'https://example.invalid/pr/1', at: '2026-03-14' },
      { author: 'jose', url: 'https://example.invalid/pr/2', at: '2026-03-20' },
    ])
  })

  it('accepts --at with no --url, citing each date with no url', () => {
    const items = provenanceFromCitations(['sarah', 'jose'], undefined, ['2026-03-14', '2026-03-20'], '2026-09-13')
    expect(items).toEqual([
      { author: 'sarah', at: '2026-03-14' },
      { author: 'jose', at: '2026-03-20' },
    ])
  })

  it('rejects a url count that does not match the author count', () => {
    expect(() =>
      provenanceFromCitations(['sarah', 'jose'], ['https://example.invalid/pr/1'], undefined, '2026-09-13'),
    ).toThrow(ProvenanceInputError)
  })

  it('rejects an at count that does not match the author count', () => {
    expect(() =>
      provenanceFromCitations(['sarah', 'jose'], undefined, ['2026-03-14'], '2026-09-13'),
    ).toThrow(ProvenanceInputError)
  })
})
