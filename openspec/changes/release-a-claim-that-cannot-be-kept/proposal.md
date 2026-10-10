# A claim that cannot be kept is given back, out loud

## What must be true

**A run that holds a claim and cannot go on releases it and says so on the item.** If the release
fails too, the message says the item is still held and names the one action that frees it. A
message saying the claim was released, on an item that still carries the Igor's name, would
mislead whoever reads it.

**When the tracker or host stops answering, the cycle stops.** A run that ends because the surface
did not answer is told apart from a refusal about the item, and two such runs in a row end the
cycle instead of trying the remaining items. Nothing about those items would change the outcome,
and refusing each one posts a comment on each. In a measured outage, refusing every item posted 24
comments over four cycles, where ending the cycle posted 6. At twenty items on a five-minute poll,
that volume is itself enough to trip GitHub's secondary rate limit, which caused that outage.

**A write returns what the surface recorded.** `report` and `release` return what the tracker
recorded, as `claim` already does, instead of only raising an error when something goes wrong. A
raised error cannot tell *this did not happen* from *this happened and the answer was lost*, and a
caller that needs the difference otherwise has to guess the tracker's state from a local flag.

## Why

`work-claiming` says how a claim is taken, verified, stood down from and stopped, but not what
happens when the run that took one cannot continue. `graceful-handoff` requires that an Igor never
goes silent on a claimed item, but no requirement says what claiming must do to achieve it. So each
place a run can fail after claiming needs this rule stated once, and three of them broke it:

- [#128](https://github.com/adamstallard/igor/issues/128): a throw out of `execute`;
- [#129](https://github.com/adamstallard/igor/issues/129): a failure inside `takeClaim`, after the
  claim is written but before it is announced or verified;
- `runItem`, which has no handler: when a tree cannot be provisioned, the item stays assigned and
  announced, and only a cycle-level error is logged.

Two of the three come from `report` and `release` signalling failure only by raising an error.
