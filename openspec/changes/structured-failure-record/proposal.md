## Why

Ten sites across seven files reduce a caught error to one sentence before anything durable is
written ([#90](https://github.com/adamstallard/igor/issues/90)):

```ts
error instanceof Error ? error.message : String(error)
```

Five of them push the result into `report.failures`, a `string[]` on `CycleReport`
(`src/loop.ts:441`), which `recordDecisions` writes to the state branch. That list is the cycle's
record of its own faults — a source that would not answer, a seat token that could not be read
before triage, a triage call that threw, comments the tracker would not return, and the decisions
write itself failing.

**Igor is built to run where nobody is watching.** When it fails there the cycle record is the only
artifact that survives: no console, no terminal, nobody to ask, and it is read hours later by
someone who was not there. What that reader gets is a sentence:

    triage: fetch failed

No stack, no error code, no cause. That is close to unactionable, and unactionable *permanently*,
because the error object was discarded at the moment it could still have been inspected.

**It undercuts work already decided.** [#79](https://github.com/adamstallard/igor/issues/79) exists
so a quiet proposal reaches a person. [#80](https://github.com/adamstallard/igor/issues/80) and
[#82](https://github.com/adamstallard/igor/pull/82) exist so an operator learns a scope has stopped.
All three route a human to a failure — and the record they route to holds four words. Better
routing to a worse artifact is a small improvement on nothing.

**Nothing else already holds this.** There is no transcript for a cycle failure to point at: the
transcript is an execution artifact, and discovery, triage and the state write produce none. On the
execution paths that do return a transcript field, the failure returns set it to `''`
(`src/execute.ts:1334`, `:1400`) — the worker never ran, or never got far enough to produce one. So
the alternative remedy of pointing at a fuller artifact has nothing to point at.

**And the record is already lossy in the other direction.** `src/loop.ts:627` records a triage
failure as `error.message.slice(0, 80)`. The entry is not merely missing structure; it is actively
truncating the one field it has, because a `string[]` gives it nowhere else to put anything.

### The other thing `report.failures` does: it is where a candidate goes to be lost

[#78](https://github.com/adamstallard/igor/issues/78) is the same field read the other way round.
A triage call that throws lands in `report.failures` and **nowhere else** — not `verdicts`, not
`skipped` (`src/loop.ts:626`). The watermark block then builds the set that holds the mark from the
held skips alone (`src/loop.ts:643`), so nothing holds it below a candidate whose call failed. The
mark advances past it, `freshCandidates`' strict `>` (`src/discovery.ts:65`) excludes it from every
later cycle, and nothing about the item ever changes to lift it back. The candidate is not deferred
until the fault clears; it is gone, and the truncated sentence is the only trace it was ever seen.

That is the third instance of one class found in this block — candidates past the per-cycle cap and
a tie conceded across sources were the first two, both closed. Each was found only after the
previous was fixed, which is why #78 asks for the remainder to be written down rather than
rediscovered a fourth time.

## What Changes

**One added `work-discovery` requirement: a recorded failure carries what a reader who was not
there can act on.** Separately readable from the sentence: whatever machine-readable identity the
fault arrived with — an error code, a response status, an exit status — and the origin of the
fault, being where it was raised and the descriptions wrapped around it. The stated measure is that
the entry holds no less than printing the caught fault to a console would have.

**Naming the property rather than a field list is the point.** "The stack" alone is the obvious
answer and is wrong on its own: a code is what a later reader can *act* on, and an origin is what
tells them *where to look*. The requirement also says structure explicitly, because the cheapest way
to satisfy a vaguer version is to stringify a stack into the same `string` and change nothing a
reader can match, count or compare across entries.

**It says a fault must reach the record with its origin intact**, because the record can hold only
what reached it. A wrap that keeps the prose and drops the object has already decided what the
reader is allowed to know, and no widening downstream recovers it.

**It says the single line survives.** `report.failures` has two live readers that interpolate the
entry straight into a terminal line (`src/cli.ts:322` and `src/cli.ts:537`). Widening the entry past
`string` breaks both, and a requirement that only said "the entry is structured" would read as
mandating that a watching operator now be shown objects. The structured parts are for the record and
the sentence is for whoever is watching the run; widening one must not cost the other.

**It bounds honestly.** The identity and the origin survive whatever bound the record applies, and
the fuller trace is what gets shortened — otherwise the requirement silently mandates an unbounded
stack per failure in an ndjson file people read with `git`.

**A second added `work-discovery` requirement: a failed triage call leaves the candidate in the
pool.** The cycle records that it reached no verdict on that candidate and why, the candidate stays
reachable by a later cycle, and the failure entry is not the only record the cycle leaves of it.

**The candidate is carried by id, and the mark advances normally.** The first version of this
requirement kept the candidate in the pool by holding its source's mark below it, and one of its own
scenarios cannot be satisfied that way: with one timestamp per source, not re-asking the candidates
that *did* get verdicts needs the mark at or above the newest of them, while re-asking the failed
candidate needs it below that candidate. Both hold only where the failed candidate is the newest in
its source, and it is not — `survivors.sort(byAge)` (`src/loop.ts:588` on
[#70](https://github.com/adamstallard/igor/pull/70)) triages oldest first, so a call that fails is
older than the successes after it in the same batch. That is every partial failure, not a corner.

So the mark advances over everything the cycle examined, and the candidate is carried **by id** in
the discovery state beside the marks, re-offered next cycle regardless of the mark and cleared as
soon as a cycle reaches a decision about it. This is the shape `reconcile` already uses for
unfinished pull requests in `pending`, and `docs/architecture.md` §5.0.2 anticipates it in as many
words — *"Watermarks **and seen-item records** are an efficiency measure, not a correctness
mechanism."* The same section rejects a held floor for exactly the cost a held mark has here: it
*"abandons nothing while re-reading everything newer, every run, forever"*, where carrying by number
is *"the same standing condition at a constant price rather than at the price of the bound."*

**The carried record is bounded, and the requirement says what happens at the bound.** Without one,
a candidate that fails deterministically — its own content is what the call chokes on — never
clears, and those accumulate one per broken item into state that only grows, while the cycle's
triage capacity fills with candidates that will fail again. The requirement bounds both: how many
are carried, and how much of a cycle they may take, so a cycle still reaches candidates it has never
triaged. What is shed is what has been carried longest, and the cycle reports what it stopped
carrying where a person sees it — a candidate that quietly stops being retried is
[#78](https://github.com/adamstallard/igor/issues/78) again with more steps. The numbers are
provisional and live in `design.md` and `tasks.md`, stated the way the credential breaker's
constants are, because nothing has failed deterministically yet.

**It states an outcome, not a fourth reason code.** #78 recommends a fourth untriaged reason and
that is very likely where the "no verdict was reached" record lands, but the destination differs by
branch: on `main` there is no untriaged set at all, while #70 adds one. A requirement naming the
mechanism would be false on one of the two branches depending on merge order, so the requirement
says the candidate stays in the pool and `tasks.md` names the reason code.

### Why one change carries two requirements about `report.failures`

They are two different faults in one field, found from opposite directions. The first is that a
recorded failure is **illegible** — the entry survives and says too little for a reader to act on.
The second is that a recorded failure **loses the candidate** — the entry survives and the item it
was about does not. Neither implies the other: a fully structured entry with a code and an origin
still drops the candidate, and a held mark still leaves `triage: fetch failed` as the record.

Folding the second in was chosen over a second change because both add requirements to
`work-discovery`, and `openspec validate` does not cross-check between open changes. Two changes
editing the same capability in flight collide invisibly — a duplicated requirement name, or two
requirements each half-covering what one failure entry must do, is found at archive time or not at
all. One change stating both leaves the relationship between them in the text where a reader meets
it, rather than in two proposals that do not mention each other.

### What `design.md` holds

The second requirement is the only part of this change with a mechanism left to choose, so it is the
only part with a design file. It records why the held mark was taken first and why it is refused,
with the unsatisfiable scenario as the proof; the `reconcile` precedent and how far it transfers;
and the two alternatives refused in writing — bounding the retries while still holding the mark,
which caps the duration of a wrong answer rather than making the requirement satisfiable, and
dropping the scenario to accept either re-triage or loss.

**Carrying the candidate was refused twice before, and the file answers both refusals rather than
reversing them quietly** — #78's *"it needs somewhere to keep the queue, which the watermark exists
to avoid"*, and this file's own earlier section, which asked for a home, a bound, a reconciliation
and an answer for a failed write. Each is answered from code already running, and two of its clauses
were wrong: a cycle does already carry per-item state between runs (`deferred.json` by candidate id,
`reconcile.json` by number), and the claim that the requirement itself refused a re-queue was
circular — the clause doing the refusing was the one that made the scenario unsatisfiable. The
frequency premise both refusals rested on is unmeasured, and the file says what would measure it.

The failed-write objection turned out to be the strongest, and it decides where the carry lives:
`writeState` writes one whole document per call, so a carry in `discovery.json` is written with the
mark in a single write and the two cannot diverge. In a file of its own they can, and the cycle
where the mark write lands and the carry write does not is #78's bug restored by its own fix.

It also records three things the code said. **#70 needs no change and is not at fault** — its
untriaged candidates are always the newest in their source, so its `> max(verdicts)` filter concedes
exactly ties, which is what its spec says. #78's description of the watermark block is
`origin/triage-gate`'s shape and not `main`'s. And `src/loop.ts:606`'s `workerEnv` throw is a
second, uncovered instance of the same class on `main` which #70 claims by name and this change
deliberately leaves to it. **If #70 is closed unmerged, that case has no home and this requirement
is where it should be widened.**

### Why `work-discovery` and not `task-execution`

`task-execution`'s "Transcripts and outcomes are captured to the state branch" governs
`executions.ndjson`, written per task in `src/execute.ts:1822`. That is the **execution record**.
`report.failures` is the **cycle record**, assembled in `planCycle` and written by `recordDecisions`
in `src/loop.ts`. They are different artifacts with different writers, and a requirement placed on
the first would not reach the second.

`work-triage` is the near miss. `decisions.ndjson` is the triage decisions file, and work-triage's
"Every decision records its reason, including skips" already governs its per-candidate contents. But
`failures` is not a per-candidate decision — it holds a discovery fault, a credential fault and a
state-write fault as readily as a triage one. Putting the requirement there would write a triage
requirement that governs a discovery failure, which is the "reads well, governs the wrong artifact"
outcome.

`work-discovery` is where cross-stage statements about the state branch already live. Its "State
lives on an orphan branch of the destination" opens *"Discovery state **and execution transcripts**
SHALL be written to an orphan branch"* — it already reaches past its own stage to say what the state
branch holds and what it must not. That is the established precedent, and it is a stronger one than
naming the file after triage.

The second requirement lands there for a plainer reason: it is a statement about the watermark, and
the watermark is a `work-discovery` object — "Watermarks reduce reconsideration without governing
it" and "Timestamps are compared as instants" are both already there. #70 put its sibling
requirement in `work-triage` because its subject is the model stage declining to spend, and what
happens to the mark follows from that. Here the subject is the mark itself: the triage call is what
failed, but the loss is the mark moving past an item nothing will bring back.

### Why one half of the decision has a requirement and the other does not

[#90](https://github.com/adamstallard/igor/issues/90) settles two things, and `tasks.md` carries
both. The record's shape is a promise about what the state branch holds, so it is stated as a
requirement. How a caught error is wrapped on its way there is not a promise to anybody — it is the
mechanism by which the origin survives, and `cause` is one way of doing it. The requirement
constrains the outcome (the origin reaches the record); the tasks name the mechanism (`cause` at
`src/budget.ts:144`, `:155` and `:275`, and the `${(e as Error).message}` interpolation goes with
it). The second half is not an afterthought; it is the half that does not earn spec text.

### The other artifact that loses the same thing

[#90](https://github.com/adamstallard/igor/issues/90) is a decision about error context, and there
are two durable artifacts that lose it. This change covers one. The other —
`executions.ndjson`'s `reason`, written per task at `src/execute.ts:1822` — is
[#98](https://github.com/adamstallard/igor/issues/98), and it is the other half of the same
decision rather than a lesser follow-up. **The harm is identical in both; the shapes are not, and
that is why they are split.**

`report.failures` is a list of faults: every entry in it is one, so a requirement about what a
failure entry carries governs the whole field. `reason` is *what happened*, and a fault is one case
among many — it is declared non-optional on `ExecutionResult` (`src/execute.ts:109`) and built at
seventeen sites, of which two derive from a caught fault (`src/execute.ts:1338`, `:1410`). The rest
say things like `` `${artifact.ref} was already up to date` `` and `` `opened ${opened.ref}` ``. One
requirement spanning both records would have to read *"where this describes a fault…"*, and a
conditional clause on a non-optional field gets read as optional — satisfied by writing `undefined`
in the other fifteen places. What the execution record needs is a diagnostic beside `reason` rather
than a widening of it, which is a different change, and #98 says so.

Nothing else is carrying this. If #98 is closed unfixed, half of what #90 decided is dropped.

### Explicitly out of scope

- **`src/sweep.ts:65` and `src/wiring.ts:59`.** Both reduce an error for `out.warn`, which is a
  console a person is watching. Nothing durable is written, so the harm this proposal describes does
  not apply, and the requirement deliberately does not reach them.
- **`src/reconcile.ts:150` and `src/handoff.ts:309`.** Both produce prose reported to a person on a
  surface rather than an entry in the cycle record.

## Capabilities

### Modified Capabilities

- `work-discovery`: a failure a cycle writes to the state branch carries, separately from the
  sentence, the fault's machine-readable identity and its origin; a fault reaches the record with
  its origin intact rather than replaced by a description of it; and the entry still renders as one
  line for somebody watching the run.
- `work-discovery`: a candidate whose triage call failed is recorded as one the cycle reached no
  verdict on and is carried by id past the mark, so a later cycle asks about it again while the
  candidates beside it that got verdicts are not asked twice; the carried record is bounded, what it
  sheds is reported, and carried candidates never crowd out candidates nothing has triaged.

## Impact

- The artifact an unattended Igor leaves behind becomes something a reader can act on, which is the
  premise [#79](https://github.com/adamstallard/igor/issues/79),
  [#80](https://github.com/adamstallard/igor/issues/80) and
  [#82](https://github.com/adamstallard/igor/pull/82) are each built on and none of them supplies.
- `CycleReport.failures` widens past `string[]`, which is a change to what the state branch holds
  and to the shape two CLI call sites read.
- A candidate a triage call threw on stops being lost. `src/loop.ts:626` gains a second destination
  for the candidate besides `report.failures`, and `DiscoveryState` gains a bounded per-source list
  of carried candidate ids written in the same document as the marks. The watermark block at
  `src/loop.ts:643` is unchanged by this half: the mark advances as it does today. Where
  [#70](https://github.com/adamstallard/igor/pull/70) has landed, the "no verdict was reached"
  record is a fourth untriaged reason; where it has not, it is a set of this change's own.
- **Implementation is blocked.** Four of the seven files carrying the sites are held by
  [#65](https://github.com/adamstallard/igor/pull/65) — `budget.ts`, `execute.ts`, `handoff.ts` and
  `loop.ts` — and #65 alone holds all four. `loop.ts` is the binding one: `CycleReport.failures` is
  declared there, and `budget.ts` carries the three wrap sites, so both halves wait on the same
  thing. Doing the reachable files first would split one coherent change across three.
