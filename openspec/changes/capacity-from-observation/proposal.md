## Why

A seat cannot be measured, so no seat has headroom and nothing is ever claimed.

Measured on one machine, same command, same directory, only the credential differing.
`claude auth status` under an interactive login returns
`{"authMethod":"claude.ai","subscriptionType":"team","email":…,"orgName":…}`. Under a
`claude setup-token` credential — the only kind a seat can hold — it returns
`{"authMethod":"oauth_token","apiProvider":"firstParty"}`, with no identity fields at all.
Windows are reported against a subscription, and the provider resolves none for these
credentials.

So `claude -p '/usage'` answers, with the wrong thing: window percentages under the login,
a per-invocation cost summary under the seat token, exit 0 and no error either way. `/cost`
returns what `/usage` returns on a login, so this is one report degrading rather than two
reports to choose between. `parseUsage` finds no figures, the seat is reported unreadable and
skipped, a pool of such seats reports no headroom, and no work is ever taken. A seat left out
of the configuration entirely has no ceiling at all, which is the arrangement people fall back
to. Analysis in [#30](https://github.com/adamstallard/igor/issues/30).

The in-force requirement "Usage is read from the seat, not supplied by a person" rests on a
justification that is now false — "the provider answers this for free and client-side, so a
stored reading would only be a worse copy of something already available". It is not available.
That requirement, as written, forbids every route out.

## What Changes

**One observation record, two sources.** A provider limit error is a reading at exactly 100%.
Both sources say the same thing — this window was this full at this moment, and resets then —
so both write one row:

    {"at":…,"seat":"adam","window":"session","percentUsed":100,"resetsAt":…,"source":"limit"}
    {"at":…,"seat":"adam","window":"week","percentUsed":36,"resetsAt":…,"source":"usage"}

**Capacity is a division.** Recorded spend within the window instance, over the fraction that
instance was observed to have consumed. The numerator already exists: `executions/` records
per-model tokens and cost per run. Where a seat has consumers Igor cannot see, the quotient
comes out below true capacity — deliberately, because a capacity estimated low bounds Igor
tighter and cannot overrun anybody's floor.

**The reserve becomes a bound on Igor rather than a measurement of the seat.**
`spend ≤ (1 − reserve) × capacity`, summed over every Igor drawing on it. The promise survives
and the mechanism inverts: the owner's floor is guaranteed by construction, without ever
observing the owner. That matters more than it looks, because the subscription behind a seat is
shared with that person's Claude on web, desktop and mobile, not only with Claude Code. Igors
sharing a seat with each other are unaffected — they write to one state branch, so the sum is
recoverable. A person is the only consumer that keeps no books.

**Its own log, `capacity.ndjson`.** `appendRecord` day-partitions any `.ndjson`, so it lands as
`capacity/<date>.ndjson` beside `executions/` and `decisions/`, and `readLog` already caches
settled past-day partitions. It stays out of `executions/` because the two are opposite halves
of one division and a consumer joins them rather than filtering one stream. Append-only is what
makes it safe and durable: rows self-expire once `resetsAt` passes rather than being deleted,
there is no read-modify-write, and a row that no longer says whether a seat is spent still says
what that seat's capacity was. Both questions read the same rows — "is this seat spent now" is a
scan for an unexpired row at 100%, "what is its capacity" is a division over the same rows.

**Self-correction is the point.** Every limit error is a free measurement at exactly 100%, at a
known moment, with the model mix already recorded, and it says the true capacity was lower than
the estimate that permitted the run. The predictive layer therefore improves from the reactive
layer's failures with nobody re-running a reading or editing a configuration. A fleet that hits
limits gets better at not hitting them. This is the argument for the whole design; without it
this is just a stored reading that ages.

**An unmeasured seat with a reserve is refused, not guessed at.** A reserve is a fraction of
capacity, so with no capacity figure it expresses no quantity. A seat with no reserve may run
uncalibrated — its first limit error is its first calibration point, and nobody's floor was at
stake. A seat with a reserve waits for an observation.

Explicitly out of scope:

- **The adaptive reserve** — `budget-pacing`'s "A reserve protects projected need, not a fixed
  fraction". It narrows the reserve where the owner is measurably behind their own pace, which
  requires seeing the owner's consumption. No surface exposes that to a seat: the credential
  carries no subscription identity, there is no `usage` subcommand, and the owner's other
  clients are outside Claude Code entirely. This should be **cut rather than deferred**. A
  deferred requirement implies a blocked implementation; this one is blocked on a fact about
  the provider that nothing in this repository can change, and leaving it open invites somebody
  to satisfy it from a guess. The waste it targeted is real and wants a different mechanism.
- **Choosing constants** — target utilisation, dead bands, staleness thresholds. The two items
  measured so far are 10× apart, $1.19 and $11.18; anything fitted to that is fitted to
  anecdote. These want a week of recorded observations, which this change is what produces.
- **`igor calibrate`'s interface.** Only the note that the reading half already exists:
  `claude -p '/usage'` returns the percentages headlessly under an interactive login, and
  `parseUsage` parses exactly that text. What it cannot do is run under a service user, so
  whatever the command looks like, it runs on the owner's machine.
- **Deriving a bound against a per-model window.** The weekly cap on a single model is a
  separate limit, and "Limits the provider reports but the loop does not enforce are still
  shown" stays in force: it is reported, not acted on. An observation names the model it
  concerns, so a refusal on that cap is recorded truthfully rather than as the all-models
  window, but nothing divides against it yet. `executions/` has recorded per-model spend since
  `e0a20ed`, so the numerator will be there when it does.
- **Detecting a limit error.** Recognising a provider refusal and handing off as budget rather
  than failing is separate work against the in-force "A budget handoff states when capacity
  returns". This change covers what is done with that observation, not how it is noticed.

## Capabilities

### Modified Capabilities

- `seat-budget`: capacity is derived from recorded observations and recorded spend rather than
  read on demand, a provider limit error is a calibration point at 100%, and the reserve is
  enforced as a bound on Igor's own cumulative spend rather than as a distance from a reading.

## Impact

- A seat becomes usable at all. Today every seat reports unreadable, every pool reports no
  headroom, and the working configuration is one with no budget block and therefore no ceiling.
- Estimates improve without anybody maintaining them, and the cost of the correction is a run
  that would have been refused anyway.
- The dedicated seat becomes the ordinary case and a person's seat the conditional one, which
  inverts what `docs/seats.md` describes. That document promises a lender "half is always
  yours, on the worst day the fleet has"; the promise is now kept by construction, but only
  once their seat has been observed, and not at all before.
- Requires a reading taken on the owner's machine before a reserved seat can be used, which is
  a manual step where there was previously meant to be none.
- Adds a reason for passing over a seat — never observed — that is neither exhaustion nor an
  unreadable credential, and an operator reading the budget report has to be able to tell the
  three apart.
