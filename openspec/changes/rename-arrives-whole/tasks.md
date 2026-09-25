## 1. The requirement

- [x] 1.1 One added `task-execution` requirement: a changed path execution cannot read stops the
      publish rather than being omitted from it silently
- [x] 1.2 Added rather than modified, argued in `proposal.md`: the in-force removals requirement
      governs every change execution *read*, and here the path was never read, so it is satisfied
      literally and defeated in spirit
- [x] 1.3 **Stated over paths, not over renames.** [#118](https://github.com/adamstallard/igor/pull/118)
      switches `changes()` to `--no-renames` and deletes the pairing in `statusRecords`, so a
      rename becomes an unrelated removal and addition. The failure survives that; a requirement
      phrased as *both halves of a pair* would not
- [x] 1.4 Say why it refuses rather than omitting the path and publishing the rest — silent
      incompleteness is the harm the in-force requirement names
- [x] 1.5 Accept the widening rather than carve it out: an unreadable addition refuses too, since
      carving it out would depend on knowing which paths belong to each other
- [x] 1.6 `design.md` earned by the paths-versus-renames choice, the refuse-versus-omit choice, and
      the record of why the three instances of this class do not fold into one guard

## 2. No change reaches the artifact in pieces

- [ ] 2.1 In `src/worktree.ts`, every path a change touches is read before any of it enters the
      change list, so a throw leaves nothing behind
- [ ] 2.2 The catch refuses for an unreadable changed path rather than falling through to the bare
      `continue`, and the error names the path
- [ ] 2.3 The unmerged branch of that catch is untouched: it handles a different case and is
      reached by a different flag test
- [ ] 2.4 Works whether a rename arrives as one record or as two, so it neither depends on the
      pairing nor breaks when #118 removes it

## 3. Tests

- [ ] 3.1 A rename whose destination is a dangling symlink: observed publishing a lone deletion on
      the unfixed code, then refusing after
- [ ] 3.2 An addition that cannot be read refuses, with the path named
- [ ] 3.3 The refusal names the unreadable path in both cases
- [ ] 3.4 A change whose every path reads is unchanged — the existing tests stay green
- [ ] 3.5 A mutation check: restore the early emit and confirm 3.1 goes red
- [ ] 3.6 Run 3.1 and 3.2 both with and without `--no-renames`, so the behaviour is pinned either
      side of #118

## 4. Ordering

- [x] 4.1 Land after [#114](https://github.com/adamstallard/igor/pull/114), which touches the same
      function — merged as `49e0866`
- [ ] 4.2 Land after [#118](https://github.com/adamstallard/igor/pull/118), whose implementation
      deletes the pairing this function currently has. Implementing before it means writing against
      a shape that is about to go
- [ ] 4.3 Nothing here gates [#112](https://github.com/adamstallard/igor/pull/112). That change's
      `git rm:*` condition is about a removal not surviving; here the removal survives and
      something else does not
