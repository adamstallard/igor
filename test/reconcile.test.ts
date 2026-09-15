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

vi.mock('../src/github.js', () => ({
  repoFromCheckout: async () => 'org/lore',
  listOpenedBy: async () => prs,
  proposedFiles: async (_repo: string, number: number) => proposals.get(number) ?? { files: [] },
  landedFiles: async (_repo: string, number: number) => landed.get(number) ?? [],
  fileAtRef: async (_repo: string, path: string, ref: string) => atCommit.get(`${ref}:${path}`),
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
    assignees: ['adam'],
    url: `https://github.com/org/lore/pull/${number}`,
  })
}

beforeEach(() => {
  prs.length = 0
  proposals.clear()
  landed.clear()
  atCommit.clear()
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
