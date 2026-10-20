import { afterEach, describe, expect, it } from 'vitest'
import { resolveToken } from '../src/budget.js'
import { redact, stringifyRedacted } from '../src/redact.js'

// Each test builds its token at run time, from a prefix and this body, so no token-shaped
// literal sits in the source for a scanner to flag.
const body = 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'

describe('credential redaction strips a token by its prefix', () => {
  for (const prefix of ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_']) {
    it(`a GitHub ${prefix} token`, () => {
      expect(redact(`auth failed for ${prefix}${body}, retrying`)).toBe('auth failed for [redacted], retrying')
    })
  }

  it('a GitHub fine-grained github_pat_ token, underscores included', () => {
    expect(redact(`token github_pat_11ABC_${body} expired`)).toBe('token [redacted] expired')
  })

  it('an Anthropic sk-ant- token, dashes included', () => {
    expect(redact(`key sk-ant-oat01-${body}-x_y rejected`)).toBe('key [redacted] rejected')
  })

  it('an AWS access key ID', () => {
    expect(redact(`id AKIA${'ABCDEFGH12345678'} denied`)).toBe('id [redacted] denied')
  })

  for (const prefix of ['xoxa-', 'xoxb-', 'xoxp-', 'xoxr-', 'xoxs-']) {
    it(`a Slack ${prefix} token`, () => {
      expect(redact(`slack ${prefix}1234-${body} said no`)).toBe('slack [redacted] said no')
    })
  }

  it('an age secret key', () => {
    expect(redact(`AGE-SECRET-KEY-1${body.toUpperCase()} leaked`)).toBe('[redacted] leaked')
  })

  it('a private key block, across lines', () => {
    const line = `${body}${body}`.slice(0, 64)
    const block = `-----BEGIN OPENSSH PRIVATE KEY-----\n${line}\n${body}\n-----END OPENSSH PRIVATE KEY-----`
    expect(redact(`before\n${block}\nafter`)).toBe('before\n[redacted]\nafter')
  })

  it('a private key block cut off before its END line, to the end of the text', () => {
    const line = `${body}${body}`.slice(0, 64)
    expect(redact(`before\n-----BEGIN RSA PRIVATE KEY-----\n${line}\n${body}`)).toBe('before\n[redacted]')
  })

  it('leaves a bare prefix with nothing after it, as text naming the prefix has', () => {
    expect(redact('GitHub tokens begin `ghp_` or `github_pat_`')).toBe('GitHub tokens begin `ghp_` or `github_pat_`')
  })
})

describe('credential redaction strips the credentials in a URL', () => {
  it('the user:pass@ part of https://user:pass@host', () => {
    expect(redact('fatal: unable to access https://user:pass@github.com/o/r.git/')).toBe(
      'fatal: unable to access https://[redacted]@github.com/o/r.git/',
    )
  })

  it('in any scheme, with a token for the password', () => {
    expect(redact('remote http://x-access-token:abc123def@example.com:8080/x')).toBe(
      'remote http://[redacted]@example.com:8080/x',
    )
  })

  it('leaves a URL naming a user and no password', () => {
    expect(redact('cloning ssh://git@github.com/o/r.git')).toBe('cloning ssh://git@github.com/o/r.git')
  })

  it('leaves a URL with no credentials', () => {
    expect(redact('see https://github.com/o/r/issues/7')).toBe('see https://github.com/o/r/issues/7')
  })
})

describe('credential redaction strips a credential the Igor knows, by value', () => {
  afterEach(() => {
    delete process.env['IGOR_TEST_DEPLOY_KEY']
    delete process.env['IGOR_TEST_PLAIN']
  })

  it("a seat's token once read, whatever its variable's name", async () => {
    const token = `seatvalue-${body}`
    await resolveToken({ tokenEnv: 'SEAT_A' }, { SEAT_A: token })
    expect(redact(`env printed CLAUDE_CODE_OAUTH_TOKEN=${token}`)).toBe('env printed CLAUDE_CODE_OAUTH_TOKEN=[redacted]')
  })

  it('the value of a variable whose name holds a credential word', () => {
    process.env['IGOR_TEST_DEPLOY_KEY'] = 'opensesame42'
    expect(redact('used opensesame42 to deploy')).toBe('used [redacted] to deploy')
  })

  it('not a value shorter than 8 characters', () => {
    process.env['IGOR_TEST_DEPLOY_KEY'] = 'abc'
    expect(redact('abc is fine')).toBe('abc is fine')
  })

  it('not the value of a variable whose name holds no credential word', () => {
    process.env['IGOR_TEST_PLAIN'] = 'opensesame42'
    expect(redact('used opensesame42 to deploy')).toBe('used opensesame42 to deploy')
  })
})

describe('stringifyRedacted', () => {
  it('redacts every string in a document, keys included, and keeps the rest', () => {
    const token = `ghp_${body}`
    expect(JSON.parse(stringifyRedacted({ [token]: [1, true, null, { why: `bad ${token}` }] }))).toEqual({
      '[redacted]': [1, true, null, { why: 'bad [redacted]' }],
    })
  })

  it('matches a key block as written, not as JSON escapes its line breaks', () => {
    const block = `-----BEGIN PRIVATE KEY-----\n${`${body}${body}`.slice(0, 64)}\n-----END PRIVATE KEY-----`
    expect(JSON.parse(stringifyRedacted({ a: `x ${block}`, b: 'kept' }))).toEqual({ a: 'x [redacted]', b: 'kept' })
  })
})

describe('credential redaction leaves text that only looks like part of a credential', () => {
  it('a word that ends in a GitHub prefix, as `highs_` holds `ghs_`', () => {
    const text = 'github:acme/highs_and_lows#7 const laughs_count = weighs_more'
    expect(redact(text)).toBe(text)
  })

  it('a private key header with no key after it, so the text after it survives', () => {
    const text = '{"text":"the check looks for -----BEGIN RSA PRIVATE KEY----- headers"}\n{"result":"Your limit will reset at 5pm (UTC)."}'
    expect(redact(text)).toContain('Your limit will reset at 5pm (UTC).')
  })
})

describe('credential redaction in a URL whose credentials hold an @', () => {
  it('a user name that is an email address', () => {
    expect(redact('https://bot@example.com:hunter2secret@git.example.com/o/r.git/')).toBe(
      'https://[redacted]@git.example.com/o/r.git/',
    )
  })

  it('a password holding an @', () => {
    expect(redact('http://igor:p@ssw0rdXYZ@proxy.corp:3128')).toBe('http://[redacted]@proxy.corp:3128')
  })
})

describe('credential redaction of a private key in the forms a transcript quotes it', () => {
  // A PEM body line is 64 base64 characters.
  const line = `MIIEow${'IBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV9ffvaR'.slice(0, 58)}`

  it('a JSON-escaped block, as a service account file holds it', () => {
    const text = `"private_key":"-----BEGIN PRIVATE KEY-----\\n${line}\\n${line}\\n-----END PRIVATE KEY-----\\n"`
    expect(redact(text)).toBe('"private_key":"[redacted]\\n"')
  })

  it('a block quoted in markdown', () => {
    const text = `> -----BEGIN PRIVATE KEY-----\n> ${line}\n> ${line}\n> -----END PRIVATE KEY-----`
    expect(redact(text)).toBe('> [redacted]')
  })

  it('an encrypted block cut off before its END line', () => {
    const text = `-----BEGIN RSA PRIVATE KEY-----\nProc-Type: 4,ENCRYPTED\nDEK-Info: AES-128-CBC,3F17A2\n\n${line}\n${line}`
    expect(redact(text)).toBe('[redacted]')
  })

  it('an indented block cut off before its END line', () => {
    expect(redact(`    -----BEGIN OPENSSH PRIVATE KEY-----\n    ${line}\n    ${line}`)).toBe('    [redacted]')
  })

  it('a JSON-escaped block cut off before its END line', () => {
    expect(redact(`output: "-----BEGIN PRIVATE KEY-----\\n${line}\\n${line.slice(0, 20)}`)).toBe('output: "[redacted]')
  })
})

describe('credential redaction of a token right after an escape', () => {
  it('after a JSON-escaped line break', () => {
    expect(redact(`"body":"CI log:\\nghp_${body} leaked"`)).toBe('"body":"CI log:\\n[redacted] leaked"')
  })

  it('after a JSON-escaped tab', () => {
    expect(redact('"key:\\tAKIAABCDEFGHIJKLMNOP"')).toBe('"key:\\t[redacted]"')
  })

  it('after a percent-encoded character', () => {
    expect(redact(`https%3A%2F%2Fx%3Aghp_${body}%40github.com`)).not.toContain(`ghp_${body}`)
  })
})

describe('credential redaction keeps the text around a private key header that is only mentioned', () => {
  it('a mention followed by a checksum', () => {
    const text = `Fails CI on a \`-----BEGIN RSA PRIVATE KEY-----\` header.\nFixture checksum (sha256): ${'9f86d081'.repeat(8)}\n\nOpen question: cover PGP too?`
    expect(redact(text)).toBe(
      `Fails CI on a \`[redacted]\` header.\nFixture checksum (sha256): ${'9f86d081'.repeat(8)}\n\nOpen question: cover PGP too?`,
    )
  })

  it('a mention followed later by a whole block', () => {
    const line = `${body}${body}`.slice(0, 64)
    const text = `Scanner flags \`-----BEGIN RSA PRIVATE KEY-----\`. Keep this note. Fixture:\n-----BEGIN EC PRIVATE KEY-----\n${line}\n-----END EC PRIVATE KEY-----\nTail.`
    expect(redact(text)).toBe('Scanner flags `[redacted]`. Keep this note. Fixture:\n[redacted]\nTail.')
  })
})
