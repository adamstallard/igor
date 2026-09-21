## Why

`condition-backoff` stops a scope after the same cure key recurs, and says in its own Impact
what it does not do: *"A stopped scope is visible only where somebody looks at the record."*

At a terminal that is fine — somebody typed `igor run` and is reading the output. Unattended it
is not. `igor serve` has no exit surface at all: it returns a `ServeSummary` and nothing in
`src/cli.ts` sets a status from it, so the only non-zero exits in the whole binary are a config
error at startup and a signal. An Igor stopped on a condition therefore stays up, takes nothing,
and is indistinguishable from a healthy Igor with an empty queue — for as long as nobody looks.

The condition record already exists by then. Nothing reads it from outside the loop.

## What Changes

**Scope follows the cure, and so does the answer.** The three scopes `condition-backoff` derives
are not one case and do not want one surface.

**Igor-scoped → `igor serve` exits non-zero.** The whole Igor can do nothing, and a service that
is *up and doing nothing* is the worst failure mode available because nothing watches for it. A
service that exits is a crash-looping service, which is a shape supervisors already have an
opinion about. It costs nothing to build.

**Role- or seat-scoped → reported, not exited.** The Igor is still able to do work the cure does
not govern, so exiting would throw away capacity that was never affected — the same argument
`condition-backoff` makes for keeping the stop as small as it can honestly be.

**A seat's stop is reported where the seat is reported.** `igor budget` already prints a line of
the seat's own for a credential it could not read, and `credential-breaker` ([#65](https://github.com/adamstallard/igor/pull/65))
adds a second for a credential the provider refused. A seat a condition has stopped is a third
state of the same question — whether this seat can be spent from — and belongs beside them.

**A role's stop is not a fact about a seat, and does not go in a budget report.** What it needs
is a reader who is asking *is anything stuck*, which no budget report has. The requirement here
pins the reader and the content — every open condition, listed by a command that needs no
argument and names no role, saying what would cure it and when the probe is due — and
`design.md` argues for `igor conditions` as the command that satisfies it.

**Exiting leans on the supervisor, and this repository's own recipes do not hold it up.** An exit
is a signal only where something escalates it and retries it on a sane cadence.
`deploy/igor.service` sets `Restart=always` with `RestartSec=30`: restarts thirty seconds apart
never reach systemd's start rate limit, so the unit never enters `failed`, nothing fires, and the
Igor restarts forever — this change's own failure mode one level out, at twenty times the
frequency of the ten-minute poll it replaced. Which shapes the exit assumes, and what an operator
must add where theirs is not one of them, has to be written down; `docs/deployment.md` is where
an operator looks.

**A restart must not be what stops a condition ever clearing.** `condition-backoff` clears a
condition by letting one probe item through after a cooldown. A process that exits on sight of an
open condition and is restarted by a supervisor never reaches that cooldown from inside a run, so
self-clearing would be dead on the one scope that exits. The exit is therefore conditional on the
cooldown: a process that starts with the cooldown passed takes the probe first and exits only if
the probe meets the condition again.

### Rejected: an issue in the destination

[#77](https://github.com/adamstallard/igor/pull/77), now closed. It pushes, which is its real
advantage over everything here. It was rejected because it costs a genuinely new concept — an
Igor authoring items, `universalSkip` taught about items an Igor wrote, `issues: write` on the
template — for one producer, and because once the quiet-proposal half takes its own answer
([#79](https://github.com/adamstallard/igor/issues/79)) that surface exists for nothing else. An
operations alert would also land in a work tracker whose readers are reviewers, which is the
wrong audience for it.

### Deferred, not rejected: a configured command hook

An `on_condition_command`, the same shape as a seat's `token_command`: the operator wires it to
whatever they actually page on. It is the push option that assumes no particular stack, and it is
the right thing to add **if** pull turns out not to be enough. What would bring it back is
evidence: an Igor found stopped on a role- or seat-scoped condition long after the fact, where the
listing and the budget line existed and nobody had run either. Deciding it on that beats deciding
it now.

## Capabilities

### Modified Capabilities

- `stuck-conditions`: an Igor-scoped condition exits the service rather than idling it; the probe
  survives the restarts that follow; the exit's dependency on the supervisor is stated; and every
  open condition is readable without naming a role. (Added to the capability `condition-backoff`
  creates — this change does not alter any requirement that change states.)
- `seat-budget`: a seat a condition has stopped reads as stopped, distinctly from a seat whose
  credential could not be read, one whose credential the provider refused, and one with no
  headroom.

## Impact

- Ends the state where a misconfigured Igor is up, silent, and indistinguishable from an idle
  one, for the scope where nothing it could be given would help.
- Makes an exit worth something on the deployments this repository ships, rather than assuming a
  supervisor that escalates.
- Costs a listing nobody reads until something is wrong, which is the accepted cost of pull.
- A role- or seat-scoped stop still requires somebody to look. Nothing here pushes, deliberately;
  the hook that would is deferred above with the evidence that would bring it back.
- Implementation lands in `src/serve.ts`, `src/cli.ts`, `src/budget.ts` and `docs/deployment.md`,
  all of which open pull requests also touch. It is sequenced behind `condition-backoff`, which
  produces the record every requirement here reads.

## Open question, deliberately not answered here

Whether the exit should be derived from what the process can actually do rather than from the
cure's scope. `igor serve` takes exactly one role and `deploy/igor.service` is a per-role
template, so a role-scoped stop leaves *that process* up and doing nothing — the failure mode
this change exists to end, arriving through the door it left open. The same question is the
issue's own: whether a seat-scoped stop should exit once every seat a role can draw on is
stopped. They are one question, and answering half of it would fix half of an inconsistency.

What settles it is the discriminator this change already relies on: a budget window reopens by
itself, a stopped scope needs a person. If that holds for a role-scoped stop as strongly as it
does for an Igor-scoped one, the exit is effect-derived and this requirement is modified rather
than extended. Deciding that wants the first operator report of an Igor silently idle on a
role-scoped stop, or a `serve` that runs more than one role — either makes the answer a
measurement rather than a preference.
