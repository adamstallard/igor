Builds on: one-process-per-role (adamstallard/igor#242)
Builds on: redact-state-branch (adamstallard/igor#217)
Builds on: read-seat-windows-from-the-stream (adamstallard/igor#143)
Builds on: pre-worker-breaker (adamstallard/igor#173)

#173 builds on #217 and #143, so they are listed before it, as spec-check needs every change
below a dependency listed too; this change takes nothing from them directly.

## Decisions

1. **A watermark records how far one role has considered a source** (#104). It is keyed by the
   role's name and the source, never by a process start and never by a seat (a Claude subscription the role's model calls
   are paid from).
2. **Modified, not added**: the change modifies *Watermarks reduce reconsideration without
   governing it*, so the in-force "per-source watermark" wording is replaced rather than
   narrowed from elsewhere.
3. **One mark per role and source.** Under #242 (`one-process-per-role`) one serving process
   serves a role, so no two processes of a role write one mark, and no mark per process is
   needed; a restarted process continues the role's mark.
   `igor run` is a dev tool that #242's design, decision 3, says not to point at a served role, so
   nothing here gives it a rule of its own.
4. **Every role and source starts cold once when this change is first deployed**: with no mark
   of its own, it considers only items within the look-back window, rather than seeding new
   marks from the old per-source entry.
5. **A stored mark whose role and source match nothing in the current configuration is left in
   place**, such as one a deleted or renamed role left behind.
6. **This change's block is the requirement as #173 leaves it, scoped to the role.** The text in
   force is #101's (`condition-backoff`). #242 compacts it and adds worker slots, and #173
   (`pre-worker-breaker`) holds the mark below the items a cycle never reached because one of
   `work-claiming`'s two-in-a-row rules ended it, adds an exception for a refused claim whose run
   records a cure key (#101's name for a fault in the Igor's own setup), and adds three scenarios.
   #242 and #173 both archive before this change, in the order issue #204 sets for archiving the
   open changes. So its block carries #173's text with "per source" made "per role and source",
   lane skips named beside triage's, and the terms it uses pointed at `stuck-conditions`; every
   scenario of #173's copy; and this change's own scenarios. This change's sentence,
   one mark per role and source, is the one that survives.
7. **The requirement states the mark's scope, not its key format.** A composite key,
   `role:tracker:repo:hash`, is how `tasks.md` builds it. *Rejected:* naming the key string in
   the requirement, which would forbid other shapes that keep the promise, such as a state file
   per role, which the decision record turns down because it buys nothing.

`openspec/specs/work-discovery/decisions.md` gives why the mark is not held below anything a lane
rejected and why roles are not scoped by query instead of by lane.

**Still open:** nothing.

## Why

Two roles that differ only by `lane` share one watermark, so whichever runs first advances the
mark over items the other would have taken ([#104](https://github.com/adamstallard/igor/issues/104)).

`sourceKey` is `${tracker}:${repo}:${sha256(query).slice(0,8)}` (`src/discovery.ts:32`) — no role,
no seat, no Igor identity. State is one `discovery.json` per destination, and `advance` writes
`watermarks[result.key] = result.watermark` (`src/discovery.ts:179`), so every role in a
destination reads and writes the same map.

The lane is not in the key, and it is applied **after** discovery. `freshCandidates` bounds by the
mark, then `screen(role.lane, fresh, …)` filters (`src/loop.ts:981`), and the lane skip is
pushed at `src/loop.ts:989-990` with no `held` flag (the flag that keeps the mark below a skipped
item). That is correct for a single role, on the principle
that deciding not to act on an item is still having considered it. So:

1. Role A's cycle discovers an item.
2. A's lane rejects it — wrong label, wrong path, too old.
3. The mark advances past it, because A considered it.
4. Role B asks for candidates above the mark. The item is below it.
5. Nothing about the item changes, so nothing lifts it back. It is out of B's pool for good.

**The obvious configuration is the colliding one.** The natural way to split roles is the same
repository, the same query, a narrower lane — exactly the shape that shares a key. Splitting by
query is the shape that does not, and nothing says so.

**The same key loses the other direction too.** A second role added to a source an existing role
has been polling inherits that role's mark, so it sees nothing at all until the tracker next
touches an item — not a bounded cold start, but silence of unbounded length that looks like a
correctly configured role with no work.

**Not reachable today.** `igor-lore` has one role with sources (`generalist.yaml`); `org.yaml` is
the inherited defaults file and declares none. This becomes reachable the moment a second role
exists, which is also the moment nobody will be looking for it.

**Sixth instance of one class in the same watermark logic** — *a candidate is lost for good*. The
per-cycle cap holding no mark, a cooling-down item falling behind the mark (#17) and a tie
concession computed globally while marks move per source are closed; a triage call that ran and
failed is [#99](https://github.com/adamstallard/igor/pull/99); a call never made is
[#70](https://github.com/adamstallard/igor/pull/70). Each of the first three was found only after
the previous was closed. What makes this one different is that the others were defects in code:
this is a gap in **what the key represents**, which is why it is a requirement rather than a fix.

## What Changes

**One modified `work-discovery` requirement, *Watermarks reduce reconsideration without governing
it*, keeps a watermark per role and source; one added requirement, *A role's watermark is its
own*, says what identifies the mark and what a role with none, or a mark with no role, does.** The mark is scoped to the role as well as the source, so an item one role's lane
rejected is still fresh to another role polling the same source.

It settles three things the implementation must not be left to decide:

- **The upgrade.** Every role and source pair with no mark of its own is a first run, so the
  in-force *A first run does not face the whole backlog* governs it and the look-back window
  bounds the cost. Every source cold-starts once. That is acceptable — nobody but the author runs
  Igor — and it is stated rather than discovered.
- **What identifies the role.** Its name, which `role-config`'s *A role is a file whose name is
  its identity* already establishes. Not the seat, and never the run: a restarted process
  continues its mark. The consequence is that **a renamed role begins again** — one
  bounded cold start — which is the same consequence editing a query already has today, since the
  key hashes the query string as written.
- **Orphaned entries are left in place.** A cycle runs one role (`planCycle` takes a single
  `role: Role`) and `advance` copies the stored map and overwrites only the keys it has, so a
  cycle cannot tell another role's live mark from a dead one. A prune would delete the marks of
  every role that was not running. Deleting a live mark costs candidates; keeping a dead one costs
  bytes.

**Stated as scope rather than as a key format.** What the requirement promises is that one role's
mark does not bound another's discovery. A composite key is how that will be built and `tasks.md`
says so, but a requirement naming the string would be satisfied by a key that contains the role
yet is read wrongly, such as code that looks up `tracker:repo:hash` with the role dropped when
the role's own key is missing, so one role's mark still bounds another's, and would forbid a shape — a file per role — that keeps the promise
and is turned down only because it buys nothing.

### Explicitly out of scope

- **The query hash.** `sourceKey` hashes the raw query string, so reordering `is:issue label:bug`
  to `label:bug is:issue` produces a different key and a silent cold start. It is the same
  brittleness and a **different fault**: the key changing when nothing about the source did, which
  costs one bounded re-examination of a window and hides nothing from anybody. The fault here is a
  key colliding across roles, which loses items permanently for a role that never considered them.
  Why a query normalizer is not built, and why a renamed role's cold start is accepted, is in
  `work-discovery`'s decision record. It is a decision not to act, not deferred work, so no issue
  is filed for it.

## Capabilities

### Modified Capabilities

- `work-discovery` (one modified and one added requirement): a watermark is scoped to the role whose consideration it records as well as to
  the source it bounds, so an item one role's lane rejected is still fresh to another role polling
  that source; a role and source with no mark of its own is a first run, bounded by the look-back
  window; and a mark nothing now resolves to is left in place rather than pruned.

## Impact

- A second role stops being a trap. The configuration that reads as obvious — same repository,
  same query, narrower lane — becomes the one that works, and *scope roles by query* stops being
  the only safe shape.
- Every source cold-starts once on the upgrade, bounded by `COLD_START_DAYS`
  (`src/discovery.ts:46`). One destination, one author, and the bound is what makes it affordable.
- `discovery.json` holds one mark per role and source instead of one per source, and keeps its
  pre-upgrade entries, which nothing reads.
- `sourceKey` gains the role, so every caller of `discoverSource`/`discover` supplies it. The
  watermark block at `src/loop.ts:1200-1222` is untouched: it maps `result.key` to a watermark and
  does not care what the key is made of.
- `docs/architecture.md` §5.0.2 states the rule as it holds after the merge.
- The implementation lands on this branch once the spec is approved, as the second of the
  repository's two review gates: `sourceKey`, `discoverSource`, `discover`
  and their tests (`tasks.md` sections 3 and 4).
