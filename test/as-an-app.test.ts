import { execFileSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { generateKeyPairSync } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { isGoAhead, isStop } from '../src/signals.js'
import { CloneProvider } from '../src/worktree.js'
import { canMint, GitHubApp, InstallationTokens, type Fetch } from '../src/app.js'
import { tempDir } from './tmp.js'
import { IGORS } from './igors.js'

describe('an Igor acting as its App', () => {
  afterEach(() => vi.unstubAllEnvs())

  it("recognises a stop addressed to its bot, spelled either way", () => {
    expect(isStop('@igor-reviewer[bot] stop', 'igor-reviewer[bot]', IGORS)).toBe(true)
    expect(isStop('@igor-reviewer stop', 'igor-reviewer[bot]', IGORS)).toBe(true)
    expect(isGoAhead('@igor-reviewer[bot] go ahead', 'igor-reviewer[bot]', IGORS)).toBe(true)
  })

  it('clones with the App token even where a config file rewrites github.com to SSH', async () => {
    const home = tempDir('igor-rewrite-home-')
    const global = join(home, 'gitconfig')
    writeFileSync(global, '[url "git@github.com:"]\n\tinsteadOf = https://github.com/\n')
    const log = join(home, 'ssh.log')
    const ssh = join(home, 'ssh')
    writeFileSync(ssh, `#!/bin/sh\necho "$@" >> '${log}'\nexit 1\n`)
    chmodSync(ssh, 0o755)
    vi.stubEnv('HOME', home)
    vi.stubEnv('GIT_CONFIG_GLOBAL', global)
    vi.stubEnv('GIT_SSH_COMMAND', ssh)
    vi.stubEnv('GIT_TERMINAL_PROMPT', '0')
    await new CloneProvider(1, async () => 'APPTOKEN').provision('octo/repo').catch(() => undefined)
    expect(existsSync(log) ? readFileSync(log, 'utf8') : '').toBe('')
  })

  it('sees a credential GitHub stops accepting at the next check, not at renewal', async () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const key = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
    let refuse = false
    const fetch: Fetch = async () =>
      refuse
        ? new Response('{"message":"Bad credentials"}', { status: 401 })
        : new Response(JSON.stringify({ token: 't', expires_at: new Date(Date.now() + 3600_000).toISOString(), permissions: {} }), { status: 201 })
    const tokens = new InstallationTokens(new GitHubApp({ identity: 'r', appId: '1', key }, { fetch }), 7)
    expect(await canMint(tokens)).toBe(true)
    refuse = true
    expect(await canMint(tokens)).not.toBe(true)
  })
})

describe('the tree a clone under the App token hands the worker', () => {
  afterEach(() => vi.unstubAllEnvs())

  it("runs the host's checkout filters, as every later git command in the tree does", async () => {
    // A stand-in for `git lfs install`, which writes its smudge filter into the global config.
    const home = tempDir('igor-filter-home-')
    const global = join(home, 'gitconfig')
    writeFileSync(global, '[filter "fake"]\n\tsmudge = sed s/POINTER/REAL-CONTENT/\n\tclean = cat\n')
    const origin = tempDir('igor-filter-origin-')
    execFileSync('git', ['-C', origin, 'init', '-q', '-b', 'main', '.'])
    writeFileSync(join(origin, '.gitattributes'), '*.bin filter=fake\n')
    writeFileSync(join(origin, 'a.bin'), 'POINTER\n')
    execFileSync('git', ['-C', origin, 'add', '.'])
    execFileSync('git', ['-C', origin, '-c', 'user.email=t@e.invalid', '-c', 'user.name=t', 'commit', '-qm', 'base'])
    vi.stubEnv('HOME', home)
    vi.stubEnv('GIT_CONFIG_GLOBAL', global)
    vi.stubEnv('GIT_CONFIG_COUNT', '1')
    vi.stubEnv('GIT_CONFIG_KEY_0', `url.file://${origin}/.insteadOf`)
    vi.stubEnv('GIT_CONFIG_VALUE_0', 'https://github.com/o/r.git')
    const tree = await new CloneProvider(1, async () => 'ghs_app').provision('o/r')
    try {
      expect(readFileSync(join(tree.path, 'a.bin'), 'utf8')).toBe('REAL-CONTENT\n')
    } finally {
      await tree.release()
    }
  })
})

describe('a stop addressed to somebody else', () => {
  it('does not stop an Igor whose name ends another account\'s name', () => {
    expect(isStop('@code-reviewer stop', 'reviewer[bot]', IGORS)).toBe(false)
    expect(isStop('@acme-igor-generalist stop', 'igor-generalist[bot]', IGORS)).toBe(false)
    expect(isStop('@reviewer stop', 'reviewer[bot]', IGORS)).toBe(true)
  })
})
