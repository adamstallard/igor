## 1. The envelope boundary carries the limit fields

- [ ] 1.1 `TriageResponse` (`src/triage.ts`) gains `api_error_status`, `terminal_reason`,
      `stop_reason` and `rate_limit_info`, named as the envelope names them so a `TriageResponse`
      satisfies what `usageLimit` asks of a `WorkerOutput`
- [ ] 1.2 `parseEnvelope` admits each under the discipline already stated there — the type it
      claims or absent, never coerced — and its doc comment says the boundary now passes
      classification inputs as well as the arithmetic it was written about
- [ ] 1.3 Tests: a wrong-typed `api_error_status` is dropped rather than admitted; the existing
      `result` / `costUsd` / `isError` behaviour is unchanged

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
- [ ] 4.4 The candidates the stage did not reach hold the source's watermark back. Where #70 has
      landed this is its `held` path; where it has not, they must not be left in `report.failures`
      alone, which `heldBelow` does not read
- [ ] 4.5 Tests: one refusal writes one row naming the gate's seat; a refusal with no seat writes
      nothing; a cycle with no refusal writes nothing

## 5. Left for a captured refusal

- [ ] 5.1 Whether a triage refusal should record `Observation.model`. Triage always runs
      `TRIAGE_MODEL`, so it is the likeliest place a per-model cap is mistaken for the whole
      window — but the execution path records no model either, and a model-scoped observation
      derives no bound, so recording one would calibrate nothing. Settle it against the first live
      refusal, and correct both paths together
- [ ] 5.2 Whether a triage refusal's envelope belongs in `refusals/` beside a run's. The directory
      exists because the patterns are guesses and nobody has seen a real refusal, and triage is the
      likeliest first sighting — but the record's shape is built around a run: an item, an outcome,
      a transcript pointer
