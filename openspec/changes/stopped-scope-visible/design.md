# Design notes

## Why this is its own change and not an extension of `condition-backoff`

`condition-backoff` put this outside its own scope in writing: *"Reporting an open condition
anywhere but the cycle record. Which surface a stuck fleet should be visible on is a question
about operators, not about the loop."* That was a scope decision, not an oversight, and extending
that change's delta would quietly reverse it while the change is part-implemented — and hold its
archive behind a second body of work with a different reader, different code (`src/serve.ts`,
`src/cli.ts`, `src/budget.ts`, `docs/deployment.md`) and a different way of being wrong.

The dependency runs one way and is total: every requirement here reads the condition record
`condition-backoff` writes, and none of them alters a requirement it states. Both deltas here are
`ADDED`, including the ones on `stuck-conditions` — a capability that has no base spec in
`openspec/specs/` until `condition-backoff` archives. That is also the sequencing constraint:
`condition-backoff` archives first, or this change's requirements land as the whole of a
capability whose other half is still an open change. Archiving this one first was tried in a
throwaway copy of `openspec/` and does exactly that without complaining: it creates
`openspec/specs/stuck-conditions/spec.md` holding these four requirements alone, over a Purpose
line naming this change as what created the capability.

## The exit is keyed to the cure's scope, and the case against that is worth writing down

The requirement says an Igor-scoped condition exits and a role- or seat-scoped one does not. The
argument for it is that exiting discards capacity the cure says nothing about.

What weakens it here: `igor serve` takes exactly one role, and `deploy/igor.service` is a per-role
template (`ExecStart=/usr/local/bin/igor serve %i`). So the process serving a stopped role *is* up
and doing nothing — the exact failure mode this change exists to end. "The Igor is still doing
useful work" is true of the machine account and its other role instances, and false of the unit
that is actually stopped. The issue's own open question is the same one arriving from the seat
side: every seat a role can draw on being stopped is Igor-scoped in effect if not in derivation.

Both are deferred rather than answered, because the discriminator that would settle them is not
measurable yet. It is the one the requirement already leans on: a budget window reopens on its own
clock, a stopped scope waits for a person. If that is as true of a role-scoped stop as of an
Igor-scoped one — and on the evidence above it looks true — then the exit is effect-derived,
"can this process take anything at all", and the requirement is modified rather than extended.
What makes it a measurement instead of a preference is either the first operator report of an Igor
found silently idle on a role-scoped stop, or a `serve` that runs more than one role, at which
point the per-process argument evaporates on its own.

Specifying the scope-derived version first costs one modified requirement if that evidence
arrives. Specifying the effect-derived version first costs a fleet that exits on a condition
affecting one of several roles, and there is no way back from a supervisor's alert that should not
have fired.

## Exit and probe are in tension, and the probe wins at startup

`condition-backoff` clears a condition by letting exactly one item through after a cooldown, and
that is the only mechanism: nothing announces a cure. Exit interacts with it badly if taken
literally. A process that exits on sight of an open condition never reaches the cooldown, so under
a supervisor that restarts it the probe is never run from inside a process that survives long
enough to run it. The condition becomes permanent, and a cure made five minutes after the stop
waits for somebody to notice and restart something by hand — which is the state this change exists
to end, reached by the mechanism meant to end it.

The cooldown is wall-clock and lives in the state branch, so it survives the restart. That is what
makes the resolution simple: the decision to exit comes *after* the probe check, never before it.
A start with the cooldown passed is exactly the moment the probe would have run anyway, so the
restart cadence becomes the probe cadence, which is the second reason the retry interval matters
below.

## What the exit is worth on the recipes this repository ships

Measured by reading the units rather than by running them, so it is a reading of the files and not
an experiment:

- **`deploy/igor.service`**: `Restart=always`, `RestartSec=30`, no `StartLimit*` override and no
  `OnFailure=`. systemd's start rate limit counts starts inside `StartLimitIntervalSec`
  (documented default 10s, burst 5); restarts thirty seconds apart never reach it, so the unit
  never enters `failed`, and everything an operator would hang off `failed` — `OnFailure=`,
  `systemctl is-failed`, a journal alert on the unit's state — never fires. Worth confirming
  against `systemd.service(5)` on the target distribution when the docs task is done, since the
  defaults are the load-bearing part.
- **`deploy/docker-compose.yml`**: `restart: unless-stopped` backs off and never gives up, so the
  probe keeps getting its chance — but nothing escalates either.
- **Kubernetes**: the same loop surfaces as `CrashLoopBackOff`, which is alertable out of the box
  and caps its backoff. This is the shape the issue's argument assumes.
- **A bare `while true` wrapper**: neither backs off nor escalates, and is the one shape where
  exiting is strictly worse than idling.

So "every supervisor already alerts on a crash loop" is true of Kubernetes and not of what this
repository ships. Hence the requirement has two halves — escalate, and retry no faster than the
loop would have polled — and the second is quantified: `RestartSec=30` against a ten-minute
default poll would restart a stopped Igor twenty times more often than the working one polled, and
each start re-reads the configuration and the state branch.

There is a real tension inside "escalate": making systemd reach `failed` means it *stops*
restarting, and a unit that stops restarting never probes again. The two ways out are an
`OnFailure=` unit that fires while `Restart=always` keeps running, or an external check on restart
count — either satisfies the requirement, and the requirement deliberately states the property
rather than the recipe, because which one an operator can have depends on what else they run.

## Where a role-scoped stop goes, and why not in a budget report

The issue's answer was "role- or seat-scoped → a line in `igor budget`", following the credential
breaker's `!  out of rotation: …` precedent exactly. Half of that survives specification and half
does not.

**Seat-scoped belongs there.** A budget report answers "can this seat be spent from", and it
already carries two other answers to that question on a line of the seat's own: a credential that
could not be read, and — with [#65](https://github.com/adamstallard/igor/pull/65) — one the
provider refused. A stopped seat is the third. Nothing new is invented and the operator debugging
a seat finds it where they already are.

**Role-scoped does not.** `igor budget` is titled *what each seat has left*; it has seat rows and
pool lines and no notion of a role at all beyond a placeholder name in the pool gate. A role
stopped because its `commands` refuse an install has nothing to do with capacity, and the reader
of a budget report is not asking whether anything is stuck — they are asking what is left to
spend. Filing the line there puts it where its reader is not, which is the failure mode worth more
than the consistency.

What belongs there instead is a listing whose subject *is* the question: `igor conditions`, no
argument, every open condition with its cure key, scope, count, cure and next probe time, and one
line in `docs/deployment.md`'s "Checking on it" beside `igor budget` and `igor run <role> --plan`.
The record exists by then, so this is a read and a render, and it is the same read the exit path
and the budget line already need. The requirement states the property — no argument, no role
named, that content, reading clears nothing — rather than the command's name, because the name is
the part a reviewer may reasonably want different.

**The seat line is then a deliberate duplication**, one line rendered from the same record in two
reports. It is cheap, and the alternative is worse: an operator who has read `igor budget` and
seen a seat that looks fine, when the reason nothing is happening is a stop on that very seat.
Both readers must see it; only one record states it.

## Rejected: an issue in the destination

[#77](https://github.com/adamstallard/igor/pull/77), closed, has the full analysis. It pushes,
which nothing here does. The costs that sank it: Igor authoring tracker items is a new concept in
a system that has carefully kept Igors as consumers of items; `universalSkip` would have to learn
about items an Igor wrote, or a fleet triages its own alerts; and the template gains `issues:
write`. The audience argument is the one that would still hold even if all three were free — a
work tracker is read by reviewers deciding what to work on, and an operations alert is not that.

## Deferred: `on_condition_command`

The same shape as a seat's `token_command`: a command the operator names, run when a condition
opens, wired to whatever they page on. It assumes no stack, which is exactly what the exit does
assume.

Deferred rather than taken, because it is the answer to a question pull has not yet failed. The
condition that brings it back: an Igor found stopped on a role- or seat-scoped condition
substantially after the fact, with the listing and the budget line both in place and neither read.
That is a report about operators, and it is the report that would make a push surface a measured
need rather than a preference.
