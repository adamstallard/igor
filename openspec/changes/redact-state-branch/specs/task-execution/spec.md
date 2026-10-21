## ADDED Requirements

### Requirement: Credential redaction replaces every credential the Igor knows

*Credential redaction* is one rule, applied wherever this or another change says text is
redacted. A seat is a model subscription the Igor spends, and its token is the credential the
worker, the model subprocess doing an item's work, runs on. It SHALL replace each of these with `[redacted]`:

- the token of every seat the Igor has read since it started, whatever its source and
  whatever its variable's name, where the token is at least 8 characters long. A shorter seat
  token is not matched by value, since a placeholder such as `igor` would rewrite every item id
  holding it;
- the value of every variable in the worker's environment, which is built from the Igor's own
  and a seat token, and in the Igor's own, whose name
  contains `TOKEN`, `KEY`, `SECRET`, `PASSWORD` or `CREDENTIAL`, where the value is at least 8
  characters long. The value is matched exactly, wherever it appears;
- a private key block (`-----BEGIN … PRIVATE KEY-----` to its `END` line), a PGP private key
  block (`-----BEGIN PGP PRIVATE KEY BLOCK-----` to its `END` line), an `age` encryption
  secret key (`AGE-SECRET-KEY-1…`), and a token by its prefix: GitHub (`ghp_`, `gho_`, `ghu_`,
  `ghs_`, `ghr_`, `github_pat_`), Anthropic (`sk-ant-`), an AWS access key ID (`AKIA` and 16
  capital letters or digits), and Slack (`xoxa-`, `xoxb-`, `xoxp-`, `xoxr-`, `xoxs-`);
- the credentials in a URL: the `user:pass@` part of `https://user:pass@host/…`, in any scheme.

A variable's name is matched case-sensitively, anywhere in the name. A token prefix counts only
at the start of a word, or straight after an escape, where the text an error message quotes was
already JSON-escaped (`\n`) or percent-encoded (`%3A`). So `highs_` is not a GitHub token. The token runs
from its prefix to the first character that kind of token (GitHub, Anthropic and so on) cannot
hold: GitHub tokens hold
letters, digits and `_`; Anthropic and Slack tokens also `-`; an AWS key ID and an `age` key
letters and digits. A prefix with nothing after it is left alone.

A `BEGIN` line, `-----BEGIN … PRIVATE KEY-----` or `-----BEGIN … PRIVATE KEY BLOCK-----`,
starts a private key block only where a key's body follows it within both 8 lines and 1 KiB of
the `BEGIN` line's end, armour header lines counting toward the 8: a run
of 60 base64 characters, on the same line after spaces or tabs, or on a later line after any
blank lines and armour header lines (`Proc-Type:`, `DEK-Info:`, `Version:`, `Comment:`,
`Charset:`, `Hash:` or `MessageID:`, for a PEM or a PGP block alike).
In finding the body, a line break counts whether written as is or JSON-escaped (`\n`, `\r\n`).

The block runs to the first `-----END … PRIVATE KEY-----` or `-----END … PRIVATE KEY
BLOCK-----` line, however its lines are quoted, where that line ends within 16 KiB (16,384
characters) of the `BEGIN` line's end; otherwise it runs to the end of the text. Where no body follows a `BEGIN` line, the
`BEGIN` line alone becomes `[redacted]` and the text around it is kept.

A URL's credentials run to the last `@` before the host, so an `@` in the user name or the
password is redacted with the rest.

Code that obtains a seat token, `resolveToken` in `src/budget.ts` included, SHALL register it
with credential redaction (`rememberSecret`) before any log, record or message can quote it. A token shorter than 8 characters is not registered.

#### Scenario: A seat token of 8 characters is registered

- **WHEN** a seat's token is `eightchr`, and text quotes it
- **THEN** credential redaction replaces it with `[redacted]`

#### Scenario: A mentioned key header keeps the text after it

- **WHEN** text mentions `-----BEGIN RSA PRIVATE KEY-----` and goes on with prose, a digest or
  a reset phrase, and no key body follows it
- **THEN** only the `BEGIN` line becomes `[redacted]`, and the text after it is unchanged

#### Scenario: A JSON-escaped key block is redacted whole

- **WHEN** text holds a key block with its line breaks written `\n` or `\r\n`
- **THEN** credential redaction replaces the whole block with one `[redacted]`

#### Scenario: A word holding a token prefix is left alone

- **WHEN** text holds the item id `github:acme/highs_and_lows#7`
- **THEN** credential redaction leaves it unchanged

#### Scenario: A token is redacted by its prefix

- **WHEN** text holds a GitHub token beginning `ghp_` or an Anthropic token beginning `sk-ant-`
- **THEN** credential redaction replaces the token with `[redacted]`

#### Scenario: A URL's credentials are redacted

- **WHEN** text holds `https://user:pass@github.com/o/r.git`
- **THEN** credential redaction leaves `https://[redacted]@github.com/o/r.git`

#### Scenario: A URL naming only a user is left alone

- **WHEN** text holds `ssh://git@github.com/o/r.git`
- **THEN** credential redaction leaves it unchanged

#### Scenario: A seat token is redacted by its value

- **WHEN** a seat's token comes from a variable named `SEAT_A`, and text quotes the token
- **THEN** credential redaction replaces the token with `[redacted]`

#### Scenario: A credential-named variable's value is redacted

- **WHEN** a variable named `DEPLOY_KEY` in the Igor's environment holds `opensesame42`, and
  text quotes that value
- **THEN** credential redaction replaces it with `[redacted]`

#### Scenario: A PGP private key block is redacted whole

- **WHEN** text holds a block from `-----BEGIN PGP PRIVATE KEY BLOCK-----` to its `END` line
- **THEN** credential redaction replaces the whole block with one `[redacted]`

#### Scenario: A short seat token is not matched by value

- **WHEN** a seat's token is `igor`, and text holds the item id `github:adamstallard/igor#12`
- **THEN** credential redaction leaves the id unchanged

#### Scenario: A private key block is redacted whole

- **WHEN** text holds a private key block across several lines
- **THEN** credential redaction replaces the block, from its `BEGIN` line to its `END` line,
  with one `[redacted]`

#### Scenario: A short value is not a credential

- **WHEN** a variable named `DEPLOY_KEY` holds a 3-character value
- **THEN** credential redaction leaves that value in place

### Requirement: Every write to the state branch is redacted

Every file the Igor writes to the state branch, and every commit message it writes there,
SHALL pass through credential redaction first. This covers each string in the record, its
object keys included.

#### Scenario: A token in a run's failure does not reach the branch

- **WHEN** a run fails with a reason quoting a GitHub token
- **THEN** the run's row in `executions.ndjson` holds `[redacted]` where the token was

#### Scenario: URL credentials in a deferral's reason do not reach the branch

- **WHEN** an item is handed back deferred with a reason quoting `https://user:pass@host`
- **THEN** `deferred.json` holds `https://[redacted]@host` in that reason

#### Scenario: A commit message is redacted

- **WHEN** a write's commit message quotes a GitHub token
- **THEN** the commit on the state branch has `[redacted]` in its message where the token was

#### Scenario: A refusal envelope is redacted

- **WHEN** a refusal envelope's text quotes an Anthropic token
- **THEN** the envelope written to `refusals/` holds `[redacted]` where the token was
