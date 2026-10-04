## 1. The agreement (gate one — this pull request)

- [x] 1.1 `work-claiming`: one tracker per organization, and why claims exist; an App claims on
      GitHub by `igor:<role>` label and claim comment; holder field written before the claim
      message; later write holds a single-valued field, and a losing Igor never clears it;
      items held by others; a person directing an Igor; what follows a stop; an issue created
      from chat points back to the chat. The GitHub label rules match Linear's delegate rules
      case for case; a person reassigns by removing the holding Igor's label first
- [x] 1.2 `surface-adapter`: the holder-field declaration says single value or list, and
      whether it is distinct from the assignee; GitHub's `igor:` labels are distinct; the
      GitHub adapter claims by assignee or by label, depending on the identity
- [x] 1.3 `task-execution`: a person approves every Igor pull request
- [x] 1.4 `role-config`: an Igor holds exactly one role, and its identity is that role; a role
      naming more than one base in `extends` is refused
- [x] 1.5 `design.md`: what a claim is for, one role per Igor, the label mirroring Linear's
      delegate, reassigning by removing the holding Igor's label first, the Linear measurement of 2026-10-03, and the
      choices with live alternatives
- [x] 1.6 `docs/machine-accounts.md`: a GitHub App is the default identity on public
      repositories, a machine user only where an Igor must be an assignee or a requested
      reviewer; one identity per role
- [x] 1.7 `docs/architecture.md`: §2.1 states one role per Igor; §6.9 is marked superseded by
      this change. `README.md` no longer describes an Igor holding several roles

## 2. Configuration

- [ ] 2.1 Refuse a configuration whose roles take claims on more than one tracker, naming them
- [ ] 2.2 The adapter interface declares single-valued or list, and distinct-from-assignee,
      alongside `nativeHolderField`; GitHub's assignee declares list and not distinct; GitHub's
      `igor:` labels declare list and distinct
- [ ] 2.3 Remove multi-role Igors from `src/role.ts`: refuse a role whose `extends` names more
      than one base, naming them, in `parentsOf`; delete `unionLane` and the sibling-union
      branch of `capabilitiesOf` (the union of `allow`, `commands` and lane, and the lowest
      `budget_share`, across parents); simplify `lineage` to a single chain; update the
      comments on `Lane` and `capabilitiesOf` that describe combining roles
- [ ] 2.4 In `test/role.test.ts`, replace the `siblings union — an Igor that does two jobs`
      tests with one that a role extending two bases is refused

## 3. Claiming

- [ ] 3.1 Write the holder field before the claim message, in the GitHub adapter as well
- [ ] 3.2 Stand-down removes only what names this Igor; on a single-valued field it replies and
      changes nothing
- [ ] 3.3 Discovery skips items held by another party, and items assigned to a person unless
      the holder field names this Igor, including GitHub issues an App Igor finds assigned to a
      person without its label
- [ ] 3.4 An item a person handed to this Igor, by delegate or by `igor:<role>` label: post the
      claim message and start without the settle interval, or the cooldown after a stop
- [ ] 3.5 Tell a person's label or delegation from the Igor's own: read who added the label
      from the issue's events, or who set the delegate, rather than assuming
- [ ] 3.6 The GitHub adapter claims by `igor:<role>` label when the Igor acts as an App, and
      reads its labels back after writing them
- [ ] 3.7 A stop removes this Igor's own label or delegate, and a person assigning themselves
      afterwards keeps the item
- [ ] 3.8 An Igor labelled by a person on an issue another Igor holds doesn't claim it, and
      comments once that removing the holding Igor's label hands it over; a person's label never
      makes the holding Igor lose its claim
- [ ] 3.9 An issue created from a chat instruction quotes or links the chat, and its link is
      posted back in the chat

## 4. Pull requests

- [ ] 4.1 An Igor never merges a pull request it opened, and counts only a person's approval
      before merging any pull request

## 5. Outside this change

- [ ] 5.1 A Linear adapter implementing the above — file an issue before archiving
- [ ] 5.2 GitHub App credentials for `gh` and git — file an issue before archiving
- [ ] 5.3 Measure whether a pull request opened by a GitHub App links to its Linear issue. Needs a
      GitHub repository connected to Linear; `aura-workroom` is not connected
- [ ] 5.4 When App support ships, update `README.md` and `docs/deployment.md`, which still say
      an Igor must be a machine user
