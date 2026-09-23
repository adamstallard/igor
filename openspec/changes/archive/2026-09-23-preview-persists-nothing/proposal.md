## Why

`igor run <role> --plan` is the preview: "what it would claim, claiming nothing". It persisted
the discovery watermark anyway, so every candidate it triaged was marked seen and no later cycle
rediscovered them — [#83](https://github.com/adamstallard/igor/issues/83). Looking at the backlog
consumed it. Worst where the preview is recommended: `docs/deployment.md` lists it as the
diagnostic for "nothing is ever claimed", so the documented use is to run it when something is
already wrong, which is when silently removing candidates is least affordable and least likely to
be suspected.

The cause was that the writing and the previewing lived in different places. `planCycle` did the
writing; the caller did the previewing by simply stopping after it returned. The function that
writes had no idea it was a preview.

**The implementation preceded this spec, and that is the wrong order.** The fix was a bug fix
against the flag's own documented contract, and `--plan` is a CLI affordance that appears in no
requirement, so it read as needing no spec change. That reading was wrong, for a reason this
repository has already paid for once: three in-force requirements say "a run", "a first run" and
"each candidate", and on their plain words a preview is all three. The narrower rule — that they
mean a cycle that acted — lived only in a code comment.

That is the exact shape of the bug found on [#70](https://github.com/adamstallard/igor/pull/70):
committed behaviour contradicting spec wording that predated it, because the narrower rule was
never written down. Behaviour whose correctness depends on reading a requirement against its
plain words is behaviour the next reader will "fix" back. This change writes the rule down.

## What Changes

**A preview is not a run those requirements are about.** Three in-force requirements are modified
to say so at the point where each would otherwise read as covering a preview:

- *Watermarks reduce reconsideration without governing it* — "discovery runs twice" means two
  cycles that decided. A preview decided nothing, and the cost of it not advancing the mark is
  that a later real cycle pays for the same triage call. That is a few cents, and it is exactly
  the cost this requirement already sanctions by calling a watermark "an efficiency measure only".
  The cost of advancing is that the items are never worked at all, which is not an efficiency
  question.
- *A first run does not face the whole backlog* — "SHALL set its watermark from that run" is what
  stops the next run re-facing the backlog. A preview that sets nothing leaves the next run still
  a first run, which still faces only the bounded window, so the requirement's purpose is
  untouched. The bound is what prevents the flood, and the bound applies on every cold start.
- *Every decision records its reason, including skips* — a record is what the Igor decided. A
  preview decided nothing, and a record saying otherwise makes the ledger lie about which cycles
  acted. The skip-ratio scenario is about triage records over a period; previews in that series
  would inflate the funnel with cycles that never had the option to act.

**Stated as what a preview is, not as a list of writes it skips.** A future write inside the
cycle has a rule to satisfy rather than a list to be added to — the same reasoning
`condition-backoff` applied to handoff causes. The two writes that exist today, the watermark and
the cycle record, are instances.

Explicitly out of scope:

- **`--plan` as a specified affordance.** Which flag spells "preview", and what it prints, stay
  CLI surface. The requirements here are about what a cycle that decided nothing may persist,
  whatever invokes it.
- **The cold-start look-back window.** A seven-day bound measured from `now` means a long enough
  gap between a preview and the first real cycle slides items out of the window. That is a
  property of the bound, not of previewing — it bites equally on any delay before a first cycle —
  and it is a deliberate design choice, left as is.
- **The preview's triage spend.** A preview pays for its model calls and now records that
  nowhere. Nothing reads the decision record for a cost figure — budget reads executions and
  capacity reads its own log — so no figure moves. Whether a preview's spend should be accounted
  anywhere is a separate question.

## Capabilities

### Modified Capabilities

- `work-discovery`: a cycle that decided nothing does not advance the watermark, and a preview of
  a first run leaves the next run still a first run.
- `work-triage`: a cycle that decided nothing writes no decision record.

## Impact

- The preview becomes safe to run when something is already wrong, which is the only time
  anybody is told to run it.
- A later real cycle pays for triage the preview already paid for. A few cents per preview,
  against candidates previously lost outright.
- The decision record stops containing cycles that had no option to act, so the skip ratio over a
  period is a ratio of real decisions.
- The rule is now legible to the next reader, who would otherwise find three requirements that
  the code appears to violate and a comment as the only explanation.
