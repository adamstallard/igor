## 1. Raising

- [ ] 1.1 One place that raises an escalation, taking a subject and a body, used by both
      producers rather than one each
- [ ] 1.2 A marker the raiser writes, by which an escalation is recognized
- [ ] 1.3 Assign the store `reviewers`, read back who was actually assigned, and report the
      difference on the precedent `lore-review` sets
- [ ] 1.4 Tests: a proposal escalation, a condition escalation, no reviewers configured

## 2. Subjects

- [ ] 2.1 A quiet proposal's subject is its pull request number and the activity it went quiet
      from
- [ ] 2.2 A condition's subject is its cure key and that occurrence's opening, so a recurrence
      is a new subject — depends on `condition-backoff` task 2.1 for the record to read
- [ ] 2.3 Tests: a cleared-and-recurred condition raises again; a nudged-and-quiet-again
      proposal raises again; a condition probing repeatedly raises once

## 3. Speaking once

- [ ] 3.1 Search the destination for an escalation with this subject before raising
- [ ] 3.2 An open one means raise nothing, comment nothing, write nothing
- [ ] 3.3 A closed one with an unchanged subject means raise nothing and do not reopen
- [ ] 3.4 The next run closes all but the oldest where a race produced two
- [ ] 3.5 Tests: second run silent, state branch wiped and still silent, closed-and-still-quiet
      silent, duplicate collapsed

## 4. Closing

- [ ] 4.1 Close on the subject resolving — merged, closed, active inside the window, condition
      cleared
- [ ] 4.2 Already closed by hand is a no-op, never a reopen
- [ ] 4.3 Tests: each resolution path, and a hand-closed escalation left alone

## 5. Not work

- [ ] 5.1 `universalSkip` skips an escalation by its marker, alongside closed, in flight and
      held — not by assignment and not by lane
- [ ] 5.2 Tests: unassigned escalation skipped; assigned one skipped for the same reason with
      assignees removed; marker stripped by hand makes it an ordinary item

## 6. Failing loudly

- [ ] 6.1 A raise that fails is reported naming the cause, and the conclusion is not recorded
      as delivered
- [ ] 6.2 Reconciliation still writes its promotions and rejections when a raise failed
- [ ] 6.3 `templates/reconcile-on-merge.yml` gains `issues: write`, with a comment saying the
      job opens escalations
- [ ] 6.4 Tests: token without permission, issues disabled, reconciliation completing anyway

## 7. Unsettled

- [ ] 7.1 `reviewers` is the audience for both producers, marked provisional in the code with
      what it was reasoned from. File an issue before archiving if a stuck fleet turns out to
      need a different list from a stuck lore claim.
