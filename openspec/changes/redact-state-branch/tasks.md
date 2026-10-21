## 1. The rule

- [x] 1.1 `src/redact.ts`: `redact` for one string and `stringifyRedacted` for a document,
      replacing each credential the requirement lists with exactly `[redacted]`.
- [x] 1.2 `resolveToken` remembers every seat token it reads, before returning it.

## 2. Every write

- [x] 2.1 `writeState` and `appendRecord` serialize through `stringifyRedacted` and redact the
      commit message.

## 3. Tests

- [x] 3.1 One test per pattern: each GitHub prefix, `github_pat_`, `sk-ant-`, AWS, each Slack
      prefix, an `age` key, a private key block whole and cut off, `https://user:pass@host`,
      a seat token by value, and a credential-named variable's value. A 3-character value, a
      bare prefix, and a URL naming a user and no password are left alone.
- [x] 3.2 One test per write site, each with a token in an error message: a run row's reason,
      the transcript, the refusal envelope, `deferred.json`, the failures in triage's
      `decisions.ndjson`, a capacity
      observation's reset phrase, and any caller of `writeState` and `appendRecord`, commit
      message included.
- [x] 3.3 The forms a quoted credential takes: a key block JSON-escaped, quoted behind `> `,
      indented, encrypted, or cut off; URL credentials holding an `@`; and a token straight
      after `\n`, `\t` or `%3A`.
- [x] 3.4 What must survive redaction: a deferral (the record that an item was handed back)
      for an item whose id holds `highs_`, read back from `deferred.json` under the same item
      id; and the text after a key header that is only mentioned, even where a checksum as long
      as a key's line, such as a SHA-256 digest, follows it, or a later whole key block, which
      is itself redacted.
- [x] 3.5 A PGP private key block, whole and cut off, is redacted; a seat token of 8
      characters is redacted by value, and a 4-character one is not.
- [x] 3.6 Three tests: a key block JSON-escaped with `\r\n` is redacted; for a header
      mentioned in padded table rows, redaction finishes quickly and the text after the header
      is kept; and the text after a header is kept where `Name: value` lines that are not
      armour headers (the header lines PEM and PGP put before a key's body) follow it.
