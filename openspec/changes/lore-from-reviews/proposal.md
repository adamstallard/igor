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

**Depends on `lore-store`** for the entry schema, validation, derived scoring, and the
destination boundary. Mined entries are ordinary entries whose provenance cites pull request
comments rather than an author writing directly.

## What Changes

- **Mining configuration**: repositories in scope, the embedding provider, batch cap, and
  substance thresholds. Mining refuses to run when no repositories are listed, rather than
  defaulting to everything the credential can reach.
- **Review comments are mined and filtered.** Pull review comments for repos in scope, then
  keep the ones that carry signal:
  - **Did the correction stick?** Compare the comment's line range against later commits in
    the same pull request. A comment followed by a change to those lines landed. One that
    was argued down or ignored is a rejected opinion, not a lesson.
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
- **The person whose comments were mined reviews the result.** Each candidate is opened as a
  pull request assigned to the author it was derived from: "here are fourteen times you said
  this, we turned it into a rule — is that right?" Nothing enters lore without that
  approval.

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
  plus extracting review comments, detecting whether a correction stuck, excluding bots, and
  scoring by author and substance.
- `lore-consolidation`: Clustering related corrections, drafting candidate entries, deriving
  predicates from source paths, deduplicating against existing entries, and routing
  candidates with a scope label.
- `lore-review`: The approval workflow — opening candidates as pull requests, assigning each
  to the author it was derived from, and writing approved entries with provenance intact.

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
