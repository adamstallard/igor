## ADDED Requirements

### Requirement: A budget refuses a key nobody reads, and a list that is not a list

The budget mapping, each seat and each pool SHALL refuse a key the parser does not read, naming
the offending key and the accepted ones. `seats` and `pools` SHALL be lists where they are
declared at all; anything else SHALL be refused rather than read as empty. Omitting them
entirely SHALL remain the way to run with budget unenforced.

A dropped key leaves a file that reads as configured and behaves as though it were not, and at
this level the behaviour is the absence of every ceiling. Read as empty, a misspelt `seats:` is
not a smaller budget: no seat is declared, so nothing is bounded, no reserved seat is passed
over, and the report says budget is not being enforced — which is exactly what it says for the
operator who deliberately enforces nothing. The two states must not be reachable by a typo.

The discrimination is between silence about something that was never declared and silence about
something that was. An absent `budget` is a decision; a declared one that cannot be read is a
mistake, and a mistake nobody is told about is one that is found by a person's allowance being
spent.

#### Scenario: A misspelt seats key is not an empty budget

- **WHEN** a budget declares `seast:` in place of `seats:`
- **THEN** it is refused, naming the key and the accepted ones
- **AND** the run does not proceed with budget unenforced

#### Scenario: A seats list that is not a list is refused

- **WHEN** `seats` or `pools` is declared as anything other than a list
- **THEN** it is refused rather than read as an empty list

#### Scenario: No budget declared still means unenforced

- **WHEN** a config declares no budget, or a budget with no seats and no pools
- **THEN** it loads and budget is not enforced, as before

#### Scenario: A misspelt id reads as the typo, not as an absence

- **WHEN** a seat or a pool misspells `id`
- **THEN** the refusal names the misspelt key, rather than reporting the id missing over a line
  that has one

#### Scenario: A pool key nobody reads is refused

- **WHEN** a pool names a key other than `id` or `seats`
- **THEN** it is refused, naming the key and the accepted ones

#### Scenario: One wording for every level

- **WHEN** any of these refusals is raised
- **THEN** it names what is being read, the offending key, and the accepted keys, in the shape
  the seat level already uses
