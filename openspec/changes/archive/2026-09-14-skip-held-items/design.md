## Context

Two rules, one shared shape: an item that is not the Igor's to act on should be recognized
before the cycle spends anything on it.

## Decisions

### The holder skip is universal, not a lane

`universalSkip` gains the running identity and skips any candidate naming a holder other than
that identity. It sits with closed and in-flight for the same reason those do: an org that has
to remember to write it gets the failure by default.

The reading matches `verdictFrom` exactly — any name that is not ours means the item is not
ours, even where ours is still on it. Two places deciding "is this still mine" from the same
field should not disagree about what a second name means.

Where a dry run has no identity to pass, every holder reads as foreign. That errs toward
reporting a skip the running Igor might not take, which is the safe direction for a preview.

### Suppression keys on the handoff, not on triage

The obvious cache — remember what triage declined — turns out to be a no-op. `nextWatermark`
takes the maximum `updatedAt` across everything a search *returned*, not just what survived, so
an item nobody touched already sorts below next cycle's floor and never reaches triage again.

What actually recurs is a handoff. The Igor claims, hands back, and its own comment lifts the
item above the watermark; the claim is released, no pull request exists, the lane still admits
it, and the model gives the same verdict on the same text. So the record is written after
`runItem`, keyed on the outcome, and read in `planCycle` against the survivors.

Budget handoffs are not recorded. Nothing about the item produced that outcome, and the item
should return when the budget does.

### Lifting suppression needs both a fingerprint and a comment check

A fingerprint over the item's own fields — state, title, body, labels, holders — catches an
edit, a relabel, a release. It deliberately excludes `updatedAt`, which the Igor's own comment
moves.

It cannot catch a reply, and a reply is the likeliest answer of all: a handoff asks for one. An
Igor that went quiet on the item it asked about, because the person answered in a comment
rather than by retitling, is a worse failure than the one being fixed. So a matching
fingerprint is necessary but not sufficient — the tracker is also asked whether anyone else has
spoken since.

That costs one request per suppressed item. It is bounded by the triage limit, paid only for
items that already have a record, and is the same call `verifyClaim` makes. Adding a comments
connection to the search query instead would raise the cost of every page, on a query whose
page size was already measured down to 25 to stay inside GitHub's limits.

### `commentsSince` is a tracker primitive

Answering "has anyone else spoken" needs a surface-agnostic way to ask. `verifyClaim` already
fetches comments but returns a verdict, not the material. The new method returns author, time
and body; `verifyClaim` could be composed from it later, but rewriting a load-bearing path is
not part of this change.

### The record is a cache

It lives on the state branch beside the watermarks, and losing it costs a repeated handoff, not
a duplicate claim. Entries prune at 30 days and at a hard cap, so a long-running Igor does not
accumulate a file nobody reads.

## Roads not taken

**`no:assignee` in the recommended query.** It reads as the cheapest fix — the tracker filters,
nothing else changes. But it makes a correctness rule into configuration, and a query is the
one part of a role an org rewrites freely. The rule then holds only for orgs that copied the
example and never edited it.

**Suppressing the claim comment on a held item.** Treats the symptom. The comment is the part
that works.

**Recording every triage decision.** Written, then cut: the watermark already does it. See
above.

## Interaction with concurrent instances

"An item the Igor itself holds is still a candidate" is what recovers a claim a dead process
left behind. It is also what lets two processes sharing one machine account both regard an item
one of them already holds as free. That is the same collision `concurrent-instances` exists to
close, by marking which process holds a claim; this change deliberately does not pre-empt it,
because a per-process marker is the fix and a weaker rule here would break stale-claim recovery
for the single-process case that is the only one shipping today.
