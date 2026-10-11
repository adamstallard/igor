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
