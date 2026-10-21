## ADDED Requirements

### Requirement: Credential redaction replaces every credential the Igor knows

*Credential redaction* is one rule, applied wherever this or another change says text is
redacted. It matches secrets by value, from a registry, and real tokens by their exact shape,
and it SHALL replace each match with `[redacted]`.

Code that obtains a secret SHALL register it (`rememberSecret`) before any log, record or
message can quote it. The registered secrets are:

- the token of every seat the Igor has read, whatever its source and whatever its variable's
  name. A seat is a model subscription the Igor spends. Its token is the credential the worker
  runs on; the worker is the model subprocess doing an item's work. A seat's token stays registered
  for the life of the process, after its seat is removed from the configuration too;
- the GitHub App's private key, whole and each of its base64 lines;
- the App's signed JWT and each installation token it mints, each until it expires;
- every credential the Igor puts in a worker's environment, including a forwarded proxy URL's
  user info, password and whole URL;
- the value of every variable in the Igor's environment whose name contains `TOKEN`, `KEY`,
  `SECRET`, `PASSWORD` or `CREDENTIAL`, matched case-sensitively anywhere in the name.

A value shorter than 8 characters is not registered. Each registered value is matched as
written, JSON-escaped and URL-encoded, wherever it appears, longest first so that a value
holding another is replaced whole. The registry is held
in memory only, and is never written or logged.

The tokens matched by shape are:

- a GitHub token: `ghp_`, `gho_`, `ghu_`, `ghs_` or `ghr_`, then 30 letters or digits, then the
  base62 CRC32 checksum of those 30 in 6 letters or digits, where the checksum is right;
- a fine-grained GitHub token: `github_pat_` and 82 letters, digits or `_`;
- an Anthropic key: `sk-ant-`, a type of 1 to 16 lowercase letters and a two-digit version, such
  as `api03-` or `oat01-`, and
  at least 40 letters, digits, `-` or `_`.

A token counts only where no letter or digit comes straight before it, or where it comes
straight after a JSON escape (`\n`, `\r`, `\t`) or a percent-encoded character (`%3A`). A GitHub
token counts only where no letter or digit follows it, and a fine-grained token only where no
letter, digit or `_` follows it.
Nothing else is matched by pattern.

#### Scenario: A seat token is redacted by its value

- **WHEN** a seat's token comes from a variable named `SEAT_A`, and text quotes the token
- **THEN** credential redaction replaces it with `[redacted]`

#### Scenario: A short seat token is not matched by value

- **WHEN** a seat's token is `igor`, and text holds the item id `github:adamstallard/igor#12`
- **THEN** credential redaction leaves the id unchanged

#### Scenario: A registered secret is redacted JSON-escaped and URL-encoded

- **WHEN** text quotes a registered secret inside a JSON string or a URL's query
- **THEN** credential redaction replaces the escaped or encoded secret with `[redacted]`

#### Scenario: A line of the App's private key is redacted

- **WHEN** text quotes one base64 line of the App's private key, behind a diff's `-` or a
  `cat -n` line number
- **THEN** credential redaction replaces that line, and keeps the prefix in front of it

#### Scenario: A proxy's password is redacted

- **WHEN** `HTTPS_PROXY` is `http://user:<password>@proxy:3128`, and text quotes the password
- **THEN** credential redaction replaces it with `[redacted]`

#### Scenario: A minted token is no longer matched once it expires

- **WHEN** a secret was registered with an expiry, and that time has passed
- **THEN** credential redaction leaves text quoting it unchanged

#### Scenario: A credential-named variable's value is redacted

- **WHEN** a variable named `DEPLOY_KEY` in the Igor's environment holds `opensesame42`, and
  text quotes that value
- **THEN** credential redaction replaces it with `[redacted]`

#### Scenario: A GitHub token with a right checksum is redacted

- **WHEN** text holds a `ghp_` token whose last 6 characters are its checksum
- **THEN** credential redaction replaces it with `[redacted]`

#### Scenario: A token-shaped string with a wrong checksum is left alone

- **WHEN** text holds `ghp_` and 36 letters and digits whose last 6 are not their checksum
- **THEN** credential redaction leaves it unchanged

#### Scenario: A word holding a token prefix is left alone

- **WHEN** text holds the item id `github:acme/highs_and_lows#7`
- **THEN** credential redaction leaves it unchanged

#### Scenario: Text holding no secret is unchanged

- **WHEN** credential redaction runs over this repository's commit messages, docs and specs,
  and over state-branch records an Igor wrote, with nothing registered
- **THEN** it changes none of them

### Requirement: Every write to the state branch, and every text the Igor posts, is redacted

Every file the Igor writes to the state branch, and every commit message it writes there,
SHALL pass through credential redaction first. This covers each string in the record, its
object keys included.

Every text the Igor posts to a tracker or a code host SHALL pass through credential redaction
before it is sent: a comment on an item, an issue's title and body, a pull request's title and
body, and the message of every commit it makes there, merge commits included. The files of a
commit on any branch but the state branch are sent as written.

The transcript, which holds the worker's whole closing summary, is redacted by this rule like
every other record, and hides nothing the rule does not name.

#### Scenario: A token in a run's failure does not reach the branch

- **WHEN** a run fails with a reason quoting a GitHub token
- **THEN** the run's row in `executions.ndjson` holds `[redacted]` where the token was

#### Scenario: A token in a record's object key does not reach the branch

- **WHEN** a record written to the state branch has an object key quoting a GitHub token
- **THEN** the key as written holds `[redacted]` where the token was

#### Scenario: A registered secret in a deferral's reason does not reach the branch

- **WHEN** an item is handed back deferred with a reason quoting a remote URL that holds an
  installation token the App minted
- **THEN** `deferred.json` holds `[redacted]` where the token was

#### Scenario: A commit message is redacted

- **WHEN** a write's commit message quotes a GitHub token
- **THEN** the commit on the state branch has `[redacted]` in its message where the token was

#### Scenario: A token in a posted comment is not sent

- **WHEN** the Igor posts a comment on an item quoting a GitHub token
- **THEN** the comment sent to the tracker holds `[redacted]` where the token was

#### Scenario: A token in a pull request is not sent

- **WHEN** the Igor opens a pull request whose title, body or commit message quotes a GitHub
  token
- **THEN** each text sent to the code host holds `[redacted]` where the token was

#### Scenario: A token in an issue's title is not sent

- **WHEN** the Igor opens an issue whose title quotes a GitHub token
- **THEN** the title sent to the tracker holds `[redacted]` where the token was

#### Scenario: A token in a merge commit's message is not sent

- **WHEN** the Igor merges a base into a branch whose name holds a GitHub token
- **THEN** the merge commit's message sent to the code host holds `[redacted]` where it was

#### Scenario: A refusal envelope is redacted

- **WHEN** a refusal envelope, the provider's reply kept in `refusals/` when a limit stopped a
  run, quotes an Anthropic key
- **THEN** the envelope written to `refusals/` holds `[redacted]` where the token was
