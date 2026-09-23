## Why

Proposing an entry the store already holds replaced it. The candidate ids were checked against
the destination checkout and the commit was built on the upstream tip, so a checkout one merge
behind proposed an id that was already there and the commit overwrote an approved entry. The
overwrite arrives at review as a modification, which recognition correctly declines to read as a
proposal, so nothing reconciles the pull request: no promotion, no deferral when it is closed,
no quiet report. That is fixed ([#54](https://github.com/adamstallard/igor/issues/54)), and the
fix needed no delta — a `propose` that emits a modification already fails requirements in force,
which say a pull request that only edits an entry file is not a proposal and that a rejected
candidate must not be re-proposed.

**What is missing is the guarantee.** Nothing in `lore-review` says an existing entry is never
overwritten by proposing. The rule lives in a code comment, in the shape of the code, and in the
tests that hold it — and a rule that lives only there is one a later change can contradict
without anything failing.

That is not hypothetical in this repository. [#70](https://github.com/adamstallard/igor/pull/70)
is in review for the same shape: triage's model call spent whatever credential was ambient
wherever the budget gate named no seat, because the rule that it must not was written in a
comment at `src/execute.ts` and nowhere a test or a reviewer would meet it. Its remedy is this
one — write the requirement. The defect was live for exactly as long as the rule was only prose
beside the code.

## What Changes

**One added `lore-review` requirement: the id space is read from the branch the work lands on.**
A candidate whose id is taken there — by an entry or by a rejection — is not proposed, and an id
taken there is not handed out when one is minted. The guarantee is stated as the outcome it
protects: an entry that is already there is never overwritten by proposing.

**Minting is covered because it is the same collision, one step earlier.** `create` gated a new
id against the local store, so a person on a behind checkout mints an id that upstream already
holds and writes an entry the proposal gate then drops. Gating both against the same branch —
proposing at the sha it commits onto, minting at the tip when the id is made — is what makes the
numeric discriminator `lore-store` already requires apply to the id set that decides anything. It
costs `create` five requests where it made none, and where that read fails `create` says what it
could not check and mints against the checkout alone: the collision then survives to proposing,
which reads the branch unconditionally. Late, but never an overwrite and never silent.

**And minting says when the name moved, because nothing after it can.** A discriminator applied in
silence reads as a free id. Where the name the claim derives is held on the branch, the draft may
be a second entry for a claim already there — proposing gates on the id, and the id it is handed
is free, so it passes. Where a rejection holds the name, that second entry carries a claim review
has already turned down past the gate that exists to refuse it. Minting names which of the two it
found; a collision the checkout can already show — the same name, in the same kind — is not news
and is not reported.

Explicitly out of scope, both filed and neither addressed here:

- **A stale `publicStore`** ([#91](https://github.com/adamstallard/igor/issues/91)). The config
  is committed in the destination and read from the checkout, so a behind checkout can believe a
  repository is private after it was made public and propose privately-sourced provenance into
  it. Gating the id space does nothing for that, and this requirement must not be read as saying
  proposing from a behind checkout is safe generally. It is safe for ids.
- **A `destination` subdirectory** ([#92](https://github.com/adamstallard/igor/issues/92)). The
  store reads `<destination>/entries/` while proposing commits to `entries/` at the repository
  root. With the documented `destination: .` they coincide; with anything else the gate reads a
  different directory than the one the store uses, along with everything else.

## Capabilities

### Modified Capabilities

- `lore-review`: an entry already in the store is never overwritten by proposing, because
  candidate ids — and ids as they are minted — are gated against the store on the branch the
  proposal lands on rather than against the checkout.

## Impact

- The anti-overwrite guarantee is readable by whoever next changes `propose` or `create`, rather
  than being rediscovered from a comment or from the test that fails.
- No behaviour changes: this writes down what
  [#61](https://github.com/adamstallard/igor/pull/61) implements.
- It bounds itself honestly. A behind checkout is still wrong about configuration (#91) and
  about a subdirectory destination (#92), and the requirement says which of the three it covers.
