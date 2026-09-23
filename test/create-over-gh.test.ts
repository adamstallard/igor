import { execFileSync, ExecFileSyncOptions } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uniqueId } from '../src/id.js'
import { ENTRIES_DIR, REJECTED_DIR, createTarget } from '../src/store.js'
import { tempDir } from './tmp.js'

/**
 * The id `create` mints, over the real `github.ts` with only the `gh` process faked.
 *
 * What is proved here is that the two reads agree: the ids a new id is minted against and the
 * ids a proposal from it would be gated against are the same store on the same branch. A fake
 * of `github.js` would answer both for itself and could show nothing.
 */
class FakeGhError extends Error {}

const BASE_SHA = 'basesha'
const TREES: Record<string, string> = { [ENTRIES_DIR]: 'entriestree', [REJECTED_DIR]: 'rejectedtree' }

/** Upstream store contents at `BASE_SHA`, per directory. */
let upstream: Record<string, string[]> = {}
/** Set where `gh` itself cannot run: no credentials, no network. */
let ghUnavailable = false
const requests: string[] = []

function treeOf(dir: string): unknown {
  return {
    truncated: false,
    tree: (upstream[dir] ?? []).map((name) => ({ path: name, type: 'blob', sha: `blob-${name}` })),
  }
}

function rootTree(): unknown {
  return {
    truncated: false,
    tree: Object.keys(upstream).map((dir) => ({ path: dir, type: 'tree', sha: TREES[dir] })),
  }
}

vi.mock('../src/gh.js', () => ({
  GhError: FakeGhError,
  gh: async (args: readonly string[]) => {
    const endpoint = args[1] ?? ''
    requests.push(endpoint)
    if (ghUnavailable) throw new FakeGhError('gh: could not authenticate to github.com')
    if (endpoint === 'repos/org/lore') return { private: true, default_branch: 'main' }
    if (endpoint === 'repos/org/lore/git/ref/heads/main') return { sha: BASE_SHA }
    if (endpoint === `repos/org/lore/git/trees/${BASE_SHA}`) return rootTree()
    const sub = Object.entries(TREES).find(([, sha]) => endpoint === `repos/org/lore/git/trees/${sha}`)
    if (sub) return treeOf(sub[0])
    throw new FakeGhError(`unexpected endpoint: ${endpoint}`)
  },
  ghPaginated: async () => [],
}))

const { idsOnDefaultBranch, upstreamHoldsTheName } = await import('../src/propose.js')

const CLAIM = 'Use the shared query hook.'
const SLUG = 'use-shared-query-hook'

/** A checkout whose origin is the destination, which is where `repoFromCheckout` reads it. */
function store(): string {
  const dir = tempDir('igor-create-gh-')
  const quiet: ExecFileSyncOptions = { stdio: 'ignore' }
  execFileSync('git', ['-C', dir, 'init', '-q'], quiet)
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://github.com/org/lore.git'], quiet)
  return dir
}

function holdsLocally(destination: string, dir: string, id: string): void {
  mkdirSync(join(destination, dir), { recursive: true })
  writeFileSync(join(destination, dir, `${id}.md`), '---\nid: x\n---\n', 'utf8')
}

/** What `create` does: read the tip, mint against it and the checkout together, then speak. */
async function created(
  destination: string,
  into?: string,
): Promise<{ id: string; said: string | undefined }> {
  const tip = await idsOnDefaultBranch(destination)
  const target = createTarget(destination, into, tip.ids)
  const id = uniqueId(CLAIM, target.taken)
  return { id, said: upstreamHoldsTheName(CLAIM, id, tip, target.checkout) }
}

async function createdId(destination: string, into?: string): Promise<string> {
  return (await created(destination, into)).id
}

beforeEach(() => {
  upstream = { [ENTRIES_DIR]: [], [REJECTED_DIR]: [] }
  ghUnavailable = false
  requests.length = 0
})

describe('minting an id against the branch a proposal lands on', () => {
  it('refuses an id upstream holds that this checkout does not show', async () => {
    upstream[ENTRIES_DIR] = [`${SLUG}.md`]
    expect(await createdId(store())).toBe(`${SLUG}-2`)
  })

  it('refuses an id upstream rejected, which is never proposable again', async () => {
    upstream[REJECTED_DIR] = [`${SLUG}.md`]
    expect(await createdId(store())).toBe(`${SLUG}-2`)
  })

  it('refuses it for a candidate written outside the store, which is where propose reads', async () => {
    upstream[ENTRIES_DIR] = [`${SLUG}.md`]
    expect(await createdId(store(), tempDir('igor-create-into-'))).toBe(`${SLUG}-2`)
  })

  it('still refuses an id only this checkout holds, which upstream has not seen', async () => {
    const destination = store()
    holdsLocally(destination, ENTRIES_DIR, SLUG)
    expect(await createdId(destination)).toBe(`${SLUG}-2`)
  })

  it('hands out a free id', async () => {
    upstream[ENTRIES_DIR] = ['something-else.md']
    expect(await createdId(store())).toBe(SLUG)
  })

  it('costs the same on a large store as on an empty one', async () => {
    upstream[ENTRIES_DIR] = Array.from({ length: 200 }, (_, n) => `entry-${n}.md`)
    await createdId(store())
    expect(requests).toEqual([
      'repos/org/lore',
      'repos/org/lore/git/ref/heads/main',
      `repos/org/lore/git/trees/${BASE_SHA}`,
      `repos/org/lore/git/trees/${TREES[ENTRIES_DIR]}`,
      `repos/org/lore/git/trees/${TREES[REJECTED_DIR]}`,
    ])
  })

  it('says the name is an entry upstream, so a second entry for one claim is not written', async () => {
    upstream[ENTRIES_DIR] = [`${SLUG}.md`]

    const { id, said } = await created(store())

    expect(id).toBe(`${SLUG}-2`)
    expect(said).toContain(SLUG)
    expect(said).toContain(`${SLUG}-2`)
    expect(said).toMatch(/entry on the destination's default branch/)
  })

  it('says a rejection differently, because that claim must not be proposed again', async () => {
    upstream[REJECTED_DIR] = [`${SLUG}.md`]

    const { id, said } = await created(store())

    expect(id).toBe(`${SLUG}-2`)
    expect(said).toMatch(/rejected/)
    // Proposing gates on the id, and `-2` is free there, so nothing downstream stops a claim
    // review already turned down. This line is where it is caught.
    expect(said).toMatch(/must not be proposed again/)
  })

  it('stays quiet where only this checkout holds the name, which is not news', async () => {
    const destination = store()
    holdsLocally(destination, ENTRIES_DIR, SLUG)

    const { id, said } = await created(destination)

    expect(id).toBe(`${SLUG}-2`)
    expect(said).toBeUndefined()
  })

  it('stays quiet where the checkout shows the entry the branch holds, which is most stores', async () => {
    upstream[ENTRIES_DIR] = [`${SLUG}.md`]
    const destination = store()
    holdsLocally(destination, ENTRIES_DIR, SLUG)

    const { id, said } = await created(destination)

    expect(id).toBe(`${SLUG}-2`)
    expect(said).toBeUndefined()
  })

  it('still speaks where the checkout holds the name as an entry and the branch as a rejection', async () => {
    upstream[REJECTED_DIR] = [`${SLUG}.md`]
    const destination = store()
    holdsLocally(destination, ENTRIES_DIR, SLUG)

    const { said } = await created(destination)

    expect(said).toMatch(/rejected/)
  })

  it('names what it could not read rather than reporting an empty store', async () => {
    ghUnavailable = true
    const destination = store()
    holdsLocally(destination, ENTRIES_DIR, SLUG)

    const tip = await idsOnDefaultBranch(destination)

    expect(tip.ids.size).toBe(0)
    expect(tip.unread).toMatch(/authenticate/)
    // Gated on the checkout alone, so the collision survives to propose, where the gate that
    // reads the tip refuses it. Late, but not an overwrite and not silent.
    const target = createTarget(destination, undefined, tip.ids)
    const id = uniqueId(CLAIM, target.taken)
    expect(id).toBe(`${SLUG}-2`)
    // Nothing was read, so nothing is known to be spoken for upstream: the two warnings never
    // appear together.
    expect(upstreamHoldsTheName(CLAIM, id, tip, target.checkout)).toBeUndefined()
  })
})
