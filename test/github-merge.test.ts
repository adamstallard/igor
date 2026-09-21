import { describe, expect, it, vi } from 'vitest'

class FakeGhError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

/** What each endpoint answers this test, and every call it was asked in the order it came. */
const calls: { args: string[]; body: unknown }[] = []
let answer: (endpoint: string, body: unknown) => unknown = () => null

vi.mock('../src/gh.js', () => ({
  GhError: FakeGhError,
  gh: async (args: readonly string[], input?: string) => {
    const body = input === undefined ? undefined : (JSON.parse(input) as unknown)
    calls.push({ args: [...args], body })
    return answer(args[1] ?? '', body)
  },
  ghPaginated: async () => [],
}))

const { commitOnBranch, createBranchWithFiles, mergeIntoBranch } = await import('../src/github.js')
const { GitHubCodeHost } = await import('../src/github-adapter.js')

function reset(): void {
  calls.length = 0
  answer = () => null
}

const method = (i: number): string | undefined => {
  const at = calls[i]?.args.indexOf('--method')
  return at === undefined || at < 0 ? undefined : calls[i]?.args[at + 1]
}

describe('asking the host to merge, rather than merging locally', () => {
  it('merges the base into the artifact branch and reports the commit', async () => {
    // The direction matters and is easy to get backwards: the base goes *into* the artifact.
    // Reversed, this merges unreviewed work into the default branch.
    reset()
    answer = () => ({ sha: 'mergesha' })

    expect(await mergeIntoBranch('o/r', 'igor/fix-7', 'main')).toEqual({
      outcome: 'merged',
      sha: 'mergesha',
    })
    expect(calls).toHaveLength(1)
    expect(calls[0]?.args[1]).toBe('repos/o/r/merges')
    expect(method(0)).toBe('POST')
    expect(calls[0]?.body).toMatchObject({ base: 'igor/fix-7', head: 'main' })
  })

  it('reads an empty body as nothing to bring in', async () => {
    // GitHub answers 204 with no body when the base is already an ancestor, and `gh` hands
    // an empty string back as null. Called a merge, that would report news every cycle.
    reset()
    answer = () => null
    expect(await mergeIntoBranch('o/r', 'igor/fix-7', 'main')).toEqual({ outcome: 'already-current' })
  })

  it('reads 409 as a conflict and every other failure as a fault', async () => {
    // The host reports a conflict rather than producing one, which is the whole reason this
    // is a write to the host and not a clone. But a caller that treated any failure as a
    // conflict would escalate a rate limit to a worker run.
    reset()
    answer = () => { throw new FakeGhError('gh: Merge conflict (HTTP 409)', 409) }
    expect(await mergeIntoBranch('o/r', 'igor/fix-7', 'main')).toEqual({ outcome: 'conflict' })

    answer = () => { throw new FakeGhError('gh: API rate limit exceeded (HTTP 403)', 403) }
    await expect(mergeIntoBranch('o/r', 'igor/fix-7', 'main')).rejects.toThrow('rate limit')
  })
})

describe('putting a resolution on a branch that already exists', () => {
  it('commits with both parents and moves the ref rather than creating one', async () => {
    // Both parents are load-bearing. A one-parent commit carrying the same content leaves the
    // merge base where it was, so the host recomputes the conflict and the artifact goes on
    // reporting that it cannot merge — a resolution that resolves nothing.
    reset()
    answer = (endpoint) => {
      if (endpoint.endsWith('/git/blobs')) return { sha: 'blobsha' }
      if (endpoint.endsWith('/git/trees')) return { sha: 'treesha' }
      if (endpoint.endsWith('/git/commits')) return { sha: 'commitsha' }
      return null
    }

    const sha = await commitOnBranch(
      'o/r',
      'igor/fix-7',
      ['headsha', 'basesha'],
      [{ path: 'src/a.ts', content: 'resolved\n' }],
      ['src/gone.ts'],
      'Merge main into igor/fix-7',
    )

    expect(sha).toBe('commitsha')
    expect(calls.map((c) => c.args[1])).toEqual([
      'repos/o/r/git/blobs',
      'repos/o/r/git/trees',
      'repos/o/r/git/commits',
      'repos/o/r/git/refs/heads/igor/fix-7',
    ])
    expect(calls[2]?.body).toMatchObject({ parents: ['headsha', 'basesha'], tree: 'treesha' })
    // A PATCH on the ref, never a POST to `git/refs`: the branch is there, and creating it is
    // the operation that would fail — or, worse, put the resolution somewhere else.
    expect(method(3)).toBe('PATCH')
    expect(calls[3]?.body).toEqual({ sha: 'commitsha' })
    // Laid over the artifact's own tree, so a file neither side touched is still there — and
    // a path the base deleted is dropped from it with a null sha. Left in, that path would be
    // a revert of the base's deletion the moment the artifact merges, because this commit
    // names the base as a parent.
    expect(calls[1]?.body).toMatchObject({
      base_tree: 'headsha',
      tree: [
        { path: 'src/a.ts', mode: '100644', type: 'blob', sha: 'blobsha' },
        { path: 'src/gone.ts', mode: '100644', type: 'blob', sha: null },
      ],
    })
  })

  it('refuses a commit with no parent rather than orphaning the branch', async () => {
    reset()
    await expect(commitOnBranch('o/r', 'b', [], [{ path: 'a', content: 'x' }], [], 'm')).rejects.toThrow()
    expect(calls).toEqual([])
  })
})

describe('creating the branch an artifact lives on', () => {
  it('drops a removed path from the base tree with a null sha', async () => {
    // The same tree call the resolution path makes, so a removal costs nothing extra: only the
    // last step differs, and it creates a ref rather than moving one.
    reset()
    answer = (endpoint) => {
      if (endpoint.endsWith('/git/blobs')) return { sha: 'blobsha' }
      if (endpoint.endsWith('/git/trees')) return { sha: 'treesha' }
      if (endpoint.endsWith('/git/commits')) return { sha: 'commitsha' }
      return null
    }

    const sha = await createBranchWithFiles(
      'o/r',
      'igor/fix-7',
      'basesha',
      [{ path: 'src/new.ts', content: 'moved\n' }],
      ['src/old.ts'],
      'Rename the module',
    )

    expect(sha).toBe('commitsha')
    expect(calls[1]?.body).toMatchObject({
      base_tree: 'basesha',
      tree: [
        { path: 'src/new.ts', mode: '100644', type: 'blob', sha: 'blobsha' },
        { path: 'src/old.ts', mode: '100644', type: 'blob', sha: null },
      ],
    })
    // A POST to `git/refs`, never a PATCH: the branch does not exist yet, and moving a ref
    // that is already there would put the artifact on somebody else's branch.
    expect(method(3)).toBe('POST')
    expect(calls[3]?.body).toMatchObject({ ref: 'refs/heads/igor/fix-7', sha: 'commitsha' })
  })

  it('opens an artifact whose every change is a removal', async () => {
    // No blob to write, so the first call is the tree. Refused here, a run that deleted a
    // module publishes nothing and the worker was still paid for.
    reset()
    answer = (endpoint) => {
      if (endpoint.endsWith('/git/trees')) return { sha: 'treesha' }
      if (endpoint.endsWith('/git/commits')) return { sha: 'commitsha' }
      if (endpoint === 'repos/o/r') return { default_branch: 'main' }
      if (endpoint.endsWith('/git/ref/heads/main')) return { sha: 'basesha' }
      if (endpoint.endsWith('/pulls')) return { number: 42, html_url: 'https://example.test/42' }
      return null
    }

    const artifact = await new GitHubCodeHost().produce({
      repo: 'o/r',
      branch: 'igor/fix-7',
      title: 'Drop the obsolete module',
      body: 'Closes #7',
      files: [],
      deletions: ['src/gone.ts'],
      draft: true,
    })

    expect(artifact).toMatchObject({ kind: 'pull-request', ref: '#42' })
    const tree = calls.find((c) => c.args[1] === 'repos/o/r/git/trees')
    expect(tree?.body).toMatchObject({
      tree: [{ path: 'src/gone.ts', mode: '100644', type: 'blob', sha: null }],
    })
  })

  it('refuses an artifact with nothing in it at all', async () => {
    reset()
    await expect(
      new GitHubCodeHost().produce({
        repo: 'o/r',
        branch: 'igor/fix-7',
        title: 't',
        body: 'b',
        files: [],
        deletions: [],
        draft: true,
      }),
    ).rejects.toThrow()
    expect(calls).toEqual([])
  })
})
