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
      which kind it is, or saying what it claims. The candidate is then not proposed in that
      run, under any id, and the run reports that. Tests for *An out-of-scope collision during
      a run is reported only as taken* and *A candidate whose id is taken out of scope is not
      proposed during a run*, built now, though no Igor proposes during its run until
      lore-from-corrections' `propose-lore` lands
- [ ] 2.7 2.1's function, or one beside it, filters the question and miss files a search finds
      on the `questions` branch by their `repository` key: it keeps a file only when that key
      names a repository the run's role works, and drops a file with no readable key. Tests
      for *A search never shows another project's question file*, which covers a miss file
      too, and *A search shows a question file about a repository the role works*

## 3. Citations made during a run

- [ ] 3.1 Define how a worker reports a citation, by the entry's id alone, in its output or
      through #175's outbox, as #175 settles. The Igor reads the citations from there and,
      only when the run publishes an artifact or ends in its handoff comment on the item,
      pushes each to the lore repository's `questions` branch, in the format shared-skills
      #25's *A citation file has one format* sets for a citation an Igor pushes from a run.
      Tests for *A worker's citation is published by its Igor*, *A worker's report of a
      citation holds only the entry's id*, *A run that publishes nothing pushes no citations*,
      *A citation takes the one citation-file format, with the run's id* and *A citation push
      needs no allow action*. *A worker reports no citation for a question with a category*
      is the inquisitor skill's behaviour inside the worker, which the Igor cannot check, so
      gate two has no Igor-side test for it
- [ ] 3.2 The Igor mints an opaque run id for each run and records it in the run's record on
      the state branch. A test for *A citation's run can be found from its run id*
- [ ] 3.3 The Igor creates the `questions` branch as an orphan where it is missing, and retries
      a push that was rejected because the branch moved, at most three times. Tests for *A
      missing questions branch is created as an orphan*, *A push that loses a race is retried*
      and *A push that keeps losing the race is counted as failed*
- [ ] 3.4 The Igor refuses a citation of an id that names no `active` entry in the run's role's
      scope, and withholds one whose item's repository is less visible than the lore
      repository, counting an unreadable visibility as the rule says. Tests for *A citation of
      an entry that cannot be cited is refused*, *A citation is not pushed somewhere more
      visible than its question*, *The worker cannot choose the repository a question concerns*
      and *An unreadable visibility counts against pushing*. Also tests for *A citation is
      checked against the store as the run read it* and *A search during a run reads only the
      Igor's lore store*
- [ ] 3.5 The run's record on the state branch counts the citations the Igor did not push, by
      reason, with no worker text and no reason for a refusal. A test for *A citation that
      cannot be pushed is counted*
- [ ] 3.6 Once #211 specifies how an Igor runs the inquisitor skill itself, with no worker, and
      where that run's transcript goes, the Igor pushes that run's citations by the same rules
      as 3.1 to 3.5. Tests for *A citation from the Igor's own
      inquisitor run is pushed under the same rules* and *The Igor's own inquisitor run makes
      no citation for a question with a category*

- [ ] 3.7 Define the bare flag a worker reports when its run met a question with a category,
      naming nothing about it, on the same channel as 3.1. For that run, execution writes no
      transcript, only its outcome, cost and ledger row; `prBody` in `src/execute.ts` puts no
      excerpt of the worker's result and no transcript link in the pull request body; and the
      refusal record keeps only the refusal's reason, while any other run's refusal record
      keeps the provider's whole reply. Tests for *Transcript persisted off the
      main line*, *A run that met a categorized question stores no transcript*, *A run that
      met a categorized question publishes no excerpt of its result*, *A refusal on such a
      run keeps only its reason*, *A refusal on any other run keeps the provider's reply*,
      *The worker's report of a categorized question names
      nothing* and, once 3.6 can be built, *The Igor's own inquisitor run that met a
      categorized question stores no transcript*
- [ ] 3.8 At startup, the Igor asks GitHub once for the lore repository's visibility
      (`private`, `internal` or `public`), counting an answer it cannot read as public, and the
      citation rule uses that answer until the Igor restarts, never `publicStore`. Tests for
      *The lore repository's visibility comes from GitHub, not publicStore* and *The lore
      repository's visibility is read once, at startup*

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
- [ ] 4.4 Whether a worker's flag that its run met a question with a category reaches the Igor
      on a run the provider refuses over a usage limit. Gate two builds nothing for this case
      until Adam answers the question in the proposal's *Still open*; as the code stands,
      such a run's refusal record and transcript are kept in full.
