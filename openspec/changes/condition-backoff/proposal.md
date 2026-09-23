## Why

An Igor can be stuck in a way that has nothing to do with the item in front of it. Its
allowlist refuses the install its tests need, its seat's token is unset, its seat has never been
observed. The item is fine; the Igor is not. Each of these recurs identically on the next item
and every one after, and each is cured by a configuration change somewhere.

Nothing in the loop represents that. Two consequences follow, and only one of them is a bug.

The bug is that such a handoff suppresses the item —
[#43](https://github.com/adamstallard/igor/issues/43). "An item handed back is not re-worked
until something answers" already exempts budget *because nothing about the item produced that
outcome*, which is a rule with budget as one instance; `shouldDefer` implements the instance.
[#22](https://github.com/adamstallard/igor/issues/22) has been parked since a worker that was
not logged in exited 1, a day after the cure landed, and only a person commenting releases it.

What is not a bug, because nothing covers it at all: an Igor in this state keeps going. It
claims the next item, spends a worker, hands back with the same sentence, and repeats every
poll interval across the whole backlog. Fixing the suppression makes that worse, correctly —
the items now come back — so the two belong in one change.

## What Changes

**A condition is recorded against the cure, and recurrence stops the scope it names.** N
handoffs on one cure key and the affected scope takes no new items, saying which key it is
stuck on and what would change it. The key is #41's, derived where the code holds the fact for
certain rather than pattern-matched back out of prose.

**Counted, not graded.** The tempting design ranks conditions — cannot verify is degraded,
cannot read the seat is fatal. It is rejected, and no configuration may express a severity.
Whether an unverified pull request is worse than no pull request depends on the repository, the
reviewer and the week, and neither an Igor nor somebody filling in a config knob in advance is
in a position to decide it. What an Igor can know for certain is that it has done the same
broken thing N times. One unverified pull request is information; twenty is waste, whatever the
cause.

**Scope follows the cure.** A refused command is role-scoped, an unreadable seat is seat-scoped,
an Igor's own credential is Igor-scoped. The record lives in the state branch keyed by the cure
key, so five Igors meeting one cure is one condition — counted once, cleared once — rather than
five discovering it separately. It also keeps the stop as small as it can honestly be: a role
refused one command says nothing about any other role.

**What the condition was observed against, where the cure key does not say it.** For most cures
the key is the identity: `role:web:commands` fully names what is stuck. `seat:<id>:credential`
does not — it names the seat, not the credential, so a seat's two tokens produce the identical
key. [#65](https://github.com/adamstallard/igor/pull/65)'s counting loop already needs two
conditions for that reason, matching `record.cures?.includes(key) === true &&
record.tokenFingerprint === fingerprint` (`src/budget.ts`). So the record carries a
discriminator: an opaque value naming what the condition was observed against, absent for every
condition whose key already says it. It is not context alongside the record — it is the part of
the occurrence's identity the cure key cannot express, and without it a record reading
`seat:adam:credential, count 3, open` cannot answer the question its own stop turns on: is this
about the credential resolving now?

A condition is an occurrence and not a thing. That observation was made against this change by
name in [#77](https://github.com/adamstallard/igor/pull/77) — *"a cure key opens, clears and
reopens over its life, so keying on the cure alone would match a closed escalation from last
time and stay silent while a fleet sat stopped"* — and although that proposal was closed
unmerged, its closing comment keeps the observation explicitly as work that survives. Same
defect, same fix, one level down: here it is the count and the clearing rule that would answer
for the wrong occurrence.

**Self-clearing, through a probe.** Nobody sends a fixed signal, and nobody should have to:
whoever reads the stop edits a configuration on a surface with no channel back to the loop. A
condition is gone when it stops recurring — but a stopped scope runs nothing and so can never
observe an absence, which deadlocks. After a cooldown one item goes through. It clears if the
condition does not recur, and stops again for longer if it does. The probe is the next item the
scope would take, not the item that was in flight when the condition opened: the condition is
about the cure, and that item may be unworkable for reasons of its own.

A condition carrying a discriminator clears that way **and** one more way: the moment the scope
resolves a different discriminator, with no cooldown waited and no item spent. The probe exists
because most cures are unobservable from inside the loop — an allowlist edited elsewhere
announces nothing. A credential changing is observable, so a seat an operator has already fixed
comes back immediately rather than after a backoff that lengthens each time it is wrong. That is
the one capability a credential-shaped stop had that this record did not, and it is kept here
instead of left to a second mechanism.

**One record, one stop, one report —
[#86](https://github.com/adamstallard/igor/issues/86).** Once §2–§3 exist, a 401 feeds two
mechanisms on one cure key: #65's breaker counting trailing rows in `executions.ndjson` against
a token fingerprint, and a condition record counting handoffs. Same seat, two thresholds, two
clocks — held if either says so, free only when both agree. The condition record owns the record
and the stop; #65's breaker is absorbed into §4 rather than duplicated beside it, which is what
the clause above is for. #86 is answered by this change and closed by the implementation of §4,
not by this text.

**#65 merges as it stands.** It is the only thing stopping a revoked seat today, and §2–§4 are
unimplemented: stripping its breaker now leaves nothing holding the seat. The duplication begins
only when the general mechanism is built, which is when the absorption happens. Nothing here is
a blocker on #65.

**A measurement that contradicts what #65 documents.** #65's two operator-facing messages say a
credential condition clears one way — `credentialBreaker`'s `why` ends *"resolving a different
credential for this seat clears it, and nothing else does"*, and `renderCredentials`' header
says *"resolving a different credential for it is the only thing that clears one"*. The code
clears two ways. `credentialBreaker` counts backwards from the newest row and breaks on the
first row that is not a rejection of this fingerprint, so a successful half-open probe on the
**unchanged** credential ends the trailing run and the breaker closes — which the function's own
doc comment states: *"which is how a successful probe closes the breaker, and how a replaced
credential clears it without anybody saying so."* Both clears are real and the messages are what
is wrong. The requirement here states the pair, and correcting those two strings is part of the
absorption rather than a separate fix.

**Suppression states the rule it already implies.** The in-force requirement is modified so a
cause that was a fact about the Igor does not suppress, with budget as one instance, and a
scenario for the seat-token case that has #22 parked. This is the rule #43 fixes the code
against; written down because the implementation encoding the instance instead of the rule is
how the bug happened.

Stopping a scope and suppressing an item stay separate things and should not later be merged.
Suppression answers whether one item returns; it is about that item's own history. A condition
answers whether anybody is taking anything; the items remain candidates, in order, and nothing
is running.

Explicitly out of scope:

- **Choosing N or the cooldown.** The two items whose cost is recorded are $1.19 and $11.18,
  10× apart, and there is no run history to fit against. Defaults are provisional, as
  `budget-pacing`'s are.
- **Deriving the cure key** — [#41](https://github.com/adamstallard/igor/issues/41). This change
  consumes the key; that one produces it, at `src/execute.ts:980` for a refused command and on
  the precedent `src/wiring.ts:68` sets for seats. Nothing here works without it.
- **Curing anything.** An Igor editing its own `commands` is the failure that file's comment
  exists to prevent. The stop names the cure and a person makes it.
- **Reporting an open condition anywhere but the cycle record.** Which surface a stuck fleet
  should be visible on is a question about operators, not about the loop. Retiring a report that
  an absorbed mechanism leaves behind is not that question: §4 replaces #65's seat line and
  corrects its two messages because the mechanism printing them has stopped existing, and adds
  no surface of its own.

## Capabilities

### New Capabilities

- `stuck-conditions`: recording a condition against the cure that would clear it — with what it
  was observed against, where the cure key does not say — stopping the scope that cure names
  once it recurs, clearing by probe after a cooldown and, where a discriminator is carried, on
  that discriminator changing, and the refusal to grade conditions by severity.

### Modified Capabilities

- `work-triage`: an item handed back is not suppressed where the cause was a fact about the
  Igor rather than about the item — the rule the budget exemption was one instance of.

## Impact

- Ends the state where a misconfigured Igor spends its whole budget handing back every item in
  its lane, and leaves a person a notification per item about something only an operator can
  fix.
- Releases #22 and anything else parked on a cause that was never about the item, without
  anybody commenting on each one.
- Adds a reason for an Igor to be idle that is neither exhaustion, nor pacing, nor an empty
  queue, which the cycle record has to distinguish or the fleet reads as broken when it is
  waiting and as waiting when it is broken.
- A stopped scope is visible only where somebody looks at the record. A fleet stopped on one
  cure key is a strong signal and nothing currently surfaces it.
- A conditions listing ([#82](https://github.com/adamstallard/igor/pull/82)) can say why a
  condition is open and what would clear it from **one** read. Were the credential stop left to
  a mechanism of its own, the same answer would take a cross-reference against the execution
  log.
- `executions.ndjson` stops being load-bearing for a decision. It remains a log of what was run,
  rather than becoming the input to whether a seat is usable.
