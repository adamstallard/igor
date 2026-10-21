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
 *   proxy URL included (`rememberUrlCredentials`), and a proxy's user name with no password
 *   where it looks like a token;
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
 * read it; the cases where it does not are listed under Still open in
 * `openspec/changes/redact-state-branch/proposal.md`.
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
 * A user name with no password that is shorter than this is taken for a name, never a token.
 * GitHub, Anthropic and most other providers issue tokens of 20 characters or more; a shorter
 * token used as a proxy's user name is missed, by decision 14 of `redact-state-branch`.
 */
const MIN_TOKEN_USER_LENGTH = 20

/**
 * A plain name: words joined by `.`, `-`, `_`, `@` or `\`, holding at least one letter, such as
 * `build-agent.proxy-user01`, `ci-runner-2024`, `jdoe-3rd-party`, `jane.doe@corp.example` or
 * `CORP\jane.doe`. A word is not empty: optional digits, then optionally one run of letters in a
 * single case pattern (`doe`, `DOE` or `Doe`, in any script that has case), then optional digits.
 *
 * A token's random characters break this almost every time: letters resume after digits within a
 * word (`a3f9…`), or a run of letters changes case midway (`eIdz…`, `ejQ5`). So a user name that is
 * not this shape is taken for a token.
 */
const LETTER_RUN = String.raw`(?:\p{Lu}?\p{Ll}+|\p{Lu}+)`
// Each word has one way to match. Don't write a word as `[0-9]+`, optional letters, then
// `[0-9]*`: with no letters between them, the two could split a run of digits many ways, and a
// failed match would retry every split of every word, taking minutes on 80 characters.
const WORD = String.raw`(?:[0-9]+(?:${LETTER_RUN}[0-9]*)?|${LETTER_RUN}[0-9]*)`
const PLAIN_NAME = new RegExp(String.raw`^(?=.*\p{L})${WORD}(?:[._@\\-]${WORD})*$`, 'u')

/**
 * Registers the credentials in a URL such as a proxy's, `http://user:pass@proxy:3128`: the whole
 * URL, its user info (`user:pass`), and its password, the password percent-decoded as well. The scheme is optional, since
 * `gh` and `git` read `user:pass@proxy:3128` as an `http://` proxy. The user info runs to the last
 * `@` before the host, since a password can hold a raw `@`. A URL naming no user info registers
 * nothing.
 *
 * A Kerberos or NTLM proxy takes a user name with no password, or with an empty one (`user:`, as
 * curl writes it for Negotiate). Such a user name is registered only where it looks like a token
 * (`http://<token>@proxy`): once percent-decoded, 20 characters or more and not a `PLAIN_NAME`.
 * Then the whole URL, the user info, and the user name as written and decoded are registered. **Don't register every such user name:** it is usually a person's login, often
 * equal to a GitHub owner, and would then be redacted from item ids, state-branch keys and
 * posted links.
 */
export function rememberUrlCredentials(url: string): void {
  const userinfo = /^(?:[a-z][a-z0-9+.-]*:\/\/)?([^/?#]*)@/i.exec(url)?.[1]
  if (userinfo === undefined || userinfo === '') return
  const colon = userinfo.indexOf(':')
  const password = colon === -1 ? '' : userinfo.slice(colon + 1)
  if (password === '') {
    const user = colon === -1 ? userinfo : userinfo.slice(0, colon)
    if (!looksLikeToken(user)) return
    rememberSecret(url)
    rememberSecret(userinfo)
    rememberSecret(user)
    rememberSecret(decoded(user))
    return
  }
  rememberSecret(url)
  rememberSecret(userinfo)
  rememberSecret(password)
  rememberSecret(decoded(password))
}

/** A user name with no password that is taken for a token, by the rule `rememberUrlCredentials` gives. */
function looksLikeToken(user: string): boolean {
  const name = decoded(user)
  return name.length >= MIN_TOKEN_USER_LENGTH && !PLAIN_NAME.test(name)
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
