## Decisions

The decisions below are settled for this change. The agents' decisions that settle what these
leave open are in `design.md`, *Agents' decisions*.

1. **`igor serve` never exits at runtime because of a condition**. A
   *condition* is `condition-backoff`'s ([#101](https://github.com/adamstallard/igor/pull/101))
   record of a fault that recurs, and it stops a *scope*: the Igor's GitHub App credential, its
   role, a seat, or, under [#175](https://github.com/adamstallard/igor/pull/175), the role's
   instance on one host. A *probe* is the one item #101 lets through after a cooldown, to see
   whether the fault recurs, or, for a seat's refused credential, the hourly seat probe #143 and
   #171 define. Whatever conditions are open, the process keeps polling. A stopped
   scope takes no new item, as #101 requires. What a role with no usable seat does, stop or hand
   the item back, is #171's *A role with no eligible seat stops only on conditions no read
   clears*, and this change adds nothing to it. Each
   condition clears as the change that defines it says, and the cycle report says what is
   stopped. *Rejected:* exiting when the open conditions leave the process no item it could take,
   for the reasons `stuck-conditions`' decision record gives under *An open condition never ends a
   running service*.
2. **Refusing to start on a bad setup stays, and a refusal exits with status 78**. A *refusal* is the failure of a check that a requirement says refuses a start,
   when that check runs as the process starts. Among them are a configuration that fails
   validation, the in-force checks in `lore-store`, `role-config` and `surface-adapter` on the
   Igor's own setup, #175's missing worker user or `fs.protected_hardlinks` not set to `1`,
   [#242](https://github.com/adamstallard/igor/pull/242)'s refusal to start beside a live
   process of the role, its write of a serving record when it takes over a role included, and, before the first model call,
   [#174](https://github.com/adamstallard/igor/pull/174)'s check that the pinned skills load.
   These check the setup; they are not conditions. A refusal logs its reason and exits 78, which
   is `EX_CONFIG` in `sysexits.h`. This change defines the number for every check that refuses a
   start; #242 states its own start checks' 78 by the same rule, and nothing else in `igor serve`
   exits 78. A start is not a refusal where another requirement has it fall back to
   a configuration that passed before. [#208](https://github.com/adamstallard/igor/pull/208)
   (`lore-pull`) does that: a process restarting
   after a lore commit that fails validation starts on the last commit that passed. So under
   #208 a failing lore commit refuses a start only where there is no passing commit to fall back
   to: a process that has never applied one, or one whose applied commit fails too. #175's and
   #174's checks refuse a start whether or not the process has applied a commit before.
   *Rejected:* a requirement that the shipped supervisors escalate a process that keeps refusing
   to start, for the reason the decision record gives.
3. **A seat's stop is reported where the seat is reported**: on a line of the
   seat's own in `igor budget`, told apart from every other state that keeps a seat unspent: a
   credential that could not be read, one the provider refused, no headroom, and the rest. A seat
   with two open conditions, a refused credential among them, shows as stopped, naming both.
4. **A seat Igor could not decrypt reads in `igor budget` as #171 shows it**, with the condition
   named, where that is the seat's only open condition and `igor budget`'s own decryption fails
   too. It reads as unreadable where `igor budget` could read the key file, and as not checked
   where it could not. #171 (`seat-files`) opens that condition.
5. **A role's stop is not in the budget report**. Every open condition is
   listed by `igor conditions`, which is given no role.
6. **A fix the process does not reread takes effect at the next restart**.
   A fix in the supervisor's environment for the process, such as the App's key path in the
   unit's environment file, is read only at start, so the operator who made it restarts the unit
   or recreates the container. A fix in the lore repository reaches the process only once a
   person has updated the server's lore checkout, since nothing in Igor updates it, and then
   waits for a restart where it is in the configuration, a role file or a seat file, which the
   process reads at start. Lore entries themselves are read for each item. Under #208 each process
   fetches the lore repository and applies what lands, and #208's delta replaces the lore
   clause about lore fixes in *An open condition never ends a running service* when #208 archives. This change
   archives before #208.
7. **A read-cleared condition is listed with the read that clears it.** #171 defines the kind in
   *A read-cleared condition opens on a failing read and clears on a passing one*. Its reads
   happen when the process reads its configuration, which it does at start, so a read-cleared
   seat condition clears at a restart while the configuration is read only at start. The listing names that read as what
   clears it, as decision 6's lore fixes do.
8. **The systemd unit restarts a crash, never a refusal or a clean exit**. It
   sets `Restart=on-failure` and lists 78, and only 78, in `RestartPreventExitStatus=`. A crash
   is restarted. A refusal is not, and the unit shows failed. A process that exits 0 stays down,
   and the unit shows inactive. Task 1.6 measured all three on systemd 252.
9. **Compose restarts every exit, and a refusal waits before it exits** (after task 1.8's
   measurement). The compose file keeps `restart: unless-stopped`. Under
   compose, a process that refuses to start logs its reason, then waits an interval that grows
   with each refusal in a row, then exits 78. Compose's restart loop on a refusal is therefore
   slow, and each attempt is in `docker compose logs`. A crash is restarted at once. *Rejected:*
   `restart: on-failure:3`, for the reason the decision record gives.
10. **No issue is filed in the destination for a stop**: the decision record's *Rejected* entry
    on [#77](https://github.com/adamstallard/igor/pull/77)'s proposal that an Igor file an issue
    for each stop.
11. **A configured command hook, `on_condition_command`, is deferred, not rejected**, until an Igor is found stopped long after the fact where the listing and the
    budget line existed and nobody read either (`design.md`, *Deferred: `on_condition_command`*).
12. **This change archives after `condition-backoff`, which gives `stuck-conditions` its base
    spec, and before #208**. Issue
    [#204](https://github.com/adamstallard/igor/issues/204) holds the order of every open change.
13. **A start check that fails because GitHub or the model provider did not answer, or because
    GitHub refused the App's credential, is not a refusal**. The process
    exits with status 1, which the shipped supervisors restart, so a passing outage or a key fixed
    in place is picked up at the next start. Exit 78 stays for a setup that only a person can fix
    and a restart never changes; why these exit 1 is in the decision record.
14. **A refusal under compose waits 30 seconds after the first refusal in a row, doubling with
    each further one, at most 30 minutes**. A start that passes every check
    that refuses a start resets the count of refusals in a row, and with it the wait. Tasks 1.3
    and 1.4 hold the numbers.
15. **The wait applies only where the compose file sets `IGOR_REFUSAL_WAIT=1`**. The systemd unit does not set it: systemd does not restart a refusal, so a wait
    there would only keep a refusing unit showing active instead of failed.
16. **The count of refusals in a row lives in the container's own filesystem, outside every
    volume**, for the reason the decision record gives. Task 1.9 measures that a restart by compose keeps it (`design.md`, *Open Questions*).

**Still open.** Each item names who answers it.

- **#175's sudoers start check after a crash, for #175.** The reasoning the decision record gives for
  status 78, that an exit 78 after a crash while a condition is open leaves the unit down for good, applies as well to
  #175's sudoers condition: #175's start check refuses with status 78 while the sudoers line is
  broken. Whether that check should exit 1 is for #175's authors, who own it.
- **#242's stand-down on a refused App credential, for #242.** Under #242 a process whose
  serving record cannot be written for 20 minutes stops its workers and exits 1, and a refused
  App credential makes every state write fail. This change treats that stop as #242's, not as an
  exit because of a condition (`design.md`, agents' decision A2). A process under #242 then restarts in a loop
  while GitHub refuses the credential, where `surface-adapter` and decision 1 keep a process
  running; whether #242 should keep a process whose credential is refused running instead is
  for #242's authors.
- **Copies of this change's requirements, for #208 and #216.** #208 modifies *An open condition
  never ends a running service*, and #216 modifies *Every open condition is readable without
  naming a role*. This change shortened both and added scenarios to each, that the later copy must
  keep, or `openspec archive` refuses it: *A process that cannot rewrite its serving record
  still stops* and *A fix in compose's environment waits for the container to be recreated* in
  the first, where #208's copy should also not say a compose `environment:` fix takes effect at
  any restart, and in the second *A refused App credential says a minted token
  clears it*, *A sudoers condition says a passing check clears it*, *A seat's refused
  credential shows what budget reporting shows* and *A condition that stops nothing says so*.
- **A scenario name in force, for #171.** `stuck-conditions`' *A stopped seat reads as stopped on
  its credential*, which #171's copy keeps by name, calls a seat whose only condition is its
  refused credential stopped; this change's *A refused credential alone is not a stop* shows that
  seat on the refused-credential line. The behaviour agrees; only #171's copy can rename the
  scenario, and renaming it there drops a scenario in force unless that copy says so.
- **Issue #80's body, for whoever next edits it.** It still shows `on-failure:3` as this
  change's open recommendation.

## Why

`condition-backoff` stops a scope after the same cure key recurs, and says in its own Impact
what it does not do: *"A stopped scope is visible only where somebody looks at the decision
record."*

At a terminal that is fine: somebody typed `igor run` and is reading the output. Unattended it is
not. An Igor stopped on a condition stays up, takes nothing, and looks like a healthy Igor with an
empty queue to anyone who does not read the record.

An exit would not help: the restarted process reads the same open conditions, so it exits again
or idles exactly as before. The process that stays up is the one that can notice a cure. So
this change leaves the process running and makes the stop readable where each reader looks.

## What Changes

**`igor serve` keeps running on every condition.** It polls, takes no new item in a stopped
scope, lets each condition clear as `condition-backoff` clears it, and states what is stopped in
its cycle report. The checks that refuse a bad setup at start stay, and a refusal exits 78.

**A seat's stop is reported where the seat is reported.** `igor budget` already prints a line of
the seat's own for a credential it could not read, and `condition-backoff` specifies one for a
credential the provider refused. A seat a condition has stopped is a third answer to the same
question, whether this seat can be spent from, and belongs beside them. A seat Igor could not
decrypt reads as #171 shows it: unreadable, or not checked where the command cannot read the key
file.

**A role's stop is not a fact about a seat, and does not go in a budget report.** Its reader is
asking *is anything stuck*, which no budget report answers. The requirement pins the reader and
the content: every open condition, listed by a command that needs no argument and is given no role,
saying what would cure it and when the probe is due.

**The shipped supervisors restart a crash and leave a refusal visible.** The systemd unit leaves
a refusal down and failed. Compose retries it slowly, with each attempt in its log.

## Capabilities

### Modified Capabilities

This change uses terms that changes archiving before it define: #171's read-cleared kind, seat
files, lent seats, `seat:<id>:decrypt` and `seat:<id>:file`; #143's reserve line, holding back at it and an
unreset reading; #175's instance; and #242's serving record and `role-process`. It has no `Builds on:` line for
them, since it only cites them, and task 0.4 orders the building; until those changes archive, `openspec/specs/` lacks the
terms, and every one of those changes archives before this one.

This change's two deltas, listed below, only add requirements, to capabilities already in force.
`stuck-conditions` is in force from `condition-backoff` (#101), which archived first. This change
modifies none of #101's requirements.

- `stuck-conditions`: `igor serve` keeps running whatever conditions are open, a process that
  refuses to start exits with status 78, the shipped systemd unit and compose file restart what a
  restart can cure, and every open condition is readable without naming a role.
- `seat-budget`: a seat a condition has stopped reads as stopped, distinctly from a seat whose
  credential could not be read, one whose credential the provider refused, and one with no
  headroom.

## Impact

- A stopped Igor stays up, and recovers by itself once a cure it rereads while running lands.
  Other cures need a restart, as decision 6 says. Under systemd a process that refuses to start
  stays down, and its unit reads as failed. Under compose it is retried at a growing interval.
  A person learns of a stop from the cycle report, `igor budget` or the conditions listing.
- A stop requires somebody to look. Nothing here pushes, deliberately; the hook that would is
  deferred above with the evidence that would bring it back.
- Implementation lands in `src/serve.ts`, `src/cli.ts`, `src/budget.ts`, `deploy/igor.service`
  and `deploy/docker-compose.yml`, and `docs/deployment.md` says how to read a stop, a failed
  unit and a refusal under compose. It is built after `condition-backoff`, which produces the
  conditions every requirement here reads. The budget line is also built after #143's reserve
  line and #171's undecryptable-seat line and read-cleared condition (task 0.4).
