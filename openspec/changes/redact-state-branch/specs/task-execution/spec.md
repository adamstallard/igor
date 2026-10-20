## ADDED Requirements

### Requirement: Credential redaction replaces every credential the Igor knows

*Credential redaction* is one rule, applied wherever this or another change says text is
redacted. It SHALL replace each of these with `[redacted]`:

- the token of every seat the Igor has read since it started, whatever its source and
  whatever its variable's name;
- the value of every variable in the worker's environment, and in the Igor's own, whose name
  contains `TOKEN`, `KEY`, `SECRET`, `PASSWORD` or `CREDENTIAL`, where the value is at least 8
  characters long. The value is matched exactly, wherever it appears;
- a private key block (`-----BEGIN … PRIVATE KEY-----` to its `END` line), an `age` encryption
  secret key (`AGE-SECRET-KEY-1…`), and a token by its prefix: GitHub (`ghp_`, `gho_`, `ghu_`,
  `ghs_`, `ghr_`, `github_pat_`), Anthropic (`sk-ant-`), an AWS access key ID (`AKIA` and 16
  capital letters or digits), and Slack (`xoxa-`, `xoxb-`, `xoxp-`, `xoxr-`, `xoxs-`);
- the credentials in a URL: the `user:pass@` part of `https://user:pass@host/…`, in any scheme.

A variable's name is matched case-sensitively, anywhere in the name. A token prefix counts
only at the start of a word or straight after an escape such as `\n` or `%3A`, so `highs_` is
not a GitHub token. The token runs from its prefix to the first character its kind of token
cannot hold: GitHub tokens hold letters, digits and `_`; Anthropic and Slack tokens also `-`;
an AWS key ID and an `age` key letters and digits. A prefix with nothing after it is left
alone. A `BEGIN` line starts a private
key block only where a key's body follows it on the next line: a run of 60 base64 characters,
after any `Proc-Type:` and `DEK-Info:` lines. The block runs to its `END` line however its
lines are quoted, or, with no `END` line, to the end of the text. A `BEGIN` line with no body
after it is redacted alone. A URL's credentials run to the last `@` before the host, so an `@` in
the user name or the password is redacted with the rest.

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
