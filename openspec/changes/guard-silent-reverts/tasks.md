## 1. What the base changed

- [ ] 1.1 From the merge state already in hand, read the merge base of the artifact's head and
      the commit brought in, and the base's changes since it — path, status, and the content at
      the merge base for each
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

## 3. Refusing

- [ ] 3.1 Where any path reverts, nothing is published — before `resolve` is called, beside the
      conflict-marker check
- [ ] 3.2 The outcome is a handoff naming every reverted path and what it would have undone
- [ ] 3.3 It refuses on the lost-claim path too, which publishes and returns before the
      post-publish re-ask

## 4. Tests

- [ ] 4.1 A base rewrite restored: refused, and the path is named
- [ ] 4.2 A base deletion undone: refused, and the path is named
- [ ] 4.3 A base rename undone — the old path republished alongside the new one
- [ ] 4.4 Taking the base's side, combining both sides, and honouring the base's deletion: each
      published, no handoff
- [ ] 4.5 A path the base changed and the artifact head already matched: published
- [ ] 4.6 A worker that says the revert was intended: still refused
- [ ] 4.7 Refusal reaches `resolve` never having been called
- [ ] 4.8 The two instances from PR #64, as regressions against the guard rather than against
      their individual fixes

## 5. Documentation

- [ ] 5.1 `docs/architecture.md`: why a published resolution is checked against the base, in the
      execution section rather than beside the adapters
