## ADDED Requirements

### Requirement: A role sets the size a pull request may have and still be skimmed

A role file SHALL accept `skim_max_paths` and `skim_max_lines`: the most paths a run may change
and publish, and the most lines it may add and remove in all, for its pull request to get
`review: skim`. The org base and a role may each set them; the most specific level SHALL
win. They SHALL default to 5 and 200. Each value set SHALL be a whole number of at
least 0. A role whose file or base sets any other value SHALL be refused at load, naming the
key, even if the role sets a valid one.

#### Scenario: The thresholds default

- **WHEN** no level sets `skim_max_paths` or `skim_max_lines`
- **THEN** the role's effective thresholds are 5 paths and 200 lines

#### Scenario: A role's threshold overrides the org's

- **WHEN** the org base sets `skim_max_lines: 400` and a role sets `skim_max_lines: 100`
- **THEN** the role's effective `skim_max_lines` is 100

#### Scenario: An invalid threshold in the org base refuses every role

- **WHEN** the org base sets `skim_max_paths: -1`, and a role sets `skim_max_paths: 3`
- **THEN** that role is refused at load, naming `skim_max_paths`, and so is every other role
  inheriting the org base
