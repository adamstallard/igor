## Why

`ee2c9b9` (#39) made a provider refusal write an observation at 100%, and on a seat bought for a
fleet that is not one calibration route among several — it is the only one there is. Every other
route needs a person signed in on the seat to take a reading, and nobody signs in as a fleet
seat. The comment at `src/execute.ts:1620-1626` says so in as many words.

That writer is the last of three writes in `recordExecution`, which runs **once per execution**.
Triage never reaches it. `usageLimit` has no call site in `src/triage.ts`, so a refusal met at
the triage stage becomes

    report.failures.push(`${candidate.native}: ${error.message.slice(0, 80)}`)

with no `ExecutionResult` behind it. Nothing classifies it as a budget stop, nothing captures the
envelope, and nothing records an observation.

**Triage is the first model call of every cycle**, and the one made against candidates the Igor
has not yet decided to work. If a seat's window is exhausted, triage is where that is most likely
to be discovered first — and it is the moment the observation is worth the most, because the
refusal proves the window was full at a known instant with the spend record complete behind it.
So the loop #39 built has a hole at its most probable entry point: the seat gets refused, and the
one signal that would calibrate it is dropped because the refusal arrived at the wrong call site.

This is not about enforcement. Triage spend never reaches `EXECUTIONS_PATH` and the budget ledger
reads nothing else, so no ceiling is being evaded. An observation is a capacity signal, not a
spend record, and its value is unaffected by that.

## Why this is a proposal and not a bug fix

Nothing in force reaches a triage refusal, and that was checked against the text rather than
assumed. The two `seat-budget` requirements that would have to cover it both turn on a **run**:

- *A limit error lowers the estimate that permitted it* — "**WHEN** the provider refuses a run on
  a seat whose estimate said capacity remained".
- *An observation records how full a window was, and when it resets* — "**WHEN** the provider
  refuses a run because a window is exhausted".

A triage call is not a run, and the codebase already treats it as one thing and not the other:
triage produces no `ExecutionResult`, appends nothing to `EXECUTIONS_PATH`, and writes no
transcript, which is precisely why `recordExecution` never sees it. The rationale prose around
those requirements — "a limit error is a reading at exactly 100% with a reset time attached" —
reads as though it covered any refusal, but the normative clauses do not, and prose is not what an
implementer is held to.

So the behaviour is **underspecified rather than contradicted**. There is no in-force sentence a
triage refusal violates, which means there is nothing to fix; there is text to add, and the
exactly-once rule below is text nobody could have derived from what is in force. Had the in-force
scenarios said "a call" rather than "a run", this would be a bug fix and would not need a spec
change at all.

## What Changes

**A refusal is a refusal wherever Igor meets it.** Where the provider refuses a triage call on a
seat the gate named, an observation is recorded at 100% for that seat and window, with the reset
the refusal stated and source `limit` — the same row a refused run writes, by the same rules for
which window was hit and whether the reset can be placed.

**One refusal is one observation, and the batch stops.** This is the part an implementer reading
only the requirement is most likely to get wrong, so it is written to make the wrong shape
unstateable rather than merely discouraged. `triageBatch` loops per candidate and continues past a
failure on purpose — one unparseable verdict should not cost a cycle its other decisions. An
exhausted window is not that kind of failure: it will refuse the next candidate and the one after,
so a write placed inside that loop turns one exhausted window into one row per candidate.
`capacity.ndjson` is append-only and never rewritten, so those rows are permanent, and a division
over them derives a capacity from a denominator counted many times.

Deduplicating at the writer is the tempting fix and is the wrong one. *Observations are appended
to their own log and never rewritten* justifies itself with "there is no read-modify-write, so no
row is lost to another being written" — and a writer that first reads the log to ask whether a row
for this seat and window already exists is exactly that read-modify-write, unsafe across several
Igors sharing a state branch. So exactly-once has to come from the **shape of the loop**, the way
`recordExecution` gets it for free from `execute()` having one call site per run: the refusal ends
the stage's calls on that seat, and the single write happens above the per-candidate loop, in the
one place that owns the batch. The requirement says both, and says them as one rule, because
either alone permits the bug.

Stopping the batch costs nothing that was not already lost. When the window is exhausted every
remaining call would have been refused too, so the candidates left untriaged are the same
candidates that today each get a `failures` line and no verdict.

**A triage-originated observation needs a structural signal, not prose.** `recordExecution` writes
the observation only on `outcome === 'budget'` — a classification made upstream, with the run's own
verdict already on the record. Triage has no such classification, so the recogniser's own verdict
is all there is. `limitSignals` names `result` separately from the rest for exactly this reason: it
is worker prose written about an item, and an item about rate limits trips it. On the triage path
there is no second reader to catch that, and the cost of being wrong is a permanent row asserting a
seat was at 100% when it was working fine. So a triage refusal counts only where `structuralLimit`
holds — a field the provider filled, not a sentence the model wrote.

**One recogniser, not two, which is what makes the envelope boundary move.** `parseEnvelope`
returns `result`, `costUsd` and `isError` and discards everything else, so nothing downstream of it
can see `api_error_status`, `terminal_reason`, `stop_reason` or `rate_limit_info`. A recogniser
given only `result` could read nothing but prose — the one signal the paragraph above rules out. So
the boundary has to widen, and it is widened deliberately rather than as a task nobody argued for.

Its doc comment says why it is strict: "the CLI's JSON is not a contract — a cost has arrived as a
string — and a wrong-typed field admitted here is arithmetic nobody checks again: `0 + "0.02"` is
`"00.02"`". That reason is about **arithmetic**. The limit fields are classification inputs that
nothing sums, so the hazard the comment names does not extend to them — provided they are admitted
under the same discipline, each either the type it claims or absent, which is what
`ExecutionResult.apiErrorStatus` and `terminalReason` already do at the other boundary. Widened to
the fields `limitSignals` reads, a `TriageResponse` satisfies what `usageLimit` asks of a
`WorkerOutput`, and triage can call the recogniser that already exists rather than growing a
second. `limitSignals`' own comment is the argument for insisting on that: the patterns live "here
and nowhere else, so `usageLimit` and the refusal capture cannot drift apart about what a limit
looks like". A triage-only recogniser would be that drift, arriving before the first live refusal
has ever been captured to correct either of them from.

**The write lives where the seat and the destination already are.** `planCycle` holds `gate?.seat`,
threaded there for `workerEnv`, and `deps.destination`; `triageBatch` holds neither and writes
nothing anywhere today. So triage reports a refusal and the cycle records it, which keeps the state
branch out of `src/triage.ts` and puts the write above the per-candidate loop, where the previous
section requires it to be.

## The question this change does not settle

**A triage refusal is the likeliest place a per-model cap gets mistaken for the whole window, and
this change does not fix that.** *An observation records how full a window was* already SHALLs the
distinction: "An observation of a window scoped to one model SHALL record that model... recording a
refusal against it as an unqualified `week` would assert that the whole window was full when it was
not." Triage always runs `TRIAGE_MODEL` — Haiku, and never the model a worker runs — so triage is
the one call in the cycle where a refusal could be a model-scoped cap while the all-models window
still has room.

This change records the model where the refusal names one and records the window unqualified where
it does not, which is exactly what the execution path does: `recordExecution` sets no `model` on the
row it writes either, though `Observation.model` exists for it. Treating the two paths alike is the
whole argument for reusing one recogniser, and the alternative is worse in a way that is easy to
miss: recording every triage refusal as model-scoped would be truthful and would calibrate nothing,
because the in-force text derives no bound against a per-model window. A fleet seat would go on
having no observation that does anything.

What is left standing is a real cost, stated rather than hidden: a per-model refusal recorded
unqualified holds the seat out until the reset and lowers its estimate on a row that cannot be
taken back. It is a pre-existing gap that this change makes more reachable rather than one it
creates, and closing it needs a captured live refusal to read the wording off — which is the thing
nobody has yet.

## How this fits with #70

[#70](https://github.com/adamstallard/igor/pull/70) (`triage-needs-a-seat`) and this change close a
loop, and neither is much use without the other.

#70 stops the triage call where the gate **names no seat** — the case where the budget already
knows there is no capacity and spending anyway is waste paid for by an unattributable credential.
This change covers the case where the gate **named a seat and was wrong**: it believed there was
headroom, the call went out, and the provider refused it. That refusal is the evidence the estimate
was too high, and recording it is what stops the gate being wrong the same way tomorrow. #70 acts
on what the budget believes; this change corrects what it believes. #70's own impact section says
as much from the other side — a refusal met during triage is a calibration point only in the case
#70 leaves running.

They do not collide in the spec. #70 adds to `work-triage` and `seat-budget`; this adds only to
`seat-budget`, under names neither #70 nor [#74](https://github.com/adamstallard/igor/pull/74)
uses.

They do meet in the code, at the same call site in `src/loop.ts`. Where both have landed, the
sequence reads in one direction: the gate is consulted, and either it names no seat and #70 stops
the call, or it names one and a refusal from that call writes the observation that will make the
gate name no seat next time.

One consequence is worth naming because this change causes it and #70 is where it is answered.
Stopping the batch at a refusal leaves the remaining candidates untriaged, and the mark must not
pass them: nothing about those items produced this outcome and nothing about them will change to
lift them, so a watermark allowed past them drops them for good. That is #70's *A candidate left
untriaged is not a candidate triage decided about*, and it is the same handling for the same
reason. This change states the outcome it needs — those candidates are reconsidered by the next
cycle with capacity — without restating the requirement, so it does not depend on unlanded text
and does not duplicate it either. Today the same items are already lost this way: a refused
candidate lands in `report.failures`, which `heldBelow` does not read, so the mark sails past it.
Stopping the batch does not enlarge that set, because an exhausted window refuses every candidate
in it anyway.

## Capabilities

### Modified Capabilities

- `seat-budget`: a provider refusal met during triage records the observation a refused run would,
  and one refusal records one observation however many calls met it.

**Why one capability and not two.** The rule looks like it should be split — something about
observations in `seat-budget` and something about the triage stage in `work-triage` — and it should
not be. The reason the batch stops is not a triage concern; it is that an observation is worth
exactly one row per refusal, and the stage's loop is the only thing that can make that true.
Putting the stop in `work-triage` would leave the invariant in one capability and its only
mechanism in another, where a later change to either could quietly break the pair. It also keeps
the delta clear of `work-triage`, which #70 is rewriting.

Both requirements are `ADDED`. The tempting `MODIFIED` target is *A limit error lowers the estimate
that permitted it*, and it is the wrong one: that requirement is about what an observation does to
an estimate, and is correct as written for any observation however it arrived. What is missing is
not a qualification on it but an obligation to record from a second call site, with an exactly-once
rule that has no analogue on the first. Folding both into it would bury the dedup rule inside a
requirement about estimates, where nobody implementing triage would look.

## Impact

- A dedicated fleet seat gets calibrated from the call most likely to discover it is exhausted,
  rather than only from a run that got far enough to be refused.
- One additional write to the state branch per cycle, and only in a cycle that met a refusal.
- `TriageResponse` gains the limit-bearing fields, typed to the same
  either-the-type-it-claims-or-absent discipline the boundary already applies. Nothing that reads
  `result`, `costUsd` or `isError` changes.
- A triage batch that meets a refusal stops early instead of refusing every remaining candidate in
  turn, which also removes a spawn per candidate from a cycle that was going to achieve nothing.
- Implementation lands in `src/triage.ts` and `src/loop.ts`. `src/loop.ts` is also edited by
  [#64](https://github.com/adamstallard/igor/pull/64) and
  [#65](https://github.com/adamstallard/igor/pull/65), and its triage call site by #70.
- Nothing in `src/` is touched by this change. It is a specification; the implementation is the
  second gate on this branch.
