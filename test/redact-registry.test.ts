import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { appJwt, GitHubApp, readCredentials, type Fetch } from '../src/app.js'
import { workerEnv } from '../src/execute.js'
import { redact, rememberUrlCredentials } from '../src/redact.js'
import { tempDir } from './tmp.js'

/**
 * Each place the Igor obtains a secret registers it, so text quoting it is redacted by value
 * with no pattern for its shape. Every check passes an empty environment, so the
 * credential-named-variable rule cannot be what redacts it.
 */
const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
const PEM = privateKey.export({ type: 'pkcs1', format: 'pem' }).toString()
const bodyLine = PEM.split('\n')[3]!

describe('the Igor registers each secret as it obtains it', () => {
  it("the App's private key, read from GITHUB_APP_PRIVATE_KEY_FILE, whole and by the line", () => {
    const file = join(tempDir('igor-redact-key-'), 'k.pem')
    writeFileSync(file, PEM)
    readCredentials('reviewer', { GITHUB_APP_IDENTITY: 'reviewer', GITHUB_APP_ID: '1', GITHUB_APP_PRIVATE_KEY_FILE: file })
    expect(redact(`leaked:\n${PEM}`, {})).toBe('leaked:\n[redacted]')
    expect(redact(`- ${bodyLine}`, {})).toBe('- [redacted]')
  })

  it("the App's signed JWT", () => {
    const jwt = appJwt({ identity: 'reviewer', appId: '1', key: PEM })
    expect(redact(`Bearer ${jwt}`, {})).toBe('Bearer [redacted]')
  })

  it('an installation token the App mints', async () => {
    const minted = `minted-${'0123456789abcdef'.repeat(2)}`
    const fetch: Fetch = async () =>
      new Response(JSON.stringify({ token: minted, expires_at: new Date(Date.now() + 3600_000).toISOString(), permissions: {} }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    await new GitHubApp({ identity: 'reviewer', appId: '1', key: PEM }, { fetch }).mint(7)
    expect(redact(`git said ${minted}`, {})).toBe('git said [redacted]')
  })

  it("an ambient login workerEnv puts in a worker's environment", async () => {
    const login = 'ambient-login-0123456789'
    const env = await workerEnv({}, { PATH: '/bin', CLAUDE_CODE_OAUTH_TOKEN: login })
    expect(env['CLAUDE_CODE_OAUTH_TOKEN']).toBe(login)
    expect(redact(`worker env: ${login}`, {})).toBe('worker env: [redacted]')
  })

  it("a forwarded proxy URL's credentials: the userinfo, the password and the whole URL", async () => {
    const proxy = 'http://proxyuser:s3cret-proxy-pass@proxy.corp:3128'
    const env = await workerEnv({}, { PATH: '/bin', HTTPS_PROXY: proxy, CLAUDE_CODE_OAUTH_TOKEN: 'ambient-login-0123456789' })
    expect(env['HTTPS_PROXY']).toBe(proxy)
    expect(redact(`curl: (56) via ${proxy}/`, {})).toBe('curl: (56) via [redacted]/')
    expect(redact('auth proxyuser:s3cret-proxy-pass rejected', {})).toBe('auth [redacted] rejected')
    expect(redact('password s3cret-proxy-pass rejected', {})).toBe('password [redacted] rejected')
  })

  it('a proxy URL with no credentials is left out', async () => {
    await workerEnv({}, { PATH: '/bin', HTTP_PROXY: 'http://proxy.example:8080', CLAUDE_CODE_OAUTH_TOKEN: 'ambient-login-0123456789' })
    expect(redact('via http://proxy.example:8080', {})).toBe('via http://proxy.example:8080')
  })

  it("a proxy URL's credentials where the URL names no scheme, as gh and git accept", async () => {
    await workerEnv({}, { PATH: '/bin', HTTPS_PROXY: 'alice:s3cretpassw0rd@proxy.corp:3128', CLAUDE_CODE_OAUTH_TOKEN: 'ambient-login-0123456789' })
    expect(redact('proxy said s3cretpassw0rd', {})).toBe('proxy said [redacted]')
  })
  it('a proxy URL whose user name is a token and has no password registers the user name', () => {
    const token = 'tok3n9f8a7b6c5d4e3f2a1b0'
    rememberUrlCredentials(`http://${token}@proxy.corp:3128`)
    expect(redact(`proxy refused ${token}`, {})).toBe('proxy refused [redacted]')
  })

  it('a proxy URL whose user name is a plain name and has no password registers nothing', () => {
    rememberUrlCredentials('http://build-agent.proxy-user01@proxy.corp:3128')
    expect(redact('github:build-agent.proxy-user01/igor#3', {})).toBe('github:build-agent.proxy-user01/igor#3')
    expect(redact('via http://build-agent.proxy-user01@proxy.corp:3128', {})).toBe(
      'via http://build-agent.proxy-user01@proxy.corp:3128',
    )
  })

  it('a proxy URL whose user name is under 20 characters and has no password registers nothing', () => {
    rememberUrlCredentials('http://adamstallard@proxy.corp:3128')
    rememberUrlCredentials('http://a1b2c3d4e5f6a7b8c9@proxy.corp:3128')
    expect(redact('github:adamstallard/igor#12 a1b2c3d4e5f6a7b8c9', {})).toBe('github:adamstallard/igor#12 a1b2c3d4e5f6a7b8c9')
  })
})
