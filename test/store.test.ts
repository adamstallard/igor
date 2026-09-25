import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { slugFromClaim, uniqueId } from '../src/id.js'
import { score } from '../src/scoring.js'
import {
  ENTRIES_DIR,
  StoreError,
  createTarget,
  loadAll,
  writeEntry,
  resolveCurrent,
  takenIds,
  writeRejection,
} from '../src/store.js'
import { resolveConfig, loadConfig, findConfig, igorRoot, ConfigError } from '../src/config.js'
import type { Entry } from '../src/entry.js'
import { tempDir } from './tmp.js'

function tempStore(): string {
  return tempDir('igor-lore-')
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
  it('derives support from the number of provenance items', () => {
    const provenance = Array.from({ length: 14 }, (_, i) => ({
      author: 'sarah',
      at: '2026-03-14',
      url: `https://example.invalid/${i}`,
    }))
    expect(score(provenance).support).toBe(14)
  })

  it('reports the date of the freshest evidence, not a decayed weight', () => {
    const old = [{ author: 'a', at: '2020-07-11' }, { author: 'b', at: '2021-01-02' }]
    expect(score(old).newestAt).toBe('2021-01-02')
  })

  it('does not diminish an entry for being old', () => {
    // Lore is mined from historical review comments and is old by construction. A decay
    // curve reported this whole store as stale while saying nothing about whether any
    // lesson still held, and buried the entries that had held longest.
    const old = score([{ author: 'a', at: '2020-07-11' }])
    const recent = score([{ author: 'a', at: '2026-09-13' }])
    expect(old.support).toBe(recent.support)
    expect(Object.keys(old).sort()).toEqual(Object.keys(recent).sort())
  })

  it('ignores an unparseable date rather than reporting it as newest', () => {
    expect(score([{ author: 'a', at: 'whenever' }, { author: 'b', at: '2024-01-28' }]).newestAt).toBe('2024-01-28')
  })

  it('reports no date when there is no provenance', () => {
    expect(score([]).newestAt).toBeUndefined()
  })
  it('counts expert provenance separately', () => {
    const s = score(
      [
        { author: 'sarah', at: '2026-01-01' },
        { author: 'drive-by', at: '2026-01-01' },
      ],
      { experts: ['sarah'] },
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

describe('finding the config', () => {
  it('walks up from a nested directory', () => {
    const root = tempStore()
    mkdirSync(join(root, 'a', 'b'), { recursive: true })
    writeFileSync(join(root, 'igor.config.yaml'), 'destination: .\n')
    expect(findConfig(join(root, 'a', 'b'))).toBe(join(root, 'igor.config.yaml'))
  })

  it('returns undefined when there is none above', () => {
    expect(findConfig(tempStore())).toBeUndefined()
  })

  it('refuses a config inside the Igor installation', () => {
    // Igor is a shared public tool; a team's config never belongs in a clone of it.
    expect(() => loadConfig(join(igorRoot(), 'igor.config.yaml'))).toThrow(
      /inside the Igor installation/,
    )
  })

  it('explains where the config belongs when none is found', () => {
    const cwd = process.cwd()
    try {
      process.chdir(tempStore())
      expect(() => loadConfig()).toThrow(/repository holding your lore/)
    } finally {
      process.chdir(cwd)
    }
  })
})

describe('the store sits at the root of its repository', () => {
  /** A config file of its own, so the destination under test is the only thing that varies. */
  function configFor(destination: string): string {
    const path = join(tempStore(), 'igor.config.yaml')
    writeFileSync(path, `destination: ${JSON.stringify(destination)}\n`)
    return path
  }

  function repo(): string {
    const root = tempStore()
    execFileSync('git', ['-C', root, 'init', '-q'])
    return root
  }

  afterEach(() => vi.unstubAllEnvs())

  it('accepts a destination at the root', () => {
    const root = repo()
    expect(loadConfig(configFor(root)).destination).toBe(root)
  })

  it('refuses a subdirectory, naming where it sits and what a nested store inherits', () => {
    const root = repo()
    mkdirSync(join(root, 'lore'))
    const load = () => loadConfig(configFor(join(root, 'lore')))
    expect(load).toThrow(ConfigError)
    expect(load).toThrow(/sits at lore\/ within its repository/)
    expect(load).toThrow(/access, visibility and lifecycle/)
  })

  it('keeps a leading space that is part of the directory name', () => {
    // git emits the prefix raw and terminates it with a newline, so only that newline may come
    // off. Trim the line and the prefix reads `lore/` — a directory that is not the store, in a
    // message that sends somebody to the wrong place.
    const root = repo()
    mkdirSync(join(root, ' lore'))
    const thrown = (() => {
      try {
        loadConfig(configFor(join(root, ' lore')))
      } catch (e) {
        return (e as Error).message
      }
      return ''
    })()
    expect(thrown).toContain('sits at ' + ' lore/' + ' within its repository')
  })

  it('refuses a destination that is not inside a git repository', () => {
    // Reading an unknown prefix as the root is the one outcome that must not happen.
    expect(() => loadConfig(configFor(tempStore()))).toThrow(/git could not say where it sits/)
  })

  it('refuses a bare repository, which reports an empty prefix like a root does', () => {
    const bare = tempStore()
    execFileSync('git', ['-C', bare, 'init', '--bare', '-q'])
    expect(() => loadConfig(configFor(bare))).toThrow(/bare git repository/)
  })

  it('refuses a path inside the gitdir, which reports an empty prefix like a root does', () => {
    // `.git` and everything under it answers `--show-prefix` with nothing, so the prefix alone
    // reads the gitdir as a root. git ignores its own directory, so a store there could never be
    // committed.
    const root = repo()
    mkdirSync(join(root, '.git', 'lore'))
    expect(() => loadConfig(configFor(join(root, '.git', 'lore')))).toThrow(/gitdir/)
    expect(() => loadConfig(configFor(join(root, '.git')))).toThrow(/gitdir/)
  })

  // `-C <dir>` is the whole question. Either of these in the environment answers a different one
  // — git exports GIT_DIR to `filter-branch` and `submodule foreach` — and the subdirectory then
  // reads as a root. One test per variable, because a scrub list loses an entry silently.
  for (const name of ['GIT_DIR', 'GIT_WORK_TREE']) {
    it(`asks about the destination, not about an inherited ${name}`, () => {
      const root = repo()
      mkdirSync(join(root, 'lore'))
      vi.stubEnv(name, name === 'GIT_DIR' ? join(repo(), '.git') : join(root, 'lore'))

      expect(() => loadConfig(configFor(join(root, 'lore')))).toThrow(/sits at lore\//)
    })
  }

  it('blames a destination git refuses to take as an argument, not PATH', () => {
    // A NUL byte makes `execFileSync` throw before it spawns anything, so there is no exit code
    // — but git is fine and the destination is exactly what is wrong. Only a spawn that happened
    // and produced no exit code means git could not be run.
    const bad = join(tempStore(), '\u0000lore')
    const load = () => loadConfig(configFor(bad))
    expect(load).toThrow(/cannot be used as a store/)
    expect(load).not.toThrow(/git could not be run/)
  })

  it('says git could not be run, rather than blaming a destination that is fine', () => {
    // No exit code means the process never ran to completion — absent from PATH, not executable,
    // killed. There is no stderr to quote, and naming the destination sends somebody to inspect a
    // path that is correct.
    const root = repo()
    const path = configFor(root)
    const empty = tempStore()
    vi.stubEnv('PATH', empty)

    expect(() => loadConfig(path)).toThrow(/git could not be run/)
    expect(() => loadConfig(path)).not.toThrow(/cannot be used as a store/)
  })

  it('reads the prefix as everything after the last answer, newlines included', () => {
    // A newline is as legal in a directory name as a leading space, and taking the prefix as one
    // line drops everything before the last one — which here is the whole name, leaving a store
    // one directory down looking like a root.
    const root = repo()
    mkdirSync(join(root, '\nlead'))
    expect(() => loadConfig(configFor(join(root, '\nlead')))).toThrow(/sits at/)
  })

  it('carries what git said when it cannot place the destination at all', () => {
    // "not inside a git repository" is a lie for a repository git refuses to read — dubious
    // ownership on a bind mount or a CI container is the common one — and git's own line names
    // the remedy.
    const before = process.env['LC_ALL']
    process.env['LC_ALL'] = 'C'
    try {
      const missing = join(tempStore(), 'no-such-directory')
      expect(() => loadConfig(configFor(missing))).toThrow(/cannot change to/)
    } finally {
      if (before === undefined) delete process.env['LC_ALL']
      else process.env['LC_ALL'] = before
    }
  })
})

describe('creating into a candidate directory', () => {
  it('writes where propose --from looks, leaving the store untouched', () => {
    const destination = tempStore()
    const candidates = tempStore()

    const target = createTarget(destination, candidates)
    writeEntry(target.dir, entry())

    // The gate propose --from applies before it reads anything.
    expect(existsSync(join(candidates, ENTRIES_DIR))).toBe(true)
    expect(loadAll(candidates).map((c) => c.id)).toEqual(['use-query-hook'])
    expect(loadAll(destination)).toEqual([])
  })

  it('takes ids against the store as well as the target', () => {
    const destination = tempStore()
    const candidates = tempStore()
    const slug = slugFromClaim(entry().claim)
    writeEntry(destination, entry({ id: slug }))

    expect(uniqueId(entry().claim, createTarget(destination, candidates).taken)).toBe(`${slug}-2`)
  })

  it('takes ids against rejections, so new evidence gets its own id rather than a dead one', () => {
    const destination = tempStore()
    const candidates = tempStore()
    const slug = slugFromClaim(entry().claim)
    writeRejection(destination, { id: slug, by: 'adam', at: '2026-04-01', pr: 7 })

    expect(uniqueId(entry().claim, createTarget(destination, candidates).taken)).toBe(`${slug}-2`)
  })

  it('takes ids against candidates already staged in the target', () => {
    const destination = tempStore()
    const candidates = tempStore()
    const slug = slugFromClaim(entry().claim)
    writeEntry(candidates, entry({ id: slug }))

    expect(uniqueId(entry().claim, createTarget(destination, candidates).taken)).toBe(`${slug}-2`)
  })

  it('refuses a directory that is not there rather than conjuring it', () => {
    const destination = tempStore()
    const missing = join(tempStore(), 'canddiates')

    expect(() => createTarget(destination, missing)).toThrow(StoreError)
    expect(existsSync(missing)).toBe(false)
  })

  it('refuses a path that is a file', () => {
    const destination = tempStore()
    const file = join(tempStore(), 'notes.md')
    writeFileSync(file, 'not a store', 'utf8')

    expect(() => createTarget(destination, file)).toThrow(/not a directory/)
  })

  it('falls back to the destination and its ids when no target is given', () => {
    const destination = tempStore()
    writeEntry(destination, entry())

    const target = createTarget(destination)
    expect(target.dir).toBe(destination)
    expect(target.taken).toEqual(new Set(['use-query-hook']))
  })
})
