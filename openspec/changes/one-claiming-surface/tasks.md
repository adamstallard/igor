## 1. The agreement (gate one — this pull request)

- [x] 1.1 `work-claiming`: one tracker per organization, and why claims exist; an App claims on
      GitHub by `igor:<role>` label and claim comment; holder field written before the claim
      message; later write holds a single-valued field, and a losing Igor never clears it;
      items held by others; a person directing an Igor; an issue created from chat points back
      to the chat
- [x] 1.2 `surface-adapter`: the holder-field declaration says single value or list, and
      whether it is distinct from the assignee; the GitHub adapter claims by assignee or by
      label, depending on the identity
- [x] 1.3 `task-execution`: a person approves every Igor pull request
- [x] 1.4 `design.md`: what a claim is for, the Linear measurement of 2026-10-03, the open
      question about the App's label, and the choices with live alternatives
- [x] 1.5 `docs/machine-accounts.md`: a GitHub App is the default identity on public
      repositories, a machine user only where an Igor must be an assignee or a requested
      reviewer

## 2. Open before implementation

- [ ] 2.1 Decide whether GitHub's `igor:` label is declared distinct from the assignee (see
      `design.md`, *Open: the App's label and items assigned to a person*)

## 3. Configuration

- [ ] 3.1 Refuse a configuration whose roles take claims on more than one tracker, naming them
- [ ] 3.2 The adapter interface declares single-valued or list, and distinct-from-assignee,
      alongside `nativeHolderField`; GitHub's assignee declares list and not distinct

## 4. Claiming

- [ ] 4.1 Write the holder field before the claim message, in the GitHub adapter as well
- [ ] 4.2 Stand-down removes only what names this Igor; on a single-valued field it replies and
      changes nothing
- [ ] 4.3 Discovery skips items held by another party, and items assigned to a person unless
      the holder field names this Igor
- [ ] 4.4 An item a person handed to this Igor: post the claim message and start without the
      settle interval
- [ ] 4.5 The GitHub adapter claims by `igor:<role>` label when the Igor acts as an App, and
      reads its labels back after writing them
- [ ] 4.6 An issue created from a chat instruction quotes or links the chat, and its link is
      posted back in the chat

## 5. Pull requests

- [ ] 5.1 An Igor never merges a pull request it opened, and counts only a person's approval
      before merging any pull request

## 6. Outside this change

- [ ] 6.1 A Linear adapter implementing the above — file an issue before archiving
- [ ] 6.2 GitHub App credentials for `gh` and git — file an issue before archiving
- [ ] 6.3 Measure whether a pull request opened by a GitHub App links to its Linear issue. Needs a
      GitHub repository connected to Linear; `aura-workroom` is not connected
- [ ] 6.4 When App support ships, update `README.md`, `docs/deployment.md` and
      `docs/architecture.md` §6.9, which still say an Igor must be a machine user
