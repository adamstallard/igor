## 1. The agreement (gate one — this pull request)

- [x] 1.1 `work-claiming`: one tracker per organization, and why claims exist; an App claims on
      GitHub by `igor:<role>` label and claim comment; holder field written before the claim
      message; later write holds a single-valued field, and a losing Igor never clears it;
      items held by others; a person directing an Igor; what follows a stop; an issue created
      from chat links the chat message, is not created twice for one message, and has its
      link posted in the chat once. Every
      claiming tracker has a holder field, so no claim is a message alone. The GitHub label rules match Linear's delegate rules
      case for case; a person reassigns by removing the holding Igor's label first
- [x] 1.2 `surface-adapter`: every tracker adapter declares a holder field, with no
      message-only declaration; the holder-field declaration says single value or list, and
      whether it is distinct from the assignee; GitHub's `igor:` labels are distinct; the
      GitHub adapter claims by label, because an Igor on GitHub is an App
- [x] 1.3 `task-execution`: a person approves every Igor pull request
- [x] 1.4 `role-config`: an Igor holds exactly one role, and its identity is that role; a role
      naming more than one base in `extends` is refused
- [x] 1.5 `design.md`: what a claim is for, one role per Igor, the label mirroring Linear's
      delegate, reassigning by removing the holding Igor's label first, the Linear measurement
      of 2026-10-03, Discord polled rather than held open, Discord directing work and never
      holding claims, how the Discord bot finds new messages, why the link rather than the
      marker prevents a duplicate issue, and the choices with live
      alternatives
- [x] 1.6 `docs/machine-accounts.md`: an Igor on GitHub is a GitHub App, one per role; machine
      users are not supported at launch; Discord directs work and holds no claim
- [x] 1.7 `docs/architecture.md`: §1 says Discord is polled, how the bot finds new messages,
      that the marker only saves work, and that stop is seen on the claiming tracker; §5.1 says Discord directs work and is
      never a claiming tracker; §5.2 drops the message-only claim; §2.1 states one role per Igor; §6.9 is marked superseded by this change.
      `README.md` no longer describes an Igor holding several roles

## Gate two (Adam, 2026-10-04)

Gate two also implements `openspec/changes/app-identity/` (#158), merged into this branch when
gate two starts; both changes are archived together (`design.md`, *Built together with
`app-identity`*).

## 2. Configuration

- [ ] 2.1 Refuse a configuration whose roles take claims on more than one tracker, naming them,
      or on Discord, which directs work and cannot hold claims
- [ ] 2.2 The adapter interface declares single-valued or list, and distinct-from-assignee,
      alongside `nativeHolderField`; GitHub's `igor:` labels declare list and distinct
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
      from the issue's events, or who set the delegate, rather than assuming. Read who removed
      it the same way: when this Igor's label is gone, the latest `unlabeled` event for it names
      the actor; its own bot account is its own release, and anyone else is a stop whose
      receipt names them. Match the actor by the bot's numeric `actor.id` and `type == "Bot"`,
      not by `performed_via_github_app`, which is null; order events by id; and read every page
      (design, measured 2026-10-04)

- [ ] 3.6 The GitHub adapter claims by `igor:<role>` label, never by assignment, and reads its
      labels back after writing them. Under #146 (`release-a-claim-that-cannot-be-kept`),
      `release` returns what the surface recorded, and "did the holder field clear" becomes
      "is my `igor:<role>` label gone". Remove today's assignee claim path in the same change
      that adds the label claim and App credentials (5.2), so no build is left without a way to
      claim (Adam, 2026-10-04)
- [ ] 3.7 A stop removes this Igor's own label or delegate, and a person assigning themselves
      afterwards keeps the item
- [ ] 3.8 An Igor labelled by a person on an issue another Igor holds doesn't claim it, and
      comments once that removing the holding Igor's label hands it over; a person's label never
      makes the holding Igor lose its claim
- [ ] 3.9 An issue created from a chat instruction links the chat message, and its link is
      posted back in the chat. Before creating one, look on the claiming tracker for an issue
      that already links the message, and create nothing if one exists. When one exists, post
      its link in the chat only if the chat has no reply with that link yet

## 4. Pull requests

- [ ] 4.1 An Igor never merges a pull request it opened, and counts only a person's approval
      before merging any pull request; a review whose author is a `Bot` account is an Igor's

## 5. Outside this change

- [x] 5.1 A Linear adapter implementing the above — filed as #161, after the Discord adapter
      (#160) (Adam, 2026-10-06)
- [ ] 5.2 GitHub App credentials for `gh` and git — answered by #158 (`app-identity`), built
      in this change's gate two
- [ ] 5.3 Measure whether a pull request opened by a GitHub App links to its Linear issue. Needs a
      GitHub repository connected to Linear; `aura-workroom` is not connected
- [ ] 5.4 When App support ships, update `docs/deployment.md`, which still says an Igor must be
      a machine user, to describe the App as the only identity. The machine-user steps were
      removed from `docs/machine-accounts.md` at review (Adam, 2026-10-06): no Igor runs yet,
      so nobody needs them
- [ ] 5.5 Store each channel's marker on the state branch, keyed by role and channel id (Adam,
      2026-10-06; `design.md`). The marker is the newest message already handled, after which
      the next poll asks Discord for messages. It is only a cache; the link check in 3.9 is what
      prevents a duplicate issue. Built with the Discord adapter (#160)
