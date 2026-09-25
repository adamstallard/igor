## 1. Read the tree without folding

- [x] 1.1 `ClonedTree.changes()` reads with `--no-renames` alongside `-z` and `-uall`
- [x] 1.2 The comment on that read says what each flag was bought with, the new one included: a
      removal paired with an unmerged path is absent from the output, not misread in it
- [x] 1.3 Confirm no other caller of `git status` in the codebase depends on a rename being
      reported as one record

## 2. Owe no removal for a path the index invented

- [x] 2.1 The gone-check skips a record whose index column is `INDEX_NEW` — under `--no-renames`
      that is `AD` and nothing else, since no `R` or `C` record is emitted
- [x] 2.2 The comment says why: an index-added path is absent from HEAD, therefore absent from
      `base_tree`, and the tree API refuses a removal of a path the base tree does not hold with
      `422 GitRPC::BadObjectState`, failing the whole publish
- [x] 2.3 Confirm the guard reads the record's own flags rather than building a set: nothing pairs
      under `--no-renames`, so there is no second path to cross-reference

## 3. What the new shape reaches

- [x] 3.1 A staged rename now arrives as `D ` plus `A `; confirm both fall through `GONE` and the
      content read to the same `ChangedFile` list the pairing produced
- [x] 3.2 An unstaged rename (`git add -N` on the destination, issue #96) arrives as ` D` plus
      ` A`; confirm the same, and that no `-001.md` style invented path can be produced at all
- [x] 3.3 A detected copy arrives as `A ` with the source `M `; confirm the source is not removed
- [x] 3.4 A path reported both removed and written is still counted once, as
      `artifacts-carry-removals` requires

## 4. Tests

- [x] 4.1 The reproduction, deterministically: base with two similar files, a modify/delete
      conflict on one, the worker deleting the other, and the removal present in `changes()`
- [x] 4.2 The same run published: the artifact does not carry the removed file
- [ ] 4.3 The removal is named in the recorded outcome, not only carried by the artifact.
      **Not done, and not owed by the requirement:** `src/execute.ts:1850` already writes
      `${c.kind} ${showName(c)}` for every change, so a removal that reaches `changes()` reaches
      the record by construction — 4.1 and 4.2 pin that it reaches `changes()` and `carried()`.
      A test at the execute layer would pin the rendering, not the removal, and there is no
      seam for one that does not stand up a whole execution
- [x] 4.4 A chain rename — `git mv a b && mv b c && git add -N c` — removes `a`, adds `c`, and
      publishes no removal of `b`
- [x] 4.5 A staged rename and an unstaged rename each leave no duplicate path
- [x] 4.6 A conflicted merge where the worker deletes the conflicted path itself still reads as a
      deletion, which is the `UNMERGED` branch and must not regress
- [x] 4.7 An ordinary mixed change — additions, modifications, removals, no conflict — is
      unchanged

## 5. Settle the pairing mechanism, after #114

- [x] 5.1 Once PR #114 has landed, run its tests against the flag and the guard: a rename yields a
      removal plus an addition, and a chain yields no removal of an invented path. They pin the
      behaviour any replacement must satisfy, so they are the gate on 5.2 and not a formality
- [x] 5.2 With those tests green, delete `PAIRED`, `RENAME`, `indexOnly` and the `from`/`++i`
      pairing in `statusRecords` — unreachable once porcelain emits no `R` or `C` record.
      `INDEX_NEW` stays, as the gone-check's guard
- [x] 5.3 Did not apply — #114 landed as `49e0866` first, so 5.2 was taken. If #114 has not
      landed when this is implemented, land the flag and the guard alone and
      leave the pairing in place: it is unreachable rather than wrong, and deleting it under an
      open pull request on the same function is a conflict for no gain
- [x] 5.4 Record the outcome in `design.md` rather than only in the diff, because the next reader
      of that function will ask why the pairing is there or why it is not

## 6. The residual the guard does not reach

- [x] 6.1 Filed as [#121](https://github.com/adamstallard/igor/issues/121) rather than closed
      here: no shipped `commands` list grants `git add`, so no shipped role can reach it, and a
      tree lookup per publish is a large cost against a state nothing can currently produce.
      `git add -N n && rm n` prints ` D n` for a path HEAD does not hold, so a removal of it
      is published and refused with the same 422. Identical with rename detection on, so it is
      not this change's doing. Decide whether to close it here with a tree lookup, or file it as
      its own issue and tick this with the number — `design.md` holds the measurements, including
      that `--porcelain=v2` does not distinguish the case
- [x] 6.2 Closed here, [#122](https://github.com/adamstallard/igor/issues/122). It was filed as a
      race the change should not settle, on the assumption that closing it meant paying for a
      lookup. It does the opposite: the produce path re-read the base branch's sha at publish
      time, so publishing against the sha the clone was cut from **removes** that round-trip and
      the window with it. `WorkingTree.head()` offers the sha, execution passes it as
      `ArtifactRequest.baseSha`, and `produce` prefers it to `branchSha`. `commitOnBranch` never
      had the window — its `base_tree` is `parents[0]`, which is the clone's own HEAD. The
      requirement is unconditional, so leaving this open would have left it unmet at archive

- [ ] 6.3 **A third route, found reviewing 6.2's fix and not yet filed.** The guard sits on the
      gone-check, and the `catch` around the content read emits a deletion for any unmerged record
      whose file is gone without asking about HEAD. A `DU` path — deleted by the artifact branch,
      modified by the base — is absent from `parents[0]`, so the worker removing the base's copy,
      which is exactly what `conflictPrompt` asks for, publishes a removal no tree holds.
      Reproduced end to end; `design.md` holds the measurement. The second requirement is
      unconditional, so **this change cannot archive until this is closed or filed** — file it and
      tick this with the number

## 7. Documentation

- [x] 7.1 `docs/architecture.md`: that the tree is read with rename detection off, and why — a
      fold loses a path from the input, where every other defect in this function was a misread of
      a record that was present — and that the gone-check owes no removal for a path the index
      invented, because the tree API refuses one

## 8. Boundaries against the rest of the class

- [x] 8.1 Confirm against the implementation of #103's guard, once it exists, that it is
      downstream of this read rather than a backstop for it, and that its own tests do not assume
      a complete read they are not given
- [x] 8.2 Confirm #115's half-rename is untouched by this change and still needs its own fix:
      under a fold-free read the two halves arrive as separate records, the deletion is emitted,
      and an unreadable destination is still skipped
