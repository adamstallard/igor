## 0. Sequencing

- [ ] 0.1 `condition-backoff` implemented far enough that conditions are rebuilt from the
      execution log, keyed by cure key, with scope, count and next-probe time — every task below
      reads them
- [ ] 0.2 Land after `condition-backoff` archives, so `stuck-conditions` has a base spec rather
      than two open changes writing the whole of one capability
- [ ] 0.3 This change goes ahead before #176. Until Igor pulling its lore checkout is built, a fix
      in the lore repository takes effect at the next restart, as the requirement says. The change
      that builds pulling removes that clause, and #176's body lists removing that
      wording

## 1. Running on through every condition

- [ ] 1.1 Nothing in `igor serve`'s loop ends the process because a condition is open, whatever
      its scope: the Igor's own credential, its role, or every seat its role could spend from
      (Adam, 2026-10-18). The loop goes on polling, a stopped scope takes no new item, and each
      condition clears as `condition-backoff` clears it
- [ ] 1.2 Each cycle's report names every stopped scope with its cure key and what would cure it
- [ ] 1.3 Every check a requirement says refuses a start logs which check failed and exits with
      status 78, whenever it runs: config validation and #175's checks, which `igor serve` alone
      makes, that the worker user exists and that `fs.protected_hardlinks` is `1`, all before the
      first cycle; and #174's check, before the first model call, that the pinned skills load. Besides a refusal, only a stop another requirement names, such as
      #179's rank whose rank another process took, exits with 78
- [ ] 1.4 Tests: the Igor's own credential, the role this process serves, and every seat that
      serves the role each leave the loop running; a cure made while it runs is picked up by
      the probe without a restart; a read-cleared condition clears on a passing read with no
      probe; a config that fails validation exits with status 78 before the first cycle; an
      uncaught error exits with a status other than 78
- [ ] 1.5 `deploy/igor.service` gains `RestartPreventExitStatus=78`, with this comment, which may
      be reworded:

      ```text
      # A process that refuses to start exits 78 (EX_CONFIG): fix what the journal names, then start it again.
      ```

      #179 adds its status 79 to the same line, and `SuccessExitStatus=79`; #175 carries the
      same lines in its unit tasks. Of this change, #175 and #179, each one built after another
      keeps every line the earlier ones added: the statuses, `SuccessExitStatus=79` and the
      comment
- [ ] 1.6 Measure on a Linux host, with the shipped unit: a process that exits 78 is not
      restarted and the unit shows `failed`, and one that exits 1 is restarted. Record the result
      in `design.md`

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
      and its stop, against the seat's reserve line as #143's `igor budget` reports it: per role where a role reserves more. A seat
      whose only open condition is that Igor could not decrypt its file (#171) goes on the
      unreadable-credential line, naming the decryption failure and the condition (Adam,
      2026-10-17)
- [ ] 3.3 A role-scoped condition puts nothing in the report
- [ ] 3.4 Tests: each of the states above rendered side by side in one report, so the wordings
      are compared rather than asserted one at a time

## 4. Documentation

- [ ] 4.1 `docs/deployment.md`'s "Checking on it" gains the conditions listing beside `igor budget`
- [ ] 4.2 `docs/deployment.md` says that a unit shown failed refused to start, that `journalctl -u
      igor@<instance>` gives the reason, and that a change to the unit's environment file, or
      to the lore repository until Igor pulling its lore checkout is built, takes effect when the operator restarts the
      unit

## 5. Closing out

- [ ] 5.1 File an issue for `on_condition_command`, carrying the evidence that would bring it
      back, and for any question the proposal still lists as open at archive; link the issues here
