/**
 * Credential redaction: the one rule for taking credentials out of text Igor keeps. Every write
 * to the state branch passes through it, in `writeState` and `appendRecord`, file contents and
 * commit messages alike.
 *
 * **Why:** the state branch is as visible as its repository, so on a public repository anyone
 * can read it. An error message can quote a token or a URL with credentials in it: a git
 * command echoing its remote, or a provider's response.
 *
 * Each of these becomes `[redacted]`:
 *
 * - the token of every seat the Igor has read (`rememberSecret`, called by `resolveToken`),
 *   whatever its source and whatever its variable's name;
 * - the value of every variable in the Igor's environment whose name contains `TOKEN`, `KEY`,
 *   `SECRET`, `PASSWORD` or `CREDENTIAL` (case-sensitively, anywhere in the name), where the
 *   value is at least 8 characters long. The value is matched exactly. The worker's
 *   environment is built from the Igor's and a seat token (`workerEnv`), so this covers the
 *   worker's too;
 * - a private key block (`-----BEGIN … PRIVATE KEY-----` to its `END` line), an `age` secret
 *   key (`AGE-SECRET-KEY-1…`), and a token by its prefix, at the start of a word: GitHub
 *   (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), Anthropic (`sk-ant-`), an AWS
 *   access key ID (`AKIA` and 16 capital letters or digits), and Slack (`xoxa-`, `xoxb-`,
 *   `xoxp-`, `xoxr-`, `xoxs-`);
 * - the `user:pass@` part of a URL such as `https://user:pass@host/…`, an `@` in either part
 *   included. A URL naming a user and no password, `ssh://git@host`, is left alone.
 */

export const REDACTED = '[redacted]'

const CREDENTIAL_NAME = /TOKEN|KEY|SECRET|PASSWORD|CREDENTIAL/
const MIN_VALUE_LENGTH = 8

// A header starts a block only where a key's body follows it: a run of 60 base64 characters,
// almost a full 64-character line, on the next line or after spaces on the same line, or after an
// encrypted key's `Proc-Type:` and `DEK-Info:` lines (up to six line breaks and such lines). A
// line break counts whether real or JSON-escaped (`\n`), and a line may be indented or quoted
// behind `> `. A header with no body after it is only mentioned, and is redacted alone so the text
// after it survives, such as a refusal's reset phrase.
const KEY_BODY_FOLLOWS =
  '(?=(?:(?:[ \\t]*(?:\\r?\\n|\\\\n)[ \\t>]*|[ \\t]+)(?:(?:Proc-Type|DEK-Info):[^\\r\\n\\\\]*)?){1,6}[A-Za-z0-9+/]{60})'
// A block runs to its `END` line whatever lies between. Don't match the body's characters
// instead: that misses a block that is JSON-escaped, indented or quoted, and leaks its body. A
// block cut off before its `END` line is redacted to the end of the text. The span to `END` is
// bounded at 16 KiB, so each header costs at most that much scanning however long the text;
// a block longer than that is redacted as cut off, to the end of the text.
const PRIVATE_KEY = new RegExp(
  `-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----(?:${KEY_BODY_FOLLOWS}(?:[\\s\\S]{0,16384}?-----END [A-Z0-9 ]*PRIVATE KEY-----|[\\s\\S]*))?`,
  'g',
)
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

/** Adds a seat's token to the values redacted from then on. */
export function rememberSecret(value: string): void {
  if (value !== '') seatTokens.add(value)
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
  return out
    .replace(PRIVATE_KEY, REDACTED)
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
