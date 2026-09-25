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

**The exit follows what is left, and it is detected rather than inferred.** Where the conditions
open against a process leave it no item it could take, `igor serve` exits non-zero. Where they
leave it work the cure does not govern, it keeps running and the stop is reported. Which of the
two it is is established from the cure keys and the seats the role can spend from — a cure key
*is* its scope — rather than read off the scope's derivation.

That covers all three scopes without deciding any of them in advance. A condition naming the
Igor's own credential leaves nothing. A condition stopping the role a process serves leaves that
process nothing, whatever it leaves the fleet. A stopped seat leaves it nothing only where every
seat that role could spend from is stopped, which is the issue's own open question — "once every
seat is stopped" is a pool with no usable seat left, and the same check answers it.

**Only stopped scopes count toward "nothing left".** A seat with no headroom, an unreset window,
a role held back by pacing are none of them this. The discriminator is who ends the wait: a budget
window reopens on its own clock, a stopped scope waits for a person who has not been told. Written
into the requirement rather than left in the reasoning, because an implementer who folds budget
into the check gets an `igor serve` that exits on every session limit — a crash loop on a state
every Igor reaches in normal use, spending the signal exactly where it means nothing.

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
self-clearing would be dead wherever the exit applies. The exit is therefore conditional on the
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

- `stuck-conditions`: conditions that leave a process no work exit the service rather than idling
  it; the probe survives the restarts that follow; the exit's dependency on the supervisor is stated; and every
  open condition is readable without naming a role. (Added to the capability `condition-backoff`
  creates — this change does not alter any requirement that change states.)
- `seat-budget`: a seat a condition has stopped reads as stopped, distinctly from a seat whose
  credential could not be read, one whose credential the provider refused, and one with no
  headroom.

## Impact

- Ends the state where a misconfigured Igor is up, silent, and indistinguishable from an idle
  one, wherever nothing that Igor could be given would help.
- Makes an exit worth something on the deployments this repository ships, rather than assuming a
  supervisor that escalates.
- Costs a listing nobody reads until something is wrong, which is the accepted cost of pull.
- A stop that still leaves the Igor work requires somebody to look. Nothing here pushes, deliberately;
  the hook that would is deferred above with the evidence that would bring it back.
- Implementation lands in `src/serve.ts`, `src/cli.ts`, `src/budget.ts` and `docs/deployment.md`,
  all of which open pull requests also touch. It is sequenced behind `condition-backoff`, which
  produces the record every requirement here reads.

## The question this settles, and the one it leaves

**Settled: the exit is derived from what is left, not from the cure's scope.** The scope-derived
reading was written first and does not survive contact with the shapes this repository ships.
`igor serve` takes exactly one role and `deploy/igor.service` is a per-role template, so a
role-scoped stop leaves *that* process up and doing nothing — the failure mode this change exists
to end, arriving through the door a scope-derived rule leaves open. The seat side of the same
question, an entire pool stopped, is the same omission from the other end. Detecting what is left
answers both with one rule and needs no new field: the cure key is the scope, and the seats a role
can spend from are already resolvable where a seat is chosen.

Not re-derived per process shape, though — the rule is *detect*, not *assume `serve` runs one
role*. A `serve` that later runs several roles satisfies it unchanged: it exits when nothing it
serves can take an item, and not before.

**Left open: whether a credential the provider refused belongs in the same determination.** It
waits for a person exactly as a stopped scope does, which is the argument for folding it in. It is
a different mechanism with its own hold, its own cooldown and its own reporting line, and it is
still an open pull request ([#65](https://github.com/adamstallard/igor/pull/65)). Merging the two
is a decision about whether there is one "this cannot proceed until somebody acts" state or two,
and it is not this change's to make.
