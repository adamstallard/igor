## ADDED Requirements

### Requirement: The check says whether the server's key matches the committed one

Where `igor.config.yaml` declares `seatKey`, `igor doctor` SHALL report whether the public key
derived from that private key equals `seats/recipient.txt`, and a finding naming the remedy where
they differ or that file is absent. Where the person running it cannot read the key file, the
match is unchecked. A seat file carrying `encrypted_token` where no `seatKey` is
declared is the configuration validation's finding, which `doctor` reports by invoking that
validation and SHALL NOT check again.

#### Scenario: A rotated key not committed

- **WHEN** `seatKey` names a private key whose public key differs from `seats/recipient.txt`
- **THEN** it is reported as a finding, saying new tokens will be encrypted to a key the server
  does not hold
- **AND** the finding names the remedy: commit the public key `age-keygen -y` derives from the
  server's key as `seats/recipient.txt`, by a pull request

#### Scenario: A key the check cannot read is unchecked

- **WHEN** `seatKey` names a file the person running `igor doctor` cannot read
- **THEN** the key match is reported as unchecked, naming the path and the reason
- **AND** it is not reported as passing

#### Scenario: No public key committed

- **WHEN** `seatKey` is declared and `seats/recipient.txt` is absent
- **THEN** it is reported as a finding, naming the same remedy

#### Scenario: Ciphertext with no key to read it

- **WHEN** `seats/bob.yaml` carries `encrypted_token` and `igor.config.yaml` declares no `seatKey`
- **THEN** `igor doctor` reports the configuration validation's finding, naming `seats/bob.yaml`
  and the validation as its source

#### Scenario: A matching key

- **WHEN** the two match
- **THEN** no finding about the key is reported

### Requirement: The check says whether seat owners are told of changes to their seat files

Where the lore repository has a seat file, `igor doctor` SHALL report a finding where the default
branch carries no `.github/workflows/seat-notice.yml`, naming `igor init` as the remedy. Where
the file is present, it SHALL report a finding where the workflow is disabled or Actions are off,
and one where its most recent run failed, naming that run. It SHALL report the check as
unchecked where it cannot read that state or the workflow has never run.

#### Scenario: A failing notice workflow is reported

- **WHEN** the lore repository has seat files, and the most recent run of `seat-notice.yml` failed
- **THEN** it is reported as a finding, naming that run

#### Scenario: The workflow's state cannot be read

- **WHEN** `igor doctor` cannot read whether the notice workflow is enabled, or its runs
- **THEN** the check is reported as unchecked, with the reason, and not as passing

#### Scenario: A notice workflow that has never run is unchecked

- **WHEN** the lore repository has a seat file and `seat-notice.yml` is present and enabled, but
  has no run
- **THEN** the check is reported as unchecked, not as passing

#### Scenario: The notice workflow is absent

- **WHEN** the lore repository has seat files and its default branch carries no
  `.github/workflows/seat-notice.yml`
- **THEN** it is reported as a finding
- **AND** the finding states that no lender is told of a change to their seat file, and names
  `igor init` as the command that writes the workflow

#### Scenario: A disabled notice workflow

- **WHEN** `.github/workflows/seat-notice.yml` is present but the workflow is disabled, or Actions
  are off for the lore repository
- **THEN** it is reported as a finding, saying no lender is told of a change to their seat file,
  and that enabling the workflow or Actions is the remedy

#### Scenario: No seats, no finding

- **WHEN** the lore repository has no seat files
- **THEN** no finding about the notice workflow is reported

### Requirement: The check says whether each seat's owner is a GitHub login

For each seat file naming an `owner`, `igor doctor` SHALL first check that the `owner` has a
GitHub login's form, letters, digits and single hyphens, and only then check with `gh api
users/<owner>` that the login exists and belongs to a user, not an organization. It SHALL report
a finding naming the seat file where either check fails, and SHALL NOT pass an `owner` of any
other form to `gh api`. Where the check cannot reach GitHub, the owner check is unchecked.

#### Scenario: An owner that is no GitHub user

- **WHEN** `seats/bob.yaml` names `owner: bob-smith`, and `gh api users/bob-smith` finds no user
- **THEN** it is reported as a finding, naming `seats/bob.yaml` and `bob-smith`, and saying the
  notice workflow cannot reach the holder about a change to that file
- **AND** the finding says the holder, or the operator for a holder with no GitHub account, sets
  `owner` to a GitHub login by a pull request

#### Scenario: An owner not in a login's form is not sent to GitHub

- **WHEN** `seats/bob.yaml` names `owner: x/../../repos/acme/igor-lore`
- **THEN** it is reported as a finding, naming `seats/bob.yaml`
- **AND** no `gh api` call is made with that `owner`

#### Scenario: An owner that is an organization

- **WHEN** `seats/bob.yaml` names `owner: acme`, and `gh api users/acme` reports an organization
- **THEN** it is reported as a finding, naming `seats/bob.yaml` and `acme`

#### Scenario: An owner that is a GitHub user

- **WHEN** every seat file's `owner` is a GitHub login
- **THEN** no finding about owners is reported

#### Scenario: GitHub cannot be reached

- **WHEN** `gh api users/<owner>` fails for a reason other than the user not existing
- **THEN** the owner check is reported as unchecked, with the reason, and not as passing
