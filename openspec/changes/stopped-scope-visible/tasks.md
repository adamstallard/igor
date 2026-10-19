## 0. Sequencing

- [ ] 0.1 `condition-backoff` implemented far enough that conditions are rebuilt from the
      execution log, keyed by cure key, with scope, count and next-probe time — every task below
      reads them
- [ ] 0.2 Archive after `condition-backoff` archives, so `stuck-conditions` has a base spec rather
      than two open changes writing the whole of one capability
- [ ] 0.3 Archive before #208 (`lore-pull`), as issue #204 orders. #208's `stuck-conditions`
      delta removes the requirement's lore clause when #208 archives. If this change is still
      open when #208 is built, #208's task 6.1 also rewrites this task, decision 6 and the
      matching passage in `design.md`
- [ ] 0.4 The budget lines wait for what they read: #143's reserve line and holding-back state,
      and #171's undecryptable-seat line and read-cleared condition. Build section 3 after both
      are built

## 1. Running on through every condition

- [ ] 1.1 Nothing in `igor serve`'s loop ends the process because a condition is open, whatever
      its scope: the Igor's own credential, its role, or every seat its role could spend from
      (Adam, 2026-10-18). The loop goes on polling, a stopped scope takes no new item, and each
      condition clears as `condition-backoff` clears it. What a role with no usable seat does,
      stopping or handing the item back to a person, is #171's to build
- [ ] 1.2 Each cycle's report names every stopped scope with its cure key and what would cure it
- [ ] 1.3 In `igor serve`, every check a requirement says refuses a start logs which check
      failed and exits with status 78, when it runs as the process starts. Before the first
      cycle: config validation, `lore-store`'s checks on where the store and the
      configuration sit, the App's variables in `role-config`, `surface-adapter`'s checks that
      the Igor can act as its App where they fail on the Igor's own setup, such as a missing key
      or a repository the installation does not reach, and #175's start checks. Before the first model call: #174's
      check that the pinned skills load. A check that fails because GitHub or the model
      provider did not answer, or GitHub refused the App's credential, exits 1 instead. The same check failing on a later reread is not a
      refusal. Nothing but a refusal exits with 78. Under `IGOR_REFUSAL_WAIT=1`, a refusal logs
      its reason, then waits 30 seconds after the first refusal in a row, doubling with each
      further one, at most 30 minutes, then exits 78. The count lives in a file in the
      container's own filesystem, outside every volume, and a start that passes every check
      that refuses a start removes it. A stop signal ends the wait. The numbers are the
      proposal's recommendation, still open for Adam
- [ ] 1.4 Tests: the Igor's own credential, the role this process serves, and every seat that
      serves the role each leave the loop running; a cure made while it runs is picked up by
      the probe without a restart; a read-cleared condition clears on a passing read with no
      probe; a config that fails validation exits with status 78 before the first cycle; a start
      check GitHub does not answer exits 1; an uncaught error exits with a status other than 78; with `IGOR_REFUSAL_WAIT=1` set, refusals
      in a row wait 30 s, 60 s, 120 s and so on up to 30 minutes, a passing start resets the
      count, a stop signal ends the wait at once, and a crash does not wait; without it, a
      refusal exits at once
- [ ] 1.5 In `deploy/igor.service`, `Restart=always` becomes `Restart=on-failure`, and the unit
      gains `RestartPreventExitStatus=78`, with this comment above the two, which may be reworded:

      ```text
      # A crash is restarted; a clean exit (status 0) is not. A process that refuses to start
      # exits 78 (EX_CONFIG) and is not restarted: fix what the journal names, then start it again.
      ```

      The unit lists no other status there and sets no `SuccessExitStatus=`, since a clean exit
      is not restarted under `Restart=on-failure`. #175 carries the
      same lines in its unit tasks; of this change and #175, the one built second keeps the
      lines the first added
- [x] 1.6 Measure under systemd, with the unit settings of task 1.5: a process that exits 78 is
      not restarted and the unit shows `failed`; one that exits 0 is not restarted and the unit
      shows inactive; one that exits 1 is restarted. Measured 2026-10-18 on systemd 252 in a
      `debian:bookworm` container, and it confirms all three: `design.md`, *The systemd unit*, **Measured (task 1.6)**
- [ ] 1.7 `deploy/docker-compose.yml` keeps `restart: unless-stopped` and gains
      `IGOR_REFUSAL_WAIT: "1"` under `environment:`, with this comment above the two, which may be
      reworded:

      ```text
      # Compose restarts every exit. A crash is restarted at once. A process that refuses to
      # start (status 78, EX_CONFIG) first waits, longer after each refusal in a row, so a bad
      # setup retries slowly: fix what `docker compose logs` names. To retire a rank, remove
      # its service here and run `docker compose up -d --remove-orphans`.
      ```

      The wait itself is task 1.3's
- [x] 1.8 Measure compose's `restart: on-failure:3`. Measured 2026-10-18 on Docker Engine
      29.6.2: a refusal is retried three times and then left down, with every attempt in
      `docker compose logs`, and a clean exit is not restarted; Docker's documented rule that a restart
      policy takes effect only after 10 seconds of running does not stop a quick refusal from
      being retried; the count of three never resets while the container
      exists, which is why compose keeps `unless-stopped` with a waiting refusal (decision 9);
      and a running container comes back after its daemon restarts. `design.md`, *Compose*, **Measured (task 1.8)**

## 2. Listing every open condition

- [ ] 2.1 One read of the conditions rebuilt from the execution log, shared by the cycle report, the listing and the
      budget line, so the three cannot disagree
- [ ] 2.2 An argument-free command (`igor conditions` unless review prefers otherwise) printing
      cure key, scope, count, cure and next probe time, one line per condition; a condition with no
      count or no probe says what clears it instead
- [ ] 2.3 One condition met by several Igors prints once
- [ ] 2.4 Nothing open prints as nothing open, distinctly from an execution log that could not be read
- [ ] 2.5 The command is read-only: no clear, no reset, no cooldown change
- [ ] 2.6 Tests: role-scoped listed without a role given, five Igors on one key, empty, execution
      log unreadable, a read-cleared condition, and that reading twice changes nothing

## 3. The seat's line in `igor budget`

- [ ] 3.1 `renderBudget` prints a stopped seat once, on the seat's own line, naming the cure key
      and what clears it — the shape the unreadable-credential line already uses
- [ ] 3.2 Distinct from unreadable, from `condition-backoff`'s provider-refused line, and
      from no headroom or no unreset reading; a stopped seat with headroom shows both its headroom
      and its stop, against the seat's reserve line as #143's `igor budget` reports it: per role where a role reserves more. A seat
      whose only open condition is that Igor could not decrypt its file (#171) goes on the
      unreadable-credential line, or, where the command cannot read the key file that decrypts
      seat files (#171's `seatKey`), as not checked; either line names the decryption failure and the condition (Adam, 2026-10-17)
- [ ] 3.3 A condition on a role or on the Igor's own App credential puts nothing in the report
- [ ] 3.4 Tests: each of the states above rendered side by side in one report, so the wordings
      are compared rather than asserted one at a time

## 4. Documentation

- [ ] 4.1 `docs/deployment.md`'s "Checking on it" gains the conditions listing beside `igor budget`
- [ ] 4.2 `docs/deployment.md` says that a unit shown failed refused to start, that `journalctl -u
      igor@<instance>` gives the reason, and that a change to the unit's environment file
      takes effect when the operator restarts the unit. It says that a change merged to the lore
      repository reaches the server once a person pulls it into the server's lore checkout, and
      a file read only at start then needs a restart. Under compose it says that a container restarting at a growing interval is refusing
      to start, and that `docker compose logs` gives the reason. It says how to retire a rank, one of the
      numbered processes #179 runs for a role, under compose, with this text, which may be
      reworded (decision 14):

      ```markdown
      A role runs as one or more numbered processes, its ranks, and the roster in
      `igor.config.yaml` lists them. To retire a rank under compose, remove it from the roster,
      remove its service from `deploy/docker-compose.yml` and
      run `docker compose up -d --remove-orphans`. Compose restarts every exit, so a retired
      rank whose service is still in the file starts again and refuses, because the roster no
      longer declares it, and then refuses again every 30 minutes for as long as the service
      stays. Under systemd nothing more is needed: a retired rank exits 0, and the unit
      leaves it down.
      ```

## 5. Closing out

- [ ] 5.1 File an issue for `on_condition_command`, carrying the evidence that would bring it
      back, and for any question the proposal still lists as open at archive; link the issues here
