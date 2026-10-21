## 1. The rule

- [x] 1.1 `src/redact.ts`: `redact` for one string and `stringifyRedacted` for a document,
      replacing each registered secret and each exact-shape token with exactly `[redacted]`.
- [x] 1.2 The registry: `rememberSecret` (with an optional expiry), `rememberKey` and
      `rememberUrlCredentials`, each value held as written, JSON-escaped and URL-encoded.
- [x] 1.3 Registration where each secret is obtained: `resolveToken` (seat tokens),
      `readCredentials` (the App's private key), `appJwt` and `mint` (the JWT and installation
      tokens, until they expire), and `workerEnv` (forwarded proxy URLs, and the host's own login when a seat names
      no token).
- [x] 1.4 Remove key-block detection, URL-credential patterns, the JWT pattern, and the AWS,
      Slack and `age` patterns.
- [x] 1.5 `rememberUrlCredentials`: a user name with no password, or an empty one, is
      registered, with the whole URL, only where it is, once decoded, 20 characters or more and
      not a plain name (decision 14). The plain-name test runs in linear time.

## 2. Every write

- [x] 2.1 `writeState` and `appendRecord` serialize through `stringifyRedacted` and redact the
      commit message.
- [x] 2.2 The tracker's `report` and `createIssue`, and `openPullRequest`,
      `createBranchWithFiles`, `commitOnBranch` and `mergeIntoBranch`, pass every text they post
      through `redact`: comment bodies, issue and pull request titles and bodies, and commit
      messages.

## 3. Tests

- [x] 3.1 Exact shapes: each GitHub prefix with a right checksum is redacted, and a wrong
      checksum, a token run on into more characters, and a word holding `ghs_` are not; a
      fine-grained token of 82 characters is redacted and a shorter one is not; an Anthropic key
      of each type is redacted, and one with no version or under 40 characters is not; a token
      straight after `\n` or `%3A` is redacted.
- [x] 3.2 By value: a seat token whatever its variable; a registered secret as written,
      JSON-escaped and URL-encoded; a credential-named variable's value, not a 3-character one,
      and not a plain variable's; a seat token of 8 characters, not one of 4; a secret until its
      expiry; the longer of two secrets whole, where one holds the other; a private key whole, and each line of
      it behind any prefix; its `BEGIN` line is not redacted.
- [x] 3.3 Registration (`test/redact-registry.test.ts`): the App's key from its file, its JWT,
      a minted installation token, an ambient login and a forwarded proxy URL's credentials are
      each redacted with an empty environment, a proxy URL written without a scheme too; a
      proxy URL with no credentials is not. In `test/redact-proxy-user.test.ts`: a passwordless
      user name that looks like a token is redacted, mixed-case and base64url ones included.
      These are not: a plain name; one under 20 characters; a login with a word of digits; a
      `DOMAIN\user` login; one with accented letters; one with an empty password; and one that
      is 20 characters percent-encoded but under 20 decoded. A long name of digit words is
      judged in under a second.
- [x] 3.4 One test per write site, each with a registered secret and a real-shaped token in an
      error message: a run row's reason, the transcript, the refusal envelope, `deferred.json`,
      triage's `decisions.ndjson`, a capacity observation's reset phrase, and one test each
      through `writeState` and `appendRecord` directly, commit message included.
- [x] 3.5 One test per posting path: a comment, an issue, a pull request opened by the code
      host (title, body and commit message), a resolution's commit message (the commit that
      brings a base into an artifact's branch), `openPullRequest`,
      `createBranchWithFiles` and `commitOnBranch` called directly, and `mergeIntoBranch`'s
      message.
- [x] 3.6 The acceptance test (`test/redact-corpus.test.ts`): over this repository's commit
      messages, docs and specs, and state-branch records from `adamstallard/igor-throwaway-lore`
      (`test/fixtures/igor-state.json`), `redact` changes nothing.
- [x] 3.7 Linear time: 64 KiB of `sk-ant-api03-`, `ghp_` or `github_pat_` repeated, each nearly a
      token, is redacted in under 200 ms, so no pattern backtracks over the text.
- [ ] 3.8 Measure a real fine-grained `github_pat_` token's length and character set, and
      correct the pattern if it differs from 82 letters, digits or `_` (decision 12).
