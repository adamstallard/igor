## 1. The requirement

- [x] 1.1 One added `task-execution` requirement: a path the worker added or modified that
      execution cannot read stops the publish rather than being omitted from it silently
- [x] 1.2 `proposal.md` says why it is added rather than modified; `design.md` holds why it is
      stated over paths, why it refuses rather than omitting, and the other choices

## 2. No unreadable path is skipped

- [ ] 2.1 In `src/worktree.ts`, `changes()` keeps an entry for an added or modified path whose
      read throws, marked as unreadable, rather than the bare `continue`
- [ ] 2.2 The publishing step in `src/execute.ts` refuses when any entry is unreadable, hands the
      item off, and names each such path in a form markup in it cannot alter; where the claim was
      lost, it does what a loss requires and the loss message names the path
- [ ] 2.3 The unmerged branch of the catch around `readFile` in `changes()` emits a deletion only for a path gone from disk, the
      removal the worker made; an unmerged path still present but unreadable gets the unreadable
      entry of 2.1. [#125](https://github.com/adamstallard/igor/pull/125)'s task 5.2 makes the same
      distinction in the same branch, so whichever builds second builds on the other's
- [ ] 2.4 Nothing depends on pairing: a rename's `D` and `A` records are handled as two paths, and
      the refusal leaves nothing published whatever order they arrive in
- [ ] 2.5 A run killed for a limit records the unreadable path among what changed, since
      `changes()` keeps its entry (2.1) rather than skipping it or throwing

## 3. Tests

- [ ] 3.1 A rename whose destination is a file without read permission: observed publishing a lone
      deletion on the unfixed code, then refusing after. A dangling symlink is not used, since
      [#137](https://github.com/adamstallard/igor/pull/137) and
      [#175](https://github.com/adamstallard/igor/pull/175) each make it readable
- [ ] 3.2 An addition that cannot be read refuses, with the path named
- [ ] 3.3 The refusal names the unreadable path in both cases, and a path holding a backtick is
      named exactly
- [ ] 3.4 A change whose every path reads is unchanged: the existing tests stay green
- [ ] 3.5 A mutation check: restore the bare `continue` and confirm 3.1 goes red
- [ ] 3.6 A worker deleting an unmerged `DU` path still publishes, with no removal of it, as
      *A removal the worker did ask for is not published where the base lacks the path* requires;
      a `UU` path resolved and left unreadable refuses, with no removal of it
- [ ] 3.7 A run killed for a limit after writing an unreadable file, and a run refused for one,
      each record that file among what changed
- [ ] 3.8 A run that lost its claim and wrote an unreadable file publishes the loss draft, and its
      message names the file

## 4. Ordering

- [x] 4.1 Land after [#114](https://github.com/adamstallard/igor/pull/114), which touches the same
      function: merged as `49e0866`
- [x] 4.2 Land after #118: merged as `50e9d9c` and archived. Every candidate removal is checked
      against HEAD before it enters the change list, both where a `D` record is emitted and in the
      unmerged branch of the catch. That guard and this one
      answer different questions, whether the base tree holds the path and whether the path could
      be read at all, so neither subsumes the other
- [ ] 4.3 Settle with #125 the shared catch branch and whether an unmerged submodule reaches this
      requirement, and with [#150](https://github.com/adamstallard/igor/pull/150) whether an
      unreadable path outside `openspec/changes/` refuses a gate-one run (design.md, *Open
      Questions*)
- [ ] 4.4 At archive, move into `openspec/specs/task-execution/decisions.md` each decision in
      `design.md` that by then has evidence of a kind decision records accept (a failure, a
      measurement or an outside fact), as a Rationale entry for *A path execution cannot read is never silently
      omitted*
