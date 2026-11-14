## Context

The proposal holds why the model stage needs a seat, where the boundary sits, and why a cycle
that triaged nothing reports it. This file holds the reasoning behind the rules in *A candidate
left untriaged is not a candidate triage decided about* that the proposal does not cover.

## Decisions

Each source keeps a watermark, the mark: the `updatedAt` up to which discovery treats the
source's items as seen. Discovery does not reconsider an item below the mark unless it changes.

**An untriaged candidate holds the mark whatever kept the call from happening.** A held pool (a
seat pool the budget gate draws no seat from), a
seat whose credential will not resolve, and a cycle that reaches its own cap on model calls all
leave an item in the same position: nothing about it produced the outcome, and nothing about it
will change to lift the cause. A mark allowed past it means discovery never considers it again.

**The cap falls on the newest candidates.** This is not a preference about which work comes
first. Suppose the candidates left untriaged were chosen arbitrarily. Some would be older than
candidates the same cycle triaged, and holding the mark below them would also pull it below
those triaged ones. The next cycle would triage them again, and the mark would never advance: a
full cap's worth of calls every cycle on a backlog that never drains. Triaging the oldest first
leaves only candidates newer than every triaged one, so the mark moves past everything decided
and the backlog clears a cap's worth at a time.

**A candidate that ties on a coarse clock lets the mark pass.** A mark held below an untriaged
candidate still has to sit above every candidate its source triaged. Where the two share an
`updatedAt`, no instant lies between them. Tracker timestamps are in seconds, so one bulk edit
ties a page of items; this is not a corner case. Holding such a candidate would buy the same
verdicts again every cycle for as long as the tie lasted, so the mark passes it, and discovery
does not consider that candidate again unless it changes. That loss comes from the clock's resolution and is kept as small
as it can be: any candidate that can be separated from everything its source decided is held.

**Whether a candidate can be separated is judged against its own source's verdicts only.** Marks
advance per source, so what one source triaged
is nothing another source's mark has to clear. A tie measured across the whole cycle would drop
candidates that their own source could have held cleanly, losing them for good just as a mark
allowed past an untriaged candidate does.

**A call that was made and failed is outside this rule.** The item was examined and paid for,
which is a different fact from a call never made. What becomes of it is not decided by this
change: [#78](https://github.com/adamstallard/igor/issues/78) tracks it, and an open proposal there
keeps such a candidate in the pool for a later cycle rather than holding the mark.
