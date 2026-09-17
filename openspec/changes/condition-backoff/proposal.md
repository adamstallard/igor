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

**Self-clearing, through a probe.** Nobody sends a fixed signal, and nobody should have to:
whoever reads the stop edits a configuration on a surface with no channel back to the loop. A
condition is gone when it stops recurring — but a stopped scope runs nothing and so can never
observe an absence, which deadlocks. After a cooldown one item goes through. It clears if the
condition does not recur, and stops again for longer if it does. The probe is the next item the
scope would take, not the item that was in flight when the condition opened: the condition is
about the cure, and that item may be unworkable for reasons of its own.

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
  should be visible on is a question about operators, not about the loop.

## Capabilities

### New Capabilities

- `stuck-conditions`: recording a condition against the cure that would clear it, stopping the
  scope that cure names once it recurs, clearing by probe after a cooldown, and the refusal to
  grade conditions by severity.

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
