# Design

## Where the enforcement point goes

Three sites had the same defect and were fixed separately. The question this change had to answer
is whether to keep doing that.

**Guarding each call** is what produced three issues. `docs/architecture.md:1538` already records
the lesson under a different name — *a guard per route is a guard that misses the next route* —
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
the guard-per-route failure this file already quotes from `docs/architecture.md:1538`, one layer
down: the next status code falls through it. Telling the two apart needs a distinction the adapters
do not currently draw, which is why `surfaceFailed` is still unconditional in that handler and why
that is written up as an open question rather than patched over.
