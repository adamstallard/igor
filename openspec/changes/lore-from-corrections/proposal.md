## Why

The richest lore an organization produces is somebody correcting an agent, and it is the only
source the agent itself witnesses. An Igor cannot do anything with it.

`lore-review` is deliberately agnostic about who writes a candidate — proposing "SHALL work on
any directory of candidate entries, whether mined or hand-authored". But nothing connects a
running Igor to that directory. `propose` is a command a person runs, the action space is
`comment`, `draft-pr` and the rest, and none of it produces an entry. So an Igor told "no, we
always use the shared hook for that" takes the correction, does the work, and forgets — and the
same correction is made again next week, to the same Igor.

That is a hole in the feature the whole system is named around.

**Depends on `directed-interaction`**, which is what makes an Igor addressable, and therefore
correctable.

## What Changes

**`propose-lore` joins the action space.** A closed set already, monotonic already: a role may
hold the action and narrow it away, and never grant itself one it did not inherit. An org that
wants Igors silent on lore simply omits it.

**A candidate goes to review, never to the store.** It is `provisional` until a person merges
it, so an Igor can only ask — and since a rejection is now durable, a bad suggestion costs one
review rather than a recurring one. That makes proposing safe by construction rather than by
trusting the proposer.

**The correcting person is the author, not the Igor.** They asserted the lesson; the Igor
noticed it. That matters mechanically as well as morally: candidates are grouped for review by
dominant author, so naming the person routes the candidate back to whoever can confirm they
meant it. Naming the Igor would route it to an account that cannot. It also keeps `support`
honest, since an Igor is not an independent assertion.

**Proposing is rare.** Not every correction — only one that recurs, or that contradicts
something the store already says. A single remark is a hypothesis, and an Igor proposing on
every one converts a useful signal into a queue nobody reads.

Explicitly out of scope:

- **Mining a correction for corroborating evidence.** Treating a remark as a search over
  higher-evidence sources is real and is `lore-from-reviews`'s design, not this.
- **Writing to the store directly.** There is no version of this that skips review, and the
  action's name says propose.
- **Corrections from parties without authority.** The write-access rule that governs
  instructions governs this; a stranger's assertion is not a signal.

## Capabilities

### Modified Capabilities

- `role-config`: `propose-lore` joins the closed `allow` vocabulary, monotonic like the rest.
- `task-execution`: an Igor may propose a candidate from a correction, attributed to the person
  who made it, and only where the correction recurs or contradicts the store.

## Impact

- Closes the loop between an Igor being taught and the team keeping what was taught.
- Adds the only path by which work produces lore without somebody remembering to write it.
- Spends reviewer attention, which is the scarce resource the `provisional` gate exists to
  protect — which is why the bar for proposing is recurrence rather than novelty.
