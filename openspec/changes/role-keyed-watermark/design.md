## Context

The watermark is a `work-discovery` object: *Watermarks reduce reconsideration without governing
it*, *A first run does not face the whole backlog* and *Timestamps are compared as instants* all
live there, and `work-discovery` is also where the cross-stage statements about the state branch
already sit. The subject here is the mark itself — what it is keyed by, and therefore whose
consideration it records — so `work-discovery` is the capability. `role-config` was the near miss:
the role's name is the identifier, but *A role is a file whose name is its identity* is in force
and unchanged, so this change relies on it and adds no `role-config` delta. `work-triage` is the
other near miss and is wrong for the reason [#99](https://github.com/adamstallard/igor/pull/99)
gives about its own sibling requirement: the lane is what rejects the item, but the loss is the
mark moving past something nothing will bring back.

Other open changes modify *Watermarks reduce reconsideration without governing it* too, and `openspec validate` does not cross-check
between open changes, so the comparison was done by hand. It is recorded under *Decisions* rather
than left to be redone.

## Decisions

### The mark is scoped to a role and a source, and the requirement says scope rather than key

The mark means *how far this role has considered this source*. A role that has never run has
considered nothing, and a mark that says otherwise is answering a question nobody asked.

Why the requirement states the scope and not the key format is the proposal's decision 7.

The cost is one mark per role and source in place of one per source, each mark one `lastSeen`
timestamp string. Why it is one mark per role and source, and not one per process of the role, is
the proposal's decision 3.

### It modifies the requirement it was in tension with

Why it modifies the requirement rather than adding one beside it is the proposal's decision 2.

**Measured:** `openspec`'s `## MODIFIED Requirements` replaces the whole requirement body on
archive. `openspec/changes/archive/2026-09-23-keep-artifacts-mergeable/specs/work-triage/spec.md`
holds a modified *Items with work already in flight are skipped*, and the archived block is
byte-identical to the in-force text in `openspec/specs/work-triage/spec.md` — prose, scenarios and
all. So the block here carries the copy of #173 (`pre-worker-breaker`), the last change to modify
the requirement before this one archives, with the role scope written into it.

**Open modifications of one requirement clobber each other.** Each is written against the text
before it, so whichever archives later silently drops the earlier one's wording unless it carries
it, and `openspec validate` does not cross-check between open changes. The text in force is the
copy #101 (`condition-backoff`) archived, which holds the mark below an item a condition stopped.
#242 (`one-process-per-role`) compacts the requirement and adds worker slots; #173 holds the mark
below the items a cycle never reached because `work-claiming`'s two-in-a-row rules ended it. How this change's
block carries them is the proposal's decision 6.

Three in-force texts still speak of a source's mark: `work-triage`'s candidate that holds "its
source's" mark back (`openspec/specs/work-triage/spec.md:276` and `:304`), `work-discovery`'s
Purpose ("the per-source watermarks"), and *A first run does not face the whole backlog* ("a
source with no watermark"). None needs rewording. Each source still has marks, and the modified
watermark requirement says which role each belongs to; *A role's watermark is its own* adds that
a role with no mark of its own takes a first run even where another role has a mark for that
source.

### The role is its name, and a rename is a cold start

*A role is a file whose name is its identity* already settles this; nothing new is asserted.

Why a mark is keyed by neither the seat nor the process's start is in `work-discovery`'s decision
record. Keying by the role's name alone works because #242 runs one serving process per role, so
no two processes of a role write its mark (the proposal's decision 3). `igor run` writes the mark
too, and #242's docs say not to point `igor run` at a served role; that is a convention, not
something the code prevents. What #104, the issue this change answers, needs is that one role's
mark never bounds another role's discovery.

A renamed role has no mark and begins again, bounded by the look-back window; why that is accepted
is in `work-discovery`'s decision record.

### Orphaned entries are left in place

`work-discovery`'s decision record says why a mark nothing resolves to is kept, with evidence from
what `planCycle` and `advance` do on `main`. It also says why no CLI command that reads every role
file and removes the orphaned marks is built either.

### The requirement holds whatever the watermark block computes

**Measured on `main`:** the watermark block (`src/loop.ts:1200-1222`) works out, for each
source, which items its mark must stay below, and passes the resulting marks to
`advance(current, marks)`. It maps `result.key` to a watermark and never reads what the key is made
of. Changing what `result.key` *is* therefore leaves the block alone.

Two neighbouring requirements keep their wording too: #99's `structured-failure-record` rule,
"measured against the source mark", and the in-force `work-triage` rule from #70, "holds its
source's mark back". Both stay true under role scoping, because a cycle runs exactly one role,
and reads that role's one mark per source. Neither
needs rewording. Rewording them from here would add another change modifying requirements other
changes also modify, which is how one archive overwrites another's edit.

### `docs/architecture.md` states the rule as it holds after the merge

§5.0.2 says each role keeps its own mark for a source, so one role's lane rejection leaves an
item fresh to another. The doc merges with this change and its implementation, so it carries no
interim workaround, such as scoping roles by query (*Roads not taken*, below).

## Roads not taken

Holding the mark below anything a lane rejected, scoping roles by query instead of by lane,
seeding each new role's mark from the old shared entry, and a state file per role are in
`work-discovery`'s decision record.

## Agents' decisions

These settle what the proposal's decisions leave open. Each is cheap to reverse.

- **A1. The role's rules get a requirement of their own.** Issue #232 has every requirement over
  OpenSpec's 500-character limit compacted, and the watermark requirement, compacted, keeps only
  the per-role scope. What identifies a mark, what a role with no mark does and what happens to a
  mark with no role are *A role's watermark is its own*, so each scenario of that new requirement
  follows from one of its SHALL statements.
