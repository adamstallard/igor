## 0. Before building

- [ ] 0.1 Load the prose and bug-hunter skills from a pinned directory with `--add-dir` (#152)
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
- [ ] 0.6 Grant a role that produces signed text `prose.py check`, `prose.py sign`,
      bug-hunter's `caller-result.sh` (by path into the pinned skills directory) and
      `git add`; run `start`, staging and verifying in Igor's code instead (design, item 2)

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
- [ ] 2.3 A prose pass step, given the issue title and number, that writes the message and runs
      `prose check`
- [ ] 2.4 Run bug-hunter once more when the prose pass changed a file after its signature
- [ ] 2.5 In `produce()`, check that the uploaded tree equals both signed trees, that
      `prose verify-staged` accepts the trailer, and that the subject is the issue title
- [ ] 2.6 Append the trailers; leave merge commits without them
- [ ] 2.7 Tests: a tree mismatch, a message mismatch and a changed subject each refuse the
      commit; a prose-pass edit triggers one more bug-hunter run

## 3. The pull request description

- [ ] 3.1 Replace the transcript excerpt with a description the prose pass writes and signs
- [ ] 3.2 Rewrite, sign and verify it again whenever Igor pushes to the pull request
- [ ] 3.3 Tests: a signed description is published unchanged; a follow-up commit replaces it
      with a newly signed one

## 4. Measuring

- [ ] 4.1 Record the cost of each new step per item, to decide which roles require them
