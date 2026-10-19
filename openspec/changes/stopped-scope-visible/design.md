# Design notes

## `igor serve` keeps running on every condition (Adam, 2026-10-18)

No open condition ends a running `igor serve`: not one on the Igor's own credential, not one on its
role, and not every seat its role could spend from being stopped. The process keeps polling, and a
stopped scope takes no new item. Where a role has no usable seat, #171 stops the role when every
seat serving it is under a condition that does not clear on its own when a later read of a file
passes (#171's *read-cleared* kind). Otherwise it hands the item back to a person, with a comment
naming the condition. That requirement is #171's. Each condition clears as `condition-backoff` and #171 clear it, and the cycle report says
what is stopped. Only the checks that a requirement names as refusing a start end the process, and only when
they run as the process starts: config validation and #175's start checks, for a worker user
and `fs.protected_hardlinks`, before the first cycle, and #174's check that the pinned skills
load before the first model call. The same check run again later,
such as #179's reread of the configuration at each cycle, ends nothing.

**Rejected: exiting when the open conditions leave the process no item it could take.** Three
facts each count against it:

- **A restart reads the same state.** Conditions are rebuilt from the execution log on the state
  branch, so a restarted process finds every condition its predecessor exited on. It exits again
  or idles; it cannot know more than a process that stayed up.
- **Exiting fights the probe.** A condition clears only when a probe item, let through after a
  cooldown, does not meet it. A process that exited as soon as it saw an open condition would
  never run long enough to reach that cooldown, so the condition could never clear. Each start
  would have to check for a passed cooldown and take the probe before exiting, and how often the
  supervisor restarted the process would decide how often a probe could run.
- **Restarts escalate nothing.** A systemd unit that restarts the process 30 seconds after each
  exit, with no `StartLimit*` override and no `OnFailure=`, never reaches systemd's start rate
  limit (default: 5 starts in 10 seconds), so the unit never enters `failed` and nothing hung off
  `failed` fires. Task 1.6 saw the default limit not trip even at a 2-second restart delay.

A person who fixes a setting the process rereads while running is served faster by a process that
stayed up: its next probe, or its next read of that setting, picks the fix up. A read-cleared
condition, the kind #171 defines, opens on a failing read and clears on the next read that
passes, with no probe. Two kinds of fix need more than a probe or a read (Adam, 2026-10-18). A fix in the environment the supervisor gives
the process, the unit's environment file or the compose file's `environment:`, is read only at
start, so the operator who made it restarts the unit or the container. A fix in the lore
repository reaches the process only once a person has updated the server's lore checkout, since
nothing in Igor updates it. A fix to a file the process reads only at start then waits for a
restart too; a file it rereads at each cycle, such as `igor.config.yaml` under #179, applies at
the next cycle. Under #208 (`lore-pull`) each process fetches the lore repository and applies
what lands. This change archives before #208, and #208's `stuck-conditions` delta removes the
lore sentence from *An open condition never ends a running service* when #208 archives.

## A refusal exits with status 78 (Adam, 2026-10-18)

78 is `EX_CONFIG` in `sysexits.h`, a configuration error, which every refusal here is. This change
defines the number because it is the change that decides when `igor serve` exits: never on a
condition, and on a refusal. A refusal is the failure of a check a requirement says refuses a start, when that
check runs as the process starts: config validation and #175's checks run before the first cycle, and #174's check
that the pinned skills load runs before the first model call, which may come after the first
cycle has begun. An error of
the kind a refusal reports, such as a configuration error, raised while the process runs by
anything but such a check, is not a refusal.

A start that falls back to a configuration that passed before is not a refusal either. Under
#208 (`lore-pull`, Adam, 2026-10-18), each process keeps a ref to the last lore commit whose
read passed. A process that restarts after a commit failing validation landed starts on the last
commit that passed, with #208's condition on the refused commit open. A failing lore commit
refuses a start only where #208 has no passing commit to fall back to: a process that has never
applied one, one whose applied commit fails too, or one whose rank the roster in the fetched lore
commit no longer declares (#179 runs each role as numbered processes, its *ranks*, which
`igor.config.yaml` in the lore repository lists as its *roster*).
Without that, every process that restarted after a bad commit landed, through a crash, a deploy
or a reboot, would exit 78 and stay down.

A start check that fails because GitHub or the model provider did not answer, or because GitHub
refused the App's credential, exits 1 instead (decision 13, proposed): the supervisor restarts
it, so an outage that passes, or the App's key file replaced at the same path, is picked up at the
next start. A crash
keeps whatever status Node gives it, never 78. Node's own exit codes run from 1 to 14,
and a signal gives 128 plus its number, so none collides with 78. #175 cites the requirement *A
process that refuses to start exits with status 78* for the number.

**Rejected: a requirement that the shipped supervisors escalate a process that keeps refusing to
start.** A failed unit is already what systemd's tools and monitors report, and under compose the slow
loop of refusals, each in `docker compose logs`, is the signal.

## The systemd unit: `Restart=on-failure` and `RestartPreventExitStatus=78` (Adam, 2026-10-18)

The unit sets `Restart=on-failure` and lists 78 in `RestartPreventExitStatus=`, which systemd
honours whatever `Restart=` says. The unit then leaves a refusal down, shows `failed` in
`systemctl status`, and keeps Igor's reason in its journal. Any monitor that watches for failed
units sees it, with nothing Igor-specific to configure. A crash exits non-zero and is restarted.
A clean exit, status 0, is not restarted, and the unit shows inactive.

Under #179 (`concurrent-instances`) a role can run as several processes, each with a number it
keeps across restarts, its *rank*, and the role's *roster* in `igor.config.yaml` lists the ranks
it runs. A rank removed from the roster exits 0 at the cycle where it rereads the roster, and
`Restart=on-failure` leaves it down.
*Rejected:* a status 79 for a retired rank, listed in `RestartPreventExitStatus=` and in
`SuccessExitStatus=` so that systemd would show the unit inactive. `Restart=on-failure` gives the
same result with status 0.

**Measured (task 1.6, 2026-10-18).** On systemd 252 in a `debian:bookworm` container, with the
shipped unit's settings and a stand-in for `igor serve` that exits with a chosen status, read 12
seconds after start (`RestartSec=2` in place of 30, to finish quickly):

| unit | exit 0 | exit 1 | exit 78 |
|---|---|---|---|
| `Restart=always` | restarted | restarted | restarted |
| `Restart=on-failure`, `RestartPreventExitStatus=78` | inactive, not restarted | restarted | `failed`, not restarted, `status=78/CONFIG` and Igor's line in the journal |

This confirms the design. Under `Restart=always` a rank retired with status 0 would come back
every 30 seconds, which is why task 1.5 sets `Restart=on-failure`. A unit with 79 in
`RestartPreventExitStatus=` and `SuccessExitStatus=` would show a retired rank inactive under
either `Restart=` setting, but this change uses no 79.

## Compose: `restart: unless-stopped`, and a refusal waits before it exits (Adam, 2026-10-18)

The compose file (`deploy/docker-compose.yml`) keeps `restart: unless-stopped`, which restarts
every exit until an operator stops the container. Compose has no setting that skips one exit
status, so Igor slows the loop itself: under compose, a refusal logs its reason, then waits,
then exits 78. The wait grows with each refusal in a row. A crash does not wait, and compose
restarts it at once.

The compose file marks the process as running under compose with `IGOR_REFUSAL_WAIT=1` in its
`environment:`. The systemd unit does not set it, because systemd does not restart a refusal: a
wait there would only keep a refusing unit showing active instead of failed.

The count of refusals in a row lives in a file in the container's own filesystem, outside every
volume. A restart by compose keeps the same container, and so the count. A start that passes
every check that refuses a start removes the file. The file must not be on a volume: the
`igor-trees` volume at `/tmp` is shared by every Igor's container, which would share one count.

A stop signal ends the wait at once, so `docker compose stop` and `down` are not held up by it.

**Rejected: `restart: on-failure:3`.** Its
count of three never resets while the container exists, so a container that had run for weeks
would stay down after its fourth crash.

**A retired rank is removed from the compose file (Adam, 2026-10-19).** A rank is retired when
the roster no longer declares it, and it then exits 0 (#179). Compose restarts every exit, a
retired rank's included, and #179 has the restarted process refuse, since the roster does not
declare its rank. That refusal is one more check that refuses a start, so it exits 78 and waits
as the others do. Each refusal in a row waits longer, up to the ceiling of 30 minutes (task 1.3),
so the container would refuse every 30 minutes for as long as its service stays in the compose
file. Retiring a rank under compose therefore means removing its service and running
`docker compose up -d --remove-orphans`, which the compose file's comment (task 1.7) and the
deployment guide (task 4.2) say. systemd needs nothing extra: `Restart=on-failure` does not
restart an exit 0.

**Measured (task 1.8, 2026-10-18).** On Docker Engine 29.6.2 with Compose 5.3.1, with a stand-in
command that counts its starts and exits with a chosen status:

- **`on-failure:3` retries a refusal three times, then leaves it down.** A container exiting 78 at
  once started four times in about two seconds, then stayed `exited` with `RestartCount=3`. Every
  attempt's line was in `docker compose logs`. Docker documents that a restart policy takes
  effect only once a container has run for 10 seconds; a quick refusal was retried all the same,
  so that rule governs only the delay between restarts.
- **`on-failure:3`'s count never resets.** Runs of 12 seconds and of 150 seconds did not reset
  it, and a fourth crash after three quick ones left the container down. Only a manual start
  (`docker compose up -d` or `docker start`) gave three more retries. That is why compose keeps
  `unless-stopped` (decision 9). A run of hours was not tried, but moby keeps the count for the container's
  life.
- **A clean exit is not restarted under `on-failure`.** Under `unless-stopped` it is: that is the
  policy's documented behaviour, not measured here.
- **After a daemon restart,** a container that was running under `on-failure` came back, without
  spending a retry; one that was down stayed down. This was measured inside `docker:29-dind`
  with `docker restart`, as the nearest stand-in for a host reboot. `unless-stopped` documents
  the same, so no setup is needed to bring Igor back after a reboot.

The waiting refusal itself is not measured: it is Igor's code, which task 1.4 tests.

## Terms the budget line uses

**Every seat that serves the role** (Adam, 2026-10-04). An Igor holds exactly one role
([#156](https://github.com/adamstallard/igor/pull/156)), and #171 drops pools
([#148](https://github.com/adamstallard/igor/issues/148)): a seat's own file lists the roles it
serves, and of the seats serving its role that are under their reserve line, defined below, the
Igor picks the one with the most headroom, soonest reset breaking ties ([#147](https://github.com/adamstallard/igor/issues/147)).

**A seat's reserve is a line that moves toward the reset** (Adam, 2026-09-28,
[`docs/architecture.md` §6.3.4](../../../docs/architecture.md#634-a-seats-reserve-is-a-line-that-moves-toward-the-reset--decided-2026-09-28-specified-on-143-not-built),
specified on [#143](https://github.com/adamstallard/igor/pull/143)). It is checked against the
seat's latest unreset reading of each window, a reading taken since that window last reset. The line is `1 − r × remaining`, where `remaining`
is the fraction of the window left before its reset and `r = max(seat reserve, role reserve)`.
Two consequences for the stopped line:

- A seat whose reserve is above 0 and that has no unreset reading is not admitted until #143 has
  taken a reading of its windows; #143 admits a seat whose reserve is 0 with no reading. These are #143's states, so the
  stopped line is told apart from them: no headroom left, and no unreset reading of its windows.
- Headroom is per role, because the line uses the larger of the seat's and the role's reserve.
  The report shows each window's reading against the seat's reserve line, per role where a role
  reserves more, as #143's `igor budget` does, and a stopped seat's headroom is shown against that
  same line. #143's state of holding back at the reserve line is one more state the stopped line
  is told apart from.

## Why this is its own change and not an extension of `condition-backoff`

`condition-backoff` put this outside its own scope in writing: *"Reporting an open condition
anywhere but the cycle record. Which surface a stuck fleet should be visible on is a question
about operators, not about the loop."* That was a scope decision, not an oversight, and extending
that change's delta would quietly reverse it while the change is part-implemented — and hold its
archive behind a second body of work with a different reader, different code (`src/serve.ts`,
`src/cli.ts`, `src/budget.ts`, `docs/deployment.md`) and a different way of being wrong.

The dependency runs one way and is total: every requirement here reads the conditions
`condition-backoff` rebuilds from the execution log, and none of them alters a requirement it states. Both deltas here only add
requirements, the one on `stuck-conditions` included — a capability that has no base spec in
`openspec/specs/` until `condition-backoff` archives. That is also the sequencing constraint:
`condition-backoff` archives first, or this change's requirements land as the whole of a
capability whose other half is still an open change. Archived before `condition-backoff`, in a
throwaway copy of `openspec/`, this change lands its requirements as the whole capability
without complaining: it creates
`openspec/specs/stuck-conditions/spec.md` holding this change's requirements alone, over a Purpose
line naming this change as what created the capability.

## Where a role-scoped stop goes, and why not in a budget report

Issue #80 puts a role- or seat-scoped stop on a line in `igor budget`. Half of that holds and
half does not.

**Seat-scoped belongs there.** A budget report answers "can this seat be spent from", and it
already carries two other answers to that question on a line of the seat's own: a credential that
could not be read, and, under `condition-backoff` (#101), one the provider refused. A stopped seat is the third. Nothing new is invented and the operator debugging
a seat finds it where they already are.

**Role-scoped does not.** `igor budget` is titled *what each seat has left*. As built on `main`
it has seat rows and pool lines, which #171 replaces with seats that list their roles, and no
notion of a role at all. A role
stopped because its `commands` refuse an install has nothing to do with capacity, and the reader
of a budget report is not asking whether anything is stuck — they are asking what is left to
spend. Filing the line there puts it where its reader is not, which is the failure mode worth more
than the consistency.

What belongs there instead is a listing whose subject *is* the question: `igor conditions`, no
argument, every open condition with its cure key, scope, count, cure and next probe time, and one
line in `docs/deployment.md`'s "Checking on it" beside `igor budget` and `igor run <role> --plan`.
Once `condition-backoff` is built, the conditions exist, so this is a read and a render, and it is the same read the cycle
report and the budget line already need. The requirement states the property — no argument, no role
named, that content, reading clears nothing — rather than the command's name, because the name is
the part a reviewer may reasonably want different.

**The seat line is then a deliberate duplication**, one line rendered from the same read in two
reports, `igor budget` and the conditions listing. It is cheap, and the alternative is worse: an operator who has read `igor budget` and
seen a seat that looks fine, when the reason nothing is happening is a stop on that very seat.
Both readers must see it; one source states it, the execution log the conditions are rebuilt
from.

## Why the listing names no role, shows a probe time, and clears nothing

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

## Rejected: an issue in the destination

[#77](https://github.com/adamstallard/igor/pull/77), closed, has the full analysis. It pushes,
which nothing here does. The costs that sank it: Igor authoring tracker items is a new concept in
a system that has carefully kept Igors as consumers of items; `universalSkip` would have to learn
about items an Igor wrote, or a fleet triages its own alerts; and the template gains `issues:
write`. The audience argument is the one that would still hold even if all three were free — a
work tracker is read by reviewers deciding what to work on, and an operations alert is not that.

## Deferred: `on_condition_command`

The same shape as a seat's `token_command`: a command the operator names, run when a condition
opens, wired to whatever they page on. It assumes no particular monitoring or paging system.

Deferred rather than taken, because it is the answer to a question pull has not yet failed. The
evidence that brings it back: an Igor found stopped on a condition
substantially after the fact, with the listing and the budget line both in place and neither read.
That is a report about operators, and it is the report that would make a push surface a measured
need rather than a preference.
