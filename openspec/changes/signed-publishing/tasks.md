## 0. Before building

- [ ] 0.1 Load the prose and bug-hunter skills as the `igor` plugin, as `pinned-skills` (#174)
      builds it (#174's *Every model call names the plugin directory*)
- [x] 0.2 Confirm bug-hunter's caller-commits mode has landed in the shared-skills repository.
      It is on shared-skills `main` at `44d1f67` (design, *Measurements*)
- [x] 0.3 Measure that a fresh `claude -p --session-id <uuid>` reports that uuid as `session_id`
      in its hook payload. It does (design, item 1 and *Measurements*)
- [x] 0.4 Measure whether `git write-tree` after `git add -A` in a clone equals the tree sha the
      Git Data API returns for the same change, with a deletion, an executable file, a symbolic
      link and a submodule among the changes, and again with paths carried as
      `carry-what-a-tree-holds` (#137) specifies. Equal for a deletion and an executable bit;
      different today for a link and a submodule; equal for every case as #137 carries them, so
      this change builds on #137 (design, item 3 and *Measurements*)
- [ ] 0.5 After task 0.16, and once the reader goals for an item are defined (proposal, *For
      Adam* 13): where Igor still runs `prose start` (proposal, *For Adam* 6), before a worker
      starts, generate its session uuid, run `prose.py start --session <uuid>` with those goals
      and the worker's `HOME` and `XDG_STATE_HOME`, write the printed rules to a file passed as
      a system-prompt file, as #175 requires, pass `--session-id <uuid>`, and give the prompt on
      stdin. No prompt, rule or goal goes on any command line (design, item 1; proposal,
      decision 15)
- [ ] 0.6 Grant a role that lists `prose` or `bug-hunter` no prose or bug-hunter script; the
      bug-hunter step's prompt tells it to report only its `Bug-hunter:` value and run no
      bug-hunter script (design, item 2; proposal, decision 16)
- [ ] 0.7 `skills: [<name>, …]` on a role and the org base, merged by adding (never removing),
      with an unknown name refused by a command that runs a model step, against what is
      installed under `skills_dir`, and not by `igor role explain`. Tests for each `role-config`
      scenario (design, *Which roles*; Adam, 2026-10-11)
- [ ] 0.8 Run each step, and each check, only for the skills the role lists: the bug-hunter step
      and the `Bug-hunter:` check for `bug-hunter`; the prose pass, the footer check and the
      `Prose:` check for `prose`. Tests: a role listing only `prose`, only `bug-hunter`, and
      neither, each publishing a post and a commit
- [x] 0.9 Measure whether a pass token issued by `prose check`'s first call, run as #175's
      worker user, can be spent by the second call run as Igor's service user. It cannot: the
      worker's call cannot write prose's token store. Answered by proposal decision 16, in which
      Igor runs the first call (design, *Measurements*)
- [x] 0.10 Confirm bug-hunter has an entry point that mints its trailer against a given staged
      tree, run as a separate call after its run has ended. `mint-trailer.sh` does (design,
      *Measurements*)
- [x] 0.11 Measure where bug-hunter's own triage draws its line on a prose pass's diff. It also
      skips tests, specs, lockfiles, generated files, formatting and renames, and models split
      on a spec-only diff; the triage is pinned (proposal, decision 17), and the line and the
      model are listed for Adam (design, *Measurements*)
- [x] 0.12 Measure whether `prose check --pass`, `prose verify-staged` and bug-hunter's minting
      script, run as Igor's service user, follow `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE`
      when given #175's separate git directory. They do, and with them a planted `.git` runs
      nothing (design, *Measurements*)
- [x] 0.13 Find how prose's calls can take their goals other than on their command lines, and
      measure that `claude -p` reads its prompt on stdin together with
      `--append-system-prompt-file`. Stdin works; `prose start` and `prose sign` take goals only
      from `--goals`, and `prose check` takes the message's goals only from `--goals`, so task
      0.16 adds a file form (design, *Measurements*)
- [x] 0.14 Measure whether bug-hunter's caller-commits mode runs as the worker user without
      staging. It can report only its `Bug-hunter:` value; its own minting names the wrong tree
      or fails, so Igor mints (design, *Measurements*; task 0.6)
- [ ] 0.15 Measure whether bug-hunter's regression tests run under the `npm test` and `npx
      vitest run` entries that the `commands` of the role being worked already holds. Record the
      result in design, *Measurements*; if they do not, Adam decides before building which
      commands to grant for them
- [ ] 0.16 Depends on the shared-skills repository: prose takes every call's reader goals from a
      file, for `start`, for `sign`, and for `check`'s message as well as its per-file goals, so
      that Igor's first calls put no goal on a command line (proposal, decision 15). Until it
      lands, the first calls of tasks 1.1 and 2.1 are not built, unless Adam accepts *For Adam*
      13, whose fixed goals hold no item text. This change does not edit shared-skills
- [ ] 0.17 Measure whether `git write-tree` in Igor's index equals the Git Data API's tree for a
      binary file and for a file under a clean filter (`core.autocrlf`, an `eol=` or `text=auto`
      attribute), with paths carried as #137 specifies. Record the result in design,
      *Measurements*; a case that differs is refused as a tree mismatch until #137 covers it
- [ ] 0.18 Measure whether bug-hunter's triage runs as its own model step on a given diff and a
      given model, and reports skip or hunt in a form Igor can parse. Record the result in
      design, *Measurements*; if it does not, the triage step goes back to Adam before building
- [ ] 0.19 Measure whether the steps between prose's first and second calls fit in a pass
      token's two-hour life; whether a token survives a second call that refuses for a reason
      other than the token, such as a doc with no goals; and whether goals given by path pattern
      cover a doc first changed after the first call. Record the result in design,
      *Measurements*

## 1. Verifying and publishing


- [ ] 1.1 One publishing path that runs `prose sign`'s first call, with Igor's own `GIT_DIR`,
      `GIT_WORK_TREE` and `GIT_INDEX_FILE`, before a model step writes a post, gives the step
      the rules and the token in its prompt, runs the second call with the cold read, and runs
      `prose verify-post` on the exact text before publishing it, on every surface;
      code-assembled handoffs, receipts and claim messages pass unsigned
- [ ] 1.2 The cold read: run the second call without a report, start a fresh model step, as the
      worker user with Read on the tree and no other tool for a commit, and no tool for a post,
      whose whole prompt is the brief exactly as printed, give its report to the step that wrote
      the text to fix and answer, read the report and the answers as #175 reads every file a
      worker wrote, count an answers file that keeps any line as a failed attempt, and run the
      second call with copies of both. For a commit whose role lists `bug-hunter`, restage and
      run bug-hunter's triage on the answers' diff before the second call; a diff it does not
      skip fails the attempt
- [ ] 1.3 A failure returns the text to its model step with the reason, and a refused token gets
      a new first call; after the second attempt, nothing is published and the failure is
      recorded to the state branch
- [ ] 1.4 Tests: signed text is published unchanged; edited or unsigned text is sent back;
      repeated failure publishes nothing; a handoff posts without a model call; a worker user
      cannot write prose's token store; a kept cold-read finding is a failed attempt
- [ ] 1.5 Test: with no prose hook installed, Igor's posting code refuses a post without a valid
      footer (design, item 4)

## 2. The commit

- [ ] 2.1 After bug-hunter, make #175's link and hard-link checks, stage the change in Igor's
      own index and run prose's first `prose check` call as the service user, on a draft message
      holding the issue title, with the goals Igor's code fixes for the message, a changed doc
      and a changed spec; give the prose pass the rules and the token on stdin (proposal,
      decisions 12 and 16). Make the same checks before every later staging, and check for a
      stop and the claim before every model step after the worker
- [ ] 2.2 A bug-hunter step in caller-commits mode that edits without staging or minting and
      reports its `Bug-hunter:` value and any open decisions; parse both
- [ ] 2.3 A prose pass step, given the rules, the token, the issue title and number and, under
      #150, the gate, that rewrites the message and the change's prose by those rules. The
      subject drops any closing keyword in the title; the body ends with the adapter's closing
      linkage (on GitHub, `Closes #N`) for a role not using #150 and on every gate-two commit,
      revisions included, and with its non-closing reference (on GitHub, `Refs #N`) on gate
      one's commits, its revisions included. A closing keyword for any other issue sends the
      message back, at every gate
- [ ] 2.4 After the prose pass, run bug-hunter's triage on the prose pass's diff, on the model
      pinned in Igor's code (proposal, decision 17): no hunt for a diff it skips, one more
      bug-hunter iteration for anything else. No prose pass runs after that iteration (decision
      13), apart from the answers to the cold read, whose diff task 1.2 triages
- [ ] 2.5 After the last model step, stage once more in Igor's own index, then run prose's
      second call with the token and the cold read of task 1.2, and bug-hunter's
      `mint-trailer.sh`, both from the pinned skills directory, with `GIT_DIR`, `GIT_WORK_TREE`
      and `GIT_INDEX_FILE` set to Igor's git directory, the tree and Igor's index (proposal,
      decisions 11 and 12; design, *Measurements*, 0.12)
- [ ] 2.6 In `produce()` and in #150's head push, check that the uploaded tree equals both
      signed trees, that `prose verify-staged` accepts the trailer, and that the subject is the
      issue title with any closing keyword dropped
- [ ] 2.7 Append the trailers; leave merge commits without them
- [ ] 2.8 Tests: a tree mismatch, a message mismatch and a changed subject each refuse the
      commit, and a tree mismatch goes back to no step; a prose-pass edit is in the tree both
      trailers name; a diff the triage skips runs no second bug-hunter iteration and one it does
      not skip runs one, after which no prose pass runs; the signing calls run in Igor's code,
      from the pinned skills directory, and a planted `.git` in the tree runs nothing; a
      gate-one commit ends with the adapter's non-closing reference; gate two's head-push commit
      is signed and verified; a gate-two body not ending with `Closes #N`, and a closing keyword
      for another issue at any gate, go back to the prose pass; a `Bug-hunter:` value holding a
      line break or a closing keyword goes back to the bug-hunter step; a refused minting call
      goes back to no step; a linked message file is not read; a hard-linked file stops the run
      before any staging; gate one stages after dropping `src/`; the token is one argument with
      no shell; an extra iteration that hunts mints `Bug-hunter-Tree:`; answers to the cold read
      that change code fail the attempt; a stop during the signing steps publishes nothing; a
      gate-two description saying `Fixes #999` goes back; the extra iteration's `Bug-hunter:`
      value replaces the first; the message reaches prose only as a `-F` file; an open decision
      saying `Fixes #999` goes back to the bug-hunter step; an answers file that keeps a line
      fails the attempt; a dry run checks skill names and `igor role explain` does not

## 3. The pull request description

- [ ] 3.1 Replace the cut of the worker's final message (`prBody`, capped by `PR_BODY_LIMIT`)
      with a description the prose pass writes between the two `prose sign` calls of task 1.1,
      published uncut
- [ ] 3.2 Rewrite, sign and verify it again whenever Igor pushes gate two's implementation or a
      revision, recomputing the opening block; leave it as it is on a catch-up resolution
- [ ] 3.3 Tests: a signed description is published unchanged and uncut as the body's span
      between the opening block and `<!-- igor:evidence -->`, or to the end of the body where
      there is no marker; `prose verify-post` runs on exactly that span; neither the opening
      block nor the evidence section after the marker (`review-evidence`, #190) is verified as
      part of it; a follow-up commit replaces the description with a newly signed one
- [ ] 3.4 Test: at gate one (#150), a signed description holding a closing keyword is returned
      to the prose pass, since #150 keeps closing keywords out of a gate-one body and the code
      cannot strip one without breaking the signature

## 4. Measuring

- [ ] 4.1 Record the cost of each new step per item, so an org can choose which skills to list
      for every role

## 5. Archive

- [ ] 5.1 Before archiving, rewrite this change's MODIFIED text of *A role declares its sources,
      lane, behaviour, permissions, and reviewers* and *Merge semantics differ by field kind*
      from the requirements as they are in force then, adding only `skills`.
      `read-seat-windows-from-the-stream` (#143) modifies both, adding `reserve`; it archives
      first in the archive order issue #204 sets, and this change's copies already carry its
      text. `lore-from-corrections` modifies *Merge semantics differ by field kind* too, adding
      `propose-lore` to the `allow` vocabulary. If it has archived by then, the text in force
      already holds its addition, so rewriting from that text keeps it. If it has not,
      `lore-from-corrections` rewrites its own copy from the text in force when it archives.
