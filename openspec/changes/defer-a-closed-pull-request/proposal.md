# Defer a closed pull request

## Decisions

1. A pull request an Igor opened for an item, closed without being merged, defers that item, and
   the Igor asks on the item, once, what the close meant. *Rejected:* treating the close as a
   rejection, because a close does not say why and closing the item already says no; retrying,
   because the closed pull request's branch still holds the name a new one needs, so publishing
   fails, or else the Igor re-proposes what was just closed; and only checking for that branch
   name before the worker runs, because that answers whether the Igor *can* publish, not
   whether it *should* try again (`design.md`).
2. Only someone with write access to the repository, read as `permissions.push`, lifts any
   deferral, not only one from a closed pull request (task 4.3).
3. The question's wording is the one carried verbatim in task 3.1.

**Still open:**

- A writer's answer lifts the deferral, but the closed pull request is still in the item's
  timeline, so the next cycle finds the same close, asks again and defers again. Something has
  to mark a close as already asked about. One option counts a close only if it came after the
  last writer's answer, which needs the close time, and the timeline query does not fetch
  `closedAt` yet. Another records which pull request was asked about.
- Deferral records are pruned after 30 days or 500 entries (`src/deferred.ts`), and the modified
  requirement works an item again when its record is missing. Once a closed-pull-request
  deferral is pruned, the item is worked again with no writer having answered, which decision 1
  forbids, and the close is found and asked about a second time. Which rule wins?
- A restarted item publishes to the same `branchFor` name, so it meets the same
  `422 Reference already exists`. Delete the old branch, reuse it, or choose a new name?
- PR #173 (`pre-worker-breaker`) also defers items: its breaker sets an item down, and lifts that
  on any person's reply, or when another role's run on the item succeeds. That run is made by an
  App, which has no write access. Decision 2 says only a writer lifts any deferral. Is a breaker's
  set-down an exception?
- PR #216 (`lore-search`) lets anyone's reply answer a handoff. Whichever of this change and #216
  is archived second carries the other's text, and for #216 that means adopting the writer-only
  rule in its own requirement text, not copying blocks. The open `directed-interaction` change
  tests write access for whose instruction an Igor acts on, but its scenario for a question
  waiting on an answer still lets anyone's reply lift it.
- How the author of an edit is found. GraphQL's `userContentEdits` records body edits only. A
  retitle, a relabel and an assignee change are timeline events, each naming who made it. Nobody
  has checked that either source names the editor reliably, or said whether an edit with no
  named author lifts a deferral.
- Two processes of one role (`concurrent-instances`) triaging the same item in one cycle would
  both find the close and both ask. Triage skips an item another party has claimed, so where the
  close check runs relative to that skip decides whether an Igor asks on an item someone else
  holds.
- The timeline query reads the first 20 cross-references, so an Igor pull request beyond them is
  not seen.

## Why

A reviewer closing an Igor's pull request without merging is an ordinary event, and today it
starts a loop that spends on every cycle.

A closed pull request is not work in flight — only open ones count, correctly, since counting
closed ones would skip every item an Igor ever attempted. So the item is not screened. The next
cycle claims it and runs the worker. Then `produce` fails with `422 Reference already exists`,
because `branchFor` is deterministic — `igor/<role>/<number>-<title slug>` — and the closed pull
request left its branch behind. Every cycle, for as long as the item stays open.

Were the branch cleaned up, it would be worse in a different way: the Igor would re-propose the
work the reviewer had just closed, with nothing new to go on.

## What Changes

- **A pull request an Igor opened, closed without merging, defers its item.** It is not worked
  again until someone with write access answers.
- **The Igor says so on the item, and asks.** A close is ambiguous — wrong approach, not now,
  I'll do it myself, superseded — so it asks whether to try another approach or leave it, once,
  and waits. This is a handoff phrased as a question, which the open `directed-interaction`
  change proposes for ambiguity.
- **Only someone with write access can lift any deferral.** A deferral is what the requirement
  *"An item handed back is not re-worked until something answers"* calls suppression: the item is
  set down until someone answers. Today any comment or any edit lifts one. This change modifies
  that requirement to say only a writer's reply or edit does. PR #216 (`lore-search`) modifies the
  same requirement too. A modified block replaces the whole requirement when it is archived, so
  whichever of this change and #216 is archived second must first carry the other's text.

Closing the item itself stays the way to say no, and is untouched.

## Capabilities

### Modified Capabilities

- `work-triage`: an added requirement for a pull request closed without merging, and a modified
  *"An item handed back is not re-worked until something answers"*, where only someone with write
  access lifts a deferral.

## Impact

- `src/github-adapter.ts` — `inFlightFrom` already walks the item's timeline and passes over
  closed pull requests; the same data says whether one was the Igor's own and closed unmerged.
- `src/deferred.ts` — `stillDeferred` checks only that a comment is not the Igor's; it needs the
  author's access, and an edit's author from the edit history.
- The question's wording, carried verbatim in `tasks.md`.
