## 1. What the base changed

- [ ] 1.1 From the merge state already in hand, read the merge base of the artifact's head and
      the commit brought in, and the base's changes since it — path, status, and the content at
      the merge base and at the base for each
- [ ] 1.2 Carry it beside the merge state rather than re-deriving it at the publish site; a
      released tree cannot answer the question

## 2. The comparison

- [ ] 2.1 For each path the base changed, resolve what the resolution publishes for it: its own
      file, its own deletion, or — where it mentions the path at all — the artifact head's copy
- [ ] 2.2 A revert is exact restoration of the merge-base state where the base holds something
      else: content equal to the merge base, presence against a deletion, absence against an
      addition
- [ ] 2.3 Content that matches neither the base nor the merge base is a resolution, not a
      revert, and passes
- [ ] 2.4 A path the artifact head already held identically to the base is not a revert

## 3. The declaration

- [ ] 3.1 A file the worker writes into the tree at a fixed path, read by the loop: a list of
      entries, each naming one path and the base state it discards — the base's blob sha, or
      that the base deleted the path
- [ ] 3.2 An entry authorizes only where that state is what the base actually holds; otherwise
      the revert counts as undeclared
- [ ] 3.3 No blanket form: no wildcard path, no whole-resolution flag, and nothing read from
      role or org configuration. A malformed or pathless entry authorizes nothing
- [ ] 3.4 An entry naming a path that is not being reverted is inert
- [ ] 3.5 The file is removed from the changes before they are published, so no declaration
      reaches the artifact's branch
- [ ] 3.6 The worker's standing instructions for a conflict say the file exists, what it is for,
      and that leaving it out means handing off rather than publishing

## 4. Publishing and refusing

- [ ] 4.1 Any undeclared revert refuses: nothing is published, before `resolve` is called,
      beside the conflict-marker check
- [ ] 4.2 The refusal is a handoff naming every undeclared path and what it would have undone
- [ ] 4.3 A declared revert publishes, and names each declared path and the base state it
      discards on the resolution and in the run record — the same places the refusal would have
      been reported
- [ ] 4.4 Both paths hold where the claim was lost mid-execution, which publishes and returns
      before the post-publish re-ask

## 5. Tests

- [ ] 5.1 A base rewrite restored, undeclared: refused, and the path is named
- [ ] 5.2 A base deletion undone, undeclared: refused, and the path is named
- [ ] 5.3 A base rename undone — the old path republished alongside the new one
- [ ] 5.4 The same two, declared: published, and the declaration is visible on the resolution
      and in the run record
- [ ] 5.5 Two reverts, one declared: refused, naming only the undeclared path
- [ ] 5.6 A declaration whose named base state is stale: refused
- [ ] 5.7 A blanket or pathless declaration: refused
- [ ] 5.8 A declaration naming a path that is not reverted: published, unremarked
- [ ] 5.9 Taking the base's side, combining both sides, and honouring the base's deletion: each
      published with no declaration and no handoff
- [ ] 5.10 A path the base changed and the artifact head already matched: published
- [ ] 5.11 The declaration file is in no published commit, declared or not
- [ ] 5.12 Refusal reaches `resolve` never having been called
- [ ] 5.13 The two instances from PR #64, as regressions against the guard rather than against
      their individual fixes

## 6. Documentation

- [ ] 6.1 `docs/architecture.md`: why a published resolution is checked against the base, what a
      declaration is, and that the injection surface it opens is an accepted cost — in the
      execution section rather than beside the adapters
