## 0. Before building

- [ ] 0.1 Load the prose and bug-hunter skills as the `igor` plugin, with `--plugin-dir
      <skills_dir>` on every `claude -p` call, as `pinned-skills` (#174) builds it
- [ ] 0.2 Confirm bug-hunter's caller-commits mode has landed in the shared-skills repository
- [ ] 0.3 Measure that a fresh `claude -p --session-id <uuid>` reports that uuid as
      `session_id` in its hook payload (design, item 1)
- [ ] 0.4 Measure whether `git write-tree` after `git add -A` in a clone equals the tree sha
      the Git Data API returns for the same change, with a deletion and an executable file;
      if not, sign and verify against the API's tree (design, item 3)
- [ ] 0.5 Before a worker starts, generate its session uuid, run
      `prose.py start --session <uuid> --goals "<the item's reader goals>"` with the worker's
      `HOME` and `XDG_STATE_HOME`, put the printed rules in its system prompt, and pass
      `--session-id <uuid>` (design, item 1)
- [ ] 0.6 Grant a role that lists `prose` or `bug-hunter` the commands its skills need:
      `prose.py check`, `prose.py sign`,
      bug-hunter's `caller-result.sh` (by path into the pinned skills directory) and
      `git add`; run `start`, staging and verifying in Igor's code instead (design, item 2)
- [ ] 0.7 `skills: [<name>, …]` on a role and the org base, merged by adding (never removing),
      with an unknown name refused at load against what is installed under `skills_dir`; shown
      by `role explain`. Tests for each `role-config` scenario (design, Which roles; Adam,
      2026-10-11)
- [ ] 0.8 Run each step, and each check, only for the skills the role lists: the bug-hunter
      step and the `Bug-hunter:` check for `bug-hunter`; the prose pass, the footer check and
      the `Prose:` check for `prose`. Tests: a role listing only `prose`, only `bug-hunter`, and
      neither, each publishing a post and a commit

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

- [ ] 2.1 Stage the clone (`git add -A`) after the worker ends
- [ ] 2.2 A bug-hunter step in caller-commits mode; parse its result block
- [ ] 2.3 A prose pass step, given the issue title and number and, under #150, the gate, that
      writes the message and runs `prose check`. The subject drops any closing keyword in the
      title; the body ends with `Closes #N` outside #150 and on gate two's implementation commit,
      and with `Refs #N` on gate one's and each revision's
- [ ] 2.4 Run bug-hunter once more when the prose pass changed a file after its signature
- [ ] 2.5 In `produce()` and in #150's `commitOnBranch`, check that the uploaded tree equals both signed trees, that
      `prose verify-staged` accepts the trailer, and that the subject is the issue title with
      any closing keyword dropped
- [ ] 2.6 Append the trailers; leave merge commits without them
- [ ] 2.7 Tests: a tree mismatch, a message mismatch and a changed subject each refuse the
      commit; a prose-pass edit triggers one more bug-hunter run; a gate-one commit ends with
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

- [ ] 5.1 Before archiving, check whether `loop-verifies-commands` (#189) has archived. Both
      changes MODIFY *Merge semantics differ by field kind*, this one adding `skills` and #189
      adding `checks`. If #189 archived first, rewrite this change's MODIFIED text from the
      in-force requirement, which by then lists `checks`, adding `skills` to it, so that
      archiving keeps both.
