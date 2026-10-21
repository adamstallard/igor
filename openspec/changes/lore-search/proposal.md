# A search over lore may be offered, and never shows an out-of-scope entry

## Decisions

[#215](https://github.com/adamstallard/igor/issues/215) records all forty-four decisions,
and all are Adam's. Where the agent that wrote this change fitted one of them to the spec, the
list under *Still open* says so. A *consistency read*
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
  2. the citation visibility rule stays, and #212 keeps the lore repository no more visible
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
  read raised, and decision 20 settles how a worker's question and miss files reach the lore
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
- decisions 43 and 44 in those same two days, in the session reviewing shared-skills #25.

Terms used here:
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
8. **A review reads an entry's citations from the lore repository's `questions` branch.** That
   branch is an orphan branch of the lore repository, separate from igor's `igor-state`, holding
   the inquisitor's questions about the organization and its projects. Shared-skills #25 moves
   those questions there (its decision 42), and writes citations there. When the inquisitor
   finds the answer to a question in a lore entry, so that nobody is asked, a citation of that
   entry goes to that branch, within the limits decisions 9 and 10 set. *Rejected:* counting
   citations in the inquisitor's per-repository question logs, which are scattered across
   repositories, some of them worked by no Igor role.

   Where the branch is missing or holds no citation at all, the review shows citations as not checked,
   never as zero. It also shows citations as not checked when, within the period the review
   covers, the run records on the state branch count at least one citation that failed to push
   and the branch holds no citation an Igor pushed, which is one with a run id (decisions 32
   and 39). Otherwise it shows each entry's count as a lower bound, and says so beside the count. Missing from the count are the citations the Igor refused, withheld or could not push,
   every citation from a run that published neither an artifact nor a handoff (decision 9),
   and every citation from a run that counts as having met a question with a category
   (decision 26).
   Since fire counts alone decide whether an entry is proposed as unused (decision 5), a missing
   citation can only fail to hold back an entry that was in fact cited; the person reviewing the
   proposal judges that entry.
9. **During an Igor's run, the worker reports each citation, and the Igor pushes it.** The Igor
   pushes the citations to the `questions` branch, as the rest of the design has it: *worker
   edits, Igor publishes*. The worker gets no credential for the lore repository. A worker's
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
    the lore repository's visibility from GitHub at each push (decisions 16 and 37). A lore repository
    whose visibility cannot be read counts as public, and a concerned repository whose
    visibility cannot be read counts as private. During a run, the repository the question
    concerns is the repository of the item the run works, never one the worker names.

    The state branch, `igor-state`, is a branch of the lore repository too, and its firing
    records and transcripts name each run's item. A lore repository more visible than a
    repository a role works would show those names to its readers. Adam settled that through
    #212 on 2026-10-20: Igor is to refuse to start when the team's lore repository is more
    visible than the least visible repository any role works. #212 is not yet specified. Its
    check runs only at startup, so the citation rule above still applies at each push.
11. **A forged citation is a known limit.** Item text can steer a worker, and a steered worker
    could report citations of any `active` entry in its role's scope, which would keep that
    entry from being proposed as unused. It could also report a citation for a question that has
    a category and so should send none. The Igor would push it, and the cited entry would show
    readers of the lore repository what the question was about. A review shows each citation's run and item, so the
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
      state branch is in the lore repository, and its records already name each item.

13. **A run that meets a question with a category stores no transcript.** When a worker meets
    a question in the categories `vulnerability`, `secret` or `personal`, the Igor writes no
    transcript of that run to `igor-state`. It still writes the run's record, with its outcome,
    cost, run id, item and citation counts, the firing record, and, where the provider refused
    the run, the refusal record decision 18 allows. The same holds for an inquisitor run the Igor starts itself.
    Free text cannot be redacted reliably, and personal details should not reach everyone who
    can read the lore repository, where `igor-state` lives (Adam, 2026-10-20).

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
    uses that lore repository, whichever repository its `repository` key names, for the reason
    decision 25 gives. Adam first had the key decide a file's scope,
    then replaced that rule with decision 25 (both 2026-10-20).

    The search labels a question file holding no answer, one whose frontmatter holds no
    `authority` key, as unanswered. It labels a miss file as a miss, and neither file as an
    answer. That matches #25's filter 1, which labels them so under #25's
    decision 183, item 1. Adam accepted that decision in #25, so this is an alignment with
    #25, not a new decision of his.
16. **The Igor learns the lore repository's visibility from GitHub.** One API call returns
    the exact visibility: `private`, `internal` or `public`. #212's startup check and the
    citation visibility rule in decision 10 both ask GitHub, and `publicStore` no longer
    decides it. `publicStore` says only whether the store is public, so an internal lore
    repository would read as private, and a private item's citation would go to a repository
    everyone in the enterprise can read. A lore repository whose visibility GitHub does not
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
    rules.** An Igor worker cannot push to the lore repository, so it cannot put the
    inquisitor's files on the `questions` branch itself: a log file for a question about an
    organization or project, including one that records an agent's own choice with
    `authority: agent`, and a miss file. The worker reports each such file on the channel it
    reports citations on, and the Igor pushes it under the same rules as a citation. It pushes
    only when the run publishes an artifact or ends in the Igor's handoff comment on the item,
    and never to a lore repository more visible than the item's repository or the repository
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
    that #189 would publish (Adam, 2026-10-20). #189's side is in Still open.
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
25. **A questions-branch file is in scope for every role whose Igor uses that lore
    repository.** A file on a lore repository's `questions` branch concerns an organization or
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
    unreadable file's repository as private. Decision 25's scope otherwise stands. A worker reading lore
    about a private repository is not the harm, since the Igor and its worker may see the lore
    repository; reposting what it read is. A
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
    Adam accepted that: a team's lore repository serves one team, whose private repositories
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
32. **When every Igor push of citations failed, the review shows citations as not checked.**
    People's own sessions can put citations on the `questions` branch while every Igor push to
    it fails, for example while rulesets refuse the Igor's App (task 4.3). Each count would
    then leave out every citation from an Igor run, so showing it as a lower bound would
    mislead. Where the run records count at least one citation that failed to push and the
    branch holds no citation an Igor pushed, the review shows citations as not checked (Adam,
    2026-10-20). Decision 39 limits both tests to the period the review covers.
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
    31 says (Adam, 2026-10-20/21).
36. **A flagged run's ledger row keeps each denied command's name, without its arguments.**
    The execution ledger row records each shell command the worker's sandbox denied, so the
    operator can see what to allow in the role's `commands`. For a flagged run, that row keeps
    only the command's name, such as `gh issue comment`, without its arguments: enough to
    decide what to allow, and none of the question's text. Any other run keeps the whole
    command, as today (Adam, 2026-10-20/21).
37. **The lore repository's visibility is read at every push.** For the push rules, the Igor
    asks GitHub for it at each push, one API call per push, rather than once at startup. A
    lore repository made public while the Igor runs then gets no further citation or file of a
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
    not checked when no Igor citation push succeeded within the period it covers, where decision
    32 asked whether one had ever succeeded. The test is that the
    run records for that period count at least one citation that failed to push, and the
    branch holds no citation an Igor pushed dated within it (Adam, 2026-10-20/21, amending
    decision 32).
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
    from the posted comment.
42. **The Igor records where a questions-branch file came from, and the search judges the file
    by the more private of the two.** The Igor sets an `asked_from` key on each
    questions-branch file it pushes, naming the repository of the item the run works.
    `igor lore-search` treats a file as being as visible as the more private of its
    `repository` and `asked_from`. A worker on private repository X could otherwise report a
    file holding X's details keyed to public repository P, and a worker on a public item would
    then be shown it (Adam, 2026-10-20/21). Shared-skills #25 defines the file format, so the
    new key is #25's to add (Still open).
43. **A linked comment holds the recorded answer by #25's normalized containment.** #25
    defines the rule once, in the check that proves who wrote a file's answer: both texts are
    reduced as a question is for its hash (no list markers or inline markup, each run of
    whitespace one space), a leading `User says: `, which #25 puts before an answer it relays
    for a person, is dropped from the comment, and the comment must contain the file's answer
    line. No model call judges it. The Igor applies that rule (Adam, in the
    session reviewing shared-skills #25, 2026-10-20/21).
44. **Adam intends that a file keyed to another repository than the item's shows as input.**
    During a run, #25 shows a `questions`-branch file whose `repository` key names a repository
    other than the item's as input, whatever its proofs: they show who answered, not that the
    answer belongs to the item's repository. So a log file holding an answer that a run on
    repository A pushes, keyed to repository B, never counts as an answer. During a run on A it
    is input by that rule. During a run on B, its `answer_link`, a comment on A, proves no
    writer, since #25 accepts only a comment in B or in the lore repository (Adam, in the
    session reviewing shared-skills #25, 2026-10-20/21).

**Still open:**
- Whether an Igor's worker that runs the inquisitor skill reaches its filter 1 through `igor
  lore-search`. Open pull request [#174](https://github.com/adamstallard/igor/pull/174)
  decides which skills a worker loads, and shared-skills #25 is to have filter 1 call `igor
  lore-search` inside an Igor's worker. Task 4.1 checks once both have landed.
- Whether a worker can read the lore checkout's files directly. If it can, it can see entries
  outside its role's scope without any search, and the filter above does not stop that. #175's
  requirements say only that the worker cannot write the checkout, so task 4.2 still checks
  reading. #175's design makes the Igor's lore checkout unreadable to the worker under `igor
  serve`; if that holds, a worker there searches only through `igor lore-search` (decision
  23).
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
- The review's rules in decisions 5, 8 and 32 (fire counts alone decide "unused", a cited
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
  take the lore repository's visibility from `publicStore` when it is set
  (`src/propose.ts:297`). Decision 16 covers #212's check and the push rules only. The two
  can disagree on an internal lore repository: with `publicStore: false`, `lore-review`
  treats it as not public and lets a privately-sourced entry into it, while the citation rule
  withholds a private item's citation from it. Whether `lore-review` should ask GitHub too is
  for a change to `lore-review`; this change does not edit it.
- #212's issue body records decision 16 for its startup check. #212 has no change yet; the
  change that specifies it must read the lore repository's visibility as decision 16 says.
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
  [#208](https://github.com/adamstallard/igor/pull/208) fetches only the lore repository's
  default branch, into a ref and a worktree per process, so the `questions` branch needs a ref
  of its own beside them.
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
- Two readings of decision 41 by the agent that wrote this change, which the spec states
  but Adam has not confirmed: the record's questions that count are those of the Igor's handback comments on
  the item posted before the answering comment, and a file's question matches one of them
  when the two are equal once each is reduced as #25 reduces a question for its hash, the
  reduction decision 43 also uses.
- This change defines a *handback comment* as the Igor's handoff comment when it asks a
  question the run could not settle. Decision 41 needs the Igor's record of the questions it
  posted in each one. `graceful-handoff`'s handoff comment holds no question today, and #211,
  which has the Igor ask in it, specifies neither the comment's format nor that record. Task
  4.6 checks once #211 is specified; until the record exists, every log file holding a
  person's answer is refused.
- Once #211's inquisitor role posts an answer given in chat onto the item as a comment by its
  App, decision 24 would accept that comment as proof, and a chat answer could be pushed as a
  `decision` file, where shared-skills #25 keeps a chat answer as `input`. A question for Adam
  once #211 specifies the role.
- The visibility filter of decision 27 binds `igor lore-search`. An inquisitor run the Igor
  starts itself searches through #25's script, which relies on this change to filter by
  visibility, and *Lore reaches the worker unbidden* sets no such filter for it. Whether
  decision 27 covers that run is Adam's. The scenario *A search shows a questions-branch file
  from any repository*, under *Lore reaches the worker unbidden*, already assumes it does.
- The text a worker pipes to `igor lore-search` is untrusted and can quote item text. Nothing
  yet requires that the permitted way of feeding standard input keeps that text out of shell
  expansion, such as `$(…)` in an unquoted heredoc. Task 4.5 checks this too.
- Decision 42's `asked_from` key is not in shared-skills #25's *A log file and a miss file
  have one format*, which defines the format and allows no key it does not list. #25 should
  add the key, written only by an Igor. Until it does, a reader holding to #25's format would
  treat an Igor-pushed file as breaking it.
- **A question for Adam: sensitive free text in a questions-branch file.** The Igor cannot see
  a category, so a steered worker could report a question or miss file about a `personal` or
  `secret` matter, and the Igor would push it for every role to find (decision 25). Decisions
  11 and 13 name the like limit only for citations and the flag. Name it as a known limit, or
  add a guard?
- For [#179](https://github.com/adamstallard/igor/pull/179) and gate two: decision 34's
  authority checks spend the Igor's App installation's GitHub rate limit, which claiming and
  #179's heartbeats also use. A worker steered by item text could exhaust it by calling `igor
  lore-search` in a loop, since nothing caps or caches the checks' reads. #179 runs several
  Igor processes, each a *rank*, and stops every one of them when their heartbeats to GitHub
  fail. Whether to cap the reads, cache them or accept the limit is open.
- Decision 36 keeps a denied command's *name*, and Adam has not said where a name ends. The
  spec follows the reading of the agent that wrote this change, which takes it as the command's first words, up to three, each
  starting with a lowercase letter and holding only lowercase letters, digits and hyphens,
  stopping at the first word that does not. So `gh issue comment 12 --body "…"` keeps `gh issue
  comment`. A plain word of an argument can still pass for a subcommand, as `echo alice`
  keeps `echo alice`; whether that is close enough is Adam's.
- Decision 40's order is Adam's; how it is fitted to the spec's reasons is the agent's: a
  category counts as a flagged run, and a run that published nothing goes second. Adam's order
  named neither placement.
- **A question for Adam: what else a flagged run's ledger row keeps.** Decision 36 cuts only
  the denied commands. The row also writes `reason`, which can hold a thrown error's message,
  `changed`, every file path the worker touched, and the action refusals and cures
  (`src/execute.ts:2133`). Those stay on `igor-state` for every reader of the lore repository.
  Cut them for a flagged run too, or accept them?
- A run whose worker never sends a completed report. Decision 38 makes
  every run that ends without one flagged. Nothing yet makes every worker send one on every
  run, including a role whose worker never runs the inquisitor; if one does not, every run of
  that role is flagged, and loses its transcript, its pull request summary and its refusal
  record's reply. Task 3.1 has every worker send the report, and task 4.7 checks how reliably
  workers send it.
- **A question for Adam: does decision 35 cover the Igor's own inquisitor run?** #25's script
  reads the `questions` branch with `git fetch`, so under `igor run` such a run would fetch
  the branch, perhaps more than once, where decisions 31 and 35 have a run read one copy that
  `igor run` never fetches.
- **A question for Adam: what a search matches.** The spec does not say whether `igor
  lore-search` matches by substring, by terms, by embedding or by a model, nor whether it caps
  or ranks its results. Task 2.1 filters by scope and status only, and says nothing of
  matching.
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
- [#212](https://github.com/adamstallard/igor/issues/212)'s body says this change's citation rule uses
  its startup read of the lore repository's visibility. Under decision 37 the push rules read it
  at each push; #212's body should say so.
- This change's `lore-firing` and `task-execution` deltas call the execution ledger
  `executions.ndjson`, while `appendRecord` writes new rows to `executions/<yyyy-mm-dd>.ndjson`
  (`src/state.ts:146`). The next round of this change should rename it in both deltas.
- `lore-firing`'s *An entry arrives with what a reader needs to judge it* uses "citations" for an
  entry's provenance, while this change uses it for a record that an entry answered a question.
  One of the two should be renamed.
- `lore-firing`'s *Injected lore is trusted; the work item is not* says lore goes in the trusted
  channel, while a search result marked as lore does not. That requirement should say
  *injected* lore.
- Decision 13's refusal record keeps "only the refusal's reason", and no scenario says whether
  the record's other fields, such as its item and time, are kept.
- `work-discovery`'s *Discovery state and execution transcripts* puts every execution's
  transcript on the state branch; this change writes none for a flagged run and does not
  modify that requirement.
- Decision 21 counts each refusal by reason, while the spec counts every refused
  questions-branch file under one "refused" reason, as it counts citations. Whether to split
  the count by format, credential, path and unasked question is open.
- [#179](https://github.com/adamstallard/igor/pull/179) gives each `igor run` process a *run
  id*, which it puts in the names of the worktrees that process creates, while this change's
  run id names one execution of an item. The two could be confused, so one of the two should
  be renamed. This change does
  not edit #179.
- Under `igor run`, #175 always runs the worker as the Igor's own user, so the worker can read
  the whole lore checkout, entries outside its role's scope included. Task 4.2's question is
  open only for `igor serve`; for `igor run`, decision 3's scope filter does not stop a worker
  reading the files. Whether to accept that as a limit of `igor run` or bar it is Adam's.
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
  the citation requirement to the new name.
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
- Whether the lore repository's rulesets or branch protection let an Igor's App create and push
  the orphan `questions` branch. `surface-adapter` already requires the App to hold Contents
  write on the lore repository. Task 4.3 checks. Until it can, every citation the Igor tries to
  push is counted as not pushed, and the branch holds none, so a review reports citations as
  not checked.

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
  file on the Igor's lore repository's `questions` branch in scope, lets it return in-scope entries that
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
  It has the Igor read the lore repository's visibility from GitHub at each push. It is the
  one statement of the
  Igor's push rules, which shared-skills #25 points to. It sits in
  `lore-firing` beside *What fired is recorded on the state branch*, the other record of an
  entry's use. For the file's format, it points to shared-skills #25's *A citation file has one
  format* instead of stating its own. It has twenty-two scenarios.
- A second new `lore-firing` requirement, *An Igor publishes the questions-branch files its
  worker reports*, has the Igor push a worker's question and miss files under the citation
  rules, refusing a file that claims a person's answer to a question the Igor's own record
  says it did not ask, replaces one on the branch, or holds a credential by #217's matcher.
  The Igor sets each file's `asked_from` key to the item's repository. It has nineteen
  scenarios (decisions 20, 21, 24, 28, 30, 33, 41 and 42).
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
  when a check fails or cannot be run, judging a linked comment by #25's normalized
  containment with no model call. The requirement has twenty-three scenarios (decisions 15, 23,
  27, 29, 31, 34, 35, 42, 43 and 44).
- `role-config`'s *A role declares its sources, lane, behaviour, permissions, and reviewers*
  makes `igor lore-search` the one command a worker may run that its role's `commands` need
  not list, and its scenario *Declared commands bound what the worker may run* says so.
  *Merge semantics differ by field kind* puts the command outside the monotonic rule, with a
  new scenario (decision 23).
- `task-execution`'s *Only reversible artifacts are produced* exempts pushing a run's citations
  and its question and miss files from the role's `allow` list, with two new scenarios.
- `task-execution`'s *Transcripts and outcomes are captured to the state branch* writes no
  transcript for a run that met a question with a category, and for such a run puts no excerpt
  of the worker's result in the pull request body, and has a refusal record keep only the
  limit and reset time Igor read, while any other refused run keeps the provider's whole
  reply. A run that ends before its worker completes its report, for any reason, counts as
  having met such a question (decisions 19 and 38). An execution counts as flagged when any of
  its worker runs does (decision 22). A flagged run's transcript path holds a one-line note,
  its ledger row keeps each denied command by name only, and #188's log of its tool calls
  keeps names only (decisions 36 and 38). It gains fourteen scenarios, and
  *Transcript persisted off the main line* applies only to a run that met none and whose
  worker runs all completed their reports (decisions 13, 19 and 38).
- `lore-review`'s *An entry already in the store is never overwritten by proposing* reports an
  out-of-scope collision during a run only as "id taken", and then proposes nothing for that
  candidate in the run, with two new scenarios (decisions 6 and 14).
- `docs/architecture.md`: §3.3 says every worker is offered `igor lore-search` and what binds it, §3.4.1 says a
  search hit is not a firing and that a review counts citations from the lore repository's
  `questions` branch, and §4.1 says the worker never *has* to search.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lore-firing`: *Lore reaches the worker unbidden* allows a search over the store and says what
  a search may return. Three new requirements have the Igor run its worker's searches and
  publish its worker's citations and its question and miss files.
- `lore-review`: an id collision with an out-of-scope entry or rejection, during a run, is
  reported without naming it, and the candidate is not proposed in that run.
- `role-config`: `igor lore-search` is the one command a worker may run without its role's
  `commands` listing it.
- `task-execution`: pushing a run's citations and its question and miss files is exempt from
  the role's `allow` list, and a run
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
