## 1. The requirement

- [x] 1.1 One added `task-execution` requirement: a rename reaches the artifact whole or not at
      all, and an unreadable half refuses the publish rather than dropping silently
- [x] 1.2 Added rather than modified, argued in `proposal.md`: the in-force removals requirement
      governs every change execution *read*, and here the destination was never read, so it is
      satisfied literally and defeated in spirit
- [x] 1.3 Say in the requirement that the source's removal must not enter the change list before
      the destination has been read, since the early emit is the mechanism rather than an
      incidental detail
- [x] 1.4 Say why it refuses rather than dropping both halves, in the requirement and at length in
      `design.md` — silent incompleteness is the harm the in-force requirement names
- [x] 1.5 Bound the scope in the requirement: an unreadable file that is not half of a rename is
      out of scope and keeps today's handling
- [x] 1.6 `design.md` earned by two choices with live alternatives — refuse versus publish without
      the rename, and read-first versus buffer-and-flush — plus the record of why the class is not
      folded into one guard

## 2. `changes()` emits a pair together

- [ ] 2.1 In `src/worktree.ts`, read the destination before the source's removal is pushed, so a
      throw leaves nothing in `out` for that pair
- [ ] 2.2 The catch refuses for an unreadable rename destination rather than falling through to
      the bare `continue`, and the error names the path
- [ ] 2.3 The unmerged branch of that catch is untouched: it handles a different case and is
      reached by a different flag test
- [ ] 2.4 An unreadable file that is not half of a rename still reaches the existing `continue`

## 3. Tests

- [ ] 3.1 A rename whose destination is a dangling symlink: observed publishing a lone deletion on
      the unfixed code, then refusing after
- [ ] 3.2 The refusal names the unreadable path
- [ ] 3.3 A rename whose halves both read is unchanged — the existing rename tests stay green
- [ ] 3.4 An unreadable file that is not part of a rename is still skipped rather than refused
- [ ] 3.5 A mutation check: restore the early emit and confirm 3.1 goes red

## 4. Ordering

- [ ] 4.1 Land after [#114](https://github.com/adamstallard/igor/pull/114), which touches the same
      function. This is a separate bug in a different part of it, but merging onto a tree without
      #114 means resolving the pairing change by hand
- [ ] 4.2 Nothing here gates [#112](https://github.com/adamstallard/igor/pull/112). The `git rm:*`
      condition in that change is about a removal not surviving; here the removal survives and the
      addition does not
