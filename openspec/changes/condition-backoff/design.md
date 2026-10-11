# Design notes

## Since review: an unread seat is probed, not run (2026-09-28)

Added 2026-09-28 on the branch of [#101](https://github.com/adamstallard/igor/pull/101), which
absorbs `credential-breaker`'s stop into this change's conditions. This change had no `design.md`,
and this note changes no requirement, scenario or task. It records how a decision made after review
bears on the credential condition, and how Adam settled the question it raised, the same day.

### The decision

Adam decided on 2026-09-28 that a seat's reserve is a line that moves toward the reset, checked
against the seat's latest unreset reading of each window
([`docs/architecture.md` §6.3.4](../../../docs/architecture.md#634-a-seats-reserve-is-a-line-that-moves-toward-the-reset--decided-2026-09-28-specified-on-143-not-built)).
The line is `1 − r × remaining` with `r = max(seat reserve, role reserve)`, since a role file may
also set its own reserve. It replaces the dollar bound as the gate. A seat with no unreset reading
is not admitted: a *seat probe* on the Igor server reads it first, with one minimal call on the
seat's own token. It is specified on [#143](https://github.com/adamstallard/igor/pull/143) and not
built.

### What it does to this change

**Two different things are called a probe.** Here, the probe is the next item a stopped scope is
allowed after its cooldown. #143's seat probe is a minimal model call that spends no item. They
are separate mechanisms, and nothing yet connects them.

**A revoked seat nobody has read would open no condition.** Once #143's gate two lands, a seat with no
unreset reading is never run. Its seat probe meets the 401, but a seat probe produces no handoff,
so without the decision below it would mint no `seat:<id>:credential`, the condition would
never open, and the seat would be out of rotation with no reason given. A seat revoked after a reading is unaffected: it keeps that reading
until its window resets, its runs meet the 401, and the condition opens as specified here.

**The clearing probe for a seat condition is the seat probe (decided below).** A credential condition
clears on a changed discriminator, or on a probe that does not meet it. For a seat-scoped
condition, #143's seat probe tests the credential without spending an item.

### Decided (Adam, 2026-09-28): a seat probe opens and clears the credential condition

**A seat probe that gets a 401 opens `seat:<id>:credential`, and a seat probe that succeeds counts
as the clearing check.** It is specified on [#143](https://github.com/adamstallard/igor/pull/143),
where the seat probe is. This change's conditions own that stop, so the seat probe opens and clears
it there; `credential-breaker` is folded into this change (*Folded in from #65*, below).

For this change that means a seat-scoped credential condition clears without spending an item: the
seat probe is its clearing probe. Nothing in this change's requirements has to change for it. The
requirement already says a credential condition clears on a probe that does not meet it, and on
the credential changing. What is new is only which mechanism the probe is, and #143 specifies it.

## Folded in from #65 (Adam, 2026-10-11)

**#65's credential breaker is folded into this change instead of merging.** Adam decided this on
2026-10-11, since nobody runs Igor yet and two mechanisms owning one stop would be reviewed,
built and then reconciled. This change's conditions are the only owner of the credential
stop. #65's code and tests are the starting point for its credential case (task 4.5).

**What this change already covered.** Counting per seat rather than per role (a condition's scope
is its cure's scope), a sequence that a successful run ends rather than a total (a condition
clears by not recurring), clearing at once on a replaced credential (the discriminator), and one
run after a growing cooldown (the probe).

**What it takes from #65**, now in the spec's two credential requirements: recognising a refusal
by the provider's authentication-error status only, on a run that did not finish; the full hash
as the discriminator, ambient credentials included; passing a stopped seat over before its
headroom is checked, whatever it reads; reporting a refused credential apart from an unreadable
one; and no command that clears a condition. The cooldown's ceiling is in the constants
requirement.

**What it leaves behind:** `credentialBreaker`'s own trailing count, `BREAKER_TRIP_AFTER` and its
cooldown, which the condition's count, rebuilt from the log, and its threshold and cooldown replace.
Their values are the starting point for task 6.2: a threshold of 3, because one refusal trips on a
blip, two can be coincidence, and three items is a tolerable cost against holding a working seat
out; and a cooldown of 15 minutes doubling to 6 hours, because a revoked credential can stay revoked
for days, where a fixed hour spends twenty-four items a day and doubling spends about six in total.

**Decided (Adam, 2026-10-11): no stored record.** #65 derived its count from
`executions.ndjson` and rejected a separate store, because a summary beside a log can disagree
with it. That holds here too, so a condition is rebuilt from the same log: from run rows carrying
its cure key, and from condition rows appended for what no run shows. The one such row the spec
needs is a probe being taken, so a second Igor waits rather than taking a probe item of its own.
Rows that are not runs carry a `kind`, and readers that count runs skip them (task 2.3).

Two facts from #65 that the spec does not carry:

- **A signed-in login the environment does not carry is not named.** A seat relying on a
  `~/.claude` login under the forwarded `HOME`, with no token in its environment, has no credential
  Igor can hash. Such a seat can be told its credential was refused, but no condition can be held
  against it.
- **A documented signal exists beside the 401.** The CLI's `system/api_retry` stream event carries
  an `error` category such as `authentication_failed`, `account_on_hold` or `billing_error`
  ([headless docs, *Handle API retries*](https://code.claude.com/docs/en/headless#handle-api-retries)).
  Workers receive it and Igor discards it. It is sent only before a retry, so a refusal that is not
  retried never produces one, and it cannot be the only signal.
