import { execFile, execFileSync } from 'node:child_process'
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { claudeWorker, workerEnv } from '../src/execute.js'
import { actAs, ghRaw } from '../src/gh.js'
import { CloneProvider, gitEnv } from '../src/worktree.js'
import { tempDir } from './tmp.js'

const run = promisify(execFile)

/** A `gh` on PATH that prints the variables it was started with, so the spawn itself is under test. */
function envPrintingGh(): void {
  const bin = tempDir('igor-env-gh-')
  writeFileSync(
    join(bin, 'gh'),
    '#!/bin/sh\nprintf \'{"GH_TOKEN":"%s","GITHUB_TOKEN":"%s","GH_ENTERPRISE_TOKEN":"%s","GITHUB_ENTERPRISE_TOKEN":"%s"}\' ' +
      '"$GH_TOKEN" "$GITHUB_TOKEN" "$GH_ENTERPRISE_TOKEN" "$GITHUB_ENTERPRISE_TOKEN"\n',
  )
  chmodSync(join(bin, 'gh'), 0o755)
  vi.stubEnv('PATH', `${bin}:/usr/bin:/bin`)
}

describe('every gh call acts as the App', () => {
  afterEach(() => {
    actAs(undefined)
    vi.unstubAllEnvs()
  })

  it('carries the App token and no ambient one', async () => {
    envPrintingGh()
    vi.stubEnv('GH_TOKEN', 'ghp_ambient')
    vi.stubEnv('GITHUB_TOKEN', 'ghp_actions')
    vi.stubEnv('GH_ENTERPRISE_TOKEN', 'ghe_one')
    vi.stubEnv('GITHUB_ENTERPRISE_TOKEN', 'ghe_two')
    actAs(async () => 'ghs_app')
    expect(JSON.parse(await ghRaw(['api', 'user']))).toEqual({
      GH_TOKEN: 'ghs_app',
      GITHUB_TOKEN: '',
      GH_ENTERPRISE_TOKEN: '',
      GITHUB_ENTERPRISE_TOKEN: '',
    })
    // The token went to the child alone.
    expect(process.env['GH_TOKEN']).toBe('ghp_ambient')
  })

  it("leaves a person's command on the person's own login", async () => {
    envPrintingGh()
    vi.stubEnv('GH_TOKEN', 'ghp_person')
    expect(JSON.parse(await ghRaw(['api', 'user']))['GH_TOKEN']).toBe('ghp_person')
  })

  it('runs nothing at all when no App token can be had', async () => {
    const bin = tempDir('igor-never-gh-')
    const ran = join(bin, 'ran')
    writeFileSync(join(bin, 'gh'), `#!/bin/sh\ntouch '${ran}'\n`)
    chmodSync(join(bin, 'gh'), 0o755)
    vi.stubEnv('PATH', `${bin}:/usr/bin:/bin`)
    vi.stubEnv('GH_TOKEN', 'ghp_ambient')
    actAs(async () => {
      throw new Error('GitHub would not mint a token')
    })
    await expect(ghRaw(['api', 'user'])).rejects.toThrow(/was not run: GitHub would not mint a token/)
    expect(existsSync(ran)).toBe(false)
  })
})

describe('git authenticates as the App for one command, and keeps nothing', () => {
  it('numbers its helper entries after any already present', () => {
    const env = gitEnv({ GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'a.b', GIT_CONFIG_VALUE_0: 'c' }, 't')
    expect(env['GIT_CONFIG_COUNT']).toBe('4')
    expect(env['GIT_CONFIG_KEY_0']).toBe('a.b')
    expect(env['GIT_CONFIG_KEY_2']).toBe('credential.https://github.com.helper')
    expect(env['GIT_CONFIG_VALUE_2']).toBe('')
    expect(env['GIT_CONFIG_KEY_3']).toBe('credential.https://github.com.helper')
    // The token is a variable of the child, never part of a command line.
    expect(env['GIT_CONFIG_VALUE_3']).not.toContain('t;')
  })

  it("answers with the App token over a helper the user's config names", async () => {
    // A global config whose helper would answer with somebody else's password, as a keychain
    // or `gh auth setup-git` would.
    const home = tempDir('igor-git-home-')
    const global = join(home, 'gitconfig')
    writeFileSync(global, '[credential]\n\thelper = "!f() { echo username=person; echo password=personal; }; f"\n')
    const env = gitEnv({ PATH: process.env['PATH'], HOME: home, GIT_CONFIG_GLOBAL: global, GIT_CONFIG_NOSYSTEM: '1' }, 'ghs_app')
    const { stdout } = await new Promise<{ stdout: string }>((resolve, reject) => {
      const child = execFile('git', ['credential', 'fill'], { env }, (error, stdout) =>
        error ? reject(error) : resolve({ stdout }),
      )
      child.stdin?.end('protocol=https\nhost=github.com\n\n')
    })
    expect(stdout).toContain('username=x-access-token')
    expect(stdout).toContain('password=ghs_app')
    expect(stdout).not.toContain('personal')
  })

  it('refuses a GIT_CONFIG_COUNT git would refuse', () => {
    expect(() => gitEnv({ GIT_CONFIG_COUNT: 'x' }, 't')).toThrow(/GIT_CONFIG_COUNT is "x"/)
  })

  it('clones with the helper and leaves no credential in the tree or the global config', async () => {
    // A local repository stands in for github.com, through an `insteadOf` the test passes the
    // same way: in GIT_CONFIG_* entries the clone's own are numbered after.
    const origin = tempDir('igor-origin-')
    execFileSync('git', ['-C', origin, 'init', '-q', '-b', 'main', '.'])
    execFileSync('git', ['-C', origin, '-c', 'user.email=t@e.invalid', '-c', 'user.name=t', 'commit', '-q', '--allow-empty', '-m', 'base'])
    const home = tempDir('igor-clone-home-')
    const global = join(home, 'gitconfig')
    writeFileSync(global, '')
    vi.stubEnv('HOME', home)
    vi.stubEnv('GIT_CONFIG_GLOBAL', global)
    vi.stubEnv('GIT_CONFIG_COUNT', '1')
    vi.stubEnv('GIT_CONFIG_KEY_0', `url.file://${origin}/.insteadOf`)
    vi.stubEnv('GIT_CONFIG_VALUE_0', 'https://github.com/o/r.git')
    try {
      const asked: string[] = []
      const tree = await new CloneProvider(1, async () => {
        asked.push('token')
        return 'ghs_app'
      }).provision('o/r')
      try {
        expect(asked).toEqual(['token'])
        const config = readFileSync(join(tree.path, '.git', 'config'), 'utf8')
        expect(config).not.toMatch(/credential|ghs_app|x-access-token/)
        expect(readFileSync(global, 'utf8')).toBe('')
        const { stdout } = await run('git', ['-C', tree.path, 'log', '--format=%s'])
        expect(stdout.trim()).toBe('base')
      } finally {
        await tree.release()
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('the worker gets nothing of the App', () => {
  it('holds no App token, GITHUB_APP_* or GIT_CONFIG_* through the real spawn path', async () => {
    const dir = tempDir('igor-worker-env-')
    const dump = join(dir, 'env.txt')
    const bin = join(dir, 'claude')
    writeFileSync(bin, `#!/bin/sh\nenv > '${dump}'\necho '{"type":"result","subtype":"success","result":"ok"}'\n`)
    chmodSync(bin, 0o755)
    const igor = {
      PATH: process.env['PATH'] ?? '/usr/bin:/bin',
      HOME: dir,
      GH_TOKEN: 'ghs_app',
      GITHUB_APP_IDENTITY: 'reviewer',
      GITHUB_APP_ID: '1',
      GITHUB_APP_PRIVATE_KEY_FILE: '/etc/igor/reviewer.pem',
      ...gitEnv({}, 'ghs_app'),
    }
    const env = await workerEnv({ tokenEnv: 'SEAT' }, { ...igor, SEAT: 'sk-seat' })
    await claudeWorker(bin)({
      cwd: dir,
      system: 's',
      prompt: 'p',
      model: 'm',
      limits: { toolMs: 10_000, modelMs: 10_000, ceilingMs: 10_000 },
      allowedTools: [],
      env,
    })
    const seen = readFileSync(dump, 'utf8')
    expect(seen).not.toMatch(/GH_TOKEN|GITHUB_APP_|GIT_CONFIG_|IGOR_GIT_TOKEN|ghs_app/)
    expect(seen).toContain('CLAUDE_CODE_OAUTH_TOKEN=sk-seat')
  })
})
