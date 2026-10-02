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
  and waits. This is a handoff phrased as a question, which `directed-interaction` already
  establishes for ambiguity.
- **Only someone with write access can lift any deferral.** Today any comment or any edit lifts
  one. That rule is carried in `condition-backoff`'s existing modification of *"An item handed
  back is not re-worked until something answers"*, not in this change: that requirement already
  has one pending modification, and a second would silently drop the other's text when both
  archive. This change depends on it.

Closing the item itself stays the way to say no, and is untouched.

## Capabilities

### Modified Capabilities

- `work-triage`: an added requirement for a pull request closed without merging.

## Impact

- `src/github-adapter.ts` — `inFlightFrom` already walks the item's timeline and passes over
  closed pull requests; the same data says whether one was the Igor's own and closed unmerged.
- `src/deferred.ts` — `stillDeferred` checks only that a comment is not the Igor's; it needs the
  author's access, and an edit's author from the edit history.
- The question's wording, carried verbatim in `tasks.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
