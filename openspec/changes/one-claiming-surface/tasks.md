## 1. The agreement (gate one — this pull request)

- [x] 1.1 `work-claiming`: holder field written before the claim message, later write holds a
      single-valued field, losing Igor never clears it, one tracker per organization, items
      held by others, a person directing an Igor
- [x] 1.2 `surface-adapter`: the holder-field declaration says single value or list, and
      whether it is distinct from the assignee
- [x] 1.3 `task-execution`: a person approves every Igor pull request
- [x] 1.4 `design.md`: the Linear measurement of 2026-10-03 and the four choices with live
      alternatives
- [x] 1.5 `docs/machine-accounts.md`: "Why not a GitHub App" narrowed to GitHub as the claiming
      tracker, and when an App is the better identity

## 2. Configuration

- [ ] 2.1 Refuse a configuration whose roles take claims on more than one tracker, naming them
- [ ] 2.2 The adapter interface declares single-valued or list, and distinct-from-assignee,
      alongside `nativeHolderField`; GitHub declares list and not distinct

## 3. Claiming

- [ ] 3.1 Write the holder field before the claim message, in the GitHub adapter as well
- [ ] 3.2 Stand-down removes only what names this Igor; on a single-valued field it replies and
      changes nothing
- [ ] 3.3 Discovery skips items held by another party, and items assigned to a person unless
      the holder field names this Igor
- [ ] 3.4 An item a person handed to this Igor: post the claim message and start without the
      settle interval

## 4. Pull requests

- [ ] 4.1 An Igor never merges a pull request it opened, and counts only a person's approval
      before merging any pull request

## 5. Outside this change

- [ ] 5.1 A Linear adapter implementing the above — file an issue before archiving
- [ ] 5.2 GitHub App credentials for `gh` and git, for Igors whose claims live elsewhere — file
      an issue before archiving
- [ ] 5.3 Measure whether a pull request opened by a GitHub App links to its Linear issue
