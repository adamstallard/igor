## 1. Settle the rename pairing first

- [ ] 1.1 Decide what becomes of `statusRecords`' `R`/`C` pairing once porcelain stops reporting
      renames — kept as unreachable defence, removed after PR #114 has landed and settled, or
      detection kept on with a cross-check instead. `design.md` holds the measurements the
      decision rests on
- [ ] 1.2 Whichever way it goes, record it in `design.md` rather than only in the diff, because
      the next reader of that function will ask why the pairing is there or why it is not

## 2. Read the tree without folding

- [ ] 2.1 `ClonedTree.changes()` reads with `--no-renames` alongside `-z` and `-uall`
- [ ] 2.2 The comment on that read says what each flag was bought with, the new one included: a
      removal paired with an unmerged path is absent from the output, not misread in it
- [ ] 2.3 Confirm no other caller of `git status` in the codebase depends on a rename being
      reported as one record

## 3. What the new shape reaches

- [ ] 3.1 A staged rename now arrives as `D ` plus `A `; confirm both fall through `GONE` and the
      content read to the same `ChangedFile` list the pairing produced
- [ ] 3.2 An unstaged rename (`git add -N` on the destination, issue #96) arrives as ` D` plus
      ` A`; confirm the same
- [ ] 3.3 A path reported both removed and written is still counted once, as
      `artifacts-carry-removals` requires

## 4. Tests

- [ ] 4.1 The reproduction, deterministically: base with two similar files, a modify/delete
      conflict on one, the worker deleting the other, and the removal present in `changes()`
- [ ] 4.2 The same run published: the artifact does not carry the removed file
- [ ] 4.3 The removal is named in the recorded outcome, not only carried by the artifact
- [ ] 4.4 A staged rename and an unstaged rename each leave no duplicate path
- [ ] 4.5 A conflicted merge where the worker deletes the conflicted path itself still reads as a
      deletion, which is the `UNMERGED` branch and must not regress
- [ ] 4.6 An ordinary mixed change — additions, modifications, removals, no conflict — is
      unchanged

## 5. Documentation

- [ ] 5.1 `docs/architecture.md`: that the tree is read with rename detection off, and why —
      a fold loses a path from the input, where every other defect in this function was a
      misread of a record that was present

## 6. Boundaries against the rest of the class

- [ ] 6.1 Confirm against the implementation of #103's guard, once it exists, that it is
      downstream of this read rather than a backstop for it, and that its own tests do not
      assume a complete read they are not given
- [ ] 6.2 Confirm #115's half-rename is untouched by this change and still needs its own fix:
      under a fold-free read the two halves arrive as separate records, the deletion is emitted,
      and an unreadable destination is still skipped
