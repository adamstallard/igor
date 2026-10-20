## 1. Remove the ban from the code

- [ ] 1.1 Delete the test *offers a worker no way to search the store* from
      `test/firing.test.ts`, with its `@scenario lore-firing: No search affordance offered` tag
      if [#196](https://github.com/adamstallard/igor/pull/196) has merged
- [ ] 1.2 Rewrite the header comment of `src/firing.ts` so it no longer gives a reason for having
      no search. The worker still never has to ask: lore is injected before it runs.
- [ ] 1.3 A test that rendered lore holds every active, in-scope entry when nothing asked for it
      (*Injection does not wait on a search*)

## 2. The filter a search uses, built even if no search command is

- [ ] 2.1 One exported function in `src/firing.ts` that takes entries and the run's role and
      returns the in-scope entries, each marked as lore when `active` and labelled with its status
      otherwise. It uses `scopeMatches`, the same function firing uses, never a copy.
- [ ] 2.2 Tests of that function for *A search never shows an out-of-scope entry* (an other-role
      and an other-project entry are absent, and nothing in the result counts them) and *A search
      labels in-scope entries that are not active* (`provisional`, `deprecated` and `active`
      entries in scope, only the last marked as lore)
- [ ] 2.3 A test for *A search hit is not a firing*: calling the function writes no firing record
- [ ] 2.4 A test for *A duplicate check is curation, not a search*, once `lore-from-corrections`
      or `lore-from-reviews` builds a duplicate check that runs during an Igor's run: it sees
      `provisional` entries and no out-of-scope entry. Until then, if #196 has merged, list the
      scenario in spec-trace's baseline, its list of scenarios allowed no tagged test yet.
- [ ] 2.5 If a search command for workers is built, it returns results through 2.1's
      function and nothing else

## 3. Facts to check before anyone relies on a search in a run

- [ ] 3.1 Whether a worker can run the inquisitor skill: load it, and reach a lore clone and
      `~/.config/shared-skills/inquisitor.json` from the environment Igor writes out for it
- [ ] 3.2 Whether a worker can read the lore checkout's files directly. If it can, file an issue:
      a worker could then see entries outside its role's scope with no search at all.
