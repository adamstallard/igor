# Working in this repository

## Specs

Changes go through OpenSpec: proposal, design, specs, tasks, implement, archive.

**A `design.md` where the *how* is a choice.** A proposal states what must be true; a design
states how, and earns a file only where the requirements do not imply it — a mechanism with
alternatives worth rejecting in writing, or a procedure somebody will follow step by step. A
change that is all *what* has none, and several here rightly do not.

**Archive when every *requirement* is met, not when every task is ticked.** Requirements live
in the spec deltas and define what the change must be true of. Tasks are a plan for getting
there, and a plan can be wrong.

**Work that outlives a change becomes an issue before the change is archived.** `openspec list`
shows open changes only, so a task left unticked in an archived change is still readable but
nothing surfaces it — and the point of writing it down was to be reminded. File it, then tick
the task with a pointer to the issue, so the archived record says where the work went rather
than trailing off.

**Where the wording is the deliverable, the task carries it verbatim.** A template comment, an
error message, a line of a worker's prompt — the sentence *is* the work, and a task that
describes it (*"a line explaining that Igor publishes"*) gets a paraphrase written by whoever
implements it, who was not in the conversation the wording came out of. Put the text in the
task, in a fenced block, and say whether it may be reworded. A line worth arguing over is worth
transcribing.

Issues are the atomic unit of work here for the same reason they are everywhere else in this
design, and an Igor can eventually pick up its own backlog.

## Code

**Record what a measurement actually said**, including when it contradicts what the design
assumed. `docs/architecture.md` holds the decisions, and a change's `design.md` holds what its
implementation contradicted — including in a change already archived, which is read before the
code by whoever next touches that area.

**A comment describes the code as it is now.** No history, no narration of what changed. Where
a past mistake is worth preventing, write it as a warning in the present tense. See the
`sharper-comments` skill.
