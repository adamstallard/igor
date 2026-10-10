# Design

## One handler around the claimed run

Everything that runs while a claim is held runs inside one handler in `runItem`, which hands the
claim back the way any other failure does. That covers every way a held run can fail, the
checkpoint and the completion action included, without naming any of them.

**Rejected: a guard at each call that can fail.** That is how #128, #129 and the unhandled
`runItem` arose: each call site was guarded on its own, and the next unguarded one was the next
bug. The requirement is about a state, a claim being held, so it is enforced where that state
begins and ends.

**`takeClaim` keeps its own guard for the claim itself.** Only `takeClaim` knows whether the claim
landed before the announcement did. Its guard does not reach the run around it, which is why the
handler is needed as well.

The run under the claim is its own function, `runClaimedItem`, rather than a block indented inside
the handler. Its name says what the handler protects: the phase that runs under a held claim.

## Ending the cycle when the surface stops answering

When the tracker or host stops answering, the cycle ends instead of refusing each remaining item.
Each refusal posts on its item, and the Igor's own posts bump the item's `updatedAt`, so the
watermark does not keep the item out of the next poll: two comments per item per poll,
indefinitely. Measured over four cycles: 24 comments, against 6 when the cycle is abandoned at the
first failure. At twenty items on a five-minute poll, that volume alone trips the secondary rate
limit that caused the outage.

So a run reports whether the surface caused its failure, as `surfaceFailed`, and `serve` ends the
cycle on it. Each refusal still prints its own reason.

**Rejected: working the cause out in `serve`.** `serve` cannot: a claim the tracker declined to
record is also a refusal, and that one is about the item, so it must not stop the cycle.

## Two in a row, because the flag over-reports

`surfaceFailed` is set by `runItem`'s handler on every throw it catches, including throws that are
entirely about the item. A branch left over from an earlier run makes `codeHost.produce` fail with
`422 Reference already exists`, on that item only, every time. Ending the cycle on the first flag
would end every cycle for as long as such an item existed, which is what "a refusal about the item
does not stop the cycle" forbids.

**So the second consecutive surface failure ends the cycle, and one on its own does not.** An
outage fails every item and a bad item fails one, and that count is the only distinction available.
The counter is per cycle and resets on any run that is not a surface failure, so a wedged item
cannot add up to a stop across a healthy cycle. Only an abandoned cycle counts as failed and emits
`cycle-failed`.

**Rejected: ending on the first flag, and narrowing when the flag is set.** Narrowing needs the
item-versus-surface distinction that *What the run reached* records as unavailable. It would trade
a bounded cost, one extra item attempted per cycle during a real outage, for a distinction nothing
can draw.

**What the counter misses, measured.** A surface whose release call alone is failing never reaches
two. `handOff` catches that throw and returns `released: false` without `surfaceFailed`, so a pool
alternating published items with handed-off ones resets the counter on every other item. Observed
on a pool of six with the unassign endpoint down: six items claimed, a worker spent on each,
`failures: 0`, and no `cycle-failed`. Ending on the first flag would have stopped at the first
item. The counter is kept because it handles the wedged item, which is the fault it exists for.
Widening `surfaceFailed` to cover a caught release failure is rejected, because it would mark item
faults as the surface's too.

## Writes return what the surface recorded

`claim`, `report` and `release` each return what the surface recorded, so *unknown* is a value
rather than a throw. A caller that only knows whether a write threw cannot tell *this did not
happen* from *this happened and the answer was lost*. Guessing from that is where two of the three
defects came from: a flag set after an `await` recorded *this process saw it succeed*, not *it may
be on the item*, and a message asserted a release that had not happened.

**An answer that does not carry the assignees reads as not clear**, deliberately. Reporting a
release that did not happen leaves an item held with nobody told. Reporting a release that did
happen as stuck costs one person one unassign on an item nobody holds.

## What the run reached

The handler keeps a record, `reached`, filled as the run passes each point: `reached.output` when
the worker returns, `reached.published` when the host accepts a pull request or a resolution, and
`reached.result` when `execute` returns. A throw after the work therefore still composes its
handoff from what the run did. Without the record, a tracker 503 on the completion unassign, the
last call of a run that otherwise succeeded, would post "the work never started" beside a live pull
request, with the artifact linked nowhere and the spend reported as zero.

**Rejected: reading `reached` as item versus surface.** It discriminates on the wrong axis: how far
the run got, not whose fault it was. `codeHost.produce` is called inside `execute`, so the
leftover-branch 422 throws before there is a result, and `reached.result` is empty for the item
fault it would need to catch. The tracker 503 above, a surface fault, finds it full.

**Rejected: an HTTP status table**, with 4xx as the item's fault and 5xx and 429 as the surface's.
The first status code it doesn't list falls through: the failure of a guard at each call site, one
layer down. Telling the two apart needs a distinction the adapters don't draw. That is why
`surfaceFailed` is set on every throw, and why `serve` counts it rather than trusting any one
instance.

## Deciding by what a retry would cost

Whether a throw was the surface's fault or the item's can't be answered from the handler. What a
retry would cost can, and the handler decides on that:

- **Before the worker ran**, a retry is cheap, and most of an outage lands here. The item is
  refused and tried again next cycle.
- **After the worker ran, with nothing published**, a retry spends the whole worker again. The item
  is handed off and deferred until someone with write access answers. That includes an outage that
  begins while a worker is running, which the handler cannot tell from a fault of the item's.
- **After something was published**, a retry is cheap again, because the in-flight rule keeps the
  item off the claim path. A deferral there would only stop the pull request being caught up when
  it later stops merging, until someone commented on the issue. So a completion unassign that
  fails after a publish is refused, and so is a catch-up whose merge came out clean, which
  publishes without running a worker.
- **A run `execute` reports as refused** was stopped, has published, or carries a cure, and is
  never handed off from here.

**Refused, though a handoff is posted.** A refused run still posts a handoff on the item, but
returns `refused` rather than `handed-off`. `shouldDefer` parks a `handed-off` run with a `failure`
reason and no cures until somebody answers on it, and a tracker outage is no reason for the item
to wait.

**Rejected: refusing every throw.** A wedged item would come back each cycle and run the worker
again to reach the same failure.

**The signal is the worker returning, not `execute` returning.** The worker runs inside `execute`,
before anything is published, and `codeHost.produce` has no handler, so a publish that throws
escapes `execute` with the spend made and no result. Deciding from the result alone would treat that
case as never started and retry it: the leftover-branch 422, the case this rule exists for. So the
run wraps the worker it hands to `execute` and records when it returns, and records a publish when
the host accepts it. Neither is read off the result, which a throw after the publish (the check that
a resolution took) leaves absent. Measured: with the decision read off the result alone, the test
for a publish failing after the worker ran goes red.

**Accepted at review: an outage that begins mid-worker parks one item.** The worker returns, the
next tracker call fails, and the item is handed off and deferred rather than retried. The cost is
bounded:

- at most one item per serving process per outage, because the second consecutive failure ends the
  cycle, and every later item fails at the claim, before any worker runs;
- only where the deferral's own write succeeds, so a total outage parks nothing. In a partial one,
  the item carries a visible handoff and waits for someone with write access to answer.

Retrying instead would re-spend the worker on items that really are wedged, such as the
leftover-branch 422, and nothing here can tell the two apart. One item, visibly set down and
restartable by a comment, costs less.

**A handoff carrying cures stays live.** `shouldDefer` defers only a `failure` handoff with no
cures. A cure is a fault in the Igor's own configuration, not the item's.

## Where the correction is posted

`stillAssigned()` is a clause correcting a sentence that already claimed the release, so it is
posted after that sentence. The rule is *after the claim it answers*, not *last on the item*:
nothing posted afterwards asserts a release, so nothing can make it false again.

**Only the code that posted a sentence posts its correction.** `handOff` owns its sentence. A
stand-down does not: `runItem` posts the stop receipt after `takeClaim` returns, so a correction
posted inside `takeClaim` would sit above the claim it answers, and leave "released this" as the
last word on the item. So `takeClaim` reports `releaseStuck`, and `runItem` posts the correction
after its own receipt.

**Rejected: releasing before the receipt in `runItem`, so the receipt can be worded truthfully.**
`runItem` already releases there, and the release is not what is unknown. The receipt's wording is
fixed and approved, and a second wording for the stuck case is a second sentence to keep correct.

**A `lost` stand-down is the exception, and stays in `takeClaim`.** Nothing is posted on that path,
so `stoodDownStuck()` stands alone rather than correcting anything.

**`handOff` posts the correction whether or not the handoff posted.** The process cannot know
whether the handoff posted: a surface can accept a write and throw on the way back, which is why
`takeClaim` sets `announced` before its call rather than after. Where nothing landed, the
correction still stands on its own: the item is held, and saying so is true whether or not anybody
read a handoff. `complete()` already posts it with nothing before it, because a run that published
said nothing about the release.

**Measured cost: one failing `report` call per handed-off item**, where the surface took the claim
message and had stopped answering by the handoff. A surface refusing everything costs nothing
extra: the claim message fails inside `takeClaim`, the run is refused there, and `handOff` is never
entered. So the cost is confined to an outage that begins mid-run. Posting the correction only when
the handoff posted would not be cheaper, because nothing can say whether it posted.

**Measured exception, on the catch-up path.** `catchUpItem` posts `resolvedNote` or
`broughtCurrentNote` after `runItem` returns. When a conflict resolves into a published artifact
and the completion unassign does not clear, the correction sits one comment above that note
instead of at the foot of the item. Nothing on that path claims a release, so the requirement holds
and the reader's last line is true. What they lose is ending on the correction.

## When an Igor claims by label

[#156](https://github.com/adamstallard/igor/pull/156) decides that every Igor on GitHub is a GitHub
App, which claims with its `igor:<role>` label and cannot be an assignee. The requirement here is
about the holder field, whatever it is, so it says the item is left *held*. The code in this change
claims by assignee, which is how Igor claims until #156's label claim is built. With the label
claim:

- `release` answers whether this Igor's own label is gone, and an answer that does not carry the
  labels reads as not clear.
- A person removing the label is a stop (#156), and the handler never hands off a stopped run.

**Decided 2026-10-04: the change that builds the label claim rewords the three approved messages,
and this change keeps them.** Tasks 2.4 and 5a.4 carry them verbatim. Each tells the reader to
unassign the item, which is true while Igor claims by assignee and frees nothing once the claim is
a label. Their wordings for the label claim:

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
