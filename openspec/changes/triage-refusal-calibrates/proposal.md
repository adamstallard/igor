## Why

`ee2c9b9` (#39) made a provider refusal write an observation at 100%. On a seat bought for a fleet,
that is the reading of a full window that does not depend on undocumented output. A run's own
`rate_limit_event` also reads the seat, with nobody signed in (`docs/architecture.md` §6.3.3), and
reading it is specified by `read-seat-windows-from-the-stream`
([#143](https://github.com/adamstallard/igor/pull/143)). But that event is not in the provider's
documentation, its `rejected` shape has never been captured (#57), and triage does not see it at
all. **So this change is the fallback:** this change records a triage refusal unless the call's
own `rate_limit_event` reports it `rejected` and an observation of the refusal is recorded from
that event. While triage runs `--output-format json`, it receives no events, so this change
records every triage refusal.

The code from #39 that writes that observation is the last of four writes in `recordExecution`, which runs **once per execution**.
Triage never reaches it. `usageLimit` has no call site in `src/triage.ts`, so a refusal met at
the triage stage becomes

    report.failures.push(`${candidate.native}: ${error.message.slice(0, 80)}`)

with no `ExecutionResult` behind it. Nothing classifies it as a budget stop, nothing captures the
envelope, and nothing records an observation.

**Triage is the first model call of every cycle**, and the one made against candidates the Igor
has not yet decided to work. If a seat's window is exhausted, triage is where that is most likely
to be discovered first — and it is the moment the observation is worth the most, because the
refusal proves the window was full at a known instant, and a reading at 100% holds the seat out
until that window resets. So the loop #39 built has a hole at its most probable entry point: the
seat gets refused, and the one signal that would hold it out is dropped because the refusal arrived
at the wrong call site.

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

- **A refusal is a refusal wherever Igor meets it.** Where the provider refuses a triage call on a
  seat the gate named, an observation is recorded at 100% for that seat and window, with source
  `limit`: the same row a refused run writes, by the same rules for which window was hit and
  whether the reset can be placed. Where the call's own `rate_limit_event` (the event a call's
  `stream-json` output carries, specified on #143) reports it `rejected`, and an observation of the
  refusal is recorded from that event, this change writes nothing.
- **Only a provider-filled field counts.** A limit named only in the result text records nothing,
  and the refusal is recognised by the recogniser a refused run uses, `usageLimit`.
- **One refusal is one observation, and the batch stops.** The model stage stops calling the seat
  at the first recognised refusal, and the one write happens after the per-candidate loop, in the
  caller that owns the batch, without reading the log first.
- **Nothing triage decided is lost.** Verdicts reached before the refusal stand. The refused
  candidate and those not reached are left untriaged and hold their source's watermark back.
- **The envelope boundary widens.** `TriageResponse` carries the fields `usageLimit` reads, so
  triage can call it.

design.md's *Decisions* says why each is shaped this way and what was rejected.

## The question this change does not settle

**A triage refusal is the likeliest place a per-model cap gets mistaken for the whole window, and
this change does not fix that.** *An observation records how full a window was* already SHALLs the
distinction: "An observation of a window scoped to one model SHALL record that model... recording a
refusal against it as an unqualified `week` would assert that the whole window was full when it was
not." Triage always runs `TRIAGE_MODEL` — Haiku, and never the model a worker runs — so triage is
the one call in the cycle where a refusal could be a model-scoped cap while the all-models window
still has room.

This change records the observation by the rules a refused run uses, and those set no `model`:
`recordExecution` writes none, though `Observation.model` exists for it. Recording a triage refusal
as model-scoped wherever triage's model could be the one capped would calibrate nothing, because
the in-force text derives no bound against a per-model window. Whether a triage refusal should record
the model where the refusal names one is open (design.md, *Open Questions*; task 5.1).

What is left standing is a real cost, stated rather than hidden: a per-model refusal recorded
unqualified holds the seat out until the reset and lowers its estimate on a row that cannot be
taken back. It is a pre-existing gap that this change makes more reachable rather than one it
creates, and closing it needs a captured live refusal to read the wording off — which is the thing
nobody has yet.

## How this fits with #70

[#70](https://github.com/adamstallard/igor/pull/70) (`triage-needs-a-seat`), merged, and this
change close a loop, and neither is much use without the other.

#70 stops the triage call where the gate **names no seat** — the case where the budget already
knows there is no capacity and spending anyway is waste paid for by an unattributable credential.
This change covers the case where the gate **named a seat and was wrong**: it believed there was
headroom, the call went out, and the provider refused it. That refusal is the evidence the estimate
was too high, and recording it is what stops the gate being wrong the same way tomorrow. #70 acts
on what the budget believes; this change corrects what it believes. #70's own impact section says
as much from the other side — a refusal met during triage is a calibration point only in the case
#70 leaves running.

This change adds only to `seat-budget`, under names that neither #70 nor
[#74](https://github.com/adamstallard/igor/pull/74), which also changed seat-budget's refusal
handling, uses, so none of the three overwrites another's requirement.

The two meet at the same call site in `src/loop.ts`, and the sequence reads in one direction: the gate is consulted, and either it names no seat and #70 stops
the call, or it names one and a refusal from that call writes the observation that will make the
gate name no seat next time.

Stopping the batch at a refusal leaves the remaining candidates untriaged, and the mark must not
pass them: nothing about those items produced this outcome and nothing about them will change to
lift them, so a watermark allowed past them drops them for good. #70, now merged, holds the mark
for such candidates under work-triage's *A candidate left untriaged is not a candidate triage
decided about*, and this change's requirement leaves the refused candidate and those it did not reach untriaged
under that rule. On `main` the refused candidate lands in `report.failures`, which nothing reads,
so the mark passes it; leaving it untriaged here keeps it without waiting for
[#99](https://github.com/adamstallard/igor/pull/99)'s *A failed triage call leaves the candidate in
the pool*.

## Capabilities

### Modified Capabilities

- `seat-budget`: a provider refusal met during triage records the observation a refused run would,
  and one refusal records one observation however many calls met it.

**Why one capability and not two.** The rule looks like it should be split — something about
observations in `seat-budget` and something about the triage stage in `work-triage` — and it should
not be. The reason the batch stops is not a triage concern; it is that an observation is worth
exactly one row per refusal, and the stage's loop is the only thing that can make that true.
Putting the stop in `work-triage` would leave the invariant in one capability and its only
mechanism in another, where a later change to either could quietly break the pair. Keeping both rules in
`seat-budget` also keeps the delta clear of `work-triage`, whose untriaged rule it relies on unchanged.

Both requirements are `ADDED`. The tempting `MODIFIED` target is *A limit error lowers the estimate
that permitted it*, and it is the wrong one: that requirement is about what an observation does to
an estimate, and is correct as written for any observation however it arrived. What is missing is
not a qualification on it but an obligation to record from a second call site, with an exactly-once
rule that has no analogue on the first. Folding both into it would bury the dedup rule inside a
requirement about estimates, where nobody implementing triage would look.

## Impact

- A dedicated fleet seat gets a full reading from the call most likely to discover it is exhausted,
  rather than only from a run that got far enough to be refused, and without depending on the
  undocumented stream event. Where a triage call's own event reports it `rejected` and records
  it, this change writes nothing, so the two never record one refusal twice.
- One additional write to the state branch per cycle, and only in a cycle that met a refusal.
- `TriageResponse` gains the limit-bearing fields, typed to the same
  either-the-type-it-claims-or-absent discipline the boundary already applies. Nothing that reads
  `result`, `costUsd` or `isError` changes.
- A triage batch that meets a refusal stops early instead of refusing every remaining candidate in
  turn, which also removes a spawn per candidate from a cycle that was going to achieve nothing.
- Implementation lands in `src/triage.ts` and `src/loop.ts`.
