## Why

Igors need somewhere for team knowledge to live that isn't per-agent memory. That store is
needed regardless of how it gets filled — mined from history, written by hand, or accumulated
from corrections as Igors work.

Building it first means a team can hand-author a seed in an afternoon and have working lore
immediately. Building extraction machinery first means weeks of work whose entire value is
downstream: it populates a store that feeds agents that do not exist yet. This change is the
smallest thing that produces something usable, and everything else builds on the schema it
settles.

It also matters that **an empty store is not a broken one.** An Igor with no lore still has
its role instructions, the work item, and the codebase — what a competent new hire walks in
with. Lore is additive, so nothing downstream is blocked on the store being full.

## What Changes

- **A lore entry is markdown with frontmatter, in git**, one file per entry, filename equal to
  the entry id. Readable, greppable, diffable, and portable across model and vendor changes.
- **Entries are validated**, and invalid entries are rejected rather than written. Required
  fields, recognized `scope` and `status` values, and no persistence of derived scores.
- **Ids are derived from the claim, then frozen.** A kebab slug keeps diffs and supersession
  pointers legible; freezing means rewording a claim later cannot move what other entries
  reference.
- **Provenance is the single source of derived scores.** Support count, recency decay, and
  author weighting are computed from provenance at read time rather than stored, so they
  cannot desync as time passes.
- **Entries may be hand-authored.** Provenance accommodates "written by X on date Y" as a
  first-class shape, not only citations of mined artifacts. Mining is one way to fill lore,
  not a precondition for it.
- **`scope` is a label, not a reference.** `role:frontend` requires no role to exist anywhere;
  roles become real objects in `core-igor-loop`.
- **The destination is configured and bounded.** Lore belongs to the operating team, so the
  tool refuses to write into its own repository.
- **A CLI creates, validates, and lists entries**, so hand-authoring is a supported workflow
  rather than hand-editing YAML and hoping.
- **Entries reach the store through review.** `propose` opens one pull request per dominant
  author with the review contract in the body; merging approves; `reconcile` promotes merged
  entries to `active` and reports what was rejected or has gone quiet. Only `active` entries
  fire, so review is what puts an entry into force rather than a formality after the fact.

Explicitly out of scope:

- **Mining.** Extraction from review history is `lore-from-reviews`, which depends on this
  change for its schema.
- **Retrieval and firing.** Injecting entries into a worker's context belongs with the
  consumer, in `core-igor-loop`. Entries here are read by humans. The decision that **only
  `active` entries fire** is recorded there; it is what makes the review step load-bearing
  rather than ceremonial.
- **Indexes.** Neither the predicate index nor condition vectors are built until something
  consumes them.
- **Consolidation.** Promoting, pruning, and superseding entries automatically comes once
  there are episodes to consolidate from.

## Capabilities

### New Capabilities

- `lore-store`: Entry schema and on-disk layout, validation, id derivation and immutability,
  provenance-derived scoring, the status lifecycle and supersession, destination
  configuration and its boundary, and the CLI for creating, validating, and listing entries.
- `lore-review`: Proposing candidates as pull requests grouped by dominant author, the review
  contract carried in the body, verified assignment, rejection by deletion versus deferral by
  closing, merge as approval, reconciliation on invocation, and the guard against privately
  sourced entries reaching a public destination. Not mining-specific — hand-authored
  candidates take the same path.

### Modified Capabilities

None — this is the first change in the project.

## Impact

- No writes to any team surface, no credentials beyond ordinary git access. The worst failure
  mode is a malformed file in a store nothing yet depends on.
- **The schema decided here is load-bearing.** `lore-from-reviews` writes to it and
  `core-igor-loop` reads from it, so entry format is the one thing in this change that is
  expensive to get wrong — and cheap to get right now, while nothing depends on it.
- Establishes the vocabulary — entry, claim, condition, provenance, scope, support, recency —
  used by every change after.
