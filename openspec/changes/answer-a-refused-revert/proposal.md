# A person's answer to a refused revert outlives the run that asked

## Why

`guard-silent-reverts` refuses to publish a resolution that would undo what the base did to a
path, unless the resolution declares that path. The declaration is deliberately not durable: a
file in the disposable tree, read by the loop and never committed, so the permission is retaken
each run rather than inherited.

That closes the loop inside one run and leaves it open across runs. A revert that was refused,
handed off, and then **agreed to by a person** leaves no answer an Igor can read. The next cycle
starts from the same comparison, refuses again, and the person resolves the branch by hand — so
the handoff asks a question the Igor has no way to hear answered.

The default is right. What is missing is a way for the answer to come back.

## What must be true

A person who agrees to a refused revert can say so where the refusal was posted, and a later run
publishes it — without that answer becoming a standing permission for anything else.

Three properties make it an answer rather than a permission:

- **It names one revert.** One artifact, one path, and the base state being discarded.
- **It expires by construction.** It names a specific base blob, so the moment the base changes
  that path again it matches nothing. This is already the rule for the worker's in-tree
  declaration ([#131](https://github.com/adamstallard/igor/issues/131) settled the same point).
- **It is matched, never interpreted.** The run computes the refusal it would issue and asks
  whether an answer matching that exact triple exists. No text from the item reaches a decision.

## What this is not

**Not a lore entry.** `guard-silent-reverts`' design names one and refuses it, correctly. The
objection is to lore as a *store*: lore is general, curated knowledge shared by every Igor, and a
one-shot authorisation for one path on one artifact is none of those. Storing it there is what
would make it look like standing permission — not the fact that it persists.

**Not a durable in-tree declaration.** Making the worker's file survive the run is precisely the
blanket, inherited form the guard exists to prevent.

## Scope

Depends on [#103](https://github.com/adamstallard/igor/pull/103), which puts the refusal and the
declaration in force. Nothing here is implementable before it lands, and the requirement this adds
is written to sit beside that one rather than modify it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
