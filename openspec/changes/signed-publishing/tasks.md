## 0. Before building

- [ ] 0.1 Load the prose and bug-hunter skills as the `igor` plugin, with `--plugin-dir
      <skills_dir>` on every `claude -p` call, as `pinned-skills` (#174) builds it
- [ ] 0.2 Confirm bug-hunter's caller-commits mode has landed in the shared-skills repository
- [ ] 0.3 Measure that a fresh `claude -p --session-id <uuid>` reports that uuid as
      `session_id` in its hook payload (design, item 1)
- [ ] 0.4 Measure whether `git write-tree` after `git add -A` in a clone equals the tree sha
      the Git Data API returns for the same change, with a deletion, an executable file, a
      symbolic link and a submodule among the changes, and again once `carry-what-a-tree-holds`
      (#137) changes which modes the API's tree carries. If they differ, find how to sign against
      the tree the API builds, such as building that tree through the API first and minting
      against its sha (design, item 3)
- [ ] 0.5 After task 0.13, and once the reader goals for an item are defined (proposal, *For
      Adam*): before a worker starts, generate its session uuid, run `prose.py start --session
      <uuid>` with those goals and the worker's `HOME` and `XDG_STATE_HOME`, write
      the printed rules to a file passed with `--append-system-prompt-file`, pass
      `--session-id <uuid>`, and give the prompt on stdin. No prompt, rule or goal goes on any
      command line (design, item 1; proposal, decision 15)
- [ ] 0.6 Grant a role that lists `prose` or `bug-hunter` the commands its skills need:
      `prose.py check` and `prose.py sign`, by path into the pinned skills directory; run
      `start`, staging, the commit's signing calls and verifying in Igor's code instead
      (design, item 2; proposal, decision 12)
- [ ] 0.7 `skills: [<name>, …]` on a role and the org base, merged by adding (never removing),
      with an unknown name refused at load against what is installed under `skills_dir`; shown
      by `role explain`. Tests for each `role-config` scenario (design, Which roles; Adam,
      2026-10-11)
- [ ] 0.8 Run each step, and each check, only for the skills the role lists: the bug-hunter
      step and the `Bug-hunter:` check for `bug-hunter`; the prose pass, the footer check and
      the `Prose:` check for `prose`. Tests: a role listing only `prose`, only `bug-hunter`, and
      neither, each publishing a post and a commit

- [ ] 0.9 Measure whether a pass token issued by `prose check`'s first call, run as #175's worker
      user, can be spent by the second call run as Igor's service user against Igor's index,
      given where prose keeps its tokens. Record the result in `design.md`; if it cannot, stop
      and bring decision 12 back to Adam
- [ ] 0.10 Confirm bug-hunter has an entry point that mints its trailer against a given staged
      tree, run as a separate call after its run has ended. If not, stop and bring decision 12
      back to Adam
- [ ] 0.11 Measure where bug-hunter's own triage draws its line on a prose pass's diff: whether
      it skips exactly a diff touching only comments or docs, as decision 12 assumes, or also
      skips specs and tests. Record the result in `design.md`; if the line differs, bring
      decision 12 back to Adam
- [ ] 0.12 Measure whether `prose check --pass`, `prose verify-staged` and bug-hunter's minting
      script, run as Igor's service user, follow `GIT_DIR`, `GIT_WORK_TREE` and `GIT_INDEX_FILE`
      when given #175's separate git directory, rather than a `.git` the worker can replace in
      the tree. Record the result in `design.md`; if a script does not follow them, stop and
      bring decision 12 back to Adam
- [ ] 0.13 Find how `prose start`, the model step's first `prose check` and `prose sign` can take
      their goals other than on their command lines, such as a file or stdin (`prose check` has
      `--goals-file`); today `prose start` takes only `--goals`. The goals are drawn from the
      item, whose text may be private. Also measure that `claude -p` reads its prompt on stdin
      together with `--append-system-prompt-file`, which #175's task 6.9 measures only for
      `--system-prompt-file`. If `prose start` cannot take its goals another way, decision 15
      needs a change to the prose skill and goes back to Adam before building (proposal, decision 15)
- [ ] 0.14 Measure whether bug-hunter's caller-commits mode runs as the worker user without
      staging, since that user cannot write the git directory or the index (#175). Record the
      result; if it cannot, decision 12 goes back to Adam before building
- [ ] 0.15 Measure whether bug-hunter's regression tests run under the `npm test` and `npx vitest
      run` entries the role's `commands` already holds. Record the result; if they do not, the
      grants go back to Adam before building

## 1. Verifying and publishing

- [ ] 1.1 One publishing path that runs `prose verify-post` on the exact text before any
      model-written post, on every surface; code-assembled handoffs, receipts and claim
      messages pass unsigned
- [ ] 1.2 A failure returns the text to its model step with the reason; after the second
      attempt, nothing is published and the failure is recorded to the state branch
- [ ] 1.3 Tests: signed text is published unchanged; edited or unsigned text is sent back;
      repeated failure publishes nothing; a handoff posts without a model call
- [ ] 1.4 Test: with no prose hook installed, Igor's posting code refuses a post without a
      valid footer (design, item 4)

## 2. The commit

- [ ] 2.1 Stage the clone (`git add -A`) once, in Igor's own index, after the last model step
      exits. Then run, in Igor's code and from the pinned skills directory, prose's second call
      (`prose check -F <msg> --pass <token>`, with the token the prose pass reported) and
      bug-hunter's minting script for `Bug-hunter-Tree:`, both against that tree (proposal,
      decisions 11 and 12)
- [ ] 2.2 A bug-hunter step in caller-commits mode that edits without staging or minting and
      reports its result block; parse from it the `Bug-hunter:` value for the trailer and any
      open decisions
- [ ] 2.3 A prose pass step, given the issue title and number and, under #150, the gate, that
      writes a draft message, runs `prose check`'s first call on it, rewrites the message and the
      change's prose by the rules it prints, and reports the pass token. The subject drops any closing keyword in the
      title; the body ends with `Closes #N` for a role not using #150 and on every gate-two commit,
      revisions included, and with `Refs #N` on gate one's commits, its revisions included
- [ ] 2.4 After the prose pass, run bug-hunter's triage on the prose pass's diff: skip a diff
      that touches only comments or docs, and run one more bug-hunter iteration on anything
      else, before 2.1 stages (proposal, decision 12). No prose pass runs after that iteration
      (decision 13)
- [ ] 2.5 In `produce()` and in #150's `commitOnBranch`, check that the uploaded tree equals both signed trees, that
      `prose verify-staged` accepts the trailer, and that the subject is the issue title with
      any closing keyword dropped
- [ ] 2.6 Append the trailers; leave merge commits without them
- [ ] 2.7 Tests: a tree mismatch, a message mismatch and a changed subject each refuse the
      commit, and a tree mismatch goes back to no step; a prose-pass edit is in the tree both
      trailers name; a comments-only prose diff runs no second bug-hunter iteration and a
      prose diff that changes code runs one, after which no prose pass runs; the signing calls run in Igor's code, from the
      pinned skills directory; a gate-one commit ends with
      `Refs #N`; gate two's `commitOnBranch` commit is signed and verified

## 3. The pull request description

- [ ] 3.1 Replace the cut of the worker's final message (`prBody`, capped by `PR_BODY_LIMIT`)
      with a description the prose pass writes and signs, published uncut
- [ ] 3.2 Rewrite, sign and verify it again whenever Igor pushes gate two's implementation or
      a revision, recomputing the opening block; leave it as it is on a catch-up resolution
- [ ] 3.3 Tests: a signed description is published unchanged and uncut as the body's span
      between the opening block (#150's opening text, then the linkage line) and
      `<!-- igor:evidence -->`, or to the end of the body where there is no marker;
      `prose verify-post` runs on exactly that span; neither the opening block nor the evidence
      section after the marker (`review-evidence`, #190) is verified as part of it; a follow-up
      commit replaces the description with a newly signed one

- [ ] 3.4 Test: at gate one (#150), a signed description holding a closing keyword is returned
      to the prose pass, since #150 keeps closing keywords out of a gate-one body and the code
      cannot strip one without breaking the signature

## 4. Measuring

- [ ] 4.1 Record the cost of each new step per item, so an org can choose which skills to list
      for every role

## 5. Archive

- [ ] 5.1 Before archiving, rewrite this change's MODIFIED text of *Merge semantics differ by
      field kind* from the requirement as it is in force then, adding only `skills`. Two other
      changes MODIFY it: `loop-verifies-commands` (#189), adding `checks`, and
      `lore-from-corrections`, adding `propose-lore` to the `allow` vocabulary. The text in force
      then already holds the addition of each of them that has archived, so rewriting from it
      keeps every addition.
