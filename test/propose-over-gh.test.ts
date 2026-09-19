import { execFileSync } from 'node:child_process'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Config } from '../src/config.js'
import type { Entry } from '../src/entry.js'
import { ENTRIES_DIR, REJECTED_DIR, serialize } from '../src/store.js'
import { tempDir } from './tmp.js'

/**
 * `propose` over the real `github.ts`, with only the `gh` process faked.
 *
 * What is being proved is the seam between two reads that used to disagree: the ids the
 * proposal is gated against and the tree it is committed onto. A fake of `github.js` would
 * decide both for itself and could not show them agreeing.
 */
class FakeGhError extends Error {}

const BASE_SHA = 'basesha'
const TREES: Record<string, string> = { [ENTRIES_DIR]: 'entriestree', [REJECTED_DIR]: 'rejectedtree' }

/** Upstream store contents at `BASE_SHA`, per directory. */
let upstream: Record<string, string[]> = {}
/** Directories whose tree comes back truncated, as a store past the API's cap does. */
let truncated = new Set<string>()
/** Store paths that are not directories, as a symlinked or submodule `entries/` is not. */
let notADirectory = new Set<string>()
const requests: string[] = []
/** Every write, with the payload, because what was committed is the thing under test. */
const posts: { endpoint: string; body: Record<string, unknown> }[] = []

function treeOf(dir: string): unknown {
  return {
    truncated: truncated.has(dir),
    tree: (upstream[dir] ?? []).map((name) => ({ path: name, type: 'blob', sha: `blob-${name}` })),
  }
}

function rootTree(): unknown {
  return {
    truncated: truncated.has(''),
    tree: [
      { path: 'README.md', type: 'blob', sha: 'blob-readme' },
      ...Object.keys(upstream).map((dir) => ({
        path: dir,
        type: notADirectory.has(dir) ? 'blob' : 'tree',
        sha: TREES[dir],
      })),
    ],
  }
}

vi.mock('../src/gh.js', () => ({
  GhError: FakeGhError,
  gh: async (args: readonly string[], input?: string) => {
    const endpoint = args[1] ?? ''
    requests.push(endpoint)
    if (args.includes('--method')) {
      posts.push({ endpoint, body: JSON.parse(input ?? '{}') as Record<string, unknown> })
      if (endpoint.endsWith('/git/blobs')) return { sha: 'newblob' }
      if (endpoint.endsWith('/git/trees')) return { sha: 'newtree' }
      if (endpoint.endsWith('/git/commits')) return { sha: 'newcommit' }
      if (endpoint.endsWith('/git/refs')) return {}
      if (endpoint.endsWith('/pulls')) return { number: 11, html_url: 'https://github.com/org/lore/pull/11' }
      if (endpoint.endsWith('/assignees')) {
        return { assignees: (JSON.parse(input ?? '{}') as { assignees: string[] }).assignees.map((login) => ({ login })) }
      }
      return {}
    }
    if (endpoint === 'repos/org/lore') return { private: true, default_branch: 'main' }
    if (endpoint === 'repos/org/lore/git/ref/heads/main') return { sha: BASE_SHA }
    if (endpoint === `repos/org/lore/git/trees/${BASE_SHA}`) return rootTree()
    const sub = Object.entries(TREES).find(([, sha]) => endpoint === `repos/org/lore/git/trees/${sha}`)
    if (sub) return treeOf(sub[0])
    throw new FakeGhError(`unexpected endpoint: ${endpoint}`)
  },
  ghPaginated: async () => [],
}))

const { propose, ProposeError } = await import('../src/propose.js')
const { GitHubError } = await import('../src/github.js')

function entry(id: string): Entry {
  return {
    id,
    claim: `Claim for ${id}.`,
    scope: 'global',
    status: 'provisional',
    conditions: { prose: 'When it applies.' },
    provenance: [{ author: 'sarah', at: '2026-03-14' }],
    supersedes: [],
    body: 'Body.',
  }
}

/** A checkout whose origin is the destination, which is where `repoFromCheckout` reads it. */
function store(): string {
  const dir = tempDir('igor-propose-gh-')
  execFileSync('git', ['-C', dir, 'init', '-q'])
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://github.com/org/lore.git'])
  return dir
}

function config(destination: string): Config {
  return { destination, reviewers: ['abram'], experts: [], budget: { seats: [], pools: [] } }
}

/** The paths one commit put in the tree, read off the request that created it. */
function committedPaths(): string[] {
  const tree = posts.find((p) => p.endpoint.endsWith('/git/trees'))
  return ((tree?.body['tree'] ?? []) as { path: string }[]).map((t) => t.path)
}

function treeReads(): string[] {
  return requests.filter((r) => r.startsWith('repos/org/lore/git/trees/'))
}

beforeEach(() => {
  upstream = { [ENTRIES_DIR]: [], [REJECTED_DIR]: [] }
  truncated = new Set()
  notADirectory = new Set()
  requests.length = 0
  posts.length = 0
})

describe('an id the checkout does not know is taken', () => {
  it('is not committed over, and is reported', async () => {
    upstream[ENTRIES_DIR] = ['use-query-hook.md']

    const outcome = await propose(config(store()), [entry('use-query-hook'), entry('lint-first')], serialize)

    expect(committedPaths()).not.toContain(`${ENTRIES_DIR}/use-query-hook.md`)
    expect(committedPaths()).toEqual([`${ENTRIES_DIR}/lint-first.md`])
    expect(outcome.skipped.inStore).toEqual(['use-query-hook'])
    expect(outcome.results.map((r) => r.entries)).toEqual([['lint-first']])
  })

  it('is gated against the same commit the proposal is built on', async () => {
    // The whole bug: the gate read one tree and the commit was made onto another.
    upstream[ENTRIES_DIR] = ['use-query-hook.md']

    await propose(config(store()), [entry('use-query-hook'), entry('lint-first')], serialize)

    const tree = posts.find((p) => p.endpoint.endsWith('/git/trees'))
    const commit = posts.find((p) => p.endpoint.endsWith('/git/commits'))
    expect(tree?.body['base_tree']).toBe(BASE_SHA)
    expect(commit?.body['parents']).toEqual([BASE_SHA])
    expect(treeReads()).toContain(`repos/org/lore/git/trees/${BASE_SHA}`)
  })

  it('is skipped when it was rejected upstream rather than accepted', async () => {
    upstream[REJECTED_DIR] = ['use-query-hook.md']

    const outcome = await propose(config(store()), [entry('use-query-hook'), entry('lint-first')], serialize)

    expect(outcome.skipped.rejected).toEqual(['use-query-hook'])
    expect(committedPaths()).toEqual([`${ENTRIES_DIR}/lint-first.md`])
  })

  it('opens no pull request at all when every candidate is taken upstream', async () => {
    upstream[ENTRIES_DIR] = ['use-query-hook.md']

    await expect(propose(config(store()), [entry('use-query-hook')], serialize)).rejects.toThrow(
      /use-query-hook/,
    )
    await expect(propose(config(store()), [entry('use-query-hook')], serialize)).rejects.toBeInstanceOf(
      ProposeError,
    )
    expect(posts).toEqual([])
  })
})

describe('the upstream read', () => {
  it('costs one request for the commit and one per directory present', async () => {
    upstream[ENTRIES_DIR] = ['use-query-hook.md']

    await propose(config(store()), [entry('lint-first')], serialize)

    expect(treeReads()).toEqual([
      `repos/org/lore/git/trees/${BASE_SHA}`,
      `repos/org/lore/git/trees/${TREES[ENTRIES_DIR]}`,
      `repos/org/lore/git/trees/${TREES[REJECTED_DIR]}`,
    ])
  })

  it('costs nothing per entry the store holds', async () => {
    upstream[ENTRIES_DIR] = Array.from({ length: 200 }, (_, i) => `entry-${i}.md`)

    await propose(config(store()), [entry('lint-first')], serialize)

    expect(treeReads()).toEqual([
      `repos/org/lore/git/trees/${BASE_SHA}`,
      `repos/org/lore/git/trees/${TREES[ENTRIES_DIR]}`,
      `repos/org/lore/git/trees/${TREES[REJECTED_DIR]}`,
    ])
  })

  it('reads no directory the store does not have', async () => {
    upstream = { [ENTRIES_DIR]: ['use-query-hook.md'] }

    await propose(config(store()), [entry('lint-first')], serialize)

    expect(treeReads()).not.toContain(`repos/org/lore/git/trees/${TREES[REJECTED_DIR]}`)
  })

  it('refuses a store path that is not a directory rather than gating on nothing', async () => {
    // A symlinked or submodule `entries/` is a blob or a commit in the tree. Reading it as an
    // absent directory would gate against an empty store, which is the overwrite this prevents.
    upstream[ENTRIES_DIR] = ['use-query-hook.md']
    notADirectory.add(ENTRIES_DIR)

    await expect(propose(config(store()), [entry('use-query-hook')], serialize)).rejects.toBeInstanceOf(
      GitHubError,
    )
    expect(posts).toEqual([])
  })

  it('refuses a listing it cannot read in full rather than gating on half of it', async () => {
    // A short read reports an id free that is there, which is the overwrite this prevents.
    upstream[ENTRIES_DIR] = ['use-query-hook.md']
    truncated.add(ENTRIES_DIR)

    await expect(propose(config(store()), [entry('use-query-hook')], serialize)).rejects.toBeInstanceOf(
      GitHubError,
    )
    expect(posts).toEqual([])
  })
})

describe('a store nothing collides with', () => {
  it('proposes every candidate and reports nothing skipped', async () => {
    const outcome = await propose(config(store()), [entry('lint-first'), entry('use-query-hook')], serialize)

    expect(committedPaths().sort()).toEqual([
      `${ENTRIES_DIR}/lint-first.md`,
      `${ENTRIES_DIR}/use-query-hook.md`,
    ])
    expect(outcome.skipped).toEqual({ inStore: [], rejected: [] })
  })
})
