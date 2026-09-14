## Why

Lore exists and nothing reads it. Entries are curated, reviewed, and active in a store that
no agent consults, which means all of its value is still unrealized.

This change fires lore into a worker's context. It is deliberately separate from
`core-igor-loop`, because an Igor without lore is not broken — it has its role, the work
item, and the codebase, three of the four context channels. Lore is additive, so making the
first Igor wait on it would have been a false dependency.

**Depends on `lore-store`** for the entries and `core-igor-loop` for something to fire into.

## What Changes

- **Entries fire unbidden.** Matching entries are injected before the worker runs. The
  worker never issues a query and never elects to search — that distinction is the whole
  point, because lore exists for what a worker would not know to ask for. Anything it would
  think to look up is already covered by reading the codebase.
- **Only `active` entries fire.** `provisional` means proposed but not in force. This is
  what makes review more than ceremony.
- **A predicate index is compiled from the store.** Inverted, keyed on metadata available
  before any model runs: path globs, repository, labels. Exact, free, and expected to carry
  most entries, since much institutional knowledge really is scoped by path or service.
- **The index is derived and disposable.** Built from the store and stamped with its commit;
  the store is truth. A retired condition is simply not compiled on the next build, so
  retirement needs no deletion operation and leaves no orphaned state.
- **Firing is capped.** Five to ten entries by match strength, with scope priority. Flooding
  a worker's context dilutes everything, and the cap is the only hard constraint here —
  store size is not, because a precise predicate fires the same few entries whether the
  store holds two hundred or ten thousand.
- **Conflicts resolve by rule.** Narrower scope beats broader, then higher support, then
  more recent. Anything unresolvable surfaces for human review rather than being decided
  silently — two active contradictory entries mean consolidation merged badly.
- **Misses are recorded, not swallowed.** A fired condition whose entry is gone degrades
  quality, never correctness. But a condition firing repeatedly after its entry was
  deprecated means the situation recurs while the knowledge does not, which belongs in a
  review queue.

Explicitly out of scope:

- **Learned condition vectors and the vector index.** A small open-weight recognizer is the
  design (§4.1), and it is buildable — what is missing is contrastive examples to derive
  vectors from. Those come from the relevance decisions this change records, so retrieval
  precedes vectors rather than competing with them (§4.2.1).
- **The promote/prune feedback loop.** Fire counts are recorded here; acting on them —
  promoting an always-firing entry into standing role config, pruning one that never fires —
  waits until there is enough firing history to act on. Reasoning in `docs/architecture.md`
  §3.4.1, tracked as adamstallard/igor#4.

## Capabilities

### New Capabilities

- `predicate-index`: Compiling an inverted index of metadata predicates from the store,
  stamped with the store's commit, and rebuilt rather than mutated.
- `lore-firing`: Matching a candidate against the index, filtering to `active` entries and
  the agent's scopes, applying the cap and conflict resolution, and injecting the result
  into the worker's context before it runs.

### Modified Capabilities

- `lore-store`: Entries gain firing metadata — a fire count and last-fired timestamp — so a
  later change can promote entries that always fire and prune those that never do.

## Impact

- Reads the lore store; writes only firing metadata back to it.
- Changes what a worker sees, so a bad entry now affects output rather than sitting inert.
  That is the point, and it is why only reviewed entries fire.
- Establishes the retrieval path that condition vectors would later slot into without
  changing anything above it.
