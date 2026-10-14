## Why

An Igor publishes text that no check has read: the commit message is the issue title, and the
pull request description is the start of the worker's final message. A message longer than
700 characters is cut to its first 700. The cut falls at the last sentence end in those 700
characters, where that end comes after character 350; otherwise it falls at character 700.
A pointer to the full transcript follows the cut. Nothing holds
either to the prose rules, and nothing records that bug-hunter ran over the code being
committed. Issue [#139](https://github.com/adamstallard/igor/issues/139) decides the rule that
fixes this for every piece of text an Igor publishes:

**A model step writes and signs; the deterministic code verifies and publishes.**

## What Changes

- **A role lists the skills its worker uses (Adam, 2026-10-11).** `skills: [<name>, …]` names
  pinned skills from #174's `igor` plugin. The org base may set it for every role and a role may
  add to it, never remove; an unknown name is refused at load. Igor's code checks per listed
  skill, and a role that lists neither `prose` nor `bug-hunter` publishes as today. Everything
  below applies to a role according to its list. *Rejected:* a switch for "posts" and
  "commits", which cannot say which skill's check applies.
- **Every text a model writes for an Igor to publish is signed by the model step that wrote
  it.** That covers pull request descriptions, replies, questions, and any other model-written
  post to GitHub, Discord or Linear. The step signs with the prose skill's `prose sign`, which
  appends a `prose ✓ <6 hex>` footer hashed over the text above it.
- **The code that posts runs `prose verify-post` on the exact text first**, and posts nothing
  that fails.
- **Every commit Igor pushes, other than a merge, is written and signed by two model steps
  first**, whether
  `produce()` opens a pull request with it or #150's `commitOnBranch` pushes gate two's
  implementation or a revision (decided 2026-10-13, so that #189's checks, which run on the signed tree, test what is
  committed on every push; rejected: signing only in `produce()`, which leaves gate two's commit unsigned):
  - bug-hunter, in its caller-commits mode, returns `Bug-hunter:` and `Bug-hunter-Tree:`;
  - the prose pass writes the message, runs `prose check`, and returns the
    `Prose: ✓ <tree>:<message>` trailer. The subject is the issue title with any closing
    keyword dropped. The body explains the change and ends with `Closes #N` on a commit that
    completes the item: any commit of a role outside #150, and gate two's implementation commit
    under it. It ends with `Refs #N` on
    gate one's and each revision's commit (decided 2026-10-13, matching #150's rule that a
    gate-one commit closes nothing; rejected: `Closes #N` everywhere, which would close the
    issue when gate one merges).

  Igor commits through the API only when `prose verify-staged` accepts the trailer, the staged
  tree equals both signed trees, and the subject is the issue title as above.
- **A failed check goes back to the model step with the reason**, to redo and sign again. After
  two attempts, the code publishes nothing and records the failure.
- **Text the code assembles from recorded state is not signed:** handoffs, stop receipts and
  claim messages. The code's authors wrote it and it is reviewed as code. A handoff is needed
  exactly when a model call may be impossible, so `graceful-handoff` stays as it is.
- **A pull request body is the opening block, then the signed description, then the code's
  evidence section** (decided 2026-10-13). The opening block is the opening text the two-gate workflow (#150) places first (gate one's "specification only"
  opening and the paths it refused to publish; at gate two, the note that the item changed after
  the spec was approved, and bug-hunter's open decisions), then the line linking the pull request to its item. Every line the code adds
  after the description starts at the marker `<!-- igor:evidence -->`, which
  `review-evidence` (#190) defines. The description is exactly the span between the opening
  block and the marker, or to the end where there is no marker, and `prose verify-post` runs on
  exactly that span. Neither the opening block nor the evidence section is signed. Rejected:
  signing the whole body, which would put code-assembled text under the model's signature and
  break it each time the code rebuilds its section.
- **The description is rewritten only when what the worker did changes** (decided 2026-10-13):
  on gate two's implementation and on each revision, with the opening block recomputed for that
  push. A catch-up resolution, a push that only merges the base branch in and resolves its
  conflicts, leaves it as it is. Rejected: rewriting on every push, which costs
  a model call for a resolution that changes nothing the description says.

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

- **Two more `claude -p` steps per change** (bug-hunter, then the prose pass), plus a third
  when the prose pass edits files after bug-hunter signed its tree. A role pays them only
  for the skills it lists; task 4.1 measures the cost per item.
- **Depends on the prose and bug-hunter skills** from the shared-skills repository, which is not
  public yet. Prose is in review there, and so is bug-hunter's caller-commits mode. Igor loads
  both as the `igor` plugin, with `--plugin-dir`, as `pinned-skills` (#174) builds it.
- **Works whichever of this change and `review-evidence` (#190) lands first.** Where #190 has
  shipped, the description ends at its marker. Where it has not, there is no marker, and the
  description runs to the end of the body.
- **No GitHub Action.** Igor runs the checks in its own pipeline, so a CI check would only
  re-verify its work (#139, section 4).
