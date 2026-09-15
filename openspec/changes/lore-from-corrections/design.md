## Context

An Igor witnesses the one source of lore nobody else sees: being corrected. This gives it a way
to say so, without letting it write anything a person has not agreed to.

## Decisions

### Authorship and execution are different questions

Attributing a candidate to the person who corrected the Igor says who *asserted* the lesson. It
says nothing about who *runs* the search for corroborating evidence — and conflating the two
would hand a chore back to the person who just did the org a favour.

`lore-from-reviews` already separates them: a machine-run backfill produces candidates
attributed to the humans whose comments it mined, and the miner authors none of them.

A consequence worth expecting: once corroboration is added, the dominant author may not be the
person who spoke. Three review comments from two years ago outweigh one remark today, and
review routes to their author instead — which is correct, because they are the one best placed
to confirm the rule has held.

### The action space decides who searches, not a prompt

A role holding `propose-lore` may search and propose; that is what holding the action means.
Asking a person per-correction would be asking permission for something already granted, which
is the pattern rejected for conversation caps — a limit aimed at the people the feature is for.

The authority question is answered earlier anyway: a correction only counts from a party with
write access to the artifact, which is the rule that governs instructions. Nothing new gates it.

Searching is read-only and bounded by the ordinary budget, so there is no safety argument for a
round trip either. What it produces goes to review regardless.

### Without the action, say what would have been done

A role lacking `propose-lore` should not fall silent. It should report what it noticed and name
the command that would act on it — "three review comments and a revert say the same thing;
`igor mine --corroborate …` would draft it".

That is the same shape as a mention narrowing an Igor to read-only: reduced capability, still
useful, granting nothing. An organization that keeps Igors out of its lore still learns that
the evidence is there, which is most of the value at none of the risk.

## Roads not taken

**Asking permission per correction.** Friction for something the role already granted, and no
safety gained, since the output is reviewed anyway.

**Writing to the store directly.** There is no version of this that skips review. The action is
named for what it does.

**Proposing on every correction.** Converts a signal into a queue nobody reads, which costs more
than the lore is worth and ends with the review gate ignored. Recurrence is the bar.

**Attributing the candidate to the Igor.** Routes review to an account that cannot confirm
anything, and inflates support with an assertion that is not independent.

### Structural searches are not worth gating

"Search" spans four orders of magnitude and only one end of it is worth a thought.

Structural searches have known cost and no model: `git log --grep='^Revert'` is one pass over
history, `git blame -L` was measured at ~10ms a range, `git log --follow` is cheap. Tracker
queries are nearly as predictable — review threads cost one point a page against an hourly
budget of thousands. Nothing here needs estimating and nothing needs asking; running them is
what an agent is for.

They are also incrementally cacheable, which shrinks it further. A revert does not stop being
one, and a comment's introducing commit does not move, so even a large history is scanned once
and then only where it grew.

## Open

**What a semantic search costs.** Finding comments that *mean* what a remark meant is the one
tier whose cost is not known in advance — and it is the recognizer, which does not exist. Its
profile is a question about resident models rather than about corroboration, and the threshold
above which an Igor should offer rather than act cannot be chosen until something has measured
it.
