## MODIFIED Requirements

### Requirement: Entries can be created, validated, and listed from a CLI

The store SHALL provide commands to create an entry, validate the store, and list its
contents. `create` SHALL scaffold a well-formed entry and assign its id. `validate` SHALL
report every invalid entry with its reason rather than stopping at the first. `list` SHALL
show entries with their derived support and the date of their newest evidence.

#### Scenario: Entry created from the CLI

- **WHEN** a person runs the create command with a claim
- **THEN** a well-formed entry file is written with an id derived from that claim
- **AND** the entry passes validation without further editing

#### Scenario: Validation reports every failure

- **WHEN** the store contains three invalid entries and validate is run
- **THEN** all three are reported with their reasons
- **AND** the command exits non-zero

#### Scenario: Listing shows derived scores

- **WHEN** entries are listed
- **THEN** each shows a support count and the newest provenance date, both computed
- **AND** neither is read from a stored field
- **AND** no time-decayed weight is shown, because none is computed
