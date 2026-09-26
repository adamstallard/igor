## 1. What the base changed

- [x] 1.1 From the merge state already in hand, read the merge base of the artifact's head and
      the commit brought in, and the base's changes since it — path, status, and the content at
      the merge base and at the base for each — as blob names rather than content, since the
      comparison asks only whether two blobs are the same one
- [x] 1.2 Carry it beside the merge state rather than re-deriving it at the publish site; a
      released tree cannot answer the question

## 2. The comparison

- [x] 2.1 For each path the base changed, resolve what the resolution publishes for it: its own
      file, its own deletion, or — where it mentions the path at all — the artifact head's copy

      Read as *where it does not mention the path*, which is what `design.md` states and what
      the merge result actually is; the sentence as written says the opposite.
- [x] 2.2 A revert is exact restoration of the merge-base state where the base holds something
      else: content equal to the merge base, presence against a deletion, absence against an
      addition
- [x] 2.3 Content that matches neither the base nor the merge base is a resolution, not a
      revert, and passes
- [x] 2.4 A path the artifact head already held identically to the base is not a revert

## 3. The declaration

- [x] 3.1 A file the worker writes into the run's outbox — a directory beside the clone, made
      empty for the run and swept with it — read by the loop: a list of entries, each naming one
      path and the base state it discards, the base's blob sha or that the base deleted the path
- [x] 3.2 An entry authorizes only where that state is what the base actually holds; otherwise
      the revert counts as undeclared
- [x] 3.3 No blanket form: no wildcard path, no whole-resolution flag, and nothing read from
      role or org configuration. A malformed or pathless entry authorizes nothing
- [x] 3.4 An entry naming a path that is not being reverted is inert
- [x] 3.5 No declaration reaches the artifact's branch, because the channel is not in the tree
      the branch is published from — and so no path inside the tree is reserved
- [x] 3.6 The worker's standing instructions for a conflict say the file exists, what it is for,
      and that leaving it out means handing off rather than publishing
- [x] 3.7 The worker is granted the outbox explicitly, since nothing outside its working
      directory is writable otherwise. Measured against the real CLI, both ways
- [x] 3.8 The outbox has the same lifetime as the tree on every path that ends a run: released
      with it, and reclaimed by the startup sweep where a crash ran no release

## 4. Publishing and refusing

- [x] 4.1 Any undeclared revert refuses: nothing is published, before `resolve` is called,
      beside the conflict-marker check
- [x] 4.2 The refusal is a handoff naming every undeclared path and what it would have undone
- [x] 4.3 A declared revert publishes, and names each declared path and the base state it
      discards on the resolution and in the run record — the same places the refusal would have
      been reported
- [x] 4.4 Both paths hold where the claim was lost mid-execution, which publishes and returns
      before the post-publish re-ask

## 5. Tests

- [x] 5.1 A base rewrite restored, undeclared: refused, and the path is named
- [x] 5.2 A base deletion undone, undeclared: refused, and the path is named
- [x] 5.3 A base rename undone — the old path republished alongside the new one
- [x] 5.4 The same two, declared: published, and the declaration is visible on the resolution
      and in the run record
- [x] 5.5 Two reverts, one declared: refused, naming only the undeclared path
- [x] 5.6 A declaration whose named base state is stale: refused
- [x] 5.7 A blanket or pathless declaration: refused
- [x] 5.8 A declaration naming a path that is not reverted: published, unremarked
- [x] 5.9 Taking the base's side, combining both sides, and honouring the base's deletion: each
      published with no declaration and no handoff
- [x] 5.10 A path the base changed and the artifact head already matched: published
- [x] 5.11 The declaration file is in no published commit, declared or not
- [x] 5.12 Refusal reaches `resolve` never having been called
- [x] 5.13 The two instances from PR #64, as regressions against the guard rather than against
      their individual fixes — stated as the tree each would have published, not as the status
      codes that produced them
- [x] 5.14 A declaration the repository itself commits into the tree authorizes nothing, and is
      carried into the artifact as the ordinary content it is
- [x] 5.15 The startup sweep reclaims an outbox a crashed run left beside its tree, and leaves
      one young enough to belong to a live sibling
- [x] 5.16 A release whose tree cannot be removed still removes the outbox

## 6. Documentation

- [x] 6.1 `docs/architecture.md`: why a published resolution is checked against the base, what a
      declaration is, and that the injection surface it opens is an accepted cost — in the
      execution section rather than beside the adapters

## 7. What outlives this change

- [x] 7.1 A person who agrees to a refused revert leaves no answer an Igor can read next cycle,
      which `design.md` deliberately declines to carry: issue 130
- [x] 7.2 The base state a declaration must quote is given only for the conflicted paths, so a
      revert of any other base change can only be refused: issue 131
- [x] 7.3 A base change to a path the tree read cannot carry — a symlink, a bumped submodule —
      is flagged correctly and cannot be published or declared at all: issue 134
