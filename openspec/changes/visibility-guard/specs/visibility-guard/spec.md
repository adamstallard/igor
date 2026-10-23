## ADDED Requirements

### Requirement: A private repository is never worked through a public lore store

Igor SHALL NOT work a private repository while its lore store is public. The lore store is the
repository `igor.config.yaml` names as `destination`, whose `igor-state` branch holds the
Igor's records. A *mismatch* is a worked repository that is private while the store is public.

Igor SHALL read each visibility from the `visibility` field GitHub's API returns for the
repository, asked with the role's GitHub App's installation token. An `internal` repository
SHALL count as private, whether it is the store or the worked repository. Igor SHALL NOT read
the `publicStore` setting for this comparison.

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
visibility with that of every repository the role's sources name. On a mismatch the process
SHALL refuse to start, with an error naming the private repository and the store. For
`igor serve` this is a check that refuses a start, under #82's (`stopped-scope-visible`) *A
process that refuses to start exits with status 78*, which also says how a visibility read
GitHub does not answer ends the start. `igor run` SHALL exit non-zero on a mismatch and on a
visibility read GitHub does not answer.

#### Scenario: A private source against a public store refuses the start

- **WHEN** `igor serve web` starts, a source of the role `web` names `acme/billing`, which is
  private, and the store `acme/lore` is public
- **THEN** the process refuses to start, naming `acme/billing` and `acme/lore`, and exits with
  status 78

#### Scenario: igor run refuses too

- **WHEN** `igor run web` starts with the same configuration
- **THEN** it refuses to start, naming both repositories, and exits non-zero

### Requirement: A candidate from a private repository is skipped while the store is public

At every cycle Igor SHALL read the store's visibility, the visibility of each repository a
candidate of that cycle comes from, and the visibility of each repository with an open
visibility condition. A candidate's
repository is the one its item belongs to, as the tracker reports the item, not the one its
source names. A candidate whose repository is a mismatch SHALL be skipped before triage and
before any claim: Igor posts nothing on it, runs no model step on it, and writes no record of
it. A repository made private, or a store made public, while Igor runs SHALL be caught at the
first such read after the change.

The mismatch SHALL open a read-cleared condition, as #171's (`seat-files`) *A read-cleared
condition opens on a failing read and clears on a passing one* defines the kind. The read is
this requirement's read of the worked repository's and the store's visibility; it fails when
they are a mismatch; one failing read opens the condition; and the condition is on the worked
repository, with the cure key `repo:<owner>/<name>:visibility`. The condition SHALL name the
worked repository and the store, and SHALL say that making the store private or the repository
public cures it.

A visibility read that GitHub does not answer SHALL leave that repository's candidates
unworked for the cycle, and SHALL NOT open or clear the condition. The cycle's report SHALL say
which read failed.

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

#### Scenario: The cure clears the condition

- **WHEN** a condition on `repo:acme/payroll:visibility` is open, no candidate of `acme/payroll`
  is found, and the store is made private
- **THEN** the condition clears at the next cycle's read of `acme/payroll`, without a probe, the
  item #101 (`condition-backoff`) lets a stopped scope take to test whether its fault recurs

#### Scenario: A visibility read GitHub does not answer

- **WHEN** at a cycle GitHub does not answer the visibility read of `acme/web`
- **THEN** Igor works none of `acme/web`'s candidates in that cycle, opens no condition, and
  says in the cycle's report that the read failed

### Requirement: Nothing from a private repository is written to a public state branch

Igor SHALL NOT write a private repository's content to the state branch of a public store.
*Content* is any text a run on that repository produced or read: its transcript, the log of its
tool calls, the text of a firing record (`lore-firing`'s record of the lore entries a run was
given), and any failure or worker text in a record's fields. A
record's structured fields, such as the item's id, the run's cost, its outcome and its exit
code, are not content.

Just before it writes a run's records to the state branch, Igor SHALL read both visibilities
again. Where it finds a mismatch, or GitHub does not answer either read, Igor SHALL write the
run's records without their content, and SHALL write no transcript. Where it found a mismatch,
it SHALL also open the condition a skipped candidate opens; where a read went unanswered, it
SHALL open none. A pull request the run publishes SHALL
then name no transcript path.

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

### Requirement: igor doctor reports a mismatch through the start check

`igor doctor` SHALL report a mismatch by invoking, for each role, the start check of *A role
whose sources name a private repository does not start against a public store*, and SHALL NOT
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
