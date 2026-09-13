## Why

The densest expert-knowledge corpus an engineering org produces is its code review
history. A review comment is a named expert saying "this is wrong, do it this way" about a
specific artifact — already written, already labeled, already attached to the exact person
whose judgment you want to reuse. Almost no org mines it.

Meanwhile, senior people re-teach the same corrections by hand for years. If the frontend
lead has written some version of the same comment fourteen times across two years, that is
a rule the team has been paying to re-explain, one pull request at a time.

This change turns that history into **lore**: a small, curated, human-readable store of
what the team has learned, with provenance back to the comments it came from. It runs as a
one-time backfill against history that already exists, so it needs no agent, no running
process, and no waiting.

## What Changes

- **A lore store exists.** Markdown files in git, one per entry, with frontmatter carrying
  the claim, the conditions under which it applies, provenance links, support count, and
  status. Small enough for a person to read end to end.
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
- **Candidates are routed.** Guidance specific to one role's behavior becomes a proposed
  role config change; guidance that applies to anyone touching that area becomes a lore
  entry.
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

- `lore-store`: Entry schema and on-disk layout — claim, conditions, scope, provenance,
  support count, status lifecycle (provisional, active, deprecated), supersession, and the
  git conventions that make the store diffable and reviewable.
- `review-mining`: Extracting review comments for repos in scope, detecting whether a
  correction stuck, and scoring by author and substance.
- `lore-consolidation`: Clustering related corrections, drafting candidate entries, deriving
  predicates from source paths, deduplicating against existing entries, and routing
  candidates between lore and role config.
- `lore-review`: The approval workflow — opening candidates as pull requests, assigning each
  to the author it was derived from, and writing approved entries with provenance intact.

### Modified Capabilities

None — this is the first change in the project.

## Impact

- Read access to repository history for every repo in scope. No writes to any team surface.
- **Requires consent from the people whose comments are mined.** Building a model of a named
  colleague's judgment is a people problem before it is a technical one, and the review
  workflow is designed so that consent is obtained by construction rather than assumed.
- Produces an artifact that is useful with no agent running — a readable record of the
  rules the team has been enforcing informally.
- Establishes the lore schema that `core-igor-loop` consumes, so entry format decisions made
  here are load-bearing for everything after.
