import { afterEach, describe, expect, it } from 'vitest'
import { resolveToken } from '../src/budget.js'
import { redact, rememberKey, rememberSecret, stringifyRedacted } from '../src/redact.js'
import { githubToken } from './tokens.js'

// Every token here is built at run time, so no token-shaped literal sits in the source for a
// scanner to flag.
// 22 characters (`11ABCDEFG0` twice, then `xy`), `_`, and 59 more: 82 after the prefix, the
// length FINE_GRAINED matches, in the two parts a real fine-grained token has.
const fineGrained = () => `github_pat_${'11ABCDEFG0'.repeat(2)}xy_${'Zq9Wv8Ut7S'.repeat(6).slice(0, 59)}`
const anthropic = (kind = 'api03') => `sk-ant-${kind}-${'Zq9_x-Y8'.repeat(6)}`

describe('credential redaction strips a GitHub token whose checksum is right', () => {
  for (const prefix of ['ghp_', 'gho_', 'ghu_', 'ghs_', 'ghr_']) {
    it(`a ${prefix} token`, () => {
      expect(redact(`auth failed for ${githubToken(prefix)}, retrying`, {})).toBe('auth failed for [redacted], retrying')
    })
  }

  it('not a token-shaped string whose checksum is wrong', () => {
    const fake = `ghp_${'A1b2C3d4E5'.repeat(4).slice(0, 36)}`
    expect(redact(`fixture ${fake} here`, {})).toBe(`fixture ${fake} here`)
  })

  it('not a token run on into more letters or digits', () => {
    const longer = `${githubToken('ghp_')}x`
    expect(redact(longer, {})).toBe(longer)
  })

  it('after a JSON-escaped line break and after a percent-encoded character', () => {
    const token = githubToken('ghs_')
    expect(redact(`"log":"CI\\n${token} leaked"`, {})).toBe('"log":"CI\\n[redacted] leaked"')
    expect(redact(`https%3A%2F%2Fx%3A${token}%40github.com`, {})).not.toContain(token)
  })

  it('not inside a word, as `highs_` holds `ghs_`', () => {
    const text = 'github:acme/highs_and_lows#7 const laughs_count = weighs_more'
    expect(redact(text, {})).toBe(text)
  })
})

describe('credential redaction strips a fine-grained GitHub token of its full length', () => {
  it('github_pat_ and 82 characters', () => {
    expect(redact(`token ${fineGrained()} expired`, {})).toBe('token [redacted] expired')
  })

  it('not a shorter one', () => {
    const short = `github_pat_${'11ABCDEFG0'.repeat(3)}`
    expect(redact(short, {})).toBe(short)
  })
})

describe('credential redaction strips an Anthropic key with its type and version', () => {
  for (const kind of ['api03', 'oat01', 'admin01']) {
    it(`sk-ant-${kind}-`, () => {
      expect(redact(`key ${anthropic(kind)} rejected`, {})).toBe('key [redacted] rejected')
    })
  }

  it('not one with no version, or under 40 characters', () => {
    const text = `sk-ant-${'Zq9_x-Y8'.repeat(6)} and sk-ant-api03-short`
    expect(redact(text, {})).toBe(text)
  })

  it('leaves a bare prefix, as text naming the prefixes has', () => {
    const text = 'GitHub tokens begin `ghp_` or `github_pat_`, Anthropic keys `sk-ant-`'
    expect(redact(text, {})).toBe(text)
  })
})

describe('credential redaction strips a registered secret by value', () => {
  afterEach(() => {
    delete process.env['IGOR_TEST_DEPLOY_KEY']
    delete process.env['IGOR_TEST_PLAIN']
  })

  it("a seat's token once read, whatever its variable's name", async () => {
    const token = 'seatvalue-0123456789abcdef'
    await resolveToken({ tokenEnv: 'SEAT_A' }, { SEAT_A: token })
    expect(redact(`env printed CLAUDE_CODE_OAUTH_TOKEN=${token}`, {})).toBe('env printed CLAUDE_CODE_OAUTH_TOKEN=[redacted]')
  })

  it('as written, JSON-escaped and URL-encoded', () => {
    const secret = 'pa"ss\\w/rd 42&x'
    rememberSecret(secret)
    expect(redact(`raw ${secret}`, {})).toBe('raw [redacted]')
    expect(redact(JSON.stringify({ said: `got ${secret}` }), {})).toBe('{"said":"got [redacted]"}')
    expect(redact(`https://h/?p=${encodeURIComponent(secret)}`, {})).toBe('https://h/?p=[redacted]')
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

  it('a seat token of 8 characters, and not one of 4', async () => {
    await resolveToken({ tokenEnv: 'SEAT_B' }, { SEAT_B: 'eightchr' })
    await resolveToken({ tokenEnv: 'SEAT_C' }, { SEAT_C: 'igor' })
    expect(redact('printed eightchr here', {})).toBe('printed [redacted] here')
    expect(redact('github:adamstallard/igor#12', {})).toBe('github:adamstallard/igor#12')
  })

  it('until it expires, where it was registered with an expiry', () => {
    rememberSecret('expired-secret-value', Date.now() - 1)
    rememberSecret('live-secret-value-1', Date.now() + 60_000)
    expect(redact('expired-secret-value live-secret-value-1', {})).toBe('expired-secret-value [redacted]')
  })

  it('a longer value whole, where it holds a shorter one', () => {
    rememberSecret('inner-secret')
    rememberSecret('outer-inner-secret-x')
    expect(redact('saw outer-inner-secret-x', {})).toBe('saw [redacted]')
  })
})

describe('credential redaction strips a registered private key, whole or by the line', () => {
  const lines = ['MIIEowIBAAKCAQEAu1SU1LfVLPHCozMxH2Mo4lgOEePzNm0tRgeLezV9ffvaRaB1', 'Zq9Wv8Ut7SrQpOnMlKjIhGfEdCbA0123456789abcdefghijklmnopqrstuvwxyz']
  const pem = `-----BEGIN RSA PRIVATE KEY-----\n${lines.join('\n')}\n-----END RSA PRIVATE KEY-----\n`
  rememberKey(pem)

  it('the whole key, as written and JSON-escaped', () => {
    expect(redact(`key:\n${pem}done`, {})).toBe('key:\n[redacted]done')
    expect(redact(JSON.stringify({ private_key: pem }), {})).toBe('{"private_key":"[redacted]"}')
  })

  it('a line of it, whatever prefix a quote puts before it', () => {
    const quoted = `-${lines[0]}\n     2\t${lines[1]}\n# "${lines[0]}\\n" +`
    expect(redact(quoted, {})).toBe('-[redacted]\n     2\t[redacted]\n# "[redacted]\\n" +')
  })

  it('not its BEGIN and END lines, which are not secret', () => {
    const text = 'the check looks for -----BEGIN RSA PRIVATE KEY----- headers'
    expect(redact(text, {})).toBe(text)
  })
})

describe('stringifyRedacted', () => {
  it('redacts every string in a document, keys included, and keeps the rest', () => {
    const token = githubToken('ghp_')
    expect(JSON.parse(stringifyRedacted({ [token]: [1, true, null, { why: `bad ${token}` }] }, undefined, {}))).toEqual({
      '[redacted]': [1, true, null, { why: 'bad [redacted]' }],
    })
  })
})

describe('credential redaction takes little time on text shaped like many near-tokens', () => {
  for (const [name, unit] of [
    ['sk-ant-', 'sk-ant-api03-'],
    ['ghp_', 'ghp_'],
    ['github_pat_', 'github_pat_'],
  ] as const) {
    it(`64 KiB of ${name} runs`, () => {
      const text = unit.repeat(Math.ceil(65536 / unit.length))
      const started = performance.now()
      redact(text, {})
      expect(performance.now() - started).toBeLessThan(200)
    })
  }
})
