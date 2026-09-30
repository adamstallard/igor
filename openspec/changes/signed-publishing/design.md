## Context

Igor's worker edits files in a throwaway clone and never commits. Deterministic code builds the
commit remotely through GitHub's Git Data API (`createBranchWithFiles`) and opens the pull
request. So the prose and bug-hunter skills' usual safety net, a hook that reads the reflog
after `git commit`, never sees an Igor commit. Igor has to run the checks itself.

Issue [#139](https://github.com/adamstallard/igor/issues/139) holds the full reasoning.

## Decisions

### A model step signs; the code verifies

Each half does what the other cannot.

- **The model step runs the checks**, because running `prose check` or `prose sign` prints the
  pass and the rules to the model while it writes. A trailer or footer is the check's output, so
  a step that skipped the check has nothing to return.
- **The code verifies**, because the model's word is not proof. A step can return a footer
  from an earlier draft, or text edited after signing; `prose verify-post` and
  `prose verify-staged` catch both.

No model step commits, pushes or posts. No code step writes prose.

### A commit is signed three ways

- **Bug-hunter** signs the tree it reviewed (`Bug-hunter-Tree:`).
- **The prose pass** signs the staged tree and the message together (`Prose: ✓ <tree>:<message>`).
- **The issue title** is the subject, because a person wrote it. The prose pass is given the
  title; the code checks it was kept.

The code compares both signed trees with the sha that `POST /git/trees` returns, which is known
before the commit exists. Igor never rebases its branches, so that hash still matches whenever
the commit is checked later.

The prose pass runs after bug-hunter, so it also rewrites bug-hunter's comments. If it changes
a file, bug-hunter's tree no longer matches, and bug-hunter runs once more to sign the new tree.
Bug-hunter's triage skips a comments-only change, so that round costs little.

Merge commits carry no trailers: `resolve` and the server-side `Merge X into Y` commits are
Igor's own mechanics, and the skills' checks skip merges.

### A failure goes back, a bounded number of times

A failed check returns the text to the step that wrote it, with the reason ("the footer does
not verify", "the staged tree differs from the signed tree"). The step redoes its check and
signs again.

The bound is two attempts, the same for every role. Without a bound, a step that keeps failing
spends the seat's budget on one item. A per-role setting can be added later if a role needs one. After the last attempt the code
publishes nothing and records the failure, with each reason, to the state branch.

### Text the code assembles is not signed

The rule covers text a model writes. Handoffs, stop receipts and claim messages are assembled
by the code from recorded state; the code's authors wrote them, and they are reviewed as code.

A handoff is needed exactly when a model call may be impossible: the budget is exhausted, or
the model step itself failed. Requiring a model step to sign it would leave an Igor silent on
its claim in the very case `graceful-handoff` exists for, so that capability stays as it is.

### What a signature proves, and what it does not

- **Proves:** the check's script ran over this exact text, or this exact tree, and nothing
  changed afterwards.
- **Does not prove** that the pass or the hunt was done well. Igor running the steps itself is
  what guarantees they ran.
- **Does not prove who signed.** The footer is a hash, not a key: anyone can run `prose sign`.
  It shows the text is unchanged since signing, which is all the posting code needs to know.

## Open Questions

- **Which roles.** Every role that produces code, or opt-in per role in `org.yaml`, decided
  after measuring the cost.
