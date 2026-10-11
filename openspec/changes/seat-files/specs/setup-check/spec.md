## ADDED Requirements

### Requirement: The check says who approves each seat file

`igor doctor` SHALL report, for each seat file, its code owner as GitHub's CODEOWNERS rule decides
it, and SHALL report as a finding:

- a seat file with no code owner;
- a seat file whose code owner is not its `owner`, saying that the code owner stands in for the
  holder, that the holder's approval is then given outside GitHub, and that a holder with an
  account on the lore repository becomes the code owner by a CODEOWNERS line naming them;
- code-owner review not required on the lore repository's default branch, by ruleset or by
  classic branch protection;
- an actor allowed to bypass the rule that requires code-owner review on a path under `seats/`,
  naming the actor;
- `seats/recipient.txt`, `.github/` or `igor.config.yaml` with no code owner, since whoever can
  change those unreviewed can redirect new tokens, rewrite ownership, or change which key decrypts
  them.

A holder with no GitHub account on the lore repository cannot be a code owner, and the operator
stands in. That is a legitimate arrangement, so the check says it plainly rather than treating it
as broken: the finding names the seat and who stands in, and asks for no change unless the holder
has an account.

#### Scenario: The operator stands in for a holder

- **WHEN** `seats/carol.yaml` declares `owner: carol@example.com` and its code owner is `@operator`
- **THEN** the report says `@operator` stands in for seat `carol`'s holder

#### Scenario: A holder who is their seat's code owner is not a finding

- **WHEN** `seats/bob.yaml` declares `owner: bob` and its code owner is `@bob`
- **THEN** no finding is reported for that file

#### Scenario: The review rule off is a finding

- **WHEN** code-owner review is not required on the default branch
- **THEN** it is reported as a finding naming the branch and the setting

#### Scenario: A bypass is named

- **WHEN** a ruleset requiring code-owner review lets an actor bypass it
- **THEN** the report names that actor

#### Scenario: An unowned public key is a finding

- **WHEN** no CODEOWNERS line gives `seats/recipient.txt` an owner
- **THEN** it is reported as a finding, saying whoever replaces it receives every token encrypted
  afterwards

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
