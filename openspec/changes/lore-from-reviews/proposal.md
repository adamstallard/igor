## Why

The densest expert-knowledge corpus an engineering org produces is its code review
history. A review comment is a named expert saying "this is wrong, do it this way" about a
specific artifact — already written, already labeled, already attached to the exact person
whose judgment you want to reuse. Almost no org mines it.

Meanwhile, senior people re-teach the same corrections by hand for years. If the frontend
lead has written some version of the same comment fourteen times across two years, that is
a rule the team has been paying to re-explain, one pull request at a time.

This change turns that history into **lore** entries, with provenance back to the comments
they came from. It runs as a one-time backfill against history that already exists, so it
needs no agent, no running process, and no waiting.

**Depends on `lore-store`** for the entry schema, validation, derived scoring, the
destination boundary, and the whole propose-and-review workflow — mining produces candidate
entries and hands them to `propose` exactly as a person would. A mined entry is an ordinary
entry whose provenance cites pull request comments rather than an author writing directly.

## What Changes

- **Mining configuration**: repositories in scope, the embedding provider, batch cap, and
  substance thresholds. Mining refuses to run when no repositories are listed, rather than
  defaulting to everything the credential can reach.
- **Review comments are mined and filtered.** Pull review comments for repos in scope, then
  keep the ones that carry signal:
  - **Did the correction stick?** Read GitHub's own outdated marker — `line: null` on the
    comment, free in the payload already fetched. Measured across 2,009 comments in four
    repositories, this is a weak signal that mostly works in the negative: a comment still
    anchored at the end of a merged pull request was probably not acted on. It downweights a
    cluster rather than gating a comment, and never promotes one by itself. Comments GitHub
    cannot anchor at all — anything before line anchoring existed — are skipped rather than
    scored, because the API reports them as `false` rather than unknown.
  - **Who wrote it?** Weight by author, so a designated expert's corrections outrank a
    drive-by.
  - **Nit or substance?** Filter on length, presence of stated reasoning, and whether the
    review blocked the pull request.
- **Recurring corrections are clustered into candidate rules.** Cluster semantically across
  pull requests; cluster size becomes the entry's support count. One occurrence is an
  anecdote, fourteen is a rule.
- **Conditions are derived, not invented.** The file paths of the source comments give the
  firing predicate directly — if every source comment landed on `.tsx` files under
  `src/components`, that is the condition. No learned conditions in this change.
- **Candidates are labelled, not routed.** Every candidate becomes a lore entry carrying a
  `scope` label (`global`, `role:<name>`, `project:<name>`). Promoting role-scoped guidance
  into standing role config waits for `core-igor-loop`, because nothing loads role config
  until then — and a label costs nothing to apply now and is enough to promote from later.
- **Candidates are handed to `propose`.** Mining stops at producing candidate entries; the
  pull request, its assignment, and the review contract all come from `lore-store`. What
  mining contributes is the provenance that makes the assignment meaningful — a candidate
  lands with the person whose comments it was drawn from.

Explicitly out of scope:

- **Retrieval.** Lore is written and read by humans in this change. Firing entries into an
  agent's context belongs with the consumer, in `core-igor-loop`.
- **Learned condition vectors and SAE-legible conditions.** Predicates derived from paths
  cover this change; activation-keyed conditions come later.
- **Ongoing consolidation from live episodes.** This is a backfill over history. The
  recurring pass that folds in new corrections comes once Igors are producing episodes.
- **Sources other than code review.** Slack, chat, and ticket histories are noisier and need
  different salience signals.

## Capabilities

### New Capabilities

- `review-mining`: Mining configuration — repositories in scope and the embedding provider —
  plus extracting review comments, restricting the corpus to comments whose stick signal is
  computable, recording whether a correction stuck, excluding bots, and scoring by author and
  substance.
- `lore-consolidation`: Clustering related corrections, drafting candidate entries, deriving
  predicates from source paths, deduplicating against existing entries, and routing
  candidates with a scope label.

### Modified Capabilities

None. The entry schema, validation, derived scoring, and destination boundary all come from
`lore-store` and are used here unchanged — mined entries are ordinary entries whose provenance
happens to cite pull request comments.

## Impact

- Read access to repository history for every repo in scope. No writes to any team surface.
- **Requires consent from the people whose comments are mined.** Building a model of a named
  colleague's judgment is a people problem before it is a technical one, and the review
  workflow is designed so that consent is obtained by construction rather than assumed.
- Produces an artifact that is useful with no agent running — a readable record of the
  rules the team has been enforcing informally.
- Establishes the lore schema that `core-igor-loop` consumes, so entry format decisions made
  here are load-bearing for everything after.
