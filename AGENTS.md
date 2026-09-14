# Working in this repository

## Specs

Changes go through OpenSpec: proposal, design, specs, tasks, implement, archive.

**Archive when every *requirement* is met, not when every task is ticked.** Requirements live
in the spec deltas and define what the change must be true of. Tasks are a plan for getting
there, and a plan can be wrong.

**Work that outlives a change becomes an issue before the change is archived.** `openspec list`
shows open changes only, so a task left unticked in an archived change is still readable but
nothing surfaces it — and the point of writing it down was to be reminded. File it, then tick
the task with a pointer to the issue, so the archived record says where the work went rather
than trailing off.

Issues are the atomic unit of work here for the same reason they are everywhere else in this
design, and an Igor can eventually pick up its own backlog.

## Code

**Verify against the real thing.** Every substantial finding in this project's history came
from running against a live API rather than reasoning about one: page sizes that are refused,
identities that cannot be assigned, costs five times an estimate. Fixtures test the shape;
only a real call tests the assumption.

**Record what a measurement actually said**, including when it contradicts what the design
assumed. `docs/architecture.md` holds the decisions, and a change's `design.md` holds what its
implementation contradicted.

**A comment describes the code as it is now.** No history, no narration of what changed. Where
a past mistake is worth preventing, write it as a warning in the present tense. See the
`sharper-comments` skill.
