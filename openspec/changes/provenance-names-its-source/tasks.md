## 1. The field

- [ ] 1.1 `ProvenanceItem` carries an optional `source`, and `validateProvenance` requires it
      wherever `url` is present, naming `source` in the failure
- [ ] 1.2 Reject a `source` that is not `<host>:<identifier>` — a bare `owner/name` is the same
      guess the url was
- [ ] 1.3 Reject an item recording its source's visibility, with the reason a stored `support`
      is rejected: right when written, wrong whenever the source changes, and read at
      publication rather than at mining
- [ ] 1.4 An item with neither `url` nor `source` stays valid and is not reported as anything
- [ ] 1.5 `create` takes `--source` alongside `--url`, paired positionally per `--author` the
      way `--url` and `--at` already are, and refuses a partial pairing rather than attaching
      one author's source to another

## 2. The guard

- [ ] 2.1 `checkProvenanceVisibility` reads `source`; `repoOf` and the regex go
- [ ] 2.2 Classify each citing item as known-public, known-private, or undeterminable, and
      refuse the last two — naming every offender in one refusal rather than the first
- [ ] 2.3 Distinguish the two undeterminable cases in the message: a host with no visibility
      check, and a repository that could not be read. Say *could not read*, not *is private*: a
      404 is indistinguishable from a repository that does not exist
- [ ] 2.4 Catch the `GhError` `isPublic` raises so an unreachable repository is a refusal rather
      than a stack trace out of `propose`
- [ ] 2.5 Skip an item with no citation without counting it as an unknown
- [ ] 2.6 One visibility call per distinct source, not per item

## 3. Declaring a source

- [ ] 3.1 A config key declaring sources whose visibility Igor cannot or need not query, added
      to `CONFIG_KEYS` so a misspelling is refused by name rather than turning the declaration
      off — the failure `lore-store` already warns about for `publicStore`
- [ ] 3.2 A declared source is resolved without a network call, and the declaration is what
      makes refusal a policy rather than a wall

## 4. Tests

- [ ] 4.1 A GitLab source into a public destination refuses, naming it — the case that is
      silently permitted today
- [ ] 4.2 An unreadable GitHub source refuses with a message, not a `GhError`
- [ ] 4.3 A hand-authored candidate is proposed into a public destination
- [ ] 4.4 A declared source is proposed with no call made for it
- [ ] 4.5 A private destination accepts all of the above unchanged
- [ ] 4.6 An entry whose item has a `url` and no `source` fails validation naming the field

## 5. The store and the record

- [ ] 5.1 Add `source: github:adamstallard/igor` to the seven mined entries in the live store by
      hand; the hand-authored eighth is untouched. No migration mechanism
- [ ] 5.2 `docs/architecture.md`: record that source is stored and visibility is resolved, with
      the staleness direction that decided it, beside the existing note on derived fields
- [ ] 5.3 Update the sample frontmatter in `lore-from-reviews`'s design where it shows a url
      with no source — or file it against that change if it has not landed
