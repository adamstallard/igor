/**
 * Credential redaction: the one rule for taking credentials out of text an Igor (one running
 * instance of this service) keeps. Every write
 * to the state branch passes through it, in `writeState` and `appendRecord`, file contents and
 * commit messages alike.
 *
 * **Why:** the state branch is as visible as its repository, so on a public repository anyone
 * can read it. An error message can quote a token or a URL with credentials in it: a git
 * command echoing its remote, or a provider's response.
 *
 * Each of these becomes `[redacted]`:
 *
 * - the token of every seat the Igor has read, whatever its source and whatever its
 *   variable's name, where the token is at least 8 characters long. A seat is a model
 *   subscription the Igor spends; its token is the credential the worker runs on. Code that
 *   obtains a seat token must pass it to `rememberSecret`, as `resolveToken` in `src/budget.ts`
 *   does, or the token is not redacted by value;
 * - the value of every variable in the Igor's environment whose name contains `TOKEN`, `KEY`,
 *   `SECRET`, `PASSWORD` or `CREDENTIAL` (case-sensitively, anywhere in the name), where the
 *   value is at least 8 characters long. The value is matched exactly. The worker, the model
 *   subprocess that does an item's work, gets an environment that `workerEnv` builds from the
 *   Igor's own and a seat token, so this covers the worker's too;
 * - a private key block (`-----BEGIN … PRIVATE KEY-----`, or a PGP block's `-----BEGIN PGP
 *   PRIVATE KEY BLOCK-----`, to its `END` line), an `age` secret key (`AGE-SECRET-KEY-1…`),
 *   and a token by its prefix, at the start of a word or straight after an escape: GitHub
 *   (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), Anthropic (`sk-ant-`), an AWS
 *   access key ID (`AKIA` and 16 capital letters or digits), and Slack (`xoxa-`, `xoxb-`,
 *   `xoxp-`, `xoxr-`, `xoxs-`);
 * - the `user:pass@` part of a URL such as `https://user:pass@host/…`, an `@` in either part
 *   included. A URL naming a user and no password, `ssh://git@host`, is left alone.
 */

export const REDACTED = '[redacted]'

const CREDENTIAL_NAME = /TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL/
const MIN_VALUE_LENGTH = 8

// Where a key block starts and ends. Body detection is a bounded scan in `keyBodyFollows`
// rather than one pattern. Don't fold it back into one. When several parts of a pattern can
// each take a run of spaces, the engine tries every way of splitting the run between them: that
// took seconds on four markdown table rows, each holding a header padded with 40 spaces.
const KEY_BEGIN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/g
const KEY_END = /-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/
// A line break written as is, or JSON-escaped (`\n`, `\r\n`). `keyBodyFollows` splits lines on
// it, so a key quoted inside a JSON string is found too.
const LINE_BREAK = /\r?\n|\\r\\n|\\n/
// The header lines a PEM key (`Proc-Type:`, `DEK-Info:`) or PGP armour (the rest) may carry
// before its body. Only these: a 64-character hex digest also matches `BODY_LINE`, so with any
// `Name: value` line allowed, a mentioned header followed by `Hash:  <hex digest>` would read
// as a key, and everything after it would be redacted.
const ARMOUR_HEADER = /^(?:Proc-Type|DEK-Info|Version|Comment|Charset|Hash|MessageID):/
// Almost a full 64-character body line: 60 rather than 64, so a last line, or a line a quote
// cut off, still counts. Base64 is the alphabet of PEM and PGP bodies.
const BODY_LINE = /^[A-Za-z0-9+/]{60}/
const LOOK_AHEAD = 1024
const MAX_HEADER_LINES = 8
const MAX_BLOCK = 16 * 1024

/**
 * Whether a key's body follows a `BEGIN` line that ends at `from`: on the same line after
 * spaces or tabs, or on a later line after any armour header lines and blank lines. A later
 * line may be indented or quoted behind `> `. `from` is the end of the `BEGIN` line's header, so
 * any `>` before that header is already behind it and needs no stripping. Anything else after the `BEGIN` line means the text only
 * mentions it, as does a body that starts more than 8 lines or 1 KiB after it.
 */
function keyBodyFollows(text: string, from: number): boolean {
  const lines = text.slice(from, from + LOOK_AHEAD).split(LINE_BREAK)
  const rest = (lines[0] ?? '').replace(/^[ \t]+/, '')
  if (BODY_LINE.test(rest)) return true
  if (rest !== '') return false
  for (const raw of lines.slice(1, 1 + MAX_HEADER_LINES)) {
    const line = raw.replace(/^[ \t>]+/, '')
    if (BODY_LINE.test(line)) return true
    if (line.trim() !== '' && !ARMOUR_HEADER.test(line)) return false
  }
  return false
}

/**
 * Each private key block becomes `[redacted]`: from its `BEGIN` line to its `END` line,
 * whatever lies between, where the `END` line is within 16 KiB. Where it is not, the block is
 * redacted to the end of the text: a block that long is taken for one cut off, and keeping
 * text after it could keep its body. A `BEGIN` line with no body after it is only mentioned,
 * and is redacted alone so the text after it survives, such as a refusal's reset phrase. For
 * each `BEGIN` line, `keyBodyFollows` reads at most 1 KiB and the search for `END` at most
 * 16 KiB, and a block's span is skipped once redacted, so each character starts at most one
 * `BEGIN` match and the time is linear in the text's length.
 */
function redactKeys(text: string): string {
  let out = ''
  let at = 0
  for (const begin of text.matchAll(KEY_BEGIN)) {
    if (begin.index < at) continue
    const after = begin.index + begin[0].length
    out += text.slice(at, begin.index) + REDACTED
    at = after
    if (!keyBodyFollows(text, after)) continue
    const end = KEY_END.exec(text.slice(after, after + MAX_BLOCK))
    if (end === null) return out
    at = after + end.index + end[0].length
  }
  return out + text.slice(at)
}

// A prefix counts only at the start of a word: `highs_` holds `ghs_`, and an item id holding
// such a word must still read back as the same key. A token may also start straight after an
// escape, since an error can quote text that is already JSON-escaped (`\n`, `\t`) or
// percent-encoded (`%3A`), and the escape's last character is a letter or digit.
const TOKEN =
  /(?:(?<![A-Za-z0-9])|(?<=\\[nrt])|(?<=%[0-9A-Fa-f]{2}))(?:gh[pousr]_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|sk-ant-[A-Za-z0-9_-]+|AKIA[A-Z0-9]{16}|xox[abprs]-[A-Za-z0-9-]+|AGE-SECRET-KEY-1[A-Za-z0-9]+)/g
// The user info runs to the last `@` before the host, since a user name can be an email
// address and a password can hold a raw `@`. It is a credential only where it holds a `:`. The
// scheme's length is bounded so a long dotted run with no URL in it is scanned in linear time.
const URL_USERINFO = /([a-z][a-z0-9+.-]{0,31}:\/\/)([^\s/?#'"<>]*)@/gi

const seatTokens = new Set<string>()

/**
 * Adds a seat's token to the values redacted from then on. A token shorter than 8 characters
 * is not added, as for a variable's value: matched by value, a short placeholder token such as
 * `igor` would rewrite every item id that contains it, such as the item id
 * `github:adamstallard/igor#12`.
 */
export function rememberSecret(value: string): void {
  if (value.length >= MIN_VALUE_LENGTH) seatTokens.add(value)
}

/**
 * The exact values to redact, longest first, so a value holding another is replaced whole.
 * Read on every call: a variable set after start-up is a credential from then on.
 */
function knownValues(env: NodeJS.ProcessEnv): string[] {
  const values = new Set(seatTokens)
  for (const [name, value] of Object.entries(env)) {
    if (value !== undefined && value.length >= MIN_VALUE_LENGTH && CREDENTIAL_NAME.test(name)) values.add(value)
  }
  return [...values].sort((a, b) => b.length - a.length)
}

function redactWith(text: string, values: readonly string[]): string {
  let out = text
  for (const value of values) out = out.split(value).join(REDACTED)
  return redactKeys(out)
    .replace(URL_USERINFO, (whole, scheme: string, userinfo: string) =>
      userinfo.includes(':') ? `${scheme}${REDACTED}@` : whole,
    )
    .replace(TOKEN, REDACTED)
}

/** One string, redacted. */
export function redact(text: string, env: NodeJS.ProcessEnv = process.env): string {
  return redactWith(text, knownValues(env))
}

/**
 * `JSON.stringify` with every string redacted, object keys included. Redacted as the document
 * is serialized, not in its serialized text, so a key block's lines or a value holding a quote
 * are matched as they were written rather than as JSON escapes them.
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
