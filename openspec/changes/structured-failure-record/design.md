# Design

Only the second requirement earns this file. What a failure entry must carry is settled by the
requirement itself — there is no mechanism left to choose once the entry has to hold an identity, an
origin and a line. What happens to the **candidate** a failed call lost is a mechanism with two
alternatives worth refusing on the record, and an implementation whose shape depends on which of two
open branches lands first. That ordering is a procedure somebody follows, so it is written down
rather than rediscovered.

## Where the candidate goes

[#78](https://github.com/adamstallard/igor/issues/78) lists three. Only the first survives.

### Hold the source's mark below the candidate — taken

The mark is already the mechanism for "this item was not dealt with, ask again". It is durable,
per source, bounded by the tracker's own clock, and reconciled by the next cycle whether or not the
fault repeats. The two instances of this class already closed in this block were both closed this
way, and a third handled differently would leave one block with two answers to one question.

It costs one thing, and the requirement names it: a mark held below a candidate must still sit above
every candidate the same source got a verdict for. Where a coarse clock ties the two, no instant
lies between them and the hold cannot be expressed. The candidate is conceded there — the outcome it
already had — rather than pinning the mark and re-triaging the same page every cycle.

### Re-queue the candidate for the next cycle — refused

A queue of items to retry is a second durable structure beside the watermark, doing the watermark's
job with different failure modes: it needs a home on the state branch, a bound, a reconciliation
against items that were closed or edited meanwhile, and an answer for what happens when the write
that would drain it is the thing that failed. The watermark exists so that a cycle carries no
per-item state between runs. Adding one here to handle the rarest path would be the most state for
the least traffic.

It is also refused by the requirement rather than only by this argument: the requirement says the
source mark does not advance past the candidate, which a re-queue does not do.

### Leave it, and say so in the requirement — refused

This is the option the first two instances of the class were not given, and the case for giving it
to the third is weaker, not stronger. A candidate whose call was never made costs nothing when it is
dropped. This one was examined and paid for: the model call was made, the spend happened, and the
answer was lost. Documenting that as intended would make the most expensive path the only one that
loses its item.

## Which shape the implementation takes, and how to tell

The destination for the candidate depends on whether
[#70](https://github.com/adamstallard/igor/pull/70) has landed when this is implemented. The
requirement is the same either way; the code is not.

**Check first:** does `CycleReport` declare an `untriaged` array (`src/loop.ts`), and does the
watermark block build its held set from more than `report.skipped.filter((s) => s.held === true)`?

- **#70 landed** — add a fourth untriaged reason beside `OVER_LIMIT`, `UNTRIAGED_NO_SEAT` and
  `NO_CREDENTIAL`, and push the candidate to `report.untriaged` in the `batch.failures` loop. The
  held set, the per-source tie concession and the decisions-file rendering are already there and
  need nothing. This is the smaller change and is why #78 recommends it.
- **#70 not landed** — the candidate needs a destination of its own, and the watermark block needs
  to hold the mark from it as well as from the held skips. The concession is not optional in this
  shape: `heldBelow` on `main` pulls the mark below the oldest unexamined candidate without
  comparing it against what the source decided, so a tie there re-triages that source's whole page
  every cycle. Implement the concession with the hold, in the same commit.

Either way the failure entry stays. It is the record of the fault; the second destination is the
record of the item. Replacing one with the other loses whichever the reader needed.

## What the code said

Two findings from reading the block, recorded here because they contradict what a reader of #78
would assume.

**#78 describes the watermark block as it is on `origin/triage-gate`, not on `main`.** There
`unexamined` is built from the held skips and the untriaged set; on `main` (`src/loop.ts:643`) it is
the held skips alone. The defect is in both. The requirement is worded against neither, which is why
it says the mark holds rather than naming the set that holds it.

**There is a second instance of the same class on `main`, and it is not this change's.** At
`src/loop.ts:606` a throw from `workerEnv` leaves `env` undefined, so the whole `considered` batch is
never triaged; those candidates were never skipped, so nothing in `report.skipped` holds the mark for
them either, and they are dropped exactly as a failed call's candidate is. It is real and it is
uncovered on `main`. It is not covered here because #70 already covers it by name — its
"A candidate left untriaged is not a candidate triage decided about" lists "a seat whose credential
will not resolve" among its causes, records those candidates as untriaged, and closes by handing the
failed-call case to #78. Two in-flight requirements over one fact is a collision `openspec validate`
cannot see. If #70 is closed unmerged, this requirement is the place to widen.
