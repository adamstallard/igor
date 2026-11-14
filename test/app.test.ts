import { createVerify, generateKeyPairSync } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AppError,
  appJwt,
  canMint,
  credentialProblem,
  GitHubApp,
  InstallationTokens,
  readCredentials,
  startApp,
  WORKFLOWS_MISSING,
  type Fetch,
} from '../src/app.js'
import { tempDir } from './tmp.js'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()

function keyFile(): string {
  const file = join(tempDir('igor-app-key-'), 'reviewer.pem')
  writeFileSync(file, PEM)
  return file
}

const env = (over: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  GITHUB_APP_IDENTITY: 'reviewer',
  GITHUB_APP_ID: '123',
  GITHUB_APP_PRIVATE_KEY_FILE: keyFile(),
  ...over,
})

describe('credentials come from the environment, for one identity', () => {
  it('names each missing variable', () => {
    expect(credentialProblem('reviewer', { GITHUB_APP_IDENTITY: 'reviewer' })).toBe(
      'the GitHub App "reviewer" is missing GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_FILE or ' +
        'GITHUB_APP_PRIVATE_KEY in its environment',
    )
    expect(
      credentialProblem('reviewer', { GITHUB_APP_IDENTITY: 'reviewer', GITHUB_APP_PRIVATE_KEY_FILE: '/k' }),
    ).toBe('the GitHub App "reviewer" is missing GITHUB_APP_ID in its environment')
  })

  it('names the identity too, where the environment holds nothing at all', () => {
    expect(credentialProblem('reviewer', {})).toMatch(
      /acts as the GitHub App "reviewer".*GITHUB_APP_IDENTITY=reviewer, GITHUB_APP_ID, and GITHUB_APP_PRIVATE_KEY_FILE or GITHUB_APP_PRIVATE_KEY are missing/,
    )
  })

  it('refuses both key variables, naming both, rather than choosing one', () => {
    const problem = credentialProblem('reviewer', env({ GITHUB_APP_PRIVATE_KEY: PEM }))
    expect(problem).toMatch(/GITHUB_APP_PRIVATE_KEY_FILE and GITHUB_APP_PRIVATE_KEY are set/)
  })

  it('does not lend credentials set for another identity, and names both identities', () => {
    expect(credentialProblem('reviewer', env({ GITHUB_APP_IDENTITY: 'maintainer' }))).toMatch(
      /set for "maintainer", which GITHUB_APP_IDENTITY names, and this Igor acts as "reviewer"/,
    )
    const unset = env()
    delete unset['GITHUB_APP_IDENTITY']
    expect(credentialProblem('reviewer', unset)).toMatch(
      /set for "default", since GITHUB_APP_IDENTITY is unset, and this Igor acts as "reviewer"/,
    )
  })

  it('reads a key given inline with escaped line breaks, as an environment file holds one', () => {
    const credentials = readCredentials('reviewer', {
      GITHUB_APP_IDENTITY: 'reviewer',
      GITHUB_APP_ID: '123',
      GITHUB_APP_PRIVATE_KEY: PEM.trim().replaceAll('\n', '\\n'),
    })
    expect(credentials.key.trim()).toBe(PEM.trim())
    expect(() => appJwt(credentials)).not.toThrow()
  })

  it('names a key file it cannot read', () => {
    expect(() => readCredentials('reviewer', env({ GITHUB_APP_PRIVATE_KEY_FILE: '/nonexistent/k.pem' }))).toThrow(
      /the private key for "reviewer" at \/nonexistent\/k.pem cannot be read/,
    )
  })

  it("never reads the github-app skill's stored files, even when the environment is incomplete", () => {
    const home = tempDir('igor-app-home-')
    mkdirSync(join(home, '.config', 'github-app'), { recursive: true })
    writeFileSync(join(home, '.config', 'github-app', 'reviewer.json'), JSON.stringify({ appId: '123' }))
    writeFileSync(join(home, '.config', 'github-app', 'reviewer.pem'), PEM)
    expect(() => readCredentials('reviewer', { HOME: home, XDG_CONFIG_HOME: join(home, '.config') })).toThrow(
      /GITHUB_APP_ID/,
    )
  })
})

describe('the JSON web token', () => {
  it('is signed RS256 by the key, issued a minute early and valid for nine minutes', () => {
    const now = Date.parse('2026-10-10T12:00:00Z')
    const jwt = appJwt({ identity: 'reviewer', appId: '123', key: PEM }, now)
    const [header, claims, signature] = jwt.split('.') as [string, string, string]
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' })
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
      iat: now / 1000 - 60,
      exp: now / 1000 + 540,
      iss: '123',
    })
    const verify = createVerify('RSA-SHA256')
    verify.update(`${header}.${claims}`)
    expect(verify.verify(publicKey, Buffer.from(signature, 'base64url'))).toBe(true)
  })

  it('names a key that cannot sign', () => {
    expect(() => appJwt({ identity: 'reviewer', appId: '123', key: 'not a key' })).toThrow(
      /the private key for "reviewer" cannot sign/,
    )
  })
})

interface Call {
  method: string
  path: string
  auth: string
}

/** GitHub's App endpoints, answered from a table, recording every request. */
function github(
  over: {
    app?: [number, unknown]
    installations?: Record<string, [number, unknown]>
    accounts?: Record<string, [number, unknown]>
    mint?: () => [number, unknown]
    bot?: [number, unknown]
  } = {},
): { fetch: Fetch; calls: Call[] } {
  const calls: Call[] = []
  const reply = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
  const fetch: Fetch = async (url, init) => {
    const path = url.replace('https://api.github.com', '')
    const auth = String((init.headers as Record<string, string>)['Authorization'] ?? '')
    calls.push({ method: init.method ?? 'GET', path, auth })
    if (path === '/app') return reply(...(over.app ?? [200, { slug: 'acme-reviewer' }]))
    const repo = path.match(/^\/repos\/(.+)\/installation$/)
    if (repo) {
      const answer = over.installations?.[repo[1]!] ?? [200, { id: 7, account: { login: 'acme' } }]
      return reply(...answer)
    }
    const account = path.match(/^\/users\/([^/]+)\/installation$/)
    if (account) return reply(...(over.accounts?.[account[1]!] ?? [404, { message: 'Not Found' }]))
    if (path.match(/^\/app\/installations\/\d+\/access_tokens$/)) {
      return reply(
        ...(over.mint?.() ?? [
          201,
          {
            token: 'ghs_minted',
            expires_at: new Date(Date.now() + 3600_000).toISOString(),
            permissions: { contents: 'write', issues: 'write', pull_requests: 'write', workflows: 'write' },
          },
        ]),
      )
    }
    if (path.startsWith('/users/')) return reply(...(over.bot ?? [200, { login: 'acme-reviewer[bot]', id: 99 }]))
    return reply(404, { message: 'Not Found' })
  }
  return { fetch, calls }
}

describe('the startup check', () => {
  it("acts as the App's bot account, found through the one installation covering every repository", async () => {
    const { fetch } = github()
    const session = await startApp('reviewer', ['acme/app', 'acme/lore'], env(), { fetch })
    expect(session.account).toEqual({ login: 'acme-reviewer[bot]', id: 99 })
    expect(session.installation).toEqual({ id: 7, account: 'acme' })
    expect(session.warnings).toEqual([])
  })

  it('makes no request when the credentials are incomplete', async () => {
    const { fetch, calls } = github()
    await expect(startApp('reviewer', ['acme/app'], { GITHUB_APP_IDENTITY: 'reviewer' }, { fetch })).rejects.toThrow(
      /missing GITHUB_APP_ID/,
    )
    await expect(
      startApp('reviewer', ['acme/app'], env({ GITHUB_APP_PRIVATE_KEY: PEM }), { fetch }),
    ).rejects.toThrow(/GITHUB_APP_PRIVATE_KEY_FILE and GITHUB_APP_PRIVATE_KEY are set/)
    expect(calls).toEqual([])
  })

  it('names GitHub refusing the credentials', async () => {
    const { fetch } = github({ app: [401, { message: 'A JSON web token could not be decoded' }] })
    await expect(startApp('reviewer', ['acme/app'], env(), { fetch })).rejects.toThrow(
      /GitHub refused the credentials of the App "reviewer" \(App ID 123\): 401 A JSON web token could not be decoded/,
    )
  })

  it('names the repository and its account where the App is not installed there', async () => {
    const { fetch } = github({ installations: { 'other/app': [404, { message: 'Not Found' }] } })
    await expect(startApp('reviewer', ['other/app'], env(), { fetch })).rejects.toThrow(
      'the App "reviewer" is not installed on other, which holds other/app',
    )
  })

  it('names a repository the installation does not reach', async () => {
    const { fetch } = github({
      installations: { 'acme/secret': [404, { message: 'Not Found' }] },
      accounts: { acme: [200, { id: 7 }] },
    })
    await expect(startApp('reviewer', ['acme/secret'], env(), { fetch })).rejects.toThrow(
      'the App "reviewer" is installed on acme but cannot reach acme/secret',
    )
  })

  it('refuses repositories on more than one installation, naming the accounts', async () => {
    const { fetch } = github({ installations: { 'other/lore': [200, { id: 8, account: { login: 'other' } }] } })
    await expect(startApp('reviewer', ['acme/app', 'other/lore'], env(), { fetch })).rejects.toThrow(
      /more than one installation.*acme \(acme\/app\); other \(other\/lore\)/,
    )
  })

  it('names each missing permission, from the token rather than a collaborator record', async () => {
    const { fetch, calls } = github({
      mint: () => [
        201,
        { token: 't', expires_at: new Date(Date.now() + 3600_000).toISOString(), permissions: { contents: 'write', issues: 'read' } },
      ],
    })
    await expect(startApp('reviewer', ['acme/app'], env(), { fetch })).rejects.toThrow(
      /lacks Issues write and Pull requests write/,
    )
    expect(calls.some((c) => c.path.includes('collaborators'))).toBe(false)
  })

  it('reports a missing Workflows write without refusing', async () => {
    const { fetch } = github({
      mint: () => [
        201,
        {
          token: 't',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
          permissions: { contents: 'write', issues: 'write', pull_requests: 'write' },
        },
      ],
    })
    const session = await startApp('reviewer', ['acme/app'], env(), { fetch })
    expect(session.warnings).toEqual([WORKFLOWS_MISSING])
  })

  it("ignores the skill's installation variables, finding the installation from the repositories", async () => {
    const { fetch, calls } = github()
    const session = await startApp(
      'reviewer',
      ['acme/app'],
      env({ GITHUB_APP_OWNER: 'elsewhere', GITHUB_APP_INSTALLATION_ID: '555' }),
      { fetch },
    )
    expect(session.installation.id).toBe(7)
    expect(calls.some((c) => c.path.includes('555') || c.path.includes('elsewhere'))).toBe(false)
  })

  it('reads the slug with the JWT and nothing with an ambient token', async () => {
    const { fetch, calls } = github()
    await startApp('reviewer', ['acme/app'], env({ GH_TOKEN: 'ghp_ambient', GITHUB_TOKEN: 'ghp_other' }), { fetch })
    expect(calls.every((c) => !c.auth.includes('ghp_'))).toBe(true)
    expect(calls.find((c) => c.path === '/app')?.auth).toMatch(/^Bearer ey/)
  })

  it('writes no token to the environment or to disk', async () => {
    const home = tempDir('igor-app-home-')
    const { fetch } = github()
    const before = { ...process.env }
    await startApp('reviewer', ['acme/app'], env({ HOME: home }), { fetch })
    expect(process.env).toEqual(before)
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        return statSync(path).isDirectory() ? files(path) : [path]
      })
    expect(files(home).filter((f) => readFileSync(f, 'utf8').includes('ghs_minted'))).toEqual([])
  })
})

describe('installation tokens', () => {
  function minting(now: { t: number }) {
    let minted = 0
    const fetch: Fetch = async () => {
      minted += 1
      return new Response(
        JSON.stringify({ token: `t${minted}`, expires_at: new Date(now.t + 3600_000).toISOString(), permissions: {} }),
        { status: 201 },
      )
    }
    const app = new GitHubApp({ identity: 'reviewer', appId: '1', key: PEM }, { fetch, now: () => now.t })
    return { tokens: new InstallationTokens(app, 7, () => now.t), count: () => minted }
  }

  it('reuses a token within the first half of its life', async () => {
    const now = { t: Date.parse('2026-10-10T12:00:00Z') }
    const { tokens, count } = minting(now)
    expect(await tokens.token()).toBe('t1')
    now.t += 29 * 60_000
    expect(await tokens.token()).toBe('t1')
    expect(count()).toBe(1)
  })

  it('mints a new one once half its life has passed', async () => {
    const now = { t: Date.parse('2026-10-10T12:00:00Z') }
    const { tokens, count } = minting(now)
    await tokens.token()
    now.t += 30 * 60_000
    expect(await tokens.token()).toBe('t2')
    expect(count()).toBe(2)
  })

  it('mints once for calls that arrive together', async () => {
    const now = { t: Date.parse('2026-10-10T12:00:00Z') }
    const { tokens, count } = minting(now)
    const all = await Promise.all([tokens.token(), tokens.token(), tokens.token()])
    expect(all).toEqual(['t1', 't1', 't1'])
    expect(count()).toBe(1)
  })

  it('says why a token cannot be had, naming the App, and recovers when one can', async () => {
    let refuse = true
    const fetch: Fetch = async () =>
      refuse
        ? new Response(JSON.stringify({ message: 'Bad credentials' }), { status: 401 })
        : new Response(
            JSON.stringify({ token: 't', expires_at: new Date(Date.now() + 3600_000).toISOString(), permissions: {} }),
            { status: 201 },
          )
    const tokens = new InstallationTokens(new GitHubApp({ identity: 'reviewer', appId: '1', key: PEM }, { fetch }), 7)
    expect(await canMint(tokens)).toBe('GitHub would not mint a token for the App "reviewer": 401 Bad credentials')
    refuse = false
    expect(await canMint(tokens)).toBe(true)
  })

  it('is an AppError carrying the status, so a caller can tell a refusal from an outage', async () => {
    const fetch: Fetch = async () => new Response('{"message":"Not Found"}', { status: 404 })
    const app = new GitHubApp({ identity: 'reviewer', appId: '1', key: PEM }, { fetch })
    const error = await app.mint(7).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    expect((error as AppError).status).toBe(404)
  })
})
