## Decisions

Each decision names who made it and when. Adam decided 1 to 3, 7, 8 and 18 on 2026-09-30 in
[#139](https://github.com/adamstallard/igor/issues/139), which holds their reasoning; where
#139 differs from decisions 12 and 16, they hold (Adam, 2026-10-18). Decisions 20 to 39 are
Adam's answers of 2026-10-19 to the twenty questions an earlier revision of this change put to
him, in the order he was asked them: that revision's *For Adam* 1 is decision 20, and its 20 is
decision 39. The next revision asked him five more questions. Decisions 40 to 43 are his
answers of 2026-10-20 to its questions 1, 2, 3 and 5, in that order. Decision 44 is one he
made the same day, reviewing #216. Decisions 45 and 46 are his answers of 2026-10-21: 45 to question 4 of
the revision that asked five, and 46 to the question of #216's question files, which the next
revision added. That revision's other question, decision 40's resume, waits on another decision
of his (*For Adam* 4). Decision
47 records that he merged shared-skills PR #27 the same day.

Terms. An *Igor* is one role of the agent, acting under its own GitHub App; the *item* is the
issue or pull request it works on. Under the two-gate workflow (#150), *gate one* publishes a
change's specification and *gate two* its implementation, on the same pull request; a *revision*
is a push at either gate answering a reviewer's change request. `produce()` opens a pull
request; the *head push*, this change's name for the push #150 adds, which puts a commit onto an
existing pull request, is built on the `commitOnBranch` primitive already on `main`. Prose signs
in two calls: the first prints the rules and a one-use *pass token*; the model writes by the
rules; the second, given the token, signs, after a *cold read*, a fresh model step reading the
text with none of the conversation behind it. The *prose pass* is the model step that writes
between the two calls. *Reader goals* are what prose is told each text's reader came for.
Bug-hunter's *caller-commits mode* reviews and fixes a change and reports its result without
committing; its *triage* decides whether a diff needs a hunt, and its *first triage* runs on the
whole change before any hunt. The *state branch* is where Igor records each item's outcome.

1. **A model writes; Igor's deterministic code signs, verifies and publishes** (Adam,
   2026-09-30, #139; decision 16 sets which calls the code runs). Prose's first call prints the
   rules before the model writes, and its second call signs; the code checks the result, because
   the model's word is not proof. *Rejected:* the code checking text on its own, which cannot
   apply the rules a model applies while writing; and trusting the model's report that it
   checked, which text edited after its signature would pass.
2. **Every text a model writes for an Igor to publish goes through prose's pass and is signed
   (Adam, 2026-09-30)**: pull request descriptions, replies, questions, and any other
   model-written post to GitHub, Discord or Linear, apart from the words decision 24 lists,
   which code-assembled text quotes. `prose sign` signs it, appending a
   `prose ✓ <6 hex>` footer hashed over the text above it. *Rejected:* signing commits only,
   which leaves the posts a reviewer reads first unchecked.
3. **The code that posts runs `prose verify-post` on the exact text first (Adam, 2026-09-30)**,
   and posts nothing that fails. *Rejected:* relying on prose's posting hook, which guards only
   posts made from a Claude Code session, not Igor's own code.
4. **A role lists the skills its worker uses (Adam, 2026-10-11).** `skills: [<name>, …]` names
   pinned skills from #174's `igor` plugin. The list decides which steps Igor runs and checks,
   not what loads: #174 loads every installed skill for every role. The org base may set it for
   every role and a role may add to it, never remove. An unknown name is refused by any command
   that runs a model step (decision 29). Igor's code checks per listed skill: for `prose`, a
   valid footer on every model-written post and a matching `Prose:` trailer on every commit; for
   `bug-hunter`, a `Bug-hunter:` trailer and a `Bug-hunter-Tree:` trailer bound to the staged
   tree, on every commit (decision 26). A role that lists neither publishes as today.
   *Rejected:* a switch for "posts" and "commits", which cannot say which skill's check applies.
5. **Every commit Igor pushes for an item, other than a merge, goes through the steps for the
   skills its role lists, and carries their trailers (Adam, 2026-10-13)**, whether `produce()`
   opens a pull request with it or #150's head push pushes gate two's
   implementation or a revision. Bug-hunter's trailers are `Bug-hunter:` and
   `Bug-hunter-Tree:`; the prose pass's is `Prose: ✓ <tree>:<message>`, short hashes of the
   staged tree and the message. Igor commits only when `prose verify-staged` accepts the
   trailer, the tree it uploads equals every signed tree, and the subject is the issue title as
   decision 6 sets out. *Rejected:* signing only in `produce()`. Gate two's commit would then
   have no signed tree, and the tests `loop-verifies-commands` (#189) runs on the signed tree
   would not run on what gate two commits.
6. **The commit message (Adam, 2026-10-13),** for a role that lists `prose`. The subject is the
   issue title with any closing keyword dropped (any keyword the item's tracker adapter
   recognises followed by an issue reference; on GitHub `close`, `closes`, `closed`, `fix`,
   `fixes`, `fixed`, `resolve`, `resolves` or `resolved`, as in `Login fails (fixes #12)`), so a
   title cannot close an issue by itself. The body explains the change and ends with one of two
   lines, each in the form the adapter supplies:
   - the closing linkage (on GitHub, `Closes #N`) on every commit of a role that does not use
     the two-gate workflow (#150), and on every gate-two commit under #150, the implementation
     and each revision after it;
   - the reference that links without closing, in the form #150's adapter supplies (decision
     27), only on gate one's commits, its revisions included, matching #150's rule that gate one
     closes nothing.

   *Rejected:* `Closes #N` everywhere, which would close the issue when gate one merges; and
   the non-closing reference on gate-two revisions, since a squash merge that took its message from the last
   commit would then carry no closing keyword, and the issue would stay open.
7. **A failed check goes back to the model step with the reason (Adam, 2026-09-30)**, to redo.
   After two attempts in total, the code publishes nothing and records the failure. *Rejected:*
   retrying without a bound, which lets one failing step spend the seat's budget (the model
   subscription the Igor draws on) on one item.
8. **Text the code assembles from recorded state is not signed (Adam, 2026-09-30):** handoffs,
   stop receipts and claim messages. The code's authors wrote it and it is reviewed as code.
   *Rejected:* signing handoffs too. A handoff is needed exactly when a model call may be
   impossible, so requiring a model call would leave an Igor silent in the case
   `graceful-handoff` exists for.
9. **A pull request body is the opening block, then the signed description, then the code's
   evidence section (Adam, 2026-10-13).** Until `review-evidence` (#190) is built, the opening
   block is the line linking the pull request to its item, preceded under #150 by every line
   #150's code writes into the body; once #190 is built, #190 defines it. Every line the code
   adds after the description starts at the marker `<!-- igor:evidence -->`, which #190 defines;
   before #190 is built there is no marker, and the description runs to the end of the body.
   `prose verify-post` runs on exactly the span between the opening block and the marker.
   Neither the opening block nor the evidence section is signed. *Rejected:* signing the whole
   body, which would put code-assembled text under the model's signature and break it each time
   the code rebuilds its section.
10. **The description is rewritten only when what the worker did changes (Adam, 2026-10-13):**
    on gate two's implementation and on each revision at either gate, with the opening block
    recomputed for that push. A catch-up resolution, a push that only merges the base branch in
    and resolves its conflicts, leaves it as it is. *Rejected:* rewriting on every push, which
    costs a model call for a resolution that changes nothing the description says.
11. **A commit's trailers are made once, at the end (Adam, 2026-10-17, on #175).** Bug-hunter
    and the prose pass each edit the tree, and neither signs it. After the last model step exits,
    Igor stages the change once more, in its own index, and every trailer is made against that
    tree, the tree Igor records and publishes. *Rejected:* each step signing as it finishes.
    Under #175 (`worker-user`) a step runs as a worker user that cannot write the git directory,
    and signing in turn would leave the prose pass's edits outside the tree bug-hunter signed.
12. **Igor's code runs a commit's signing calls, and bug-hunter triages the prose pass's diff
    (Adam, 2026-10-17, on #175; the first call's place set by decision 16).** The order:
    1. Bug-hunter runs, and reports its `Bug-hunter:` value, such as `1 iteration, 1 bug
       fixed`, and any open decisions. It neither stages nor mints.
    2. Igor stages the change and runs prose's first call, `prose check`, which prints the
       rules and a pass token.
    3. The prose pass, given those rules and the token, rewrites the message and the change's
       docs and comments.
    4. Bug-hunter's triage runs on the prose pass's diff, on sonnet (decisions 17 and 21). A
       diff it skips gets no hunt; any other diff gets one more bug-hunter iteration.
    5. Igor stages once more and runs both signing calls: prose's second call, with the token
       and the cold read, and bug-hunter's minting script, which writes `Bug-hunter-Tree:`.

    The scripts come from the root-owned skills directory (#174), run with Igor's own git
    directory and index, so running them as the service user executes nothing the worker wrote.
    `Bug-hunter-Tree:` attests that bug-hunter's triage saw every change in the tree, and that
    bug-hunter hunted each change its triage did not skip. The triage draws bug-hunter's own
    line, which skips comments and docs and also tests, specs, lockfiles, generated files,
    formatting and renames (task 0.11; decision 20). *Rejected:*
    the steps running the signing calls themselves, which under #175 they cannot do against
    Igor's index; and bug-hunter running again after every prose pass, which spends a hunt on a
    diff of comments.
13. **No second prose pass after the extra bug-hunter iteration (Adam, 2026-10-18).** Comments
    that iteration writes reach the tree after the prose pass's rewrite. The cold read of step 5
    reads them, and the prose pass, answering it, fixes what it names; that is the only way the
    prose pass reaches them. Adam accepted that such comments get no full pass: the prose pass
    is not meant to change code, so a prose diff that needs another hunt is an edge case.
    *Rejected:* a second prose pass after that iteration, and narrowing the `task-execution`
    rule that the prose pass rewrites the docs and comments the change touches, so that it
    excludes those comments.
14. **Where each signing failure goes back (Adam, 2026-10-18).** A tree or message mismatch
    when Igor commits goes back to no step: between the tree the trailers name and the tree the
    Git Data API builds, or between the message committed and the one `Prose:` hashes. It is
    Igor's own bug, so the item fails loudly. A token that prose's second call refuses goes back
    to the prose pass, with new rules and a new token from a first call Igor runs again.
15. **No prompt text goes on a command line** (Adam, 2026-10-18, decided on
    [#175](https://github.com/adamstallard/igor/pull/175)). `/proc/<pid>/cmdline` is readable by
    every user on the server, so a worker of one role could read another role's prompt, with
    private source content in it. Each model step's prompt, which holds prose's rules and pass
    token where the step writes, reaches `claude -p` on stdin, and any system prompt reaches it
    through a file, as #175 sets out. Reader goals drawn from the item could hold private text,
    so they stay off every prose command line too: they reach prose in a file (decision 32;
    task 0.16). #175 specifies
    the stdin rule, in its `task-execution` requirement *A prompt reaches claude on stdin, never
    in its arguments*, and #175's systemd unit also sets `ProtectProc=invisible`. *Rejected:*
    relying on `ProtectProc=invisible` alone, which leaves a prompt readable wherever the
    setting does not hold, such as under `igor run`, which no systemd unit starts.
16. **Igor runs prose's first call itself, as its service user, and gives the rules and the
    pass token to the step in its prompt (Adam, 2026-10-18).** The model does the pass, and Igor
    runs the second call. The worker user never writes prose's token store, so it cannot forge a
    token. This holds for a commit's `prose check` and, as Adam confirmed in decision 42, a
    post's `prose sign`, and the worker is
    granted no prose or bug-hunter script. *Rejected:* the worker running the first call, which
    fails because the token store is in a git directory the worker cannot write (task 0.9); and
    Igor pre-creating a token directory the worker's group can write, which works but lets the
    worker forge a token, since a token is a plain file.
17. **Igor runs the triage of the prose pass's diff on one pinned model (Adam, 2026-10-18).**
    Haiku and sonnet split on a spec-only diff (task 0.11), so an unpinned triage could hunt one
    run and skip the next. Decision 21 pins it to sonnet.
18. **No GitHub Action** (Adam, 2026-09-30, #139). Igor runs the checks in its own pipeline, so
    a CI check would only re-verify its work (#139, section 4).
19. **Igor stages more than once, and every staging follows #175's kill and checks (Adam,
    2026-10-19, on #175).** Igor stages three times: before prose's first call, since the token
    records the goals of the docs that first call sees staged (task 0.9); after the prose pass
    and bug-hunter's extra iteration where it runs, before the second call prints the cold-read
    brief; and after the model steps that answer the cold read. Before every staging, Igor kills
    every process the worker user owns and checks the changed paths for symbolic links,
    submodules and hard links. #175 (`worker-user`) requires both in its requirement *The Igor stages only after its checks, and #153's trailers bind the last staging*,
    whose "#153" is this change; this change cites it and does not restate the checks. Both trailers, `Prose:` and `Bug-hunter-Tree:`, bind the last
    staging, the tree Igor publishes. *Rejected:* a single staging after the last model step,
    under which prose's first call could not see the change's docs.

20. **Bug-hunter's triage uses bug-hunter's own line (Adam, 2026-10-19).** Besides comments and
    docs, it skips a diff of tests, specs, lockfiles, generated or vendored files, formatting or
    renames (task 0.11). Decision 12's narrower line, comments or docs only, goes. *Rejected:* a
    line of Igor's own, which would drift from the skill's.
21. **The triage runs on sonnet (Adam, 2026-10-19).** On the seven measured diffs sonnet drew
    bug-hunter's line on every one (task 0.11). *Rejected:* haiku, which reviewed a spec-only
    diff that the line skips.
22. **Every cold-read finding is fixed (Adam, 2026-10-19).** No person is there to answer a kept
    finding. So where the writing step's answers to the cold read keep a finding, or keep a
    line in which the cold reader said what it understood, the attempt fails (`design.md`,
    *Every signature needs a cold read*).
23. **Gate two's implementation push rewrites the description, as decision 10 says (Adam,
    2026-10-19).** #190 rewrites it only on a revision, and is to change its own rule to match
    (*Reported to other changes*, below).
24. **Words quoted in a post Igor's code composes are published unsigned (Adam, 2026-10-19).**
    The code wrote the post, so it is not signed: bug-hunter's open decisions in the opening
    block, the worker's reason for declining in a handoff, and a person's request in an issue
    Igor opens for them. Each quotes someone else's words as theirs.
25. **Igor runs no `prose start` (Adam, 2026-10-19).** Nothing in a worker checks the gate it
    opens (`design.md`, item 1), and the prose pass gets its rules from the first call Igor
    runs. Running it would also break #175's rule that no prose script runs as the worker user.
26. **Igor mints `Bug-hunter-Tree:` on every commit of a role that lists `bug-hunter` (Adam,
    2026-10-19)**, against the last staging, even where bug-hunter's triage skipped the whole
    change. The tree check then never rests on the bug-hunter step's own report that nothing
    needed a hunt. On a change the triage skipped, the trailer attests that the triage saw the
    tree, not that a hunt did. *Rejected:* minting only where a run hunted, which trusted that
    report.
27. **Gate one's commits end with the non-closing reference #150's tracker adapter supplies
    (Adam, 2026-10-19)**, so that both changes use one form. *Rejected:* a form of this change's
    own, `Refs #N`.
28. **#150 cites this change for when bug-hunter runs (Adam, 2026-10-19)** (*Reported to other
    changes*).
29. **Skill names are checked by every command that runs a model step, against the skills that
    command loads (Adam, 2026-10-19).** A person's machine has skills: the shared-skills manager
    installs them in the person's home, such as `~/.claude/skills`. `/opt/igor/skills` is only
    the server's path. Under `igor run`, where `/opt/igor/skills` is absent, Igor falls back to
    the person's installed skills and passes them to each model step explicitly, since each run
    has a new home; #174 (`pinned-skills`) specifies the fallback. A dry run is checked, since
    its triage makes a model call; `igor role explain`, which runs none, is not. Decision 4 had
    refused an unknown name when the role loaded. *Rejected:* checking only against `/opt/igor/skills`, which
    would refuse, on a person's machine, every role that lists a skill.
30. **Merge commits carry no skill trailers (Adam, 2026-10-19)**, as bug-hunter's triage, which
    skips merges, already decides. Whether a model-written conflict resolution gets a bug hunt
    is issue [#214](https://github.com/adamstallard/igor/issues/214).
31. **The prose pass quotes untrusted text in a signed post in code spans (Adam, 2026-10-19)**,
    where @-mentions and markup take no effect. Signed text is published exactly, so the code
    cannot neutralise them afterwards.
32. **The model decides the reader goals for each item (Adam, 2026-10-19).** For a commit and
    its pull request description, the worker writes them to files in its outbox, by path
    pattern for a commit's docs and specs, and Igor passes each file to prose, so no
    goal reaches a command line (decision 15). `prose check` already takes per-file goals that
    way. `prose sign` takes them with `--goals-file`, which shared-skills
    [PR #27](https://github.com/adamstallard/shared-skills/pull/27) added (decision 47). Decision 40
    says who writes the goals for a post no worker run precedes, and decision 41 how a commit
    message's own goals reach prose. *Rejected:* fixed goals per kind of text in Igor's
    code, which cannot say what this item's reader came for.
33. **Every model step may read the skills directory (Adam, 2026-10-19).** Bug-hunter's
    instructions tell the model to read files beside its `SKILL.md`, and `--plugin-dir` grants
    no Read on them (#174). Reading is not running, and the directory holds no secret.
    *Rejected:* copying those files into prompts.
34. **The diff of the answers to the cold read is triaged too (Adam, 2026-10-19).** An attempt
    whose answers make a diff the triage does not skip fails, since answering a cold read
    changes prose, not code. Without the triage, `Bug-hunter-Tree:` would name edits no triage
    saw.
35. **Igor signs against its own index and builds on #137 (Adam, 2026-10-19)**, reversing design
    item 3's decision to sign against the API's tree. The two trees differ today only for a
    symbolic link or a submodule, which `main` uploads wrongly, and are equal once #137 carries
    both (task 0.4).
36. **Other commit paths cite this change (Adam, 2026-10-19):** `lore-from-corrections`'s lore
    proposal and the records `discussion-scribe` (#202) commits (*Reported to other changes*).
37. **A closing keyword for any issue but the item is refused at every gate (Adam,
    2026-10-19)**, in a commit body, a `Bug-hunter:` value, an open decision or a description,
    and the text goes back to the step that wrote it. Model text shaped by the item's untrusted
    text could otherwise close an unrelated issue on merge.
38. **A claim lost during the signing steps (Adam, 2026-10-19):** no further model step runs,
    and Igor publishes the worker's change as a draft pull request whose body its code writes.
    Nothing is signed by then, so the draft holds no signed text, and its commit carries no
    skill trailers, an exception to decision 5. The draft is offered as `task-execution` on
    `main` offers any work finished before a claim is lost; the next Igor to claim the item
    redoes the work, signed. A stop, unlike a lost claim, publishes nothing.
39. **A second worker run makes a second commit (Adam, 2026-10-19).** Where one of the
    repository's checks (`loop-verifies-commands`, #189) fails and the worker runs again, that
    run's edits become a second commit on top of the first run's signed commit. Bug-hunter and
    the prose pass run on that commit's diff only, and it carries its own trailers. *Rejected:*
    putting the second run's edits through every step again together with the first run's, as
    one commit, which repeats the full pass over work already signed.
40. **For a post no worker run precedes, the step that writes it states the reader goals first
    (Adam, 2026-10-20).** A reply to a mention is one such post. The step writes its goals file
    in a first turn, before it writes the post. Igor runs `prose sign`'s first call with that
    file, then resumes the same session (`claude -p --resume`) with the rules and the pass token
    on stdin, and the step writes the post. The step that already reads the item names its
    goals, so no second step has to read the item for them.
41. **A commit message's own goals reach `prose check` in a file (Adam, 2026-10-20).** The
    worker writes them to a goals file of their own in its outbox, as it writes the goals of the
    change's docs and specs, and Igor passes it with `--message-goals-file`. `check`'s
    `--goals-file` holds per-file `pattern: goal; goal` lines and cannot carry the message's
    goals, so shared-skills [PR #27](https://github.com/adamstallard/shared-skills/pull/27)
    added the option, in the format it gives `prose sign`'s file (decision 47). *Rejected:* a goal
    fixed in Igor's code, such as "review the change; check it is safe to merge", which would
    hold no item text but would not be the model's.
42. **Igor runs a post's first call too (Adam, 2026-10-20)**, confirming decision 16 for
    `prose sign`.
43. **In #150's reply after a revision, the part a model writes, saying what changed, is
    signed (Adam, 2026-10-20).** The list of answered change requests that the code assembles
    around that part is not signed (decision 8). A worker run precedes that reply, so the worker writes the
    reply's goals to a file in its outbox, beside the description's. #150 is to specify the
    reply that way (*Reported to other changes*).
44. **Citation commits carry no skill trailers** (Adam, 2026-10-20, reviewing #216 and
    shared-skills #25). A citation commit records, on the lore repository's `questions` branch,
    that a lore entry answered a question. It is a machine record with no trailer
    (shared-skills #25's decisions 90 and 110). So it is exempt, as a merge is, from decision
    5's rule that every commit Igor pushes carries its skills' trailers.
45. **A second worker run after a conflict resolution makes a signed commit on top of the merge
    (Adam, 2026-10-21).** After Igor merges the base in and resolves a conflict, #189 may run
    the worker again. That run's edits become a commit of their own on top of the merge commit,
    with their own diff, steps and trailers, as decision 39 has it for a second run on the first
    run's commit, and as #189's decision 22 has it. The merge commit stays unsigned (decision
    30). *Rejected:* folding the fix into the merge commit, which would publish model-written
    text unsigned.
46. **#216's question log files and miss files are not signed (Adam, 2026-10-21)**, as decision
    44 exempts citation commits. The inquisitor skill (shared-skills #25) writes both: a
    question log file records a question a worker asked or settled itself, and a miss file
    records a question a person said should have been settled without asking them. The Igor
    that #216 (`lore-search`) specifies pushes them to the lore repository's `questions`
    branch. A later Igor reads them, not a person, so the commits that push them
    carry no skill trailers. *Rejected:* putting each through the prose pass and signing it with
    a `Prose:` trailer.
47. **Prose's goals files are in force (Adam, 2026-10-21).** Adam merged shared-skills
    [PR #27](https://github.com/adamstallard/shared-skills/pull/27) into shared-skills `main`,
    which accepts its file format. `prose start` and `prose sign` take `--goals-file`, and
    `prose check` takes `--message-goals-file`; Igor runs only `sign` and `check`. Each such
    file holds goals separated by `;`, with no path pattern, unlike the `pattern: goal; goal`
    lines of `check`'s `--goals-file`. Task 0.16, which waited on PR #27, is ticked.

**Reported to other changes**, not edited here:

- **#190** (`review-evidence`) rewrites the description only on a revision; it is to rewrite it
  on gate two's implementation push too (decision 23). It also defines the pull request body's
  opening block, which this change defines too until #190 is built (decision 9).
- **#150** (`follow-the-two-gate-workflow`) is to cite this change for when bug-hunter runs
  (decision 28), and its adapter's non-closing reference is the one gate one's commits end with
  (decision 27).
- **`lore-from-corrections`** and **#202** (`discussion-scribe`) are each to cite this change
  for the commits they push (decision 36). Their commits have no issue, so decision 6's subject
  rule, the issue title, needs a form for them (*Still open*).
- **#174** (`pinned-skills`) is to fall back to the person's installed skills under `igor run`
  (decision 29).
- **#175** (`worker-user`) binds the trailers to the API's tree where the two trees differ,
  which decision 35 reverses, and cites a requirement of this change, *#153's trailers are
  created once, by the Igor, against the tree it staged*, that no longer exists by that name.
  It also restates this change's signing order, such as the triage of the prose pass's diff,
  which belongs here alone.
- **#188** and **#190** each label a logged model call `worker`, `bug-hunter` or `prose`, in
  #188's action log and #190's Commands run row. The cold reader's, the answers' and the
  triages' calls, which this change adds, fit none of the three; both are to add labels.
- **#190** still refuses an unknown skill name at load, which decision 29 narrows to a command
  that runs a model step.
- **#150**'s reply after a revision is to carry what changed, where a model writes it, as signed
  text, and the code-assembled list of answered requests unsigned (decision 43). Where the signed text sits in the reply, so that
  `prose verify-post` runs on exactly that span, is #150's to say, as decision 9 says it for a
  pull request body.

**Still open:**

- **Before building**, six tasks:
  - Task 0.15: whether bug-hunter's regression tests run under the commands a role already
    grants.
  - Task 0.17: whether a binary file and a clean-filtered file give equal trees.
  - Task 0.18: whether bug-hunter's triage runs as its own step on a given diff and model, and
    reports skip or hunt in a form Igor can read.
  - Task 0.19: whether the steps between prose's first and second calls fit in a pass token's
    two-hour life, and whether a token survives a second call that refuses for a reason other
    than the token, and whether goals given by path pattern cover a doc first changed after the
    first call. A token prose refuses always gets a new first call.
  - Task 0.20: whether sonnet's triage gives the same answer on the same diff from run to run.
  - Task 0.21: whether `claude -p --resume` continues the session of decision 40's first turn
    when #174 resets the step's home before each `claude -p` (*For Adam* 4).
- Every other measurement has run; `design.md`, *Measurements*, records what each showed.
- **Findings of the 2026-10-19 consistency read left for the next pass.** Each is the
  author's to fix unless it names another change, and none is built:
  - For a role listing only `bug-hunter`, no staging step is defined before the minting call
    that decision 26 requires.
  - A second bug-hunter iteration's `Bug-hunter:` value replaces the first's, so a commit whose
    first run fixed a bug can read "no bugs found", and no decision covers that.
  - Two choices are not among the decisions: that the cold reader gets only Read, and that
    under `igor run`, where the worker is Igor's own user and can write prose's token store, a
    `Prose:` trailer shows the steps ran but not that none forged a token. Whether a reader with
    only Read can do a commit's brief is unmeasured.
  - The commits of `lore-from-corrections` and `discussion-scribe` have no issue, so decision
    6's subject, the issue title, cannot apply to them.
  - Whether an issue Igor opens from chat is model-written and signed is not said.
  - How the redo after a lost claim (decision 38) treats the unsigned draft commit, since Igor
    never rebases its branches.
  - Decision 19 says it does not restate #175's checks, but restates them, without #175's
    nested-repository check and its rule that every model step has exited.
  - Where the worker runs a second time before the pull request opens (decision 39), which step
    writes the description, so that it covers both commits, is not said. More widely, the
    commit order places no `prose sign` call, cold read or answers for the description.
  - A role listing `bug-hunter` without #150 has open decisions that the opening block has no
    place for.
  - The signing steps have no time limits of their own: `task-execution` bounds a worker by
    silence on its stream and by an absolute ceiling, but names no such limit for the steps
    after it. And `main`'s sweep removes a working tree by its age, so a tree held through
    those steps could be removed while in use; #179's sweep, which goes by rank, not age,
    would end that risk.
  - The code-span rule of decision 31 is a prompt instruction no code checks; it does not say
    how to quote text holding a backtick, and the unsigned quoted words of decision 24 get no
    neutralising for @-mentions or markup.
  - Whether sonnet's triage gives the same answer from run to run is unmeasured (task 0.20).
  - Gate one's commit body rests on #150's non-closing reference closing nothing on merge,
    which #150's task 1.3 has not measured.
  - No scenario tests the git configuration variables on the signing calls, a post's `prose
    sign` calls running with Igor's git variables and a goals file, or the Read grant on the
    skills directory. *Head push* and *outbox* are defined in no spec this change archives
    into. Requirement text carries rationale besides the two sentences named in the last
    item, such as "so that the tree check never rests on the step's report". Two design choices are not among the
    decisions: one check per skill written in Igor's code, and one attempt bound for every
    role.
  - **From the 2026-10-21 consistency read:**
    - Task 5.1 omits #216, which also modifies *A role declares its sources* and *Merge
      semantics differ by field kind*.
    - The opening block this change defines until #190 is built would carry `main`'s
      `Closes #N`, a closing keyword, into a gate-one body, which #150 forbids because merging
      gate one must not close the issue. It also repeats #190's definition.
    - The `signed-publishing` requirement states its trailers with no exception, while this
      change publishes merges, citation commits, question-file commits and lost-claim drafts
      without them.
    - `design.md` says the footer proves a token was issued. The footer is a hash of the text,
      which anyone can compute, so it cannot show that a token was issued.
    - Under `igor run`'s fallback the worker can rewrite the scripts Igor signs with, so a
      signature there does not show the steps ran.
    - No task measures whether a Read grant on the skills directory reaches the files behind a
      link.
    - The staging rule restates #175's checks without its exited-steps and nested-repository
      conditions.
    - *Service user*, *worker user* and `skills_dir` are defined only in unarchived changes.
    - #216 counts every model step after the worker as a worker run that must send a completed
      report. These steps send none, so #216 would treat every run of a role listing `prose` as
      having met a sensitive question, and withhold its transcript and description. That is
      reported to #216.
  - *Understood line* and *answers file* are defined only in `design.md`. Three SHALLs lack a
    scenario: a second call refusing a doc as a failed attempt, the claim check before each
    model step, and a post's cold reader having no tool but Read on the skills directory. Two
    rationale sentences sit in `task-execution`'s requirement text: that every trailer binds
    the last staging, and that prose keeps its token store in the git directory.

**For Adam.** Questions 1 to 3 come from the 2026-10-21 consistency read and have no
recommendation yet; question 4 waits on another decision of his:

1. **The description after a second run that follows a conflict resolution.** Decision 45 puts
   that run's commit on top of the merge. A conflict resolution leaves the description as it
   is, so the description would not describe that commit, while #189 says a pull request's
   summary is the last published run's. Should that commit's push rewrite the description?
2. **A missing or empty goals file the worker wrote.** The `signed-publishing` spec counts it
   as a failed attempt, and a failed attempt goes back to the model step that wrote the failing
   text. A commit's goals files come from the worker, which is no step this change sends work
   back to. Does the worker run again, or does the item fail?
3. **No seat partway through the signing steps.** A *seat* is a model subscription a call is
   charged to, and the budget gate chooses it for each call. The signing steps add six to eight
   model calls after the worker, and nothing says what happens when the gate names no seat, or
   the provider refuses, partway through them: a failed attempt, a handoff, or an unsigned
   draft as after a lost claim.
4. **Decision 40's resume, which waits on a decision of Adam's.** #174 (`pinned-skills`) resets
   the step's `~/.claude` before every `claude -p`, which deletes the first turn's session log,
   so `claude -p --resume` would find no session. Adam is choosing between #216's per-run
   `CLAUDE_CONFIG_DIR` (#216's decision 87) and #174's per-run home with its template reset,
   and this question waits on that choice. If the resume cannot work, the fallback is a second
   step given the first turn's goals file, with no resume. Task 0.21 measures the resume.

## Why

An Igor publishes text that no check has read: the commit message is the issue title, and the
pull request description is the start of the worker's final message, cut to its first 700
characters. A pointer to the full transcript
follows the cut; a description published uncut needs none. Nothing holds the message or the
description to the prose rules, and nothing records that bug-hunter ran over the code being
committed. Issue [#139](https://github.com/adamstallard/igor/issues/139) decides the rule that
fixes this for every piece of text an Igor publishes.

## What Changes

- Roles list the skills their worker uses (decision 4).
- For a role that lists `prose`, every model-written post goes through prose's pass, is signed
  by Igor's code, and is verified before it is published (decisions 2, 3, 7, 16).
- Every commit Igor pushes, other than a merge, goes through the steps for the skills its role
  lists, bug-hunter and the prose pass, and is signed and verified before it is committed, with
  the message decision 6 sets out (decisions 5, 11, 12).
- A pull request description is written by the prose pass, published uncut between the opening
  block and the evidence marker, and rewritten on gate two and each revision (decisions 9, 10).
- Code-assembled text stays unsigned (decision 8).

Replies from `directed-interaction`, and the numbered questions from
[#140](https://github.com/adamstallard/igor/pull/140), are published text, so this change
governs them. Neither change is edited here: the rule lives in one place, and they follow it.

## Capabilities

### New Capabilities

- `signed-publishing`: the rule for every text an Igor publishes, on any surface. A model
  writes between prose's two calls, which Igor's code runs; the posting code verifies; a
  failure goes back to be redone; repeated failure publishes nothing.

  It is a new capability because no existing one owns publishing text. Posts are spread across
  `work-claiming` (claims), `graceful-handoff` (handoffs and receipts), `task-execution` (the
  pull request) and `directed-interaction` (replies). Putting the rule in any one of them would
  leave the others to restate it.

### Modified Capabilities

- `role-config`: a role declares `skills`, the pinned skills its worker uses, inherited by
  adding.
- `task-execution`: owns producing the artifact, so it gains what is specific to a commit and a
  pull request. Every commit Igor pushes, other than a merge, is verified against the signed
  trees, the prose trailer and the issue title before it is committed, whether by `produce()`
  or by #150's head push. The pull request description is written by the prose pass
  instead of cut from the worker's final message, is published uncut, and is re-signed on gate
  two and on each revision, never on a catch-up resolution.

## Impact

- **Six or seven more `claude -p` steps per commit Igor pushes**: bug-hunter, the prose pass,
  the cold read and the prose pass's answers to it, bug-hunter's triage of the prose pass's diff
  and of the answers' diff, and one more bug-hunter iteration where that triage does not skip. A
  post adds two: the cold read and the answers; a post no worker run precedes adds a third, the
  turn that writes its goals (decision 40). A role pays them only for the skills it lists;
  task 4.1 measures the cost per item.
- **Depends on the prose and bug-hunter skills** from the shared-skills repository, which is
  not public yet. Bug-hunter's caller-commits mode is on its `main` (task 0.2). Prose's `sign`
  and `check` take their reader goals from files since shared-skills PR #27 merged (decision
  47). Igor loads
  both as the `igor` plugin, with `--plugin-dir`, as `pinned-skills` (#174) builds it, or under
  `igor run` without the server's install, from the person's own (decision 29).
- **Builds on `carry-what-a-tree-holds` (#137).** Until it is built, #175's checks stop a
  change holding a symbolic link or a submodule before staging, since the tree Igor would upload
  differs from its staged tree for either (`design.md`, item 3).
- **Works whichever of this change and `review-evidence` (#190) lands first** (decision 9).
