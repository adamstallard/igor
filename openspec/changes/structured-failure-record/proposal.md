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

### Why one half of the decision has a requirement and the other does not

[#90](https://github.com/adamstallard/igor/issues/90) settles two things, and `tasks.md` carries
both. The record's shape is a promise about what the state branch holds, so it is stated as a
requirement. How a caught error is wrapped on its way there is not a promise to anybody — it is the
mechanism by which the origin survives, and `cause` is one way of doing it. The requirement
constrains the outcome (the origin reaches the record); the tasks name the mechanism (`cause` at
`src/budget.ts:144`, `:155` and `:275`, and the `${(e as Error).message}` interpolation goes with
it). The second half is not an afterthought; it is the half that does not earn spec text.

### Explicitly out of scope

- **The execution outcome's `reason`** ([#98](https://github.com/adamstallard/igor/issues/98)).
  `src/execute.ts:1338` and `:1410` have the identical defect and their output reaches
  `executions.ndjson`. It is not fixed here because `reason` is not a failure field: it is declared
  non-optional on `ExecutionResult` (`src/execute.ts:109`) and written on every outcome, including
  `` `${artifact.ref} was already up to date` `` and `` `opened ${opened.ref}` ``. A requirement
  about what a *failure* entry carries either does not reach a field that is also filled on success,
  or forces a diagnostic onto `ExecutionResult` and a revisit of every one of its construction
  sites. That is a different change with a different shape.
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

## Impact

- The artifact an unattended Igor leaves behind becomes something a reader can act on, which is the
  premise [#79](https://github.com/adamstallard/igor/issues/79),
  [#80](https://github.com/adamstallard/igor/issues/80) and
  [#82](https://github.com/adamstallard/igor/pull/82) are each built on and none of them supplies.
- `CycleReport.failures` widens past `string[]`, which is a change to what the state branch holds
  and to the shape two CLI call sites read.
- **Implementation is blocked.** Four of the seven files carrying the sites are held by
  [#65](https://github.com/adamstallard/igor/pull/65) — `budget.ts`, `execute.ts`, `handoff.ts` and
  `loop.ts` — and #65 alone holds all four. `loop.ts` is the binding one: `CycleReport.failures` is
  declared there, and `budget.ts` carries the three wrap sites, so both halves wait on the same
  thing. Doing the reachable files first would split one coherent change across three.
