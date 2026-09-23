## 1. A preview persists nothing

- [x] 1.1 A preview flag on the cycle's options, so the function that writes knows it is a
      preview rather than the caller knowing and the writer not (#83)
- [x] 1.2 The watermark write guarded on it
- [x] 1.3 The decision record write guarded on it
- [x] 1.4 Everything else in the cycle reads, so the two guards are the whole of it — verified
      across `discover`, deferrals, the stop and deferral gates, screening, triage and the seat
      gate
- [x] 1.5 The report still computes the advance in memory, since that is what the preview shows

## 2. Tests

- [x] 2.1 A preview leaves the stored watermark byte-identical, asserted after a real cycle set
      it so the assertion distinguishes "unchanged" from "never written"
- [x] 2.2 A preview writes no cycle record, and the next real cycle still finds the item
- [x] 2.3 Both asserted in the other direction — a non-preview cycle advances the mark and writes
      the record — so the fix cannot be satisfied by breaking the real path
- [x] 2.4 A preview still reads the stored mark, so it previews the cycle that would actually run
- [x] 2.5 A look-back still leaves the mark alone, in both directions, since nesting its guard
      inside the preview guard put its reason inside another condition

## 3. The contract as stated to operators

- [x] 3.1 The closing line names state rather than cost: nothing claimed, posted or recorded, and
      the mark unchanged
- [x] 3.2 `README.md` and `docs/deployment.md` say a preview persists nothing, without overstating
      it into a claim about the cold-start window that the bound makes false
- [x] 3.3 `--plan` together with `--claim` refused rather than silently claiming, since `--claim`
      returns before triage and never reads the plan flag (#85)
- [x] 3.4 One definition of whether `--claim` was given, since the refusal and the branch it
      protects disagreeing about an empty id sent a mistyped one into the full autonomous cycle

## 4. Spec

- [x] 4.1 The three requirements a preview would otherwise contradict on their plain words
      modified to say what they mean by a run
