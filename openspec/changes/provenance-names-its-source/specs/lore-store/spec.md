## MODIFIED Requirements

### Requirement: Entries may be authored directly, without mining

The store SHALL accept entries written by hand, with no mined provenance. A directly authored
entry SHALL record provenance as an authorship item carrying `author` and `at`, and no `url`
and no `source`. Mining is one way to populate lore, not a precondition for it.

An authorship item cites nothing, so it has no source to name. That is a different state from
an item whose source is unknown, and the two MUST NOT be collapsed into one: nothing came in
from anywhere through an authorship item, so no question about where it came from applies to
it. A check that reads "has no source" as "source unknown" makes hand-authoring impossible in
exactly the stores where it is most useful.

#### Scenario: Hand-written entry accepted

- **WHEN** a person writes an entry directly with a provenance item of `{author, at}` and no
  `url`
- **THEN** validation passes and the entry is written

#### Scenario: Empty provenance rejected

- **WHEN** an entry carries no provenance items at all
- **THEN** validation fails, because an entry must record where it came from even when the
  answer is "someone wrote it"

#### Scenario: An authorship item is not an unknown source

- **WHEN** a provenance item carries neither `url` nor `source`
- **THEN** it is read as authorship
- **AND** not as a citation whose origin could not be established

### Requirement: Provenance is the sole source of support and authorship

Each provenance item MUST carry `author` and `at`, and MUST carry `url` and `source` when it
cites a mined artifact. `source` names where the artifact came from, as `<host>:<identifier>` —
`github:<owner>/<name>` for a GitHub repository. An item carrying a `url` and no `source` SHALL
be rejected.

`source` MUST be recorded by whatever mined the artifact, and MUST NOT be reconstructed from
the `url`. Whatever mines knows its source with certainty, having used it to fetch; anything
reading it back out of a url afterwards is guessing, and guesses wrong — silently — for every
url whose shape it did not anticipate.

`source` records where an item came from, not what was true of that place. Whether a source is
public or private SHALL NOT be stored on the item. Visibility is mutable and is relied on at
publication rather than at mining, so a stored answer is wrong in precisely the direction that
matters: a repository public when an artifact was mined and private by the time an entry
derived from it is proposed carries a recorded `public` past the guard that exists to stop it.
This is the rule that already rejects a stored `support`, applied to a field that goes stale
for the same reason.

Support count, author weighting, and the date of the newest provenance SHALL be computed from
provenance at read time. The store MUST NOT persist `support` as a frontmatter field.

A time-decayed weight SHALL NOT be derived. Lore is mined from historical review comments and
is old by construction, so a decay curve reports an entire store as stale while saying nothing
about whether any lesson still holds — and it ranks lowest the entries that have held longest.
The date of the newest evidence is a fact a reader can act on; a decayed score is a judgment
presented as one.

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

#### Scenario: A mined item names its source

- **WHEN** an item cites `https://github.com/acme/widgets/pull/9#discussion_r1`
- **THEN** it also carries `source: github:acme/widgets`
- **AND** that value was recorded by whatever fetched the comment, not read back out of the url

#### Scenario: A citation with no source rejected

- **WHEN** a provenance item carries a `url` and no `source`
- **THEN** validation fails naming `source`

#### Scenario: A source that is not host-qualified rejected

- **WHEN** a provenance item carries `source: acme/widgets`
- **THEN** validation fails, because an identifier with no host is the same guess the `url` was

#### Scenario: Stored visibility rejected

- **WHEN** a provenance item records whether its source was public
- **THEN** validation fails, as it does for a stored `support`
- **AND** the reason given is that the value is right when written and wrong whenever the
  source changes, while the moment it is relied on is publication rather than mining
