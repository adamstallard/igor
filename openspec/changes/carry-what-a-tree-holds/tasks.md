## 1. The requirement

- [x] 1.1 One added `task-execution` requirement: an artifact carries a changed path as the tree
      holds it, whatever kind of entry that is, and refuses naming the path where a kind cannot be
      represented
- [x] 1.2 Added rather than modifying what is in force, argued in `proposal.md`: the requirements
      already there turn on what execution *read*, and a path `readFile` throws on was never read
- [x] 1.3 Say in the requirement why refusing alone is insufficient — #134's symptom is already a
      refusal, so a requirement forbidding misrepresentation would change nothing about it
- [x] 1.4 `design.md` for the four choices with live alternatives: carrying versus refusing, what
      `content: string` becomes, where the mode comes from, and what the comparison does with a
      submodule

## 2. Choose the shape, against the consumers

- [ ] 2.1 Enumerate every consumer of `ChangedFile` — `carried()`, `undone()`, the publish path,
      the handoff rendering, the outcome record — and what each does with `content`
- [ ] 2.2 Choose among the three shapes in `design.md` on that evidence and record which and why.
      **A `string | Buffer` union is rejected already**: the name side made that mistake and fixed
      it, and `.length` and `+` work on either, so a consumer that forgets is wrong in silence
- [ ] 2.3 Confirm the chosen shape makes a consumer that ignores a kind fail to compile rather
      than fail at runtime

## 3. The read

- [ ] 3.1 `changes()` reports a symbolic link by its target, read with `readlink` rather than by
      following it — a link to a missing path is carried, not skipped
- [ ] 3.2 It reports a submodule by the commit the tree holds, not as a deletion
      ([#127](https://github.com/adamstallard/igor/issues/127))
- [ ] 3.3 It reports a file whose bytes are not valid UTF-8 as those bytes
      ([#67](https://github.com/adamstallard/igor/issues/67))
- [ ] 3.4 The mode comes from a source that gives one, and the second read disagrees with the
      first about neither names nor rename folding — see `design.md`
- [ ] 3.5 A kind that still cannot be represented refuses, naming the path and the kind
- [ ] 3.6 A regular file is reported as the content git stores for it, so a clean filter —
      `core.autocrlf`, an `eol=` or `text=auto` attribute, an `ident` — does not put the smudged
      checkout in the artifact. How those bytes are obtained is costed in `design.md`

## 4. The publish

- [ ] 4.1 `CodeHost.resolve` and the tree requests send the mode the entry has rather than
      `100644` for everything
- [ ] 4.2 A submodule is sent as a commit id, not a blob
- [ ] 4.3 Confirm the tree API accepts each mode as sent, measured rather than assumed — the
      archived `artifacts-carry-removals` work records what it accepts for removals and is the
      precedent for how to find out

## 5. The comparison

- [ ] 5.1 `undone()` compares a submodule by commit id
- [ ] 5.2 Establish what the mode-only skip means for an entry with no content, since it has no
      analogue there. **This is the quiet one**: a gitlink comparison that always returns equal
      suppresses a real revert and no test that does not bump a submodule would notice
- [ ] 5.3 A base change to a symbolic link or a submodule is no longer flagged as undone
      ([#134](https://github.com/adamstallard/igor/issues/134))
- [ ] 5.4 Confirm `undone()` needs no change for a filtered path once the read is fixed: it
      compares what the resolution publishes against what the base holds, and with the read
      carrying what git stores those are the same basis. **It is wrong to "fix" the comparison
      here** — `guard-silent-reverts` states the requirement over what is published, and a
      comparison against the checkout would contradict its own requirement while leaving every
      other path in the same publish smudged

## 6. Tests

- [ ] 6.1 A symbolic link added, modified and deleted by a worker, each carried
- [ ] 6.2 A dangling symbolic link carried rather than skipped — the reachable cause of
      [#115](https://github.com/adamstallard/igor/issues/115)
- [ ] 6.3 A submodule the base bumped, carried through a resolution with no removal published
- [ ] 6.4 An unmerged submodule not reported as a deletion
- [ ] 6.5 A binary carried byte-for-byte, with no replacement character in what is published
- [ ] 6.6 A kind that cannot be represented refuses, naming the path
- [ ] 6.7 Every existing test over ordinary text files unchanged — that suite is the evidence the
      widening broke nothing
- [ ] 6.7a A clone whose own `.gitattributes` says `* text=auto eol=crlf` publishes nothing for a
      path the worker never touched, and the cleaned bytes for one it did — `git status` is empty
      in that clone, so the test has to assert on what is published rather than on what changed
- [ ] 6.8 Each of 6.1–6.6 and 6.7a observed red before its fix, and mutation-checked

## 7. Documentation

- [ ] 7.1 `docs/architecture.md` §6.7.3 rewritten rather than deleted: the gap is retired, and what
      it records about why reading as `utf8` produces a plausible wrong file is the clearest
      statement of that hazard in the repository
- [ ] 7.2 Accepted-gap 12 removed from the list in the same file
- [ ] 7.3 §6.7.2a, which describes how the tree is read, says what the read now carries

## 8. Boundaries

- [ ] 8.1 [#125](https://github.com/adamstallard/igor/pull/125) closes #127 by a different route —
      not inferring a deletion from an unreadable path. Confirm the two compose: that guard is
      still wanted for paths that are genuinely unreadable, and should not be removed because this
      made submodules readable
- [ ] 8.2 [#120](https://github.com/adamstallard/igor/pull/120)'s requirement is phrased over *any*
      path that cannot be read, so it holds with fewer cases reaching it. Confirm nothing here
      weakens it
