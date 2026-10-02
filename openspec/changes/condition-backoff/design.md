# Design notes

## Since review: an unread seat is probed, not run (2026-09-28)

Added 2026-09-28 on the branch of [#101](https://github.com/adamstallard/igor/pull/101), which
absorbs `credential-breaker`'s stop into the condition record. This change had no `design.md`, and
this note changes no requirement, scenario or task. It records how a decision made after review
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
so without the decision below it would mint no `seat:<id>:credential`, the condition record would
never open, and the seat would be out of rotation with no reason given. A seat revoked after a reading is unaffected: it keeps that reading
until its window resets, its runs meet the 401, and the condition opens as specified here.

**The clearing probe for a seat condition is the seat probe (decided below).** A credential condition
clears on a changed discriminator, or on a probe that does not meet it. For a seat-scoped
condition, #143's seat probe tests the credential without spending an item.

### Decided (Adam, 2026-09-28): a seat probe opens and clears the credential condition

**A seat probe that gets a 401 opens `seat:<id>:credential`, and a seat probe that succeeds counts
as the clearing check.** It is specified on [#143](https://github.com/adamstallard/igor/pull/143),
where the seat probe is. Once this change's §4 is built, the condition record owns that stop, so
the seat probe opens and clears it there. Until then it goes into `credential-breaker`'s count.

For this change that means a seat-scoped credential condition clears without spending an item: the
seat probe is its clearing probe. Nothing in this change's requirements has to change for it. The
requirement already says a credential condition clears on a probe that does not meet it, and on
the credential changing. What is new is only which mechanism the probe is, and #143 specifies it.
