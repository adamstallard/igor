# Design notes

## Since review: one role per Igor, and no pools (2026-10-04)

Two decisions by Adam change the reasoning here, and no requirement or scenario:

- **An Igor holds exactly one role** ([#156](https://github.com/adamstallard/igor/pull/156)).
  This change argued for detecting what is left on the grounds that `serve` might one day run
  several roles. That day will not come, so the passages saying a multi-role `serve` satisfies
  the rule unchanged are removed. The check is still detected rather than inferred from the
  scope, because the seat side needs it: a stopped seat leaves nothing only where every seat that
  serves the role is stopped.
- **Pools are dropped** ([#148](https://github.com/adamstallard/igor/issues/148)). A seat's own
  file lists the roles it serves, and among those under their line the Igor picks the seat with
  the most headroom, soonest reset breaking ties
  ([#147](https://github.com/adamstallard/igor/issues/147)). "Every seat in the pool" is now
  "every seat that serves the role", which is what the requirement already said. The
  description of today's `igor budget`, with its pool lines, stays as written: it is the report
  as built.

## Since review: "no capacity figure" stops being a gate state (2026-09-28)

Added 2026-09-28. It records a decision made after review and the one wording change Adam approved
because of it, applied the same day to the spec and to task 4.2. No scenario changed.

Adam decided on 2026-09-28 that a seat's reserve is a line that moves toward the reset, checked
against the seat's latest unreset reading of each window. It replaces the dollar bound
`(1 − reserve) × capacity` as the gate
([`docs/architecture.md` §6.3.4](../../../docs/architecture.md#634-a-seats-reserve-is-a-line-that-moves-toward-the-reset--decided-2026-09-28-specified-on-143-not-built)).
Capacity figures stay only as a display, and a seat with no unreset reading is not admitted until a
probe has read it. The line is `1 − r × remaining` with `r = max(seat reserve, role reserve)`, since a role file
may also set its own reserve (§6.3.4). It is specified on [#143](https://github.com/adamstallard/igor/pull/143) and not
built.

**For this change:**

- *A seat a condition has stopped reads as stopped* required the stopped state to be told apart
  from, among others, "a seat with no headroom left or no capacity figure at all". After #143's
  gate two, "no capacity figure" no longer holds a seat. The state that does is "no unreset
  reading, awaiting a probe". **Restated with Adam's approval on 2026-09-28:** the list now ends
  "…from a seat with no headroom left or with no unreset reading of its windows", and task 4.2
  says the same.
- *Only open conditions count toward it* holds as written. "A window that has not reset" and "a
  role held back by pacing" are both waits that end on their own. Under the line, a window shut
  below 100% reopens when the line crosses the reading, before its reset, and pacing is that same
  line. Both still end without anyone acting, which is the discriminator this change turns on.
- **Headroom becomes per role.** Because the line uses the larger of the seat's and the role's
  reserve, one seat can have headroom for one role and none for another at the same moment. Task
  4.2's "a stopped seat with headroom shows both", and the scenario *Stopped is not out of
  headroom* ("a stopped seat still has headroom in both windows"), no longer say whose headroom.
  `igor budget` reports per seat. Whether it shows headroom against the seat's own reserve or per
  role is for #143, whose gate two rewrites that report. This change needs only to say which,
  once #143 has decided.
- No code on this branch; nothing here depends on the dollar bound.

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

## The exit is keyed to what is left, and detected rather than inferred

The rule is: establish whether the conditions open against this process leave it any item it could
take. None left is an exit; any left is a report and a running loop.

The alternative, written first and rejected, keys the exit to the cure's *derivation* — an
Igor-scoped condition exits, a role- or seat-scoped one never does. It reads well and it does not
survive the shapes this repository ships. `igor serve` takes exactly one role, and
`deploy/igor.service` is a per-role template (`ExecStart=/usr/local/bin/igor serve %i`), so a
role-scoped stop leaves the unit serving that role up and doing nothing: the failure mode this
change exists to end, arriving through the door the rule left open. The issue's own open question —
whether every seat being stopped should exit — is the same omission approached from the seat end,
and a scope-derived rule has to answer it as a special case. Keyed to what is left, both fall out
of one check.

**Detected, not inferred from the scope.** The requirement asks what is *left*, which a process
answers about itself: a condition naming the Igor's own credential leaves nothing; a condition on
the role it serves leaves nothing, since an Igor holds one role; a stopped seat leaves nothing only
where every seat that serves the role is stopped.

Nothing new has to be recorded for it. A cure key *is* its scope — `role:<name>:commands` names a
role, `seat:<id>:token` names a seat — and finding the seats that serve a role is what the budget gate
already does before choosing one. The check belongs where that
resolution happens.

**The guard is in the requirement, not only here.** Only *stopped scopes* may count toward
"nothing left". A seat with no headroom, a window that has not reset, a role held back by pacing
or by its own ceiling must not. The discriminator is the one this whole change turns on — a budget
window reopens on its own clock, a stopped scope waits for a person — and it is written into the
requirement because the requirement is what an implementer is held to. Folded together, the check
makes `igor serve` exit on an ordinary session limit, which is a crash loop on a state every Igor
reaches in normal use, and it would spend the exit signal precisely where it means nothing.

A credential the provider refused is the one genuinely arguable exclusion. It waits for a person
too, so by the discriminator alone it belongs. It is left out because it is a different mechanism
with its own hold, cooldown and reporting line, still unmerged in
[#65](https://github.com/adamstallard/igor/pull/65), and folding it in would make this change also
the change that decides there is one "cannot proceed until somebody acts" state rather than two.

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
