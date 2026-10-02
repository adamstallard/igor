# Design

The requirement says a person's answer survives the run. Every part of *how* has live
alternatives, and one of them is a security decision that has to be argued rather than assumed.

## Read as a match, not as an instruction

This is the objection to answer first. `task-execution` requires that content ingested from any
surface be *"delimited and presented as data rather than as instruction"*, and reading an
authorisation out of a comment looks exactly like taking instruction from the untrusted channel.

**The resolution is the direction of the question.** The run does not read the item and work out
what to do. It computes, from the merge and the resolution alone, the refusal it would issue —
artifact, path, and the base blob the revert discards. Only then does it ask whether an
authorisation exists for that exact triple. The comment is a lookup key.

The difference is observable rather than rhetorical: no byte of item text reaches any branch. Text
in the authorisation's shape that matches no computed refusal changes nothing, and there is no
input to the comment that produces a revert the run had not already decided to refuse. The
untrusted channel can answer *yes* to a question the Igor asked; it cannot pose one.

**What that leaves**, and it is not nothing: an attacker who can comment can say *yes* to a revert
the Igor was about to refuse. That is why authorisation is gated on write access below, and why
the sha binding matters — the blast radius is one revert, of one known-current base state, on one
artifact.

## Who may authorise

**Write access to the repository the artifact is on, asked of the host.** Not read from the
comment, which an attacker controls, and not membership of a list in configuration, which goes
stale and has to be maintained.

The bar is the one a person already clears to make the revert by hand: someone who can push to the
repository can undo the base's change directly, so authorising an Igor to do it grants nothing new.
Anything looser gives a public commenter a way to land a revert; anything tighter — a named
approver list, say — stops a maintainer answering their own handoff.

Rejected: **the person the item was handed to**. Handoffs are posted to the item, not addressed to
an individual, and the obvious answerer is often whoever reads it first.

## Where the answer is written

**A reply on the item, in the shape the handoff quotes.** The handoff already names the path and
what the revert would undo, so it can print the exact token to paste back. The answer arrives by
the route the question left by, which is the property that makes it likely to be given at all.

- **A file in the repository** — durable, attributable, and wrong: it is a standing permission
  committed to the artifact, which is what `guard-silent-reverts` task 3.5 strips precisely to
  prevent.
- **A label** — cheap to apply and impossible to scope. A label cannot name a path and a blob, so
  it authorises the item rather than the revert.
- **A CLI command run by the operator** — the cleanest security story, and it requires the person
  who read the handoff to have a terminal, the repository, and the Igor installed. The handoff is
  read on a phone as often as not.

## Where it is stored

**The state branch**, keyed by artifact, path and base blob. `deferred.json` and the run records
already live there: durable, per-destination, and out of the user's main line.

**Not lore.** `guard-silent-reverts`' design names a lore entry as the shape that could carry this
and refuses it. That refusal is right and this does not reopen it — the objection is to lore as a
*store*. Lore is general, curated knowledge shared by every Igor; a one-shot authorisation for one
path on one artifact is none of those, and filing it there is what would make it read as standing
permission. Persistence was never the problem.

**Not the tracker alone.** Re-reading every handoff's replies each cycle to reconstruct
authorisations is a request per item per cycle, and it makes the authorisation's meaning depend on
comment parsing at the moment of use rather than once at the moment it was given.

## What expiry costs

An authorisation names a blob, so a base that touches the path again invalidates it and the person
is asked a second time. That is the intended behaviour — the state they agreed to discard is no
longer the state on offer — but it will read as the Igor having forgotten. The handoff that asks
again should say that it is asking again and why, which is wording, and `tasks.md` carries it.
