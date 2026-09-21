## 0. Sequencing

- [ ] 0.1 `condition-backoff` implemented far enough that the condition record exists, is keyed
      by cure key, and carries scope, count and next-probe time — every task below reads it
- [ ] 0.2 Land after `condition-backoff` archives, so `stuck-conditions` has a base spec rather
      than two open changes writing the whole of one capability

## 1. Exiting on an Igor-scoped condition

- [ ] 1.1 `serve` reports an open Igor-scoped condition to its caller rather than ending the
      process itself, so the loop stays testable without a process exit
- [ ] 1.2 `igor serve` sets a non-zero exit status from it, after printing the cure key, the
      cure, and that it is exiting for that reason
- [ ] 1.3 A role- or seat-scoped condition leaves the status alone and the loop running
- [ ] 1.4 Tests: Igor-scoped exits non-zero; role-scoped does not; seat-scoped does not; an
      exhausted budget does not; a signalled shutdown with nothing open still exits zero

## 2. The probe survives the restart the exit causes

- [ ] 2.1 The startup path reads the open condition before deciding anything: cooldown passed
      means take the probe, cooldown not passed means exit non-zero without claiming
- [ ] 2.2 The pre-probe exit states when the probe is due
- [ ] 2.3 A probe that does not meet the condition closes it and the service goes on serving
- [ ] 2.4 Exit writes nothing to the condition — same count, same cooldown, read by the next
      process
- [ ] 2.5 Tests: start inside the cooldown, start after it, probe clears, probe recurs and the
      cooldown lengthens, two consecutive restarts do not consume two probes

## 3. Listing every open condition

- [ ] 3.1 A read of the condition record shared by the exit path, the listing and the budget
      line, so the three cannot disagree
- [ ] 3.2 An argument-free command (`igor conditions` unless review prefers otherwise) printing
      cure key, scope, count, cure and next probe time, one line per condition
- [ ] 3.3 One condition met by several Igors prints once
- [ ] 3.4 Nothing open prints as nothing open, distinctly from a record that could not be read
- [ ] 3.5 The command is read-only: no clear, no reset, no cooldown change
- [ ] 3.6 Tests: role-scoped listed without a role given, five Igors on one key, empty, record
      unreadable, and that reading twice changes nothing

## 4. The seat's line in `igor budget`

- [ ] 4.1 `renderBudget` prints a stopped seat once, on the seat's own line, naming the cure key
      and what clears it — the shape the unreadable-credential line already uses
- [ ] 4.2 Distinct from unreadable, from the provider-refused line `credential-breaker` adds, and
      from no headroom or no capacity figure; a stopped seat with headroom shows both
- [ ] 4.3 A role-scoped condition puts nothing in the report
- [ ] 4.4 Tests: each of the states above rendered side by side in one report, so the wordings
      are compared rather than asserted one at a time

## 5. Documentation

- [ ] 5.1 `docs/deployment.md`: what an Igor-scoped exit assumes of a supervisor, which shapes
      escalate (Kubernetes) and which do not (the shipped systemd unit, `docker compose`, a bare
      `while true`), and what an operator adds where theirs does not
- [ ] 5.2 `deploy/igor.service`: escalate a repeatedly failing Igor or say in the file what to
      add, and a `RestartSec` no shorter than the role's poll interval — confirm systemd's
      `StartLimitIntervalSec`/`StartLimitBurst` defaults against `systemd.service(5)` first and
      record what they actually are in this change's `design.md`
- [ ] 5.3 `deploy/docker-compose.yml`: the same statement for the shape it is
- [ ] 5.4 "Checking on it" gains the conditions listing beside `igor budget`

## 6. Closing out

- [ ] 6.1 File an issue for whichever of the two deferred questions is still open at archive —
      the derivation of the exit (scope or effect) and `on_condition_command` — each carrying the
      evidence that would settle it, and link the issue here
