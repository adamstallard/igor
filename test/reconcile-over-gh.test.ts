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

interface RawPull {
  number: number
  state: 'open' | 'closed'
  merged_at: string | null
  updated_at: string
  html_url: string
  assignees: { login: string }[]
  merged_by: { login: string } | null
}

const commits = new Map<number, string[]>()
const filesAt = new Map<string, { filename: string; status?: string }[]>()
const landed = new Map<number, { filename: string; status?: string }[]>()
/** `path@ref` to file text, as `fileAtRef` reads it back. */
const contentAt = new Map<string, string>()
let pulls: RawPull[] = []
/** Every endpoint asked for, because a fetch bound can only be shown by counting requests. */
const requests: string[] = []
/** Reopened between two closed pages, which is the one thing that shrinks the closed set. */
let reopenAfterFirstPage: number | undefined
/** Opened between two closed pages, which shrinks nothing and must not stop the scan settling. */
let openDuringScan: number | undefined
/** Whether reading one pull request by number fails, as a rate limit makes it fail. */
let refuseSinglePullRequest = false
/** Whether the state branch refuses the write, as a ruleset or a missing push right does. */
let refuseStateWrite = false

function prNumber(endpoint: string): number {
  return Number(/\/pulls\/(\d+)\//.exec(endpoint)?.[1])
}

/**
 * A row as a page of the list endpoint actually carries it: `merged_by` is not null on it, it
 * is absent from the payload altogether. Only `pulls/{number}` answers who merged, and a fake
 * that handed the key back on a page would hide every consequence of that.
 */
function listRow(pull: RawPull): Omit<RawPull, 'merged_by'> {
  const { merged_by: _merger, ...page } = pull
  return page
}

/**
 * The list endpoint, answered per query rather than wholesale.
 *
 * A fake that returned every pull request whatever was asked for would let a query claiming a
 * bound keep the cost of one that has none, and the request count would prove nothing.
 */
function servePulls(query: URLSearchParams): unknown {
  // `state=open` is read with `--paginate --slurp`, which wraps the pages in an outer array.
  if (query.get('state') === 'open') return [pulls.filter((p) => p.state === 'open').map(listRow)]
  const closed = pulls
    .filter((p) => p.state === 'closed')
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
  const size = Number(query.get('per_page'))
  const page = Number(query.get('page'))
  const rows = closed.slice((page - 1) * size, page * size)
  if (page === 1 && reopenAfterFirstPage !== undefined) {
    const p = pulls.find((x) => x.number === reopenAfterFirstPage)
    if (p) p.state = 'open'
    reopenAfterFirstPage = undefined
  }
  if (page === 1 && openDuringScan !== undefined) {
    pulls.push({
      number: openDuringScan,
      state: 'open',
      merged_at: null,
      updated_at: '2026-06-01T10:00:00Z',
      html_url: `https://github.com/org/lore/pull/${openDuringScan}`,
      assignees: [],
      merged_by: null,
    })
    openDuringScan = undefined
  }
  return rows.map(listRow)
}

vi.mock('../src/gh.js', () => ({
  GhError: FakeGhError,
  gh: async (args: readonly string[]) => {
    const endpoint = args[1] ?? ''
    requests.push(endpoint)
    const list = /^repos\/org\/lore\/pulls\?(.+)$/.exec(endpoint)
    if (list) return servePulls(new URLSearchParams(list[1] as string))
    const one = /^repos\/org\/lore\/pulls\/(\d+)$/.exec(endpoint)
    if (one) {
      if (refuseSinglePullRequest) throw new FakeGhError('rate limited')
      const found = pulls.find((p) => p.number === Number(one[1]))
      if (found === undefined) throw new FakeGhError(`no such pull request: ${endpoint}`)
      return found
    }
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
  ghPaginated: async (args: readonly string[]) => {
    requests.push(args[1] ?? '')
    return landed.get(prNumber(args[1] ?? '')) ?? []
  },
}))

/** The watermark, in memory: what it does to the fetch is the point, not where it is kept. */
let mark: unknown
vi.mock('../src/state.js', () => ({
  readState: async () => mark,
  writeState: async (_repo: string, _path: string, value: unknown) => {
    if (refuseStateWrite) throw new FakeGhError('protected branch')
    mark = value
    return true
  },
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
  requests.length = 0
  mark = undefined
  reopenAfterFirstPage = undefined
  openDuringScan = undefined
  refuseSinglePullRequest = false
  refuseStateWrite = false
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

/** A pull request merged on `day` that proposes nothing — an ordinary change to the repository. */
function mergedOn(number: number, day: string): void {
  pulls.push({
    number,
    state: 'closed',
    merged_at: `${day}T10:00:00Z`,
    updated_at: `${day}T10:00:00Z`,
    html_url: `https://github.com/org/lore/pull/${number}`,
    assignees: [{ login: 'adam' }],
    merged_by: { login: 'adam' },
  })
  commits.set(number, [`sha${number}`])
  filesAt.set(`sha${number}`, touched('docs/architecture.md'))
  landed.set(number, touched('docs/architecture.md'))
}

function dayOf(n: number): string {
  return new Date(Date.parse('2026-01-01T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
}

const listQueries = (): string[] => requests.filter((e) => /^repos\/org\/lore\/pulls\?/.test(e))
const perPullRequest = (): string[] => requests.filter((e) => !/^repos\/org\/lore\/pulls\?/.test(e))

describe('what a sweep costs a destination with a long history', () => {
  it('reads the whole of it where nothing says any of it has been reconciled', async () => {
    // The state this fixes. Nothing here is a proposal, and it still costs three requests per
    // pull request that has ever been merged, on every push to the default branch.
    const dir = store()
    for (let n = 1; n <= 250; n += 1) mergedOn(n, dayOf(n))

    const result = await reconcile(config(dir))

    // One page of open, three of closed, and the open page again — a multi-page closed scan
    // has to rule out a pull request having reopened under it before it can be vouched for.
    expect(listQueries().length).toBe(5)
    expect(perPullRequest().length).toBe(750)
    expect(result.scannedSince).toBeUndefined()
  })

  it('reads one page and two pull requests where the watermark says the rest is settled', async () => {
    const dir = store()
    for (let n = 1; n <= 250; n += 1) mergedOn(n, dayOf(n))
    mark = { closedSeen: `${dayOf(248)}T10:00:00Z` }
    requests.length = 0

    const result = await reconcile(config(dir))

    // Sorted by activity, newest first, so the page the scan stops on is the first one.
    expect(listQueries()).toEqual([
      'repos/org/lore/pulls?state=open&per_page=100',
      'repos/org/lore/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=1',
    ])
    expect(perPullRequest()).toEqual([
      'repos/org/lore/pulls/250/files?per_page=100',
      'repos/org/lore/pulls/250/commits',
      'repos/org/lore/commits/sha250',
      'repos/org/lore/pulls/249/files?per_page=100',
      'repos/org/lore/pulls/249/commits',
      'repos/org/lore/commits/sha249',
    ])
    expect(result.scannedSince).toBe(`${dayOf(248)}T10:00:00Z`)
  })

  it('reads every open pull request whatever the watermark says', async () => {
    // The open half is bounded by the review backlog and by nothing else. Hiding an old quiet
    // proposal behind the watermark would silence the escalation it exists to raise.
    const dir = store()
    const path = `${ENTRIES_DIR}/use-query-hook.md`
    mark = { closedSeen: '2026-06-01T00:00:00Z' }
    pulls.push({
      number: 5,
      state: 'open',
      merged_at: null,
      updated_at: '2026-01-05T10:00:00Z',
      html_url: 'https://github.com/org/lore/pull/5',
      assignees: [{ login: 'adam' }],
      merged_by: null,
    })
    commits.set(5, ['sha5'])
    filesAt.set('sha5', touched(path))
    landed.set(5, touched(path))

    const result = await reconcile(config(dir), { now: new Date('2026-06-10T00:00:00Z') })

    expect(result.stale.map((s) => s.pr)).toEqual([5])
  })
})

describe('how far the watermark moves', () => {
  it('advances to the newest pull request the run settled', async () => {
    const dir = store()
    mergedOn(7, '2026-04-01')
    mergedOn(8, '2026-04-02')

    await reconcile(config(dir))

    expect(mark).toEqual({ closedSeen: '2026-04-02T10:00:00Z' })
  })

  it('carries a pull request it wrote for by number, and drops it once the write has landed', async () => {
    // Promoting writes into the checkout and something else commits it — the destination's
    // workflow in a later step, or nobody, if the run died in between. So that pull request is
    // read again next run, by number, until it produces nothing: the entry is already active
    // and the second pass is a no-op. The floor moves regardless, which is the point of
    // carrying it rather than holding the floor behind it.
    const dir = store()
    const path = `${ENTRIES_DIR}/use-query-hook.md`
    writeEntry(dir, entry('use-query-hook'))
    mergedOn(7, '2026-04-01')
    mergedOn(8, '2026-04-02')
    filesAt.set('sha8', touched(path))
    landed.set(8, touched(path))

    const first = await reconcile(config(dir))

    expect(first.promoted.map((p) => p.id)).toEqual(['use-query-hook'])
    expect(mark).toEqual({ closedSeen: '2026-04-02T10:00:00Z', pending: [8] })

    requests.length = 0
    const second = await reconcile(config(dir))

    expect(second.promoted).toEqual([])
    expect(requests).toContain('repos/org/lore/pulls/8')
    expect(requests).toContain('repos/org/lore/pulls/8/files?per_page=100')
    // #7 is below the floor and is not read again, which is the bound doing its work.
    expect(requests).not.toContain('repos/org/lore/pulls/7/files?per_page=100')
    expect(mark).toEqual({ closedSeen: '2026-04-02T10:00:00Z' })
  })

  it('carries an unreadable entry, so the promotion it is owed survives the fix', async () => {
    // The floor passes this pull request the moment it is examined. Without carrying it by
    // number, fixing the frontmatter would promote nothing ever again — and the report naming
    // the broken file would stop appearing after the single run that first saw it.
    const dir = store()
    const path = `${ENTRIES_DIR}/use-query-hook.md`
    writeFileSync(join(dir, path), '---\nclaim: Use the hook: it is better\n---\n\nBody.\n', 'utf8')
    mergedOn(7, '2026-04-01')
    filesAt.set('sha7', touched(path))
    landed.set(7, touched(path))

    const first = await reconcile(config(dir))
    expect(first.unreadable.map((u) => u.id)).toEqual(['use-query-hook'])
    expect(mark).toEqual({ closedSeen: '2026-04-01T10:00:00Z', pending: [7] })

    // Still broken: it is still named, where before it was named once and then never again.
    expect((await reconcile(config(dir))).unreadable.map((u) => u.id)).toEqual(['use-query-hook'])

    writeEntry(dir, entry('use-query-hook'))
    const fixed = await reconcile(config(dir))

    expect(fixed.promoted.map((p) => p.id)).toEqual(['use-query-hook'])
    expect(loadEntry(dir, 'use-query-hook').entry?.status).toBe('active')
  })

  it('carries an entry the checkout was behind on, so pulling still promotes it', async () => {
    const dir = store()
    const path = `${ENTRIES_DIR}/use-query-hook.md`
    mergedOn(7, '2026-04-01')
    filesAt.set('sha7', touched(path))
    landed.set(7, touched(path))

    const first = await reconcile(config(dir))
    expect(first.missingLocally).toEqual(['use-query-hook'])

    writeEntry(dir, entry('use-query-hook'))
    const second = await reconcile(config(dir))

    expect(second.promoted.map((p) => p.id)).toEqual(['use-query-hook'])
  })

  it('keeps carrying a pull request the API would not hand over just now', async () => {
    // A failed read is not a pull request that is gone. Dropping it on a rate limit or a 502
    // abandons the promotion it is owed, and the floor has already passed it.
    const dir = store()
    const path = `${ENTRIES_DIR}/use-query-hook.md`
    mergedOn(7, '2026-04-01')
    filesAt.set('sha7', touched(path))
    landed.set(7, touched(path))

    expect((await reconcile(config(dir))).missingLocally).toEqual(['use-query-hook'])
    expect(mark).toEqual({ closedSeen: '2026-04-01T10:00:00Z', pending: [7] })

    refuseSinglePullRequest = true
    await reconcile(config(dir))
    expect(mark).toEqual({ closedSeen: '2026-04-01T10:00:00Z', pending: [7] })

    refuseSinglePullRequest = false
    writeEntry(dir, entry('use-query-hook'))
    expect((await reconcile(config(dir))).promoted.map((p) => p.id)).toEqual(['use-query-hook'])
  })

  it('is not stopped from ever settling by ordinary pull requests being opened', async () => {
    // The confirming read is looking for one that left the closed set. A pull request merely
    // opened is numbered above everything the scan saw, and counting it would strand the
    // bootstrap run — no floor is written, so the next run is another full history read.
    const dir = store()
    for (let n = 1; n <= 150; n += 1) mergedOn(n, dayOf(n))
    openDuringScan = 999

    await reconcile(config(dir))

    expect(mark).toEqual({ closedSeen: `${dayOf(150)}T10:00:00Z` })
  })

  it('moves nothing over a multi-page scan a pull request reopened under', async () => {
    // Offset paging over a set that can shrink: #100 reopening pulls every row behind it up
    // one, so the row on the page boundary is returned by no page. Marking the newest row seen
    // would put that pull request permanently below the floor, unexamined and unpromotable.
    const dir = store()
    const path = `${ENTRIES_DIR}/use-query-hook.md`
    writeEntry(dir, entry('use-query-hook'))
    for (let n = 1; n <= 150; n += 1) {
      mergedOn(n, dayOf(n))
      if (n === 50) {
        filesAt.set('sha50', touched(path))
        landed.set(50, touched(path))
      }
    }
    reopenAfterFirstPage = 100

    const first = await reconcile(config(dir))

    expect(first.promoted).toEqual([])
    expect(mark).toBeUndefined()

    const second = await reconcile(config(dir))

    expect(second.promoted.map((p) => p.id)).toEqual(['use-query-hook'])
  })

  it('advances past a closed unmerged proposal, which is settled the moment it is seen', async () => {
    // Deferral is a report rather than a record, and a pull request closed without merging
    // never changes again. Holding the mark behind one would rescan everything newer forever.
    const dir = store()
    const path = `${ENTRIES_DIR}/use-query-hook.md`
    pulls.push({
      number: 7,
      state: 'closed',
      merged_at: null,
      updated_at: '2026-04-01T10:00:00Z',
      html_url: 'https://github.com/org/lore/pull/7',
      assignees: [{ login: 'adam' }],
      merged_by: null,
    })
    commits.set(7, ['sha7'])
    filesAt.set('sha7', touched(path))
    landed.set(7, touched(path))

    const first = await reconcile(config(dir))

    expect(first.deferred).toEqual([7])
    expect(mark).toEqual({ closedSeen: '2026-04-01T10:00:00Z' })
    expect((await reconcile(config(dir))).deferred).toEqual([])
  })
})

describe('what a run says about work it is carrying', () => {
  const path = `${ENTRIES_DIR}/use-query-hook.md`

  it('names a carried pull request it could not read back', async () => {
    // Below the floor and readable by nobody else: if the report does not name it, the run
    // that owes a promotion is indistinguishable from the run that had nothing to do.
    const dir = store()
    mergedOn(7, '2026-04-01')
    filesAt.set('sha7', touched(path))
    landed.set(7, touched(path))
    await reconcile(config(dir))
    writeEntry(dir, entry('use-query-hook'))

    refuseSinglePullRequest = true
    const refused = await reconcile(config(dir))

    expect(refused.carried).toEqual([{ pr: 7, reason: 'pull-request' }])
    expect(refused.promoted).toEqual([])
    expect(refused.missingLocally).toEqual([])
  })

  it('names a merged proposal it could not attribute', async () => {
    const dir = store()
    writeEntry(dir, entry('use-query-hook'))
    mergedOn(7, '2026-04-01')
    filesAt.set('sha7', touched(path))
    landed.set(7, touched(path))
    refuseSinglePullRequest = true

    const result = await reconcile(config(dir))

    expect(result.carried).toEqual([{ pr: 7, reason: 'merger' }])
    expect(result.promoted).toEqual([])
  })
})

describe('what the cap on carried pull requests drops', () => {
  /** A merged proposal of one entry whose file has not reached this checkout yet. */
  function behind(number: number, day: string, id: string): void {
    const path = `${ENTRIES_DIR}/${id}.md`
    pulls.push({
      number,
      state: 'closed',
      merged_at: `${day}T10:00:00Z`,
      updated_at: `${day}T10:00:00Z`,
      html_url: `https://github.com/org/lore/pull/${number}`,
      assignees: [{ login: 'adam' }],
      merged_by: { login: 'adam' },
    })
    commits.set(number, [`sha${number}`])
    filesAt.set(`sha${number}`, touched(path))
    landed.set(number, touched(path))
  }

  /** 100 proposals idle since January, and one merged long after all of them. */
  function overTheCap(): void {
    for (let k = 0; k < 100; k += 1) behind(200 + k, dayOf(k + 1), `idle-${200 + k}`)
    behind(1, dayOf(200), 'merged-today')
  }

  it('drops the oldest standing condition, not the lowest number', async () => {
    const dir = store()
    overTheCap()

    const first = await reconcile(config(dir))

    expect(first.missingLocally).toHaveLength(101)
    const state = mark as { closedSeen: string; pending: number[] }
    expect(state.pending).toHaveLength(100)
    expect(state.pending).toContain(1)
    expect(first.evicted).toEqual([200])
    // The floor is past every one of them, so `pending` is the only way back to any of them.
    expect(state.closedSeen).toBe(`${dayOf(200)}T10:00:00Z`)
  })

  it('still promotes the low-numbered pull request merged today once the checkout catches up', async () => {
    // What ordering by number costs: #1 merged in July is sliced off in favour of #200 idle
    // since January, the floor moves past it, and no later run has anything left to find it
    // with. The promotion is not deferred — it is gone.
    const dir = store()
    overTheCap()

    await reconcile(config(dir))
    writeEntry(dir, entry('merged-today'))
    const second = await reconcile(config(dir))

    expect(second.promoted.map((p) => p.id)).toEqual(['merged-today'])
    expect(loadEntry(dir, 'merged-today').entry?.status).toBe('active')
  })

  it('keeps today\u2019s merge when every carried number has gone unreadable', async () => {
    // A carry full of numbers nothing can read must not crowd out the pull request that just
    // merged. They have no date to rank by, so they rank last and drain out of the carry a
    // little at a time, rather than holding every slot against work that is provably live.
    const dir = store()
    for (let k = 0; k < 100; k += 1) behind(200 + k, dayOf(k + 1), `idle-${200 + k}`)
    await reconcile(config(dir))
    expect((mark as { pending: number[] }).pending).toHaveLength(100)

    // Answering 404 now: a transfer, a rename, or numbers that were never real.
    pulls = []
    behind(500, dayOf(200), 'merged-today')
    const second = await reconcile(config(dir))

    expect(second.missingLocally).toEqual(['merged-today'])
    expect((mark as { pending: number[] }).pending).toContain(500)

    writeEntry(dir, entry('merged-today'))
    const third = await reconcile(config(dir))

    expect(third.promoted.map((p) => p.id)).toEqual(['merged-today'])
  })

  it('does not name the same pull request as both carried and dropped', async () => {
    // One says the next run will retry it and the other says nothing ever will. Only the
    // second is true of a number the cap cut, so the first has to go.
    const dir = store()
    overTheCap()
    refuseSinglePullRequest = true

    const result = await reconcile(config(dir))

    expect(result.evicted.length).toBeGreaterThan(0)
    const stillCarried = new Set(result.carried.map((c) => c.pr))
    expect(result.evicted.filter((n) => stillCarried.has(n))).toEqual([])
  })

  it('drops nothing the next scan will hand back anyway', async () => {
    // A scan that cannot be vouched for moves no floor, so everything it found is still above
    // the old one and the next run reads it again. Only what the floor has passed is lost, and
    // the cap cutting a number is not by itself what loses it.
    const dir = store()
    mark = { closedSeen: '2026-01-01T10:00:00Z' }
    for (let k = 0; k < 102; k += 1) behind(200 + k, dayOf(k + 1), `idle-${200 + k}`)
    // Not a proposal, and the row that leaves the closed set mid-scan.
    mergedOn(999, dayOf(103))
    reopenAfterFirstPage = 999

    const first = await reconcile(config(dir))

    // One row hid behind the page boundary the reopen shifted, which is why the floor is stuck.
    expect(first.missingLocally.length).toBeGreaterThan(100)
    expect((mark as { closedSeen: string }).closedSeen).toBe('2026-01-01T10:00:00Z')
    expect(first.evicted).toEqual([])

    writeEntry(dir, entry('idle-200'))
    const second = await reconcile(config(dir))

    expect(second.promoted.map((p) => p.id)).toEqual(['idle-200'])
  })

  it('drops nothing when the destination refused the write', async () => {
    // The previous state document survives whole, so the carry was never truncated. Reporting
    // a permanent loss here sends someone to audit work the next run picks up by itself.
    const dir = store()
    overTheCap()
    refuseStateWrite = true

    const result = await reconcile(config(dir))

    expect(result.evicted).toEqual([])
    expect(mark).toBeUndefined()
  })
})

describe('who a promotion is attributed to', () => {
  const path = `${ENTRIES_DIR}/use-query-hook.md`

  /** A merged proposal whose merger and assignee are whoever is named. */
  function proposal(number: number, assignee: string, merger: string): void {
    pulls.push({
      number,
      state: 'closed',
      merged_at: '2026-04-01T10:00:00Z',
      updated_at: '2026-04-01T10:00:00Z',
      html_url: `https://github.com/org/lore/pull/${number}`,
      assignees: [{ login: assignee }],
      merged_by: { login: merger },
    })
    commits.set(number, [`sha${number}`])
    filesAt.set(`sha${number}`, touched(path))
    landed.set(number, touched(path))
  }

  it('names whoever merged, not whoever was assigned to review', async () => {
    const dir = store()
    writeEntry(dir, entry('use-query-hook'))
    proposal(7, 'sarah', 'abram')

    const result = await reconcile(config(dir))

    expect(result.promoted).toEqual([
      { id: 'use-query-hook', by: 'abram', at: '2026-04-01', pr: 7, mergerWasNotAssigned: true },
    ])
    expect(loadEntry(dir, 'use-query-hook').entry?.reviewed).toEqual({
      by: 'abram',
      at: '2026-04-01',
    })
  })

  it('reads the merger back for one the scan found, since no page carries it', async () => {
    const dir = store()
    writeEntry(dir, entry('use-query-hook'))
    proposal(7, 'sarah', 'abram')

    await reconcile(config(dir))

    expect(requests).toContain('repos/org/lore/pulls/7')
  })

  it('attributes a carried pull request exactly as the scan attributed it', async () => {
    // The divergence this fixes: the same merge, found two ways. Carrying re-reads the pull
    // request by number and has always been right; the scan had only the assignee to go on.
    const dir = store()
    writeEntry(dir, entry('use-query-hook'))
    proposal(7, 'sarah', 'abram')

    const scanned = await reconcile(config(dir))
    expect(mark).toEqual({ closedSeen: '2026-04-01T10:00:00Z', pending: [7] })

    // The floor has passed #7, so the second run reaches it through `pending` alone.
    writeEntry(dir, entry('use-query-hook'))
    const carried = await reconcile(config(dir))

    expect(carried.promoted).toEqual(scanned.promoted)
  })

  it('does not flag a merger who was assigned to review it', async () => {
    const dir = store()
    writeEntry(dir, entry('use-query-hook'))
    proposal(7, 'abram', 'abram')

    expect((await reconcile(config(dir))).promoted).toEqual([
      { id: 'use-query-hook', by: 'abram', at: '2026-04-01', pr: 7 },
    ])
  })

  it('leaves the promotion for the next run when it cannot ask who merged', async () => {
    // `reviewed.by` is written into the entry permanently and no later run revisits it, so a
    // run that could not reach `pulls/{number}` must not fall back to the assignee. Carrying
    // the number is what the floor already does for every other unfinished condition.
    const dir = store()
    writeEntry(dir, entry('use-query-hook'))
    proposal(7, 'sarah', 'abram')
    refuseSinglePullRequest = true

    const refused = await reconcile(config(dir))

    expect(refused.promoted).toEqual([])
    expect(loadEntry(dir, 'use-query-hook').entry?.status).toBe('provisional')
    expect(mark).toEqual({ closedSeen: '2026-04-01T10:00:00Z', pending: [7] })

    refuseSinglePullRequest = false
    const retried = await reconcile(config(dir))

    expect(retried.promoted.map((p) => p.by)).toEqual(['abram'])
  })
})

describe('what asking who merged costs', () => {
  it('costs nothing on a pull request that proposed no entry', async () => {
    // The bound #46 bought is on the scan, and the scan is mostly pull requests that are not
    // proposals at all. None of them is read back by number.
    const dir = store()
    for (let n = 1; n <= 50; n += 1) mergedOn(n, dayOf(n))

    await reconcile(config(dir))

    expect(perPullRequest().length).toBe(150)
    expect(requests.filter((e) => /^repos\/org\/lore\/pulls\/\d+$/.test(e))).toEqual([])
  })

  it('costs one request on a pull request that did propose one', async () => {
    const dir = store()
    const path = `${ENTRIES_DIR}/use-query-hook.md`
    writeEntry(dir, entry('use-query-hook'))
    mergedOn(7, '2026-04-01')
    filesAt.set('sha7', touched(path))
    landed.set(7, touched(path))

    await reconcile(config(dir))

    expect(perPullRequest()).toEqual([
      'repos/org/lore/pulls/7/files?per_page=100',
      'repos/org/lore/pulls/7/commits',
      'repos/org/lore/commits/sha7',
      'repos/org/lore/pulls/7',
    ])
  })
})
