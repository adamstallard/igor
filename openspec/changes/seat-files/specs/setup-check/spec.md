## ADDED Requirements

### Requirement: The check says whether the server's key matches the committed one

Where `igor.config.yaml` declares `seatKey`, `igor doctor` SHALL report whether the public key
derived from that private key equals the one committed in `seats/recipient.txt`. It SHALL report a
finding where they differ, or where `seats/recipient.txt` is absent. Where the person running the
check cannot read the key file, as an operator other than the service user usually cannot, the
key match is unchecked, naming the path and the reason, as `check-a-lore-repository`'s *A check
that cannot be made is skipped and said, not failed* (#113) says.

A seat file that carries `encrypted_token` where no `seatKey` is declared is the configuration
validation's finding (seat-budget's *A seat's token travels as ciphertext in its file*). `igor
doctor` reports it by invoking that validation, as `check-a-lore-repository`'s *Setup is reported
by one command, over what configuration alone cannot show* (#113) says, and SHALL NOT check it
again.

A mismatched key fails silently: every token encrypted from then on is unreadable on the server,
and nothing says so until each seat is reported unreadable in turn.

#### Scenario: A rotated key not committed

- **WHEN** `seatKey` names a private key whose public key differs from `seats/recipient.txt`
- **THEN** it is reported as a finding, saying new tokens will be encrypted to a key the server
  does not hold

#### Scenario: A key the check cannot read is unchecked

- **WHEN** `seatKey` names a file the person running `igor doctor` cannot read
- **THEN** the key match is reported as unchecked, naming the path and the reason
- **AND** it is not reported as passing

#### Scenario: No public key committed

- **WHEN** `seatKey` is declared and `seats/recipient.txt` is absent
- **THEN** it is reported as a finding

#### Scenario: Ciphertext with no key to read it

- **WHEN** `seats/bob.yaml` carries `encrypted_token` and `igor.config.yaml` declares no `seatKey`
- **THEN** `igor doctor` reports the configuration validation's finding, naming `seats/bob.yaml`
  and the validation as its source

#### Scenario: A matching key

- **WHEN** the two match
- **THEN** no finding about the key is reported

### Requirement: The check says whether seat owners are told of changes to their seat files

Where the lore repository has at least one seat file, `igor doctor` SHALL report a finding where
the default branch carries no `.github/workflows/seat-notice.yml`. The finding SHALL say that no
lender is then told when a pull request changes their seat file, and SHALL name `igor init` as
the command that writes the workflow. Where the file is present, `doctor` SHALL also report a
finding where the workflow is disabled or Actions are off for the repository, and report the
check as unchecked where it cannot read that state.

A lender's veto over their seat is revoking its token, and the notice is how they learn of a
change in time to use it. Without the workflow nothing fails and nothing is reported: lenders are
simply never told.

#### Scenario: The notice workflow is absent

- **WHEN** the lore repository has seat files and its default branch carries no
  `.github/workflows/seat-notice.yml`
- **THEN** it is reported as a finding
- **AND** the finding states that no lender is told of a change to their seat file, and names
  `igor init` as the command that writes the workflow

#### Scenario: A disabled notice workflow

- **WHEN** `.github/workflows/seat-notice.yml` is present but the workflow is disabled, or Actions
  are off for the lore repository
- **THEN** it is reported as a finding, saying no lender is told of a change to their seat file

#### Scenario: No seats, no finding

- **WHEN** the lore repository has no seat files
- **THEN** no finding about the notice workflow is reported

### Requirement: The check says whether each seat's owner is a GitHub login

For each seat file naming an `owner`, `igor doctor` SHALL check with `gh api users/<owner>` that it
is a GitHub login, and SHALL report a finding naming the seat file and the login where it is not.
The finding SHALL say that no change to that seat file mentions anyone, and that the seat's holder,
or the operator for a holder with no GitHub account, sets `owner` to a GitHub login by a pull
request. Where the check cannot reach
GitHub, the owner check is unchecked, as `check-a-lore-repository`'s *A check that cannot be made is
skipped and said, not failed* (#113) says.

The notice workflow mentions only a GitHub login, so where a seat's `owner` is not one, nobody is
told of a change to that seat's file.

#### Scenario: An owner that is no GitHub user

- **WHEN** `seats/bob.yaml` names `owner: bob-smith`, and `gh api users/bob-smith` finds no user
- **THEN** it is reported as a finding, naming `seats/bob.yaml` and `bob-smith`, and saying no
  change to that file mentions anyone
- **AND** the finding says the holder, or the operator, sets `owner` to a GitHub login by a pull
  request

#### Scenario: An owner that is a GitHub user

- **WHEN** every seat file's `owner` is a GitHub login
- **THEN** no finding about owners is reported

#### Scenario: GitHub cannot be reached

- **WHEN** `gh api users/<owner>` fails for a reason other than the user not existing
- **THEN** the owner check is reported as unchecked, with the reason, and not as passing
