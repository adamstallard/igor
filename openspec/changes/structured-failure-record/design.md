# Design

Only the second requirement earns this file. What a failure entry must carry is settled by the
requirement itself — there is no mechanism left to choose once the entry has to hold an identity, an
origin and a line. What happens to the **candidate** a failed call lost is a mechanism with
alternatives worth refusing on the record, and one of those refusals is a position this file itself
held until review reversed it.

## The held mark was the original design, and one of its own scenarios cannot be satisfied that way

The first version of this requirement kept the candidate in the pool by holding its source's mark
below it. The proof that this cannot work is a scenario the requirement already carried:

> **Scenario: A failure beside a verdict holds only its own candidate**
> - **WHEN** some of a cycle's triage calls fail and the rest return verdicts
> - **THEN** the candidates that got verdicts are not asked about a second time
> - **AND** the candidates whose calls failed are

There is one timestamp per source, and those two outcomes pull it in opposite directions:

- not re-asking the verdicts needs the mark **at or above the newest verdict**;
- re-asking the failed candidate needs the mark **below that candidate**.

Both hold only where the failed candidate is newer than every verdict in its source, and in the
ordinary partial failure it is not. `survivors.sort(byAge)` (`src/loop.ts:588` on
`origin/triage-gate`) orders the batch oldest first, `triageBatch` walks it in that order, and a
call that fails is therefore older than the successes that follow it in the same batch
(`src/loop.ts:695`–`:701`). A failed call sits in the **middle** of its batch, and no single
instant separates it from the verdicts on either side.

This is not a corner to be conceded. It is the shape of every partial failure, which is the only
shape a failed call has when the rest of the batch works.

The measurement that follows from it: **the mark is the wrong instrument for a per-item fact, not a
mis-tuned one.** No tie rule, no retry bound and no ordering change makes a single instant express
"ask about this one again and not the ones beside it".

## Carry the candidate by its id — taken

The mark advances over everything the cycle examined, the failed candidate included. The candidate
is carried by **id** in the discovery state beside the marks, offered to triage next cycle
regardless of the mark, and the record clears as soon as a cycle reaches a decision about it.

This is not a new invention. `docs/architecture.md` §5.0.2 names the mechanism in passing —

> Watermarks **and seen-item records** are an efficiency measure, not a correctness mechanism.

— and `reconcile` faced the identical choice for its pull-request floor and rejected the held floor
for exactly the cost the held mark has here:

> **A floor held behind unfinished work is rejected, and it is the subtler trap.** […] Holding the
> floor behind the oldest of them looks like the way to say so, and it **abandons nothing while
> re-reading everything newer, every run, forever** […] Unfinished pull requests are carried by
> **number**, in `pending`, which clears itself on the first run that finds nothing left to do. A
> condition that never clears still costs its few requests every run and holds one of a hundred
> slots, which is **the same standing condition at a constant price rather than at the price of the
> bound.**

Substitute *candidate* for *pull request* and *watermark* for *floor* and that is this
requirement's problem and its answer. The closing clause is what a bounded carry buys: a candidate
that never clears costs a constant price instead of dragging the mark down and re-billing
everything newer, every cycle.

The implementation has less to build than it looks. `discoverSource` already keeps everything the
query returned in `result.candidates` before the mark is applied (`src/discovery.ts:88`), so a
carried id is picked out of what discovery already fetched and nothing extra is read.

## This design was refused twice in writing, and here is what changed

It should not be reversed quietly. Both refusals are quoted and answered.

**[#78](https://github.com/adamstallard/igor/issues/78), as filed:**

> **Re-queue the candidate** for the next cycle instead of holding the mark. Different shape, and
> it needs somewhere to keep the queue, which the watermark exists to avoid.

**This file, in the section this one replaces:**

> A queue of items to retry is a second durable structure beside the watermark, doing the
> watermark's job with different failure modes: it needs a home on the state branch, a bound, a
> reconciliation against items that were closed or edited meanwhile, and an answer for what happens
> when the write that would drain it is the thing that failed. The watermark exists so that a cycle
> carries no per-item state between runs. Adding one here to handle the rarest path would be the
> most state for the least traffic.
>
> It is also refused by the requirement rather than only by this argument: the requirement says the
> source mark does not advance past the candidate, which a re-queue does not do.

What changed is not the cost of the carry. It is that **the alternative turned out not to work at
all** — the section above — so the four objections are the price of the only design left, and each
one has an answer in code already running.

**"It needs a home on the state branch."** There are two already. `reconcile.json` holds unfinished
pull requests by number (`src/reconcile.ts:50`), and `deferred.json` holds handed-back items by
candidate id (`src/deferred.ts:29`, `:33`). §5.0.2 names both as belonging there. The carry's home
is `discovery.json`, beside the marks, and the next objection is why it must be exactly there.

**"It needs a bound."** So did both of those, and both have one: `MAX_PENDING = 100` in
`reconcile.ts:35`, and `MAX_AGE_DAYS = 30` with `MAX_ENTRIES = 500` in `deferred.ts:73`–`:74`. The
bound here is in its own section below, because the unit of cost is not the same one and the number
must not be copied.

**"It needs a reconciliation against items closed or edited meanwhile."** The next discovery
answers that from the tracker rather than from the record. A carried candidate is re-offered as a
candidate, so it passes the same screen everything else does: a closed item is skipped at the
universal stage (`src/predicate.ts:63`), a stopped or handed-back item is dropped by the gates that
already run, and an edited item is simply a candidate with newer text. All of those are decisions,
and a decision is what clears the carry. The carry stores an id, so there is nothing in it that an
edit could make stale.

**"It needs an answer for what happens when the write that would drain it is the thing that
failed."** This is the strongest of the four and it decides the file the carry lives in.
`writeState` writes one whole JSON document per call (`src/state.ts:117`–`:140`), so **the mark and
the carry are one write when they share `discovery.json`, and they cannot diverge.** A failed write
loses both: the mark stays where it was, the failed candidate is still above it, and the next cycle
finds it by ordinary freshness. A failed write in the other direction — a cycle that reached a
verdict and could not record the clearing — leaves the carry as it was, so the candidate is offered
once more and clears then, at the price of one redundant triage call.

Put the carry in a **file of its own** and that property is lost: two writes can disagree, and the
one that loses is the candidate. The mark write landing while the carry write fails advances the
mark over a candidate nothing is carrying, which is #78's bug restored by the fix for it. So the
answer to the objection is also a constraint on the implementation, and `tasks.md` states it.

**One clause in the old refusal is false as written.** *"The watermark exists so that a cycle
carries no per-item state between runs"* — a cycle already carries per-item state between runs, in
the two files named above, and §5.0.2's *"watermarks and seen-item records"* anticipates it. The
watermark exists so that a cycle does not re-read a whole backlog; it was never a rule against
remembering an item by name.

**And one clause was circular.** *"It is also refused by the requirement rather than only by this
argument"* — the requirement clause doing the refusing was *"the source mark does not advance past
the candidate"*, which is the same clause that makes the third scenario unsatisfiable. A design
cannot be refused by the sentence that is the defect.

**The frequency premise is unmeasured, and both refusals leaned on it.** *"The rarest path"* and
*"the most state for the least traffic"* are assumptions with no figure behind them. Nothing
measures how often a triage call fails: `report.failures` is a `string[]` written to the record and
read by nobody, which is the first requirement's complaint about it. There is at least one
deterministic path — `parseVerdict` matches greedily from the first `{` to the last `}` in the
model's response and hands the span to `JSON.parse` (`src/triage.ts:204`–`:206`), so an item whose
own text contains braces can produce an unparseable verdict every time it is triaged, and issues in
this repository routinely contain JSON. That is a mechanism, not a rate. **What would measure it:**
counting failure entries per cycle by candidate, once the first requirement makes an entry
countable, and seeing whether the same candidate id recurs. Until that exists, neither refusal's
frequency claim should be repeated and the bound should not be sized from one.

## The bound, and why reconcile's number is the wrong number

The failure mode being bounded, stated plainly: **a candidate whose own content reproduces the
fault never reaches a decision, so nothing clears it.** A body that will not fit the call, content
that trips a filter, an envelope the parser will not read. One such candidate is carried for as
long as its source is polled. Unbounded, the record gains one entry per permanently broken item and
becomes state that only grows — and because every carried candidate is offered every cycle, enough
of them fill a cycle's triage capacity and the pool stops draining.

**The unit of cost is not reconcile's, so the number must not be reconcile's.** A carried pull
request costs "a handful of requests per run" against a request budget nothing else is competing
for, which is why a hundred slots is affordable there. A carried candidate costs **one triage slot
per cycle**, against `options.limit ?? 10` — and `survivors.sort(byAge)` puts old candidates at the
head of the batch, so carried ones take the first slots. A carry sized like `MAX_PENDING` would
hand every slot of every cycle to the broken items and triage nothing else. This is the one place
the precedent does not transfer, and it is recorded here because the precedent is otherwise being
followed closely enough that a reader would assume it does.

Two bounds follow, and they are two clauses rather than two spellings of one number: a count is
per-source state and cannot express a cycle-level guarantee across sources.

- **How many are kept**, scoped as the mark is.
- **How much of a cycle they may take**, which is a property of the cycle.

**Provisional constants**, stated the way `BREAKER_TRIP_AFTER` is, because nothing has failed
deterministically yet and anything fitted now is fitted to nothing:

- **Three carried candidates per source.** The unit of cost is a triage slot per cycle against a
  default cap of ten, so three leaves seven for work nobody has looked at, and a source with more
  than three items its own content breaks has something wrong with it that retrying will not fix —
  the same argument `MAX_PENDING`'s comment makes for a hundred pull requests.
- **At most half of a cycle's triage capacity goes to carried candidates.** This is what bounds the
  multi-source case a per-source count cannot: several sources each carrying their three could
  otherwise fill the cap between them. Carried candidates past the share wait for a later cycle,
  which costs nothing, because waiting is what being carried means.

**What happens at the bound.** What is shed is what has been carried longest, not what failed most
recently — the chronic case is the one the bound exists for, and the recent one is the transient
fault about to clear. Both precedents order retention the same way: `retentionOrder` keeps newest
activity first *"so that what falls off is the oldest standing condition"* (`src/reconcile.ts:197`),
and `prune` keeps the newest deferrals, *"age first, so a quiet Igor's record shrinks rather than
only ever growing"* (`src/deferred.ts:94`).

**And a shed candidate is said out loud.** It falls below its mark and is lost — #78's bug, bounded
in cost and identical in kind. `retentionOrder`'s comment already reaches this conclusion for
pull requests: *"why the report names what fell off rather than losing it quietly."* A candidate
that quietly stops being retried and quietly leaves the pool is the defect with more steps, so the
requirement makes the report a `SHALL` rather than leaving it to a line in `decisions.ndjson` that
nothing surfaces.

## What the coarse clock stops costing

The held-mark design had one acknowledged cost, carried in the requirement as a concession and in
two scenarios: where a failed candidate shares an `updatedAt` with one its own source got a verdict
for, no instant lies between them, so the candidate was passed over rather than held. Carrying by
id removes the concession rather than mitigating it. There is no instant to squeeze between two
items, nothing is conceded to a tie, and the two scenarios that existed only to state the carve-out
are gone. **The design that cannot satisfy a scenario is also the only one that needed the
exception**, which is worth noticing: the exception was the mechanism showing through.

## Alternatives refused

### Hold the mark and bound the retries — refused

This was the recommendation at review, before the unsatisfiable scenario was found: after N
consecutive failed calls naming the same candidate, stop holding the mark. It is refused on two
counts, and the first is fatal on its own.

**A bound on the retries does not make the requirement satisfiable.** N caps how long the mark is
held; it does nothing about the fact that a mark held for even one cycle re-asks every verdict
newer than the candidate, which the third scenario forbids. The bound limits the duration of a
wrong answer.

**And the bound needed a third outcome nobody wanted.** "Record it as decided so the mark can pass"
violates the requirement's own *"MUST NOT be recorded as decided about"* — nothing decided it, the
call failed. Escaping that needs a state that is neither a verdict nor a skip — *asked N times, no
answer, no longer asking* — which has to be defined, recorded and surfaced. The carry needs no N,
no give-up state and no new outcome: a candidate is carried or it is not.

### Drop the third scenario — refused

The honest alternative to implementing the scenario is deleting it, and it costs one of the two
things it forbids:

- **Re-ask the verdicts.** A mark held below the failed candidate makes every newer candidate fresh
  again, including the ones that got verdicts the cycle before, because the mark is the only memory
  of what has been triaged — there is no seen-set, and `decisions.ndjson` is written but never read
  back at discovery. #70 measured this exact state as *"a full cap of calls every cycle on a backlog
  that never drains"* and fixed it by sorting; reintroducing it through a held mark buys back the
  bug it removed.
- **Drop the failed candidate.** That is #78 unfixed, and this change exists for #78.

Weakening a requirement is a real choice, but it should be made deliberately rather than discovered
by an implementer who finds the scenario cannot be made to pass.

## Which shape the implementation takes

The branch-keyed procedure this file used to carry mostly collapses. Carrying by id touches neither
`report.untriaged` nor the held-set computation, so the carry itself is the same code whether or not
[#70](https://github.com/adamstallard/igor/pull/70) has landed. What still depends on #70 is only
where the *"no verdict was reached on this candidate"* record lands: a fourth untriaged reason
beside `OVER_LIMIT`, `UNTRIAGED_NO_SEAT` and `NO_CREDENTIAL` where #70 is in, and a destination of
this change's own where it is not. Neither shape changes the mark, which now advances normally in
both.

The failure entry stays either way. It is the record of the fault; the carry is the record of the
item. Replacing one with the other loses whichever the reader needed.

## What the code said

**#70 needs no change, and this design does not touch it.** Checked rather than assumed, because
an earlier review of this change claimed its filter conceded too much. It does not. #70 holds the
mark below a candidate whose `updatedAt` is `> max(verdicts in that source)`
(`src/loop.ts:739`–`:747` on `origin/triage-gate`), and with oldest-first ordering its untriaged
candidates are always the newest in their source: `OVER_LIMIT` is the tail `survivors` past the cap,
so every verdict came from an item at or before it; and `UNTRIAGED_NO_SEAT` and `NO_CREDENTIAL`
mark the whole `considered` set with no call made at all (`src/loop.ts:672`, `:683`), so
`report.verdicts` is empty for that source and there is nothing to sit above. The filter therefore
concedes exactly ties, which is what its spec says — *"a candidate that can be separated from
everything its source decided is always held"* — so spec and implementation agree. Holding the mark
is cheap and correct for #70's three reasons, and wrong only for a failed call, which is not one of
them.

**#78 describes the watermark block as it is on `origin/triage-gate`, not on `main`.** There
`unexamined` is built from the held skips and the untriaged set; on `main` (`src/loop.ts:643`) it is
the held skips alone. The defect is in both, and the requirement is worded against neither.

**There is a second instance of the same class on `main`, and it is not this change's.** At
`src/loop.ts:606` a throw from `workerEnv` leaves `env` undefined, so the whole `considered` batch
is never triaged; those candidates were never skipped, so nothing in `report.skipped` holds the mark
for them either, and they are dropped exactly as a failed call's candidate is. It is covered by #70
by name — its "A candidate left untriaged is not a candidate triage decided about" lists "a seat
whose credential will not resolve" among its causes — and two in-flight requirements over one fact
is a collision `openspec validate` cannot see. **If #70 is closed unmerged, this requirement is the
place to widen.**

**Nothing measures how often this happens.** Recorded because both earlier refusals were argued
from a frequency nobody has counted. See the frequency premise above.
