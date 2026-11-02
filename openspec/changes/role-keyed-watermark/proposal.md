## Decisions

1. **A watermark records how far one role has considered a source** (#104). It is keyed by the
   role's name and the source, never by the seat, the Claude subscription the role's model
   calls are paid from. Decision 3 allows one finer division, by rank.
2. **Modified, not added** (Adam, 2026-10-11): the change modifies *Watermarks reduce
   reconsideration without governing it*, so the in-force "per-source watermark" wording is
   replaced rather than narrowed from elsewhere.
3. **One mark per role, rank and source; never one per run** (Adam, 2026-10-18).
   Under `concurrent-instances` ([#179](https://github.com/adamstallard/igor/pull/179)) a role
   can run as several processes, each with a *rank*, a number it keeps across restarts. Each rank
   may save its own mark, and discovery combines a role's rank marks into one mark per source,
   as #179 specifies. A *run*, one start of a process, gets no mark of its own: a restarted
   process continues the mark of its rank, or of its role where it runs alone. This replaces
   the single mark per role that two processes of one role shared.
4. **Every role and source starts cold once when this change is first deployed**: with no mark
   of its own, it considers only items within the look-back window, rather than seeding new
   marks from the old per-source entry.
5. **A stored mark whose role and source match nothing in the current configuration is left in
   place**, such as one a deleted or renamed role left behind.

6. **This change's sentence survives against #101** (Adam, 2026-10-18): one mark per role, rank
   and source, never one per run. `condition-backoff`
   ([#101](https://github.com/adamstallard/igor/pull/101)) modifies the same requirement and keeps
   the in-force "Discovery SHALL record a per-source watermark". #101 archives first; at this
   change's archive, this change's block is rewritten by hand to carry the rest of #101's text,
   keeping this change's wording. #179, which also archives first, modifies the same requirement
   to add a stand-down (under #179, a process that cannot write its heartbeat stops starting
   work) as a reason a cycle does not take an item, and so holds its mark back; the hand rewrite carries that
   reason and its scenario too (task 1.6).
7. **This change archives after #179** (Adam, 2026-10-18). The requirement cites
   `work-discovery`'s *Processes saving one source keep the lower watermark*, which #179 adds, so
   archiving first would cite a requirement not yet in force.

8. **The requirement states the mark's scope, not its key format.** A composite key,
   `role:tracker:repo:hash`, is how `tasks.md` builds it. *Rejected:* naming the key string in
   the requirement, which would forbid other shapes that keep the promise, such as #179's log of
   mark lines.

9. **This change states the role scope; #179 states the rank rule.** How a role's marks divide
   among its ranks, and how they combine, is #179's *Processes saving one source keep the lower
   watermark*, which this change's requirement cites rather than restates. #179's rule covers
   `igor run` too: #179 makes it rank 0 (Adam, 2026-10-18), and rank 0 appends its own mark line
   as any rank does, so nothing here treats it differently.
10. **A renamed role begins again**, one cold start bounded by the look-back window: a
    consequence of keying by name (decision 1), and the one editing a query already has.
11. **Nothing is done about the query hash.** `sourceKey` hashes the raw query string, so
    reordering a query costs one bounded cold start (*Explicitly out of scope*). It is a decision
    not to act, so no issue is filed for it.

*Rejected* (`design.md`, *Roads not taken*): holding the mark below anything a lane rejected,
which would never advance a narrow role's mark; and scoping roles by query instead of by lane,
which cannot express a path-scoped role.

**Still open:** nothing.

## Why

Two roles that differ only by `lane` share one watermark, so whichever runs first advances the
mark over items the other would have taken ([#104](https://github.com/adamstallard/igor/issues/104)).

`sourceKey` is `${tracker}:${repo}:${sha256(query).slice(0,8)}` (`src/discovery.ts:32`) — no role,
no seat, no Igor identity. State is one `discovery.json` per destination, and `advance` writes
`watermarks[result.key] = result.watermark` (`src/discovery.ts:179`), so every role in a
destination reads and writes the same map.

The lane is not in the key, and it is applied **after** discovery. `freshCandidates` bounds by the
mark, then `screen(role.lane, fresh, …)` filters (`src/loop.ts:904`), and the lane skip is
pushed at `src/loop.ts:912-913` with no `held` flag, the flag that keeps the mark below a skipped
item, — correctly, for a single role, on the principle
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

**One modified `work-discovery` requirement, *Watermarks reduce reconsideration without governing
it*: a watermark records how far one role has considered a source.** The mark is scoped to the role as well as the source, so an item one role's lane
rejected is still fresh to another role polling the same source.

It settles three things the implementation must not be left to decide:

- **The upgrade.** Every role and source pair with no mark of its own is a first run, so the
  in-force *A first run does not face the whole backlog* governs it and the look-back window
  bounds the cost. Every source cold-starts once. That is acceptable — nobody but the author runs
  Igor — and it is stated rather than discovered.
- **What identifies the role.** Its name, which `role-config`'s *A role is a file whose name is
  its identity* already establishes. Not the seat, and never the run: a restarted process
  continues its mark. The finest division allowed is one mark per role, rank and source, as
  decision 3 says. The consequence is that **a renamed role begins again** — one
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
and still shares a map wrongly, and would forbid a shape — a file per role — that satisfies it
perfectly well.

**It modifies *Watermarks reduce reconsideration without governing it*** rather than adding a
second requirement beside it, so the in-force "per-source watermark" wording is replaced instead of
narrowed from elsewhere. `MODIFIED` replaces the whole requirement body on archive, so the block
carries the in-force text, with the role scope written into it. `design.md` carries the reasoning
and the collision this rules out.

### Explicitly out of scope

- **The query hash.** `sourceKey` hashes the raw query string, so reordering `is:issue label:bug`
  to `label:bug is:issue` produces a different key and a silent cold start. It is the same
  brittleness and a **different fault**: the key changing when nothing about the source did, which
  costs one bounded re-examination of a window and hides nothing from anybody. The fault here is a
  key colliding across roles, which loses items permanently for a role that never considered them.
  Fixing the hash means normalizing query strings, and a normalizer is tracker-specific parsing of
  the syntax *Queries are dispatched to the tracker unmodified* exists to keep Igor out of. It is
  a decision not to act, not deferred work, so it is stated here and no issue is filed for it.

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
  (`src/discovery.ts:46`). One destination, one author, and the bound is what makes it affordable.
- `discovery.json` holds one mark per role, rank and source instead of one per source, and keeps its
  pre-upgrade entries, which nothing reads. Every process is rank 1 until #179's implementation
  lands, so until then this is one mark per role and source. Once it lands, `discovery.json` is a
  log of mark lines, each naming its role and rank.
- `sourceKey` gains the role, so every caller of `discoverSource`/`discover` supplies it. The
  watermark block at `src/loop.ts:1104-1119` is untouched: it maps `result.key` to a watermark and
  does not care what the key is made of.
- `docs/architecture.md` §5.0.2 states the rule as it holds after the merge.
- The implementation lands on this branch once the spec is approved, as the second of the
  repository's two review gates: `sourceKey`, `discoverSource`, `discover`
  and their tests (`tasks.md` sections 3 and 4).
