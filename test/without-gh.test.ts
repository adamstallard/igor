import { execFileSync, ExecFileSyncOptions } from 'node:child_process'
import { symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GhError, gh } from '../src/gh.js'
import { idsOnDefaultBranch } from '../src/propose.js'
import { tempDir } from './tmp.js'

/**
 * A host where `gh` was never installed — the real `gh.js`, no mock, because what is under test
 * is a failure the process itself produces and a fake of it cannot.
 *
 * Minting reads the default branch, and a missing `gh` is the commonest reason that read cannot
 * happen. It has to come back as a store that could not be read, since `create` wrote entries on
 * such a host before it read anything at all.
 */
function pathWithGitOnly(): void {
  const bin = tempDir('igor-no-gh-')
  const git = execFileSync('sh', ['-c', 'command -v git']).toString().trim()
  symlinkSync(git, join(bin, 'git'))
  vi.stubEnv('PATH', bin)
}

function store(): string {
  const dir = tempDir('igor-create-no-gh-')
  const quiet: ExecFileSyncOptions = { stdio: 'ignore' }
  execFileSync('git', ['-C', dir, 'init', '-q'], quiet)
  execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', 'https://github.com/org/lore.git'], quiet)
  return dir
}

describe('where gh cannot run', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('fails as a gh failure, not as a raw spawn error', async () => {
    // Callers discriminate on GhError to tell a read that did not happen from a fault of their
    // own, and a raw ENOENT from the spawn passes that check on its way to the top of the process.
    pathWithGitOnly()
    await expect(gh(['api', 'repos/o/r'])).rejects.toBeInstanceOf(GhError)
  })

  it('says what minting could not read instead of failing the command', async () => {
    const destination = store()
    pathWithGitOnly()

    const tip = await idsOnDefaultBranch(destination)

    // Matched on the reason, not merely on there being one: a `git` that cannot run under the
    // stripped PATH degrades by the same door, and this test would pass without `gh` ever
    // having been reached.
    expect(tip.unread).toMatch(/gh could not be run/)
    expect(tip.ids.size).toBe(0)
  })
})
