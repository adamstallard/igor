## 1. Remove the ban from the code

- [ ] 1.1 Delete the test *offers a worker no way to search the store* from
      `test/firing.test.ts`, with its `@scenario lore-firing: No search affordance offered` tag
      if [#196](https://github.com/adamstallard/igor/pull/196) has merged
- [ ] 1.2 Rewrite the header comment of `src/firing.ts` so it no longer gives a reason for having
      no search. The worker still never has to ask: lore is injected before it runs.
- [ ] 1.3 A test that rendered lore holds every active, in-scope entry when nothing asked for it
      (*Injection does not wait on a search*)
- [ ] 1.4 Firing drops a `project:` entry when the repository of the item the run works is more
      visible than the role's source repository the scope names, taking the more private of
      two sources that share the name, and counting an unreadable visibility of the scope's
      repository as private and of the item's as public. It drops the entry before the firing
      budget is applied. One function in `src/firing.ts` decides it, and 2.10's search calls
      the same function. Tests for *A project entry about a more private repository does not
      fire* and *A project scope names the more private of two sources with its name*

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
      finds on the Igor's destination repository's `questions` branch, whatever repository their
      `repository` key names. `igor lore-search` (2.8) then drops a file more private than the
      item's repository, judging the file by the more private of its `repository` and
      `asked_from` keys, and counting a visibility it cannot read against the file. Tests
      for *A search shows a questions-branch file from any repository*, *The search command
      returns no file about a more private repository* and *A file is judged by the more
      private of its two repositories*
- [ ] 2.8 `igor lore-search`: a command offered to every worker whatever its role's
      `commands` list, reading a question's text or search terms from its standard input. The
      worker's sandbox allows it beside the role's `commands`, whatever the role's monotonic
      restrictions (role validation's monotonic check, which this task exempts it from). Under `igor serve`, at the start of each run the Igor fetches the destination
      repository's `questions` branch into a ref of its own, writing nothing to the checkout's
      working tree, and the run's searches read that ref; under `igor run` no search fetches,
      and the run reads the ref as last fetched. The command's channel is reachable by that run's
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
      comment matches the answer is checked in code by #25's reduced equality (decision 72):
      both texts are reduced as #25's rule says and must be equal, with no model call. The checks read #25's relay files from the destination repository as of the
      commit #208's lore read last applied, never a commit it refused (where #208 applied none, a relayed answer counts as
      input, decision 78), and apply #25's relay rule, under which an Igor's App is
      never a person's relay. They also apply a separate rule: during a run, a file keyed to
      another repository than the item's is input. Tests for *A question file that passes
      #25's authority checks is labelled as an answer*, *An authority check that cannot be run
      labels the file as input*, *A failing authority check labels the file as input*, *A
      linked comment is judged by #25's reduced equality, with no model*, *A recorded answer
      that is only part of its comment is input*, *An answer
      relayed by an Igor's App proves no person answered*, *An answer from a person's listed
      relay App is labelled as an answer* and *A question file keyed to another repository is
      shown as input*

- [ ] 2.10 `igor lore-search` matches, ranks and caps its results by shared-skills #25's
      filter 1 rule (*Filter 1 searches every place an answer is recorded*): plain text, no
      embedding or model, ranked by terms matched, at most 20 after every filter, saying when
      more matched. It drops a `project:` entry that 1.4's
      function keeps from firing. Tests for *The search matches terms and ranks by
      how many match*, *The search returns at most twenty results and says so*, *A filtered result takes no place among the twenty* and *A project
      entry about a more private repository is not returned*

- [ ] 2.11 Execution sets `IGOR_RUN=worker` in the environment it builds for each worker, and
      `IGOR_RUN=igor` for an inquisitor run the Igor starts itself (once 3.6 can be built).
      The value is only that word. Tests for *A worker's environment marks it as in an Igor's
      run* and, with 3.6, *The Igor's own inquisitor run is marked as in an Igor's run*

- [ ] 2.12 At startup, before discovery, the Igor refuses to start when its App's slug, read
      as *An Igor knows its own bot account* reads it, does not start with `igor-`, naming the
      slug. Tests for *An App whose slug lacks the igor- prefix refuses the start* and *An App
      whose slug starts with igor- passes the check*, and the existing tests of *An Igor knows
      its own bot account* move to an `igor-` slug
- [ ] 2.13 A seat that names no token runs no worker: execution fails naming the seat. Each
      worker run's private Claude state and its session log's collection are #174's to build,
      not this change's. A test for *A seat that names no token runs no worker*, and, once #174
      is built, for *A worker run's Claude state is private to it*

## 3. Citations made during a run

- [ ] 3.1 Define how a worker reports a citation, by the entry's id alone, in its output or
      through #175's outbox, as #175 settles. The Igor reads the citations from there and,
      only when the run publishes an artifact or ends in its handoff comment on the item, and
      the run does not count as flagged under 3.7, pushes each to the destination repository's `questions` branch, in the format shared-skills
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
      a push that was rejected because the branch moved, at most three times. Under `igor run`
      it fetches the `questions` branch only when it has a citation or questions-branch file to
      push, fetches nothing else from the destination repository, and applies nothing it fetches to
      the lore checkout. Tests for *A missing questions branch is created as an orphan*, *A
      push that loses a race is retried*, *A push that keeps losing the race is counted as
      failed*, *Under igor run, the Igor fetches the questions branch only to push* and *Under
      igor run, a run with nothing to push fetches nothing*
- [ ] 3.4 The Igor refuses a citation of an id that names no `active` entry in the run's role's
      scope, and withholds one whose item's repository is less visible than the destination
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
      as 3.1 to 3.5, and that run's filter 1 searches through `igor lore-search` (2.8). Tests
      for *The Igor's own inquisitor run searches through igor lore-search*, *A citation from the Igor's own
      inquisitor run is pushed under the same rules* and *The Igor's own inquisitor run makes
      no citation for a question with a category*

- [ ] 3.7 Define the flag a worker reports when its run met a question with a category,
      listing each category met from #25's list, each at most once, and marking those of the
      question or questions the run stopped on, on the same channel as 3.1. The Igor takes a
      value as a category only when it is exactly one of #25's three words, and writes the
      categories into the host question file of a run that stopped on a question, and nowhere
      else. For any flagged run, execution writes no
      transcript, only its outcome, cost and ledger row; `prBody` in `src/execute.ts` puts no
      excerpt of the worker's result and no transcript link in the pull request body; and the
      refusal record keeps only the refusal's reason, while any other run's refusal record
      keeps the provider's whole reply,
      redacted as #217's *Every write to the state branch, and every text the Igor posts, is redacted* requires. A run the
      provider refuses over a usage limit before
      the Igor has its worker's completed report, or that ends before it for any other reason,
      is treated as flagged, so 3.1's channel must
      carry the worker's mark that its report is whole; a report without the mark counts as
      cut short. Every worker sends the report on every run, whether or not its role runs the
      inquisitor. A flagged run's transcript path holds this line, which may not be reworded:

      ```text
      Transcript withheld: this run met, or may have met, a sensitive question. See the action log.
      ```

      Its
      ledger row keeps each denied command by name only, and its `reason` only fixed words for
      the kind of reason, such as `error`, or for a worker killed for a limit the hang's kind
      and the limit's duration, such as `silent after 10m`. Each model step igor runs after the
      worker in the same execution, such as #153's step that writes the pull request body,
      reports the flag when it meets a question with a category, always sends a completed
      report as a worker run does, and counts as one. A flagged run's handoff comment
      (`composeHandoff`, `src/handoff.ts`) states why it stopped only in the ledger row's fixed
      words, quotes no worker or provider text about why it stopped, and points to the item's
      transcript path, which holds the transcript-withheld note. A flagged run that stopped on
      a question it could not settle posts that handoff asking nothing, with the reason
      `needs a person`, and the ledger row's `reason` is `needs a person` too. It adds no
      `igor:question` label, writes a file to `flagged-questions/<tracker>/<repo>/<item>/<name>.md`
      under its state directory, mode 0600 in directories of mode 0700, recording the flag's
      categories with their marks and, for each question the run stopped on, its category or
      else its text, and listing every session log of the execution; for every create, move
      and delete under `flagged-questions`, the Igor opens each path component from the state
      directory itself down to the file, and each move's source, without following a link,
      and a link, a hard-linked file or a non-regular file makes it refuse; a refused create
      counts as a failed write, a refused move of a log copy is noted in the question file as
      a missing copy, and the path of a refused move or delete is recorded only in the Igor's own log;
      the Igor moves #174's
      redacted copy of each step's log beside the file, before writing the file. A later flagged run's
      question goes in a file of its own and starts a flagged hold of its own, and the Igor pushes nothing of the file (when the write fails, the handoff still posts,
      the ledger row's `reason` reads `needs a person, question not kept`, a notice opens on
      the first failure that stops no work and has no stored record, under a key gate two names, and the path goes only to the Igor's own log); and work triage keeps
      the item flagged-held whatever its handoff carries: each flagged run that stops on a question
      starts a flagged hold of its own, whether or not its question was kept, identified by its `needs a person` row, which names its state
      directory's opaque id; the item is flagged-held while any flagged hold has no `released` row naming it,
      read from the ledger. The flagged-hold record never expires and has one entry per flagged hold, naming
      its state-directory id, its question file's random name and its process, added before
      any file is written and added again if lost by the time its row is appended; a lost
      record is rebuilt from the `needs a person` rows, which name the id and file name; a
      file name that is not one path component of the random form is refused. A flagged hold's
      entry is cleared only once its `needs a person` row exists or its run is gone, and only
      by deleting the named file (a flagged hold whose question was not kept, by deleting its session
      logs); after a clear, the process re-reads and appends `released` naming the flagged hold, and
      any process appends a missed one. Flagged holds are released in two ways only. One is
      `igor release <tracker>/<repo>/<item>` on the host, which prints its state directory's
      id, acts for each flagged hold whose entry names that id, says where a delete is refused and
      leaves the flagged hold open, and with gate two's flags clears an entry whose named file is
      gone, appends the `released` row of a flagged hold with no entry, and deletes the item's
      files that no open entry names. With batch flags it releases only flagged holds
      that leave no question file to read: by cause, those whose named question file and
      session-log copies are all absent from the directory it runs against; by id, every entry naming a directory no live process
      answers for, which the operator states no longer exists; a flagged hold whose question file exists is released only by
      naming its item.
      The other is an attributable edit by someone with write access, never a reply: a rank or
      `igor run` that sees it appends one `release requested` row, which covers the flagged holds whose
      rows came before it; any live process on a
      directory with an uncleared entry's id, a rank at the start of its cycle or an `igor run`
      at its start, acts for that flagged hold, retrying a refused delete every cycle; no process
      deletes in another's state directory; and a stuck flagged hold (a refused delete, or an entry no live
      process answers for by #179's heartbeat, which records each process's state-directory
      id) opens a notice under its own key. Each live process compares the flagged-hold record
      with its own state directory each cycle, and any process compares it with the ledger; any
      mismatch (an entry whose named file is absent, a file no open entry names, or an open
      `needs a person` row with no entry) opens a third notice under its own key. Gate two
      merges only once #179's heartbeat records that id (decisions 131 and 138), since until
      then every requested release would be judged stuck. A run gone,
      by #179's heartbeat, before appending its row has its files deleted and its entry
      cleared by any live process on its directory, with no request and no `released` row. The three
      notices are a kind of condition of their own, with no stored record, rebuilt from the
      ledger rows and flagged-hold record entries, built against `condition-backoff`'s code on main
      (`src/conditions.ts`): each opens on its first occurrence, stops no scope, does not count
      toward stopping one, is not cleared by a probe item, clears only when no item is still
      affected, is listed with its items in the Igor's log, and is listed by `igor conditions`
      with no scope, count or probe, and each one's text names its runbook section in
      `docs/deployment.md`, whose flag names task 3.12 builds. The TLA+ model of the flagged holds and their release, in this
      change's `model/` directory, which the `tla-lore-search` workflow runs, states these
      rules as invariants; gate two's tests and code keep to them. Its property `MismatchNoticed` shows that any mismatch
      the model reaches on a directory a live process uses opens the mismatch notice, a copy
      and a crash between deleting a named file and clearing its entry included, so gate two
      builds the comparison, not a rule for each case. Once
      #188's action log is built, a
      flagged run's log keeps names only. Tests for *Transcript persisted
      off the main line*, *A run that met a categorized question stores no transcript*, *A run that
      met a categorized question publishes no excerpt of its result*, *A refusal on such a
      run keeps only its reason*, *A refusal on any other run keeps the provider's reply*,
      *The worker's report of a categorized question names
      only its category*, *A reported category reaches only the host file*, *A value outside
      #25's list is no category*, *A run stopped on two questions lists both*, *A category met
      but not stopped on is recorded unmarked*, *A step's log #174 did not copy is named as
      missing*, *A link under flagged-questions is not followed*, *A flagged-questions directory replaced by a link is refused*, *A hard-linked file under flagged-questions is refused*, *A pipe planted as the question file is refused without blocking*, *A link below flagged-questions is refused*, *A state directory replaced by a link is refused*, *A link above the state directory is followed*, *A refused move of a session-log copy leaves the question kept*, *A refusal Igor could not parse says only that the provider refused*, *A report
      the Igor cannot tell is whole counts as cut short*, *A refused run with no completed report counts as flagged*,
      *A worker run that ends without its completed report, for any reason, counts as
      flagged*, *A flagged run's ledger row keeps each denied command by name only*, *A flagged run's
      ledger row keeps only the kind of its reason*, *A flagged run killed for a limit keeps
      the limit's kind and duration*, *A model step after the worker that meets a categorized
      question flags the execution*, *A model step after the worker that sends no completed
      report flags the execution*, *A flagged run's handoff quotes no failure detail*, *A flagged
      run that declined quotes none of the worker's reason*, *A flagged run's handoff still
      names the setting that would let it proceed*, *A flagged run that stopped on a question
      posts no question* (its handoff asks nothing and gives the reason `needs a person`), *A
      flagged run that stops on a question adds no question label*, *A flagged run's question is kept on the
      host, never pushed*, *A later flagged run's question is kept beside the first*, *Outside systemd the question goes
      under the XDG state directory*,
      *A reply does not rerun a flagged item*, *An edit by someone with write access releases a
      flagged item*, *An edit without write access leaves an item flagged-held*, *A question that
      cannot be kept does not block the handoff*, *A kept question names its category, not its
      text*, *A kept question without a category holds its text*, *An id file that is a link counts as no id*, *Session-log copies carry the question file's name*, *A path component that climbs is refused*, *The question-not-kept
      condition stops no work*, *A release by an edit deletes the item's files*, *A refused delete keeps an edited item flagged-held*, *A process on the directory deletes on a release another rank saw*, *A requested release is not a release*, *A refused delete on a requested release is retried and noticed once*, *A release whose directory's ranks are all gone waits for the operator*, *A directory-mate finishes the release of a gone rank*, *The next igor run on a directory finishes its release*, *igor release drops an entry whose named file is gone*, *Two flagged holds of one item are released one at a time*, *Two flagged holds on a shared state directory have an entry each*, *A keep adds its entry before writing a file*, *A run whose entry a lost record dropped adds it again*, *A missed released row is appended by any process*, *A question file name not of the random form is refused*, *A crash after deleting the named file leaves the entry to the operator*, *An entry is not cleared while its run is part-way*, *A run gone part-way leaves nothing behind*, *A copied state directory that finds nothing releases nothing*, *A file no entry names opens the mismatch notice*, *A flagged hold with no entry opens the mismatch notice*, *A batch release leaves out a flagged hold whose question file exists*, *A batch by cause leaves out a hold whose log copies remain*, *A batch by cause acts only on its own directory*, *A later flagged hold of the same item is independent*, *igor release names the state directories still to clear*, *A lost flagged-hold record is rebuilt from the ledger*, *A stuck-release notice keeps item names off the state branch*, *Log copies from a question that was not kept are released*, `stuck-conditions`' *A notice opens on its first occurrence*, *A notice stops no scope however often it recurs*, *Repeated questions not kept do not stop the role*, *A probe does not clear a notice*, *A notice clears when no item is affected* and *A notice says it stops nothing and names no item*, *A notice names its runbook*, and `work-triage`'s *The operator releases a flagged-held item on the host*, *A refused delete keeps the item flagged-held*, *A cure key
      does not release a flagged-held item*, *A flagged-held item's lost record leaves it flagged-held*, *A released item is not flagged-held again by its old ledger row*,
      *A flagged run's budget handoff still gives the reset time*, *Any
      other run's ledger row keeps a denied command whole*, *A flagged run's action log keeps
      names only* once #188 is built, *An execution counts as flagged
      when any of its worker runs does* and, once 3.6 can be built, *The Igor's own inquisitor run that met a
      categorized question stores no transcript*
- [ ] 3.8 At each push to the `questions` branch, the Igor asks GitHub once for the destination
      repository's visibility (`private`, `internal` or `public`), counting an answer it
      cannot read as public, and the push rules use that answer, never `publicStore`. Tests
      for *The destination repository's visibility comes from GitHub, not publicStore* and *The destination
      repository's visibility is read at each push*

- [ ] 3.9 On the channel of 3.1, the worker reports each question and miss file it would put
      on the `questions` branch, and the Igor pushes it under the rules of *An Igor publishes
      the questions-branch files its worker reports*, reusing 3.3's branch creation and retries
      and 3.5's counts. The credential check calls #217's credential redaction, never a
      copy of it, so #217 merges before this is built. The Igor refuses a worker's file that
      already holds `asked_from`, and sets each file's `asked_from` key to the item's
      repository. It sets an answered log file's `authority` itself by 2.9's checks, reading
      the relay files as 2.9 does, whatever the worker wrote, and for a relay App's comment
      sets `answered_by` to the person whose relay file lists that App. It writes the linked
      comment's whole text, word for word, as quote lines, as the file's answer, never the worker's answer
      line.
      When it posts a handback comment, it
      records on `igor-state`, under the item, the hash of each question it posted there,
      reduced and hashed as shared-skills #25 does, with the comment's id and time and no
      question text. The check that an answer's question is one the Igor asked compares the
      file's question's hash with that record, never with the comment. Tests
      for each of that requirement's scenarios but two: *A worker
      reports no questions-branch file for a question with a category*, which is the inquisitor
      skill's behaviour inside the worker, as in 3.1, and *The Igor's own inquisitor run pushes its questions-branch files under the same rules*,
      which waits on 3.6; and for *A questions-branch file push needs no allow action*

- [ ] 3.10 `deploy/docker-compose.yml` sets `STATE_DIRECTORY=/var/lib/igor` on a named volume
      (decision 103), as #179's unit sets `StateDirectory=igor` under systemd, so a Docker-run
      `igor serve` keeps its question files when the container is recreated and its state
      path lies outside the workers' home, so #174's reset of that home cannot remove the
      files and a worker reading its home does not meet them;
      `docs/deployment.md`'s Docker section says so. Check, before relying on it, that the
      volume comes up writable by the image's user, which a named volume does only if the image
      creates `/var/lib/igor` for that user, and that #175's trees volume at
      `/var/lib/igor/trees` (#175's task 8.3) mounts inside it without hiding it or changing
      its owner.

- [ ] 3.11 Give the three flagged-hold conditions' keys (decisions 111, 118 and 140) a form that
      `condition-backoff`'s merged `src/conditions.ts` opens as a condition, which neither
      stops a role, as a `role:`-shaped key would, nor is ignored, as a key of an unknown
      shape is by `conditionOf`.
- [ ] 3.12 Build `igor release`'s flags with the names `docs/deployment.md`'s runbook uses
      (decision 148): `--files-gone`, `--delete-unnamed`, `--batch` and `--directory`. Where gate
      two names one otherwise, change the guide in the same pull request, so the merged guide
      always matches the code.


## 4. Facts to check before anyone relies on a search or a citation in a run

- [ ] 4.1 Whether a worker that runs the inquisitor skill reaches its filter 1 through `igor
      lore-search`. Check after [#174](https://github.com/adamstallard/igor/pull/174), which
      decides which skills a worker loads, [#175](https://github.com/adamstallard/igor/pull/175),
      which changes what the worker may touch, and shared-skills #25 have all landed. Gate two's code does not wait for this check; using
      the inquisitor during a run does, as this section's heading says.
- [ ] 4.2 Whether a worker can read the lore checkout's files directly. #175 requires only that
      it cannot write them. If it can read them, file an issue: a worker could then see entries outside its role's
      scope with no search at all.
- [ ] 4.3 Whether the destination repository's rulesets or branch protection let an Igor's App create
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
- [ ] 4.8 Once shared-skills #25's task 0.21 has run, whether GitHub reports which App wrote a
      comment. 2.9 and 3.9 ship the relay-App path but leave it off, treating every
      `User says: ` comment as input, until #25's task shows that GitHub reports the App; then a
      code change turns it on. Until then, the tests of the relay-App scenarios run the path
      against a GitHub stub that reports the App.
- [ ] 4.9 Whether shared-skills #25's credential prefixes, such as `sk-ant-`, match a seat's
      token. Decision 28 says they miss it. If they match it, the Igor still uses #217's
      matcher, which also knows credentials no prefix shows, and gate two corrects decision 28's
      reasoning in the proposal.
- [ ] 4.10 Whether the Igor's App installation can read who made each kind of edit to an item
      (its body, title, labels and assignees), as #141 reads it through GraphQL's
      `userContentEdits`, and how a non-GitHub tracker reports it. If it cannot, an edit whose author it cannot read leaves an item flagged-held
      (decision 79), and only `igor release` on the host releases it (decision 84).
- [ ] 4.11 Whether Claude Code keeps any per-user state or session under `HOME` outside
      `~/.claude` and `~/.claude.json`, which #174 resets. If it does, one run could read
      another's there despite decision 87; file an issue against #174 before relying on it.
- [ ] 4.12 How igor, a Node program, opens each path component from the state directory
      itself down to a file under `flagged-questions`, and down to a move's source, #174's
      copy, without following a link (decisions 101 and 102). A move is a rename, which opens
      nothing, so the rename must be made relative to directory handles already checked. Node's `fs` has no `openat2` and no
      directory-relative calls, and its `O_NOFOLLOW` guards only the last component; a walk
      of `lstat` then `open` races the same-user worker the rule defends against. Choose a
      mechanism that does not race, such as a native helper, or #175's `O_NOFOLLOW` with a
      check that the real path stays inside the tree, and open a file with `O_NONBLOCK` and
      check it with `fstat` before writing.

- [ ] 4.13 Where the state-directory id file lives and how it is created only once when two
      processes sharing the directory start together (decision 116), such as by an exclusive
      create, and that it survives a recreated Docker container on the named volume
      `deploy/docker-compose.yml` mounts at `/var/lib/igor` (decision 103). If two ids can be
      minted, one directory's files go unnamed in flagged-hold records, since entries name one id
      while the directory reports the other; fix the creation before relying
      on it.
## 5. Before archiving

- [ ] 5.1 Once #171 merges, and before this change archives (decision 107), rewrite the
      `task-execution` delta against #171's requirement *The worker is given an explicit
      environment holding no credential but its seat's token*: keep #171's text, rules and
      scenarios, #175's `GIT_INDEX_FILE` rule among them, add this change's `IGOR_RUN`,
      private Claude state and seat-naming-no-token rules and their four scenarios, and point
      `lore-firing`'s citation of it at the new name.
- [ ] 5.2 Before this change archives, carry the text of each change #204 archives before it
      into the requirements this change replaces whole, beyond `condition-backoff`'s, which
      `work-triage` already carries, and beyond #150's, #82's and #220's, which the next pass of
      this task checks now that #204 places them before this change: #143's `reserve` field and its merge
      rule into `role-config`'s two requirements; #179's rank-named `igor serve reviewer-1`
      into `surface-adapter`'s *An Igor that cannot act as its App does not start*; and, in
      `task-execution`, point decision 56's citation at #179's *A killed worker's failure names
      the silence it breached* and drop the `time ceiling` example. Then run #204's archive
      check with this change in its place.
- [ ] 5.3 When this change archives, point `.github/workflows/tla-lore-search.yml`'s paths
      and working directory at the model's archived place, as #179's task 6.7 does for its
      own, so TLC keeps running on it.
- [ ] 5.4 Once #82 merges, and before this change archives (decision 129), bring the
      `stuck-conditions` delta's copy of #82's *Every open condition is readable without naming
      a role* up to #82's final text, keeping the sentence and scenario on notices.
