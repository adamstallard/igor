## Why

Igor concludes things only a person can act on, at moments when no person is in the loop.

`reconcile` finds an open proposal that has gone quiet past the window and prints it with its
assignees and the store `reviewers` to escalate to. At a terminal that is the right surface:
somebody typed the command and is reading the output. Once reconciliation runs in the
destination's merge-triggered job (`templates/reconcile-on-merge.yml`), the same sentence goes
to a job log for a run that succeeded. Nobody opens the log of a green run. The report is
correct and a proposal can sit quiet indefinitely.

`condition-backoff` produces the same shape from the other end and says so: reporting an open
condition anywhere but the cycle record is out of its scope, and "a fleet stopped on one cure
key is a strong signal and nothing currently surfaces it." Answering the two separately would
give an operator two places to watch, which is the same as none.

So there is one question, and it has a prior one inside it: **does Igor open items of its own?**
Until now it has only ever consumed them — claiming, commenting, handing back, opening pull
requests — and every surface it writes to is one somebody else created. Three of the four
candidates in [#50](https://github.com/adamstallard/igor/issues/50) exist to avoid answering
that, and each of them buys the avoidance by being a surface nobody is subscribed to. This
change answers it: yes, and only for this.

## What Changes

**An escalation is an issue in the destination, assigned to a person.** One surface, one
subscription — a repository's issue list, which already notifies, already assigns, and already
has a lifecycle a person can end. Both producers raise onto it: a quiet proposal names its pull
request, a stopped scope names its cure key. The other three candidates are rejected in
`design.md`; briefly, a comment on the quiet pull request cannot carry a stopped scope, which
has no pull request to comment on; a job step summary is stdout one click deeper, and the loop
does not run in Actions at all; a file committed to the store is where a stopped scope already
is, which is the defect.

**An open escalation is the record that it has already been said.** The producer runs on every
merge and every poll and concludes the same thing every time. Before raising, it looks for an
open escalation carrying the same subject and says nothing further where one exists. There is
no new bookkeeping: the issue's own state is the record, the way a pull request's own state is
already what `reconcile` reads back rather than a file saying what it did.

**Closing is the answer, and a closed escalation stays closed.** `stillDeferred` reads a reply
from anybody other than the Igor as the answer, and never asks for a signal shaped for it. An
escalation follows that: a person closing it has said "seen", and the same unchanged fact
raises nothing again, ever. Re-announcing is how a surface gets muted, and a muted surface is
the defect this change exists to fix. A second escalation follows only from the subject having
changed and gone wrong again — the `fingerprint` shape, applied to the subject rather than to
an item.

**A subject is an occurrence, not a thing.** A cure key opens, clears and reopens over its
life, so keying on the cure alone would match a closed escalation from last time and stay
silent while a fleet sat stopped. A quiet proposal's subject carries the activity it went quiet
from; a condition's carries that occurrence's opening. An escalation follows the *condition's*
open state, not a probe's, so a scope that probes and stops repeatedly has one escalation.

**Igor closes what it raised, once the subject resolves**, so an open escalation means
something is still waiting and the list is worth reading.

**`lore-review` is not modified.** Its promise that a quiet proposal "is reported with its
assignees and the store reviewers to escalate to" stays exactly as written, because it is not
wrong — whoever typed `reconcile` at a terminal is present, and stdout is the right surface for
them. It is incomplete, and only when nobody typed anything. The escalation is raised from the
same finding rather than in place of the report.

**An escalation is not work, by what it is.** The tempting guard is assignment, since
`universalSkip` already skips an item held by somebody else — but `reviewers` is optional and
defaults to empty, which `src/cli.ts` already reports as a state it expects, so unassigned is
the default rather than the edge case. An escalation is therefore excluded as an escalation,
alongside closed, in flight and held, and assignment does only the job it can do: naming who is
subscribed. Who was actually assigned is read back and reported, on the precedent `lore-review`
sets.

**An escalation that cannot be raised is said out loud.** The template grants
`pull-requests: read` and no `issues: write`, so the first deployment of this fails; a
destination may have issues disabled entirely. A producer that cannot raise reports the failure
and does not treat the conclusion as delivered — and still finishes the promotions and
rejections it owes, which are not waiting on a message to a person.

Explicitly out of scope:

- **A separate audience for a stopped scope.** The store-level `reviewers` is the only
  configured list of people who own the destination, so it is the audience for both producers,
  provisionally. Whether a stuck fleet is owed a different list from a stuck lore claim is a
  question about how teams run Igor, and no team has run one yet.
- **Escalating anywhere but the destination.** An item may come from a source repository
  Igor does not own. The escalation goes where Igor already writes.
- **Any third producer.** Two concluders exist; the surface is defined by what they need.
- **Igor opening items for anything else.** Opening an item as *work* — filing a bug it
  noticed — is a different act with a different failure mode, and this change does not
  authorize it.

## Capabilities

### New Capabilities

- `escalation`: raising a conclusion no one is present for as an assigned issue in the
  destination, at most one open per subject, closed by whoever answers or by the subject
  resolving, and never claimable as work.

## Impact

- A quiet proposal and a stopped scope become visible in one list, to people who are notified
  rather than people who remember to look.
- `templates/reconcile-on-merge.yml` needs `issues: write`; without it the job reports a
  failure to escalate on every merge, which is loud but correct.
- Igor becomes an author of items in the destination. Nothing today excludes an item by its
  author, and assignment cannot stand in for it, so `universalSkip` gains a case — the first
  time the loop is taught about an item Igor itself wrote.
- An operator who closes an escalation without curing anything gets silence, deliberately.
  The alternative is a surface they mute, which is worse and harder to detect. Silence is
  narrower than it sounds: closing while also nudging the pull request re-arms the subject, so
  it escalates again when it next goes quiet.
