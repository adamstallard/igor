## ADDED Requirements

### Requirement: The check says whether the server's key matches the committed one

Where `igor.config.yaml` declares `seatKey`, `igor doctor` SHALL report whether the public key
derived from that private key equals the one committed in `seats/recipient.txt`, and SHALL report a
finding where it does not, where the key file cannot be read, or where `seats/recipient.txt` is
absent.

A mismatched key fails silently: every token encrypted from then on is unreadable on the server,
and nothing says so until each seat is reported unreadable in turn.

#### Scenario: A rotated key not committed

- **WHEN** `seatKey` names a private key whose public key differs from `seats/recipient.txt`
- **THEN** it is reported as a finding, saying new tokens will be encrypted to a key the server
  does not hold

#### Scenario: A matching key

- **WHEN** the two match
- **THEN** no finding about the key is reported

### Requirement: The check says whether seat owners are told of changes to their seat files

Where the lore repository has at least one seat file, `igor doctor` SHALL report a finding where
the default branch carries no `.github/workflows/seat-notice.yml`. The finding SHALL say that no
lender is then told when a pull request changes their seat file, and SHALL name `igor init` as
the command that writes the workflow.

A lender's veto over their seat is revoking its token, and the notice is how they learn of a
change in time to use it. Without the workflow nothing fails and nothing is reported: lenders are
simply never told.

#### Scenario: The notice workflow is absent

- **WHEN** the lore repository has seat files and its default branch carries no
  `.github/workflows/seat-notice.yml`
- **THEN** it is reported as a finding
- **AND** the finding states that no lender is told of a change to their seat file, and names
  `igor init` as the command that writes the workflow

#### Scenario: No seats, no finding

- **WHEN** the lore repository has no seat files
- **THEN** no finding about the notice workflow is reported
