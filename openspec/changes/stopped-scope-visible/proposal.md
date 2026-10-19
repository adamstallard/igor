## Decisions

Decisions 1, 2, 4, 6, 7, 8, 9 and 12 are Adam's, each dated. Decisions 3, 5, 10, 11 and 13 are
this change's proposals, for Adam's review.

1. **`igor serve` never exits at runtime because of a condition** (Adam, 2026-10-18). A
   *condition* is `condition-backoff`'s ([#101](https://github.com/adamstallard/igor/pull/101))
   record of a fault that recurs, and it stops a *scope*: the Igor's GitHub App credential, its
   role, or a seat. A *probe* is the one item #101 lets through after a cooldown, to see whether
   the fault recurs. Whatever conditions are open, the process keeps polling. A stopped scope
   takes no new item, as #101 requires. Where a role has no usable seat,
   [#171](https://github.com/adamstallard/igor/pull/171) has the process give each item back to
   a person with a comment naming the condition; that is #171's requirement, and this change
   adds nothing to it. Each condition clears as the change that defines it says, and the cycle
   report says what is stopped. *Rejected:* exiting when the open conditions leave the process
   no item it could take. An exited process comes back only through a supervisor's restart or a
   person, and a restart reads the same conditions from the same state branch. A process that
   stays up picks up a fix to a setting it rereads at its next probe or read.
2. **Refusing to start on a bad setup stays, and a refusal exits with status 78** (Adam,
   2026-10-18). A *refusal* is the failure of a check that a requirement says refuses a start,
   when that check runs as the process starts: a configuration that fails validation; under
   [#175](https://github.com/adamstallard/igor/pull/175), a missing worker user or
   `fs.protected_hardlinks` not set to `1`; and, before the first model call,
   [#174](https://github.com/adamstallard/igor/pull/174)'s check that the pinned skills load.
   These check the setup; they are not conditions. A refusal logs its reason and exits 78, which
   is `EX_CONFIG` in `sysexits.h`. This change defines the number, other changes cite it, and
   nothing else exits 78. A start is not a refusal where another requirement has it fall back to
   a configuration that passed before. [#208](https://github.com/adamstallard/igor/pull/208)
   (`lore-pull`) does that, by its decision Adam accepted on 2026-10-18: a process restarting
   after a lore commit that fails validation starts on the last commit that passed. So a failing
   lore commit refuses a start only for a process that has never applied a commit. #175's and
   #174's checks refuse a start whether or not the process has applied a commit before. *Rejected:* a requirement that the shipped supervisors
   escalate a process that keeps refusing to start. A failed unit is what `systemctl status` and
   every systemd monitor already show.
3. **A seat's stop is reported where the seat is reported** (proposed): on a line of the seat's
   own in `igor budget`, told apart from every other state that keeps a seat unspent, as *A seat a
   condition has stopped reads as stopped* lists them: a credential that could not be read, one
   the provider refused, no headroom, and the rest. A seat with two open conditions, a refused credential among them,
   shows as stopped, naming both.
4. **A seat Igor could not decrypt reads as an unreadable credential in `igor budget`** (Adam,
   2026-10-17), with the decryption failure as the reason and the condition named, where that is
   the seat's only open condition. Where the person running `igor budget` cannot read the key
   file that decrypts seat files, #171 shows the seat as not checked, and that line names the condition. #171 (`seat-files`) opens that condition.
5. **A role's stop is not in the budget report** (proposed). Every open condition is listed by a
   command that takes no argument and names no role. `design.md` argues for naming it
   `igor conditions`.
6. **A fix the process does not reread takes effect at the next restart** (Adam, 2026-10-18).
   A fix in the supervisor's environment for the process, such as the App's key path in the
   unit's environment file, is read only at start, so the operator who made it restarts the unit
   or the container. A fix in the lore repository reaches the process only once a person has updated
   the server's lore checkout, since nothing in Igor updates it. A fix to a file the process
   reads only at start then waits for a restart. One to a file the process rereads at each
   cycle, such as `igor.config.yaml` under
   [#179](https://github.com/adamstallard/igor/pull/179), which archives before this change,
   applies at the next cycle.
   Under #208 each process fetches the lore repository and applies what lands, and #208's delta
   removes the lore sentence from *An open condition never ends a running service* when #208
   archives. This change archives before
   #208.
7. **A read-cleared condition clears on a passing read** (Adam, 2026-10-18). Besides a probe and,
   for a refused App credential, a token minted again, a condition can clear on a later read
   that passes. That is the kind #171 defines in its requirement *A read-cleared condition opens
   on a failing read and clears on a passing one*: a seat file Igor could not decrypt is one; a
   configuration a running process reread and refused (#179) is another.
8. **The systemd unit restarts a crash, never a refusal or a clean exit** (Adam, 2026-10-18). It
   sets `Restart=on-failure` and lists 78, and only 78, in `RestartPreventExitStatus=`. A crash
   is restarted. A refusal is not, and the unit shows failed. A process that exits 0 stays down,
   and the unit shows inactive. Task 1.6 measured all three on systemd 252. Under #179 a role
   runs as several processes, each with a number called its *rank*, and `igor.config.yaml`'s
   *roster* lists the ranks it runs. With this change's exit rules, a rank removed from the roster
   exits 0. *Rejected:* a status 79 for a retired rank, listed in `RestartPreventExitStatus=`
   and `SuccessExitStatus=`, which `Restart=on-failure` makes unnecessary.
9. **Compose restarts every exit, and a refusal waits before it exits** (Adam, 2026-10-18, after
   task 1.8's measurement that day). The compose file keeps `restart: unless-stopped`. Under
   compose, a process that refuses to start logs its reason, then waits an interval that grows
   with each refusal in a row, then exits 78. Compose's restart loop on a refusal is therefore
   slow, and each attempt is in `docker compose logs`. A crash is restarted at once. *Rejected:*
   `restart: on-failure:3`. Task 1.8 measured that its count of three never resets while the
   container exists, so a container that had run for weeks would stay down after its fourth
   crash.
10. **No issue is filed in the destination for a stop** (proposed). *Rejected:*
    [#77](https://github.com/adamstallard/igor/pull/77)'s Igor-authored issue, as *Rejected: an
    issue in the destination* below argues.
11. **A configured command hook, `on_condition_command`, is deferred, not rejected** (proposed),
    until an Igor is found stopped long after the fact where the listing and the budget line
    existed and nobody read either (*Deferred, not rejected*, below).
12. **This change archives after `condition-backoff`, which gives `stuck-conditions` its base
    spec, and before #208** (Adam, 2026-10-18). Issue
    [#204](https://github.com/adamstallard/igor/issues/204) holds the order of every open change.
13. **A start check that fails because GitHub or the model provider did not answer, or because
    GitHub refused the App's credential, is not a refusal** (proposed). The process exits with
    status 1, which the shipped supervisors restart, so a passing outage or a key fixed in place
    is picked up at the next start. Exiting 78 there would leave the unit failed until a person
    acted. A crash while the App's credential condition is open restarts the process, its start
    check then finds the credential refused, and an exit 78 there would leave the unit down for
    good: the permanent stop decision 1 rejects.

**Still open.** The requirements are written to each recommendation, and the tasks and the
comment task 1.7 adds to the compose file carry each recommendation, so an answer that differs
changes the requirement or task named. Each item says who answers it.

- **The listing's command name.** `design.md` proposes `igor conditions`; review may prefer
  another. The requirement fixes the behaviour, not the name.
- **The refusal wait's numbers, for Adam.** *Recommendation:* 30 seconds after the first
  refusal, doubling with each refusal in a row, at most 30 minutes. A start that passes every
  check resets it. Decision 9 fixes only that the wait grows; tasks 1.3 and 1.4 hold these
  numbers.
- **The wait applies under compose only, for Adam to confirm.** systemd does not restart a
  refusal, so a wait there would only keep a refusing unit showing active, not failed.
  *Recommendation:* compose only, as *A process that refuses to start exits with status 78*
  says. The compose file sets `IGOR_REFUSAL_WAIT=1`, and the unit does not.
- **The wait counts refusals per container, for Adam.** *Recommendation:* the count lives in a
  file in the container's own filesystem, outside every volume, so a restart by compose keeps it
  and no two containers share it; `design.md`, *Compose*, gives the reason.
- **A retired rank under compose, for Adam.** A rank #179 retires exits 0, and under
  `unless-stopped` compose starts it again. #179 has a retired rank refuse that new start with
  78, so its container would cycle through refusals, at the longest wait, for as long as its
  service stays in the compose file. *Recommendation:* the deployment guide and the compose
  file's comment say that retiring a rank under compose means removing its service from the
  compose file and running `docker compose up -d --remove-orphans` (tasks 1.7 and 4.2). An
  operator who forgets sees the slow loop of refusals, each naming the ranks the roster
  declares.
- **#179's exit statuses, for #179.** #179's branch has a retired rank exit 79, with 79 in the
  unit's `RestartPreventExitStatus=` and `SuccessExitStatus=`, and has a process that finds a
  second process at its own rank stop for good with 78 while running. Both contradict this
  change: the unit lists only 78, and only a refusal exits 78. Under compose, which restarts
  every exit, a process stopped for good would be started again. *Recommendation:* #179 has a
  retired rank and a stopped duplicate exit 0, which `Restart=on-failure` leaves down, and
  decides what its duplicate does when compose starts it again.
- **Changes citing this change's status-78 requirement archive before this change, for Adam.**
  #175, #174 and #179 cite *A process that refuses to start exits with status 78* and come
  before this change in #204's order. Moving this change ahead of them is not possible: it in
  turn cites requirements of #143, #171 and #179. *Recommendation:* keep the order. Between those archives and this one the specs name a
  requirement they do not yet hold, which the run of archives in #204's order closes.
- **#174's check on a model call that fails, for #174.** #174 refuses a start when no
  `system/init` event arrives, the model run's first event, which lists the skills that loaded, whenever its check runs. Decision 13 makes a provider that did
  not answer exit 1, not 78. *Recommendation:* #174 refuses only where the model answered and
  the skills did not load.
- **#101's wording of a refused credential, for #101.** #101's scenario *A stopped seat reads as
  stopped on its credential* calls the refused-credential line a stopped seat, while this change
  shows such a seat on that line and not as stopped. *Recommendation:* #101 renames its
  scenario; nothing here changes.

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
decrypt goes on the unreadable-credential line, because #171 treats it as a credential this
machine could not read.

**A role's stop is not a fact about a seat, and does not go in a budget report.** Its reader is
asking *is anything stuck*, which no budget report answers. The requirement pins the reader and
the content: every open condition, listed by a command that needs no argument and names no role,
saying what would cure it and when the probe is due.

**The shipped supervisors restart a crash and leave a refusal visible.** The systemd unit leaves
a refusal down and failed. Compose retries it slowly, with each attempt in its log.

### Rejected: an issue in the destination

[#77](https://github.com/adamstallard/igor/pull/77), now closed. It pushes, which is its real
advantage over everything here. It was rejected because it costs a new concept, an Igor authoring
issues, with `universalSkip` taught about issues an Igor wrote and `issues: write` on the template,
and stopped conditions would be the only thing using it.
[#79](https://github.com/adamstallard/igor/issues/79) answers #77's other use separately: a lore
proposal reported only to a log nobody opens. An operations alert would also land in a work tracker whose readers are reviewers,
which is the wrong audience for it.

### Deferred, not rejected: a configured command hook

An `on_condition_command`, the same shape as a seat's `token_command`: the operator wires it to
whatever they page on. It is the push option that assumes no particular stack, and the right thing
to add **if** pull turns out not to be enough. The evidence that would bring it back: an Igor found
stopped on a condition long after the fact, where the listing and the budget line existed and
nobody had read either.

## Capabilities

### Modified Capabilities

Both deltas add requirements. `stuck-conditions` has no base spec until `condition-backoff`
archives, which is why this change archives after it. This change modifies none of that
change's requirements; one of #101's scenario names contradicts this change, as *Still open* says.

- `stuck-conditions`: `igor serve` keeps running whatever conditions are open, a process that
  refuses to start exits with status 78, and every open condition is readable without naming a
  role.
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
