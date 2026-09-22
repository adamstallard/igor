import { chmodSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { gh, GhError } from '../src/gh.js'
import { tempDir } from './tmp.js'

/** A real `gh` on PATH, so what is under test is the pipe rather than a stub's return value. */
function fakeGh(stdout: string, opts: { stderr?: string; code?: number } = {}): void {
  const bin = tempDir('igor-fake-gh-')
  const payload = join(bin, 'payload.json')
  writeFileSync(payload, stdout)
  const complain = opts.stderr === undefined ? '' : `printf '%s' '${opts.stderr}' >&2\n`
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\ncat '${payload}'\n${complain}exit ${opts.code ?? 0}\n`)
  chmodSync(join(bin, 'gh'), 0o755)
  vi.stubEnv('PATH', `${bin}:/usr/bin:/bin`)
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

  it('carries the HTTP status off a failed request, so a caller can act on one code', async () => {
    // A merge that conflicts answers 409 and is a routine outcome rather than a fault. Read
    // back off the message at each call site, that parse would be spread over the codebase —
    // and a caller that took every failure for a conflict would send a worker at a rate limit.
    fakeGh('{"message":"Merge conflict","status":"409"}', {
      stderr: 'gh: Merge conflict (HTTP 409)',
      code: 1,
    })
    const error = await gh(['api', 'repos/o/r/merges', '--method', 'POST']).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(GhError)
    expect((error as GhError).status).toBe(409)
  })

  it('leaves the status unset where gh named none', async () => {
    fakeGh('', { stderr: 'gh: could not resolve host', code: 1 })
    const error = await gh(['api', 'repos/o/r/merges']).catch((e: unknown) => e)
    expect((error as GhError).status).toBeUndefined()
  })
})
