import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { slugFromClaim, uniqueId } from '../src/id.js'
import { score } from '../src/scoring.js'
import { loadAll, writeEntry, resolveCurrent, takenIds } from '../src/store.js'
import { resolveConfig, igorRoot, ConfigError } from '../src/config.js'
import type { Entry } from '../src/entry.js'

function tempStore(): string {
  return mkdtempSync(join(tmpdir(), 'igor-lore-'))
}

function entry(overrides: Partial<Entry> = {}): Entry {
  return {
    id: 'use-query-hook',
    claim: 'Fetch with the shared query hook rather than inside useEffect.',
    scope: 'role:frontend',
    status: 'provisional',
    conditions: { prose: 'When changing data fetching.' },
    provenance: [{ author: 'sarah', at: '2026-03-14' }],
    supersedes: [],
    body: 'Components that fetch in useEffect re-fetch on remount.',
    ...overrides,
  }
}

describe('ids', () => {
  it('derives a kebab slug from the claim', () => {
    expect(slugFromClaim('Fetch with the shared query hook, not useEffect!')).toBe(
      'fetch-shared-query-hook-not-useeffect',
    )
  })

  it('spends the length budget on informative words', () => {
    const slug = slugFromClaim(
      'Fetch data with the shared query hook rather than calling fetch inside useEffect',
    )
    expect(slug).toContain('useeffect')
    expect(slug).not.toContain('-with-')
  })

  it('keeps stopwords when dropping them would leave nothing', () => {
    expect(slugFromClaim('It is what it is')).toBe('what')
    // Every word a stopword: keep them rather than produce an empty id.
    expect(slugFromClaim('We are in the and of it')).toBe('we-are-in-the-and-of-it')
  })

  it('keeps slugs bounded without cutting mid-word', () => {
    const slug = slugFromClaim('a '.repeat(80))
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('appends a discriminator on collision', () => {
    const taken = new Set(['use-hook'])
    expect(uniqueId('Use the hook', taken)).toBe('use-hook-2')
    expect(uniqueId('Use the hook', new Set([...taken, 'use-hook-2']))).toBe('use-hook-3')
  })

  it('falls back rather than producing an empty id', () => {
    expect(slugFromClaim('!!! ???')).toBe('entry')
  })
})

describe('round trip', () => {
  it('writes an entry that reads back identically', () => {
    const dir = tempStore()
    writeEntry(dir, entry())
    const loaded = loadAll(dir)
    expect(loaded).toHaveLength(1)
    expect(loaded[0]!.errors).toEqual([])
    expect(loaded[0]!.entry).toEqual(entry())
  })

  it('names the file after the id', () => {
    const dir = tempStore()
    const file = writeEntry(dir, entry())
    expect(file.endsWith('entries/use-query-hook.md')).toBe(true)
  })

  it('refuses to write an invalid entry', () => {
    const dir = tempStore()
    expect(() => writeEntry(dir, entry({ provenance: [] }))).toThrow(/invalid/)
  })

  it('reports a mismatch between id and filename', () => {
    const dir = tempStore()
    mkdirSync(join(dir, 'entries'), { recursive: true })
    writeFileSync(
      join(dir, 'entries', 'wrong-name.md'),
      `---\nid: use-query-hook\nclaim: x\nscope: global\nstatus: provisional\nconditions:\n  prose: y\nprovenance:\n  - author: a\n    at: 2026-01-01\nsupersedes: []\n---\n`,
    )
    const errors = loadAll(dir)[0]!.errors.map((e) => e.message)
    expect(errors.some((m) => m.includes('located by filename'))).toBe(true)
  })

  it('accepts unquoted dates, which is how a person writes them', () => {
    // YAML turns an unquoted 2026-03-14 into a Date; entries treat dates as strings.
    const dir = tempStore()
    mkdirSync(join(dir, 'entries'), { recursive: true })
    writeFileSync(
      join(dir, 'entries', 'hand-written.md'),
      `---\nid: hand-written\nclaim: Written by a person.\nscope: global\nstatus: active\nconditions:\n  prose: Always.\nprovenance:\n  - author: adam\n    at: 2026-09-13\nsupersedes: []\nreviewed:\n  by: adam\n  at: 2026-09-13\n---\n\nBody.\n`,
    )
    const loaded = loadAll(dir)[0]!
    expect(loaded.errors).toEqual([])
    expect(loaded.entry!.provenance[0]!.at).toBe('2026-09-13')
    expect(loaded.entry!.reviewed!.at).toBe('2026-09-13')
  })

  it('reports every invalid entry in one pass', () => {
    const dir = tempStore()
    writeEntry(dir, entry())
    mkdirSync(join(dir, 'entries'), { recursive: true })
    for (const name of ['bad-one', 'bad-two']) {
      writeFileSync(join(dir, 'entries', `${name}.md`), `---\nid: ${name}\n---\n`)
    }
    expect(loadAll(dir).filter((l) => l.errors.length > 0)).toHaveLength(2)
  })
})

describe('id immutability', () => {
  it('does not move when the claim is reworded', () => {
    const dir = tempStore()
    writeEntry(dir, entry())
    const reworded = { ...entry(), claim: 'Completely different wording now.' }
    writeEntry(dir, reworded)
    expect(takenIds(dir)).toEqual(new Set(['use-query-hook']))
    expect(loadAll(dir)[0]!.entry!.claim).toBe('Completely different wording now.')
  })

  it('keeps supersedes pointers resolvable across a rewording', () => {
    const older = entry({ id: 'old-rule' })
    const newer = entry({ id: 'new-rule', supersedes: ['old-rule'], claim: 'Reworded.' })
    expect(resolveCurrent('old-rule', [older, newer])!.id).toBe('new-rule')
  })
})

describe('supersession', () => {
  it('resolves a superseded id to its replacement', () => {
    const a = entry({ id: 'a' })
    const b = entry({ id: 'b', supersedes: ['a'] })
    expect(resolveCurrent('a', [a, b])!.id).toBe('b')
  })

  it('follows a chain', () => {
    const a = entry({ id: 'a' })
    const b = entry({ id: 'b', supersedes: ['a'] })
    const c = entry({ id: 'c', supersedes: ['b'] })
    expect(resolveCurrent('a', [a, b, c])!.id).toBe('c')
  })

  it('returns the entry itself when nothing superseded it', () => {
    const a = entry({ id: 'a' })
    expect(resolveCurrent('a', [a])!.id).toBe('a')
  })

  it('returns undefined for an unknown id', () => {
    expect(resolveCurrent('missing', [entry({ id: 'a' })])).toBeUndefined()
  })
})

describe('scoring', () => {
  const asOf = new Date('2026-09-13T00:00:00Z')

  it('derives support from the number of provenance items', () => {
    const provenance = Array.from({ length: 14 }, (_, i) => ({
      author: 'sarah',
      at: '2026-03-14',
      url: `https://example.invalid/${i}`,
    }))
    expect(score(provenance, { halfLifeDays: 365, asOf }).support).toBe(14)
  })

  it('reads recency from the freshest item, not the pile', () => {
    const old = Array.from({ length: 20 }, () => ({ author: 'a', at: '2020-01-01' }))
    const stale = score(old, { halfLifeDays: 365, asOf })
    const fresh = score([...old, { author: 'a', at: '2026-09-13' }], { halfLifeDays: 365, asOf })
    expect(fresh.recency).toBeGreaterThan(stale.recency)
    expect(fresh.recency).toBeCloseTo(1, 2)
  })

  it('halves at one half-life', () => {
    const s = score([{ author: 'a', at: '2025-09-13' }], { halfLifeDays: 365, asOf })
    expect(s.recency).toBeCloseTo(0.5, 2)
  })

  it('recomputes lower on a later date with no change to the entry', () => {
    const provenance = [{ author: 'a', at: '2026-01-01' }]
    const now = score(provenance, { halfLifeDays: 365, asOf })
    const later = score(provenance, {
      halfLifeDays: 365,
      asOf: new Date('2027-09-13T00:00:00Z'),
    })
    expect(later.recency).toBeLessThan(now.recency)
  })

  it('counts expert provenance separately', () => {
    const s = score(
      [
        { author: 'sarah', at: '2026-01-01' },
        { author: 'drive-by', at: '2026-01-01' },
      ],
      { halfLifeDays: 365, experts: ['sarah'], asOf },
    )
    expect(s).toMatchObject({ support: 2, expertSupport: 1 })
  })
})

describe('destination boundary', () => {
  it('resolves a destination relative to the config file', () => {
    const config = resolveConfig({ destination: '../knowledge' }, '/tmp/team/config')
    expect(config.destination).toBe('/tmp/team/knowledge')
  })

  it('refuses a destination inside the Igor installation', () => {
    expect(() => resolveConfig({ destination: './lore' }, igorRoot())).toThrow(ConfigError)
    expect(() => resolveConfig({ destination: './lore' }, igorRoot())).toThrow(
      /belongs to the operating team/,
    )
  })

  it('refuses when no destination is configured', () => {
    expect(() => resolveConfig({}, '/tmp/team')).toThrow(/destination is required/)
  })

  it('defaults the half-life but allows an override', () => {
    expect(resolveConfig({ destination: '/tmp/x' }, '/tmp').halfLifeDays).toBe(365)
    expect(
      resolveConfig({ destination: '/tmp/x', scoring: { halfLifeDays: 90 } }, '/tmp').halfLifeDays,
    ).toBe(90)
  })

  it('rejects a nonsensical half-life', () => {
    expect(() =>
      resolveConfig({ destination: '/tmp/x', scoring: { halfLifeDays: 0 } }, '/tmp'),
    ).toThrow(ConfigError)
  })
})

describe('serialized form', () => {
  it('is readable markdown with the body after the frontmatter', () => {
    const dir = tempStore()
    const file = writeEntry(dir, entry())
    const text = readFileSync(file, 'utf8')
    expect(text.startsWith('---\nid: use-query-hook\n')).toBe(true)
    expect(text).toContain('re-fetch on remount')
  })

  it('omits reviewed when absent rather than writing null', () => {
    const dir = tempStore()
    const text = readFileSync(writeEntry(dir, entry()), 'utf8')
    expect(text).not.toContain('reviewed')
  })
})
