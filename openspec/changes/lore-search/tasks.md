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
- [ ] 2.4 One exported function that a duplicate check calls to get the entries and rejected
      candidates it may compare against during a run: `provisional` ones included, none outside
      the run's role's scope, and no rejection that records no scope. A test for *A duplicate
      check is curation, not a search*. This change builds the function only; calling it is
      left to `lore-from-corrections` and `lore-from-reviews`, when they build a duplicate check
      that runs during a run
- [ ] 2.5 2.1's function returns its results marked as search output, never in the form the
      injected-lore channel uses. A test for *Search results never arrive as injected lore*.
      If a search command for workers is built, it returns results through that function and
      nothing else
- [ ] 2.6 `lore-review`'s id gate and minting take the run's role, when they run during a run,
      and then report a collision with an entry or rejected candidate outside that role's scope,
      or with a rejection that records no scope, only as "id taken": without naming it, saying
      which kind it is, or saying what it claims. A test for *An out-of-scope collision during a
      run is reported only as taken*, built now, though no Igor proposes during its run until
      lore-from-corrections' `propose-lore` lands

## 3. Citations made during a run

- [ ] 3.1 Define where in its output a worker reports a citation and its question's category.
      The Igor reads the citations from there and, only when the run publishes an artifact or
      ends in its handoff comment on the item, pushes each to the lore repository's `questions`
      branch as a file holding only the cited entry's id, the date and the run's id. Tests for
      *A worker's citation is published by its Igor*, *A run that publishes nothing pushes no
      citations*, *A citation for a categorized question is not pushed*, *A citation holds the
      entry's id, the date and the run's id, and nothing else* and *A citation push needs no
      allow action*
- [ ] 3.2 The Igor mints an opaque run id for each run and records it with the run's transcript
      on the state branch. A test for *A citation's run can be found from its run id*
- [ ] 3.3 The Igor creates the `questions` branch as an orphan where it is missing, and retries
      a push that was rejected because the branch moved. Tests for *A missing questions branch is created as
      an orphan* and *A push that loses a race is retried*
- [ ] 3.4 The Igor refuses a citation of an id that names no `active` entry in the run's role's
      scope, and withholds one whose item's repository is less visible than the lore
      repository, counting an unreadable visibility as the rule says. Tests for *A citation of
      an entry that cannot be cited is refused*, *A citation is not pushed somewhere more
      visible than its question*, *The worker cannot choose the repository a question concerns*
      and *An unreadable visibility counts against pushing*
- [ ] 3.5 The run's record on the state branch counts the citations the Igor did not push, by
      reason, with no worker text and no reason for a refusal. A test for *A citation that
      cannot be pushed is counted*

## 4. Facts to check before anyone relies on a search or a citation in a run

- [ ] 4.1 Whether a worker can run the inquisitor skill: load it, and reach a lore clone and
      `~/.config/shared-skills/inquisitor.json` from the environment Igor writes out for it.
      Check after [#174](https://github.com/adamstallard/igor/pull/174), which decides which
      skills a worker loads, [#175](https://github.com/adamstallard/igor/pull/175), which
      changes what the worker may touch, and shared-skills #25, which carries the firing scope
      rule inside an Igor, have all landed. Gate two's code does not wait for this check; using
      the inquisitor during a run does, as this section's heading says.
- [ ] 4.2 Whether a worker can read the lore checkout's files directly. #175 requires only that
      it cannot write them. If it can read them, file an issue: a worker could then see entries outside its role's
      scope with no search at all.
- [ ] 4.3 Whether the lore repository's rulesets or branch protection let an Igor's App create
      and push the orphan `questions` branch. If they do not, file an issue: until then every
      citation made during a run is counted as not pushed.
