# A search over lore may be offered, and never shows an out-of-scope entry

## Decisions

[#215](https://github.com/adamstallard/igor/issues/215) records all seventy-three decisions,
and all are Adam's. Where the agent that wrote this change fitted one of them to the spec, that
decision says so. A *consistency read*
is a check, by a fresh agent, of this change against every other spec, change and open pull
request; Adam answered the questions each read raised. He made:
- decisions 1, 2 and 7 on 2026-10-19, while reviewing
  [shared-skills #25](https://github.com/adamstallard/shared-skills/pull/25);
- decisions 3 to 6 on 2026-10-20, answering this change's first consistency read;
- the first paragraph of decision 8 on 2026-10-20, while reviewing shared-skills #25;
- the second paragraphs of decisions 3, 6 and 8, and decisions 9 to 11, on 2026-10-20,
  answering the questions that this change's second to fourth consistency reads raised;
- decision 12 on 2026-10-20. The agent that wrote this change proposed it, and Adam approved
  it without changes;
- later on 2026-10-20, after decisions 9 to 11, that a citation file takes the format
  shared-skills #25 defines (decisions 110 and 111 in #25's proposal, both Adam's). Decision 10
  now points to that format instead of stating its own;
- later again on 2026-10-20, reviewing shared-skills #25 and this change, eight answers that
  amend decisions 5 and 8 to 12:
  1. the run's id stays (10, 12); its reason, as Adam restated it later that day, is that it
     links a citation to the run's row in the execution ledger;
  2. the citation visibility rule stays, and #212 keeps the destination repository no more visible
     than any repository a role works (10);
  3. the Igor pushes the citations of an inquisitor run it starts itself (9);
  4. fire counts alone decide whether an entry is proposed as unused (5, 8);
  5. whether a worker reports through its output or #175's outbox follows #175 (Still open);
  6. a worker's report carries no category (9);
  7. this change is the one home of the Igor's push rules (9);
  8. #153 should exempt citation commits from its trailer rule (Still open);
- last on 2026-10-20, answering this change's open questions: the retry bound of three in
  decision 12, which the agent that wrote this change proposed; decisions 13 and 14; and a
  new reason for the run id in decisions 10 and 12. The reason first given, a link to the
  run's transcript, fails because a transcript is kept per item, not per run; the new reason
  is answer 1 above;
- decisions 15 to 18 on 2026-10-20, answering four questions a later consistency read
  raised;
- decisions 19 and 20 on 2026-10-20: decision 19 answers a question the next consistency
  read raised, and decision 20 settles how a worker's question and miss files reach the destination
  repository;
- decisions 21 and 22 on 2026-10-20, answering two questions this change's next consistency
  read raised, and decision 23 that day, settling whether igor offers its workers a search;
- decisions 24 to 26 on 2026-10-20, answering three questions the next consistency read
  raised, and decision 27 that day, answering the next read's one question;
- decisions 28 to 32 on 2026-10-20, answering the five questions the next read raised, and
  decision 33 that day, answering the last read's question about decision 20;
- decision 34 on 2026-10-20, in the session reviewing shared-skills #25, settling who runs
  #25's authority checks during igor's search;
- decisions 35 to 42 on 2026-10-20 and 2026-10-21, choosing among offered options for
  questions that this change's consistency reads had left open;
- decisions 43 to 45 in those same two days, in the session reviewing shared-skills #25;
- decisions 46 to 53 on 2026-10-21, when he picked options in a picker, answering this
  change's questions for him;
- decisions 54 to 61 on 2026-10-21, in a second picker, answering the eight questions this
  change then had for him;
- decision 62 on 2026-10-21, in the session reviewing shared-skills #25;
- decisions 63 to 69 on 2026-10-21, later in the session that gave decisions 54 to 61,
  answering the seven questions this change then had for him. They were first recorded as
  2026-10-20 by mistake in the brief that carried them; the coordinator of that session
  corrected the date;
- decisions 70 and 71 on 2026-10-21, answering two questions the consistency read of
  decisions 63 to 69 raised;
- decision 72 on 2026-10-21, a rule for shared-skills #25 and this change alike, given in
  the session reviewing #25;
- decision 73 on 2026-10-21, answering the question the consistency read of decisions 70 to
  72 raised.

Terms used here:
- The *destination repository* is the repository the configuration key `destination` names,
  where the lore store is kept, wherever that is. Unless `destination` names another
  repository, it is the *lore repository*, the one holding the Igor configuration, as
  [#208](https://github.com/adamstallard/igor/pull/208) and `docs/deployment.md` call it. The `questions` branch,
  `igor-state` and the relay files are in the destination repository (decision 66).
- An *Igor* is a teammate agent that runs one role. A *worker* is the agent an Igor starts to do
  one item, and *during an Igor's run* means while an agent works for an Igor under its role.
- The *inquisitor* is a shared skill (shared-skills #25) that an agent runs before asking a
  person a question. Its first filter looks for an *answer*: something already recorded that
  settles the question, so that no person need be asked.
- A *citation* is an agent's record that a lore entry answered a question.
- A question has a *category* when the inquisitor marks it sensitive: `vulnerability`,
  `secret` or `personal`. A run is *flagged* when it counts as having met such a question
  (decisions 13, 19, 22 and 38).
- *Gate one* is this specification. *Gate two* is the code, which lands on the same branch once
  Adam approves gate one.

1. **Lore still reaches the worker unbidden.** Active, in-scope entries are injected before the
   worker runs, and the worker is never required to request them.
2. **The ban on offering a search over the lore store is dropped.** The ban's only stated reason
   is that a worker needs no search. `docs/architecture.md` §3.2.1 justifies unbidden firing by
   saying that better search cannot replace it, not that search does harm; of letting a worker
   search Linear or Slack, the same section says "forbidding it buys no safety". Open pull
   request #172 rewrites that paragraph; whichever of #172 and this change merges second updates this
   quote.
3. **Scope is a hard filter on a search; status is not.** During an Igor's run, a search never
   returns an entry whose scope does not cover the run's role, nor any count or mention of one,
   because scope decides what a role may see (*Status and scope are exact filters, always
   applied*). A search may return an in-scope `provisional` or `deprecated` entry, labelled as
   not lore. Only `active` entries count as lore or as answers. Status filters firing only,
   because it is review state: an unreviewed or retired entry can still inform an agent, as long
   as nobody takes it for reviewed lore.

   A search result is not injected lore. It comes back to the agent as search output, labelled,
   and never in the trusted channel that carries injected lore. So `lore-from-corrections`'
   promise that no worker receives a `provisional` candidate until a person merges it, which is
   about injection, still holds while a search shows that candidate labelled as not lore.
4. **During an Igor's run, a search uses firing's scope rule for the run's role.** That is
   `scopeMatches` in `src/firing.ts`: `global`, `role:` naming the running role, and `project:`
   naming any repository the role works. This holds when the inquisitor skill runs inside an
   Igor, and shared-skills #25 adopts the same rule for that case (its decision 64). A search
   outside an Igor's run, such as the inquisitor in a person's own session, has no run's role to
   filter by, and this change sets no rule for it; the inquisitor's own spec, in shared-skills
   #25, does.
5. **A search hit is not a firing.** It is not recorded as one and gets no counter of its own.
   A review that proposes pruning (`docs/architecture.md` §3.4.1, still planned, with no
   thresholds) picks the entries it calls unused by fire count alone; a count of zero
   citations is never a reason to call one unused. Citations can only hold an entry back: an
   entry that an agent has cited as the answer to a question, so that no person had to be
   asked, is never proposed as unused. Whether a review proposes pruning or promotion, it shows
   each entry's citations beside its fire count, for the person who judges the proposal. An
   entry can be cited but never fire, for example while its role's in-scope entries exceed the
   firing budget.
6. **A search is a lookup over the store made to find lore or an answer for an agent.** A check
   that compares a candidate against the store to avoid a duplicate, as `lore-from-corrections`
   and `lore-from-reviews` do, is curation and not a search. It may compare against `provisional`
   entries, and against candidates a reviewer has already rejected (`lore-from-corrections` never
   proposes one of those again). Scope is a hard filter there too, by the role of the Igor running
   the check. A person reading the store, as `igor list` lets them, is not a search either:
   reviewing entries requires seeing the `provisional` ones.

   Checking that a candidate's id is free is not a duplicate check. `lore-review`'s id gate, and
   minting an id, still check against every entry and rejection in the store. During a run, a
   collision with an entry or rejected candidate outside the run's role's scope is reported only
   as "id taken", without naming what holds the id or saying whether it is an entry or a
   rejection. A rejection that records no scope counts as outside the run's role's scope, for
   the id gate and for a duplicate check alike. This rule has a limit, which nothing in this
   change closes: an id is derived from its claim, so "id taken" still tells the run that
   something outside its scope makes that claim.
7. **No carve-out for one caller.** *Rejected:* allowing only the inquisitor's search. The one
   harm a search could do is show a role entries it may not see, and decision 3 prevents that for
   every caller.
8. **A review reads an entry's citations from the destination repository's `questions` branch.** That
   branch is an orphan branch of the destination repository, separate from igor's `igor-state`, holding
   the inquisitor's questions about the organization and its projects. Shared-skills #25 moves
   those questions there (its decision 42), and writes citations there. When the inquisitor
   finds the answer to a question in a lore entry, so that nobody is asked, a citation of that
   entry goes to that branch, within the limits decisions 9 and 10 set. *Rejected:* counting
   citations in the inquisitor's per-repository question logs, which are scattered across
   repositories, some of them worked by no Igor role.

   Where the branch is missing, or holds no citation an Igor pushed (one with a run id) dated
   within the period the review covers, the review shows citations as not checked, never as
   zero, whatever the reason (decisions 32, 39 and 69). Otherwise it shows each entry's count as a lower bound, and says so beside the count. Missing from the count are the citations the Igor refused, withheld or could not push,
   every citation from a run that published neither an artifact nor a handoff (decision 9),
   and every citation from a run that counts as having met a question with a category
   (decision 26).
   Since fire counts alone decide whether an entry is proposed as unused (decision 5), a missing
   citation can only fail to hold back an entry that was in fact cited; the person reviewing the
   proposal judges that entry.
9. **During an Igor's run, the worker reports each citation, and the Igor pushes it.** The Igor
   pushes the citations to the `questions` branch, as the rest of the design has it: *worker
   edits, Igor publishes*. The worker gets no credential for the destination repository. A worker's
   report of a citation holds the cited entry's id and no category: a question with a category
   (`vulnerability`, `secret` or `personal`, as shared-skills #25's inquisitor gives one) sends
   no citation, so the worker never reports one (#25's decision 104). Because the worker's
   output is untrusted, the Igor pushes a citation only of an existing `active` entry in the
   run's role's scope. It counts every citation it does not push, by reason: refused because
   its id names no such entry, withheld by the visibility rule in decision 10, failed to push, from a run that
   published nothing, or from a flagged run (decision 26).

   The Igor pushes a run's citations only when the run publishes an artifact, or ends in the
   Igor's handoff comment on the item (`graceful-handoff`; #211 calls a handoff comment over an
   unsettled question a handback, and a handback counts the same). A run that publishes neither pushes no citations, and neither does a run that counts as
   having met a question with a category (decision 26). Pushing them is
   bookkeeping, like the firing record and the transcripts on the state branch, so the role's
   `allow` list does not govern it; `task-execution`'s *Only reversible artifacts are produced*
   says so. *Rejected:* a new `allow` action for citations.

   An Igor may also run the inquisitor itself, with no worker: under #211's decision 9, an Igor
   whose work is stopped by a question runs the inquisitor's filters. The Igor pushes a
   citation from such a run under the same rules as a worker's: only when the run publishes an
   artifact or ends in the Igor's handoff comment on the item, only of an `active` entry in the role's scope, none for a
   question with a category, and none past the visibility rule in decision 10.

   This change's requirement *An Igor publishes the citations its worker reports* is the one
   statement of these push rules. Shared-skills #25 points to it instead of restating them.
10. **A citation file takes the one format shared-skills #25 defines,** in its requirement
    *A citation file has one format* (#25's decisions 110 and 111). This change points to that
    requirement and does not state a format of its own. As #25 states it, the file holds the
    cited entry's id, the date and, for a citation an Igor pushes from a run, the run's id, with
    no text or hash of the question and no person's identity. The run's id is an opaque
    identifier that the Igor records in the run's row in the execution ledger on the state
    branch. That row is per run and holds the run's item, time and outcome, so the id links the
    citation to the run, and a review can show its item (decision 11). The run's transcript
    could not serve as that link, since there is one per item and each run overwrites it; this
    change leaves that as it is. A
    question with a category sends no citation at all (decision 9).

    No citation goes to a place more visible than the repository the question concerns, where
    private is less visible than internal and internal less than public. A citation tells its
    readers that work on that repository needed the entry, and when; the cited entry also shows
    what the question was about. This rule is Adam's, given for the inquisitor and for this
    change alike; shared-skills #25 states it for the inquisitor's citations. The Igor reads
    the destination repository's visibility from GitHub at each push (decisions 16 and 37). A destination repository
    whose visibility cannot be read counts as public, and a concerned repository whose
    visibility cannot be read counts as private. During a run, the repository the question
    concerns is the repository of the item the run works, never one the worker names.

    The state branch, `igor-state`, is a branch of the destination repository too, and its firing
    records and transcripts name each run's item. A destination repository more visible than a
    repository a role works would show those names to its readers. Adam settled that through
    #212 on 2026-10-20: Igor is to refuse to start when the team's destination repository is more
    visible than the least visible repository any role works. #212 is not yet specified. Its
    check runs only at startup, so the citation rule above still applies at each push.
11. **A forged citation is a known limit.** Item text can steer a worker, and a steered worker
    could report citations of any `active` entry in its role's scope, which would keep that
    entry from being proposed as unused. It could also report a citation for a question that has
    a category and so should send none. The Igor would push it, and the cited entry would show
    readers of the destination repository what the question was about. A review shows each citation's run and item, so the
    person reviewing a prune proposal can judge it. Prune proposals are always reviewed by a
    person, and nothing else guards against a forged citation.
12. **How the Igor dates, pushes and records citations.** Approved by Adam (2026-10-20), as
    the agent that wrote this change proposed it:
    - The citation's date is the date the Igor pushes it, since the worker's output is
      untrusted.
    - The Igor creates the `questions` branch, as an orphan, where it is missing. Shared-skills
      #25 may create it first.
    - A push rejected because the branch moved is retried on the branch's new tip, at most
      three times; a citation still not pushed then counts as failed to push. Adam approved
      the bound later on 2026-10-20.
    - The Igor records only counts, by reason, of the citations it did not push. That record
      never repeats worker text or says why a citation was refused, so it adds no mention of an
      out-of-scope entry. The run's transcript, written beside it, holds the worker's output
      and so can repeat a refused citation's id (Still open).
    - Shared-skills #25's settled format makes the run's id opaque, rather than the item's
      repository and number. A citation carries it so that it links to the run's row in the
      execution ledger, which holds the run's item, time and outcome; that is the reason Adam
      gave on 2026-10-20. He dropped the reason first approved with this decision, that an item
      reference could show a private item's repository to lore readers who cannot read it. The
      state branch is in the destination repository, and its records already name each item.

13. **A run that meets a question with a category stores no transcript.** When a worker meets
    a question in the categories `vulnerability`, `secret` or `personal`, the Igor writes no
    transcript of that run to `igor-state`. It still writes the run's record, with its outcome,
    cost, run id, item and citation counts, the firing record, and, where the provider refused
    the run, the refusal record decision 18 allows. The same holds for an inquisitor run the Igor starts itself.
    Free text cannot be redacted reliably, and personal details should not reach everyone who
    can read the destination repository, where `igor-state` lives (Adam, 2026-10-20).

    For such a run the pull request body carries no excerpt of the worker's result and no link
    to a transcript, though today's body carries up to 700 characters of it (`prBody`,
    `src/execute.ts:1169`). A record of the provider refusing the run keeps only the refusal's
    reason, never the provider's text, which today's refusal record keeps unredacted
    (`src/execute.ts:2077`). Adam extended the decision to both later on 2026-10-20.

    The Igor learns of such a question from the worker's report: a bare flag saying the run met
    one, with no category, question or answer. A citation report still carries no category
    (decision 9). The agent that wrote this change proposed the flag, and Adam approved it on
    2026-10-20. A steered worker could leave the flag out, and the transcript would then be
    stored; as with decision 11, nothing but the worker guards against that.

14. **During a run, a candidate whose id is taken out of scope is not proposed.** When
    `lore-review`'s id gate or minting reports a candidate's id only as "id taken" (decision 6),
    the agent proposing it, whichever agent runs `lore-review`'s proposing during the run,
    proposes the candidate neither under that id nor under another, and reports that
    it was not proposed. A person may propose it outside a run, where the collision is reported
    in full. A run cannot tell whether the id is held by an entry or by a rejected candidate, so
    proposing under another id could put a lesson a reviewer already rejected in front of a
    reviewer again (Adam, 2026-10-20).

15. **A search during a run may find the question and miss files on the `questions` branch.**
    The inquisitor's first filter searches them as well as lore entries. Shared-skills #25
    calls a question file a *log file*, and sets both formats in its *A log file and a miss
    file have one format*. Every file on that branch is in scope for every role whose Igor
    uses that destination repository, whichever repository its `repository` key names, for the reason
    decision 25 gives. Adam first had the key decide a file's scope,
    then replaced that rule with decision 25 (both 2026-10-20).

    The search labels a question file holding no answer, one whose frontmatter holds no
    `authority` key, as unanswered. It labels a miss file as a miss, and neither file as an
    answer. That matches #25's filter 1, which labels them so under #25's
    decision 183, item 1. Adam accepted that decision in #25, so this is an alignment with
    #25, not a new decision of his.
16. **The Igor learns the destination repository's visibility from GitHub.** One API call returns
    the exact visibility: `private`, `internal` or `public`. #212's startup check and the
    citation visibility rule in decision 10 both ask GitHub, and `publicStore` no longer
    decides it. `publicStore` says only whether the store is public, so an internal destination
    repository would read as private, and a private item's citation would go to a repository
    everyone in the enterprise can read. A destination repository whose visibility GitHub does not
    return counts as public (Adam, 2026-10-20). The push rules ask at each push (decision 37);
    this decision first had them ask once, at startup.
17. **A citation is checked against the lore store as the run read it, not at push time.**
    The check is decision 9's: that the cited entry is `active` and in the run's role's scope.
    The citation then records what the run actually used, even when #208's lore pull
    deprecates or rescopes the entry while the run is under way (Adam, 2026-10-20).
18. **A refused run that met a question with a category keeps no provider reply.** Its
    refusal record, under decision 13, keeps only the limit and reset time Igor parsed from
    the reply. Every other refused run keeps the provider's whole reply, as today: nobody yet
    knows where the provider puts its reset time, and those replies are how igor's limit
    patterns get checked. Adam accepted that runs under decision 13 add nothing to that check
    (2026-10-20). Decision 19 counts more refused runs as falling under decision 13.
19. **A refused run that ends without a completed worker report counts as flagged.** The
    worker's completed report is its report of citations and of decision 13's flag, marked by
    the worker as whole; the provider's reply naming the limit is not it, and a report the
    Igor cannot tell from a cut one counts as not completed. When the provider refuses a run
    over a usage limit and the run ends before the Igor has its worker's completed report,
    decision 13 applies to it: the Igor writes no transcript of it,
    its pull request body carries no excerpt of the worker's result and no transcript link,
    and its refusal record keeps only the limit and reset time Igor parsed. The Igor cannot
    tell whether such a run's worker met a question with a category, since the flag would
    have come in the report the run never completed. The refusal record is written from the
    provider's reply whether or not a flag arrived (`src/execute.ts:2088`), so without this
    rule such a run would keep the whole reply and its transcript.

    *Rejected:* a marker file the worker writes in the run's workspace when it meets such a
    question, which the Igor would read even from a run cut short. *Rejected:* treating such a
    run as unflagged, keeping its whole reply and transcript. Adam accepted that these runs no
    longer give the provider's whole reply for checking igor's limit patterns: only a refused
    run whose worker completed its report without the flag keeps it (Adam, 2026-10-20).
    Decision 38 extends this rule to every run that ends without its worker's completed report.
20. **The Igor pushes the question and miss files its worker reports, under the citation
    rules.** An Igor worker cannot push to the destination repository, so it cannot put the
    inquisitor's files on the `questions` branch itself: a log file for a question about an
    organization or project, including one that records an agent's own choice with
    `authority: agent`, and a miss file. The worker reports each such file on the channel it
    reports citations on, and the Igor pushes it under the same rules as a citation. It pushes
    only when the run publishes an artifact or ends in the Igor's handoff comment on the item,
    and never to a destination repository more visible than the item's repository or the repository
    the file's `repository` key names. Decision 33 dropped a third condition, that the file's `repository` key name a
    repository the run's role works. The
    worker reports no file for a question with a category, and the Igor pushes none from a
    run that counts as having met such a question under decisions 13 and 19 (Adam,
    2026-10-20). Shared-skills #25 states the worker's side.

    Two readings of the agent that wrote this change, which Adam confirmed on 2026-10-20: the
    visibility check uses both the item's repository and the one the file's `repository` key
    names, and the rule covers an inquisitor run the Igor starts itself.

    Each file takes #25's format, which follows from #25 rather than from a choice of this
    change's. The Igor refuses a file holding a credential, by the matcher decision 28 names.
    It counts each file it does not push, by reason, as it counts citations.
21. **The Igor pushes a worker's file only when it can be trusted, and never replaces one.** Of
    the questions-branch files a worker reports, the Igor pushes only an unanswered log file, a
    log file holding `authority: agent` and `answered_by: agent`, a miss file, or a log file
    holding a person's answer whose `answer_link` is a comment on the item the run works
    (decisions 24 and 30). It pushes each only at a path the `questions` branch does not already hold,
    refuses anything else, and counts each refusal by reason. Any other file claiming a
    person's answer could be forged, and filter 1 would then treat its question as settled with
    no person having reviewed it (Adam, 2026-10-20).
22. **"Run" in decisions 13 and 19 means the whole execution of an item.** An execution counts
    as flagged when any of its worker runs reported the flag, or ended before its completed
    report (decision 38). Then no worker run of it keeps a transcript, and its pull
    request carries no summary or excerpt of any of them, including the first run's summary
    that #189 would publish (Adam, 2026-10-20). #189's side is in Still open. Decision 60
    counts the model steps after the worker as part of the run.
23. **igor runs the search for its workers.** Every worker is offered `igor lore-search`, a
    command igor provides, whatever its role's `commands` list, so this change amends
    `role-config` to allow it. The worker passes it a question's text or search terms on its
    standard input. Its Igor searches its own lore checkout's entries and the
    `questions` branch's files, applying the run's role's scope, the status labels and every
    other rule a search during a run follows, and returns the results to the worker as search
    output, never in the injected-lore channel. The command is read-only, and offering it
    widens nothing the worker may run, read or write.

    The reason comes from reading the code of igor's `main`, #174 and #175, without running
    or changing anything. A worker cannot run the inquisitor's script, since its Bash is
    limited to its role's `commands` (`src/execute.ts:1607`). Under #175 it could not read the
    lore checkout either, which #175's design gives mode 0750 (task 4.2 checks). It has no
    `inquisitor.json`, the inquisitor skill's configuration file, and no `gh` login. The Igor
    already holds the checkout and the run's scope. *Rejected:* skills declaring scripts safe for a worker to
    run, with a read-only snapshot of lore handed to the worker (Adam, 2026-10-20).
24. **An answer from the run's own item is pushed as a new file.** A worker on an item handed
    back with a question, worked again after a person answered it, does hold that answer.
    The Igor pushes its log file holding `authority: decision` or `input` when the file's
    `answer_link` is a comment on the item the run works. It goes at a new path, beside the
    question's unanswered log file, which stays as it is: shared-skills #25 never changes a
    question file once pushed (its decision 140). The comment link is the proof of authority,
    and #25's filter 1 checks that the comment's author has write access. The Igor still
    refuses any other file holding a person's answer (Adam, 2026-10-20, amending decision 21).
    Decision 30 adds that the file's question must be one the Igor asked.
25. **A questions-branch file is in scope for every role whose Igor uses that destination
    repository.** A file on a destination repository's `questions` branch concerns an organization or
    project by definition, but its `repository` key names the one repository it was asked
    from. Scoping it by that key would hide an organization-wide answer from every role that
    does not work that repository, and those roles would ask again. Question and miss files in
    a repository's own `.inquisitor/questions/` are not igor's concern here (Adam, 2026-10-20,
    amending decision 15).
26. **A flagged run pushes nothing to the `questions` branch, and its unparsed refusal says
    only that the provider refused it.** A run that counts as having met a question with a
    category, by its worker's flag or by decisions 19 and 38, pushes no citation and no question or
    miss file. Where Igor read neither a limit nor a reset time from such a run's refusal, the
    refusal record says only that the provider refused the run (Adam, 2026-10-20).
27. **igor's search returns no `questions`-branch file about a more private repository.**
    `igor lore-search` returns such a file only when the repository of the item the run works
    is no more visible than the repository the file's `repository` key names, where private is
    less visible than internal and internal less than public: a file about a private
    repository never reaches a worker on a public one. A visibility it cannot read counts
    against returning the file: an unreadable item's repository counts as public, and an
    unreadable file's repository as private. Decision 25's scope otherwise stands. The harm is a worker
    reposting what it read about a private repository, not reading it, since the Igor and its
    worker may see the destination repository. A
    worker could carry what it read into a more public place, and its pull request body
    quotes up to 700 characters of its result (`prBody`, `src/execute.ts:1169`). Filtering
    what a worker is given is the only certain guard, because what a worker writes cannot be
    policed reliably. *Rejected:* checking the worker's output for copied passages before
    publishing, which catches only verbatim copies. *Rejected:* accepting the exposure as a
    known limit (Adam, 2026-10-20). The rule ranks visibility, not readership, which decision
    29 accepts as a known limit. Decision 42 judges a file by its `asked_from` key too.
28. **The Igor's credential check on questions-branch files uses #217's matcher.** It refuses
    a file in which #217's credential redaction would replace anything: the requirement
    [*Credential redaction replaces every credential the Igor knows*](https://github.com/adamstallard/igor/blob/fix-213/openspec/changes/redact-state-branch/specs/task-execution/spec.md),
    which matches every seat token the Igor has read and the values of credential-named
    variables, as well as token prefixes. One matcher then serves every write the Igor makes
    to the state branch and to the `questions` branch, and it knows the seat token, the
    model-provider credential in the worker's environment. Shared-skills #25's credential
    patterns are prefixes only and miss it. *Rejected:* #25's patterns (Adam, 2026-10-20).
    #217 has not merged (Still open).
29. **Decision 27 ranks visibility, not readership, as a known limit.** A file about private
    repository X can reach a worker on private repository Y, whose readers need not be X's.
    Adam accepted that: a team's destination repository serves one team, whose private repositories
    usually share readers, and comparing collaborator lists on each search is costly and
    brittle (Adam, 2026-10-20).
30. **An answer from the run's item is pushed only beside the question the Igor asked.** Under
    decision 24, the Igor pushes a log file holding a person's answer only when its question
    matches a question the Igor itself posted in the handback comment that the answering
    comment replies to. A steered worker could otherwise pair a real comment, by someone with
    write access, with a different question. #25's filter 1 checks that the comment holds an
    answer and that its author has write access, but not which question it answers (Adam,
    2026-10-20). Decision 41 says where the Igor finds the questions it posted.
31. **Three rules the spec already stated are Adam's.** The agent that wrote this change had
    put them in the spec with no decision behind them, and Adam adopted each one. A run reads
    the `questions` branch once, as it stands when the run starts; decision 35 says when it is
    fetched. The Igor reads the visibility of the item's
    repository, and of the repository a file's `repository` key names, when it pushes. A
    rejection records a scope only when its file holds the rejected candidate's `scope`
    (Adam, 2026-10-20).
32. **When no Igor citation reached the branch, the review shows citations as not checked.**
    People's own sessions can put citations on the `questions` branch while none from an Igor
    reaches it: every Igor push fails, for example while rulesets refuse the Igor's App (task
    4.3), every run is flagged, or every citation is withheld. Each count would then leave out
    every citation from an Igor run, so showing it as a lower bound would mislead. Where the
    branch holds no citation an Igor pushed, the review shows citations as not checked (Adam,
    2026-10-20). Decision 39 limits the test to the period the review covers. As first given,
    decision 32 showed "not checked" only when, in addition, the run records counted at least
    one citation that failed to push; decision 69 dropped that condition.
33. **Any role may push a questions-branch file, whatever repository it names.** Decision 20
    first pushed only a file whose `repository` key names a repository the run's role works.
    Adam dropped that condition: organization and project questions are shared by every role
    (decision 25), so any role may log one. Decision 27's search rule and the push visibility
    rule still apply (Adam, 2026-10-20, amending decision 20).
34. **igor's search runs #25's authority checks before it labels a file an answer.**
    Shared-skills #25 states the checks once, in its requirement *Only an answer with
    authority stops a question*, and this change points to it rather than restating them.
    `igor lore-search` runs them on an answered questions-branch file before labelling it an
    answer. Whenever a check fails or cannot be run, it shows the file as input, labelled as
    #25 labels such a file, unconfirmed. The worker cannot run the checks, since they read
    GitHub and it has no `gh` login, so the Igor does. Each read authenticates as the
    installation of the Igor's App that covers the repository that read is from, as the
    `surface-adapter` spec requires of every Igor call to GitHub. When no installation covers
    that repository, or GitHub cannot be reached, the check cannot be run and the file is
    input (Adam, 2026-10-20, in the session reviewing shared-skills #25). Decision 43 says how
    the Igor tells that a linked comment holds the answer.
35. **Under `igor serve` the `questions` branch is fetched when a run starts; under `igor
    run` it is read as last fetched.** `igor run` reads lore as it finds it and fetches
    nothing, as [#208](https://github.com/adamstallard/igor/pull/208)'s decision 28 has it,
    and it reads the `questions` branch the same way. `igor serve` fetches the branch at the
    start of each run. Either way a run reads one copy of the branch throughout, as decision
    31 says (Adam, 2026-10-20/21). The search's results also say when that copy was last
    fetched, or that it never was or could not be. That part came from #25, whose own search
    reports when each source was last fetched so that a search of a stale copy is not mistaken
    for a fresh one, and Adam confirmed it as his (decision 61). Decision 58 has `igor run`
    fetch the branch to push, never to search.
36. **A flagged run's ledger row keeps each denied command's name, without its arguments.**
    The execution ledger row records each shell command the worker's sandbox denied, so the
    operator can see what to allow in the role's `commands`. For a flagged run, that row keeps
    only the command's name, such as `gh issue comment`, without its arguments: enough to
    decide what to allow, and none of the question's text. Any other run keeps the whole
    command, as today (Adam, 2026-10-20/21).
37. **The destination repository's visibility is read at every push.** For the push rules, the Igor
    asks GitHub for it at each push, one API call per push, rather than once at startup. A
    destination repository made public while the Igor runs then gets no further citation or file of a
    more private item. This matches [#188](https://github.com/adamstallard/igor/pull/188)'s
    read of the store's visibility at each write (Adam, 2026-10-20/21, amending decision 16).
38. **A run that ends without its worker's completed report, for any reason, counts as
    flagged.** A worker run that was refused, went silent, hit the time ceiling or was
    stopped before the Igor had its completed report counts as having met a question with a
    category; decision 19 already said so for a refused run. A worker steered by text
    planted in its item could crash on purpose to get sensitive content saved. For every flagged run:
    - no transcript is written; the run's transcript path holds one line, "Transcript withheld:
      this run met, or may have met, a sensitive question. See the action log.";
    - #188's action log of the run's tool calls keeps only names: tool names, command names
      without arguments, exit codes, counts and timings, and no arguments, paths, file
      contents, messages or outputs.

    Both apply to a run that reported the flag as well (Adam, 2026-10-20/21, extending decision
    19). #188 is not merged, so this change states the
    names-only form as the rule for a flagged run's log, and #188 must carry it (Still open).
39. **"Not checked" looks at the period the review covers.** The review shows citations as
    not checked when the branch holds no citation an Igor pushed dated within the period it
    covers, where decision 32 asked whether one had ever been pushed (Adam, 2026-10-20/21,
    amending decision 32). Decision 69 dropped the test's other half, that the run records for
    the period count a citation that failed to push.
40. **An unpushed citation is counted once, under the first reason in a fixed order:** the
    run is flagged, the run published neither an artifact nor a handoff, the citation is
    refused, it is withheld by the visibility rule, or it failed to push. Adam set the order
    as flagged run, category, scope, visibility, push failure, to be fitted to the reasons the
    spec has (2026-10-20/21). The agent that wrote this change fitted it so: the spec has no
    reason of its own for a category, since the Igor cannot see one, so a category shows as a
    flagged run; scope is the refused reason; and a run that published nothing goes second,
    beside the other reason that applies to the whole run. Questions-branch files are counted
    by the same reasons, in the same order.
41. **The questions an answered file must match come from the Igor's own record.** When the
    Igor posts a handback comment, it records the questions it posted there, as
    [#140](https://github.com/adamstallard/igor/pull/140) keeps the Igor's record of what it
    asked. Decision 30's match reads that record, never the comment's current text, which
    anyone with write access to the item can edit (Adam, 2026-10-20/21). Decision 30
    had two readings by the agent that wrote this change, now dropped, which read the questions
    from the posted comment. A file's question matches a recorded one when the two are equal
    once each is reduced as #25 reduces a question for its hash, and the questions that count
    are those of handback comments the Igor posted on the item before the answering comment.
    Adam settled both of these rules in the session reviewing shared-skills #25; #25's
    decision 221 records the first. Decision 59 says where the record lives and what it holds.
42. **The Igor records where a questions-branch file came from, and the search judges the file
    by the more private of the two.** The Igor sets an `asked_from` key on each
    questions-branch file it pushes, naming the repository of the item the run works.
    `igor lore-search` treats a file as being as visible as the more private of its
    `repository` and `asked_from`. A worker on private repository X could otherwise report a
    file holding X's details keyed to public repository P, and a worker on a public item would
    then be shown it (Adam, 2026-10-20/21). Shared-skills #25, which defines the file format,
    adds the key to it in its decision 221, the same one that records decision 41's hash
    match. Under #25 only an Igor writes the key, so the Igor refuses a worker's file that
    already holds one.
43. **A linked comment's match with the recorded answer is #25's rule, judged in code.** #25
    defines the rule once, in the check that proves who wrote a file's answer, and no model
    call judges it. The Igor applies that rule (Adam, in the session reviewing shared-skills
    #25, 2026-10-20/21). As first given, the rule was that the reduced comment contains the
    file's answer line; decision 72 replaced containment with equality.
44. **Adam intends that a file keyed to another repository than the item's shows as input.**
    During a run, #25 shows a `questions`-branch file whose `repository` key names a repository
    other than the item's as input, whatever its proofs: they show who answered, not that the
    answer belongs to the item's repository. So a log file holding an answer that a run on
    repository A pushes, keyed to repository B, never counts as an answer. During a run on A it
    is input by that rule. During a run on B, its `answer_link`, a comment on A, proves no
    writer, since #25 accepts only a comment in B or in the destination repository (Adam, in the
    session reviewing shared-skills #25, 2026-10-20/21).
45. **An Igor's App never relays a person's answer.** This is shared-skills #25's decision
    216, which Adam gave in the session reviewing #25 (2026-10-21). #25's spec states the rule,
    and this change's spec points to it rather than restating it. Decision 34's checks apply
    it, so a question file whose `answer_link` is a `User says: ` comment by an Igor's App
    shows as input. Decision 62 is how a reader tells an Igor's App: its slug starts with
    `igor-`.

46. **Decision 40's fitted order stands.** Adam confirmed how the agent fitted his order to
    the spec's reasons: flagged run, published neither, refused, withheld, failed to push.
47. **A denied command's name is its first words, up to three lowercase words.** Each starts
    with a lowercase letter and holds only lowercase letters, digits and hyphens, so `gh issue
    comment 12 --body "…"` keeps `gh issue comment`. A plain-word argument can pass as part
    of the name, as `echo alice` keeps `echo alice`, and Adam accepts that.
48. **A steered worker reporting a question file about a personal or secret matter is a
    known limit.** The Igor cannot see a category, so it would push such a file for every role
    to find (decision 25). An honest worker never reports a categorized question, and #217's
    credential check still refuses a file holding a credential.
49. **An Igor's own inquisitor run searches through `igor lore-search` too.** When the Igor
    runs the inquisitor skill itself, with no worker, that run's filter 1 searches through
    `igor lore-search`, so the scope filter, decision 27's visibility filter, decision 35's
    single fetch and decision 34's authority checks apply to it as to a worker's search, and
    #25's script runs no search of its own beside it. #25's script could otherwise read every
    lore repository #25's configuration lists, and a citation from that run could carry the id
    of an entry in another store, where the same id names a different, `active` entry in the
    Igor's own.
    Through `igor lore-search` the run reads only the Igor's own store.
50. **Under `igor run`, a worker can read the whole lore checkout, and that is a limit of `igor
    run`.** #175 runs that worker as the developer's own user on their own machine, so the
    scope filter binds its searches, not its reads. `igor serve`, where #175 bars the worker
    from the checkout, is where the boundary holds. Decision 68 accepts writes too.
51. **A flagged run's ledger row keeps only the kind of its `reason`:** a fixed word igor
    sets for the kind of reason, such as `error` for a thrown error, never an error message's
    text. Its changed file paths, the actions the role refused and the role settings that
    would have permitted them stay as for any other run. Decision 56 lets the fixed words name
    a hang's kind and a limit's duration.
52. **`igor lore-search` matches plain text, as #25's filter 1 does.** It matches the query's
    terms against an entry's claim, conditions and body and a question or miss file's
    question text, with no embedding or model. It ranks results by how many terms each
    matches, returns at most 20, and says when more matched. Shared-skills #25 now states this
    rule once, for filter 1 inside and outside a run, in its requirement *Filter 1 searches
    every place an answer is recorded* (its decision 229); this change's spec points to it and
    keeps only that `igor lore-search` applies it.
53. **Decision 27's visibility filter also binds `project:` lore entries in a search.**
    `igor lore-search` returns a `project:X` entry only when the repository of the item the
    run works is no more visible than X. Decision 54 applies the same filter to firing.
54. **Firing applies decision 53's visibility filter too.** A `project:X` entry is not injected
    into a worker when the repository of the item the run works is more visible than X (Adam,
    2026-10-21). As in the search, X is the repository decision 55 names, a visibility of X the
    Igor cannot read counts as private, and one of the item's repository counts as public. This
    change modifies `lore-firing`'s *Status and scope are exact filters, always applied* for
    it. The filter applies before the firing budget, as the scope filter does, so an entry it
    keeps out neither fires nor counts toward the budget (decision 63).
55. **A `project:X` scope names the role's source repository whose short name is X.** Where two
    of the role's sources share that name, the more private is taken. The agent that wrote this
    change proposed this reading, and Adam confirmed it (2026-10-21).
56. **A flagged run's `reason` may name the kind of hang and the limit's duration.** For a
    worker killed for a limit, the fixed words of decision 51 may keep what the base
    `task-execution` spec has that reason say, such as `silent after 10m` or `time ceiling
    60m`: a fixed vocabulary plus numbers, never free text (Adam, 2026-10-21, amending
    decision 51).
57. **The Igor reads relay files from the destination repository's default branch as last fetched.**
    It never reads them from the checkout's working tree, so a worker under `igor run`, running
    as the developer's own user, cannot forge one by writing the checkout. The agent that wrote
    this change proposed this, and Adam confirmed it (2026-10-21).
58. **Under `igor run`, the Igor fetches only the `questions` branch, and only to push.** It
    fetches the destination repository's `questions` branch only when it pushes a run's citations or
    questions-branch files, to check what the branch holds and retry on its new tip, and
    applies nothing it fetches to the lore checkout. So #208's rule that `igor run` reads lore
    entries as it finds them still holds, and a search under `igor run` still fetches nothing
    (Adam, 2026-10-21, amending decision 35).
59. **The record of handback questions lives on `igor-state`, per item, as hashes.** For each
    question the Igor posts in a handback comment, decision 41's record keeps the question
    reduced and hashed as shared-skills #25 reduces and hashes a question, with the handback
    comment's id and time, and no text of the question; decision 41's match compares hashes
    (Adam, 2026-10-21). A reader of the destination repository, which holds `igor-state`, then sees no
    question's text in the record, even for a flagged run or an item more private than the
    destination repository. Decision 65 accepts that a hash can be guessed.
60. **#153's model steps after the worker are part of the run.** Decision 22's "run" means the
    whole execution, so it covers the steps
    [#153](https://github.com/adamstallard/igor/pull/153) adds after the worker, such as
    writing the pull request body. If any step meets a sensitive question, or the execution
    ends without a completed report, the whole execution is flagged (Adam, 2026-10-21). Each
    such step counts as a worker run for decisions 22 and 38, so it reports the flag and a
    completed report as a worker does (decision 64).
61. **Decision 35's last-fetched note is Adam's.** A search's results say when the `questions`
    branch was last fetched, or that it never was or could not be (Adam, confirmed
    2026-10-21).

62. **An Igor's App slug starts with `igor-`.** igor requires it: the deployment guide says
    so, and an Igor whose App's slug lacks the prefix refuses to start, naming the slug, as
    `surface-adapter`'s *An Igor that cannot act as its App does not start* refuses for its
    other startup checks. Shared-skills #25 never counts a relay-file entry whose slug starts
    with `igor-` as a relay, so an Igor's App can never count as a person's relay App
    (decision 45). It replaces the idea of listing the Igors' Apps in a `relays/_igor.yaml`
    file (Adam, 2026-10-21, in the session reviewing shared-skills #25).

63. **An entry that firing's visibility filter keeps out does not count toward the firing
    budget.** It neither fires nor counts toward the budget, 4000 tokens unless configured
    (`DEFAULT_LORE_BUDGET_TOKENS`, `src/firing.ts:17`), so the budget is judged on what can
    fire. The agent that wrote this change proposed this reading of decision 54, and Adam
    confirmed it (Adam, 2026-10-21).
64. **Each model step after the worker counts as a worker run.** Each step that #153 runs after
    the worker in an execution, such as writing the pull request body, reports the flag when it
    meets a question with a category, and sends a completed report, as a worker does. A step
    that sends no completed report flags the whole execution. The agent that wrote this change
    proposed this reading of decision 60, and Adam confirmed it (Adam, 2026-10-21). #153's side
    is in Still open.
65. **Decision 59's hashes may be guessed.** A reader of `igor-state` could learn a short or
    predictable question, such as "May I merge this?", by hashing likely questions. That
    reveals nothing the handback comment does not already show, and to an audience no wider
    than the item's (Adam, 2026-10-21). *Rejected:* a salt or a keyed hash.
66. **The `questions` branch, `igor-state` and the relay files live with the lore entries.**
    When #208's `destination` names a repository other than the one holding the Igor
    configuration, all three are in the destination repository, beside the entries (Adam,
    2026-10-21). The agent that wrote this change resolved the naming clash this raised: this
    change first called the repository the entries are read from the *lore repository*, a name
    #208 gives to the configuration's repository. It now calls it the *destination
    repository*, as `lore-store` and `lore-review` call where `destination` points, and leaves
    *lore repository* to #208. The Igor must then fetch the destination repository, which #208
    does not do (Still open, for #208).
67. **The Igor records the linked comment's text as the person's answer, never the worker's
    line.** The answer line a worker writes in a log file only identifies which comment holds
    the answer. When the Igor pushes a log file holding `authority: decision` or `input`, it
    writes under `## Answer` the text of the comment the file's `answer_link` points to, word
    for word, on one line as #25's format requires, in place of the worker's line. So a worker
    that reports "merge it." against a person's comment "Do not merge it." gets "Do not merge
    it." recorded, never "merge it." (Adam, 2026-10-21). The comment's text is kept word for
    word, a leading `User says: ` included; decision 72's match ignores that prefix when it
    reads the file back. The agent that wrote this change added that the Igor checks the file
    as pushed for credentials, since the comment's text was not in the file the worker
    reported. Decision 70 keeps the whole comment, however long.
68. **Under `igor run`, a worker can write the lore checkout, and that is an accepted limit.**
    A worker running as the developer's own user can plant an `active` entry in the checkout's
    working tree, which would fire on the next run, show in `igor lore-search` and pass the
    citation check. That is consistent with #208's decision 28, that `igor run` reads the
    checkout as it finds it, local edits included, and with decision 50: `igor run` runs on the
    developer's own trusted machine. `igor serve` is unaffected (Adam, 2026-10-21, extending
    decision 50 from reads to writes).
69. **The review shows citations as not checked whenever no Igor citation reached the branch
    in the period.** The reason does not matter: a failed push, flagged runs, withheld
    citations, or anything else. Under decisions 32 and 39 as first given, "not checked" also needed a
    citation that failed to push. While every run is flagged, or every citation withheld, no
    push fails, so that rule never applied, and the review would have shown people's citations
    alone as a lower bound, hiding that no Igor citation arrived (Adam, 2026-10-21, amending decisions 32 and 39, which
    now state the rule).
70. **A long answer is recorded whole.** Under decision 67, the person's whole comment is the
    record, even when it holds several sentences or quotes the question before answering it.
    Trimming it to one sentence would mean choosing which part is the answer, which brings back
    the risk decision 67 removed (Adam, 2026-10-21). Shared-skills #25's log format must allow a
    multi-sentence answer (Still open, for #25).
71. **A flagged run's handoff comment uses fixed words only.** When a flagged run hands off,
    `graceful-handoff`'s comment on the item states why it stopped only in the fixed words its
    ledger row's `reason` keeps (decisions 51 and 56), quotes no failure detail, and points to
    the item's transcript path on the state branch instead. Today that comment quotes a
    failure's detail (`src/handoff.ts:316`) and, for a run that declined, the worker's own
    account of why (`src/handoff.ts:310-313`, from `declineReason` at `src/loop.ts:510`),
    either of which could repeat what a sensitive question brought into the run (Adam,
    2026-10-21). The agent that wrote this change fitted the rule: facts igor records itself,
    such as a budget's reset time or which setting would let the run proceed, still appear,
    since the run did not produce them. The transcript path is the item's, as there is one
    transcript per item, and for a flagged run it holds the transcript-withheld note. This change modifies `graceful-handoff`'s *A
    handoff states what was done, what remains, and who could continue* for it, with four new
    scenarios. [#179](https://github.com/adamstallard/igor/pull/179) and
    [#143](https://github.com/adamstallard/igor/pull/143) modify other `graceful-handoff`
    requirements, so their deltas and this one do not overlap.
72. **A logged answer is confirmed only when the linked comment equals it.** Writers record the
    comment's own text word for word: the Igor, #25's inquisitor script and #25's answer
    session, the tool in which a person answers logged questions, alike. A reader confirms a logged answer only when the comment its `answer_link`
    points to, reduced, equals the recorded answer, reduced the same way. Reduced means no list
    markers or inline markup, each run of whitespace joined to one space, a leading
    `User says: ` ignored, and a trailing `Re: <URL>` line ignored. Containment is dropped
    entirely, and a worker's answer line only identifies the comment. This is #25's rule,
    decided by Adam on 2026-10-21 for both repositories; this change points to it and applies
    it in `igor lore-search`'s authority checks.
73. **A flagged run's handback posts no question.** A handback is a handoff that asks a person
    the question a run could not settle. When a flagged run stops on such a question, it posts
    decision 71's fixed-words handoff instead, which says the run needs a person, and asks
    nothing; whoever picks up the item reruns it or looks into it, though what they can learn
    there is open (*Still open*, question 3 of the read of decision 73). The run's
    question text never reaches the item, since it is text the run produced and could reveal
    the sensitive matter that flagged the run. The agent that wrote this change gave the
    reason such a run stopped, a question it could not settle, the fixed words `needs a person`, in the ledger row's `reason` and in the
    handoff. Because no handback is posted, the Igor records
    no handback question for the run (Adam, 2026-10-21). This change's `graceful-handoff` delta
    says so, and `lore-firing`'s *An Igor publishes the questions-branch files its worker
    reports* points to it, each with one new scenario.


**Alignments with shared-skills #25.** These follow from Adam's decisions above and #25's
decisions 216, 221, 225 and 229 (#25 at 08951b7), and add no decision:
- **The Igor decides a pushed answer's `authority` itself.** #25's decision 216 counts a
  `User says: ` comment as a person's answer only when that person's relay App posted it, as
  listed in that person's relay file on the destination repository's default branch. That file is
  `relays/<login>.yaml`, and #25's decision 225 counts it only when its last change came from
  that person: a merged pull request they authored, or a commit GitHub verifies as theirs.
  This change points to #25's rules for both. A worker may not be able to read relay
  files: #175's design bars it from the lore checkout under `igor serve` (task 4.2). It then
  cannot tell whose answer such a comment is. Since decision 34 has the Igor run #25's
  authority checks, the Igor sets the `authority` of each answered log file it pushes
  (decisions 24 and 41) by those checks, to `decision` or `input`, whatever the worker
  wrote, and its search reads the relay files from its checkout's default branch as
  last fetched for those checks (decision 57). For a relay App's comment, the Igor also sets
  the file's `answered_by` to the person whose relay file lists that App, since #25 now gives
  the Igor both keys.
- **The spec points to #25's decision 216** for which comments count as a person's relayed
  answer, instead of stating that rule.
- **The Igor refuses a worker's file that already holds `asked_from`**, since #25's format
  now has the key, written only by an Igor (decision 42).
- **igor marks a run so #25's script can tell it is in one.** The Igor sets `IGOR_RUN` to
  `worker` in a worker's environment and to `igor` in its own inquisitor run's. The variable
  carries no secret. #25's script is to read it, once #25 adopts the name (its task 0.9 still
  waits for igor's signal), and then read no lore clone, push nothing itself and search
  through `igor lore-search` (#25's decision 229). `task-execution`'s *The worker
  is given an explicit environment holding no credential but its seat's* says so.
- **Search ranking and its cap of 20 point to #25's filter 1 rule** (decision 52 above).

**Still open:**
- **For [#208](https://github.com/adamstallard/igor/pull/208): the Igor must fetch the
  destination repository.** Under decision 66 the `questions` branch, `igor-state` and the
  relay files are in the destination repository, which `destination` can point away from #208's
  lore repository. #208 fetches only its lore repository, so where the two differ, relay files
  would never update and the `questions` branch would never be fetched. #208 should fetch the
  destination repository too; this change does not edit it. This change's `surface-adapter`
  delta has the startup check require the App on the destination repository as well.
- **Which ref the Igor reads relay files from under #208.** Decision 57 has it read them from
  the default branch as last fetched. Under #208, `igor serve` fetches into a ref of its own
  and leaves the checkout's remote-tracking branch alone, so that branch could be stale. #208's
  ref can also hold a commit whose lore #208 refused to apply. Gate two names the ref, beside
  the `questions` branch's ref; whether a refused commit's relay files may count is open.
- Whether an Igor's worker that runs the inquisitor skill reaches its filter 1 through `igor
  lore-search`. Open pull request [#174](https://github.com/adamstallard/igor/pull/174)
  decides which skills a worker loads, and shared-skills #25 is to have filter 1 call `igor
  lore-search` inside an Igor's worker. Task 4.1 checks once both have landed.
- Whether a worker under `igor serve` can read the lore checkout's files directly. If it can,
  it can see entries outside its role's scope without any search, and the filter above does
  not stop that. Under `igor run` it can, which decision 50 accepts. #175's requirements say
  only that the worker cannot write the checkout, though #175's design makes the checkout
  unreadable to the worker under `igor serve`; task 4.2 checks which holds. If the design
  holds, a worker there searches only through `igor lore-search` (decision 23).
- Shared-skills #25 carries the firing scope rule inside an Igor (decision 4), the `questions`
  branch and citations (decision 8), and has not merged. Until it merges, nobody should rely on
  the inquisitor's search during a run, and task 4.1 checks that a worker's filter 1 reaches
  `igor lore-search` before anyone does. Citations made outside a run are not written until then, so a review's
  count misses them.
- The citation-file format is defined only in shared-skills #25, in its requirement *A
  citation file has one format*, and #25 has not merged. This change's requirement *An Igor
  publishes the citations its worker reports* links to it on #25's branch. Until #25 merges,
  gate two builds the format as #25's branch states it, and follows any change #25 makes to it.
  Archive this change only after #25 merges, and then point the link at the requirement in
  shared-skills' `openspec/specs/inquisitor/spec.md`.
- Whether a worker reports its citations in its output or through
  [#175](https://github.com/adamstallard/igor/pull/175)'s outbox follows whatever #175
  settles (Adam, 2026-10-20). Task 3.1 builds the report on that channel.
- How an Igor runs the inquisitor skill itself, with no worker (decision 9), and where that
  run's transcript and count record go. #211 gives the Igor that job and specifies no
  mechanism yet. Task 3.6 waits on it.
- The review's rules in decisions 5, 8, 32, 39 and 69 (fire counts alone decide "unused", a cited
  entry is never proposed as unused, "not checked" and the lower bound) live only in this proposal and
  `docs/architecture.md` §3.4.1, since the review is planned and has no spec. No change
  specifies the review yet; whichever does must carry them as requirements.
- This change depends on [#188](https://github.com/adamstallard/igor/pull/188) for decision
  38's names-only log. #188 keeps a log of each run's tool calls beside the transcript,
  redacting only credentials, and has not merged. This change states, in `task-execution`'s
  *Transcripts and outcomes are captured to the state branch*, the names-only form a flagged
  run's log takes; #188 must carry that rule, and whichever merges second reconciles the two
  texts. Until #188 is built, there is no action log for a flagged run's transcript note to
  point to.
- [#190](https://github.com/adamstallard/igor/pull/190) defines the pull request body as the
  one statement of it: the worker's summary, at most 700 characters, a pointer to the
  transcript where the summary was cut, and the worker's commands. #190 has no exception for a
  run under decision 13, whose body holds no excerpt of the worker's result and no transcript
  link.
  [#153](https://github.com/adamstallard/igor/pull/153) has a model write the body. Whether
  those changes carry decision 13's exception, and leave the commands and a model-written body
  free of that run's text, is theirs; this change does not edit them.
- `lore-review`'s *A public destination refuses privately-sourced entries* is built to
  take the destination repository's visibility from `publicStore` when it is set
  (`src/propose.ts:297`). Decision 16 covers #212's check and the push rules only. The two
  can disagree on an internal destination repository: with `publicStore: false`, `lore-review`
  treats it as not public and lets a privately-sourced entry into it, while the citation rule
  withholds a private item's citation from it. Whether `lore-review` should ask GitHub too is
  for a change to `lore-review`; this change does not edit it.
- #212's issue body records decision 16 for its startup check. #212 has no change yet; the
  change that specifies it must read the destination repository's visibility as decision 16 says.
  This change's requirements bind only the push rules, which read it at each push (decision
  37).
- Whether a run the provider refuses over a usage limit ever ends with its worker's
  completed report. If none does, decision 19 counts every refused run as flagged, no
  refusal record keeps the provider's reply, and igor's limit patterns have nothing to check
  them. Task 4.4 checks.
- [#217](https://github.com/adamstallard/igor/pull/217) redacts credentials from every write
  to the state branch, including refusal records. This change keeps a refused run's whole
  reply subject to that redaction; whichever of #217 and this change merges second reconciles
  the two texts.
- This change depends on #217, which has not merged: decision 28's credential check on
  questions-branch files uses #217's matcher, and the requirement *An Igor publishes the
  questions-branch files its worker reports* links to it on #217's branch. Gate two builds
  that check on #217's matcher, so #217 merges first. Then point the link at the requirement
  in `openspec/specs/task-execution/spec.md`.
- The transport `igor lore-search` uses to reach its Igor is gate two's, bound by the rules
  that only the run's worker reaches it and that it widens nothing (task 2.8). So is the ref
  the Igor fetches the `questions` branch into under `igor serve`, and that `igor run` reads
  (decision 35):
  [#208](https://github.com/adamstallard/igor/pull/208) fetches only its lore repository's
  default branch, into a ref and a worktree per process, so the `questions` branch needs a ref
  of its own beside them.
- For [#208](https://github.com/adamstallard/igor/pull/208): its decision 28 says `igor run`
  never fetches lore. Under decision 58 an `igor run` that pushes citations or questions-branch
  files fetches the destination repository's `questions` branch, and nothing else, and applies
  nothing to the lore checkout, so #208's rule for lore entries still holds. #208's text
  should say that it covers lore entries, not the `questions` branch; this change does not
  edit it.
- The spec restates #25's rule that, during a run, a file keyed to another repository than
  the item's shows as input (decision 44). #25's spec states it, so this change's next round
  should replace the restatement with a pointer.
- #25 counts no comment as a relayed answer until its task 0.21 shows that GitHub reports
  which App wrote a comment. Until then the Igor sets `input` on every file whose answer is a
  `User says: ` comment, and its search shows such a file as input. Task 4.8 checks.
- What an `igor serve` run reads after its fetch of the `questions` branch fails at the start
  of the run: the copy last fetched, or nothing. The results say the fetch failed either way,
  and no scenario covers that case yet.
- [#140](https://github.com/adamstallard/igor/pull/140) and this change each define an Igor's
  record of the questions it posted, with the same rule that the record, never the posted
  text, decides. This change's record keeps hashes on `igor-state`, never text (decision 59). One should own the record and the other point to it; whichever merges second
  does that.
- Two cases have no scenario yet, for the next round of this change to add. `lore-review`'s rule
  that, during a run, a collision outside the role's scope is reported only as "id taken" also
  holds where the lore checkout already holds an entry or rejection of the same name; no
  scenario tests that case. Nor does a questions-branch scenario test the `repository` key's
  visibility changing between the run's start and the push.
- Whether a worker allowed only `Bash(igor lore-search)` can feed the command its standard
  input, since a pipe from `echo` needs `echo` allowed (`src/execute.ts:1607`). Task 4.5
  checks; if it cannot, gate two gives the command another way to take the text before any
  worker relies on it.
- [#189](https://github.com/adamstallard/igor/pull/189) starts two worker runs in one
  execution, and when the second is killed for a limit before reporting, it publishes the
  first run's summary. Under decision 22 such an execution counts as flagged, and its pull
  request carries no summary of either run. #189 has no such exception. #189's execution row
  also holds each worker run's transcript, which decision 22 withholds for a flagged
  execution. Both are #189's to change, and this change does not edit it.
- [#153](https://github.com/adamstallard/igor/pull/153) and
  [#143](https://github.com/adamstallard/igor/pull/143) also modify `role-config`'s *A role
  declares its sources, lane, behaviour, permissions, and reviewers*, and they and the open
  change `lore-from-corrections` modify *Merge semantics differ by field kind*. Whichever of
  them and this change merges later carries this change's `igor lore-search` exception into
  its text.
- This change defines a *handback comment* as the Igor's handoff comment when it asks a
  question the run could not settle. Decision 41 needs the Igor's record of the questions it
  posted in each one. `graceful-handoff`'s handoff comment holds no question today, and #211,
  which has the Igor ask in it, specifies neither the comment's format nor that record. Task
  4.6 checks once #211 is specified; until the record exists, every log file holding a
  person's answer is refused.
- Once #211's inquisitor role posts an answer given in chat onto the item as a comment by its
  App, decision 24 would accept that comment as proof. Since an Igor's App relays no one's
  answer (decision 45), the Igor sets such a file's `authority` to `input` when it pushes it,
  as shared-skills #25 keeps a chat answer as input. Whether to refuse the push instead is a
  question for Adam once #211 specifies the role.
- The text a worker pipes to `igor lore-search` is untrusted and can quote item text. Nothing
  yet requires that the permitted way of feeding standard input keeps that text out of shell
  expansion, such as `$(…)` in an unquoted heredoc. Task 4.5 checks this too.
- For [#179](https://github.com/adamstallard/igor/pull/179) and gate two: decision 34's
  authority checks spend the Igor's App installation's GitHub rate limit, which claiming and
  #179's heartbeats also use. A worker steered by item text could exhaust it by calling `igor
  lore-search` in a loop, since nothing caps or caches the checks' reads. #179 runs several
  Igor processes, each a *rank*, and stops every one of them when their heartbeats to GitHub
  fail. Whether to cap the reads, cache them or accept the limit is open.
- A run whose worker never sends a completed report. Decision 38 makes
  every run that ends without one flagged. Nothing yet makes every worker send one on every
  run, including a role whose worker never runs the inquisitor; if one does not, every run of
  that role is flagged, and loses its transcript, its pull request summary and its refusal
  record's reply. Task 3.1 has every worker send the report, and task 4.7 checks how reliably
  workers send it.
- [#179](https://github.com/adamstallard/igor/pull/179) removes the worker's absolute time
  ceiling, which decision 38 names among the ways a run can end without its report. Once #179
  lands, that case is gone; the rest of the rule is unchanged.
- [#188](https://github.com/adamstallard/igor/pull/188) sets how much its log keeps by a
  *tier* chosen from the visibility of the store and the worked repository. Its `tools-only`
  tier, for a public store and a private repository, keeps no command, while decision 38's
  names-only form keeps a command's name. The spec keeps a flagged run's log within #188's
  tier, so under `tools-only` the log keeps no command names at all.
- [#153](https://github.com/adamstallard/igor/pull/153)'s *The code verifies text before it
  publishes it* refuses, for a role that lists `prose`, model-written text that does not pass
  `prose verify-post`. A question or miss file is model-written text the Igor publishes, so
  under #153 a prose role's Igor would push none. Whether #153 exempts them is #153's to settle.
- For [#153](https://github.com/adamstallard/igor/pull/153): under decisions 60 and 64, its model
  steps after the worker, such as writing the pull request body, are part of the run.
  `task-execution` here counts each as a worker run, so each must report the flag when it
  meets a question with a category, and send a completed report; a step that sends none flags
  the whole execution. #153 does not yet give its steps either, so as #153 stands every
  execution with those steps would be flagged. That is #153's to add; this change does not
  edit it.
- [#212](https://github.com/adamstallard/igor/issues/212)'s body says this change's citation rule uses
  its startup read of the destination repository's visibility. Under decision 37 the push rules read it
  at each push; #212's body should say so.
- `lore-firing`'s *An entry arrives with what a reader needs to judge it* uses "citations" for an
  entry's provenance, while this change uses it for a record that an entry answered a question.
  One of the two should be renamed.
- `lore-firing`'s *Injected lore is trusted; the work item is not* says lore goes in the trusted
  channel, while a search result marked as lore does not. That requirement should say
  *injected* lore.
- Decision 13's refusal record keeps "only the refusal's reason", and no scenario says whether
  the record's other fields, such as its item and time, are kept.
- `work-discovery`'s *State lives on an orphan branch of the destination* puts every execution's
  transcript on the state branch; this change writes none for a flagged run and does not
  modify that requirement. This change's next round should add a modified delta for it.
- Decision 21 counts each refusal by reason, while the spec counts every refused
  questions-branch file under one "refused" reason, as it counts citations. Whether to split
  the count by format, credential, path and unasked question is open.
- [#179](https://github.com/adamstallard/igor/pull/179) gives each `igor run` process a *run
  id*, which it puts in the names of the worktrees that process creates, while this change's
  run id names one execution of an item. The two could be confused, so one of the two should
  be renamed. This change does
  not edit #179.
- A worker's report of a citation for a question with a category is the worker's to withhold;
  the Igor cannot see a category, so a worker that reports one anyway gets it pushed (decision
  11).
- [#153](https://github.com/adamstallard/igor/pull/153) (`signed-publishing`) requires skill
  trailers on every commit an Igor makes for a role that lists those skills. A citation commit
  is a machine record with no trailer (shared-skills #25's decisions 90 and 110). Adam decided
  on 2026-10-20 that #153 should exempt citation commits; that is #153's to settle, and its
  body says this change and #25 need the exemption. Under decision 20 the Igor also commits
  question and miss files to the `questions` branch with no trailer, which #153's exemption
  does not yet name.
- [#171](https://github.com/adamstallard/igor/pull/171) renames *The worker is given an
  explicit environment holding no credential but its seat's*, which the citation requirement
  cites, by adding "token" to its end. Whichever of #171 and this change merges second updates
  the citation requirement to the new name. This change's `task-execution` delta also modifies
  that requirement, to add `IGOR_RUN`, under its current name; whichever merges second carries
  both changes. [#175](https://github.com/adamstallard/igor/pull/175) modifies the same
  requirement too, adding `GIT_INDEX_FILE`; each delta replaces the requirement whole, so
  whichever of #175 and this change merges second carries the other's text.
- Shared-skills #25 at 08951b7 does not yet name `IGOR_RUN`: its task 0.9 still waits for a
  signal from igor. Until #25's script reads `IGOR_RUN`, the marker this change sets has no
  reader, and #25's fallback (a session with no person in it reads no lore clone and pushes no
  citation) holds.
- [#179](https://github.com/adamstallard/igor/pull/179) also modifies `surface-adapter`'s *An
  Igor that cannot act as its App does not start*, which this change modifies for decision
  62's `igor-` check. Each delta replaces the requirement whole, so whichever merges second
  carries the other's text.
- [#179](https://github.com/adamstallard/igor/pull/179) removes `task-execution`'s *A killed
  worker's failure names the limit it breached*, which decision 56's rule cites, and replaces
  it with *A killed worker's failure names the silence it breached*, with no ceiling case.
  Whichever of #179 and this change merges second points the citation at the new requirement
  and drops the `time ceiling` example.
- The run's transcript holds the worker's output, so it can repeat the id of a citation the
  Igor refused, and #188's log of the worker's tool calls might too. Neither is the count
  record that decision 12 keeps free of worker text. This change does not keep refused ids out
  of either; whether to is open, and the log's part is
  [#188](https://github.com/adamstallard/igor/pull/188)'s.
- `lore-from-corrections` adds provenance to an existing entry when a correction restates its
  rule, rather than proposing a duplicate. Under decision 6, a duplicate check during a run
  cannot see an entry outside the run's role's scope, so a correction restating such an entry's
  rule would be proposed as a new entry. That change may want to narrow its scenario; this
  change does not edit it.
- `lore-from-corrections` never proposes a candidate a reviewer has already rejected. Under
  decision 6, a duplicate check during a run cannot see a rejection outside the run's role's
  scope, or one that records no scope, so a correction restating that candidate would be
  proposed again, for a reviewer to reject again. That change may want to say so; this change
  does not edit it.
- `lore-from-corrections` says no worker *receives* a `provisional` candidate until a person
  merges it, and that nothing it proposes *reaches* a worker unreviewed. Decision 3 reads that
  promise as being about injection. That change may want to narrow its wording to say so; this
  change does not edit it.
- Whether the destination repository's rulesets or branch protection let an Igor's App create and push
  the orphan `questions` branch. `surface-adapter` requires the App to hold Contents
  write on #208's lore repository, which is the destination repository unless `destination`
  names another (see the item for #208 above). Task 4.3 checks. Until the App can, every citation the Igor tries to
  push is counted as not pushed, and the branch holds none, so a review reports citations as
  not checked.
- **Found by the consistency read of decisions 46 to 53, for the author's next round:** `role-config` still calls `commands` "the
  only thing" that lets a worker run anything, beside the `igor lore-search` exception; the
  proposal calls the `repository` key where a question was asked from, while #25 has it name
  the repository the question concerns; the visibility rule and the `owner/repo` guard are
  stated both here and in #25; the item's repository, on which the visibility rules hinge, is
  defined nowhere for a non-GitHub tracker; #25's `sk-ant-` prefix may in fact match the seat
  token, which decision 28's reasoning and one scenario say it misses.
- **Found by the consistency read of the #25 alignment, for later rounds.** Nothing says
  `igor lore-search` exits with an error on empty input, which #25 relies on; the spec's
  definition of a miss file is narrower than #25's and should point to it; no scenario covers
  a failed fetch, how the push-side checks authenticate, or a flagged run under #188's
  `tools-only` tier; the spec never defines a *flagged* run; *Status and scope are exact
  filters, always applied* states no scope rule, which only `scopeMatches` holds; some
  requirements still carry rationale.
- **Found by the consistency reads of decisions 54 to 61,** for the author's next round, or
  for other changes. Decisions 67, 68 and 69 settled the three questions they raised for Adam.
  - `IGOR_RUN` shares a prefix with #171's `IGOR_RUN_TOKEN`, a seat token. One could be
    renamed so that no prefix match or reader confuses a marker with a secret.
  - #25's format allows `asked_from` only in a file an Igor pushes for its worker, while this
    change sets it on files from the Igor's own inquisitor run too. #25 or this change should
    align.
  - *Status and scope are exact filters, always applied* and *An Igor runs its worker's lore
    searches* each state the visibility order and the rule for an unreadable visibility,
    beside the citation requirement; `task-execution` restates #188's tier rule. One place
    should state each, and the others point to it.
  - The transcript-withheld note points to an action log, which no run keeps until #188 is
    built.
  - Whether #25's credential prefixes match the seat token is unmeasured; task 4.9 checks.
- **Found by the consistency read of decision 73.** Its other findings are fixed in the spec;
  these three are possible questions for Adam:
  1. *directed-interaction asks a stuck run to say what it needs.* The open change
     `directed-interaction` says that where an item cannot be acted on as written, an Igor
     "SHALL say what it needs rather than choose an interpretation", and its scenario has the
     message on the item say "what would let it proceed". Decision 73 has a flagged run say
     only `needs a person`. Neither names the other as an exception; if decision 73 stands,
     `directed-interaction` needs a pointer to it.
  2. *#211's inquisitor role never sees a flagged run's question.* #211's decisions 7, 9 and 10
     have the handback comment carry the prepared question to the inquisitor role, with a
     label such as `igor:question`. Under decision 73 a flagged run's question never reaches
     the item, so it never reaches that role, and nothing says whether the label is still
     added. #211's body does not know about decision 73.
  3. *Nobody can learn the question.* The transcript path holds only the withheld note, and
     the action log keeps names only and does not exist until #188. A person's reply lifts
     the hand-back suppression (`work-triage`'s *A reply lifts the suppression*), so a rerun
     can meet the same question, flag again and post the same handoff. Whether the question
     should go somewhere private, or the item be released without a handoff, is not
     decided.
- **For shared-skills #25, from the consistency read of decisions 63 to 69.** Decisions 70 and
  71 settled the two questions it raised for Adam. Two items remain for #25:
  - its log format holds "the answer in one sentence under `## Answer`", while decision 70
    records a person's whole comment, which can hold several sentences. #25's format must
    allow a multi-sentence answer;
  - its spec puts a person's relay file beside igor's configuration, while decision 66 puts
    relay files in the destination repository, beside the entries. #25 should align with
    decision 66.
## Why

The requirement *Lore reaches the worker unbidden* forbids offering a worker a search over the
store, because a worker needs no search: anything it would think to look up is reachable by
reading the codebase. Two cases contradict that:

- **Firing does not always deliver every entry.** When the in-scope entries exceed the token
  budget, none are injected (*Exceeding the budget is reported, never silently resolved*), and
  the relevance mechanism that the budget requirement anticipates would inject only some. A
  search lets a worker find a recorded answer that was not injected.
- **The inquisitor searches lore before an agent asks a person anything.** The shared
  `inquisitor` skill (shared-skills #25) runs filters before an agent asks a question, and the
  first looks for an answer already recorded, in lore among other places.
  [#211](https://github.com/adamstallard/igor/issues/211)'s decision 9 has an Igor run those
  filters when a question it cannot settle stops its work, so an Igor would search lore before
  asking anyone. That search avoids interrupting a person; it is not looking up how to do the
  work, which is all the ban's reason speaks to.

## What Changes

- `lore-firing`'s *Lore reaches the worker unbidden* keeps injection, now saying it happens
  whenever the entries fit the firing budget, and replaces the ban on a search with igor's
  search, which every worker is offered.
- *Lore reaches the worker unbidden* also defines a search, a search during a run, and when a scope covers a role.
  It holds a search during a run to firing's scope rule for lore entries, puts every
  file on the Igor's destination repository's `questions` branch in scope, lets it return in-scope entries that
  are not `active` with a label, keeps its results out of the injected-lore channel and out of
  the firing record, and says what a duplicate check may compare against.
- The scenario *No search affordance offered* is removed. Seven are added: *Injection does not
  wait on a search*, *A search never shows an out-of-scope entry*, *A search shows a
  questions-branch file from any repository*, *A search labels in-scope
  entries that are not active*, *Search results never arrive as injected lore*, *A search hit
  is not a firing*, and *A duplicate check is curation, not a search*.
- A new `lore-firing` requirement, *An Igor publishes the citations its worker reports*, says
  who writes a citation during a run, including one from an inquisitor run the Igor starts
  itself, which citations the Igor accepts, what the file holds, where it may go, and that a
  citation it refuses, withholds or cannot push is counted, under one reason in a fixed order.
  It has the Igor read the destination repository's visibility from GitHub at each push. It is the
  one statement of the
  Igor's push rules, which shared-skills #25 points to. It sits in
  `lore-firing` beside *What fired is recorded on the state branch*, the other record of an
  entry's use. For the file's format, it points to shared-skills #25's *A citation file has one
  format* instead of stating its own. Under `igor run` the Igor fetches the `questions`
  branch only to push (decision 58). It has twenty-four scenarios.
- A second new `lore-firing` requirement, *An Igor publishes the questions-branch files its
  worker reports*, has the Igor push a worker's question and miss files under the citation
  rules, refusing a file that claims a person's answer to a question the Igor's own record
  says it did not ask, replaces one on the branch, or holds a credential by #217's matcher.
  The Igor sets each file's `asked_from` key to the item's repository, refusing a worker's
  file that already holds one, and sets an answered file's `authority` itself by #25's checks.
  It records the questions of each handback comment on `igor-state` as hashes, with no text.
  The Igor sets a relay App's answer's `answered_by` as well as its `authority`, and records
  the linked comment's whole text, never the worker's line, as the answer. It has twenty-nine
  scenarios (decisions 20, 21, 24, 28, 30, 33, 34, 41, 42, 45, 59 and 67, and the alignments
  with #25).
- A third new `lore-firing` requirement, *An Igor runs its worker's lore searches*, specifies
  `igor lore-search`: it reads a question's text or terms on its standard input, the Igor runs
  it for the role of the run whose channel carried it, every worker has it without its role
  listing it and no role can remove it, it returns no `questions`-branch file about a more
  private repository than the item's, judging a file by the more private of its `repository`
  and `asked_from` and by visibility alone, and it is read-only. Under `igor serve` the Igor
  fetches the `questions` branch when a run starts; `igor run` reads it as last fetched. The
  command labels each question and miss file it returns as #25's filter 1 does, labelling a
  question file that holds no answer as unanswered. The Igor runs #25's authority checks
  before it labels a file an answer, and shows the file as input, labelled as unconfirmed,
  when a check fails or cannot be run, judging a linked comment by #25's reduced equality
  with no model call (decision 72), and reading the relay files for #25's relay rule. It matches,
  ranks and caps results by #25's filter 1 rule, filters `project:` entries by visibility, and
  serves the Igor's own
  inquisitor run too. The requirement has thirty-two scenarios (decisions 15, 23, 27, 29, 31,
  34, 35, 42, 43, 44, 45, 49, 52, 53 and 72).
- `lore-firing`'s *Status and scope are exact filters, always applied* keeps a `project:`
  entry from firing into a run whose item's repository is more visible than the repository
  the scope names, and says which repository that is, with four new scenarios (decisions 54
  and 55). The search's filter of `project:` entries points to it.
- `role-config`'s *A role declares its sources, lane, behaviour, permissions, and reviewers*
  makes `igor lore-search` the one command a worker may run that its role's `commands` need
  not list, and its scenario *Declared commands bound what the worker may run* says so.
  *Merge semantics differ by field kind* puts the command outside the monotonic rule, with a
  new scenario (decision 23).
- `task-execution`'s *Only reversible artifacts are produced* exempts pushing a run's citations
  and its question and miss files from the role's `allow` list, with two new scenarios.
- `task-execution`'s *The worker is given an explicit environment holding no credential but
  its seat's* has the Igor set `IGOR_RUN`, which carries no secret, in a worker's environment
  and its own inquisitor run's, with two new scenarios.
- `task-execution`'s *Transcripts and outcomes are captured to the state branch* writes no
  transcript for a run that met a question with a category, and for such a run puts no excerpt
  of the worker's result in the pull request body, and has a refusal record keep only the
  limit and reset time Igor read, while any other refused run keeps the provider's whole
  reply. A run that ends before its worker completes its report, for any reason, counts as
  having met such a question (decisions 19 and 38). An execution counts as flagged when any of
  its worker runs does (decision 22). A flagged run's transcript path holds a one-line note,
  its ledger row keeps each denied command by name only, and #188's log of its tool calls
  keeps names only (decisions 36 and 38), and its ledger row's `reason` keeps only fixed
  words for the kind of reason, such as `error`, or for a worker killed for a limit the hang's
  kind and the limit's duration (decisions 51 and 56). A model step igor runs after the worker,
  such as #153's, is part of the run and counts as a worker run (decisions 60 and 64). It gains
  eighteen scenarios, and
  *Transcript persisted off the main line* applies only to a run that met none and whose
  worker runs all completed their reports (decisions 13, 19 and 38).
- `lore-review`'s *An entry already in the store is never overwritten by proposing* reports an
  out-of-scope collision during a run only as "id taken", and then proposes nothing for that
  candidate in the run, with two new scenarios (decisions 6 and 14).
- `surface-adapter`'s *An Igor that cannot act as its App does not start* refuses to start an
  Igor whose App's slug does not start with `igor-`, with two new scenarios, and requires the
  App on the destination repository too (decision 66); *An Igor
  knows its own bot account* renames its example App to `igor-acme-reviewer` (decision 62).
  `docs/deployment.md` tells a person to name the App with the prefix.
- `graceful-handoff`'s *A handoff states what was done, what remains, and who could continue*
  has a flagged run's handoff state why it stopped only in the ledger row's fixed words, quote
  no failure detail or worker's reason and point to the item's transcript path, and has a
  flagged run's handoff ask no question, with five new scenarios (decisions 71 and 73).
- `docs/architecture.md`: §3.3 says every worker is offered `igor lore-search` and what binds it, §3.4.1 says a
  search hit is not a firing and that a review counts citations from the destination repository's
  `questions` branch, and §4.1 says the worker never *has* to search.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lore-firing`: *Lore reaches the worker unbidden* allows a search over the store and says what
  a search may return. *Status and scope are exact filters, always applied* keeps a `project:`
  entry about a more private repository from firing. Three new requirements have the Igor run its worker's searches and
  publish its worker's citations and its question and miss files.
- `lore-review`: an id collision with an out-of-scope entry or rejection, during a run, is
  reported without naming it, and the candidate is not proposed in that run.
- `role-config`: `igor lore-search` is the one command a worker may run without its role's
  `commands` listing it.
- `surface-adapter`: an Igor refuses to start when its App's slug does not start with
  `igor-`.
- `graceful-handoff`: a flagged run's handoff states why it stopped only in fixed words,
  points to its transcript path, and asks no question (decisions 71 and 73).
- `task-execution`: pushing a run's citations and its question and miss files is exempt from
  the role's `allow` list, a worker's environment marks it as in an Igor's run, and a run
  that met a question with a category stores no transcript.

## Impact

- `test/firing.test.ts`: the test *offers a worker no way to search the store* checks the removed
  scenario, and is deleted in gate two.
- `src/firing.ts`: its header comment gives the old reason for having no search, and is rewritten
  in gate two.
- [#196](https://github.com/adamstallard/igor/pull/196) (`spec-trace`) tags that test with
  `@scenario lore-firing: No search affordance offered`. Whichever of #196 and this change
  merges second removes the tag with the test.
- `lore-from-corrections` and `lore-from-reviews` each compare a candidate against existing
  entries, and neither limits that by scope. Where such a check runs during an Igor's run, it
  must not compare against an entry outside the role's scope (decision 6).
- `lore-from-corrections` says no worker receives a `provisional` candidate until a person
  merges it. That promise is about injection, and a search result is not injected (decision 3),
  so the change leaves it as written.
