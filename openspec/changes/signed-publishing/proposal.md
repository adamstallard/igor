## Why

An Igor publishes text that no check has read: the commit message is the issue title, and the
pull request description is the last 700 characters of the worker's transcript. Nothing holds
either to the prose rules, and nothing records that bug-hunter ran over the code being
committed. Issue [#139](https://github.com/adamstallard/igor/issues/139) decides the rule that
fixes this for every piece of text an Igor publishes:

**A model step writes and signs; the deterministic code verifies and publishes.**

## What Changes

- **Every text a model writes for an Igor to publish is signed by the model step that wrote
  it.** That covers pull request descriptions, replies, questions, and any other model-written
  post to GitHub, Discord or Linear. The step signs with the prose skill's `prose sign`, which
  appends a `prose ✓ <6 hex>` footer hashed over the text above it.
- **The code that posts runs `prose verify-post` on the exact text first**, and posts nothing
  that fails.
- **A commit is written and signed by two model steps before `produce()` commits it:**
  - bug-hunter, in its caller-commits mode, returns `Bug-hunter:` and `Bug-hunter-Tree:`;
  - the prose pass writes the message (the issue title as the subject, an explanation, and
    `Closes #N`), runs `prose check`, and returns the `Prose: ✓ <tree>:<message>` trailer.

  `produce()` commits through the API only when `prose verify-staged` accepts the trailer, the
  staged tree equals both signed trees, and the subject equals the issue title.
- **A failed check goes back to the model step with the reason**, to redo and sign again. After
  two attempts, the code publishes nothing and records the failure.
- **Text the code assembles from recorded state is not signed:** handoffs, stop receipts and
  claim messages. The code's authors wrote it and it is reviewed as code. A handoff is needed
  exactly when a model call may be impossible, so `graceful-handoff` stays as it is.

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

- `task-execution`: owns producing the artifact, so it gains what is specific to a commit and a
  pull request. The commit is verified against the signed trees, the prose trailer and the
  issue title before `produce()` commits it. The pull request description is written by the
  prose pass instead of cut from the transcript, and is re-signed whenever the pull request
  changes.

## Impact

- **Two more `claude -p` steps per change** (bug-hunter, then the prose pass), plus a third
  when the prose pass edits files after bug-hunter signed its tree. Cost is to be measured on
  real items before the steps are required for every role.
- **Depends on the prose and bug-hunter skills** from the shared-skills repository, which is not
  public yet. Prose is in review there, and so is bug-hunter's caller-commits mode. Igor loads
  both from a pinned directory with `--add-dir`, as
  [#152](https://github.com/adamstallard/igor/issues/152) decides.
- **No GitHub Action.** Igor runs the checks in its own pipeline, so a CI check would only
  re-verify its work (#139, section 4).
