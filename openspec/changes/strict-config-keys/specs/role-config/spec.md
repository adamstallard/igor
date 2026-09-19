## ADDED Requirements

### Requirement: A role file refuses a key nobody reads

A role file SHALL refuse a key outside the set it declares, naming the offending key and the
accepted ones. The refusal SHALL apply wherever a role file is read — the role asked for, the
org base it inherits, and a parent read only for what it contributes — and SHALL extend to the
nested mappings: `lane`, its `labels`, `paths` and `age`, and each `sources` entry.

A role already refuses an action inside `allow` that it does not recognise, on the grounds that
a typo must fail rather than silently grant nothing. The keys around it had no such rule, so
the same typo one line higher granted nothing just as quietly.

Inside `lane` it is not a setting that fails to take but a constraint that disappears. A
misspelt `excludes` leaves a lane that admits everything its author meant to keep out, and a
lane is where `Human` and `wontfix` are kept away from an Igor.

#### Scenario: An unreadable key on a role is named

- **WHEN** a role file names a key the parser does not read
- **THEN** it is refused, naming the key and the accepted ones

#### Scenario: The org base is held to the same rule

- **WHEN** the org base names an unreadable key
- **THEN** every role inheriting it is refused, rather than each quietly losing whatever it was
  meant to set

#### Scenario: A lane constraint nobody reads is refused

- **WHEN** a lane names `exclude` in place of `excludes`, or any other key the parser does not
  read
- **THEN** it is refused, rather than producing a lane missing that constraint

## MODIFIED Requirements

### Requirement: A role declares sources, lane, behaviour, permissions, and reviewers

A role file SHALL support: `extends`, `seat`, `sources`, `lane`, `instructions`, `completion`,
`allow`, `commands`, `budget_share`, and `reviewers`. Each `sources` entry MUST name a
`tracker` and carry that tracker's own query verbatim. Entries failing validation SHALL be
rejected rather than loaded.

`commands` names the shell commands a worker may run, and is the only thing that lets one
run anything at all. It is declared on the role and nowhere else: a worker that can edit
files can edit a settings file in the repository it is working, so an allowlist read from
there is one the worker can widen for itself.

The claim message is not among them. It carries the stop instruction, which is the only notice
a reader gets that stopping is possible and permitted, so it is not an org's to replace. A role
that sets `claim` SHALL be refused, with the reason it may not: the guarantee is that the
wording cannot be replaced, and dropping the key leaves whoever wrote it believing it was.

#### Scenario: Well-formed role accepted

- **WHEN** a role declares a tracker source, a lane, standing instructions, a completion
  action, an allow list, and reviewers
- **THEN** validation passes and the role loads

#### Scenario: Unrecognized completion action rejected

- **WHEN** a role declares a `completion` value outside the recognized set
- **THEN** validation fails naming the field and the permitted values

#### Scenario: Declared commands bound what the worker may run

- **WHEN** a role declares `commands` and an item is executed
- **THEN** the worker may run those commands and nothing else

#### Scenario: Source without a tracker rejected

- **WHEN** a `sources` entry omits `tracker`
- **THEN** validation fails, because a query cannot be dispatched without knowing who executes it

#### Scenario: Claim wording is not a role setting

- **WHEN** a role file sets `claim`
- **THEN** the role is refused, and the refusal says what the claim message carries and why it
  is not a role's to replace
