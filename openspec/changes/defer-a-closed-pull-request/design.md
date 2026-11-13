# Design

## Found at triage, from data already fetched

Nothing re-reads an Igor's pull request after it publishes: the completion action releases the
claim, and catch-up visits only pull requests that stopped merging. So a close has to be found
from the item's side, and it can be without a new request — `inFlightFrom` already walks each
candidate's timeline to find an open pull request, and passes over closed ones on the way. A
closed, unmerged one whose author is this Igor is visible in the same nodes.

## Deferred, not rejected

**Not a rejection**, because a close does not say why. Closing the item is the unambiguous "no",
and it already works: the item leaves discovery.

**Not retried either**, because retrying with nothing new either fails on the branch left behind
or re-proposes what was just closed. Both spend a worker run to reach an outcome the Igor could
have predicted.

The deferral record is the existing mechanism for exactly this — *wait until somebody says
something new* — so a closed pull request enters it, and needs no screen of its own.

## Asked once

The question is posted the first time the close is found, and not again while the item stays
deferred. The deferral record is what makes that true without a separate flag: a deferred item
is not a candidate, so it is not reconsidered, so it is not asked about twice.

## Rejected: fixing only the branch collision

Checking before the worker runs whether `branchFor` is already taken would make the loop fail
without spending. It would still fail every cycle, and it answers a different question — whether
the Igor *can* publish — from the one a close raises, which is whether it *should* try again.
