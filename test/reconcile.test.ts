import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../src/config.js'
import type { Entry } from '../src/entry.js'
import type { PrState } from '../src/github.js'
import { ENTRIES_DIR, REJECTED_DIR, rejectedIds, serialize, writeEntry } from '../src/store.js'
import { tempDir } from './tmp.js'

/**
 * The half of GitHub `reconcile` asks about: which proposals exist, what each proposed, and
 * what each landed. A file the reviewer deleted is proposed but not landed, which is how
 * GitHub's own pull request diff reports it.
 */
const prs: PrState[] = []
const proposals = new Map<number, { commit?: string; files: string[] }>()
const landed = new Map<number, string[]>()
const atCommit = new Map<string, string>()
/** Per-pull-request fetches, so a test can assert one was never made. */
const fetched: string[] = []

vi.mock('../src/github.js', () => ({
  repoFromCheckout: async () => 'org/lore',
  listPullRequests: async () => ({ prs, complete: true }),
  pullRequest: async (_repo: string, number: number) => prs.find((p) => p.number === number),
  proposedFiles: async (_repo: string, number: number) => {
    fetched.push(`proposed:${number}`)
    const proposed = proposals.get(number)?.files ?? []
    const survived = landed.get(number) ?? []
    return {
      ...proposals.get(number),
      files: [...new Set([...proposed, ...survived])],
      landed: survived,
    }
  },
  proposingCommitFiles: async (_repo: string, number: number) => {
    fetched.push(`proposing:${number}`)
    return proposals.get(number) ?? { files: [] }
  },
  landedFiles: async (_repo: string, number: number) => {
    fetched.push(`landed:${number}`)
    return landed.get(number) ?? []
  },
  fileAtRef: async (_repo: string, path: string, ref: string) => atCommit.get(`${ref}:${path}`),
}))

// The watermark is the bound, not the behaviour under test here, and unmocked it would reach
// for `gh`. `reconcile-over-gh.test.ts` is where what it does to the fetch is proved.
vi.mock('../src/state.js', () => ({
  readState: async () => undefined,
  writeState: async () => true,
}))

const { reconcile } = await import('../src/reconcile.js')

function entry(id: string, overrides: Partial<Entry> = {}): Entry {
  return {
    id,
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

function config(destination: string): Config {
  return { destination, reviewers: ['abram'], experts: [], budget: { seats: [], pools: [] } }
}

/** A merged proposal of one candidate, whose text is readable at the proposing commit. */
function proposeOne(id: string, number = 7): void {
  const path = `${ENTRIES_DIR}/${id}.md`
  proposals.set(number, { commit: 'c0ffee', files: [path] })
  atCommit.set(`c0ffee:${path}`, serialize(entry(id)))
  prs.push({
    number,
    state: 'closed',
    merged: true,
    mergedBy: 'adam',
    mergedAt: '2026-04-01',
    updatedAt: '2026-04-01',
    updatedAtInstant: '2026-04-01T10:00:00Z',
    assignees: ['adam'],
    url: `https://github.com/org/lore/pull/${number}`,
  })
}

/** An open pull request, last touched `daysAgo` before the clock the tests reconcile against. */
function openPr(number: number, daysAgo: number): void {
  const at = new Date(Date.parse(NOW) - daysAgo * 86_400_000).toISOString().slice(0, 10)
  prs.push({
    number,
    state: 'open',
    merged: false,
    updatedAt: at,
    updatedAtInstant: `${at}T10:00:00Z`,
    assignees: ['sarah'],
    url: `https://github.com/org/lore/pull/${number}`,
  })
}

const NOW = '2026-04-20'

beforeEach(() => {
  prs.length = 0
  proposals.clear()
  landed.clear()
  atCommit.clear()
  fetched.length = 0
})

describe('a deleted candidate is recorded as rejected', () => {
  it('writes a record naming who rejected it, in which pull request, and what it said', async () => {
    const dir = tempDir('igor-reconcile-')
    proposeOne('use-query-hook')

    const result = await reconcile(config(dir))

    expect(result.declined.map((d) => d.id)).toEqual(['use-query-hook'])
    expect(result.missingLocally).toEqual([])
    const record = readFileSync(join(dir, REJECTED_DIR, 'use-query-hook.md'), 'utf8')
    expect(record).toContain('by: adam')
    expect(record).toContain('pr: 7')
    expect(record).toContain('at: 2026-04-01')
    expect(record).toContain('Fetch with the shared query hook')
    expect(record).toContain('Delete this file to un-reject')
    expect(rejectedIds(dir)).toEqual(new Set(['use-query-hook']))
  })

  it('records the id even where the candidate text cannot be read back', async () => {
    const dir = tempDir('igor-reconcile-')
    proposeOne('use-query-hook')
    atCommit.clear()

    await reconcile(config(dir))

    expect(rejectedIds(dir)).toEqual(new Set(['use-query-hook']))
  })

  it('leaves a record already written alone, and stops reporting it', async () => {
    const dir = tempDir('igor-reconcile-')
    proposeOne('use-query-hook')
    await reconcile(config(dir))

    const file = join(dir, REJECTED_DIR, 'use-query-hook.md')
    const annotated = `${readFileSync(file, 'utf8')}\nAgreed at standup.\n`
    writeFileSync(file, annotated, 'utf8')

    const second = await reconcile(config(dir))

    expect(second.declined).toEqual([])
    expect(readFileSync(file, 'utf8')).toBe(annotated)
  })

  it('never rejects what the pull request landed, whatever the store looks like now', async () => {
    const dir = tempDir('igor-reconcile-')
    proposeOne('use-query-hook')
    landed.set(7, [`${ENTRIES_DIR}/use-query-hook.md`])

    // Absent locally reads two ways — a checkout that has not pulled, and an entry promoted
    // long ago and retired since. Neither is a reviewer's deletion, and the landed diff says
    // so however the destination has changed in the meantime.
    const result = await reconcile(config(dir))

    expect(result.declined).toEqual([])
    expect(result.missingLocally).toEqual(['use-query-hook'])
    expect(existsSync(join(dir, REJECTED_DIR))).toBe(false)
  })

  it('rejects nothing when the pull request was closed without merging', async () => {
    const dir = tempDir('igor-reconcile-')
    proposeOne('use-query-hook')
    prs[0]!.merged = false

    const result = await reconcile(config(dir))

    expect(result.declined).toEqual([])
    expect(result.deferred).toEqual([7])
    expect(rejectedIds(dir)).toEqual(new Set())
  })

  it('promotes what survived and rejects only what was deleted', async () => {
    const dir = tempDir('igor-reconcile-')
    const kept = `${ENTRIES_DIR}/keep-migrations-reversible.md`
    proposeOne('use-query-hook')
    proposals.get(7)!.files.push(kept)
    atCommit.set(`c0ffee:${kept}`, serialize(entry('keep-migrations-reversible')))
    writeEntry(dir, entry('keep-migrations-reversible'))
    landed.set(7, [kept])

    const result = await reconcile(config(dir))

    expect(result.promoted.map((p) => p.id)).toEqual(['keep-migrations-reversible'])
    expect(result.declined.map((d) => d.id)).toEqual(['use-query-hook'])
  })

  it('forgets the rejection once a person deletes the record', async () => {
    const dir = tempDir('igor-reconcile-')
    proposeOne('use-query-hook')
    await reconcile(config(dir))

    rmSync(join(dir, REJECTED_DIR, 'use-query-hook.md'))

    expect(rejectedIds(dir)).toEqual(new Set())
  })
})

describe('a proposal is recognized by the entry files it adds', () => {
  it('promotes a pull request nothing of ours opened, on whatever branch', async () => {
    const dir = tempDir('igor-reconcile-')
    // Nothing about the branch reaches `reconcile`: `PrState` carries no ref, because the list
    // is not filtered by one. A hand-made pull request is a proposal on the entries it adds.
    proposeOne('use-query-hook')
    writeEntry(dir, entry('use-query-hook'))

    const result = await reconcile(config(dir))

    expect(result.promoted.map((p) => p.id)).toEqual(['use-query-hook'])
  })

  it('ignores a merged pull request that adds no entry file', async () => {
    const dir = tempDir('igor-reconcile-')
    // A markdown file outside the entry path shares no namespace with an entry: before the
    // path test, `docs/use-query-hook.md` named the entry `use-query-hook`.
    writeEntry(dir, entry('use-query-hook'))
    proposals.set(7, { commit: 'c0ffee', files: ['README.md', 'docs/use-query-hook.md'] })
    prs.push({
      number: 7,
      state: 'closed',
      merged: true,
      mergedBy: 'adam',
      mergedAt: '2026-04-01',
      updatedAt: '2026-04-01',
      updatedAtInstant: '2026-04-01T10:00:00Z',
      assignees: ['adam'],
      url: 'https://github.com/org/lore/pull/7',
    })

    const result = await reconcile(config(dir))

    expect(result.promoted).toEqual([])
    expect(result.declined).toEqual([])
    expect(result.missingLocally).toEqual([])
    expect(rejectedIds(dir)).toEqual(new Set())
  })

  it('does not report a pull request closed unmerged that proposed no entry', async () => {
    const dir = tempDir('igor-reconcile-')
    proposals.set(7, { commit: 'c0ffee', files: ['src/cli.ts'] })
    prs.push({
      number: 7,
      state: 'closed',
      merged: false,
      updatedAt: '2026-04-01',
      updatedAtInstant: '2026-04-01T10:00:00Z',
      assignees: [],
      url: 'https://github.com/org/lore/pull/7',
    })

    expect((await reconcile(config(dir))).deferred).toEqual([])
  })

  it('reconciles a merge that landed no entry file at all, rejecting every candidate', async () => {
    const dir = tempDir('igor-reconcile-')
    const ids = ['use-query-hook', 'keep-migrations-reversible']
    proposals.set(7, { commit: 'c0ffee', files: ids.map((id) => `${ENTRIES_DIR}/${id}.md`) })
    for (const id of ids) {
      atCommit.set(`c0ffee:${ENTRIES_DIR}/${id}.md`, serialize(entry(id)))
    }
    // The reviewer deleted both, so the merge adds and modifies nothing under `entries/`.
    landed.set(7, [])
    prs.push({
      number: 7,
      state: 'closed',
      merged: true,
      mergedBy: 'adam',
      mergedAt: '2026-04-01',
      updatedAt: '2026-04-01',
      updatedAtInstant: '2026-04-01T10:00:00Z',
      assignees: ['adam'],
      url: 'https://github.com/org/lore/pull/7',
    })

    const result = await reconcile(config(dir))

    expect(result.declined.map((d) => d.id).sort()).toEqual([
      'keep-migrations-reversible',
      'use-query-hook',
    ])
    expect(result.promoted).toEqual([])
    expect(rejectedIds(dir)).toEqual(
      new Set(['keep-migrations-reversible', 'use-query-hook']),
    )
  })
})

describe('an open pull request costs a fetch only once it is quiet', () => {
  it('fetches nothing for a backlog of open pull requests inside the window', async () => {
    const dir = tempDir('igor-reconcile-')
    for (let n = 1; n <= 20; n += 1) openPr(n, 1)

    const result = await reconcile(config(dir), { now: new Date(NOW), staleAfterDays: 7 })

    expect(fetched).toEqual([])
    expect(result.stale).toEqual([])
  })

  it('fetches for the quiet one only, and drops it if it proposed no entry', async () => {
    const dir = tempDir('igor-reconcile-')
    for (let n = 1; n <= 20; n += 1) openPr(n, 1)
    openPr(99, 30)
    openPr(98, 30)
    const proposed = `${ENTRIES_DIR}/use-query-hook.md`
    proposals.set(99, { commit: 'c0ffee', files: [proposed] })
    landed.set(99, [proposed])
    proposals.set(98, { commit: 'deadbe', files: ['docs/architecture.md'] })
    landed.set(98, ['docs/architecture.md'])

    const result = await reconcile(config(dir), { now: new Date(NOW), staleAfterDays: 7 })

    // #99's diff settles it in one request. #98's diff shows no entry file, which could still
    // mean a proposal the reviewer emptied, so its proposing commit is asked too.
    expect(fetched).toEqual(['landed:99', 'landed:98', 'proposing:98'])
    expect(result.stale.map((s) => s.pr)).toEqual([99])
  })

  it('still reports a quiet proposal whose every candidate the reviewer has deleted', async () => {
    const dir = tempDir('igor-reconcile-')
    openPr(97, 30)
    proposals.set(97, { commit: 'c0ffee', files: [`${ENTRIES_DIR}/use-query-hook.md`] })
    landed.set(97, [])

    const result = await reconcile(config(dir), { now: new Date(NOW), staleAfterDays: 7 })

    expect(result.stale.map((s) => s.pr)).toEqual([97])
  })
})
