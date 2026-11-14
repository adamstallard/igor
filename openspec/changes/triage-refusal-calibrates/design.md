## What the row is for

On `main`, *A seat at 100% is spent until its window resets*: an observation at 100% holds the seat
out until the window it names resets, and a refused run writes such an observation, one row in
`capacity.ndjson`. This change writes the same row for a refused triage call, so it holds the seat
the same way.

Triage is the first model call of a cycle, so an exhausted window is likelier to be discovered there
than anywhere else, and the refusal proves the window was full at a known instant.

[#143](https://github.com/adamstallard/igor/pull/143) specifies a gate that admits work on a seat only
while its latest reading is below a threshold that rises toward 100% as the window nears its reset
(`docs/architecture.md` §6.3.4), in place of the dollar bound `(1 − reserve) × capacity` on `main`.
It counts a refusal as a 100% reading until its reset. Under #143's gate the row matters more: a
seat that keeps a reserve and has no reading is not admitted, so where no stream reading arrives, a
recognised refusal is the only reading the gate gets. Task 4.6 checks
the row against #143's gate if #143 is built first.

## A seat's windows can be read from the worker's output stream

`docs/architecture.md` §6.3.3, measured 2026-09-27: a worker run under a `setup-token`
credential, `claude -p … --output-format stream-json --verbose`, emits a `rate_limit_event`
carrying both windows, each with a `utilization` from 0 to 1 and a `resetsAt` in epoch seconds,
and a `status` of `allowed`, `allowed_warning` or `rejected`. It is read with the seat's own
credential and nobody has to be signed in. Reading it is specified on #143
(`read-seat-windows-from-the-stream`).

So a refusal is not the only route to a reading of a fleet seat. **It is still the one route
correctness can rest on.** The stream is undocumented, and §6.3 keeps anything read from it as an
optimisation, never a correctness dependency. The event's `rejected` shape has not been captured
(#57), and whether an event arrives on a seat below every threshold has not been checked, since
the only capture was taken past 75% of the week.

**Triage does not see the event today.** `runClaude` in `src/triage.ts` passes
`--output-format json`, with no `stream-json` and no `--verbose`, so it gets one terminal envelope
and no event lines. Whether that envelope repeats a `rate_limit_info` field, as a worker's
terminal `result` event does, has not been measured; task 1.1 lets the field through the envelope
boundary when it is present.

**Once the gate reads the stream from worker runs**, a seat nearing exhaustion can be known before
triage spends on it, so the case this change covers (the gate named a seat and was wrong) should
become rarer. It does not go away: a seat whose last worker run was long ago, or whose owner spent
it since, still reaches triage with a stale figure.

## Decisions

### This change is the fallback to #143

The cases, for a refused triage call on a named seat:

- **Its own `rate_limit_event` reports it `rejected`, and an observation of the refusal, at 100% of
  the window it names, is recorded from that event.** #143's code records the refusal, under #143's
  *A refusal the stream reports is not recorded twice*, and this change writes nothing.
- **Any other case: no event, an event with another status, or a `rejected` event from which no
  observation of the refusal is recorded**, such as one naming a window #143 does not record. This
  change records the refusal from the envelope. #143 records from the envelope in the same cases:
  where only the envelope reports the refusal, or where the `rejected` event names a window #143
  does not record.
- **Today every triage refusal is the second case**, because triage runs `--output-format json`
  and receives no events. Whether triage should read the stream is #143's question.

#143 owns a triage call's *reading*, if triage ever produces one; this change owns a triage
*refusal* that no stream observation records. If this change lands first, nothing records a stream
observation until triage reads the stream, so the first case cannot arise and neither change has
to wait for the other. Both changes state the once-only rule for a triage refusal, as between
stream and envelope; which should own it, with the other citing it, is for #143's authors and this
change's to settle (*Open Questions*).

### How a triage refusal is recognised and recorded

- **One recogniser.** The patterns that say what a refusal looks like are unverified against a
  live one. A second reader written for triage would be a second thing to correct when the first
  live refusal is captured, with nothing to show the two had drifted apart.
- **A provider-filled field, never the result text.** That text is model output written about an
  item, so an item about rate limits says the same words. A run's outcome is classified by other
  means before its observation is written; a triage call has only the recogniser's verdict, so a
  false match there goes straight into a row asserting a seat was full when it was not.
- **The finished-call guard carries over.** `usageLimit` ignores an envelope whose `is_error` is
  `false`, so a call the provider reports as successful never counts. `TriageResponse` carries
  that flag as `isError`, so it has to reach `usageLimit` as `is_error` (task 1.1), or a
  successful call carrying a limit in a provider-filled field would write a false 100% row.
- **No seat, no row.** An observation must name a seat, and a call made on a credential no seat
  names is attributable to none.

### The envelope widens, under its own discipline

`parseEnvelope` returns only `result`, `costUsd` and `isError`, so nothing downstream can see the
fields a recogniser reads. Its doc comment gives its strictness an arithmetic reason (`0 + "0.02"`
is `"00.02"`). The limit fields are classification inputs nothing sums, so that hazard does not
extend to them, provided each is admitted as the type it claims or not at all.

### One row per stage comes from the loop, not from the writer

A stage that meets one exhausted window meets the same refusal on every call it makes, so its
calls carry one fact. A later cycle, or another Igor, that meets a refusal has met it again, at a
later instant, which is a fact of its own and gets its own row, as the log's append-only rule
allows.

- A writer that reads the log to ask whether a seat and window are already recorded is a
  read-modify-write: two Igors sharing a state branch can both read before either writes. It is
  also unnecessary where the refusal is an exhausted window, which refuses the next call too, so a
  stage that stops at the first refusal has one refusal to record.
- Without the stop, one refusal met by one stage becomes one row per candidate, all for the same
  instant, permanently, since nothing removes rows from an append-only log. How several rows for
  one window combine is undecided in `seat-budget`, so every later reader would have to recognise
  those rows as one fact, and each refused call is a spawn that achieves nothing.
- Stopping the stage at a refusal waits one cycle even where the pool has another seat with
  headroom, since the gate named this seat for the stage and is not asked again within it. That
  wait is accepted: it costs one cycle's triage, and re-resolving the gate mid-batch would split
  one stage's calls across seats.
- The untriaged candidates must come back. A source's watermark marks how far discovery has read,
  and a candidate the mark passes is never seen again unless it changes; these were stopped by the
  seat, not by anything about them, so nothing about them will change to bring them back. work-triage's *A candidate left
  untriaged is not a candidate triage decided about* already holds the mark for such candidates.
  The refused candidate is one of them: on `main` it lands in `report.failures`, which nothing
  reads, and the mark passes it.
- **A preview records nothing.** A preview decides nothing and leaves the watermark where it found
  it (work-discovery's *A preview leaves the mark where it found it*), and `planCycle` runs for
  previews too, so the write is skipped there.
- Verdicts reached before the refusal stand. They were paid for and are correct, and discarding
  them would waste work a refusal gives no reason to redo.

### Where these go at archive

The reasoning above with evidence belongs in `seat-budget`'s decision record, as Rationale entries
for the two requirements and a Constraint entry for §6.3's rule that the stream is never a
correctness dependency. [#82](https://github.com/adamstallard/igor/pull/82) creates that record,
so the move is task 6.1, at archive.

## Open Questions

- **Does a triage refusal record `Observation.model`?** One reading: record it exactly as the
  execution path does, which sets no `model` on any row (`recordExecution`); the spec follows this,
  recording by the rules a refused run uses. The other: record the model where the refusal names
  one, which *An observation records how full a window was* asks of a window scoped to one model,
  and which matters most on triage because triage always runs `TRIAGE_MODEL`. One decision,
  recorded in a comment on this change's pull request, #75
  ([5746189029](https://github.com/adamstallard/igor/pull/75#issuecomment-5746189029)), names both
  readings as one, and they disagree, so neither is settled. Task 5.1.
- **Is every 429 an exhausted window?** `limitSignals` counts `api_error_status` 429 as a limit
  (`src/execute.ts`), and nobody has captured whether a 429 can also be a transient throttle (#57).
  On a transient 429 this change stops the batch and writes a 100% row that holds the seat until a
  guessed reset. Whether that is acceptable until a capture settles it is open; task 5.3 measures
  it.
- **Who states the once-only rule between stream and envelope.** This change's *A refusal met during
  triage is recorded as a full reading of the seat that refused* and #143's *A refusal the stream
  reports is not recorded twice* both state it for a triage call. One should
  own it and the other cite it, for #143's authors and this change's to settle.
