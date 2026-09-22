import { execFileSync } from 'node:child_process'
import { chmodSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GhError, gh } from '../src/gh.js'
import { tempDir } from './tmp.js'

/** A real `gh` on PATH, so what is under test is the pipe rather than a stub's return value. */
function fakeGh(stdout: string): void {
  const bin = tempDir('igor-fake-gh-')
  const payload = join(bin, 'payload.json')
  writeFileSync(payload, stdout)
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncat '${payload}'\n`)
  chmodSync(join(bin, 'gh'), 0o755)
  vi.stubEnv('PATH', `${bin}:/usr/bin:/bin`)
}

/** A PATH holding `git` and nothing else, which is a host where `gh` was never installed. */
function withoutGh(): void {
  const bin = tempDir('igor-no-gh-')
  symlinkSync(execFileSync('sh', ['-c', 'command -v git']).toString().trim(), join(bin, 'git'))
  vi.stubEnv('PATH', bin)
}

describe('what gh says, read back whole', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('decodes a multi-byte character that the pipe split across two chunks', async () => {
    // A search page carries every matching issue's title and body, well past the pipe buffer.
    // A boundary inside a three-byte character decodes to replacement characters, and since
    // those are legal inside a JSON string the payload still parses — an issue body silently
    // corrupted on the way into triage, rather than a read that fails and can be retried.
    const body = `steps to reproduce ${'—'.repeat(100_000)} expected a window`
    fakeGh(JSON.stringify({ body }))
    const issue = await gh<{ body: string }>(['api', 'repos/o/r/issues/1'])
    expect(issue.body.includes('�')).toBe(false)
    expect(issue.body).toBe(body)
  })

  it('fails as a gh failure where gh is not installed, not as a raw spawn error', async () => {
    // Every caller discriminates on GhError to tell "the read did not happen" from a fault of
    // its own. A raw ENOENT from the spawn passes that check and reaches the top of the process.
    withoutGh()
    await expect(gh(['api', 'repos/o/r'])).rejects.toBeInstanceOf(GhError)
  })
})
