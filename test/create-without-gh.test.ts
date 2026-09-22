import { execFileSync, ExecFileSyncOptions } from 'node:child_process'
import { symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { idsOnDefaultBranch } from '../src/propose.js'
import { tempDir } from './tmp.js'

/**
 * `create` on a host where `gh` was never installed — the real `gh.js`, no mock, because what
 * is under test is a failure the process itself produces and a fake of it cannot.
 *
 * Minting reads the default branch, and a host without `gh` is the commonest reason that read
 * cannot happen. It has to come back as a store that could not be read, since `create` wrote
 * entries on such a host before it read anything at all.
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

describe('minting an id where gh cannot run', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('says what it could not read instead of failing the command', async () => {
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
