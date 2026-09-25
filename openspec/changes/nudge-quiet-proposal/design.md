# Nudging once, and knowing that you already did

The surface is decided: a comment on the quiet proposal's own pull request
([#79](https://github.com/adamstallard/igor/issues/79), and the half of
[#77](https://github.com/adamstallard/igor/pull/77) that survived it). What is not decided by
that choice is how a run that reaches the same conclusion every time knows it has already
spoken, and this is where the design can quietly fail: not by being wrong on the first run, but
by being right on every run and so nudging forever.

## What the current fetch gives, and what it costs to ask for more

`PrState` (`src/github.ts:143`) is exactly the fields a page of the pull request list endpoint
carries: number, state, merged, merged by and at, `updatedAt`, `updatedAtInstant`, assignees,
url. **There is no comment in it, and no comment primitive anywhere in `src/github.ts`.** So
reading back whether we already nudged is not free, and the honest price is:

- **one `GET /repos/{repo}/issues/{n}/comments` per quiet proposal per run**, and
- **one `POST` to the same path** on the runs that speak.

The bound is narrow because the loop already orders its tests for exactly this reason: the
window is checked before `isProposal`, so an ordinary backlog of active proposals costs nothing
at all, and `isProposal` itself already costs one or two requests on each pull request that
reaches it. The comment read is asked for after `isProposal` says yes, so it falls only on pull
requests that are both past the window and actually proposals — the set that was about to be
reported anyway. A destination with no quiet proposals pays nothing new.

It is not free, and a destination that has let twenty proposals go quiet pays twenty extra
requests per merge. That is the cost of the surface; there is no cheaper way to read back a
record that lives on GitHub rather than in a file we keep.

## Recognizing our own nudge: a marker, not an author

The obvious test — was the comment written by us? — does not survive the two invocation paths.

- In `templates/reconcile-on-merge.yml` the comment is posted with `secrets.GITHUB_TOKEN` and is
  authored by the job's actor.
- A person running `igor-lore reconcile` posts with their own credential, and the comment is
  authored by **them** — plausibly by the assignee the nudge is addressed to.

`reconcile()` takes `(config, options)` and has no identity threaded into it at all; the adapter
has `identity()` (`src/adapter.ts:90`) and reconciliation does not use the adapter. So an author
test would need a new request per run to learn who we are, and would still be wrong: two runs
from two paths produce two authors and, on an author test, two nudges — precisely the case the
idempotence rule exists for.

So the nudge carries a **marker in its body**, and is recognized by that. The precedent is
`isStop(body, identity)` (`src/loop.ts:621`), which reads a person's intent off the text of a
comment rather than off its metadata.

This does sit beside `lore-review`'s rule that a proposal is recognized by the entry files it
adds and explicitly **not** by a branch-name convention. It is not in conflict, for the reason
#77 gave about its own marker: a lore proposal exists independently of Igor and a convention
would miss a hand-opened one, whereas a nudge has no existence apart from having been posted.
There is nothing underneath the marker to read instead. The corollary is the same too, and is
fine: edit the marker out and the next run nudges again.

Alternatives, rejected:

- **`gh api /user` once per run, then match the author.** Costs a request, still breaks across
  the two paths, and mistakes a nudge that a person's own run posted for that person replying.
- **A note in the state branch** saying which pull requests were nudged. This is the shape
  reconciliation deliberately does not use: it reads pull request state back rather than keeping
  a record of what it announced, because a lost or stale note desynchronizes from the thing it
  describes. Here the note would be strictly worse than the comment it describes, since the
  comment is visible and the note is not.

## The nudge is activity, and that is the trap

Posting a comment moves the pull request's `updated_at`. That is the field staleness is measured
from (`daysBetween(pr.updatedAt, now) < staleAfterDays`), so the consequences are immediate:

1. The run after a nudge sees a pull request that was "active today" and drops it from the report
   altogether — a proposal quiet for sixty days reads as fresh.
2. A window later it is quiet again, and the activity it went quiet from is **our own comment**.
   A rule that asked only "has there been activity since?" nudges again, and again, one comment
   per window forever. That is the muting defect this change exists to prevent, on a slower
   clock.

`deferred.ts` already documents this exact self-poisoning from the loop's side — "the handoff
comment itself lifts the item above the watermark, which is what makes it return" — and answers
it by refusing to count the Igor's own voice: `fingerprint` deliberately excludes the timestamp,
and `stillDeferred` holds while nobody but the Igor has spoken.

**The rule, stated so it can be checked:** with `nudgedAt` the timestamp of the newest comment
carrying the marker, nudge when there is no such comment, or when
`Date.parse(pr.updatedAtInstant) > Date.parse(nudgedAt)` and the window has elapsed.

It terminates by construction. No reply means `updatedAtInstant` never exceeds `nudgedAt`, so the
comparison stays false forever and one nudge is all there is. A reply moves it past, which starts
a new quiet spell that can earn exactly one more.

Compare against `updatedAtInstant` and never `updatedAt`: the latter is truncated to a day at
`src/github.ts:171`, and a day-truncated comparison against a comment posted the same day is a
coin flip. `updatedAtInstant` exists because that rounding was unsafe once already, in the
watermark.

**Two honest consequences.**

- *Anything* that moves `updated_at` re-arms the spell, including an edit to a comment, a label
  a bot applied, or a review from automation. The cost is bounded — one extra nudge, no sooner
  than a window later — and the alternative is enumerating what counts as a person acting, which
  the list endpoint cannot tell us anyway.
- The report must not take `pr.updatedAt` as the date the proposal went quiet once we have
  nudged it, or it will report the nudge back as the proposal's last activity. The quiet date
  therefore has to come from the nudge rather than from the pull request — the simplest form is
  for the nudge to say, in its text, the date it was quiet since, which the comment needs to say
  anyway to be readable on its own. The comment is then literally the record: it carries both
  the fact that we spoke and the thing we would otherwise have had to remember. An implementer
  who prefers to recover the date another way must still satisfy the requirement that the report
  never dates a proposal's quiet from our own comment.

## Why this is a `lore-review` delta rather than a new capability

`lore-review`'s in-force requirement "Reconciliation happens on invocation, not on a timer"
already carries both halves of what changes here: the quiet-proposal report, and "Reconciliation
MUST be idempotent over what it has already settled, because the merge-triggered job and a
person's local invocation sweep the same pull requests." The rule being added is that sentence's
own concern applied to a conclusion that is reported rather than settled.

The existing requirement is not modified. Its scenario says a quiet proposal "is reported with
its assignees and the store reviewers to escalate to" without saying where, and stdout still
does exactly that; nothing in it becomes false. The new material is additive, so it is `##
ADDED Requirements` and the old text is left alone rather than restated.

A new capability was the right answer in #77 only because the surface there had to serve two
producers with no spec in common — and that unification is what was rejected. Here there is one
producer, reconciliation, which `lore-review` owns end to end, and the nudge's content is a
restatement of the review contract that `lore-review` already requires the pull request body to
carry. Splitting it into its own capability would put half the quiet-proposal behavior in
another file for no gain.

## What the comment says, and why that is a requirement

The three endings are not interchangeable and the difference is not recoverable from the
gesture: merging approves, deleting a candidate's file and then merging rejects it permanently
and it is never proposed again, and closing without merging defers and leaves the candidates
eligible. `lore-review` already requires the pull request *body* to say this. The nudge repeats
it because the nudge is read by somebody who stopped reading this pull request weeks ago, and
because the moment somebody is being asked to clear a stale thing is the moment the nearest
gesture wins. "Please decide" plus a Close button is how a candidate gets deferred that should
have been rejected, or — far worse, being irreversible — rejected when it should have been
deferred.

That is why it is written as a requirement with scenarios rather than left to whoever writes the
string: the string is the whole of the feature, and there is nothing else in the change for a
test to hold on to.

## Permissions

`templates/reconcile-on-merge.yml` grants `contents: write` and `pull-requests: read`. Commenting
on a pull request is `POST /repos/{owner}/{repo}/issues/{number}/comments` — the issues endpoint,
addressed by the pull request's number — and for a pull request it is governed by the
`pull-requests` scope, so the template needs `pull-requests: write` and specifically **not**
`issues: write`. Verify that on the first deployment rather than trusting this paragraph: the
requirement that a failed nudge names the missing permission and fails the run exists so that
getting it wrong is loud.

## Left open

- **A proposal nobody ever answers is nudged exactly once.** That is the deliberate reading of
  "do not mute the surface", but it means a proposal can still rot, now with a single unanswered
  comment on it. The alternatives are a repeat interval much longer than the window, or nudging
  again only when the assignee set changes. Both add a knob, and nothing has been run.
- **A store reviewer who is not subscribed to the pull request is not reached.** The nudge names
  them; only an @mention would notify them, and `lore-review` forbids that for contributing
  authors on grounds that apply here too. Escalating past the assignees remains stdout's job.
