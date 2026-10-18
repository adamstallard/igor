# Design notes

## `igor serve` keeps running on every condition (Adam, 2026-10-18)

No open condition ends a running `igor serve`: not one on the Igor's own credential, not one on its
role, and not every seat its role could spend from being stopped. The process keeps polling, and a
stopped scope takes no new item. Where #171 has a role with no usable seat give each item it would
work back to a person, with a comment naming the condition, the process does that. Each condition
clears as `condition-backoff` and #171 clear it, and the cycle report says what is stopped. Only the
checks before the first cycle still end the process: config validation, and under #175 the checks
that the worker user exists and that `fs.protected_hardlinks` is `1`.

**Rejected: exiting when the open conditions leave the process no item it could take.** This
change specified that until 2026-10-18. Three facts each count against it:

- **A restart reads the same state.** Conditions are rebuilt from the execution log on the state
  branch, so a restarted process finds every condition its predecessor exited on. It exits again
  or idles; it cannot know more than a process that stayed up.
- **Exiting fights the probe.** A condition clears only when a probe item, let through after a
  cooldown, does not meet it. A process that exits as soon as it sees an open condition never runs
  long enough to reach that cooldown, so the condition could never clear. The exit rule therefore
  had each start check for a passed cooldown and take the probe before exiting, which made how
  often the supervisor restarts the process decide how often a probe could run.
- **The shipped supervisors escalate nothing.** `deploy/igor.service` has `Restart=always` and
  `RestartSec=30`, with no `StartLimit*` override and no `OnFailure=`. Restarts thirty seconds
  apart never reach systemd's start rate limit (documented default: 5 starts in 10 s), so the unit
  never enters `failed` and nothing hung off `failed` fires. `docker compose`'s `unless-stopped`
  backs off but alerts nobody. Only Kubernetes' `CrashLoopBackOff` is the alertable crash loop the
  exit assumed. Reading taken from the unit files and documented defaults, not by running them.

A person who fixes a setting the process rereads while running is served faster by a process that
stayed up: its next probe, or its next read of that setting, picks the fix up. Two kinds of fix are
not reread. A fix in the lore repository reaches a running process only once #176, the issue that
specifies Igor pulling its lore checkout, is built. A fix in the unit's environment file is read
only at start, so it always needs a restart. Which cures need a restart is open in the proposal.

The startup refusals that remain meet the same unit file: a process that keeps refusing to start is
restarted every 30 seconds, and nothing alerts anyone. This change does not address that, and the
proposal lists it as open.

## Since review: one role per Igor, and no pools (2026-10-04)

Two decisions by Adam change the reasoning here, and no requirement or scenario:

- **An Igor holds exactly one role** ([#156](https://github.com/adamstallard/igor/pull/156)).
  The passages saying a multi-role `serve` would satisfy the exit rule unchanged are removed. The
  exit rule itself was dropped on 2026-10-18.
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
`openspec/specs/stuck-conditions/spec.md` holding this change's requirements alone, over a Purpose
line naming this change as what created the capability.

## Where a role-scoped stop goes, and why not in a budget report

Issue #80's answer was "role- or seat-scoped → a line in `igor budget`", following the credential
breaker's `!  out of rotation: …` precedent exactly. Half of that survives specification and half
does not.

**Seat-scoped belongs there.** A budget report answers "can this seat be spent from", and it
already carries two other answers to that question on a line of the seat's own: a credential that
could not be read, and — with `condition-backoff` (#101), which replaced the credential breaker
proposed in #65 — one the
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
Once `condition-backoff` is built, the conditions exist, so this is a read and a render, and it is the same read the cycle
report and the budget line already need. The requirement states the property — no argument, no role
named, that content, reading clears nothing — rather than the command's name, because the name is
the part a reviewer may reasonably want different.

**The seat line is then a deliberate duplication**, one line rendered from the same record in two
reports. It is cheap, and the alternative is worse: an operator who has read `igor budget` and
seen a seat that looks fine, when the reason nothing is happening is a stop on that very seat.
Both readers must see it; one source states it, the execution log the conditions are rebuilt
from.

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
condition that brings it back: an Igor found stopped on a role- or seat-scoped condition
substantially after the fact, with the listing and the budget line both in place and neither read.
That is a report about operators, and it is the report that would make a push surface a measured
need rather than a preference.
