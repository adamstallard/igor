## ADDED Requirements

### Requirement: The config file refuses a key nobody reads

The config SHALL refuse a key outside the set it reads, naming the offending key and the
accepted ones, and SHALL do so before reporting a required key missing.

Every key in this file turns something on. Dropped in silence, a misspelt one leaves the
operator with a file whose text says what they meant and a tool doing something else: no
reviewers where reviewers were named, provenance unguarded where `publicStore` was declared, a
destination reported as absent while it is on the page one letter wrong.

Order matters for that last one. "destination is required" over a file whose second line is
`destinaton: .` sends somebody looking for the key they can already see, so the spelling is
checked first and the requirement second.

#### Scenario: An unreadable key is named

- **WHEN** the config names a key the tool does not read
- **THEN** it is refused, naming the key and the accepted ones

#### Scenario: A misspelt required key reads as a typo, not an absence

- **WHEN** `destination` is misspelt
- **THEN** the refusal names the misspelling rather than reporting the destination missing
