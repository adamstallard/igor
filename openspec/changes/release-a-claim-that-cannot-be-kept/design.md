# Design

## Where the enforcement point goes

Three sites had the same defect and were fixed separately. The question this change had to answer
is whether to keep doing that.

**Guarding each call** is what produced three issues. The same lesson is argued in `undone()`'s
docstring on [#103](https://github.com/adamstallard/igor/pull/103) — *a guard written per route is
a guard that misses the next one*, about a comparison rather than a claim, and **not yet merged** —
and this is that failure at one altitude up: the rule was enforced per call site while the
requirement was about a state.

**Guarding the window** inside `takeClaim` is right for the claim itself, because only that
function knows whether the assignment landed before the announcement did. It does not reach the
run around it.

**Guarding the run** is what closes the class: everything after the claim is held runs inside one
handler, which hands the claim back the way any other failure does. That subsumes the checkpoint
and completion escapes without naming them, which is the property a route-by-route guard lacks.

The body was **extracted rather than indented**. Wrapping it in place would have re-indented some
140 lines and turned a reviewable diff into a reformat — and it reads better named: the extracted
function is the phase that runs under a held claim, which is exactly the thing the handler is
about.

## Refused, not handed off

A surface failure returns `refused` rather than `handed-off`, although a handoff is what is
posted. `shouldDefer` treats a `handed-off` run with a `failure` reason and no cures as a
deferral, and a deferral parks the item until something answers on it. Nothing about the item
produced a tracker outage, so parking it would suppress work for a reason that was never about it.

## Why the cycle stops

Converting a throw into a per-item refusal removed something that was never the point of the
throw: `serve` abandoned the cycle. Measured, with the Igor's own writes bumping `updatedAt` so
the watermark does not bound it — 24 comments over four cycles against 6 for the frozen control.
Two comments per item per poll, indefinitely, and at twenty items on a five-minute poll that
volume is itself what trips the secondary rate limit that caused the outage.

So the run carries whether its cause was the surface, and the cycle breaks on it. Per-item
visibility is kept, which is better than the throw gave: each refusal prints its own reason.

**Rejected: inferring it in `serve`.** It cannot be inferred — a claim the tracker declined to
record is also a refusal, and that one is about the item and must not stop the cycle.

## Counting, because the flag says less than it looks like it says

`surfaceFailed` is set by `runItem`'s outer handler on **every** throw it catches, including ones
that are entirely about the item: a branch an earlier run orphaned makes `codeHost.produce` fail
`422 Reference already exists` on that item and no other, deterministically. Breaking on the
first one therefore ended every cycle for as long as such an item existed — the opposite of what
"a refusal about the item does not stop the cycle" requires.

**The second consecutive one ends the cycle; one on its own does not.** How many items a fault
affects is the one distinction available: an outage fails every item, a bad item fails one. The
counter is per cycle and resets on any run that is not a surface failure, so a wedged item cannot
accumulate a stop across a healthy cycle. Only the abandonment counts as a cycle failure and
emits `cycle-failed`.

**Rejected: keeping break-on-first and narrowing the flag instead.** Narrowing needs the
item-versus-surface distinction the section below records as unavailable, so it trades a bounded
cost — one extra item attempted per cycle during a real outage — for a distinction nothing can
draw.

**Measured against the counter, and it does not cover everything.** A surface whose *release*
call alone is failing is invisible to it: `handOff` swallows that throw and returns
`released: false` without `surfaceFailed`, so a pool alternating published items with handed-off
ones resets the counter on every other item and never reaches two. Observed on a pool of six with
the unassign endpoint down: six items claimed, a worker spent on each, `failures: 0`, and no
`cycle-failed`. Break-on-first caught that shape on the first item. The counter is still the
better trade for the fault it was written for — the wedged item — and this shape is recorded
rather than patched over, because widening `surfaceFailed` to cover a swallowed release would
also mark item faults as the surface's.

## Why the write contract widened

The two bugs that got furthest were both a caller guessing what a write did from whether it threw.
A flag set after an `await` recorded *this process saw it succeed*, not *it may be on the item*;
a reason asserted a release that had not happened.

`claim` never had this problem, because it returns what the surface recorded. Extending the same
discipline to `report` and `release` makes *unknown* representable instead of collapsing it into a
throw. An answer that does not carry the assignees reads as **not clear**, deliberately: claiming
a release that did not happen leaves an item held with nobody told, while reporting a release that
did happen as stuck costs one person one unassign on an item nobody holds.

## What the run reached, and what it does not tell you

The handler holds a `reached.result`, filled the moment `execute` returns, so a throw after the
work still composes its handoff from what the run actually did. Without it the completion
action — an unassign, so the last call of a wholly successful run is a release — turns a tracker
503 into "the work never started" posted beside a live pull request, with the artifact linked
nowhere and the spend reported as zero.

**Rejected: reading that same holder as *item versus surface*.** It is the obvious next use and it
does not work. `codeHost.produce` is called inside `execute`, so a `422 Reference already exists`
from a branch a previous run left behind throws before there is a result — the holder is empty for
the item-specific fault it would need to catch. And it is full for the tracker 503 above, which is
a surface fault. It discriminates, but on the wrong axis: *how far the run got*, not *whose fault
it was*. The lesson stops there — the holder is right for composing the handoff, which is what it
is for.

**Rejected: an HTTP status table** — 4xx as the item's fault, 5xx and 429 as the surface's. That is
the guard-per-route failure quoted above, one layer
down: the next status code falls through it. Telling the two apart needs a distinction the adapters
do not currently draw, which is why `surfaceFailed` is still unconditional in that handler, and why
`serve` counts the flag rather than trusting any one instance of it.

## Where the correction is posted, and who posts it

`stillAssigned()` is a clause appended to a sentence that already claimed the release, so it has
to follow that sentence. The rule is *after the claim it answers*, not *last on the item* —
nothing else posted afterwards asserts a release, so nothing else can make it false again.

Only `handOff` owns the sentence it corrects. The stand-down does not: the stop receipt is posted
by `runItem` *after* `takeClaim` returns, so a correction written inside `takeClaim` stands above
the claim it answers and leaves "released this" as the last word on the item. `takeClaim`
therefore reports `releaseStuck` and `runItem` posts after its own receipt.

**Rejected: releasing before the receipt in `runItem` instead**, so the receipt could be composed
truthfully. `runItem` already releases there, and the release is not the part that is unknown —
the receipt's wording is fixed and approved, and a second wording for the stuck case is a second
sentence to keep correct.

A `lost` stand-down is the exception and stays in `takeClaim`: nobody posts anything on that
path, so `stoodDownStuck()` is standalone rather than a correction and has nothing to follow.

**`handOff` corrects unconditionally.** Gating on whether the handoff posted asks a question the
process cannot answer — a surface can accept the write and throw on the way home, which is why
`takeClaim` sets `announced` before its call rather than after. Where nothing landed the sentence
still stands on its own: the item is held, and saying so is true whether or not anybody read a
handoff first. `complete()` already posts it with no antecedent at all — it owns no sentence,
because a run that published asserted nothing about the release before this one.

**Measured cost of dropping the guard:** one failing `report` call per handed-off item, where the
surface took the claim message and had stopped answering by the handoff. A surface refusing
everything costs nothing extra — the claim message fails inside `takeClaim`'s window, the run is
refused there and `handOff` is never entered — so the cost is confined to an outage that begins
mid-run. No cheaper variant exists: the flag the guard read cannot answer the question it was
being asked.

**Measured exception, on the catch-up path.** `catchUpItem` posts `resolvedNote` /
`broughtCurrentNote` *after* `runItem` returns, so on a conflict resolved into a published
artifact whose completion unassign did not clear, the correction sits one comment above that
note rather than at the foot of the item. It is still after the only sentence that claimed a
release — there is none on that path — so the requirement holds and the reader's last line is a
true one. What they lose is the correction being the thing they end on.

## Deciding by what a retry would cost

The handler first returned `refused` for every throw, so a wedged item came back next cycle and
the worker ran again to reach the same failure. The distinction the earlier drafts reached for —
whether a throw was the surface's fault or the item's — is not answerable from here, as the
counter's section records. **What a retry would cost is.** A throw before the worker ran is cheap
to retry, and most of an outage lands there, so the item is refused and tried again. A throw
after it ran would spend the whole worker again, so the item is handed off and waits in the
deferral record until someone with write access answers — and that includes an outage that
begins while a worker is running, which the handler cannot tell from a fault of the item's. A
stop is the exception: a run `execute` reports as refused was stopped, or has published, or
carries a cure, and is never handed off from here.

**Accepted cost: an outage that begins mid-worker parks one item** — decided at review, not
merely observed. The worker returns, the next tracker call fails, and the item is handed off and
deferred rather than retried. It is bounded: at most one item per serving process per outage,
because the counter abandons the cycle on the second consecutive failure and every item after
that fails at the claim, before any worker runs; and only where the deferral's own write
succeeds, so a total outage parks nothing. In a partial one the item carries a visible handoff
and waits for someone with write access to answer. The alternative is retrying these, which
re-spends the worker on items that really are wedged — the leftover-branch 422 this rule exists
to stop — and nothing here can tell the two apart. One item, visibly set down and restartable by
a comment, is the cheaper of the two.

**The signal is the worker returning, not `execute` returning.** The worker runs inside
`execute`, before anything is published, and `codeHost.produce` has no handler — so a publish
that throws escapes `execute` with the spend already made and no result. Reading only whether
there was a result classifies exactly that case as never having started, and retries it: that is
the leftover-branch 422, the case this exists for. The run wraps the worker it hands to
`execute` and records the moment it returns. Measured: with the decision read off the result
alone, the test for a publish failing after the worker ran goes red.

**A published artifact makes a retry cheap again.** Once the run has opened a pull request, the
in-flight rule keeps the item off the claim path, so a retry spends nothing — and a deferral
there would only stop that pull request being caught up when it later stops merging, until
someone commented on the issue. The completion unassign failing after a publish is refused, as
"Refused, not handed off" has it. The same goes for a catch-up whose merge came out clean: it publishes
without running a worker at all. So the item is handed off only where the worker ran *and*
nothing was published. Both are recorded when they happen — the worker returning, the host
accepting a pull request or a resolution — never read off the result, which a throw after the
publish (the check that a resolution took) leaves absent.

**Handed off, and only then deferred.** `shouldDefer` defers a `failure` handoff with no cures,
and keeps a handoff carrying cures live, because a cure is a fault in the Igor's own
configuration and the item did not produce it.

## When an Igor claims by label (amended 2026-10-04)

[#156](https://github.com/adamstallard/igor/pull/156) settles that on GitHub every Igor is a
GitHub App, which claims with its `igor:<role>` label and cannot be an assignee. The requirement
here is about the holder field, whatever it is, so it now says the item is left *held* where it
said *assigned*. The code on this branch is written for today's build, a machine user claiming by
assignee, and stays correct for that build. When #156's label claim is built:

- `release` answers whether this Igor's own label is gone, not whether the assignees are clear.
  *An answer that does not carry the assignees reads as not clear* becomes the same rule about the
  labels.
- A person removing the label is a stop (#156). The stop exclusion in the handler covers it as
  it covers any stop: a run that was stopped is never handed off from here.

**Open: the three approved wordings name the assignee.** Tasks 2.4 and 5a.4 carry them verbatim,
and they may be reworded only with the reviewer's agreement. Each tells the reader to unassign
the item, which frees nothing once the claim is a label. *Recommend*, applied when the label
claim lands:

```
**<role>** could not finish taking this and could not release it either, so it still carries
its `igor:<role>` label. Nothing was done. Remove the label to let another run pick it up.
```

```
This still carries the `igor:<role>` label — releasing it did not take. Remove the label to free it.
```

```
**<role>** stood down here, and could not remove its own `igor:<role>` label. Remove the label to free it.
```

