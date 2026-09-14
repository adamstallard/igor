## Why

An Igor comments on issues people are already working, and does it again every cycle.

Nothing filters candidates on who holds them. Not the query, which is deliberately loose. Not
the lane predicates. Not triage, whose item prompt does not include assignees, so the model
cannot see the item is taken even in principle. So an issue Alice is working reaches a claim:
the Igor assigns itself, comments "picked this up and is working on it", settles, stands down,
releases.

Then its own comment bumps the item's `updatedAt` past the watermark, so the item looks fresh
next cycle and it happens again. Nothing records that the item was already declined.

Alice gets a claim-and-retract on her issue every poll interval, forever. It is the most
visible misfire available — noise aimed precisely at the people the claim protocol exists to
reassure — and running several processes multiplies it.

## What Changes

**An item held by anyone else is skipped, universally.** Alongside closed and work-in-flight,
and for the same reason: acting on work that is visibly someone else's is not an organizational
preference, so it is not a lane an org can forget to write. It costs nothing and stops the
cycle before any claim is attempted.

**An item the Igor itself holds is not skipped.** A claim with nothing in flight behind it is a
claim a dead process left, and re-taking it is how that recovers.

**An item handed back is not re-worked until something answers.** A handoff releases the claim
and leaves no pull request, so nothing downstream stops the item returning — and the handoff
comment itself moves the timestamp past the watermark, which is what makes it return. The
outcome is recorded, and lifted by a reply from anyone else or by an edit to the item.

Explicitly out of scope:

- **Putting `no:assignee` in the recommended query.** That pushes a correctness rule into
  configuration an org can forget, and the rule holds regardless of how the query is written.
- **Suppressing the claim comment.** The comment is right; claiming an item somebody else holds
  is what is wrong.

## Capabilities

### Modified Capabilities

- `work-triage`: a third universal skip — an item held by another party — and a requirement that
  an item handed back is not re-worked while nothing has answered it.

## Impact

- Removes a class of noise that reaches humans directly, on the surface they work in.
- Makes the stand-down path rare again. It is currently normal operation rather than a
  settle-window race, which is not what the settle interval was designed for.
- Interacts with concurrency: the skip is what keeps several processes from each discovering and
  claiming an item a human already holds.
