## Why

A seat whose token the provider has revoked is chosen every cycle, claims an item, fails on it,
and does the same to a fresh item next cycle. Before [#37](https://github.com/adamstallard/igor/issues/37)
it was passed over for being unreadable; the derived path now bounds it and lets it run, which
is the right call for the seat it was built for and the wrong one here.

Nothing local separates the two. Measured against the real CLI: `claude -p '/usage'` exits 0
whatever the credential is, and `claude auth status` reports `authMethod: oauth_token` with no
`subscriptionType` for a valid `setup-token` **and** for the literal string `garbage`. So
`hasSubscription` cannot tell them apart, the seat is marked unmeasurable, and it is bounded and
spent from.

`capacity-from-observation` sanctions that — a seat is *"bounded by observation and record rather
than passed over on that ground alone"* — and its stated remedy does not reach this case. *"Its
first limit error is its first calibration point"* assumes a limit error, and an authentication
failure carries no `percentUsed` to calibrate anything with. Nothing in force says what happens
to a seat the provider refuses. Analysis in
[#56](https://github.com/adamstallard/igor/issues/56).

## What Changes

**The provider's own verdict is the signal.** A run refused for credentials comes back with
`api_error_status: 401` and `terminal_reason: "api_error"` — structured fields, so nothing is
inferred from prose, which is the rule
[#41](https://github.com/adamstallard/igor/issues/41) and
[#48](https://github.com/adamstallard/igor/issues/48) set. It is deliberately not a member of
`limitSignals`: a limit and a refused credential want opposite responses, and reading one as the
other would park items over an auth failure and record a capacity observation at 100% off it.

**A cure key, `seat:<id>:credential`.** Being a cure key it already keeps the item out of the
deferral store, which is right — the item was never the problem — and it already reaches the
handoff, which names what a person would change.

**A fingerprint, so "fixed" is a fact rather than a claim.** The row carries a full SHA-256 of
the credential the run used, taken where the token resolves and nowhere else. `executions.ndjson`
is committed to the destination, so it is published: a full digest of a high-entropy secret
discloses nothing, where a prefix or a suffix is credential material itself.

**The breaker is derived, not stored.** Group the execution log by seat and count trailing rows
carrying that key whose fingerprint matches the credential resolving now. No second store, no
write path to keep in sync, and no state that can disagree with the log it came from.

**It clears on the natural act.** A replaced credential is always a new string, so a different
fingerprint resolving is the reversal signal — following `stillDeferred`, where the reversal is
the act itself rather than a claim about it. There is no reset command: one would clear the
breaker for an operator who believed they had fixed the token and had not, and the next three
items would pay for the belief.

**Half-open covers what classification cannot.** After a cooldown one run goes through; a success
ends the trailing run and a rejection lengthens the next wait. That is what recovers a transient
provider outage with nobody watching, and why perfect recognition of the 401 is not required.

**`igor budget --credentials` reports it.** Which credential resolves, how many runs the provider
refused it on, when one is let through. It reports and does not reset.

Provisional constants, marked as such in the code the way `token_command`'s timeout is:

- **N = 3.** The unit of cost is a burned item, so N is the price of being sure. One trips on a
  blip, two can be coincidence, three items is a tolerable one-off against a working seat held
  back wrongly.
- **15m → 30m → 1h → 2h → 4h, capped at 6h**, not a fixed wait. The state being detected persists
  for days: a fixed hour burns twenty-four items a day indefinitely, where doubling burns about
  six in total and still clears a fifteen-minute outage.

Explicitly out of scope:

- **Recognising a spent window.** `usageLimit` and the refusal capture are unchanged, and the 401
  stays out of `limitSignals` for the reason above.
- **Fitting the constants.** No breaker has tripped yet, and anything fitted now is fitted to
  nothing. They are marked provisional and revisited once one has.
- **Reporting it as a window state.** A refused credential is true of the seat, not of a window,
  and it is reported on a line of the seat's own — see the design.

## Capabilities

### Modified Capabilities

- `seat-budget`: a seat whose credential the provider refuses is taken out of rotation after a
  bounded number of refusals and returns when a different credential resolves; the execution log
  records which credential a refusal was of, hashed; reporting distinguishes a credential this
  machine could not read from one the provider read and refused.

## Impact

- A revoked token costs three items rather than one per cycle indefinitely.
- `executions.ndjson` gains two optional fields, both only on rows that carry the cure key.
  Readers that ignore unknown fields are unaffected.
- `SeatVerdict` gains `rejected`, which every switch over it already has a case for. A pool whose
  seats were all refused hands off saying so, rather than saying the budget is used up (#49) or
  that nothing could be read.
- A seat held by the breaker is spendable again the moment a different credential resolves, with
  no command to run and nothing to remember to undo.
