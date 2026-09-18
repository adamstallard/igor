import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../src/config.js'
import type { Entry } from '../src/entry.js'
import { ENTRIES_DIR, REJECTED_DIR, loadEntry, serialize, writeEntry } from '../src/store.js'
import { tempDir } from './tmp.js'

/**
 * `reconcile` over the real `github.ts`, with only the `gh` process faked.
 *
 * `reconcile.test.ts` replaces `github.js` wholesale, so its mock decides for itself what a
 * pull request proposed — and cannot see a regression in how that is actually worked out. What
 * a pull request proposed is now the union of two API reads, and the case that needs proving
 * is the seam: the same pull request, the same commits, the same landed files, differing only
 * in which commit came first.
 */
class FakeGhError extends Error {}

const commits = new Map<number, string[]>()
const filesAt = new Map<string, { filename: string; status?: string }[]>()
const landed = new Map<number, { filename: string; status?: string }[]>()
/** `path@ref` to file text, as `fileAtRef` reads it back. */
const contentAt = new Map<string, string>()
let pulls: unknown[] = []

function prNumber(endpoint: string): number {
  return Number(/\/pulls\/(\d+)\//.exec(endpoint)?.[1])
}

vi.mock('../src/gh.js', () => ({
  GhError: FakeGhError,
  gh: async (args: readonly string[]) => {
    const endpoint = args[1] ?? ''
    if (endpoint.startsWith('repos/org/lore/pulls?')) return [pulls]
    if (endpoint.endsWith('/commits')) return commits.get(prNumber(endpoint)) ?? []
    const contents = /^repos\/org\/lore\/contents\/(.+)\?ref=(.+)$/.exec(endpoint)
    if (contents) {
      const text = contentAt.get(`${contents[1]}@${contents[2]}`)
      if (text === undefined) throw new FakeGhError(`no such file: ${endpoint}`)
      return { content: Buffer.from(text, 'utf8').toString('base64') }
    }
    // Handed back whole, statuses and all: deciding which of them count is the code's job,
    // and a fake that filtered them first would be testing itself.
    const at = /\/commits\/(.+)$/.exec(endpoint)
    if (at) return filesAt.get(at[1] as string) ?? []
    throw new FakeGhError(`unexpected endpoint: ${endpoint}`)
  },
  ghPaginated: async (args: readonly string[]) => landed.get(prNumber(args[1] ?? '')) ?? [],
}))

const { reconcile } = await import('../src/reconcile.js')

function entry(id: string): Entry {
  return {
    id,
    claim: 'Fetch with the shared query hook rather than inside useEffect.',
    scope: 'role:frontend',
    status: 'provisional',
    conditions: { prose: 'When changing data fetching.' },
    provenance: [{ author: 'sarah', at: '2026-03-14' }],
    supersedes: [],
    body: 'Components that fetch in useEffect re-fetch on remount.',
  }
}

/** A checkout whose origin is the destination, which is where `repoFromCheckout` reads it. */
function store(): string {
  const dir = tempDir('igor-over-gh-')
  execFileSync('git', ['-C', dir, 'init', '-q'])
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://github.com/org/lore.git'])
  mkdirSync(join(dir, ENTRIES_DIR), { recursive: true })
  return dir
}

/** `/commits/{sha}` and `/pulls/N/files` both report a status per file; added is the default. */
function touched(...files: (string | [string, string])[]): { filename: string; status?: string }[] {
  return files.map((f) =>
    typeof f === 'string' ? { filename: f, status: 'added' } : { filename: f[0], status: f[1] },
  )
}

function config(destination: string): Config {
  return { destination, reviewers: ['abram'], experts: [], budget: { seats: [], pools: [] } }
}

function mergedPr(number: number): void {
  pulls = [
    {
      number,
      state: 'closed',
      merged_at: '2026-04-01T10:00:00Z',
      updated_at: '2026-04-01T10:00:00Z',
      html_url: `https://github.com/org/lore/pull/${number}`,
      assignees: [{ login: 'adam' }],
      merged_by: { login: 'adam' },
    },
  ]
}

beforeEach(() => {
  commits.clear()
  filesAt.clear()
  landed.clear()
  contentAt.clear()
  pulls = []
})

describe('a pull request somebody opened by hand', () => {
  const path = `${ENTRIES_DIR}/use-query-hook.md`

  it('is promoted when its entry arrives in a later commit', async () => {
    const dir = store()
    writeEntry(dir, entry('use-query-hook'))
    mergedPr(7)
    commits.set(7, ['sha1', 'sha2'])
    filesAt.set('sha1', touched('README.md'))
    filesAt.set('sha2', touched(path))
    landed.set(7, touched('README.md', path))

    const result = await reconcile(config(dir))

    expect(result.promoted.map((p) => p.id)).toEqual(['use-query-hook'])
    expect(loadEntry(dir, 'use-query-hook').entry?.status).toBe('active')
  })

  it('is promoted just the same when its entry arrives first', async () => {
    // The control. Commit order is the only thing that differs, and it must not decide this.
    const dir = store()
    writeEntry(dir, entry('use-query-hook'))
    mergedPr(7)
    commits.set(7, ['sha1', 'sha2'])
    filesAt.set('sha1', touched(path))
    filesAt.set('sha2', touched('README.md'))
    landed.set(7, touched(path, 'README.md'))

    const result = await reconcile(config(dir))

    expect(result.promoted.map((p) => p.id)).toEqual(['use-query-hook'])
  })

  it('records a rejection for a candidate deleted on the branch, which never lands', async () => {
    const dir = store()
    mergedPr(7)
    commits.set(7, ['sha1'])
    filesAt.set('sha1', touched(path))
    landed.set(7, [])
    // Readable at the proposing commit and nowhere else, which is why that read is kept.
    contentAt.set(`${path}@sha1`, serialize(entry('use-query-hook')))

    const result = await reconcile(config(dir))

    expect(result.declined.map((d) => d.id)).toEqual(['use-query-hook'])
    expect(readFileSync(join(dir, REJECTED_DIR, 'use-query-hook.md'), 'utf8')).toContain(
      'Fetch with the shared query hook',
    )
  })
})

describe('a pull request that is not proposing anything', () => {
  const path = `${ENTRIES_DIR}/keep-migrations-reversible.md`

  it('retires an entry without that reading as a rejection or a stale checkout', async () => {
    // Deleting an entry on the default branch is retirement. proposal.md rejects widening
    // `--diff-filter` to `D` because it misreads retirement as rejection; recognizing a
    // proposal by its files must not reintroduce that under another name.
    const dir = store()
    mergedPr(7)
    commits.set(7, ['sha1'])
    filesAt.set('sha1', touched([path, 'removed']))
    landed.set(7, touched([path, 'removed']))

    const result = await reconcile(config(dir))

    expect(result.declined).toEqual([])
    expect(result.promoted).toEqual([])
    expect(result.missingLocally).toEqual([])
    expect(existsSync(join(dir, REJECTED_DIR))).toBe(false)
  })
})

describe('a candidate nobody validated', () => {
  it('records the rejection and keeps sweeping when its frontmatter will not parse', async () => {
    // An unquoted colon in a claim is the ordinary YAML mistake, and `matter` throws on it.
    // Every pull request the destination has ever had is swept, so one bad candidate in one
    // old proposal must not abort the run — it would abort every future run identically.
    const dir = store()
    const bad = `${ENTRIES_DIR}/scratch.md`
    const good = `${ENTRIES_DIR}/use-query-hook.md`
    writeEntry(dir, entry('use-query-hook'))
    pulls = [
      {
        number: 7,
        state: 'closed',
        merged_at: '2026-04-01T10:00:00Z',
        updated_at: '2026-04-01T10:00:00Z',
        html_url: 'https://github.com/org/lore/pull/7',
        assignees: [{ login: 'adam' }],
        merged_by: { login: 'adam' },
      },
    ]
    commits.set(7, ['sha1'])
    filesAt.set('sha1', touched(bad, good))
    landed.set(7, touched(good))
    contentAt.set(`${bad}@sha1`, '---\nclaim: Use the hook: it is better\n---\n\nBody.\n')

    const result = await reconcile(config(dir))

    expect(result.declined.map((d) => d.id)).toEqual(['scratch'])
    expect(result.promoted.map((p) => p.id)).toEqual(['use-query-hook'])
    const record = readFileSync(join(dir, REJECTED_DIR, 'scratch.md'), 'utf8')
    expect(record).toContain('id: scratch')
  })
})

describe('an entry that is there and cannot be read', () => {
  it('is named with the reason, not reported as a checkout that needs pulling', async () => {
    // `matter` throws on an unquoted colon. Before, that aborted the sweep; reporting it as
    // "behind" instead would send someone to pull a checkout that is already current — and in
    // the merge-triggered job the checkout is upstream, so the instruction cannot be followed.
    const dir = store()
    const path = `${ENTRIES_DIR}/use-query-hook.md`
    writeFileSync(
      join(dir, path),
      '---\nclaim: Use the hook: it is better\n---\n\nBody.\n',
      'utf8',
    )
    mergedPr(7)
    commits.set(7, ['sha1'])
    filesAt.set('sha1', touched(path))
    landed.set(7, touched(path))

    const result = await reconcile(config(dir))

    expect(result.missingLocally).toEqual([])
    expect(result.promoted).toEqual([])
    expect(result.unreadable.map((u) => u.id)).toEqual(['use-query-hook'])
    expect(result.unreadable[0]?.reason).toMatch(/mapping|yaml/i)
  })
})

describe('a pull request that edits an entry it did not write', () => {
  const path = `${ENTRIES_DIR}/use-query-hook.md`

  it('promotes nothing, because editing a file is not proposing the claim in it', async () => {
    // A formatting sweep, a licence header, a term renamed across `entries/`. Whoever merges it
    // never read the claim, and `reviewed.by` would name them as having approved it.
    const dir = store()
    writeEntry(dir, entry('use-query-hook'))
    mergedPr(7)
    commits.set(7, ['sha1'])
    filesAt.set('sha1', touched([path, 'modified']))
    landed.set(7, touched([path, 'modified']))

    const result = await reconcile(config(dir))

    expect(result.promoted).toEqual([])
    expect(result.declined).toEqual([])
    expect(result.missingLocally).toEqual([])
    expect(loadEntry(dir, 'use-query-hook').entry?.status).toBe('provisional')
  })

  it('is not reported as a quiet proposal once it has gone quiet', async () => {
    // The open path asks the same question, so the narrowing has to reach it too: a sweep
    // nobody has merged is not a proposal waiting on a reviewer.
    const dir = store()
    pulls = [
      {
        number: 7,
        state: 'open',
        merged_at: null,
        updated_at: '2026-04-01T10:00:00Z',
        html_url: 'https://github.com/org/lore/pull/7',
        assignees: [{ login: 'adam' }],
        merged_by: null,
      },
    ]
    commits.set(7, ['sha1'])
    filesAt.set('sha1', touched([path, 'modified']))
    landed.set(7, touched([path, 'modified']))

    const result = await reconcile(config(dir), { now: new Date('2026-05-01T10:00:00Z') })

    expect(result.stale).toEqual([])
  })
})

describe('an entry file that arrives as a rename', () => {
  const fresh = `${ENTRIES_DIR}/use-query-hook.md`
  const retired = `${ENTRIES_DIR}/old-fetch-rule.md`

  it('is promoted, because the path it lands at is an id nobody has reviewed', async () => {
    // Retiring an entry and replacing it in one pull request. GitHub pairs the deletion with
    // the addition and reports the pair as a single `renamed` row naming the new path — the
    // retired one gets no row of its own — so the new entry appears as `added` nowhere.
    // Dropping it leaves a claim that merged and never fires.
    const dir = store()
    writeEntry(dir, entry('use-query-hook'))
    mergedPr(7)
    commits.set(7, ['sha1'])
    filesAt.set('sha1', touched([fresh, 'renamed']))
    landed.set(7, touched([fresh, 'renamed']))

    const result = await reconcile(config(dir))

    expect(result.promoted.map((p) => p.id)).toEqual(['use-query-hook'])
    expect(result.declined).toEqual([])
    expect(loadEntry(dir, 'use-query-hook').entry?.status).toBe('active')
  })

  it('is reported as behind rather than rejected when the two reads disagree', async () => {
    // The proposing commit is diffed against its own parent and the landed files against the
    // merge base, so one commit adding the entry and a later one deleting something similar
    // makes the same file `added` in one read and `renamed` in the other. A predicate that
    // took only `added` would count it in the first and not the second, and `reconcile` reads
    // that difference as a reviewer's deletion — a permanent rejection of a live entry.
    //
    // The later commit has no fixture because only the first is ever fetched; it exists in the
    // landed read, as the deletion the rename is paired with.
    const dir = store()
    mergedPr(7)
    commits.set(7, ['sha1', 'sha2'])
    filesAt.set('sha1', touched(fresh))
    landed.set(7, touched([fresh, 'renamed']))

    const result = await reconcile(config(dir))

    expect(result.declined).toEqual([])
    expect(result.missingLocally).toEqual(['use-query-hook'])
    expect(existsSync(join(dir, REJECTED_DIR))).toBe(false)
  })
})

describe('a proposal the reviewer emptied only in part', () => {
  it('promotes what survived and records only what went', async () => {
    // The subtraction with a non-empty landed list: `kept` is in both reads, `cut` only in the
    // proposing commit. Getting the predicate wrong on either side moves a file between these
    // two outcomes, and one of them is permanent.
    const dir = store()
    const kept = `${ENTRIES_DIR}/use-query-hook.md`
    const cut = `${ENTRIES_DIR}/scratch.md`
    writeEntry(dir, entry('use-query-hook'))
    mergedPr(7)
    commits.set(7, ['sha1'])
    filesAt.set('sha1', touched(kept, cut))
    landed.set(7, touched(kept))
    contentAt.set(`${cut}@sha1`, serialize(entry('scratch')))

    const result = await reconcile(config(dir))

    expect(result.promoted.map((p) => p.id)).toEqual(['use-query-hook'])
    expect(result.declined.map((d) => d.id)).toEqual(['scratch'])
    expect(result.missingLocally).toEqual([])
  })
})

describe('an entry that reached the default branch while its proposal was open', () => {
  const path = `${ENTRIES_DIR}/use-query-hook.md`

  it('is reported as behind rather than rejected, because it is there at head', async () => {
    // The proposing commit adds the entry; the same entry then reaches the default branch
    // another way — committed directly, which the spec expects and leaves provisional — and
    // the author merges the default branch in. The merge base now has the file, so the landed
    // diff calls it `modified`. Recognition is right to pass over a modification, but the
    // landed read answers a second question — is the path there at head — and to that one the
    // answer is yes. Getting it wrong writes a permanent rejection of a live entry.
    const dir = store()
    mergedPr(7)
    commits.set(7, ['sha1'])
    filesAt.set('sha1', touched(path))
    landed.set(7, touched([path, 'modified']))

    const result = await reconcile(config(dir))

    expect(result.declined).toEqual([])
    expect(result.missingLocally).toEqual(['use-query-hook'])
    expect(existsSync(join(dir, REJECTED_DIR))).toBe(false)
  })
})
