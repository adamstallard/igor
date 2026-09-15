## Why

`lore-store` requires `list` to show "a support count and recency weight computed from
provenance". No such weight is computed. `lore-retrieval` removed time decay from the code and
never carried a delta, so the spec has mandated a number that does not exist ever since — and
`igor list` violates its own specification by being correct.

The reasoning for removing it stands and is recorded in `scoring.ts`: lore is mined from
historical review comments and is old by construction, so a decay curve reports an entire store
as stale while saying nothing about whether any lesson still holds, and buries the most
architectural entries, whose evidence is oldest precisely because they have held longest. The
date is the fact; what to make of it is a reader's judgment.

The word survives in three more places, each of which reads as though the feature exists: the
`list` command's own `--help` text, the architecture document using it to illustrate why derived
fields are not stored, and `DERIVED_FIELDS` rejecting an entry that carries one.

## What Changes

**The requirement says what `list` actually shows** — support, and the date of the newest
provenance item — and says explicitly that no decayed weight is shown, so the next reader does
not reintroduce it.

**`recency` stops being a rejected field.** It was kept to refuse an entry migrated from a store
that had one. There are no such stores: nobody is running Igor, and a rule guarding a migration
that cannot happen is cost without protection.

Explicitly out of scope:

- **Reintroducing any time weighting.** The argument against it has not changed.
- **Removing the newest-provenance date.** It is a fact about the store and a reader may weigh
  it however they like; what was removed is Igor weighing it for them.

## Capabilities

### Modified Capabilities

- `lore-store`: `list` shows support and the newest provenance date, and no decayed weight.

## Impact

- The spec stops describing a feature that was deliberately removed, which is the only kind of
  staleness that makes correct code look like a defect.
- One fewer word in the vocabulary that suggests Igor judges an entry by age.
