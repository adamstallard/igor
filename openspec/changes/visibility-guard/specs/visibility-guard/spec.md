## Purpose

Keep a private repository's content off a public state branch: Igor never works a private
repository through a public lore store, and writes nothing from one to that store's state branch.

## ADDED Requirements

### Requirement: A private repository is never worked through a public lore store

Igor SHALL NOT work a private repository while its lore store is public. The lore store is the
repository `igor.config.yaml` names as `destination`. A *mismatch* is a private worked repository
paired with a public store.

Igor SHALL read each visibility from the `visibility` field GitHub's API returns, asked with the
role's App installation token. An `internal` repository SHALL count as private, store or worked.
Igor SHALL NOT read the `publicStore` setting for this comparison.

#### Scenario: An internal repository counts as private

- **WHEN** a role works an `internal` repository and the store is `public`
- **THEN** Igor treats the pair as a mismatch

#### Scenario: An internal store serves a private repository

- **WHEN** the store is `internal` and the worked repository is `private`
- **THEN** Igor works the repository

#### Scenario: A public store serves a public repository

- **WHEN** the store is `public` and the worked repository is `public`
- **THEN** Igor works the repository

#### Scenario: A stale publicStore setting is not believed

- **WHEN** `igor.config.yaml` sets `publicStore: false` and GitHub reports the store as `public`
- **THEN** Igor treats the store as public

#### Scenario: Visibility is read as the App

- **WHEN** Igor reads a repository's visibility
- **THEN** the request carries the role's App installation token, and no other credential

### Requirement: A role whose sources name a private repository does not start against a public store

When `igor run` or `igor serve` starts, before discovery, Igor SHALL compare the store's
visibility with that of every repository the role's sources name. On a mismatch the process SHALL
refuse to start, with an error naming the private repository and the store. For `igor serve` this
check falls under #82's (`stopped-scope-visible`) *A process that refuses to start exits with
status 78*, which also says how an unanswered read ends the start. `igor run` SHALL exit non-zero
in both cases.

#### Scenario: A private source against a public store refuses the start

- **WHEN** `igor serve web` starts, a source of the role `web` names `acme/billing`, which is
  private, and the store `acme/lore` is public
- **THEN** the process refuses to start, naming `acme/billing` and `acme/lore`, and exits with
  status 78

#### Scenario: igor run refuses too

- **WHEN** `igor run web` starts with the same configuration
- **THEN** it refuses to start, naming both repositories, and exits non-zero

#### Scenario: igor run exits non-zero on an unanswered visibility read

- **WHEN** `igor run web` starts and GitHub does not answer a visibility read the start check makes
- **THEN** it exits non-zero

### Requirement: A candidate from a private repository is skipped while the store is public

Each cycle Igor SHALL read the visibility of the store, of each repository a candidate of that
cycle comes from, and of each repository with an open visibility condition, so the condition can
clear. A candidate's repository is its item's, as the tracker reports it, not its source's. A
candidate whose repository and the store are a mismatch SHALL be skipped before triage and any
claim: Igor posts nothing on it, runs no model step on it, and writes no record of it but its
repository's condition.

#### Scenario: An item from a repository no source names

- **WHEN** a source's query returns an item of `acme/payroll`, which is private, while its
  `repo` names `acme/web`, and the store is public
- **THEN** Igor skips the item without triaging or claiming it
- **AND** a condition on `repo:acme/payroll:visibility` opens, naming `acme/payroll` and the
  store

#### Scenario: A store made public while Igor runs

- **WHEN** the store is made public while `igor serve` runs a role whose sources name a private
  repository
- **THEN** at the next cycle Igor skips that repository's candidates, and the process goes on
  running
- **AND** a condition naming the repository and the store opens

#### Scenario: A repository made private while Igor runs

- **WHEN** a repository whose candidates Igor works is made private while `igor serve` runs and
  the store is public
- **THEN** Igor skips that repository's candidates from the first cycle read of its visibility
  after the change

### Requirement: A visibility mismatch at a cycle opens a read-cleared condition

Each cycle's read of a worked repository's and the store's visibility counts as failing on a
mismatch, and a single failing read SHALL open a read-cleared condition, the kind #171's
(`seat-files`) *A read-cleared condition opens on a failing read and clears on a passing one*
defines. It is on the worked repository, with the cure key `repo:<owner>/<name>:visibility`, and
SHALL name the worked repository and the store and say that making the store private or the
repository public cures it.

#### Scenario: The cure clears the condition

- **WHEN** a condition on `repo:acme/payroll:visibility` is open, no candidate of `acme/payroll`
  is found, and the store is made private
- **THEN** the condition clears at the next cycle's read of `acme/payroll`, without a probe, the
  item #101 (`condition-backoff`) lets a stopped scope take to test whether its fault recurs

### Requirement: An unanswered visibility read at a cycle leaves its repository unworked

A visibility read at a cycle that GitHub does not answer SHALL leave the candidates of the
repository whose read went unanswered unworked for the cycle, and SHALL NOT open or clear the
visibility condition. The cycle's report SHALL say which read failed.

#### Scenario: A visibility read GitHub does not answer

- **WHEN** at a cycle GitHub does not answer the visibility read of `acme/web`
- **THEN** Igor works none of `acme/web`'s candidates in that cycle, opens no condition, and
  says in the cycle's report that the read failed

### Requirement: Nothing from a private repository is written to a public state branch

Igor SHALL NOT write a private repository's content to a public store's `igor-state` branch. Just
before writing a run's records to the store's branch, Igor SHALL re-read the store's and the run's
repository's visibility. On a mismatch or unanswered read, it SHALL write the records without
their content and no transcript file, and a pull request the run publishes SHALL name no
transcript path. On a mismatch it SHALL also open the condition a skipped candidate opens; on an
unanswered read, none.

#### Scenario: A store made public during a run

- **WHEN** a run on a private repository is under way, and the store is made public before the
  run ends
- **THEN** Igor writes the run's ledger row with its cost and outcome, and no transcript and no
  other text of the run, to the state branch
- **AND** a condition naming the repository and the store opens
- **AND** the run's pull request names no transcript

#### Scenario: A visibility read before the write fails

- **WHEN** GitHub does not answer the store's visibility read just before a run's records are
  written
- **THEN** Igor writes the run's records without their content, and no transcript

### Requirement: What a run's content is

Igor SHALL count as a run's *content* any text the run produced or read: its transcript, the log
of its tool calls, the text of a firing record (`lore-firing`'s record of the lore entries a run
was given), and any text of a failure or from the worker in a record's fields. A record's
structured fields, such as the item's id, the run's cost, its outcome and its exit code, SHALL NOT
count as content.

#### Scenario: Records without content keep their structured fields

- **WHEN** Igor writes a run's records without their content
- **THEN** the records keep the structured fields they hold, such as the item's id, the run's cost,
  its outcome or its exit code
- **AND** they hold no transcript, no log of the run's tool calls, no firing record's text, and
  no text of a failure or from the worker

### Requirement: igor doctor reports a mismatch through the start check

`igor doctor` SHALL report a mismatch by invoking, for each role, the start check of *A role whose
sources name a private repository does not start against a public store*, and SHALL NOT
re-implement it. Each finding SHALL name the role, the private repository and the store. Where
`doctor` lacks a role's App key, that role's check SHALL be reported unchecked, as #113's
(`check-a-lore-repository`) *A check that cannot be made is skipped and said, not failed* says.

#### Scenario: doctor reports a private source against a public store

- **WHEN** `igor doctor` runs with the role `web`'s App key, and a source of `web` names a private
  repository while the store is public
- **THEN** it reports a finding naming `web`, the repository and the store, and exits non-zero

#### Scenario: doctor without the App key

- **WHEN** `igor doctor` runs without the role `web`'s App key
- **THEN** it reports `web`'s visibility check as unchecked, naming the missing key
