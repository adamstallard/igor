## MODIFIED Requirements

### Requirement: Provenance is the sole source of derived scores

Each provenance item MUST carry `author` and `at`, and MUST carry `url` when it cites a mined
artifact. Support count, author weighting, and the date of the newest provenance SHALL be
computed from provenance at read time. The store MUST NOT persist `support` as a frontmatter
field.

A time-decayed recency weight SHALL NOT be computed. Lore is mined from historical review
comments and is old by construction, so a decay curve reports the entire store as stale while
saying nothing about whether any lesson still holds. The date of the newest evidence is a fact
a reader can act on; a decayed score is a judgment presented as one.

#### Scenario: Support derived from provenance

- **WHEN** an entry has 14 provenance items
- **THEN** its support count reads as 14 without any stored field

#### Scenario: Newest evidence reported as a date

- **WHEN** an entry is listed
- **THEN** the date of its most recent provenance item is shown
- **AND** no decayed weight is derived from it

#### Scenario: Age does not diminish an entry

- **WHEN** two entries have equal support and differ only in the age of their provenance
- **THEN** neither is ranked above the other on that basis

#### Scenario: Stored score rejected

- **WHEN** an entry's frontmatter includes a `support` field
- **THEN** validation fails, because the field is derived rather than stored
