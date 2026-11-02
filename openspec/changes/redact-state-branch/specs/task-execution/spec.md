## ADDED Requirements

### Requirement: Credential redaction replaces every credential the Igor knows

*Credential redaction*, the one rule applied wherever a change says text is redacted, SHALL replace
with `[redacted]` every registered secret, matched as written, JSON-escaped and URL-encoded,
wherever it appears, longest first, and every token of a listed shape. A value shorter than 8
characters is not registered. The registry is held only in memory, never written or logged. The
next four requirements state what is registered and which shapes match; the fifth applies the rule.

#### Scenario: The longer of two registered secrets is replaced whole

- **WHEN** one registered secret holds another, and text quotes the longer one
- **THEN** credential redaction replaces the longer one whole with one `[redacted]`

#### Scenario: A short seat token is not matched by value

- **WHEN** a seat's token is `igor`, and text holds the item id `github:adamstallard/igor#12`
- **THEN** credential redaction leaves the id unchanged

#### Scenario: A registered secret is redacted JSON-escaped and URL-encoded

- **WHEN** text quotes a registered secret inside a JSON string or a URL's query
- **THEN** credential redaction replaces the escaped or encoded secret with `[redacted]`

#### Scenario: Text holding no secret is unchanged

- **WHEN** credential redaction runs over this repository's commit messages, docs and specs,
  and over state-branch records an Igor wrote, with nothing registered
- **THEN** it changes none of them

### Requirement: Every secret the Igor obtains is registered before it can be quoted

Code that obtains a secret SHALL register it (`rememberSecret`) before it can be quoted, for the
process's life unless an expiry is stated here: each seat token the Igor reads; the App's private
key, whole and per base64 line; its signed JWT and each installation token it mints, until each
expires; each credential put in a worker's environment; and the value of each Igor environment
variable whose name contains `TOKEN`, `KEY`, `SECRET`, `PASSWORD` or `CREDENTIAL`,
case-sensitively, anywhere.

#### Scenario: A seat token is redacted by its value

- **WHEN** a seat's token comes from a variable named `SEAT_A`, a name holding no credential word,
  and text quotes the token
- **THEN** credential redaction replaces it with `[redacted]`

#### Scenario: A removed seat's token is still redacted

- **WHEN** a seat whose token was read is removed from the configuration, and text later
  quotes that token
- **THEN** credential redaction replaces it with `[redacted]`

#### Scenario: A line of the App's private key is redacted

- **WHEN** text quotes one base64 line of the App's private key, behind a diff's `-` or a
  `cat -n` line number
- **THEN** credential redaction replaces that line, and keeps the prefix in front of it

#### Scenario: A registered secret is no longer matched by value once it expires

- **WHEN** a secret with no token shape, such as the App's JWT, was registered with an expiry, and
  that time has passed
- **THEN** credential redaction leaves text quoting it unchanged; a token with one of the shapes
  that *Credential redaction also matches tokens by their exact shape* lists would still be
  matched by its shape

#### Scenario: A credential-named variable's value is redacted

- **WHEN** a variable named `DEPLOY_KEY` in the Igor's environment holds `opensesame42`, and
  text quotes that value
- **THEN** credential redaction replaces it with `[redacted]`

### Requirement: A proxy user name with no password is registered only with its host

A proxy URL the Igor forwards to a worker's environment: its password, its user info where that
password is not empty, and the whole URL SHALL be registered. A user name with no password, or with
an empty password (`user:`), SHALL be registered only in these forms, never bare: `<user>@<host>`,
with the name as written, percent-decoded and percent-encoded and the host without its port; where
the password is empty, also `<user>:@<host>`; and the whole URL.

#### Scenario: A proxy's password is redacted

- **WHEN** `HTTPS_PROXY` is `http://user:<password>@proxy:3128`, and text quotes the password
- **THEN** credential redaction replaces it with `[redacted]`

#### Scenario: A proxy's user name is redacted with its host

- **WHEN** `HTTPS_PROXY` is `http://x7Kp2mQ9vL@proxy:3128`, with no password, and text quotes
  `x7Kp2mQ9vL@proxy`
- **THEN** credential redaction replaces it with `[redacted]`

#### Scenario: A proxy's user name is not redacted on its own

- **WHEN** `HTTPS_PROXY` is `http://JaneDoeContractor2024@proxy:3128`, with no password, and
  text holds the item id `github:JaneDoeContractor2024/igor#3`
- **THEN** credential redaction leaves the id unchanged, since a name alone can appear where it
  is no secret

#### Scenario: A proxy's user name with an empty password is redacted with its host

- **WHEN** `HTTPS_PROXY` is `http://build-agent.proxy-user01:@proxy:3128`, and text holds
  `build-agent.proxy-user01@proxy` and `@build-agent.proxy-user01: approved`
- **THEN** credential redaction replaces the first with `[redacted]` and leaves the second
  unchanged, since no host follows the name there

### Requirement: Credential redaction also matches tokens by their exact shape

Credential redaction SHALL match by pattern only these shapes:

- a GitHub token: `ghp_`, `gho_`, `ghu_`, `ghs_` or `ghr_`, 30 letters or digits, then the
  CRC32 of those 30 in base62 (`0`-`9`, `A`-`Z`, `a`-`z`), left-padded to 6 with `0`;
- a fine-grained GitHub token: `github_pat_` and 82 letters, digits or `_`, a length unchecked
  on a real token;
- an Anthropic key: `sk-ant-`, a type of 1 to 16 lowercase letters, a two-digit version, `-`,
  and at least 40 letters, digits, `-` or `_`.

#### Scenario: A GitHub token with a right checksum is redacted

- **WHEN** text holds a `ghp_` token whose last 6 characters are its checksum
- **THEN** credential redaction replaces it with `[redacted]`

#### Scenario: A fine-grained GitHub token is redacted

- **WHEN** text holds `github_pat_` and 82 letters, digits or `_`
- **THEN** credential redaction replaces it with `[redacted]`

#### Scenario: A token-shaped string with a wrong checksum is left alone

- **WHEN** text holds `ghp_` and 36 letters and digits whose last 6 are not their checksum
- **THEN** credential redaction leaves it unchanged

### Requirement: A token shape counts only where it stands apart from the text around it

A token of a shape that *Credential redaction also matches tokens by their exact shape* lists SHALL
count only where no letter or digit comes straight before it, or where it comes straight after a
JSON escape (`\n`, `\r`, `\t`) or a percent-encoded character such as `%3A`. A GitHub token SHALL
count only where no letter or digit follows it, and a fine-grained token only where no letter,
digit or `_` follows it.

#### Scenario: A word holding a token prefix is left alone

- **WHEN** text holds the item id `github:acme/highs_and_lows#7`
- **THEN** credential redaction leaves it unchanged; `ghs_and_lows#7` is too short to be a token,
  so this shows only that a prefix alone is not matched

### Requirement: Every write to the state branch, and every text the Igor posts, is redacted

Credential redaction SHALL run, before writing or sending, over all the Igor writes to the state
branch, whole documents, appended records, each string and object key in them, and commit messages;
and over every text it posts to a tracker or code host: every comment, title, body and commit
message, merges included. Files committed to any branch but the state branch, and chat posts, are
sent as written. A run's transcript record, with the worker's closing summary, is redacted like any
other.

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
