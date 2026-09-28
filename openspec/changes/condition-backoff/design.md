# Design notes

## Since review: an unread seat is probed, not run (2026-09-28)

Added 2026-09-28 on the branch of [#101](https://github.com/adamstallard/igor/pull/101), which
absorbs `credential-breaker`'s stop into the condition record. This change had no `design.md`, and
this note changes no requirement, scenario or task. It records how a decision made after review
bears on the credential condition, and one question for Adam.

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

**A revoked seat nobody has read opens no condition.** Once #143's gate two lands, a seat with no
unreset reading is never run. Its seat probe meets the 401, but a seat probe produces no handoff,
so it mints no `seat:<id>:credential` and the condition record never opens. The seat is out of
rotation with no reason given. A seat revoked after a reading is unaffected: it keeps that reading
until its window resets, its runs meet the 401, and the condition opens as specified here.

**The clearing probe for a seat condition could be the seat probe.** A credential condition
clears on a changed discriminator, or on a probe that does not meet it. For a seat-scoped
condition, #143's seat probe tests the credential without spending an item.

### Open, for Adam

**Should a seat probe that meets a 401 mint `seat:<id>:credential` into whichever record owns the
credential stop?** That is `credential-breaker`'s count over `executions.ndjson` today, and the
condition record here once this change's §4 is built. Recommendation: yes, with the fingerprint.
Also, let a seat probe that does not meet the 401 count as the clearing probe for a seat-scoped
credential condition. Both would be specified on #143, where the seat probe is. Neither changes
this change's requirements.
