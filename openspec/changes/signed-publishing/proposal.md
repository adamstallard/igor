## Decisions

Each decision names who made it and when. Adam decided 1 to 3, 7, 8 and 18 on 2026-09-30 in
[#139](https://github.com/adamstallard/igor/issues/139), which holds their reasoning; where
#139 differs from decisions 12 and 16, they hold (Adam, 2026-10-18).

Terms. An *Igor* is one role of the agent, acting under its own GitHub App; the *item* is the
issue or pull request it works on. Under the two-gate workflow (#150), *gate one* publishes a
change's specification and *gate two* its implementation, on the same pull request; a
*revision* is a push at either gate answering a reviewer's change request. `produce()` opens a
pull request; #150's *head push*, built on the `commitOnBranch` primitive already on `main`,
pushes onto an existing one. Prose signs in two calls: the
first prints the rules and a one-use *pass token*; the model writes by the rules; the second,
given the token, signs, after a *cold read*, a fresh model step reading the text with none of
the conversation behind it. The *prose pass* is the model step that writes between the two
calls. *Reader goals* are what prose is told each text's reader came for. Bug-hunter's
*caller-commits mode* reviews and fixes a change and reports its result without committing; its
*triage* decides whether a diff needs a hunt, and its *first triage* runs on the whole change
before any hunt. The *state branch* is where Igor records each item's outcome.

1. **A model writes; Igor's deterministic code signs, verifies and publishes** (Adam,
   2026-09-30, #139; decision 16 sets which calls the code runs). Prose's first call prints the
   rules before the model writes, and its second call signs; the code checks the result, because
   the model's word is not proof. *Rejected:* the code checking text on its own, which cannot
   apply the rules a model applies while writing; and trusting the model's report that it
   checked, which text edited after its signature would pass.
2. **Every text a model writes for an Igor to publish goes through prose's pass and is signed
   (Adam, 2026-09-30)**: pull request descriptions, replies, questions, and any other
   model-written post to GitHub, Discord or Linear. `prose sign` signs it, appending a
   `prose ✓ <6 hex>` footer hashed over the text above it. *Rejected:* signing commits only,
   which leaves the posts a reviewer reads first unchecked.
3. **The code that posts runs `prose verify-post` on the exact text first (Adam, 2026-09-30)**,
   and posts nothing that fails. *Rejected:* relying on prose's posting hook, which guards only
   posts made from a Claude Code session, not Igor's own code.
4. **A role lists the skills its worker uses (Adam, 2026-10-11).** `skills: [<name>, …]` names
   pinned skills from #174's `igor` plugin. The list decides which steps Igor runs and checks,
   not what loads: #174 loads every installed skill for every role. The org base may set it for
   every role and a role may add to it, never remove; an unknown name is refused at load. Igor's
   code checks per listed skill: for `prose`, a valid footer on every model-written post and a
   matching `Prose:` trailer on every commit; for `bug-hunter`, a `Bug-hunter:` trailer, with
   `Bug-hunter-Tree:` bound to the staged tree whenever a bug-hunter run hunted, its first triage
   or an extra iteration. A role that lists neither publishes as today.
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
   - the reference that links without closing (on GitHub, `Refs #N`) only on gate one's
     commits, its revisions included, matching #150's rule that gate one closes nothing.

   *Rejected:* `Closes #N` everywhere, which would close the issue when gate one merges; and
   `Refs #N` on gate-two revisions, since a squash merge that took its message from the last
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
   block is the line linking the pull request to its item, preceded under #150 by the bug-hunter
   open decisions #150 places first; once #190 is built, #190 defines it. Every line the code
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
    4. Bug-hunter's triage runs on the prose pass's diff, on the one model decision 17 pins
       (which model is *For Adam* 2). A diff it skips gets no hunt; any other diff gets one more
       bug-hunter iteration.
    5. Igor stages once more and runs both signing calls: prose's second call, with the token
       and the cold read, and bug-hunter's minting script, which writes `Bug-hunter-Tree:`.

    The scripts come from the root-owned skills directory (#174), run with Igor's own git
    directory and index, so running them as the service user executes nothing the worker wrote.
    `Bug-hunter-Tree:` attests that bug-hunter's triage saw every change in the tree, and that
    bug-hunter hunted each change its triage did not skip. Bug-hunter's triage line is wider
    than comments or docs: it also skips tests, specs, lockfiles, generated files, formatting
    and renames (task 0.11); whether that line is the one wanted is *For Adam* 1. *Rejected:*
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
    through a file, as #175 sets out. The reader goals Igor gives prose are drawn from the item,
    whose text may be private, so they stay off every prose command line too; prose has no way
    to take all of them from a file yet (task 0.16). #175 specifies the stdin rule, in its
    `task-execution` requirement *A prompt reaches claude on stdin, never in its arguments*, and
    #175's systemd unit also sets `ProtectProc=invisible`. *Rejected:* relying on
    `ProtectProc=invisible` alone, which leaves a prompt readable wherever the setting does not
    hold, such as under `igor run`, which no systemd unit starts.
16. **Igor runs prose's first call itself, as its service user, and gives the rules and the
    pass token to the step in its prompt (Adam, 2026-10-18).** The model does the pass, and Igor
    runs the second call. The worker user never writes prose's token store, so it cannot forge a
    token. This holds for a commit's `prose check` and a post's `prose sign`, and the worker is
    granted no prose or bug-hunter script. *Rejected:* the worker running the first call, which
    fails because the token store is in a git directory the worker cannot write (task 0.9); and
    Igor pre-creating a token directory the worker's group can write, which works but lets the
    worker forge a token, since a token is a plain file.
17. **Igor runs the triage of the prose pass's diff on one pinned model (Adam, 2026-10-18).**
    Haiku and sonnet split on a spec-only diff (task 0.11), so an unpinned triage could hunt one
    run and skip the next. Which model is *For Adam* 2.
18. **No GitHub Action** (Adam, 2026-09-30, #139). Igor runs the checks in its own pipeline, so
    a CI check would only re-verify its work (#139, section 4).

**Still open:**

- **Before building**, three tasks:
  - Task 0.15: whether bug-hunter's regression tests run under the commands a role already
    grants.
  - Task 0.16: prose taking every call's reader goals from a file, a change to the shared-skills
    repository. The first calls of decision 16 wait on it, and with them the whole change,
    unless Adam accepts *For Adam* 13, whose goals hold no item text.
  - Task 0.17: whether a binary file and a clean-filtered file give equal trees.
  - Task 0.18: whether bug-hunter's triage runs as its own step on a given diff and model, and
    reports skip or hunt in a form Igor can read.
- Every other measurement has run; `design.md`, *Measurements*, records what each showed.

**For Adam,** each a question this change cannot settle alone, with a recommendation. Where the
spec deltas already state an item's answer, they follow its recommendation; if Adam decides
otherwise, the requirement that states it changes.

1. **Bug-hunter's triage line.** Decision 12 names a prose diff of comments or docs as the one
   to skip. Bug-hunter's own triage also skips a prose diff that changes tests, specs,
   lockfiles, generated files, formatting or names (task 0.11), so such an edit is never hunted.
   *Recommendation:* accept bug-hunter's line; the prose pass is not meant to change code, and a
   second rule in Igor's code would drift from the skill's.
2. **Which model the triage is pinned to.** On the seven measured diffs sonnet drew bug-hunter's
   written line on every one, skipping the spec-only diff as that line says; haiku reviewed that
   diff. *Recommendation:* sonnet, with item 1's recommendation; haiku if decision 12's narrower
   line is kept.
3. **The cold read.** Prose's second call signs only after a cold read. This change has Igor run
   the cold reader as a fresh model step whose whole prompt is the brief, and the prose pass
   answer it; with no person to ask, every finding must be fixed, and a kept one is a failed
   attempt (`design.md`, *Every signature needs a cold read*). *Recommendation:* as written.
4. **Who rewrites the description on gate two's implementation push.** Decision 10 rewrites it
   there; #190 rewrites it only on a revision. *Recommendation:* confirm decision 10, so that
   #190 adds gate two's implementation push. This change does not edit #190.
5. **Model or person text inside code-assembled posts, published unsigned.** #150 includes
   bug-hunter's open decisions in gate two's body, which this change puts in the opening block,
   and #140 posts them as numbered questions; a nothing-to-do handoff carries the worker's own
   account of why it declined (`src/loop.ts`), which `directed-interaction` publishes as its
   question; an issue Igor opens from chat (`work-claiming`) or from a mention (#140) quotes the
   person's request and links it. #140 also places a question in the artifact's description;
   under this change that question is part of the signed description, not one of these
   exceptions. The signed-publishing spec states these as the exceptions. *Recommendation:*
   accept them unsigned: each is someone else's words, quoted as theirs inside text the code
   assembles, not text the model presents as its own; and #140 acts only on an answer that picks
   one of the options Igor recorded, so the text cannot make Igor do anything it had not already
   proposed.
6. **Whether Igor still runs `prose start`.** Nothing in a worker checks the gate it opens, and
   under decision 16 the prose pass gets its rules from the first call Igor runs.
   *Recommendation:* drop it. That also drops `prose start` from task 0.16 and removes the
   reason #174's decision 14 and #175's decision 15 give for keeping the session mark (the file
   `prose start` writes to open the gate) in the worker's home.
7. **A triage skip is the step's own word.** Whether a commit needs `Bug-hunter-Tree:` rests on
   bug-hunter's report that its first triage found nothing to hunt, and nothing checks that
   report. *Recommendation:* mint `Bug-hunter-Tree:` on every commit, against the tree Igor
   stages, so the tree check never rests on the report; on a change the triage skipped, the
   trailer then attests that triage saw the tree, not that a hunt did.
8. **`Refs #N` or #150's `Answers #n`.** The spec takes the reference that links without closing
   from the item's tracker adapter, with `Refs #N` as GitHub's example; #150 names `Answers #n`.
   *Recommendation:* one form for both, the one #150's adapter supplies.
9. **When bug-hunter runs, stated twice.** #150 runs it at gate two "where the role configures
   bug-hunter as a pipeline step" and says gate-one commits carry `Bug-hunter: skipped at triage
   (spec only)`; this change runs it on every commit where the role lists `bug-hunter`.
   *Recommendation:* #150 cites this change's rule.
10. **Where `skills_dir` does not exist, every skill is unknown.** `skills_dir` names a server
    path (#174), so where it does not exist every role whose org base lists `prose` is refused
    at load, which breaks `igor role explain`, the dry run and same-user `igor run`.
    *Recommendation:* check names only in a command that runs a model step, and only where the
    directory exists, naming it when it does not. The `role-config` delta is written to this
    recommendation, which narrows decision 4's "refused at load".
11. **A conflicted catch-up's resolution is a merge**, so model-written code reaches the branch
    with no trailers. *Recommendation:* accept the gap for now; signing a merge needs a design of
    its own.
12. **Quoted untrusted text.** Signed text is published exactly, so model text quoting untrusted
    content can carry @-mentions or markup the code cannot neutralise. *Recommendation:* the
    prose pass's prompt tells it to quote untrusted text in code spans; nothing else is needed
    before building.
13. **The reader goals** Igor passes to prose's calls are not chosen yet; task 0.5 waits on
    them. *Recommendation:* fixed goals per kind of text (the commit message, a changed doc, a
    changed spec, a description, a reply), written in Igor's code, such as "review the change;
    check it is safe to merge" for a commit, so that no item text reaches them. That also lifts
    task 0.16's block: goals holding no item text are not private, so decision 15 does not keep
    them off a command line.
14. **Bug-hunter's own files.** `--plugin-dir` gives a step no Read access to a skill's files
    (#174), and bug-hunter's instructions tell the model to read files beside its `SKILL.md`,
    such as the triage rule in `reference.md`. Prose's steps need none (`design.md`, *The model
    writes between prose's two calls*). *Recommendation:* grant every model step Read on
    `<skills_dir>`, which is root-owned and holds no secret, rather than copying files into
    prompts.
15. **The answers to the cold read are model edits after bug-hunter's triage.** Without a rule,
    `Bug-hunter-Tree:` would name a tree holding edits no triage saw. This change runs the
    triage on the answers' diff too, and a diff it does not skip fails the attempt, since
    answering a cold read changes prose, not code. *Recommendation:* as written.
16. **Signing against Igor's index, building on #137.** Design item 3 decided to sign against
    the API's tree where the two trees can differ. They differ today only for a symbolic link or
    a submodule, which `main` uploads wrongly, and are equal once #137 carries both (task 0.4).
    This change signs against `git write-tree` of Igor's index and builds on #137, so until #137
    is built a change holding a link or a submodule is refused as a tree mismatch.
    *Recommendation:* reverse design item 3's decision and sign against Igor's index: today's API
    tree carries a link or a submodule wrongly, so signing it would sign a wrong upload.
17. **Commit paths other than `produce()` and #150's head push.** `lore-from-corrections`
    publishes a model-drafted lore entry as a pull request through the existing propose path,
    and `discussion-scribe` (#202) commits model-written records and posts chat summaries.
    *Recommendation:* decision 5 covers every commit Igor pushes, so each of those changes cites
    this one for its path; this change does not edit them.
18. **Closing keywords for other issues.** Model text shaped by an item's untrusted text could
    end a commit body, a `Bug-hunter:` value or a description with `Fixes #999`, which closes an
    unrelated issue on merge. This change refuses any closing keyword other than the closing
    linkage decision 6 sets for the item itself, at every gate, and sends the text back to the
    step that wrote it. *Recommendation:* as written.
19. **Staging before the prose pass.** #175 says nothing stages before the last model step
    exits, and lists when this change (#153) stages as its own question for Adam. This change
    stages before prose's first call, since the token records the goals of the docs the first
    call sees staged (task 0.9), and makes #175's link and hard-link checks before every
    staging. *Recommendation:* as written, and #175 is changed to allow staging after its
    checks.
20. **A claim lost during the signing steps.** Igor checks for a stop and its claim before each
    model step after the worker, as at any checkpoint; a stop publishes nothing.
    `task-execution` on `main` publishes what exists as a draft on a lost claim, but at that
    point no text is signed. *Recommendation:* run no further model step and publish the
    worker's change as that draft, with a body the code assembles and no signed text; the next
    Igor to claim the item redoes it, signed, before it can merge.

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

- **Five or six more `claude -p` steps per commit Igor pushes**: bug-hunter, the prose pass,
  the cold read and the prose pass's answers to it, bug-hunter's triage of the prose pass's
  diff, and one more bug-hunter iteration where that triage does not skip. A post adds the
  cold read and the answers. A role pays them only for the skills it lists; task 4.1 measures
  the cost per item.
- **Depends on the prose and bug-hunter skills** from the shared-skills repository, which is
  not public yet. Bug-hunter's caller-commits mode is on its `main` (task 0.2). Prose needs a
  file form for every call's reader goals before decision 16 is built (task 0.16). Igor loads
  both as the `igor` plugin, with `--plugin-dir`, as `pinned-skills` (#174) builds it.
- **Builds on `carry-what-a-tree-holds` (#137).** Without it, the tree Igor uploads differs
  from its staged tree for a symbolic link or a submodule, and such a change fails as a tree
  mismatch (`design.md`, item 3).
- **Works whichever of this change and `review-evidence` (#190) lands first** (decision 9).
