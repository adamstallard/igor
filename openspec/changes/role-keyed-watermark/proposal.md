## Why

Two roles that differ only by `lane` share one watermark, so whichever runs first advances the
mark over items the other would have taken ([#104](https://github.com/adamstallard/igor/issues/104)).

`sourceKey` is `${tracker}:${repo}:${sha256(query).slice(0,8)}` (`src/discovery.ts:32`) — no role,
no seat, no Igor identity. State is one `discovery.json` per destination, and `advance` writes
`watermarks[result.key] = result.watermark` (`src/discovery.ts:177`), so every role in a
destination reads and writes the same map.

The lane is not in the key, and it is applied **after** discovery. `freshCandidates` bounds by the
mark, then `screen(role.lane, fresh, identity)` filters (`src/loop.ts:536`), and the lane skip is
pushed at `src/loop.ts:545` with no `held` flag — correctly, for a single role, on the principle
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

**Fifth instance of one class in the same watermark logic** — *a candidate is lost for good*. The
per-cycle cap holding no mark, a cooling-down item falling behind the mark (#17) and a tie
concession computed globally while marks move per source are closed; a triage call that ran and
failed is [#99](https://github.com/adamstallard/igor/pull/99); a call never made is
[#70](https://github.com/adamstallard/igor/pull/70). Each of the first three was found only after
the previous was closed. What makes this one different is that the others were defects in code:
this is a gap in **what the key represents**, which is why it is a requirement rather than a fix.

## What Changes

**One added `work-discovery` requirement: a watermark records how far one role has considered a
source.** The mark is scoped to the role as well as the source, so an item one role's lane
rejected is still fresh to another role polling the same source.

It settles three things the implementation must not be left to decide:

- **The upgrade.** Every role and source pair with no mark of its own is a first run, so the
  in-force *A first run does not face the whole backlog* governs it and the look-back window
  bounds the cost. Every source cold-starts once. That is acceptable — nobody but the author runs
  Igor — and it is stated rather than discovered.
- **What identifies the role.** Its name, which `role-config`'s *A role is a file whose name is
  its identity* already establishes. Not the seat, not the process: two processes running one role
  consider the same items under the same lane, so they are one consideration.
  `concurrent-instances` already says discovery may hand one candidate to several processes, and
  nothing here narrows that. The consequence is that **a renamed role begins again** — one bounded
  cold start — which is the same consequence editing a query already has today, since the key
  hashes the query string as written.
- **Orphaned entries are left in place.** A cycle runs one role (`planCycle` takes a single
  `role: Role`) and `advance` copies the stored map and overwrites only the keys it has, so a
  cycle cannot tell another role's live mark from a dead one. A prune would delete the marks of
  every role that was not running. Deleting a live mark costs candidates; keeping a dead one costs
  bytes.

**Stated as scope rather than as a key format.** What the requirement promises is that one role's
mark does not bound another's discovery. A composite key is how that will be built and `tasks.md`
says so, but a requirement naming the string would be satisfied by a key that contains the role
and still shares a map wrongly, and would forbid a shape — a file per role — that satisfies it
perfectly well.

**It is added rather than modifying *Watermarks reduce reconsideration without governing it*,**
whose "per-source watermark" is the wording in tension with it. `preview-persists-nothing` holds
an open `## MODIFIED Requirements` block on that same requirement, and `MODIFIED` replaces the
whole requirement body on archive — verified against
`openspec/changes/archive/2026-09-23-keep-artifacts-mergeable/`, whose archived block is
byte-identical to the in-force text. Two open modifications of one requirement therefore clobber
each other in whichever order they land, invisibly, because `openspec validate` does not
cross-check between open changes. `design.md` carries the reasoning and the alternative.

### Explicitly out of scope

- **The query hash.** `sourceKey` hashes the raw query string, so reordering `is:issue label:bug`
  to `label:bug is:issue` produces a different key and a silent cold start. It is the same
  brittleness and a **different fault**: the key changing when nothing about the source did, which
  costs one bounded re-examination of a window and hides nothing from anybody. The fault here is a
  key colliding across roles, which loses items permanently for a role that never considered them.
  Fixing the hash means normalizing query strings, and a normalizer is tracker-specific parsing of
  the syntax *Queries are dispatched to the tracker unmodified* exists to keep Igor out of. It is
  a decision not to act, not deferred work, so it is stated here and no issue is filed for it.
- **Anything under `src/`.** This change is specification only.

## Capabilities

### Modified Capabilities

- `work-discovery`: a watermark is scoped to the role whose consideration it records as well as to
  the source it bounds, so an item one role's lane rejected is still fresh to another role polling
  that source; a role and source with no mark of its own is a first run, bounded by the look-back
  window; and a mark nothing now resolves to is left in place rather than pruned.

## Impact

- A second role stops being a trap. The configuration that reads as obvious — same repository,
  same query, narrower lane — becomes the one that works, and *scope roles by query* stops being
  the only safe shape.
- Every source cold-starts once on the upgrade, bounded by `COLD_START_DAYS`
  (`src/discovery.ts:37`). One destination, one author, and the bound is what makes it affordable.
- `discovery.json` grows one entry per role per source instead of one per source, and keeps its
  pre-upgrade entries, which nothing reads.
- `sourceKey` gains the role, so every caller of `discoverSource`/`discover` supplies it. The
  watermark block at `src/loop.ts:656` is untouched: it maps `result.key` to a watermark and does
  not care what the key is made of, which is why this holds whether or not
  [#70](https://github.com/adamstallard/igor/pull/70) has rewritten that block first.
- Interim guidance for anybody adding a second role before this lands goes in
  `docs/architecture.md` §5.0.2, beside the watermark contract it qualifies.
