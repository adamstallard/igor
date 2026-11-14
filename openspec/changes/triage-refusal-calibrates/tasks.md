## 1. The envelope boundary carries the limit fields

- [ ] 1.1 `TriageResponse` (`src/triage.ts`) gains `api_error_status`, `terminal_reason`,
      `stop_reason` and `rate_limit_info`, named as the envelope names them, and its `isError`
      reaches `usageLimit` as `is_error`, so a `TriageResponse` satisfies what `usageLimit` asks of
      a `WorkerOutput` and a call the provider reports as successful never counts as a refusal
- [ ] 1.2 `parseEnvelope` admits each under the discipline already stated there — the type it
      claims or absent, never coerced — and its doc comment says the boundary now passes
      classification inputs as well as the arithmetic it was written about
- [ ] 1.3 Tests: a wrong-typed `api_error_status` is dropped rather than admitted; the existing
      `result` / `costUsd` / `isError` behaviour is unchanged; a successful call carrying a
      limit in a provider-filled field records nothing

## 2. One recogniser, reached from triage

- [ ] 2.1 The refusal is recognised by `usageLimit` (`src/execute.ts`), called on the
      `TriageResponse`; no second pattern list is added
- [ ] 2.2 `structuralLimit` gates it: a limit named only in `result` does not record an observation
- [ ] 2.3 Both paths a refusal can arrive on are covered. `runClaude` attaches the envelope to
      `TriageError` only where the child exited non-zero; `verdictOf` throws with **no** envelope
      where the call exited zero with `is_error` set, and a refusal arriving that way would be
      invisible to the recogniser
- [ ] 2.4 Tests: each structural signal recognised; a prose-only limit refused; an exit-zero
      errored envelope recognised
- [ ] 2.5 The fallback condition: where the triage call's output carries a `rate_limit_event`
      reporting it `rejected`, and an observation of the refusal is recorded from that event
      (`read-seat-windows-from-the-stream`, #143), this path records nothing for that call. In
      every other case, including an event with another status, this path records the refusal.
      Under `--output-format json` no event arrives, so today this path always records. Test the
      skip with a hand-built event only if triage reads the stream by the time this lands;
      otherwise leave a comment at the check naming #143's rule

## 3. The stage stops, and the batch reports one refusal

- [ ] 3.1 `triageBatch` stops making calls once a refusal is recognised, rather than continuing as
      it does for an ordinary failure
- [ ] 3.2 `TriageBatch` carries the refusal — the window and reset concluded — once, not per
      candidate, and names the candidates it did not reach
- [ ] 3.3 Costs and verdicts already collected are returned unchanged; the refused call's own
      envelope cost is counted as any other failing call's is
- [ ] 3.4 Tests: nine candidates and a refusal on the second yields one refusal on the batch, one
      verdict, and seven untouched; a non-limit failure still continues the batch

## 4. The cycle writes the observation

- [ ] 4.1 `planCycle` (`src/loop.ts`) calls `recordObservation` once after the batch returns, where
      the batch reported a refusal and `gate?.seat` is defined, with `percentUsed: 100`, the window
      from `limitWindow`, the reset where one was placed, and `source: 'limit'`
- [ ] 4.2 Nothing reads `capacity.ndjson` to decide whether to write
- [ ] 4.3 The write failing does not fail the cycle, and is reported the way the other
      non-fatal cycle writes are
- [ ] 4.4 The candidates the stage did not reach are recorded as untriaged, naming the refusal,
      and hold the source's watermark back through `report.untriaged`, #70's path, under
      work-triage's *A candidate left untriaged is not a candidate triage decided about*. The
      refused candidate is recorded the same way, not left in `report.failures`
- [ ] 4.5 Tests: one refusal writes one row naming the gate's seat; a refusal with no seats
      declared writes nothing; a cycle with no refusal writes nothing; a preview that meets a
      refusal writes nothing; the refused candidate holds the mark
- [ ] 4.6 If [#143](https://github.com/adamstallard/igor/pull/143)'s gate is built first, check that
      it reads the row this change writes as a 100% reading until its reset

## 5. Left for a captured refusal

- [ ] 5.1 Whether a triage refusal should record `Observation.model`. Triage always runs
      `TRIAGE_MODEL`, so it is the likeliest place a per-model cap is mistaken for the whole
      window — but the execution path records no model either, and a model-scoped observation
      derives no bound, so recording one would calibrate nothing. Settle it against the first live
      refusal, and correct both paths together. #57's body lists what would settle it: does
      `rateLimitType` name a model window when a per-model cap binds?
- [ ] 5.2 Whether a triage refusal's envelope belongs in `refusals/` beside a run's. The directory
      exists because the patterns are guesses and nobody has seen a real refusal, and triage is the
      likeliest first sighting — but the record's shape is built around a run: an item, an outcome,
      a transcript pointer
- [ ] 5.3 Capture whether an `api_error_status` 429 can be a transient throttle rather than an
      exhausted window (#57), and bring the result to design.md's *Open Questions*

## 6. At archive

- [ ] 6.1 Move design.md's *Decisions* into `openspec/specs/seat-budget/decisions.md`, as
      Rationale entries for the two requirements and a Constraint entry for §6.3's rule that the
      stream is never a correctness dependency. [#82](https://github.com/adamstallard/igor/pull/82)
      creates that record, so the move waits for it rather than creating a competing file
