## ADDED Requirements

### Requirement: A role sets the size a pull request may have and still be skimmed

A role file SHALL accept `skim_max_paths` and `skim_max_lines`. They are the largest number of
paths a run changed and published, and the largest number of lines it added and removed counted
together, with which a pull request may still be labelled `review: skim`. Both SHALL be whole
numbers of at least 0. Each may be set in the org base, the settings every role inherits, and in
a role, and the most specific level SHALL win. `skim_max_paths` SHALL default to 5 and
`skim_max_lines` to 200.

#### Scenario: The thresholds default

- **WHEN** no level sets `skim_max_paths` or `skim_max_lines`
- **THEN** the role's effective thresholds are 5 paths and 200 lines

#### Scenario: A role's threshold overrides the org's

- **WHEN** the org base sets `skim_max_lines: 400` and a role sets `skim_max_lines: 100`
- **THEN** the role's effective `skim_max_lines` is 100
