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
   pinned skills from #174's `igor` plugin. The org base may set it for every role and a role may
   add to it, never remove; an unknown name is refused at load. Igor's code checks per listed
   skill: for `prose`, a valid footer on every model-written post and a matching `Prose:` trailer
   on every commit; for `bug-hunter`, a `Bug-hunter:` trailer bound to the staged tree. A role
   that lists neither publishes as today. *Rejected:*
   a switch for "posts" and "commits", which cannot say which skill's check applies.
5. **Every commit Igor pushes, other than a merge, is written and signed by two model steps
   first (Adam, 2026-10-13)**, whether `produce()` opens a pull request with it or #150's
   `commitOnBranch` pushes gate two's implementation or a revision:
   - bug-hunter, in its caller-commits mode, returns `Bug-hunter:` and `Bug-hunter-Tree:`;
   - the prose pass writes the message, runs `prose check`, and returns the
     `Prose: ✓ <tree>:<message>` trailer, where `<tree>` and `<message>` are short hashes of the
     staged tree and the message.

   Igor commits through the API only when `prose verify-staged` accepts the trailer, the staged
   tree equals both signed trees, and the subject is the issue title as decision 6 sets out.
   *Rejected:* signing only in `produce()`, which leaves gate two's commit unsigned. Then the
   role's tests that `loop-verifies-commands` (#189) runs on the signed tree would not test what
   is committed on every push.
6. **The commit message (Adam, 2026-10-13).** The subject is the issue title with any closing
   keyword dropped (GitHub's `close`, `fix` or `resolve` in any form, followed by an issue
   reference, as in a title like `Login fails (fixes #12)`), so a title cannot close an issue by
   itself. The body explains the change and ends with one of two lines:
   - `Closes #N` on every commit of a role that does not use the two-gate workflow (#150), and
     on every gate-two commit under #150, the implementation and each revision after it;
   - `Refs #N` only on gate one's commits, its revisions included, matching #150's rule that
     gate one closes nothing.

   *Rejected:* `Closes #N` everywhere, which would close the issue when gate one merges; and
   `Refs #N` on gate-two revisions, since a squash merge whose message is taken from the last
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
   is the line linking the pull request to its item, preceded under #150 by the text #150 places first (gate one's "specification only" opening and the paths gate one
   refused to publish; at gate two, the note that the issue changed after the spec was approved,
   and bug-hunter's open decisions); once #190 ships, #190 defines it. Every line the code adds after the description
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

**Still open:** no question in this change's design. Two measurements remain before building:
task 0.3, that a fresh `claude -p --session-id <uuid>` reports that id to prose's hook, and task
0.4, whether the clone's staged tree equals the tree the Git Data API builds. A different result
from either changes how the steps sign (`design.md`, items 1 and 3), not what is decided here.

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

- **Two more `claude -p` steps per change** (bug-hunter, then the prose pass), plus a third
  when the prose pass edits files after bug-hunter signed its tree. A role pays them only
  for the skills it lists; task 4.1 measures the cost per item.
- **Depends on the prose and bug-hunter skills** from the shared-skills repository, which is not
  public yet. Prose is in review there, and so is bug-hunter's caller-commits mode. Igor loads
  both as the `igor` plugin, with `--plugin-dir`, as `pinned-skills` (#174) builds it.
- **Works whichever of this change and `review-evidence` (#190) lands first** (decision 9).
- **No GitHub Action.** Igor runs the checks in its own pipeline, so a CI check would only
  re-verify its work (#139, section 4).
