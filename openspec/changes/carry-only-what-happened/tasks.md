## 1. The requirement

- [x] 1.1 One added `task-execution` requirement: an artifact carries an entry only for a change
      the worker actually made — no file it did not touch, no two entries for one file on disk
- [x] 1.2 Added rather than modified, argued in `proposal.md`: no in-force requirement forbids an
      invented addition, and the reason is that nothing forced the question — an invented removal
      is refused by the host, an invented addition publishes cleanly
- [x] 1.3 A sibling requirement rather than one general rule, argued in `proposal.md`: the removal
      half asks whether the base tree holds the path, which answers nothing about an addition, so
      one statement covering both would be looser than either
- [x] 1.4 `design.md` earned by the mechanism being a live choice between three places to
      reconcile the normalisation, plus the `cat-file -Z` rejection carried over from #118

## 2. Measure before choosing

- [ ] 2.1 Does `git status --porcelain=v2` distinguish a tracked decomposed path from a genuinely
      untracked one? #118 asked the equivalent of the removal side and the answer was no, against
      the natural assumption. Measure rather than assume, and record the result in `design.md`
      whichever way it goes
- [ ] 2.2 Whether the same mismatch reaches `changes()` on Linux, where `core.precomposeunicode`
      is off — the `??` path is darwin's, but the comparison is the platform's normalisation
      against the index's, and a store written on macOS and cloned on Linux inverts the sides

## 3. The fix

- [ ] 3.1 Choose among the three in `design.md` on the evidence from §2, and record which and why
- [ ] 3.2 Implement it. One file on disk yields one entry, and a file the worker did not touch
      yields none
- [ ] 3.3 Confirm the chosen mechanism does not disturb what `changes()` reports for a name that
      is not valid UTF-8: `statusRecords` reads bytes precisely so such a name survives, and a fix
      that decodes to compare would undo that

## 4. Tests

- [ ] 4.1 A decomposed path in HEAD, worker touches nothing: observed publishing a phantom
      addition before the fix, nothing after
- [ ] 4.2 The same path edited by the worker: observed publishing two entries before, one after,
      carrying the edited content
- [ ] 4.3 A name that is not valid UTF-8 still survives the read unchanged
- [ ] 4.4 An ordinary run on composed names is unaffected
- [ ] 4.5 Both reproductions mutation-checked: remove the fix, confirm each goes red
- [ ] 4.6 Where the platform decides the behaviour, say so in the test rather than skipping
      silently on the other one

## 5. Documentation

- [ ] 5.1 `docs/architecture.md` §6.7.2a already describes how the tree is read and what it owes.
      Add what it does not owe: an entry for a file nobody touched, and the normalisation that
      made that reachable
