## Why

`checkProvenanceVisibility` enforces the in-force `lore-review` requirement *"A public
destination refuses privately-sourced entries"*. To do that it needs the repository a
provenance item came from, and it gets it by scraping the item's `url`:

```ts
function repoOf(url: string): string | undefined {
  return url.match(/github\.com\/([^/]+\/[^/]+)/)?.[1]
}
```

Three ways an item leaves the set the guard checks:

- **No `url`.** The field is optional, and `lore-store` blesses a hand-authored item as
  *"`author` and `at` and no `url`"*. Nothing to scrape, so never checked.
- **A `url` that is not `github.com/owner/name`.** A GitLab host, an internal server, a Jira
  link: the regex returns `undefined` and the item drops out of the set without a word.
- **A GitHub repository the credential cannot reach.** This one throws out of `propose`.

So the guard is *refuse known-private* rather than *permit known-public*. It fails open on
missing information and closed on unreadable information, which is an odd pair to have chosen —
and nobody did choose it. Both behaviours fall out of a `Set` built from a regex.

**The fix is not a better regex, because the information was never missing.** Judging a source
public or private is specific to the source. When Igor mines a review comment it *knows* the
repository with certainty — that is how it fetched the comment. `review-mining` already requires
that mining only reads repositories named in configuration, so the source is not merely known,
it is declared. The design writes a url, discards the repository, and reconstructs it from the
string later. Information available upstream, guessed at downstream.

**Nothing mines yet.** `lore-from-corrections` is 0/16 and `lore-from-reviews` is 3/33;
`provenanceFromCitations` is called from exactly one place, `create` in `src/cli.ts`. The guard
is not failing in production, because nothing is producing the provenance it would fail on. That
is the reason to do this now rather than an argument against it: the shape is settled before the
producer exists, so the miner has somewhere to put what it knows instead of the field being
bolted on around a miner that already throws it away.

## What Changes

**A provenance item that cites a mined artifact names its source, host-qualified.**
`source: github:acme/widgets` beside the `url`, recorded by whatever mined the artifact. The
host prefix is what makes "a source Igor cannot ask about" a condition the guard can state
rather than a parse that returned nothing. See `design.md` for why a host-qualified string and
not a bare `owner/name`, a nested mapping, or another url.

**The guard reads the source, and an undeterminable source is refused.** Every citing item
resolves to known-public, known-private, or undeterminable, and the refusal distinguishes the
two undeterminable cases — a kind Igor cannot query, and a repository it could not read —
because a declaration and a credential are different remedies. Today's answer to undeterminable
is permit-by-omission; this change makes it refuse, on the grounds that a guard which passes an
item because it learned nothing about it reports success for the exact case it exists to catch.
Configuration MAY declare a source public, without which refusal is a wall rather than a policy.

**The second-order benefit, stated plainly:** a named source converts a *silent skip* into an
*explicit unknown*. A GitLab source cannot be visibility-checked by a GitHub API call either
way. The difference is that it becomes a statable condition the guard acts on, instead of an
item falling quietly out of a `Set`.

**Hand-authoring stays exactly as valid, and is not the unknown case.** An item with no `url`
and no `source` cites nothing, so it has no source to name and nothing about it is at issue.
The delta says so in force, in both specs, because a check that reads "has no source" as
"source unknown" would make hand-authoring impossible in the public stores where it matters
most.

**Visibility is not recorded on the item.** `source` is where an item came from, which does not
change. Whether that place was public is a fact about a moment, and it is relied on at
publication rather than at mining. `lore-store` already rejects a stored `support` for the same
reason — *"a count written in September is wrong the moment somebody adds a citation"* — and a
`public: true` written at mining time fails in the worse direction: it carries a repository that
has since gone private straight past the guard. The alternative is weighed properly in
`design.md` rather than assumed away.

Explicitly out of scope:

- **A stale `publicStore`** ([#91](https://github.com/adamstallard/igor/issues/91)). The
  destination's visibility is read from a committed config on a possibly-behind checkout. This
  change is about the *source* side of the same comparison and does nothing for the destination
  side.
- **Migrating existing entries.** See Impact: eight entries, seven of them one line each, by
  hand.
- **The miner.** `review-mining` and `lore-consolidation` are unarchived changes on their own
  branches, untouched here. The obligation to set `source` reaches them through `lore-store`,
  which is where the entry shape is governed.

## Capabilities

### Modified Capabilities

- `lore-store`: a provenance item citing a mined artifact carries a host-qualified `source`,
  recorded by whatever mined it rather than reconstructed from its `url`; visibility is not
  stored on the item; an item with neither `url` nor `source` remains valid authorship.
- `lore-review`: the public-destination guard reads `source` rather than scraping `url`, and
  refuses an item whose source it cannot establish, naming which kind of unknown it met.

## Impact

- **Existing entries: seven edits of one line.** Adam's live store holds 8 entries. Seven carry
  a `github.com/adamstallard/igor/...` url and need `source: github:adamstallard/igor` added;
  the eighth is hand-authored with no url and needs nothing. No migration mechanism is designed,
  per standing practice that hand-editing a handful of files is fine. `igor validate` names each
  offender with its reason, which is the whole tooling the edit needs.
- **Those seven are invalid until edited.** Saying it plainly: a store upgraded without the edit
  fails validation on every mined entry. That is the intended cost of enforcing the field at
  write time rather than only at the guard, where an entry that can never be proposed into a
  public store would sit valid in the store until somebody tried.
- **The miner has somewhere to put what it knows.** `lore-from-reviews`'s design shows sample
  frontmatter with a url and no source; whoever implements it adds the source it already holds.
- **One fewer stack trace.** The unreadable-repository case becomes a named refusal rather than
  a `GhError` escaping `propose` ([#93](https://github.com/adamstallard/igor/issues/93) is the
  general form).
