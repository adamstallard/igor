Every task here is gate two: it is built and pushed on this branch once the specification is
approved.

## 1. Role configuration

- [ ] 1.1 Read `workers` in role files and bases: a whole number of at least 1, default 1, most
  specific level wins; refuse any other value, naming it. Report it, with its level, in
  `igor role explain`.

## 2. Serving record and lock

- [ ] 2.1 Add a module for the role's lock: a lock directory beside the lore checkout, holding a
  random id written once and a lock per role that the operating system releases when its holder
  ends (an exclusive `flock`, or a listening Unix socket a live holder answers on).
- [ ] 2.2 Write the serving record at `serving/<role>.json` on the state branch: start id,
  counter, host name, process id, lock directory id. Every write is
  conditional on the file's `sha`; a serving write finding the file absent creates it,
  conditional on its absence.
- [ ] 2.3 Measure the record's age on the larger of elapsed monotonic and elapsed wall-clock
  time, and test it across a suspend on the target hosts.
- [ ] 2.4 Keep the lock directory on storage that outlives a restart: beside the lore clone on a
  host, and on the bind-mounted volume under Compose. Measure that the lock is exclusive on each
  shipped deployment (local disk, a bind mount, Docker Desktop file sharing); where it is not,
  `docs/deployment.md` says that deployment cannot run `igor serve`.
- [ ] 2.5 Record each running worker's process group in the lock directory, and at takeover kill
  any recorded group still alive before removing its tree.
- [ ] 2.6 Measure how the Contents API answers a write refused because the branch moved and one
  refused because the file's `sha` changed, and retry only the first for files other than the
  serving record.

## 3. Startup guard and takeover

- [ ] 3.1 Before the first cycle: take the lock or exit 78; read the record; take over at once
  where it names this lock directory; otherwise watch for 30 minutes, reading every 5, exiting 78
  when a write lands and 1 when the record disappears.
- [ ] 3.2 Take over with one write conditional on the record read at start; exit 78
  where it fails because the record changed, and exit 1 where the record cannot be read or the
  write gets no answer.
- [ ] 3.3 Log a refusal in this form, which may be reworded but must name both processes:

  ```text
  refusing to start: another process serves <role> (host <host>, pid <pid>, start id <id>); stop it, or wait for its record to stop changing
  ```

## 4. Serving

- [ ] 4.1 Run the record timer every 5 minutes, independent of the poll interval, the cycle and
  the workers: stand down (stop every worker, post nothing, exit 1) once the last landed write
  is 20 minutes old; otherwise send the next conditional write. A write that fails because the
  record names another start id stops every worker and exits 1.
- [ ] 4.2 Check the same age before every claim, publication or post, and stand down instead
  where it is 20 minutes.
- [ ] 4.3 Define the 5-minute write period, the 20-minute stand-down and the 30-minute watch as
  constants in one place, read by no configuration, and refuse a role-file key for any of them.

## 5. Adoption

- [ ] 5.1 After taking over and before new claims, list every open item carrying the role's
  label that the Igor's own bot account added, whatever the watermark.
- [ ] 5.2 For each: a stop said since the Igor's latest claim message there removes the label
  and posts a stop receipt; an item with the Igor's open pull request is caught up and its claim
  given back, keeping a person's label; any other is triaged again, then worked under a fresh
  claim message or given back out loud.
- [ ] 5.3 Remove every tree named for the role and this process's lock directory, with its
  outbox, whatever its age.

## 6. Workers

- [ ] 6.1 Replace the cycle's sequential item loops with dispatch to worker slots `1..workers`:
  claim and start each item in the cycle's order while a slot and a seat are free, without
  awaiting the worker; hold the watermark below items left unclaimed.
- [ ] 6.2 Keep the in-flight set; pass its items over before triage, and leave a stop on one to
  its run (no idle-stop receipt from the cycle).
- [ ] 6.3 Make the budget gate choose, per item, the first seat in order with headroom and no
  running worker of the process.
- [ ] 6.4 Count surface failures in the order runs end, each toward the cycle running when it
  ends, or the next; two in a row stop that cycle, as `work-claiming` has it.
- [ ] 6.5 On SIGTERM, claim nothing more, leave every running worker to complete or hand off,
  and exit after the last ends.
- [ ] 6.6 Name trees `igor-tree-<role>-<slot>-<lock directory id>-<random>`; keep the age
  sweep for trees no slot names.
- [ ] 6.7 Retry a state write the branch refuses because it moved, re-reading and re-applying
  the change.
- [ ] 6.8 Run slot `k` of role `r` as `igor-worker-<r>-<k>` once #175's worker users exist,
  through whatever per-slot mechanism #175 settles.

## 7. `igor run`

- [ ] 7.1 Confirm `igor run` neither reads nor writes the serving record and takes no lock.

## 8. Docs

- [ ] 8.1 `docs/architecture.md`: rewrite each passage that assumes several processes per role:
  - §1: the Discord bullet *"One role may run as several interchangeable processes"*, and
    *"any process of the role, or a restarted one, carries on"*;
  - §2.1: the paragraph on `concurrent-instances`, and the bullet *"Processes of an Igor are
    interchangeable"*;
  - §5.0.2: *"sooner where several processes share one"* App installation;
  - §6.3.4: the overshoot of *"one run per process"*, now one run per seat;
  - §6.7.1: *"every process of a role can share its App"*;
  - §6.7.2: the age-only sweep, now slot trees at takeover and age for the rest;
  - §6.9: *"instances of a role are interchangeable"*;
  - §8, item 3: *"per-role instance counts"*.
- [ ] 8.2 `docs/deployment.md`: replace *"Processes of one role share its App."*; describe
  `workers`, the startup watch and its wait, the lock directory, and exits 78 and 1. Add,
  rewordable:

  ```text
  Do not point `igor run` at a role a process serves: the two claim with the same label and cannot tell their claims apart.
  ```

## 9. Tests

- [ ] 9.1 Tag each test with the scenario it checks, under spec-trace.
- [ ] 9.2 Keep TLC's configurations passing in CI, and every negative configuration violating.
