import { beforeEach, describe, expect, it, vi } from 'vitest'

class FakeGhError extends Error {}

const calls: string[][] = []
let page: unknown[] = []
/** Commit shas per pull request, the files each commit touched, and the base-to-head diff. */
const commits = new Map<number, string[]>()
const filesAt = new Map<string, { filename: string; status?: string }[]>()
const landed = new Map<number, { filename: string; status?: string }[]>()

function prNumber(endpoint: string): number {
  return Number(/\/pulls\/(\d+)\//.exec(endpoint)?.[1])
}

vi.mock('../src/gh.js', () => ({
  GhError: FakeGhError,
  gh: async (args: readonly string[]) => {
    const endpoint = args[1] ?? ''
    calls.push([...args])
    if (endpoint.endsWith('/commits')) return commits.get(prNumber(endpoint)) ?? []
    const at = /\/commits\/(.+)$/.exec(endpoint)
    if (at) return filesAt.get(at[1] as string) ?? []
    return [page]
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

function raw(number: number, ref: string): unknown {
  return {
    number,
    state: 'closed',
    merged_at: '2026-04-01T10:00:00Z',
    updated_at: '2026-04-01T10:00:00Z',
    html_url: `https://github.com/org/lore/pull/${number}`,
    assignees: [{ login: 'sarah' }],
    merged_by: { login: 'adam' },
    head: { ref },
  }
}

beforeEach(() => {
  calls.length = 0
  page = []
  commits.clear()
  filesAt.clear()
  landed.clear()
})

describe('the pull request list is not filtered by branch', () => {
  it('returns one opened by hand alongside one the tool proposed', async () => {
    // Whether a pull request is a proposal is decided on its files, which no page carries,
    // so this list hands every pull request back and the caller filters where it is free.
    page = [raw(1, 'lore/propose/sarah-20260401'), raw(2, 'sarah/fix-the-query-hook')]

    const prs = await listPullRequests('org/lore')

    expect(prs.map((p) => p.number)).toEqual([1, 2])
    expect(prs[1]).toMatchObject({ merged: true, mergedBy: 'adam', mergedAt: '2026-04-01' })
    expect(calls[0]?.[1]).toBe('repos/org/lore/pulls?state=all&per_page=100')
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
