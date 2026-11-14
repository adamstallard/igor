# Design notes

## `igor serve` keeps running on every condition

No open condition ends a running `igor serve`: not one on the Igor's own credential, not one on its
role, and not every seat its role could spend from being stopped. The process keeps polling, and a
stopped scope takes no new item. What a role with no usable seat does is #171's *A role with no
eligible seat stops only on conditions no read clears*. Each condition clears as the requirement
defining its kind says, and the cycle report says what is stopped. Of the exits this change defines, only a failed check that a requirement names as
refusing a start ends the process, and only when they run as the process starts, such as config
validation, #175's start checks and #242's refusal beside a live process of the role before the
first cycle, and #174's check that the pinned skills load before the first model call. The list
is not closed: any check a requirement says refuses a start counts. The same check run again
later, such as #208's reread of the lore repository at a cycle, ends nothing.

Two exits are not this change's to forbid. Under #242 a serving process whose last landed write of
its serving record is 20 minutes old stops its workers and exits 1, so that a second process can
take over safely (agents' decision A2, below), and a process whose serving record another process
has replaced exits 1 too.

*Rejected:* exiting when the open conditions leave the process no item it could take, for the
reasons `stuck-conditions`' decision record gives under *An open condition never ends a running
service*.

A person who fixes a setting the process rereads while running is served faster by a process that
stayed up: its next probe, or its next read of that setting, picks the fix up. A read-cleared
condition, the kind #171 defines, opens on a failing read and clears on the next read that
passes, with no probe. When such reads happen, and which fixes wait for a restart, is the
proposal's decisions 6 and 7; under compose, a fix in `.env` waits for the container to be
recreated (agents' decision A6). #208's `stuck-conditions` delta replaces the clause about lore fixes in
*An open condition never ends a running service* when #208 archives.

## A refusal exits with status 78

Why 78 is in the decision record. This change defines the number because it is the change that decides when `igor serve` exits: never on a
condition, and on a refusal. A refusal is the failure of a check a requirement says refuses a start, when that
check runs as the process starts: config validation and #175's checks run before the first cycle, and #174's check
that the pinned skills load runs before the first model call, which may come after the first
cycle has begun. An error of
the kind a refusal reports, such as a configuration error, raised while the process runs by
anything but such a check, is not a refusal.

A start that falls back to a configuration that passed before is not a refusal either. Under
#208 (`lore-pull`), each process keeps a ref to the last lore commit whose
read passed. A process that restarts after a commit failing validation landed starts on the last
commit that passed, with #208's condition on the refused commit open. A failing lore commit
refuses a start only where #208 has no passing commit to fall back to: a process that has never
applied one, or one whose applied commit fails too. Without that fall-back, every process that restarted after a bad commit landed, through a crash, a deploy
or a reboot, would exit 78 and stay down.

A start check that fails because GitHub or the model provider did not answer, or because GitHub
refused the App's credential, exits 1 instead (the proposal's decision 13).
systemd restarts it 30 seconds later. Under compose it waits as a refusal does before it exits
(agents' decision A1). Either way an outage that passes, or the App's key file replaced at the same path (a new path is an environment change, which
waits for a restart), is picked up at the
next start. A crash
exits with Node's own status, which is never 78, as the decision record shows. #175
cites the requirement *A process that refuses to start exits with status 78* for the number.

*Rejected:* a requirement that the shipped supervisors escalate a process that keeps refusing to
start (the proposal's decision 2), for the reason the decision record gives.

## The systemd unit: `Restart=on-failure` and `RestartPreventExitStatus=78`

The unit sets `Restart=on-failure` and lists 78 in `RestartPreventExitStatus=`. What that does to
a refusal, a crash and a clean exit, as task 1.6 measured, is in the decision record.

The unit also sets `RestartSec=30s`, for the reason the decision record gives with task 1.6's
measurement. Compose has no such setting, so Igor's own wait slows that retry under compose
(agents' decision A1).

## Compose: `restart: unless-stopped`, and a refusal waits before it exits

The compose file (`deploy/docker-compose.yml`) keeps `restart: unless-stopped`, which restarts
every exit until an operator stops the container. Igor slows the loop itself, for the reason the
decision record gives: under compose, a refusal logs its reason, then waits,
then exits 78. The wait grows with each refusal in a row. A start check that exits 1 waits the
same way (agents' decision A1). A crash does not wait, and compose restarts it at once.

The compose file marks the process as running under compose with `IGOR_REFUSAL_WAIT=1`, set
under the service's `environment:` key beside the `env_file:` that loads `.env`. The systemd unit
does not set it (the proposal's decision 15).

The wait's numbers and the place of its count are the proposal's decisions 14 and 16. The count is kept in a file, which a restart is expected to keep and
removing the container discards; task 1.9 measures this (*Open Questions*). A start that passes every check that refuses a start removes the count's
file, once the last of them has passed, #174's check before the first model call included. Why
the file is on no volume is in the decision record.

A stop signal ends the wait at once, so `docker compose stop` and `down` are not held up by it.

*Rejected:* `restart: on-failure:3`, for the reason `stuck-conditions`' decision record gives,
from task 1.8's measurement, which the record holds.

## Terms the budget line uses

**A seat's reserve is a line that moves toward the reset** (see
`docs/architecture.md` §6.3.4,
specified on [#143](https://github.com/adamstallard/igor/pull/143)). It is checked against the
seat's latest unreset reading of each window, a reading taken since that window last reset. The line is `1 − r × remaining`, where `remaining`
is the fraction of the window left before its reset and `r = max(seat reserve, role reserve)`, as
#171's *A role may hold back more of a seat than the seat does* states.
Two consequences for the stopped line:

- A role's line on a seat uses the larger of the seat's and the role's reserve. Where that reserve
  is above 0, #143 does not admit the seat for the role until it has taken an unreset reading of
  each window; where it is 0, #143 admits the seat with no reading. So two of #143's states keep a
  seat unspent besides a stop, no headroom left and no unreset reading, and a stopped seat's line
  is told apart from both.
- Headroom is per role, because the line uses the larger of the seat's and the role's reserve.
  The report shows each window's reading against the seat's reserve line, per role where a role
  reserves more, as #143's `igor budget` does, and a stopped seat's headroom is shown against that
  same line. #143's state of holding back at the reserve line is one more state the stopped line
  is told apart from.

## Why this is its own change and not an extension of `condition-backoff`

`condition-backoff` put this outside its own scope in writing: *"Reporting an open condition
anywhere but the cycle record. Which surface a stuck fleet should be visible on is a question
about operators, not about the loop."* That was a scope decision, not an oversight. Extending `condition-backoff` would have reversed that
decision, and would have held `condition-backoff`'s archive behind a second body of work with a
different reader, the operator watching a fleet, and different code (`src/serve.ts`, `src/cli.ts`,
`src/budget.ts`, `docs/deployment.md`).

The requirements here that report a condition read the conditions `condition-backoff` (#101)
rebuilds from the execution log. This change modifies no requirement: its `seat-budget` delta adds
requirements to an in-force capability, and its `stuck-conditions` delta adds them to the
capability #101 put in force when it archived. #101's scenario *A stopped seat reads as stopped on
its credential* calls a seat with a refused credential stopped only in its name. Its steps, in #171's
copy, which is in force by the time this change archives, say the report shows the credential
condition once for the seat and not as unreadable, which this change's refused-credential line
does.

## Where a role-scoped stop goes, and why not in a budget report

Issue #80 puts a role- or seat-scoped stop on a line in `igor budget`. A seat-scoped stop belongs
there; a role-scoped one does not, for the reasons `seat-budget`'s decision record gives.

What belongs in place of a budget line for a role's stop is a listing whose subject is the
question its reader asks, whether anything is stuck: `igor conditions`, no argument, every open condition with its cure key, scope, count, cure and next probe time, and one
line in `docs/deployment.md`'s "Checking on it" beside `igor budget` and `igor run <role> --plan`.
Once `condition-backoff` is built, the conditions exist, so this is a read and a render, and it is the same read the cycle
report and the budget line already need. The requirement names the command and what it must do:
take no argument, show every open condition with the fields above, and clear nothing by being read.

**A seat's stop is then shown in two reports**, `igor budget` and the conditions listing, from the
same read; the listing renders each condition's own report, never the budget line, so a seat owner's login,
which #171 shows only in `igor doctor` and `igor budget`, appears nowhere else. Showing the stop twice is cheap, and the alternative is worse: an operator who has read `igor budget` and
seen a seat that looks fine, when the reason nothing is happening is a stop on that very seat.
Both readers must see it; one source states it, the execution log the conditions are rebuilt
from.

## Why the listing is given no role, shows a probe time, and clears nothing

An operator asking whether anything is stuck does not know which role to ask about; that is the
question. A surface that takes a role answers only for somebody who already suspects the right
one, and the fleet-wide reading, several Igors stopped on one cure key, is the strongest signal
available here and the one a per-role surface cannot produce at all.

It states the probe time because the operator's next question, having read a stop, is whether
their cure took. A stop with no time on it cannot be told from a stop nothing is going to do
anything about. A condition with no probe states what clears it instead.

Reading cannot clear, for the reason a breaker cannot be reset by being asked: an operator who
believes they have fixed a credential and has not would clear the stop and pay for the belief on
the next items. A condition closes only on an observation, never on a claim. For most conditions
that observation is the probe. For a read-cleared condition, such as a seat file Igor could not
decrypt, it is a later read that passes.

## Deferred: `on_condition_command`

The same shape as a seat's `token_command`: a command the operator names, run when a condition
opens, wired to whatever they page on. It assumes no particular monitoring or paging system.

Deferred rather than taken, because it is the answer to a question pull has not yet failed. The
evidence that brings it back: an Igor found stopped on a condition
substantially after the fact, with the listing and the budget line both in place and neither read.
That is a report about operators, and it is the report that would make a push surface a measured
need rather than a preference.

## Agents' decisions

These settle what the proposal's decisions leave open. Each is cheap to reverse.

- **A1. Under compose, a start check's exit 1 waits as a refusal does.** A start check's exit 1 is
  the exit 1 that *A process that refuses to start exits with status 78* assigns when GitHub or the
  model provider did not answer, or GitHub refused the App's credential. #242's takeover write at
  start, where GitHub does not answer it, is such a check and waits too. Three exits do not wait: a
  crash; #242's stand-down when the process cannot rewrite its record; and #242's exit 1 when the
  record it watches at start disappears, after which the restarted process watches it again. Why exit
  1 waits under compose is in the decision record. The wait reuses decision 14's numbers and decision 15's variable, counts refusals and such exits in
  one count of failed starts in a row, and leaves the exit status at 1. The cost is that a start
  after a long outage can wait up to 30 minutes after the outage ends.
- **A2. #242's stand-down is not an exit because of a condition.** The decision recorded in issue #241 has a
  process that cannot renew its record stop its own workers, and #242 makes that stop exit 1. This
  change yields to it, with the scenario *A process that cannot rewrite its serving record still
  stops*. Whether #242 should treat a refused App credential differently is #242's (proposal,
  *Still open*).
- **A3. The listing shows each kind's count and clearing as that kind's requirement says.** This
  covers #175's sudoers condition, which keeps a count and clears on a passing check at a cycle's
  start; a read-cleared condition, which keeps no count and clears on a passing read; and the
  refused App credential, which clears on a minted token.
- **A4. A seat whose conditions are all read-cleared reads as #171 shows it.** That covers
  `seat:<id>:decrypt` and #171's malformed seat file, `seat:<id>:file`, which stops nothing and
  which #171 shows with the file's refusal. A stopped seat `igor budget` cannot decrypt shows as
  stopped and also as not checked, so neither reading hides the other. A stopped seat's headroom
  uses #171's reserve rule.
- **A5. No `surface-adapter` delta for decision 13's exit 1.** The in-force *An Igor that cannot
  act as its App does not start* names no exit status, so it and this change agree on behaviour,
  and a delta here would be replaced by #216's later copy of that requirement.
- **A6. Under compose, a fix in `.env` takes effect when the container is recreated**, for the
  reason the decision record gives. The deployment guide says so (task 4.2).
- **A7. The record material goes to `stuck-conditions`' decision record in this change.** The
  rejections of exiting when no item can be taken, of `restart: on-failure:3`, of an issue in
  the destination and of supervisors escalating a refusal, the reason for status 78, and the
  measurements behind the systemd and compose requirements, are entries
  in `openspec/specs/stuck-conditions/decisions.md`, and why a role's stop is not in a budget
  report is in `openspec/specs/seat-budget/decisions.md`. #175 creates `stuck-conditions`' record too, so whichever of
  the two merges second joins the two files' sections by hand.

## Open Questions

- **Whether a restart by compose keeps the environment the container was created with.** The
  scenario *A fix in compose's environment waits for the container to be recreated*, A6 and task
  4.2 rest on it, and task 1.9 measures it; if a policy restart rereads `.env`, a fix there takes
  effect at the next crash too, and the scenario and the deployment guide change.
- **Whether a restart by compose keeps the count of failed starts.** The design rests on a file
  in the container's writable layer surviving a restart under `unless-stopped` and going when the
  container is recreated. Task 1.9 measures it; if a restart loses the file, every failed start
  waits 30 seconds and the doubling never happens.
