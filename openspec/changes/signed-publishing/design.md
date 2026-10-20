## Context

Igor's worker edits files in a throwaway clone and never commits. Deterministic code builds the
commit remotely through GitHub's Git Data API (`createBranchWithFiles`) and opens the pull
request. So the prose and bug-hunter skills' usual safety net, a hook that reads the reflog
after `git commit`, never sees an Igor commit. Igor has to run the checks itself.

Issue [#139](https://github.com/adamstallard/igor/issues/139) holds the original reasoning.
Where #139 differs from proposal decision 12, which sets the order of a commit's signing steps,
or from decision 16, which has Igor's code run both of prose's calls, the proposal holds.

## Decisions

### The model writes between prose's two calls; Igor's code runs both

Prose takes two calls per text. The first prints the rules and a one-use pass token; the model
writes by those rules; the second, given the token, signs. A token is a file in prose's token
store, which prose keeps in the repository's git directory (task 0.9). The second call accepts
only a token that store holds.

**Igor's code runs both calls, as Igor's service user (Adam, 2026-10-18; proposal, decision
16).** It runs the first call, puts the printed rules and the token in the model step's prompt,
on stdin, and runs the second call once the step has written. The worker user never writes the
token store, so it cannot forge a token, and the token is still what shows that the rules were
printed for this text before it was written. This holds for a commit (`prose check`) and for a
post (`prose sign`).

- **The model does the pass**, because it is the model that writes.
- **The code verifies**, because the model's word is not proof. A step can hand back a footer
  from an earlier draft, or text edited after signing; `prose verify-post` and `prose
  verify-staged` catch both.

No model step commits, pushes, posts or runs a prose or bug-hunter script.

**No prose step reads a skill file itself.** `--plugin-dir` gives a step no Read access to the
plugin's files (#174), so a step told to read prose's `rules.md` or `cold-read.md` would be
refused. Under decision 16 it never needs to: the rules come in its prompt from the first call
Igor runs, and the cold-read brief the second call prints begins with `cold-read.md` (prose's
source at shared-skills `44d1f67`). The
bug-hunter steps are the exception, since bug-hunter's instructions point at files beside its
`SKILL.md`. Adam chose one grant for every model step rather than one for the bug-hunter steps
alone: each step gets Read on the skills directory, since reading is not running and the
directory holds no secret (Adam, 2026-10-19; proposal, decision 33).

### Every signature needs a cold read, run as its own step

Prose's second call signs nothing until a reader who has not seen the conversation has read
the text cold. Run without a report, it prints a cold-read brief and exits 5 (prose's source at
shared-skills `44d1f67`). So Igor runs the second call in three parts:

1. **The brief.** Igor runs the second call without a report and keeps the brief it prints.
2. **The cold read.** Igor starts a fresh model step whose whole prompt, on stdin, is the
   brief exactly as printed, and saves its report.
3. **The answers.** Igor gives the report to the step that wrote the text, run again with the
   rules. That step fixes what the report names and writes its answers, the file prose calls a
   dispositions file. The file holds two kinds of line: one answering each finding, and one
   answering each line in which the cold reader said what it understood the text to mean. Igor
   reads the report and the answers without following a link, and only if each is a regular
   file with one hard link, as #175 requires of every file the worker wrote. For a commit whose
   role lists `bug-hunter`, Igor then restages the change and runs bug-hunter's triage on the
   diff of the edits the step made to the tree while fixing the findings; a diff the triage does not skip fails the attempt, since answering a cold read
   changes prose, not code (proposal, decision 34). Igor then runs the second call with `--cold-read`
   and `--dispositions`.

No person is there to answer a kept finding. So the writing step fixes every finding, and
wherever the cold reader understood a line other than as meant, it changes the text and answers
that line `fixed`; it answers `matches` only where the cold reader understood the line as
meant. Prose refuses to sign while any finding or line is kept without a person's answer, and
that refusal is a failed attempt (*A failure goes back*, below). Adam decided this on 2026-10-19
(proposal, decision 22).

### A commit is signed three ways, once, at the end

- **Bug-hunter's** trailer binds the tree (`Bug-hunter-Tree:`).
- **The prose pass's** trailer binds the staged tree and the message together
  (`Prose: ✓ <tree>:<message>`).
- **The issue title** is the subject. The prose pass is given the title; the code checks it
  was kept.

The code compares both signed trees with the sha that `POST /git/trees` returns, which is known
before the commit exists. Igor never rebases its branches, so anyone verifying the trailers
after the push finds the same tree on the branch's commit. A squash merge makes a new commit on
the base with another tree, so the trailers it copies verify against the branch's commit, not
the squash.

The order, from proposal decisions 11, 12, 13 and 16:

1. **Bug-hunter** runs as the worker user, in caller-commits mode, and reports its
   `Bug-hunter:` value, such as `1 iteration, 1 bug fixed`, and any open decisions. It neither
   stages nor runs `caller-result.sh`: the worker user cannot write the git directory, so that
   script would mint the wrong tree or fail (task 0.14).
2. **Igor stages** the change in its own index and runs prose's first `prose check` call on a
   draft message holding the issue title, with reader goals for the message and, by path
   pattern, for docs and specs. A token records the per-file goals its first call saw, and the
   second call refuses a doc that had none (task 0.9). So the change is staged before the first
   call, which then sees the changed docs and records their goals. Whether goals given by
   pattern also cover a doc changed later, by the extra bug-hunter iteration of step 4 or by the
   answers to the cold read in step 5, is task 0.19. Before this staging, as before every
   staging, Igor kills every process the worker user owns and checks the changed paths for
   symbolic links, submodules and hard links. #175 (`worker-user`) requires both, in its
   requirement *The Igor stages only after its checks, and #153's trailers bind the last staging*, whose "#153" is this change (proposal, decision 19). The kill
   is there because a process still running could change the tree after the checks. The checks
   are there because `git add` could otherwise turn a hard link the worker made to a credential,
   such as the App's private key, into a blob in a git directory the worker can read.
3. **The prose pass** gets the rules and the token in its prompt. It rewrites the message and
   the change's docs and comments by those rules, including the comments bug-hunter's fixes
   added.
4. **Bug-hunter's triage** runs on the prose pass's diff, on sonnet (proposal, decisions 17 and
   21). A diff its triage skips gets no hunt; any other diff gets one more bug-hunter iteration.
5. **Igor stages once more** and runs two things: the second call, with the cold read above and
   the triage of its answers; and bug-hunter's minting script, which writes `Bug-hunter-Tree:`
   for the staged tree. It runs on every commit, even where every triage skipped the change and
   nothing was hunted (proposal, decision 26).

Igor checks for a stop, and that it still holds the claim, before every model step after the
worker,
as at any checkpoint of a long execution (`surface-adapter`); a stop publishes nothing.

Every trailer that binds a tree then names the tree Igor records and publishes. The scripts
come from the root-owned skills directory (#174), and Igor runs them with `GIT_DIR`,
`GIT_WORK_TREE` and `GIT_INDEX_FILE` set to its own git directory, the tree and its own index,
so they read none of a `.git` the worker can replace (task 0.12). They also run with
`GIT_CONFIG_NOSYSTEM=1` and `GIT_CONFIG_GLOBAL=/dev/null`, as #175 runs every git call Igor
makes in a tree (Adam, 2026-10-19, on #175). A filter that a worker's `.gitattributes` names
runs only where some git configuration defines it, and with those two set the only
configuration left is Igor's own git directory's, which defines none. A repository using Git LFS is therefore not supported until a later change defines filters Igor
trusts. Igor does not refuse one: #175 checks each LFS file out as its pointer, and Igor stages,
signs and publishes the pointer, which is what the repository stores.

`Bug-hunter-Tree:` names the staged tree. It attests that bug-hunter's triage saw every change
in that tree, and that bug-hunter hunted each change its triage did not skip; on a change the
triage skipped whole, it attests only that the triage saw it. The prose pass's
edits and its answers to the cold read are triaged like any other change.
That triage draws bug-hunter's own line, which skips more than comments and docs (task 0.11):
also tests, specs, lockfiles, generated or vendored files, formatting and renames (Adam,
2026-10-19; proposal, decision 20).

**No second prose pass follows the extra iteration (Adam, 2026-10-18).** Comments that
iteration writes reach the tree after the prose pass, which never rewrites them. The cold read
in step 5 does read them, since it reads every comment in the staged change, and the prose
pass fixes what it names. Adam judged a full second prose pass over those comments not worth
its cost, since the prose pass is not meant to change code.

Three failures can still refuse a commit, and none goes back to a step, because each is Igor's
own. The tree the trailers name can differ from the tree the Git Data API builds (*Decided
questions*, item 3). The message Igor commits can differ from the message the `Prose:` trailer
hashes. The minting call can fail. Each is recorded as the item's failure.

Merge commits carry no trailers: `resolve` and the server-side `Merge X into Y` commits are
Igor's own mechanics, and the skills' checks skip merges (proposal, decision 30). Whether a
model-written conflict resolution gets a bug hunt is issue
[#214](https://github.com/adamstallard/igor/issues/214).

### A second worker run is a second commit

Where one of the repository's checks fails and `loop-verifies-commands` (#189) runs the worker
again, that run's edits become a second commit on top of the first run's signed commit (Adam,
2026-10-19; proposal, decision 39). The steps above run again on the second run's diff only,
against the first commit: bug-hunter, the prose pass with a new first call, the cold read and
the triages. The second commit carries its own trailers, bound to its own last staging, and the
first commit's trailers still verify against the first commit.

### The reader goals come from the worker

The model decides each item's reader goals (Adam, 2026-10-19; proposal, decision 32). For a
commit and its pull request description, the worker writes them to goals files in its outbox.
A commit's docs and specs get theirs in `prose check`'s `pattern: goal; goal` form. The
description gets goals separated by `;`, the form shared-skills PR #27 gives `prose sign`. Igor
reads each file as #175 reads every file the worker wrote, and passes a copy to prose with
`--goals-file`, so none of these goals reaches a command line. Two questions remain, the
proposal's *For Adam* 1 and 2: which step writes the goals for a post that no worker run
precedes, and how a commit message's own goals reach `prose check`.

### A lost claim stops the signing steps

Igor checks its claim before each model step after the worker. Where the claim is lost, no
further model step runs, and Igor publishes the worker's change as a draft pull request whose
body its code writes (Adam, 2026-10-19; proposal, decision 38). Nothing has been signed by then,
so the body holds no signed text and the commit carries no skill trailers. The next Igor to
claim the item redoes the work, signed; how its signed commit relates to the unsigned draft
already published, since Igor never rebases, is still open (proposal, *Still open*).

### A post is signed the same way

Igor runs `prose sign`'s first call and gives the rules and the token to the step that writes
the post. The step hands back the text. Igor runs the second call, `prose sign --pass <token>`,
with the text on stdin and with the cold read above; it prints the text with its `prose ✓`
footer. Igor runs `prose verify-post` on that text and publishes it exactly.

### A failure goes back, a bounded number of times

A failed check returns the text to the step that wrote it, with the reason ("the footer does
not verify", "prose refused the pass token"). Where prose refused the token, Igor runs the
first call again and gives the step the new rules and token. A commit's tree and message are
bound by Igor's code, not by a step, so a tree or message mismatch goes back to no step: it
refuses the commit and is recorded as the item's failure.

The bound is two attempts in total, the same for every role: a text that fails goes back to its
step once. Without a bound, a step that keeps failing spends the seat's budget on one item. A
per-role setting can be added later if a role needs one. After the last attempt the code
publishes nothing and records the failure, with each reason, to the state branch.

### Text the code assembles is not signed

The rule covers text a model writes. Handoffs, stop receipts and claim messages are assembled
by the code from recorded state; the code's authors wrote them, and they are reviewed as code.

A handoff is needed exactly when a model call may be impossible: the budget is exhausted, or
the model step itself failed. Requiring a model step to sign it would leave an Igor silent on
its claim in the very case `graceful-handoff` exists for, so that capability stays as it is.

### What a signature proves, and what it does not

- **Proves:** prose's second call ran over this exact text, or this exact tree, with a token
  its first call issued, and nothing changed afterwards.
- **Does not prove** that the pass or the hunt was done well. Igor running the steps itself is
  what guarantees they ran.
- **Does not prove who signed.** The footer is a hash, not a key: anyone can run `prose sign`.
  It shows the text is unchanged since signing, which is all the posting code needs to know.

## Decided questions

Adam accepted the recommendation on each question below on 2026-10-11, except where a later
date is given.

### Which roles: a role lists the skills its worker uses

**Decided by Adam, 2026-10-11.** The opt-in is a list of skills, not a switch for "posts" and
"commits". A role declares `skills: [<name>, …]`, the pinned skills of #174's `igor` plugin its
worker uses. The org base may set the list for every role, and a role may add to it; inheritance
adds and never removes, so a skill the org requires stays required. A name that is not among the
skills a command loads is refused by every command that runs a model step, a dry run included,
and by no other (Adam, 2026-10-19; proposal, decision 29). Under `igor serve` those skills are
the ones under `skills_dir`, the server's skills directory, `/opt/igor/skills` (#174); under `igor run` without `skills_dir`, the ones the shared-skills
manager installed in the person's home, as #174 specifies. A listed skill other than `prose` and
`bug-hunter` gets no step and no check from this change.

Igor's code runs the steps and checks per listed skill. `prose` means every model-written post
needs a valid `prose ✓` footer and every commit a matching `Prose:` trailer. `bug-hunter` means
every commit needs a `Bug-hunter:` trailer and a `Bug-hunter-Tree:` trailer bound to the staged
tree. A role that lists neither publishes as it
does today. Each skill's check is written in Igor's code, because only these two exist; a
configurable table of checks would be configuration for two rows.

Which skills an org lists for every role is its own choice, informed by the cost task 4.1
measures.

### 1. Igor runs no `prose start`

Prose's *gate* is its Claude Code hook that blocks a session's first doc edit or post until
`prose start` has written the session mark, a file in the session's home. Adam decided on
2026-10-11 that Igor would run `prose start` for its worker, and reversed that on 2026-10-19
(proposal, decision 25): Igor runs no `prose start`.

Nothing in a worker checks the gate, because no hook runs there. `pinned-skills` (#174) loads
skills as the `igor` plugin with `--plugin-dir`; the plugin declares no hooks and the install
wires none. And #174 resets the home every model step runs in to a template whose
`settings.json` holds no hooks. So `prose start` would open a gate nothing checks. The prose
pass gets its rules from the first call Igor runs (decision 16), and `prose start` would have
had to run as the worker user, where #175 lets no prose script run.

### 2. The worker is granted no signing script

**Decided by Adam, 2026-10-18 (proposal, decision 16):** Igor's code runs every prose and
bug-hunter script, so a role that lists `prose` or `bug-hunter` is granted none of them.
*Rejected (Adam, 2026-10-18):* granting the worker `prose.py check` and `… sign` by path into
the pinned skills directory, so that the model step could run prose's first call. A step that
runs the first call needs a token store it can write, and could then forge a token.

| Step | Run by | Why |
| --- | --- | --- |
| bug-hunter's run, and its triage of the prose pass's diff | model, as the worker user | the hunt is the model's work; the step reports its `Bug-hunter:` value |
| the pass between prose's two calls, and the answers to the cold read | model, as the worker user | writing is the model's work |
| the cold read | model, a fresh step | a reader who has not seen the conversation |
| `git add -A` in Igor's own index | code | only Igor's code can write its own index (tasks 2.1 and 2.5) |
| prose's first and second calls, `check` and `sign`, and bug-hunter's `mint-trailer.sh` | code, as the service user | decision 16; the token store and Igor's index are the service user's |
| `prose verify-post`, `prose verify-staged` | code | verifying is the code's half |

The regression tests bug-hunter writes are expected to run under the `npm test` and `npx vitest
run` entries the role's `commands` list already holds. Task 0.15 measures it. If they do not,
Adam decides before building which commands to grant for them, with the recommendation to
grant the role exactly the commands the tests need.

### 3. Igor's staged tree is measured against the API's tree before either is trusted

**Decided (Adam, 2026-10-11):** measure first (task 0.4), and if the two trees can differ, sign
and verify against the API's tree, not Igor's index. Adam reversed the second half on
2026-10-19 (proposal, decision 35): the measurement below shows the trees differ only where
`main` uploads a path wrongly, so this change signs against Igor's index and builds on #137.
*Rejected:* assuming the two trees agree, which fails silently on the first executable or
deletion where they do not.

`prose verify-staged` checks the git index, but Igor builds its commit through the Git Data API
(`createBranchWithFiles`). Comparing the signed trees with the sha `POST /git/trees` returns
holds only if `git write-tree` in Igor's index equals the API's tree sha, with the same modes,
deletions, symbolic links and submodules.

**Measured (task 0.4, 2026-10-19):** the trees are equal for a modified file, a deletion and an
executable bit, added or changed alone. They differ today for a symbolic link and a submodule:
the code on `main` reads a link through `readFile` and `stat`, which follow it, so the link goes
out as a `100644` blob of its target's content, and a submodule's change reads as `EISDIR` and
is skipped. Built with each path as the tree holds it (a link as a `120000` blob of its target,
a submodule as a `160000` commit), which is what `carry-what-a-tree-holds` (#137) specifies, the
trees are equal for every measured case. So this change signs against `git write-tree` of Igor's
own index and builds on #137 (proposal, decision 35). Until #137 is built, #175's checks stop a run
whose change holds a symbolic link or a submodule before anything is staged, so such a change
never reaches the tree comparison. The comparison's refusal, a tree mismatch, remains for a
difference those checks do not foresee. A binary file and a
clean-filtered file, which #137 also carries, are not measured yet (task 0.17).

### 4. Igor's posting code refuses an unsigned post

**Decided (Adam, 2026-10-11):** a test that Igor itself refuses a post without a valid footer,
with no hook installed (task 1.5). *Rejected:* relying on prose's posting hook, which guards
only posts made from a Claude Code session.

## Measurements

Each ran on 2026-10-18 or 2026-10-19, with shared-skills at `44d1f67` (its `main`) and Claude
Code 2.1.303. Each entry says what the measurement showed, including where it contradicted this
design.

- **0.2, bug-hunter's caller-commits mode has landed.** It is in shared-skills `main` at
  `44d1f67`, with `caller-result.sh` and `mint-trailer.sh`. **Confirms** #139's record.
- **0.3, the session id.** `claude -p --session-id <uuid>` gives that uuid as `session_id` in
  the `SessionStart`, `UserPromptSubmit`, `PreToolUse` and `Stop` payloads, and in the
  transcript's name. This was measured for `prose start --session <uuid>`, which Igor no longer
  runs (proposal, decision 25), so nothing now depends on it.
- **0.4, the two trees.** As item 3 records: equal for a modified file, a deletion and an
  executable bit; different today for links and submodules; equal for every case once paths are
  carried as #137 specifies. **Confirms** item 3, provided this change builds on #137.
- **0.9, a token from the worker's first call.** **Contradicted** what decision 12 assumed.
  Prose keeps a `check` token under `$(git rev-parse --git-common-dir)/prose/passes`, which
  under #175 is a git directory the worker user cannot write, so the worker's first call failed
  with `Permission denied` and issued no token. It also could not stage, so it saw only the
  unchanged index. A variant worked: Igor pre-creating `<git dir>/prose/passes`, mode 2770, for
  the worker's group. It was not adopted, because a token is a plain JSON file, so a worker that
  can write that directory can forge one without running the first call. The run also showed
  that the token records the per-file goals the first call saw, and that the second call needs a
  cold-read report and a dispositions file. Adam's decision 16 answers the token store, the
  goals and the cold read: Igor runs the first call, on its own staged index, and runs the cold
  read as a step.
- **0.10, minting as a separate call.** `bug-hunter/scripts/mint-trailer.sh`, run by the
  service user after bug-hunter's run had ended, printed `Bug-hunter-Tree:` with the
  `git write-tree` of Igor's index. It needs the full shared-skills clone beside it, which
  #174's layout provides. **Confirms.**
- **0.11, where bug-hunter's triage draws its line.** **Contradicts** decision 12, which names
  "a diff that touches only comments or docs". Bug-hunter's written rule also skips tests,
  specs, lockfiles, generated or vendored files, formatting, renames and moves. Seven prose-pass
  diffs were each sent with the rule to haiku and to sonnet. Both skipped a comment in code, a
  line of `README.md`, a test's title and comments, and a docstring. Both reviewed a thrown
  error's message and a CLI help string. On one requirement's wording in an OpenSpec spec, haiku
  reviewed and sonnet skipped. So the triage is pinned to one model (decision 17), and which
  model is sonnet (decision 21).
- **0.12, the scripts follow Igor's git directory.** With `GIT_DIR`, `GIT_WORK_TREE` and
  `GIT_INDEX_FILE` set, prose's calls, `verify-staged` and bug-hunter's minting scripts all used
  Igor's git directory and index, and a `.git` the worker had planted, with a `core.fsmonitor`
  script and a pre-commit hook, ran nothing. Without them, the same run executed the worker's
  `core.fsmonitor` script 14 times and its hook once, as the service user. **Confirms**,
  provided Igor always sets all three.
- **0.13, goals and prompts off the command line.** `claude -p` reads its prompt on stdin
  beside `--append-system-prompt-file`. **Confirms.** Prose's half **contradicts** decision 15:
  `prose start` and `prose sign` take reader goals only from `--goals`, and `prose check`'s
  `--goals-file` holds per-file goals only, so the message's own goals also need `--goals`.
  Under decision 16 Igor runs those calls, so the goals would sit on Igor's command line.
  `prose sign` gains a file form in shared-skills PR #27 (task 0.16); the commit message's
  goals in `prose check` are the proposal's *For Adam* 2.
- **0.14, caller-commits mode as the worker user.** With nothing staged, `caller-result.sh`
  minted HEAD's tree, not the change; after the worker wrote to the copy of the index that #175
  keeps in the worker's outbox (a directory the worker shares with Igor, for `git rm` and `git
  mv`), minting failed with `insufficient permission`. **Confirms** that Igor mints the tree:
  the bug-hunter step reports only its `Bug-hunter:` value and runs no script.
- **Observed, 2026-10-19, signing this change's own pull request description:** `prose sign
  --pass <token>` read the post on stdin; run without a report it printed a cold-read brief and
  exited 5, and run again with `--cold-read` and `--dispositions` it printed the post signed.
  The same day, staging again after the answers left `prose check`'s token valid, and the second
  call signed the tree staged when it ran. **Confirms** the three-part flow of *Every signature
  needs a cold read*.
- **Not measured:** 0.19, whether the steps between the two calls fit in a pass token's two-hour
  life, whether a token survives a second call refused for a reason other than the token, and
  whether goals given by path pattern cover a doc changed after the first call; 0.18, whether
  bug-hunter's triage runs as its own step on a given diff and model and reports skip or hunt in
  a form Igor can read; 0.15, whether bug-hunter's regression tests run under the `commands` the
  role being worked already grants; and 0.17, whether a binary file and a clean-filtered file
  give the same tree in Igor's index as through the Git Data API.
