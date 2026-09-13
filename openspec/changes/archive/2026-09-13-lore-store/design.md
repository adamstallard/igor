## Context

Lore is the team's curated knowledge: what was learned, as opposed to what happened (the
corpus) or who does what (role config). This change builds only the store — the format,
validation, and the human-facing workflow for putting entries in it.

It comes first because it is needed on every path. Mined entries land in it, hand-written
entries land in it, and entries accumulated from correcting Igors land in it. Nothing
downstream can be built without settling the schema, and the schema is cheap to settle now
while nothing depends on it.

There is no server, no credential beyond git, and nothing written to a team surface. The worst
failure mode is a malformed file in a store nothing yet reads.

## Goals / Non-Goals

**Goals:**

- A store whose individual entries are readable in under a minute and searchable as a whole.
- Hand-authoring as a first-class workflow, not a fallback.
- Entries that carry provenance, so any claim can be traced to where it came from.
- A schema that survives its consumers being built later.

**Non-Goals:**

- Mining, retrieval, firing, indexes, consolidation, or role objects.
- Any notion of an agent. Entries here are written and read by people.

## Decisions

**Markdown files in git, one per entry, filename equal to the id.** Git buys diffability —
which is how drift gets detected once entries start arriving automatically — plus a review
workflow that already exists, greppability, human readability, and portability across vendor
and model changes. A database would retrieve faster and review worse, and retrieval speed is
not the binding constraint — firing volume is, and it is capped independently of how many
entries exist. Naming the file after the id means an entry is locatable directly from a
supersession pointer without scanning.

**The schema:**

```yaml
id: use-query-hook-not-useeffect-fetch   # kebab slug, frozen at creation
claim: >-                                 # one or two sentences
  Fetch data with the shared query hook rather than calling fetch inside
  useEffect — the hook handles caching, deduping, and cancellation.
scope: role:frontend                      # global | role:<name> | project:<name>
status: provisional                       # provisional | active | deprecated
conditions:
  paths: ["src/**/*.tsx"]                 # predicate; may be absent
  prose: >-                               # always present
    Applies when adding or changing data fetching in a React component.
provenance:
  - url: https://example.invalid/pr/412#discussion_r1029481
    author: sarah
    at: 2026-03-14
supersedes: []
reviewed:
  by: sarah
  at: 2026-09-13
```

The body holds reasoning and exceptions — the part a person reads when they want to know why.
`core-igor-loop` will add `fired` (count and timestamp); nothing here should block that.

**Provenance is the single source of derived scores.** Support count is the number of
provenance items, recency is a decay over their dates, author weighting reads their authors.
Persisting `support` or `recency` as fields would desync the moment time passed or an item was
added, so they are computed at read time and the schema rejects them as stored fields.

**Provenance also covers hand-authored entries.** An authorship item carries `author` and `at`
with no `url`. Empty provenance is still rejected: an entry must record where it came from even
when the answer is "someone wrote it." Mining is one way to fill lore, not a precondition.

**Ids are derived from the claim and then immutable.** A slug beats a hash because diffs and
supersession pointers stay legible. But it is a starting convenience, not a binding — rewording
a claim later must not move what other entries reference. Collisions take a numeric
discriminator.

**`scope` is a label, not a foreign key.** `role:frontend` validates whether or not any role of
that name exists, and validation must not try to resolve it. Roles become real objects in
`core-igor-loop`; defining them here would mean inventing a schema a change early, with less
information than we will have then.

**The destination is configured separately and bounded.** Lore belongs to the operating team,
so the destination is independent of anything Igor mines or runs against, and the tool refuses
to start when it resolves inside Igor's own repository. That converts a documented convention
into something the tool will not let you get wrong — and it is the enforcement half of keeping
private material out of a repo that may one day be public.

**A CLI for create, validate, and list.** Hand-authoring is the primary path in this change, and
"edit YAML by hand and hope" is not a workflow. `create` scaffolds an entry and assigns the id;
`validate` runs the schema checks over the store; `list` shows what exists with derived scores.

**Configuration belongs to the lore repository, not to igor.** It is gitignored in the tool's
own repository because it is per-installation, but which repositories are in scope, who the
reviewers and experts are, and the decay half-life are all shared team decisions. Uncommitted,
they drift between the people running the tool, and an entry's score then depends on whose
machine computed it. Committing the config alongside the entries it governs — with
`destination: .` — keeps them together and versioned.

A public lore repository needs one caution: the `publicStore` guard rejects privately-sourced
provenance but does not inspect the config, so a config listing private repositories in scope
would publish those names.

**Branch protection and merge automation arrive together, and not before a second writer.**
Both answer the same question — what happens when someone other than the tool's owner merges
lore — so neither earns its cost on a single-writer repository.

When they do arrive, three settings have to line up. Enable **require a pull request before
merging**, which still permits an author to merge their own proposal and only blocks direct
pushes to main. Do **not** enable **require approvals**: GitHub refuses to let anyone approve
their own pull request, so that setting hard-blocks a solo author with no workaround, and
self-merge is the path a single reviewer depends on.

Protection then breaks reconciliation's promotion step, which pushes to main. The fix is a
merge-triggered workflow in the destination repository that flips status itself — which is
worth having anyway, because otherwise promotion depends on someone having this tool installed
and remembering to run it, and a teammate who merges lore would silently produce entries that
never fire. The workflow's own push is subject to the same protection, so the Actions actor
needs a bypass entry.

Reconciliation stays the fallback for repositories without CI, and finds nothing to promote
where the workflow already ran.

## Risks / Trade-offs

- **The schema proves wrong once something reads it** → Entries are markdown with frontmatter,
  so migration is a scripted rewrite over a few hundred files rather than a data migration.
- **Hand-authored entries drift from reality** → They carry provenance and dates like any
  other, so staleness is visible; pruning arrives with consolidation.
- **A store nothing reads gets no feedback** → Accepted deliberately. The alternative is
  building a consumer first and discovering the schema is wrong with more built on top of it.
- **Derived scores recomputed on every read cost time** → Linear in provenance items and
  cheap; if a large store ever makes it matter, cache keyed on the store's git commit.

## Open Questions

- Should the CLI enforce a maximum claim length, or leave brevity to review? Leaning toward a
  soft warning rather than a hard limit, since an over-long claim is a review signal rather
  than a validation error.
- Does `status: provisional` earn its place before consolidation exists to promote entries out
  of it? Keeping it, because hand-authored entries someone is unsure about have the same shape,
  and removing a status later is harder than not using one.
