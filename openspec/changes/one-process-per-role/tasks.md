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
- [ ] 2.5 At takeover, on the process's host, kill every process of each of the role's slot worker users, through #175's
  kill by worker user, before removing a tree or starting a worker.
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
  was sent 20 minutes ago; send no new write while one is in flight; otherwise send the next conditional write. A write that fails because the
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
  outbox, whatever its age; leave every other tree, `igor run`'s included, to the sweep at the
  abandoned-tree threshold.

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
- [ ] 6.6 Name trees `igor-tree-<role>-<slot>-<lock directory id>-<random>`, and `igor run`'s
  with no lock directory id; leave every tree not named for this
  process's role and lock directory to the age sweep.
- [ ] 6.7 Retry a state write the branch refuses because it moved, re-reading and re-applying
  the change.
- [ ] 6.8 For `igor serve` workers on the process's host, run slot 1 as #175's `igor-worker-<role>` and
  slot `k` of 2 and above as `igor-worker-<role>-<k>`: extend #175's user setup and sudoers rule
  to create and name each slot user, give each slot's tree and outbox its user's group, and give
  the unit every slot's group in `SupplementaryGroups` and every slot's home in `ReadWritePaths`.
- [ ] 6.9 Once #171 is on `main`, add to this change a `MODIFIED` *A role draws on the seat with
  the most headroom* that chooses among the seats the process's running workers do not hold.
- [ ] 6.10 Where `workers` is 2 or more, refuse a role at
  load where `igor-worker-<role>-<workers>` passes 32 characters, naming the role and the limit;
  keep #175's refusal to start where a role's worker user does not exist.
- [ ] 6.11 Test that a local worker meets *Every worker is kept apart and can be ended*: it
  cannot read the App's private key or a token the process holds, nor another slot's tree, and
  ending its run ends every process it started.
- [ ] 6.12 Once #175 is on `main`, add to this change `MODIFIED` copies of these #175
  requirements, each changed from the role's one worker user to every slot user:
  - *A kill, a release and a sweep reach what the worker owns* (its kill, release and startup
    sweep);
  - *Isolation is proved before any work is taken* (the start check);
  - *A failed worker spawn is a condition on its instance* and *A sudoers condition clears only
    on a passing check at a cycle's start* (the sudoers condition);
  - *The worker runs as a separate, unprivileged user*, whose isolation this change's *Every
    worker is kept apart and can be ended* extends, and which names the one worker user.

  Also rewrite this change's copy of *Igor forwards the termination it is sent* to start from
  #175's, keeping #175's kill of every process the worker user owns.

## 7. `igor run`

- [ ] 7.1 Confirm `igor run` neither reads nor writes the serving record, takes no serving lock,
  and runs one worker at a time whatever `workers`; it keeps #174's lock on its own files.

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
