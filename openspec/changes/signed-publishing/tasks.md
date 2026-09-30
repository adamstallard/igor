## 0. Before building

- [ ] 0.1 Decide how handoffs, stop receipts and message-only claims meet the rule, given that
      `graceful-handoff` forbids a model call for a handoff (`design.md`, Open Questions)
- [ ] 0.2 Load the prose and bug-hunter skills from a pinned directory with `--add-dir` (#152)
- [ ] 0.3 Confirm bug-hunter's caller-commits mode has landed in the shared-skills repository

## 1. Verifying and publishing

- [ ] 1.1 One publishing path that runs `prose verify-post` on the exact text before any post,
      on every surface
- [ ] 1.2 A failure returns the text to its model step with the reason; after the last allowed
      attempt, nothing is published and the failure is recorded to the state branch
- [ ] 1.3 Tests: signed text is published unchanged; edited or unsigned text is sent back;
      repeated failure publishes nothing

## 2. The commit

- [ ] 2.1 Stage the clone (`git add -A`) after the worker ends
- [ ] 2.2 A bug-hunter step in caller-commits mode; parse its result block
- [ ] 2.3 A prose pass step, given the issue title and number, that writes the message and runs
      `prose check`
- [ ] 2.4 Run bug-hunter once more when the prose pass changed a file after its signature
- [ ] 2.5 In `produce()`, check that the uploaded tree equals both signed trees, that
      `prose verify-staged` accepts the trailer, and that the subject is the issue title
- [ ] 2.6 Append the trailers and `Co-Authored-By:`; leave merge commits without them
- [ ] 2.7 Tests: a tree mismatch, a message mismatch and a changed subject each refuse the
      commit; a prose-pass edit triggers one more bug-hunter run

## 3. The pull request description

- [ ] 3.1 Replace the transcript excerpt with a description the prose pass writes and signs
- [ ] 3.2 Rewrite, sign and verify it again whenever Igor pushes to the pull request
- [ ] 3.3 Tests: a signed description is published unchanged; a follow-up commit replaces it
      with a newly signed one

## 4. Measuring

- [ ] 4.1 Record the cost of each new step per item, to decide which roles require them
