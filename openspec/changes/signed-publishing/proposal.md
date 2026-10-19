## Decisions

1. **A model step signs; the deterministic code verifies and publishes** (decided in #139).
   Running `prose check` or `prose sign` shows the model the rules while it writes, and the code
   checks the result because the model's word is not proof. *Rejected:* the code checking text
   on its own, which cannot apply the rules a model applies while writing; and trusting the
   model's report that it checked, which text edited after its signature would pass.
2. **Every text a model writes for an Igor to publish is signed** by the step that wrote it:
   pull request descriptions, replies, questions, and any other model-written post to GitHub,
   Discord or Linear. The step signs with `prose sign`, which appends a `prose ✓ <6 hex>`
   footer hashed over the text above it. *Rejected:* signing commits only, which leaves the
   posts a reviewer reads first unchecked.
3. **The code that posts runs `prose verify-post` on the exact text first**, and posts nothing
   that fails. *Rejected:* relying on prose's posting hook, which guards only posts made from a
   Claude Code session, not Igor's own code.
4. **A role lists the skills its worker uses (Adam, 2026-10-11).** `skills: [<name>, …]` names
   pinned skills from #174's `igor` plugin. The list decides what the worker is directed to use
   and what Igor's code checks, not what loads: #174 loads every installed skill for every role. The org base may set it for every role and a role may
   add to it, never remove; an unknown name is refused at load. Igor's code checks per listed
   skill: for `prose`, a valid footer on every model-written post and a matching `Prose:` trailer
   on every commit; for `bug-hunter`, a `Bug-hunter:` trailer, with `Bug-hunter-Tree:` bound to
   the staged tree unless bug-hunter's first triage, run on the whole change before any hunt,
   found nothing to hunt and skipped it. A role
   that lists neither publishes as today. *Rejected:*
   a switch for "posts" and "commits", which cannot say which skill's check applies.
5. **Every commit Igor pushes for an item, other than a merge, goes through the model steps for the skills
   its role lists (decision 4), and carries their trailers (Adam, 2026-10-13; when the trailers
   are made, see decisions 11 and 12)**, whether
   `produce()` opens a pull request with it or `commitOnBranch`, under #150, pushes gate two's
   implementation or a revision:
   - bug-hunter, in its caller-commits mode, reviews and fixes the change; its trailers are
     `Bug-hunter:` and `Bug-hunter-Tree:`;
   - the prose pass writes the message; its trailer is `Prose: ✓ <tree>:<message>`, where
     `<tree>` and `<message>` are short hashes of the staged tree and the message.

   Igor commits through the API only when `prose verify-staged` accepts the trailer, the staged
   tree equals every signed tree, and the subject is the issue title as decision 6 sets out.
   *Rejected:* signing only in `produce()`, which leaves gate two's commit unsigned, so the tests
   that `loop-verifies-commands` (#189) runs on the signed tree would not test what gate two
   commits.
6. **The commit message (Adam, 2026-10-13),** for a role that lists `prose`. The subject is the issue title with any closing
   keyword dropped (GitHub's `close`, `fix` or `resolve` in any form, followed by an issue
   reference, as in a title like `Login fails (fixes #12)`), so a title cannot close an issue by
   itself. The body explains the change and ends with one of two lines:
   - `Closes #N` on every commit of a role that does not use the two-gate workflow (#150), and
     on every gate-two commit under #150, the implementation and each revision after it;
   - `Refs #N` only on gate one's commits, its revisions included, matching #150's rule that
     gate one closes nothing.

   *Rejected:* `Closes #N` everywhere, which would close the issue when gate one merges; and
   `Refs #N` on gate-two revisions, since a squash merge that took its message from the last
   commit would then carry no closing keyword, and the issue would stay open.
7. **A failed check goes back to the model step with the reason**, to redo and sign again. After
   two attempts in total, the code publishes nothing and records the failure. *Rejected:*
   retrying without a bound, which lets one failing step spend the seat's budget (the model
   subscription the Igor draws on) on one item.
8. **Text the code assembles from recorded state is not signed:** handoffs, stop receipts and
   claim messages. The code's authors wrote it and it is reviewed as code. *Rejected:* signing
   handoffs too. A handoff is needed exactly when a model call may be impossible, so requiring
   a model call would leave an Igor silent in the case `graceful-handoff` exists for.
9. **A pull request body is the opening block, then the signed description, then the code's
   evidence section (Adam, 2026-10-13).** Until `review-evidence` (#190) ships, the opening block
   is the line linking the pull request to its item, preceded under #150 by the notes #150 places
   first, such as gate one's "specification only" opening and, at gate two, bug-hunter's open
   decisions; once #190 ships, #190 defines it. Every line the code adds after the description
   starts at the marker `<!-- igor:evidence -->`, which #190 defines; before #190 ships there is
   no marker, and the description runs to the end of the body. The description is exactly the span between the
   opening block and the marker, and `prose verify-post` runs on exactly that span. Neither the
   opening block nor the evidence section is signed. *Rejected:* signing the whole body, which
   would put code-assembled text under the model's signature and break it each time the code
   rebuilds its section.
10. **The description is rewritten only when what the worker did changes (Adam, 2026-10-13):**
    on gate two's implementation and on each revision, with the opening block recomputed for
    that push. A catch-up resolution, a push that only merges the base branch in and resolves
    its conflicts, leaves it as it is. *Rejected:* rewriting on every push, which costs a model
    call for a resolution that changes nothing the description says.
11. **A commit's trailers are made once, at the end (Adam, 2026-10-17, on #175).** Bug-hunter runs,
    then the prose pass. Each edits the tree, and neither signs it. After the last model step
    exits, Igor stages the change once, in its own index, and every trailer, bug-hunter's and the
    prose pass's, is created against that tree, the tree Igor records and publishes. *Rejected:*
    each step signing as it finishes, with Igor restaging before each signing. Under #175
    (`worker-user`) a step cannot stage for itself, since it runs as a worker user that cannot
    write the git directory. And signing in turn would leave the prose pass's edits outside the
    tree bug-hunter signed.
12. **Igor's code runs the signing calls for a commit, and bug-hunter triages the prose pass's
    diff (Adam, 2026-10-17, answering questions raised on #175).** The order is:
    1. Bug-hunter runs, and ends by reporting its result block: the `Bug-hunter:` value, such
       as `1 iteration, 1 bug fixed`, which becomes that trailer, and any open decisions.
    2. The prose pass writes a draft message, runs prose's first call on it, which prints the
       rules and a pass token, rewrites the message and the change's prose by those rules, and
       ends by reporting that token.
    3. Bug-hunter runs its usual triage on the prose pass's diff. A diff that touches only
       comments or docs is skipped; anything else gets one more bug-hunter iteration.
    4. Igor stages once, in its own index, and runs both signing calls itself: prose's second
       call, `prose check --pass <token>`, with the prose pass's token, and bug-hunter's minting
       script, which writes `Bug-hunter-Tree:` for the staged tree.

    Both trailers then name the tree Igor publishes. The signing scripts come from the
    root-owned skills directory (#174), so running them as Igor's service user executes nothing
    the worker wrote. For commits this narrows decision 1: the model step still runs the call
    that prints the rules, and the token it reports is what shows it did, since prose's second
    call accepts only a token its first call issued. `Bug-hunter-Tree:` names the staged tree.
    It attests that bug-hunter reviewed every change in that tree, except prose-pass edits its
    triage judged to touch only comments or docs. #139's design already let such an edit pass
    bug-hunter's triage and only re-mint the tree. A commit can still be refused for a
    mismatch: between the tree the trailers name and the tree the Git Data API builds, or
    between the message Igor commits and the one the `Prose:` trailer hashes. Since Igor's code
    made both bindings, either is recorded as the item's failure without going back to a step.
    *Rejected:* the steps running the signing calls themselves, which under #175 they cannot do
    against Igor's index; and bug-hunter running again after every prose pass, which spends a
    hunt on a diff of comments.
    Adam confirmed on 2026-10-18 that this decision holds over #139, which had the model step
    run both of prose's calls and mint bug-hunter's trailer itself; #139's body now says so.
13. **No second prose pass after the extra bug-hunter iteration (Adam, 2026-10-18).** Comments
    that iteration writes reach the tree after the prose pass, and no prose pass reads them.
    This is an accepted gap. The prose pass is not meant to change code, so a prose diff that
    needs another hunt is an edge case, not worth a second prose pass.
    *Rejected:* a second prose pass after that iteration, and narrowing the `task-execution`
    rule that the prose pass rewrites the docs and comments the change touches, so that it
    excludes those comments.
14. **Confirmed (Adam, 2026-10-18): where each signing failure goes back.** A tree or message
    mismatch when Igor commits goes back to no step: between the tree the trailers name and the
    tree the Git Data API builds, or between the message committed and the one `Prose:` hashes.
    It is Igor's own bug, so the item fails loudly. A token that prose's second call refuses
    goes back to the prose pass, which runs its first call again and reports a new token.

15. **No prompt text goes on a command line** (Adam, 2026-10-18, decided on
    [#175](https://github.com/adamstallard/igor/pull/175)). `/proc/<pid>/cmdline` is readable by
    every user on the server, so a worker of one role could read another role's prompt, with
    private source content in it. Each model step's prompt reaches `claude -p` on stdin, and the
    prose rules reach its system prompt through `--append-system-prompt-file`, never
    `--append-system-prompt`. The goals Igor gives `prose start` are drawn from the item, whose
    text may be private, so they stay off `prose start`'s command line too. #175 specifies the
    stdin rule, in its `task-execution` requirement *A prompt reaches claude on stdin, never in
    its arguments*, and #175's systemd unit also sets `ProtectProc=invisible`. *Rejected:*
    relying on `ProtectProc=invisible` alone, which leaves a prompt readable wherever the setting
    does not hold, such as under `igor run`, which no systemd unit starts.

**Still open:**

Measurements remain before building. The first four are these:
task 0.3, that a fresh `claude -p --session-id <uuid>` reports that id to prose's hook; task
0.4, whether the clone's staged tree equals the tree the Git Data API builds; task 0.9, whether
a pass token from a first call the worker user ran can be spent by Igor's service user, given
where prose keeps its tokens; and task 0.10, whether bug-hunter can mint its trailer as a
separate call against a tree, after its run has ended. If 0.3 finds the hook gets another
session id, or 0.4 finds the two trees differ, that changes which session the steps run in or
which tree the trailers are made against
(`design.md`, items 1 and 3). A failure of 0.9 or 0.10 means decision 12 needs a change to the
prose or bug-hunter skill, and comes back to Adam before building.

Two more measurements, found by a consistency read on 2026-10-18: task 0.11, whether
bug-hunter's own triage skips exactly a diff touching only comments or docs, as decision 12
assumes; and task 0.12, whether the signing scripts, run as Igor's service user, can be pointed at
#175's separate git directory and index. If they are not, they run in the worker's tree and follow
a `.git` the worker can replace. That `.git` can name its own hooks and config, such as
`core.fsmonitor`, so a git command a script runs could execute the worker's code as Igor. If
0.11 finds a different line, or 0.12 finds a script that cannot be pointed at that directory,
decision 12 comes back to Adam before building.

Task 0.13 asks whether `prose start` can take its goals other than as an argument. Today it
takes them only as `--goals` on its command line. If it cannot, decision 15 needs a change to
the prose skill, and comes back to Adam before building. Task 0.14 measures whether
bug-hunter's caller-commits mode works without staging, which a worker user cannot do, and task
0.15 whether the tests bug-hunter writes run under the commands a role already grants. If either
fails, decision 12 or the grants come back to Adam before building. Task 0.2 checks #139's record
that caller-commits mode has landed against the shared-skills repository; if it has not, building
waits for it.

The choices `design.md` records as decided on 2026-10-11, under *Decided questions*, stand
beside decisions 1 to 15: Igor runs `prose start`, the signing scripts are granted by path, and
the tree is measured before signing.

**Reconciled on 2026-10-18 with #190, #140 and #174, where the fix was mechanical:**
- The opening block is #190's to define. Before #190 ships, this change names it only as the
  linkage line after the text #150 places first, and no longer lists that text, so #190's
  requirement stays the one place the block's contents are spelled out.
- A role's `skills` list decides what its worker is directed to use and what Igor checks, not
  what loads; #174 loads every installed skill for every role (decision 4). This matches what
  #174 now says. Nothing here depends on #174's decision 7, one plugin directory for every role,
  which #174 still lists for Adam.
- `design.md` item 1 no longer says the first-write gate runs where prose's hooks are installed
  for Igor's user: #174 resets every model step's home to a template with no hooks, so the gate
  never runs in a worker.

**For Adam,** each a conflict or a question this change cannot settle alone:
- **Who rewrites the description on gate two's implementation push.** Decision 10 (Adam,
  2026-10-13) rewrites it there. #190 rewrites it only on a revision, which it defines as a push
  answering a reviewer's change request, so on gate two it leaves the description as it is.
  *Question:* confirm decision 10 over #190's text, so that #190 adds gate two's implementation
  push to the pushes where this change rewrites the description. This change does not edit
  #190.
- **Bug-hunter's open decisions are model text, published unsigned.** Decision 2 signs every text
  a model writes for an Igor to publish, but #150 places the open decisions in the opening block
  at gate two, and the code assembles that block and does not sign it (decision 9). #140 then posts them as numbered questions a
  person answers. Sign them, or accept them unsigned because #140 matches an answer against
  the options Igor recorded, never against the text?
- **Whether Igor still runs `prose start`.** Under #174's reset nothing in a worker checks the
  gate it opens (reconciled above). Dropping it would remove `prose start` from task 0.13. It
  would also remove the reason that #174's decision 14, and decision 15 of #175, give for
  keeping the session mark in the worker's home, since both rest on a hook that reads the mark. *Recommendation:* drop it; the
  token from prose's first call, which only that call issues, is what shows the pass ran.
- **A triage skip is the step's own word.** Whether a commit needs `Bug-hunter-Tree:` depends on
  bug-hunter's report that its first triage found nothing to hunt, and nothing in Igor's code
  checks that report (decision 1 says the model's word is not proof). *Recommendation:* mint
  `Bug-hunter-Tree:` on every commit, against the tree Igor stages as the other trailers are, so
  the tree check never rests on the report.
- **`Refs #N` or #150's `Answers #n`.** Decision 6 ends gate one's commits with `Refs #N`; #150
  names `Answers #n` as GitHub's reference that links without closing, and has the adapter
  supply it. The spec now takes the form from the item's tracker adapter, and gives decision 6's
  `Refs #N` as the GitHub example; under #150 that example would be `Answers #n`.
  *Recommendation:* one form for both, the one #150's adapter supplies.
- **When bug-hunter runs, stated twice.** #150 runs it at gate two "where the role configures
  bug-hunter as a pipeline step" and says gate-one commits carry `Bug-hunter: skipped at triage
  (spec only)`; this change runs it on every commit where the role lists `bug-hunter`. #150's
  "skipped at triage" also assumes triage skips a spec-only change, which task 0.11 has not
  measured. *Recommendation:* #150 cites this change's rule instead of stating its own.
- **An unknown skill on a person's machine.** `skills_dir` names a server path (#174), so where
  it does not exist every role whose org base lists `prose` is refused at load, which breaks
  `igor role explain`, the dry run and same-user `igor run`. #174 lists the missing directory as
  open. *Recommendation:* check names against `skills_dir` only in a command that runs a model
  step, and only where the directory exists, naming it when it does not.
- A conflicted catch-up's resolution is a merge, so it carries model-written code with no
  trailers.
- Listing a skill grants its scripts outside the role's `commands`, which the in-force
  `role-config` says is the only grant; this change adds `skills` to that requirement's keys but
  leaves its sentence on `commands` as it is. *Recommendation:* name the exception in that
  requirement, since the grant is by path into a root-owned directory the worker cannot write.
- Signed text is published exactly, so model text quoting untrusted content can carry
  @-mentions or markup the code cannot neutralise.
- Nobody has defined the reader goals Igor passes to `prose start` for an item. Task 0.5 waits on
  that definition as well as on task 0.13.

## Why

An Igor publishes text that no check has read: the commit message is the issue title, and the
pull request description is the start of the worker's final message. A message longer than
700 characters is cut to its first 700. The cut falls at the last sentence end in those 700
characters, where that end comes after character 350; otherwise it falls at character 700.
A pointer to the full transcript follows the cut. Nothing holds the message or the
description to the prose rules, and
nothing records that bug-hunter ran over the code being committed. Issue
[#139](https://github.com/adamstallard/igor/issues/139) decides the rule that fixes this for
every piece of text an Igor publishes (decision 1).

## What Changes

- Roles list the skills their worker uses (decision 4).
- Every model-written post is signed and verified before it is published (decisions 2, 3, 7).
- Every commit Igor pushes, other than a merge, is signed by bug-hunter and the prose pass and
  verified before it is committed, with the message decision 6 sets out (decision 5).
- A pull request description is written by the prose pass, published uncut between the opening
  block and the evidence marker, and rewritten on gate two and each revision (decisions 9, 10).
- Code-assembled text stays unsigned (decision 8).

Replies from `directed-interaction`, and the numbered questions from
[#140](https://github.com/adamstallard/igor/pull/140), are published text, so this change
governs them. Neither change is edited here: the rule lives in one place, and they follow it.

## Capabilities

### New Capabilities

- `signed-publishing`: the rule for every text an Igor publishes, on any surface. The model step
  signs; the posting code verifies; a failure goes back to be redone; repeated failure publishes
  nothing.

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
  or by #150's `commitOnBranch`. The pull request description is written by the prose pass
  instead of cut from the worker's final message, is published uncut, and is re-signed on gate
  two and on each revision, never on a catch-up resolution.

## Impact

- **Three or four more `claude -p` steps per commit Igor pushes**: bug-hunter, the prose pass,
  bug-hunter's triage of the prose pass's diff, and one more bug-hunter iteration where that
  diff changed code. A role pays
  them only
  for the skills it lists; task 4.1 measures the cost per item.
- **Depends on the prose and bug-hunter skills** from the shared-skills repository, which is not
  public yet. Prose is in review there; bug-hunter's caller-commits mode has landed, as #139 records
  (shared-skills#19), which task 0.2 confirms. Igor loads
  both as the `igor` plugin, with `--plugin-dir`, as `pinned-skills` (#174) builds it.
- **Works whichever of this change and `review-evidence` (#190) lands first** (decision 9).
- **No GitHub Action.** Igor runs the checks in its own pipeline, so a CI check would only
  re-verify its work (#139, section 4).
