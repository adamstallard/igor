import { crc32 } from 'node:zlib'

/**
 * Credential redaction: the one rule for taking credentials out of text an Igor (one running
 * instance of this service) keeps or posts. Every write to the state branch passes through it,
 * in `writeState` and `appendRecord`, file contents and commit messages alike. So does every
 * text the Igor posts to a tracker or a code host: a comment (`report`), an issue's title and
 * body (`createIssue`), a pull request's title and body (`openPullRequest`), and a commit
 * message (`createBranchWithFiles`, `commitOnBranch`, `mergeIntoBranch`). The files a commit
 * carries are the work itself and are posted as written.
 *
 * **Why:** the state branch is as visible as the repository that holds it, and a post is as
 * visible as the repository it is posted to; on a public repository anyone can read either. An error message can quote a token: a git
 * command echoing its remote, or a provider's response.
 *
 * The rule matches **by value**: every secret the Igor holds or gives a worker is registered as
 * the Igor obtains it, and each registered value becomes `[redacted]` wherever it appears, as
 * written, JSON-escaped or URL-encoded. The values are:
 *
 * - the token of every seat the Igor has read, registered by `resolveToken` in `src/budget.ts`;
 * - the GitHub App's private key, registered whole and line by line by `readCredentials`;
 * - the App's signed JWT and each installation token it mints (`src/app.ts`), each until it
 *   expires;
 * - every credential `workerEnv` puts in a worker's environment, the credentials in a forwarded
 *   proxy URL included (`rememberUrlCredentials`), and a proxy's user name with no password,
 *   registered with its host as `<user>@<host>`;
 * - the value of every variable in the Igor's environment whose name contains `TOKEN`, `KEY`,
 *   `SECRET`, `PASSWORD` or `CREDENTIAL` (case-sensitively, anywhere in the name).
 *
 * A value shorter than 8 characters is not matched: a short placeholder such as `igor` would
 * rewrite every item id that holds it. Code that obtains a new kind of secret must register it
 * with `rememberSecret`, or it is not redacted.
 *
 * Patterns are only a backstop, for a real token the Igor never held, and they match exact
 * shapes alone: a GitHub token whose checksum is right, a fine-grained GitHub token of its full
 * length, and an Anthropic key with its type and version. Any other secret the Igor never held
 * is not redacted. Such a secret usually reaches the Igor's text from the repository it works
 * on or the item it reads, where anyone who can read the state branch or the post can already
 * read it. The cases where a secret Igor never held does reach its text from elsewhere are listed
 * under Still open in `openspec/changes/redact-state-branch/proposal.md`.
 */

export const REDACTED = '[redacted]'

const CREDENTIAL_NAME = /TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL/
const MIN_VALUE_LENGTH = 8

/**
 * Every registered value, in each form it is matched in, mapped to the time in milliseconds
 * when it stops being a secret, or `Infinity`. Held only in memory: never written, logged or
 * handed outside this module.
 *
 * A seat's token never expires here, even once its seat is removed from the configuration,
 * since a removed seat's token may still be live. A minted token or JWT expires when GitHub
 * stops accepting it, and is dropped then, so a long-running Igor does not keep one per hour.
 */
const registry = new Map<string, number>()

/** A value as written, JSON-escaped, and URL-encoded: the forms an error can quote it in. */
function forms(value: string): string[] {
  const out = [value, JSON.stringify(value).slice(1, -1)]
  try {
    out.push(encodeURIComponent(value))
  } catch {
    // A lone surrogate cannot be URL-encoded, and then cannot be quoted URL-encoded either.
  }
  return out
}

/**
 * Registers a secret: from then on it becomes `[redacted]` wherever it appears, in any of its
 * `forms`. With `until`, a time in milliseconds, it is dropped once that time has passed. A
 * value registered again keeps the later of its two times, so registering it with no `until`
 * keeps it for good. A value shorter than 8 characters is not registered.
 */
export function rememberSecret(value: string, until: number = Infinity): void {
  if (value.length < MIN_VALUE_LENGTH) return
  for (const form of forms(value)) registry.set(form, Math.max(registry.get(form) ?? until, until))
}

/**
 * Registers a PEM private key as given, trimmed of surrounding whitespace, and each of its base64
 * lines, so a quote of any part of it is redacted. Its `-----BEGIN`/`-----END` lines and armour
 * headers are not secret and are not registered.
 */
export function rememberKey(pem: string): void {
  rememberSecret(pem)
  rememberSecret(pem.trim())
  for (const line of pem.split(/\r?\n/)) {
    const body = line.trim()
    if (/^[A-Za-z0-9+/=]+$/.test(body)) rememberSecret(body)
  }
}

/**
 * Registers the credentials in a URL such as a proxy's, `http://user:pass@proxy:3128`: the whole
 * URL, its user info (`user:pass`), and its password, the password percent-decoded as well. The
 * scheme is optional, since `gh` and `git` read `user:pass@proxy:3128` as an `http://` proxy. The
 * user info runs to the last `@` before the host, since a password can hold a raw `@`. A URL
 * naming no user info registers nothing.
 *
 * A Kerberos or NTLM proxy takes a user name with no password, or with an empty one (`user:`, as
 * curl writes it for Negotiate). Such a user name is registered only with its host, as
 * `<user>@<host>`: the user name as written, percent-decoded and percent-encoded, each followed
 * by `@` and the host without its port. The whole URL is registered too, and so is
 * `<user info>@<host>`, which differs from `<user>@<host>` where an empty password leaves a `:`
 * after the name (`user:@proxy`). Such a URL naming no host registers nothing; a URL with a
 * password is registered as above whether or not it names a host.
 *
 * **Don't register such a user name bare**, by its shape or any other test. It is usually a
 * person's login, often equal to a GitHub owner, and would then be redacted from item ids,
 * state-branch keys and posted links. A test of its shape errs both ways: decision 14 in
 * `openspec/changes/redact-state-branch/proposal.md` records a length and plain-name test taking
 * real logins for tokens and single-case tokens for names. No item id holds `<user>@<host>`, and
 * a tool that quotes a proxy's credential is expected to quote its host with it (task 3.9 checks
 * that).
 */
export function rememberUrlCredentials(url: string): void {
  const authority = /^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/?#]*)/i.exec(url)?.[1] ?? ''
  const at = authority.lastIndexOf('@')
  if (at <= 0) return
  const userinfo = authority.slice(0, at)
  const colon = userinfo.indexOf(':')
  const password = colon === -1 ? '' : userinfo.slice(colon + 1)
  if (password === '') {
    const host = hostOf(authority.slice(at + 1))
    if (host === '') return
    const user = colon === -1 ? userinfo : userinfo.slice(0, colon)
    rememberSecret(url)
    rememberSecret(`${userinfo}@${host}`)
    for (const name of new Set([user, decoded(user), encoded(decoded(user))])) rememberSecret(`${name}@${host}`)
    return
  }
  rememberSecret(url)
  rememberSecret(userinfo)
  rememberSecret(password)
  rememberSecret(decoded(password))
}

/** The host of `host:port`, without its port; an IPv6 address keeps its brackets. */
function hostOf(hostPort: string): string {
  if (hostPort.startsWith('[')) {
    const close = hostPort.indexOf(']')
    return close === -1 ? hostPort : hostPort.slice(0, close + 1)
  }
  const colon = hostPort.indexOf(':')
  return colon === -1 ? hostPort : hostPort.slice(0, colon)
}

/** Percent-encoded, or as given where a lone surrogate cannot be encoded. */
function encoded(text: string): string {
  try {
    return encodeURIComponent(text)
  } catch {
    return text
  }
}

/** Percent-decoded, or as written where a malformed escape cannot be decoded. */
function decoded(text: string): string {
  try {
    return decodeURIComponent(text)
  } catch {
    return text
  }
}

/**
 * The exact values to redact, longest first, so a value holding another is replaced whole.
 * Read on every call: a variable set after start-up is a credential from then on.
 */
function knownValues(env: NodeJS.ProcessEnv, now: number = Date.now()): string[] {
  const values = new Set<string>()
  for (const [form, until] of registry) {
    if (until <= now) registry.delete(form)
    else values.add(form)
  }
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && value.length >= MIN_VALUE_LENGTH && CREDENTIAL_NAME.test(name)) {
      for (const form of forms(value)) values.add(form)
    }
  }
  return [...values].sort((a, b) => b.length - a.length)
}

// A token counts where no letter or digit comes straight before it, so `highs_` holds no GitHub
// prefix. It also counts straight after an escape. An error can quote text that is already
// JSON-escaped (`\n`, `\r`, `\t`) or percent-encoded (`%3A`); an escape ends in a letter or digit,
// so without this the rule above would refuse the token after it.
const START = String.raw`(?:(?<![A-Za-z0-9])|(?<=\\[nrt])|(?<=%[0-9A-Fa-f]{2}))`

// A GitHub token of the checksummed format: its prefix, 30 random characters, and the base62
// CRC32 of those 30 in its last 6. Described in
// https://github.blog/engineering/platform-security/behind-githubs-new-authentication-token-formats/
// and measured against a real `gho_` token: the checksum covers the 30 characters, not the
// prefix. A stateless installation token (`ghs_<app id>_<JWT>`) has no checksum; the Igor
// registers each one it mints by value.
const GITHUB = new RegExp(`${START}gh[pousr]_([A-Za-z0-9]{30})([A-Za-z0-9]{6})(?![A-Za-z0-9])`, 'g')
// A fine-grained GitHub token. GitHub documents only its prefix
// (https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/about-authentication-to-github);
// the 82-character body is the length gitleaks' `github-fine-grained-pat` rule matches.
const FINE_GRAINED = new RegExp(`${START}github_pat_[A-Za-z0-9_]{82}(?![A-Za-z0-9_])`, 'g')
// An Anthropic key: `sk-ant-`, its type and version such as `api03-` or `oat01-`, and at least
// 40 URL-safe characters.
const ANTHROPIC = new RegExp(`${START}sk-ant-[a-z]{1,16}[0-9]{2}-[A-Za-z0-9_-]{40,}`, 'g')

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** A number in base 62, zero-padded to 6 digits, as a GitHub token's checksum is written. */
function base62(n: number): string {
  let out = ''
  for (let rest = n; rest > 0; rest = Math.floor(rest / 62)) out = BASE62[rest % 62] + out
  return out.padStart(6, '0')
}

function redactWith(text: string, values: readonly string[]): string {
  let out = text
  for (const value of values) out = out.split(value).join(REDACTED)
  return out
    .replace(GITHUB, (whole, random: string, checksum: string) =>
      base62(crc32(random)) === checksum ? REDACTED : whole,
    )
    .replace(FINE_GRAINED, REDACTED)
    .replace(ANTHROPIC, REDACTED)
}

/** One string, redacted. */
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  return redactWith(text, knownValues(env))
}

/**
 * `JSON.stringify` with every string redacted, object keys included. Redacted as the document
 * is serialized, not in its serialized text, so a value is matched as it was written rather than
 * as JSON escapes it.
 */
export function stringifyRedacted(value: unknown, space?: number, env: NodeJS.ProcessEnv = process.env): string {
  const values = knownValues(env)
  return JSON.stringify(
    value,
    (_key, v: unknown) => {
      if (typeof v === 'string') return redactWith(v, values)
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [redactWith(k, values), x]))
      }
      return v
    },
    space,
  )
}
