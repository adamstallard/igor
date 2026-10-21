## 1. Remove the ban from the code

- [ ] 1.1 Delete the test *offers a worker no way to search the store* from
      `test/firing.test.ts`, with its `@scenario lore-firing: No search affordance offered` tag
      if [#196](https://github.com/adamstallard/igor/pull/196) has merged
- [ ] 1.2 Rewrite the header comment of `src/firing.ts` so it no longer gives a reason for having
      no search. The worker still never has to ask: lore is injected before it runs.
- [ ] 1.3 A test that rendered lore holds every active, in-scope entry when nothing asked for it
      (*Injection does not wait on a search*)

## 2. The search igor runs for its workers

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
      `igor lore-search` (2.8) returns results through that function and nothing else
- [ ] 2.6 `lore-review`'s id gate and minting take the run's role, when they run during a run,
      and then report a collision with an entry or rejected candidate outside that role's scope,
      or with a rejection that records no scope, only as "id taken": without naming it, saying
      which kind it is, or saying what it claims. The candidate is then not proposed in that
      run, under any id, and the run reports that. Tests for *An out-of-scope collision during
      a run is reported only as taken* and *A candidate whose id is taken out of scope is not
      proposed during a run*, built now, though no Igor proposes during its run until
      lore-from-corrections' `propose-lore` lands
- [ ] 2.7 2.1's function, or one beside it, returns the question and miss files a search
      finds on the Igor's lore repository's `questions` branch, whatever repository their
      `repository` key names. `igor lore-search` (2.8) then drops a file more private than the
      item's repository, judging the file by the more private of its `repository` and
      `asked_from` keys, and counting a visibility it cannot read against the file. Tests
      for *A search shows a questions-branch file from any repository*, *The search command
      returns no file about a more private repository* and *A file is judged by the more
      private of its two repositories*
- [ ] 2.8 `igor lore-search`: a command offered to every worker whatever its role's
      `commands` list, reading a question's text or search terms from its standard input. The
      worker's sandbox allows it beside the role's `commands`, whatever the role's monotonic
      restrictions. Under `igor serve`, at the start of each run the Igor fetches the lore
      repository's `questions` branch into a ref of its own, writing nothing to the checkout's
      working tree, and the run's searches read that ref; `igor run` fetches nothing and reads
      the ref as last fetched. The command's channel is reachable by that run's
      worker alone, and its results are delimited as data. The Igor runs
      the search over its own lore checkout's entries and the `questions` branch's files, in
      the store as the run read it, through 2.1 and 2.7, and returns the results to the worker.
      Gate two chooses how the command reaches the Igor, and the command grants the worker no
      file access, command or credential. Tests for each scenario of *An Igor runs its worker's
      lore searches*, and for role-config's *Declared commands bound what the worker may run*
      and *Listing the search command is no widening*, which also needs role validation's
      monotonic check to treat `igor lore-search` as outside it
- [ ] 2.9 Before `igor lore-search` labels a question file as an answer, the Igor runs every
      check of shared-skills #25's *Only an answer with authority stops a question* on it,
      reading GitHub as the installation of its App that covers each repository read. A file
      whose check fails or cannot be run, such as with GitHub unreachable or no installation
      covering the repository, is shown as input, labelled as unconfirmed. Whether a linked
      comment holds the answer is checked in code by #25's normalized containment, with no
      model call. Until #25's branch states them, 2.9 builds two rules the spec states itself: an
      Igor's App is never a person's relay, and, during a run, a file keyed to another
      repository than the item's is input. Tests for *A question file that passes
      #25's authority checks is labelled as an answer*, *An authority check that cannot be run
      labels the file as input*, *A failing authority check labels the file as input*, *A
      linked comment is judged by #25's normalized containment, with no model*, *An answer
      relayed by an Igor's App proves no person answered* and *A question file keyed to another
      repository is shown as input*

## 3. Citations made during a run

- [ ] 3.1 Define how a worker reports a citation, by the entry's id alone, in its output or
      through #175's outbox, as #175 settles. The Igor reads the citations from there and,
      only when the run publishes an artifact or ends in its handoff comment on the item, and
      the run does not count as flagged under 3.7, pushes each to the lore repository's `questions` branch, in the format shared-skills
      #25's *A citation file has one format* sets for a citation an Igor pushes from a run.
      Tests for *A worker's citation is published by its Igor*, *A worker's report of a
      citation holds only the entry's id*, *A run that publishes nothing pushes no citations*,
      *A flagged run pushes no citations*, *A citation takes the one citation-file format, with the run's id* and *A citation push
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
      *An unreadable visibility counts against pushing* and *The item's repository's visibility is
      read at push time*. Also a test for *A citation is
      checked against the store as the run read it*
- [ ] 3.5 The run's record on the state branch counts the citations the Igor did not push, by
      reason, each under the first reason that applies in the spec's order, with no worker
      text and no reason for a refusal. Tests for *A citation with two reasons is counted
      once, under the first*. A test for *A citation that
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
      keeps the provider's whole reply. A run the provider refuses over a usage limit before
      the Igor has its worker's completed report, or that ends before it for any other reason,
      is treated as flagged, so 3.1's channel must
      carry the worker's mark that its report is whole; a report without the mark counts as
      cut short. Every worker sends the report on every run, whether or not its role runs the
      inquisitor. A flagged run's transcript path holds this line, which may not be reworded:

      ```text
      Transcript withheld: this run met, or may have met, a sensitive question. See the action log.
      ```

      Its
      ledger row keeps each denied command by name only. Once #188's action log is built, a
      flagged run's log keeps names only. Tests for *Transcript persisted
      off the main line*, *A run that met a categorized question stores no transcript*, *A run that
      met a categorized question publishes no excerpt of its result*, *A refusal on such a
      run keeps only its reason*, *A refusal on any other run keeps the provider's reply*,
      *The worker's report of a categorized question names
      nothing*, *A refusal Igor could not parse says only that the provider refused*, *A report
      the Igor cannot tell is whole counts as cut short*, *A refused run with no completed report counts as flagged*,
      *A worker run that ends without its completed report, for any reason, counts as
      flagged*, *A flagged run's ledger row keeps each denied command by name only*, *Any
      other run's ledger row keeps a denied command whole*, *A flagged run's action log keeps
      names only* once #188 is built, *An execution counts as flagged
      when any of its worker runs does* and, once 3.6 can be built, *The Igor's own inquisitor run that met a
      categorized question stores no transcript*
- [ ] 3.8 At each push to the `questions` branch, the Igor asks GitHub once for the lore
      repository's visibility (`private`, `internal` or `public`), counting an answer it
      cannot read as public, and the push rules use that answer, never `publicStore`. Tests
      for *The lore repository's visibility comes from GitHub, not publicStore* and *The lore
      repository's visibility is read at each push*

- [ ] 3.9 On the channel of 3.1, the worker reports each question and miss file it would put
      on the `questions` branch, and the Igor pushes it under the rules of *An Igor publishes
      the questions-branch files its worker reports*, reusing 3.3's branch creation and retries
      and 3.5's counts. The credential check calls #217's credential redaction, never a
      copy of it, so #217 merges before this is built. The Igor sets each file's
      `asked_from` key to the item's repository. When it posts a handback comment, it
      records the questions it posted there, and the check that an answer's question is one
      the Igor asked reads that record, never the comment. Tests
      for each of that requirement's scenarios but two: *A worker
      reports no questions-branch file for a question with a category*, which is the inquisitor
      skill's behaviour inside the worker, as in 3.1, and *The Igor's own inquisitor run pushes its questions-branch files under the same rules*,
      which waits on 3.6; and for *A questions-branch file push needs no allow action*

## 4. Facts to check before anyone relies on a search or a citation in a run

- [ ] 4.1 Whether a worker that runs the inquisitor skill reaches its filter 1 through `igor
      lore-search`. Check after [#174](https://github.com/adamstallard/igor/pull/174), which
      decides which skills a worker loads, [#175](https://github.com/adamstallard/igor/pull/175),
      which changes what the worker may touch, and shared-skills #25 have all landed. Gate two's code does not wait for this check; using
      the inquisitor during a run does, as this section's heading says.
- [ ] 4.2 Whether a worker can read the lore checkout's files directly. #175 requires only that
      it cannot write them. If it can read them, file an issue: a worker could then see entries outside its role's
      scope with no search at all.
- [ ] 4.3 Whether the lore repository's rulesets or branch protection let an Igor's App create
      and push the orphan `questions` branch. If they do not, file an issue: until then every
      citation made during a run is counted as not pushed.
- [ ] 4.4 Whether a run the provider refuses over a usage limit ever ends with its worker's
      completed report, as `task-execution` defines it, once 3.1 and 3.7 are built. Decision 19 treats a refused run with no completed report as
      flagged, so only a refused run that completes its report keeps the provider's whole
      reply. If none ever does, file an issue: no refusal record then keeps a reply, and
      nothing checks igor's limit patterns.
- [ ] 4.5 Whether a worker allowed only `Bash(igor lore-search)` can feed the command its
      standard input, through a heredoc or otherwise, in a form that keeps the text out of
      shell expansion, such as a quoted heredoc. If it cannot, give the command another
      way to take the text before any worker relies on it.
- [ ] 4.6 Once #211 specifies the handback comment, whether its posting step gives the
      Igor the questions it asked, in a form 3.9's record can keep. If it does not, file an
      issue: until then every log file holding a person's answer is refused.
- [ ] 4.7 Once 3.1 and 3.7 are built, how reliably a worker sends its whole-marked completed
      report on a run that met no question, across roles. Each run without one counts as
      flagged under decision 38. If workers often omit it, file an issue: those runs lose
      their transcripts, pull request summaries and refusal replies.
