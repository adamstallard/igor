import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakeGhError extends Error {}

const calls: string[][] = []
interface RawPull {
  number: number
  state: 'open' | 'closed'
  updated_at: string
}
let page: RawPull[] = []
/** Commit shas per pull request, the files each commit touched, and the base-to-head diff. */
const commits = new Map<number, string[]>()
const filesAt = new Map<string, { filename: string; status?: string }[]>()
const landed = new Map<number, { filename: string; status?: string }[]>()

function prNumber(endpoint: string): number {
  return Number(/\/pulls\/(\d+)\//.exec(endpoint)?.[1])
}

/** A pull request commented on between two page reads, which reorders the pages under them. */
let bumpAfterFirstPage: number | undefined

function day(n: number): string {
  return new Date(Date.parse('2026-01-01T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10)
}

/**
 * The list endpoint per query. Open is read with `--paginate --slurp`, so it comes back as
 * pages; closed is paged by hand, so it comes back as one page's worth of rows.
 */
function servePulls(query: URLSearchParams): unknown {
  if (query.get('state') === 'open') return [page.filter((p) => p.state === 'open')]
  const closed = page
    .filter((p) => p.state === 'closed')
    .sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at))
  const size = Number(query.get('per_page'))
  const n = Number(query.get('page'))
  const rows = closed.slice((n - 1) * size, n * size)
  if (n === 1 && bumpAfterFirstPage !== undefined) {
    const bumped = page.find((p) => p.number === bumpAfterFirstPage)
    if (bumped) bumped.updated_at = '2027-01-01T00:00:00Z'
  }
  return rows
}

vi.mock('../src/gh.js', () => ({
  GhError: FakeGhError,
  gh: async (args: readonly string[]) => {
    const endpoint = args[1] ?? ''
    calls.push([...args])
    if (endpoint.endsWith('/commits')) return commits.get(prNumber(endpoint)) ?? []
    const at = /\/commits\/(.+)$/.exec(endpoint)
    if (at) return filesAt.get(at[1] as string) ?? []
    return servePulls(new URLSearchParams(/\?(.+)$/.exec(endpoint)?.[1] ?? ''))
  },
  ghPaginated: async (args: readonly string[]) => landed.get(prNumber(args[1] ?? '')) ?? [],
}))

const { listPullRequests, proposedFiles } = await import('../src/github.js')

/** Both file endpoints report a status per file; `added` is the ordinary one. */
function touched(...files: (string | [string, string])[]): { filename: string; status?: string }[] {
  return files.map((f) =>
    typeof f === 'string' ? { filename: f, status: 'added' } : { filename: f[0], status: f[1] },
  )
}

function raw(number: number, ref: string, updatedAt = '2026-04-01T10:00:00Z'): RawPull {
  return {
    number,
    state: 'closed',
    merged_at: updatedAt,
    updated_at: updatedAt,
    html_url: `https://github.com/org/lore/pull/${number}`,
    assignees: [{ login: 'sarah' }],
    head: { ref },
  } as unknown as RawPull
}

beforeEach(() => {
  calls.length = 0
  page = []
  bumpAfterFirstPage = undefined
  commits.clear()
  filesAt.clear()
  landed.clear()
})

describe('the pull request list is not filtered by branch', () => {
  it('returns one opened by hand alongside one the tool proposed', async () => {
    // Whether a pull request is a proposal is decided on its files, which no page carries,
    // so this list hands every pull request back and the caller filters where it is free.
    page = [raw(1, 'lore/propose/sarah-20260401'), raw(2, 'sarah/fix-the-query-hook')]

    const { prs } = await listPullRequests('org/lore')

    expect(prs.map((p) => p.number)).toEqual([1, 2])
    expect(prs[1]).toMatchObject({ merged: true, mergedAt: '2026-04-01' })
    // A page says a pull request merged and not who merged it: `merged_by` is absent from the
    // list payload altogether, so a caller that needs the merger has to read it by number.
    expect(prs[1]?.mergedBy).toBeUndefined()
    expect(calls.map((c) => c[1])).toEqual([
      'repos/org/lore/pulls?state=open&per_page=100',
      'repos/org/lore/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=1',
    ])
  })
})

describe('the closed half of the list stops at a watermark', () => {
  it('asks for no page past the first one whose activity predates it', async () => {
    // 250 closed pull requests, one per day. `--paginate` would read all three pages before
    // returning anything, which is why the paging is by hand.
    page = Array.from({ length: 250 }, (_, i) =>
      raw(i + 1, `sarah/change-${i + 1}`, `${day(i + 1)}T10:00:00Z`),
    )

    const { prs, complete } = await listPullRequests('org/lore', `${day(248)}T10:00:00Z`)

    expect(prs.map((p) => p.number)).toEqual([250, 249])
    expect(complete).toBe(true)
    expect(calls.filter((c) => c[1]?.includes('state=closed')).length).toBe(1)
  })

  it('reads the whole history where there is no watermark yet', async () => {
    page = Array.from({ length: 250 }, (_, i) =>
      raw(i + 1, `sarah/change-${i + 1}`, `${day(i + 1)}T10:00:00Z`),
    )

    const { prs } = await listPullRequests('org/lore')

    expect(prs.length).toBe(250)
    expect(calls.filter((c) => c[1]?.includes('state=closed')).length).toBe(3)
  })

  it('hands a pull request back once where paging saw it twice', async () => {
    // Activity only ever moves a pull request up the ordering, so a comment landing mid-scan
    // pushes a later page down and repeats a row rather than skipping one, and the repeat has
    // to be dropped here. A pull request *leaving* the closed set does skip a row, which no
    // dedupe can recover — that one is caught by refusing to vouch for the scan.
    page = Array.from({ length: 150 }, (_, i) =>
      raw(i + 1, `sarah/change-${i + 1}`, `${day(i + 1)}T10:00:00Z`),
    )
    bumpAfterFirstPage = 10

    const { prs } = await listPullRequests('org/lore')

    expect(prs.map((p) => p.number)).toContain(51)
    expect(new Set(prs.map((p) => p.number)).size).toBe(prs.length)
  })
})

describe('what a pull request proposed', () => {
  it('sees an entry a later commit added, which is how a person writes one by hand', async () => {
    // Nobody hand-authoring a pull request puts the entry in the first commit by convention.
    // Reading only the proposing commit made promotion depend on the order someone committed in.
    commits.set(7, ['sha1', 'sha2'])
    filesAt.set('sha1', touched('README.md'))
    filesAt.set('sha2', touched('entries/use-query-hook.md'))
    landed.set(7, touched('README.md', 'entries/use-query-hook.md'))

    expect((await proposedFiles('org/lore', 7)).files).toContain('entries/use-query-hook.md')
  })

  it('still sees a candidate the reviewer deleted, which never landed', async () => {
    commits.set(8, ['shaA'])
    filesAt.set('shaA', touched('entries/a.md', 'entries/b.md'))
    landed.set(8, [])

    const proposal = await proposedFiles('org/lore', 8)

    expect(proposal.files.sort()).toEqual(['entries/a.md', 'entries/b.md'])
    expect(proposal.landed).toEqual([])
    expect(proposal.commit).toBe('shaA')
  })

  it('counts a file once when it was both proposed and landed', async () => {
    commits.set(9, ['shaB'])
    filesAt.set('shaB', touched('entries/a.md'))
    landed.set(9, touched('entries/a.md'))

    expect((await proposedFiles('org/lore', 9)).files).toEqual(['entries/a.md'])
  })
})

describe('a file the pull request did not add', () => {
  it('is not proposed, but an edited one is still there at head', async () => {
    // Two questions with two answers. A pull request that deletes an entry is retiring it and
    // one that edits an entry is changing a claim somebody already approved, so neither is
    // proposed — counting either would promote that entry under whoever merged. But `landed`
    // is asked something else, and the caller treats absence from it as a reviewer's deletion
    // and writes a permanent rejection, so it must keep the file the pull request only edited.
    const rows = touched(
      ['entries/retired.md', 'removed'],
      ['entries/swept.md', 'modified'],
      'entries/kept.md',
    )
    commits.set(10, ['shaC'])
    filesAt.set('shaC', rows)
    landed.set(10, rows)

    const proposal = await proposedFiles('org/lore', 10)

    expect(proposal.files).toEqual(['entries/kept.md'])
    expect(proposal.landed).toEqual(['entries/swept.md', 'entries/kept.md'])
  })
})
