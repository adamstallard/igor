## Context

The public-destination guard needs one fact per provenance item: which source the item was
mined from. That fact is known with certainty at mining time — `review-mining` requires mining
to read only repositories named in configuration, so the source is not merely known, it is
declared. It is then discarded, and `checkProvenanceVisibility` reconstructs it from the item's
`url` with `/github\.com\/([^/]+\/[^/]+)/`.

Four decisions follow from wanting that fact carried instead of guessed, and each has a
plausible alternative that has to be argued down rather than waved at.

## Decisions

### Record the source, not the answer

The tempting shortcut is to ask the question at mining time — when a credential that can reach
the repository is already in hand — and store the result: `public: true` on the item. It is one
boolean, it needs no host taxonomy, and it makes the guard a field read with no network at all.

It is wrong for the reason this store already refuses a stored `support`. Support is derived
and goes stale; the entry file would carry a count that was right in September. Visibility is
worse, because it goes stale **in the direction of the failure the guard exists to prevent**. A
repository public when a comment was mined and private by the time an entry derived from it is
proposed carries `public: true` straight past the check. The store then publishes knowledge
derived from a private repository, with an audit trail asserting it was fine.

The reverse case is merely annoying — a repository made public after mining is refused forever
until someone edits eight files — but it is the same defect: a recorded answer cannot be
re-derived and cannot be checked against the world.

Source has the opposite property. Where an artifact came from is fixed at the moment it was
fetched and never changes afterwards. It is a fact about the item; visibility is a fact about
somewhere else, at a time. Storing the first and resolving the second at the moment it is
relied on is the split that does not rot.

The check does cost a network call per distinct source, exactly as it does today. That is the
price of an answer that is true when it is used.

### The item, not the entry

Visibility could live on the entry — one `sources:` list, or one flag. It cannot, for two
reasons.

Consolidation merges clusters, so one entry's provenance can cite several repositories; an
entry-level answer has to reduce them, and every reduction loses which item was the problem.
The refusal has to name the offending source, and it can only do that if the source sits where
the offence does.

And an entry-level flag is still a stored derivation — it would go stale the same way, and
additionally go stale whenever an item is added. The granularity argument and the staleness
argument point the same way.

### `<host>:<identifier>`, not a bare repository path

`source: acme/widgets` would match what `isPublic()` already takes, and would need no parsing
at all. It is also GitHub-shaped: a GitLab group path and a GitHub owner/name are the same
string, so the guard would be back to assuming the host, which is the defect one layer up.
Worse, it would assume it *confidently*, and hand a GitLab path to the GitHub API.

`source: github:acme/widgets` makes the host the thing being dispatched on. A source whose host
Igor has no way to query is then a **decidable** condition — `gitlab:` is a host with no
visibility check, and that is a sentence the guard can say — rather than a regex returning
`undefined`, which is a sentence nobody can say. That decidability is the whole second-order
benefit of the change; a bare path throws it away to save a prefix.

Two alternatives rejected:

**A nested mapping**, `source: {host: github, repo: acme/widgets}`. Three lines of YAML per
provenance item, in a file a person reads and hand-edits, to express two fields a colon already
separates. The store's other compound values are flat for the same reason.

**A url.** That is what `url` already is, and deriving the source from it is the defect being
removed. Two urls per item would invite them to disagree.

The host token is a name for a kind of place, not a domain: `github` covers GitHub Enterprise
under whatever domain, because what the guard dispatches on is which API can answer, not which
DNS name served the page.

### Undeterminable is refused, and configuration is the way out

Three answers were available for a source whose visibility cannot be established.

**Permit** is today's behaviour, arrived at by omission. It means a guard whose entire purpose
is catching a silent failure has a silent failure of its own, reached by the most ordinary
route: a source it had not thought about.

**Report and permit** is a warning in a CLI run. The requirement in force says the failure this
guards is one that *"is silent and nobody notices it later"*; a line of output in a run that
also succeeded is that same failure with better manners.

**Refuse** is chosen. It is the only answer under which the guard's claim is true. The cost is
bounded twice over: it bites only on a public destination, and only on an item Igor genuinely
cannot make a statement about.

Refusal alone, though, is a wall in front of a team mining anywhere Igor cannot query — they
would have no answer at all, and no answer is not a policy. So configuration may declare a
source public. This is not a new idea in the requirement; the sentence directly above it already
says the destination's own visibility may be declared in configuration for the same reason.
Declaring is a person asserting something they know, in a committed file, which is a different
thing from the tool assuming it.

The two undeterminable cases are reported apart because their remedies are:

| what happened | what to do |
| --- | --- |
| a host with no visibility check | declare it |
| a repository that could not be read | fix the credential, or declare it |

The second case deserves its wording checked. A private repository the credential cannot see at
all comes back 404, indistinguishable from one that does not exist or one behind an expired
token. The refusal therefore says *could not read*, which is what was observed, rather than
*is private*, which is an inference. Same outcome, honest message.

### Two specs, because they answer different questions

`lore-store` owns the entry shape — *"Provenance is the sole source of support and authorship"*
is the requirement that already enumerates what an item must carry, so the `source` clause grows
there, beside the `url` clause it parallels. Not *"Frontmatter conforms to a validated schema"*,
which lists entry-level keys; `provenance` is already in that list and its items' fields are not.

`lore-review` owns what proposing does. Whether an unknown source is refused is a property of
the guard, and would still be a decision to make if the field were spelled differently.

Both change, because a field with no reader is decoration and a reader with no field is the
regex.

`lore-store`'s hand-authoring requirement also changes, to say *no `url` and no `source`*. It
currently says only *no `url`*, and left alone it would be silently ambiguous about the field
this change adds — which is exactly where the hand-authored case would get swept into the
unknown bucket by someone reading fast.

## Roads not taken

**Fixing the regex.** Adding gitlab.com and a couple of hosts makes the same guess for more
strings and keeps every property that makes it wrong: it is silent when it fails, it cannot be
extended by the operator, and it throws away information the producer had.

**Deriving the source from configuration instead of recording it.** Mining reads only configured
repositories, so in principle the set of possible sources is known without a field. But an entry
cites one source, not the set, and the store outlives the config that produced it: a repository
removed from `sources` next month leaves entries whose origin is then unrecoverable.

**Checking at mining time and refusing there.** Mining does not know where an entry will be
proposed, and the destination's visibility can change between mining and proposing. The check
belongs at the moment of publication, which is where it is.

**Rejecting any unrecognized key on a provenance item**, the way the config file refuses a key
nobody reads. It would subsume the stored-visibility refusal and more besides, and it is a
defensible change — but it is a change to how every entry is validated, made for a reason that
has nothing to do with this one. Worth its own proposal.
