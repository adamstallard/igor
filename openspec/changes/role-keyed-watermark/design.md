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

Three other open changes touch this area, and `openspec validate` does not cross-check between
open changes, so the comparison was done by hand. It is recorded under *Decisions* rather than
left to be redone.

## Decisions

### The mark is scoped to a role and a source, and the requirement says scope rather than key

The mark means *how far this role has considered this source*. A role that has never run has
considered nothing, and a mark that says otherwise is answering a question nobody asked.

The requirement states the scope and not the key format. A composite key
(`role:tracker:repo:hash`) is how this will be built and `tasks.md` names it, but a requirement
naming the string would be satisfied by a key that carries the role and still shares a map
wrongly, and would forbid a file-per-role shape that satisfies the promise perfectly well.

Cost is one state entry per role per source. The entries are a `lastSeen` string each and the set
is bounded by the configuration, so this is not a consideration.

### It is an addition, not a modification of the requirement it is in tension with

*Watermarks reduce reconsideration without governing it* opens "Discovery SHALL record a
per-source watermark", which is the wording a reader would expect this change to edit.

**Measured:** `openspec`'s `## MODIFIED Requirements` replaces the whole requirement body on
archive. `openspec/changes/archive/2026-09-23-keep-artifacts-mergeable/specs/work-triage/spec.md`
holds a modified *Items with work already in flight are skipped*, and the archived block is
byte-identical to the in-force text in `openspec/specs/work-triage/spec.md` — prose, scenarios and
all.

`preview-persists-nothing` is an open change holding a `MODIFIED` block on exactly that
requirement. Its implementation is merged (PR #84) but the change is not archived, so the block is
still pending. A second open modification of the same requirement would be written against the
in-force text, which does not contain preview's paragraph — so whichever archived second would
silently drop the other's text. That is the invisible collision, and the reason for adding.

What adding costs is that "per-source watermark" stays in force beside a requirement that narrows
it. It is a narrowing rather than a contradiction: there is still a watermark per source, and the
new requirement says whose. Both #99 and #70 made the same call for the same reason.

**If `preview-persists-nothing` is archived before this lands**, modifying becomes available and
is arguably cleaner, since one requirement about what the mark is keyed by reads better than two.
It is not worth waiting for, and the addition is correct either way.

### The role is its name, and a rename is a cold start

*A role is a file whose name is its identity* already settles this; nothing new is asserted.

Not the seat, and not the process. Two processes running the same role consider the same items
under the same lane, so they are one consideration, and `concurrent-instances`' *Discovery may
hand the same candidate to several processes* already says an overlap costs duplicated triage
rather than duplicated work. Keying by process would multiply the marks without changing what any
of them means.

The consequence is that a renamed role has no mark and begins again, bounded by the look-back
window. That is the same consequence editing a query already has today, since `sourceKey` hashes
the query string as written — so this does not introduce the class, it adds one more member to it.
Naming it is the point: a consequence found in the field reads as a defect, and a consequence
written down reads as a cost somebody accepted.

### Orphaned entries are left in place

**Measured:** `planCycle` takes a single `role: Role` (`src/loop.ts:122`, `:314`, `:484`), and
`advance` copies the stored map and overwrites only the keys of the sources in hand
(`src/discovery.ts:177`). A cycle therefore cannot distinguish another role's live mark from a
dead one — it has never seen another role's configuration.

So a rule that removed unresolvable entries would delete the marks of every role that was not
running, and those roles would cold-start on every cycle of any other role. Deleting a live mark
costs candidates; keeping a dead one costs bytes in a bounded file. *State is a cache and
correctness never depends on it* settles which way that goes.

A sweep that could see the whole configuration — the CLI, with every role file in hand — is
possible and is not worth building: the entries are small, bounded, and read by nothing.

### The requirement holds whichever way #70 and #99 merge

**Measured on `origin/triage-gate`:** the rewritten block builds `unexamined` per source from the
held skips plus the untriaged newer than that source's newest verdict, calls `heldBelow([result],
unexamined)` for each result, and passes the collected marks to `advance(stored, marks)`. On
`main` (`src/loop.ts:656`) it is `advance(stored, heldBelow(results, unexamined))` with
`unexamined` built from the held skips alone, inside the preview guard PR #84 added.

Both shapes map `result.key` to a watermark and neither reads what the key is made of. Changing
what `result.key` *is* therefore touches neither, which is why this requirement is worded about
the key's scope and says nothing about how the held or untriaged sets are computed. A requirement
that mentioned either would be false on one branch depending on merge order — the trap #99
describes and avoided the same way.

**Also measured, and worth a reader knowing:** `origin/triage-gate` predates PR #84, so its block
carries no preview guard. That is a conflict between #70 and `main`, not between #70 and this
change, and it is recorded here because whoever implements this will read that block.

The wording of the two neighbouring requirements survives as well. #99's "the candidate's source
mark" and #70's "its source's mark" both stay true under role scoping, because a cycle runs
exactly one role: within a cycle, "that source's mark" names one mark either way. Neither needs
rewording, and rewording them from here would be the collision this change is avoiding.

### The interim workaround goes in `docs/architecture.md`, not only here

*Scope roles by query rather than by lane* is what somebody adding a second role should do until
this lands. The discriminating question is who needs to read it: an operator configuring a role
does not read open changes, so a rejected alternative in this file does not reach them. It goes in
§5.0.2, beside the watermark contract it qualifies, marked with the issue — and it is written so
that whoever implements this deletes it in the same change.

## Roads not taken

### Hold the mark below anything a lane rejected

The mark would never advance for a narrow role. Every cycle would re-fetch and re-screen the whole
window, and the one role whose lane rejects most of what the query returns — the exact role this
change exists to make safe — would hold the mark at the oldest thing it ever saw. It also
contradicts the in-force reading that deciding not to act on an item is still having considered
it, which is correct and is not what is broken here.

### Scope roles by query instead of by lane

The workaround available today with no code change, and it is not a fix:

- Query syntax is tracker-specific; the lane is deliberately not. Encoding a lane in a query
  re-creates the per-tracker translation §5.0.1 refuses.
- `paths.under` has no GitHub search equivalent at all, so a path-scoped role cannot be expressed.
- The lane's inheritance is a conjunction of disjunctions (`src/role.ts:41-54`) — extending a role
  adds a group, and a group is satisfied by any member. There is no flat-string form of that, and
  flattening is the exact escape the grouping exists to prevent.

So it covers label-scoped roles and nothing else. It is still the right advice **until this
lands**, which is why it is written into `docs/architecture.md` rather than only refused here.

### Seed each new role's mark from the old shared entry

Tempting, because it avoids the cold start entirely: on first sight of a role and source with no
mark, copy the pre-upgrade entry for that source.

It reproduces the defect for every item already below the shared mark. That mark was advanced by
whichever role ran first, including by its lane rejections — so seeding hands a role a mark
asserting it considered items it has never seen, which is the thing being fixed, made permanent
for the backlog and invisible because it happened once during an upgrade. A bounded cold start is
the honest alternative and it is cheap. The migration also earns its cost exactly once.

### A state file per role instead of a composite key

Satisfies the requirement, and is rejected as the implementation rather than as a possibility. It
multiplies the state-branch writes per cycle, and `concurrent-instances` measured that two
concurrent writes to *different* paths on one branch still conflict, because the conflict is on
the branch reference — so per-role files buy no concurrency and cost a write each. The requirement
does not forbid it; `tasks.md` does not choose it.

### Leave it documented and unfixed

The third option in the issue. It is the workaround above, and the argument against it is that the
colliding configuration is the obvious one: the shape a person reaches for first is the shape that
silently loses items, and the guidance that would save them is a paragraph they have no reason to
have read.
