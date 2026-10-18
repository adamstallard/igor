## 0. Sequencing

- [ ] 0.1 `condition-backoff` implemented far enough that conditions are rebuilt from the
      execution log, keyed by cure key, with scope, count and next-probe time — every task below
      reads them
- [ ] 0.2 Land after `condition-backoff` archives, so `stuck-conditions` has a base spec rather
      than two open changes writing the whole of one capability

## 1. Running on through every condition

- [ ] 1.1 Nothing in `igor serve`'s loop ends the process because a condition is open, whatever
      its scope: the Igor's own credential, its role, or every seat its role could spend from
      (Adam, 2026-10-18). The loop goes on polling, a stopped scope takes no new item, and each
      condition clears as `condition-backoff` clears it
- [ ] 1.2 Each cycle's report names every stopped scope with its cure key and what would cure it
- [ ] 1.3 Every check before the first cycle still refuses a bad setup and exits non-zero, such
      as config validation and, under `serve`, #175's checks that the worker user exists and
      that `fs.protected_hardlinks` is `1`
- [ ] 1.4 Tests: the Igor's own credential, the role this process serves, and every seat that
      serves the role each leave the loop running; a cure made while it runs is picked up by
      the probe without a restart; a config that fails validation still exits before the first
      cycle

## 2. Listing every open condition

- [ ] 2.1 One read of the conditions rebuilt from the execution log, shared by the cycle report, the listing and the
      budget line, so the three cannot disagree
- [ ] 2.2 An argument-free command (`igor conditions` unless review prefers otherwise) printing
      cure key, scope, count, cure and next probe time, one line per condition
- [ ] 2.3 One condition met by several Igors prints once
- [ ] 2.4 Nothing open prints as nothing open, distinctly from a record that could not be read
- [ ] 2.5 The command is read-only: no clear, no reset, no cooldown change
- [ ] 2.6 Tests: role-scoped listed without a role given, five Igors on one key, empty, record
      unreadable, and that reading twice changes nothing

## 3. The seat's line in `igor budget`

- [ ] 3.1 `renderBudget` prints a stopped seat once, on the seat's own line, naming the cure key
      and what clears it — the shape the unreadable-credential line already uses
- [ ] 3.2 Distinct from unreadable, from `condition-backoff`'s provider-refused line, and
      from no headroom or no unreset reading; a stopped seat with headroom shows both its headroom
      and its stop, against whichever reserve #143 decides `igor budget` reports. A seat
      whose only open condition is that Igor could not decrypt its file (#171) goes on the
      unreadable-credential line, naming the decryption failure and the condition (Adam,
      2026-10-17)
- [ ] 3.3 A role-scoped condition puts nothing in the report
- [ ] 3.4 Tests: each of the states above rendered side by side in one report, so the wordings
      are compared rather than asserted one at a time

## 4. Documentation

- [ ] 4.1 `docs/deployment.md`'s "Checking on it" gains the conditions listing beside `igor budget`

## 5. Closing out

- [ ] 5.1 File an issue for `on_condition_command`, carrying the evidence that would bring it
      back, and for any question the proposal still lists as open at archive; link the issues here
