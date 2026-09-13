import { describe, expect, it } from 'vitest'
import {
  contributingAuthors,
  dominantAuthor,
  groupByDominant,
  pullRequestBody,
} from '../src/propose.js'
import type { Entry, ProvenanceItem } from '../src/entry.js'

function entry(id: string, provenance: ProvenanceItem[], overrides: Partial<Entry> = {}): Entry {
  return {
    id,
    claim: `Claim for ${id}.`,
    scope: 'global',
    status: 'provisional',
    conditions: { prose: 'When it applies.' },
    provenance,
    supersedes: [],
    body: '',
    ...overrides,
  }
}

const p = (author: string, at: string): ProvenanceItem => ({
  author,
  at,
  url: `https://github.com/org/repo/pull/1#discussion_r${at.replace(/-/g, '')}`,
})

describe('dominantAuthor', () => {
  it('is the author with the most provenance items', () => {
    const e = entry('x', [p('abram', '2020-01-01'), p('abram', '2020-02-01'), p('adam', '2021-01-01')])
    expect(dominantAuthor(e)).toBe('abram')
  })

  it('breaks an equal split toward the later contribution', () => {
    const e = entry('x', [
      p('abram', '2020-01-01'),
      p('abram', '2020-02-01'),
      p('adam', '2024-01-01'),
      p('adam', '2020-03-01'),
    ])
    expect(dominantAuthor(e)).toBe('adam')
  })

  it('handles a single author', () => {
    expect(dominantAuthor(entry('x', [p('adam', '2020-01-01')]))).toBe('adam')
  })
})

describe('contributingAuthors', () => {
  it('lists each author once', () => {
    const e = entry('x', [p('adam', '2020-01-01'), p('adam', '2021-01-01'), p('abram', '2022-01-01')])
    expect(contributingAuthors(e).sort()).toEqual(['abram', 'adam'])
  })
})

describe('groupByDominant', () => {
  it('produces one group per dominant author, not one per entry', () => {
    const entries = [
      entry('a', [p('adam', '2020-01-01'), p('adam', '2020-02-01')]),
      entry('b', [p('adam', '2020-01-01')]),
      entry('c', [p('abram', '2020-01-01'), p('abram', '2020-02-01')]),
    ]
    const groups = groupByDominant(entries)
    expect(groups.size).toBe(2)
    expect(groups.get('adam')!.map((e) => e.id)).toEqual(['a', 'b'])
    expect(groups.get('abram')!.map((e) => e.id)).toEqual(['c'])
  })

  it('places a mixed-authorship entry with its dominant author', () => {
    const entries = [entry('mixed', [p('abram', '2020-01-01'), p('abram', '2020-02-01'), p('adam', '2020-03-01')])]
    expect([...groupByDominant(entries).keys()]).toEqual(['abram'])
  })
})

describe('pullRequestBody', () => {
  const entries = [
    entry('index-what-you-query', [p('adam', '2020-09-12'), p('abram', '2021-01-02')], {
      claim: 'Index the fields you query on.',
      conditions: { paths: ['src/**/*.js'], prose: 'When adding a query.' },
    }),
  ]
  const body = pullRequestBody(entries, 'adam')

  it('states the review contract', () => {
    expect(body).toContain('Delete a file')
    expect(body).toContain('permanent')
    expect(body).toContain('Merge')
    expect(body).toContain('Close without merging')
  })

  it('distinguishes deferring from rejecting', () => {
    const close = body.split('\n').find((l) => l.includes('Close without merging'))!
    expect(close).toMatch(/defer/i)
    expect(close).toMatch(/nothing is rejected/i)

    const del = body.split('\n').find((l) => l.includes('Delete a file'))!
    expect(del).toMatch(/permanent/i)
  })

  it('carries the claim, conditions, and every provenance link', () => {
    expect(body).toContain('Index the fields you query on.')
    expect(body).toContain('When adding a query.')
    expect(body).toContain('`src/**/*.js`')
    expect(body).toContain('discussion_r20200912')
    expect(body).toContain('discussion_r20210102')
  })

  it('credits other contributing authors without @mentioning them', () => {
    expect(body).toContain('**Also drawn from:** abram')
    // A mention notifies someone who may never have seen this repository.
    expect(body).not.toContain('@')
  })

  it('names a hand-authored provenance item rather than showing an empty link', () => {
    const handWritten = [entry('x', [{ author: 'adam', at: '2026-09-13' }])]
    expect(pullRequestBody(handWritten, 'adam')).toContain('written by adam')
  })
})
