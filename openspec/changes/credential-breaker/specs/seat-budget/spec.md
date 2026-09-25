## ADDED Requirements

### Requirement: A credential the provider refuses takes the seat out of rotation

A run the provider refuses for authentication SHALL mint a cure key naming that seat's
credential, and SHALL be recorded with a cryptographic hash of the credential it used. A seat
whose most recent runs are an unbroken sequence of such refusals of the credential resolving now
SHALL be passed over, once that sequence reaches a stated count, with the refusal as the stated
reason. A run that failed for any other reason SHALL NOT count toward it.

Nothing local separates a revoked credential from a working one: `/usage` exits zero for either
and `claude auth status` reports the same fields for a valid `setup-token` and for a garbage
string. The only account of a credential the provider refuses is the record of runs it refused,
which is why a seat's own reading is no answer to it.

The recognition is the provider's own structured verdict — an API error status — and never the
wording of a message. A cure key is minted where the constraint is enforced, and prose written by
a worker about an item is not that.

Counting is per seat rather than per seat and role. A credential is not role-specific: the
provider refuses it for every role drawing on the seat, and counting per role would let each of
them burn the full count discovering the same dead credential.

The count is a sequence and not a total. A total never falls again, so the seat could never come
back; a run that is not a refusal of that credential ends the sequence, which is what lets a
successful run close the breaker.

#### Scenario: A refused credential is named where it is refused

- **WHEN** a run comes back with the provider's authentication-error status
- **THEN** a cure key naming that seat's credential is minted
- **AND** the execution record carries a hash of the credential the run used

#### Scenario: The seat is passed over after the stated number of refusals

- **WHEN** a seat's trailing runs are an unbroken sequence of refusals of the credential
  resolving now, reaching the stated count
- **THEN** the seat is passed over rather than chosen
- **AND** the reason given is that the provider refused its credential, not that its usage could
  not be read and not that it has no headroom

#### Scenario: A failure that is not a credential refusal never counts

- **WHEN** a seat's runs fail repeatedly for any other reason
- **THEN** the seat is still chosen

#### Scenario: A seat's own reading does not overrule the record

- **WHEN** a seat whose credential has been refused reports headroom, or reports nothing at all
- **THEN** it is passed over either way

### Requirement: The breaker clears when a different credential resolves

A seat held out of rotation SHALL be usable again as soon as a credential other than the refused
one resolves for it, with no command run and nothing to undo. No command SHALL clear it. After a
stated cooldown the seat SHALL be allowed exactly one run; that run's own outcome SHALL end the
hold or extend it, and the cooldown SHALL grow with each further refusal up to a stated ceiling.

Replacing a revoked credential always means presenting a different string, so the fingerprint on
the next run is the reversal signal itself rather than a claim about it — the principle
`stillDeferred` already follows. A command that cleared the hold on being asked would clear it
for an operator who believed they had fixed the credential and had not, and the next runs would
pay for the belief.

The single run after the cooldown is what makes a transient refusal recover with nobody watching,
and it is why recognising the refusal perfectly is not required of this design. The cooldown
grows because the state it detects can persist for days: a fixed wait burns items for all of
them, where a growing one burns a bounded few.

#### Scenario: A replaced credential returns the seat

- **WHEN** a credential different from the refused one resolves for a held seat
- **THEN** the seat is chosen again

#### Scenario: One run goes through after the cooldown

- **WHEN** the cooldown since the most recent refusal has passed
- **THEN** one run is allowed through
- **AND** a further refusal lengthens the next wait rather than repeating it

#### Scenario: A successful run closes it

- **WHEN** the run allowed through succeeds
- **THEN** the sequence of refusals is broken and the seat is chosen normally

### Requirement: Reporting distinguishes an unreadable credential from a refused one

Budget reporting SHALL show a seat held out of rotation as held, distinctly from a seat whose
credential could not be read, and SHALL offer a way to print which credential resolves for each
seat, how many runs the provider refused it on, and when one will be let through. That report
SHALL NOT clear the hold.

The two are fixed by different people in different places: one is a token this machine could not
read, the other a token the provider read and refused. A report that merges them sends somebody
to check a path or an environment variable that is perfectly correct.

A refused credential is a fact about the seat and not about a window. It is stated once, on a
line of the seat's own, rather than written into each window row where it would assert a
per-window answer that does not exist.

#### Scenario: A held seat reads as held

- **WHEN** an operator inspects the budget and a seat is held out of rotation
- **THEN** the report says so, once, for the seat
- **AND** it does not report that seat as having an unreadable credential

#### Scenario: The breaker can be inspected without being reset

- **WHEN** an operator asks for the credential state
- **THEN** the credential that resolves, the number of refusals and the hour one is let through
  are printed
- **AND** the hold is unchanged by having been read

#### Scenario: The published record discloses no credential

- **WHEN** a refusal is recorded to a log that is committed
- **THEN** it carries a full cryptographic hash of the credential
- **AND** it carries no part of the credential itself
