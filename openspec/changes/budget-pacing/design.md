## Finding: a seat-wide reading exists, under the seat's own credential

Recorded 2026-09-27. This change had no `design.md`; this is its first section, and it decides
nothing in the requirements.

**What was needed.** *A reserve decays toward the reset, on the clock or on the owner's
consumption* narrows the reserve by what the owner actually consumed, computed as
`percentUsed − (Igor's recorded spend ÷ capacity)`. The `percentUsed` term is a current reading of
the whole seat. The proposal expected `scheduled-observation` to supply it, from a job on the
lender's laptop, because a `setup-token` credential was believed to report no windows.

**What changed.** A worker run's own output stream carries a `rate_limit_event` reporting both
windows' utilization and reset, read with the seat's own credential and nobody signed in
([`docs/architecture.md` §6.3.3](../../../docs/architecture.md#633-a-seat-token-is-measured-from-the-workers-own-stream)).
The reading is of the whole seat, so it includes the owner's use. `read-seat-windows-from-the-stream`
specifies recording it; it is not built. Once it is, `percentUsed` is available after every worker
run on the seat, without a lender installing anything. The observation-informed state of the
reserve decay no longer depends on `scheduled-observation`.

It also offers two inputs this change did not have:

- **`allowed_warning`**, with the threshold it crossed — the provider saying a window is past a
  fraction of its cap. `read-seat-windows-from-the-stream` records it and gives it no gate
  behaviour, leaving any use as a pacing input to this change.
- **A direct fraction of the window consumed**, so a pace line could compare percent against
  percent instead of recorded dollars against a derived dollar capacity.

## Still unsolved: relating a percentage of a window to dollars of recorded spend

The owner's share is `percentUsed − Igor's share`, and Igor's share in percent is Igor's recorded
dollars divided by the window's capacity in dollars. The stream supplies the first term and none of
the second. Capacity is still derived as Igor's spend divided by the seat-wide fullness, which on a
shared seat divides Igor's part by everybody's and so comes out low — and a low capacity makes
Igor's share look larger and the owner's smaller, which errs toward narrowing the reserve further
than the owner's real use warrants. That is the unsafe direction for this requirement, the
opposite of the direction it is safe in for the bound.

What may close it, not decided here:

- **Differencing within an instance.** Two stream readings in one window instance, with the spend
  Igor recorded between them, give capacity without the owner's error wherever the owner was idle
  in that interval. Stream readings arrive once per worker run, so such pairs will be common. The
  reading resolves one percent, so on the weekly window an interval has to span enough spend to
  move the figure. Which intervals to trust is the season-of-data question
  `capacity-from-observation` §3 already leaves open.
- **Pacing in percent throughout.** If the pace line and the reserve are both expressed against
  `percentUsed`, the conversion is needed only to attribute a seat between Igor's roles, which is
  what recorded cost already does by ratio.

## Also open

- **Whether a seat-wide reading past `1 − reserve` should stop Igor.** Today a reserve caps Igor's
  spend at `(1 − reserve) × capacity`, whatever the owner does. A seat-wide reading makes it
  possible to treat the reserve instead as a floor under the owner's own use. That is a change to
  what a reserve means, and it belongs here, with the adaptive reserve, rather than in the change
  that records the reading.
- **A seat below every threshold** may not report numbers on the stream (§6.3.3, unverified). If
  it does not, the observation-informed state is available only past a threshold, and below it the
  reserve decays on the clock alone — which is the rule's own fallback, so nothing breaks.
