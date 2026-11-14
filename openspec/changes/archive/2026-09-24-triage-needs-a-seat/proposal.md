## Why

Triage's model call is the one spend in the cycle that never asks the budget gate. `runItem`
consults `exhausted()` before it starts an item; `planCycle` does not, so an Igor whose every
seat is held still discovers, still triages, and still proposes work it cannot take —
[#33](https://github.com/adamstallard/igor/issues/33).

**Cost is not the argument.** #33 measured triage at about four cents for a nine-candidate
cycle, against items measured between $1.19 and $11.18. A rule derived from those figures would
say triage is too cheap to gate. The argument is #33's own: *finding work it cannot take is
wasted motion.* The gate exists to produce a state in which the Igor stops; an Igor that keeps
producing verdicts on items it will not claim is not in that state.

**And today the motion is paid for by the wrong credential, or fails confusingly.**
`src/loop.ts:436-439`, immediately above the call, promises the triage credential is "the same
seat a worker would draw from … never whatever login happens to be ambient". Four lines later,
`:443` calls `workerEnv(gate?.token, process.env, gate?.seat)`. When every seat is held,
`budgetGate` returns exhausted with no seat and no token, so that is
`workerEnv(undefined, …)`, which falls through to `AMBIENT_TOKENS` at `src/execute.ts:759-765`.
`report.triageSeat` is set only where `gate?.seat` is defined (`:457`), so nothing records which
credential paid — [#66](https://github.com/adamstallard/igor/issues/66).

The two deployments fail in opposite directions, and both were reproduced rather than reasoned:

- **On an operator's laptop**, where a login is exported into the shell, triage silently spends
  that personal subscription, with nothing in the record naming it.
- **On a server**, where `docs/deployment.md:165` says "do not set `CLAUDE_CODE_OAUTH_TOKEN`
  yourself", there is nothing to fall back to. Running `claude` with exactly the environment
  `workerEnv` builds — `PATH` and `HOME` only — returns
  `{"is_error": true, "api_error_status": null, "terminal_reason": "api_error", "result": "Not logged in · Please run /login"}`.
  That machine had a valid credential in its login Keychain and it was still not used, so the
  fallback is empty rather than quietly keychain-backed. The operator is sent to run `/login` on
  a box whose seats are configured correctly and whose actual problem is that every seat is
  held.

**The fallback itself is not the defect and is not touched here.** Its own comment says it is
what an org running with no seats declared depends on, and `budgetGate` returns
`exhausted: () => false` where `org.seats.length === 0`, so that configuration never reaches the
rule this change writes. The defect is the *held-pool* case arriving at the same fallback, where
a promise was made four lines above and where the whole point of the gate having just refused is
that spending should stop.

**Why both issues now.** #33 was held because `capacity-from-observation` was rewriting what the
gate consults and where the check belongs — building against the old definition would have meant
writing it twice. That change is complete and archiving, so the blocker has cleared. #66 was
found while implementing #56 and deliberately kept out of it. They are one rule from two
directions: #33 says a held Igor should stop looking, #66 says a held Igor must not spend. This
change closes both.

[#56](https://github.com/adamstallard/igor/issues/56)'s credential breaker (PR #65) raises what
is at stake. Ordinary exhaustion self-corrects — the window resets on a known hour and the state
clears. A seat taken out of rotation for a refused credential is held for up to the six-hour
cooldown cap, and a refused credential is not a state that resets on a clock, so the
unattributed spend lasts until somebody reissues a token. This change does not depend on that
branch; it only stops the interval mattering.

## What Changes

**Triage's model call is a spend, and every spend needs a seat.** Where the role's pool has no
seat with headroom, the model stage does not run. This is the rule the gate already applies to
execution, applied to the one remaining spend in the cycle, rather than a rule about triage.

**The boundary is the model call, and nothing above it.** Discovery, comment reading, the stop
gate, the deferral gate, the universal skips, the lane predicates, the decision record and the
cycle report all keep running. This is not a preference between two coherent boundaries — it is
the only boundary that leaves the Igor able to hear. `oneFetchPerItem` reads comments per
*discovered candidate*, and both `dropStopped` and `dropDeferred` consume that fetch over the
survivors. Stopping discovery therefore stops comment reading with it, and the reply that wakes
a deferred item or the stop that halts a runaway both arrive as comments on discovered items. An
Igor that stopped discovering while out of capacity would go deaf exactly when a person is most
likely to be trying to reach it, and could not process the message that would change what it
does next.

**The gate stays lazily resolved.** A cycle where nothing survives the earlier stages still
reads no seat's usage, as the comment at `src/loop.ts:437` already describes. The gate
is consulted where the model call is made, after the stop and deferral gates have run — not at
the top of `planCycle`.

**A candidate the gate refused to triage is not a candidate triage decided about.** This is the
part a "skip the model call" implementation gets wrong by default. `advance(stored,
heldBelow(results, unexamined))` pulls a source's watermark back only below candidates recorded
in `report.skipped` with `held`. Candidates that reach the model stage and are never triaged
appear in neither, so the mark would sail past them and they would never be reconsidered unless
somebody edited them. Skipping the call without holding the mark is *worse* than today's
unattributed spend: today those items at least get a verdict. So each untriaged candidate is
recorded with its reason and holds the mark back, on exactly the reasoning the in-force comment
already gives — "an item dropped before anything examined it holds the mark back".

**The cycle says why it triaged nothing, and when it can resume.** An Igor that goes quiet for
hours without explaining itself is its own problem, and the explanation has to distinguish the
cases: only `spent` and `share` mean the budget ran out, and a reader sent to look at spend for
an unresolvable pool name, an unreadable seat or a seat never observed looks in the wrong place
— [#49](https://github.com/adamstallard/igor/issues/49). Where a reset is known the report
states it, which is what `graceful-handoff`'s "A budget handoff states when capacity returns"
already requires of the claimed-item case.

**Rejected: record the ambient spend instead.** #66's second option keeps triage running and
sets `triageSeat` to something naming the ambient login, so the spend is at least attributable.
It is rejected. Attributing a spend that should not have happened makes the record honest and
the behaviour no better, and on the server deployment there is no ambient login to attribute it
to — the call simply fails with a message that misdirects the operator. #66's third option,
amending the comment so it stops promising what the code does not do, is rejected for the same
reason: the comment describes the behaviour that was wanted.

## Capabilities

### Modified Capabilities

- `work-triage`: the model stage does not run where no seat can pay for it, candidates left
  untriaged hold the watermark back rather than being decided about, and a cycle that triaged
  nothing says why and when it can resume.
- `seat-budget`: the spending-side counterpart of "a missing token is refused, not substituted"
  — where the gate names no seat, the call is not made and no ambient credential is substituted.

**Why the delta is split this way.** The rule *about triage* belongs in `work-triage`, which
already holds a family of requirements shaped exactly like it — "A closed item is never a
candidate", "An item held by another party is never a candidate", "Items with work already in
flight are skipped" — each universal, non-configurable, phrased as a skip *before any model
call*, and each recording a reason. "Triage runs in three stages, cheapest first" makes the
model call stage three, and a held pool is a gate on stage three. Stating it there is the same
rule applying to one more thing rather than a new special case.

What `work-triage` cannot own is the invariant that made the defect possible, because that
invariant is not about triage. `seat-budget`'s "A missing token is refused, not substituted" is
scoped to *reading* a seat's usage; there is no spending-side equivalent, which is why the one
spend that does not go through a worker found the gap. One added requirement there says it for
every call Igor makes on its own behalf, so the next such call — a summariser, a lore pass, a
handoff that someday wants a model — does not have to rediscover it. Both deltas are `ADDED`
rather than `MODIFIED`: `capacity-from-observation` is rewriting `seat-budget`'s in-force text
as this is written, and a `MODIFIED` requirement quoting text that moves underneath it would not
survive the archive.

## Impact

- A cycle with a held pool makes no model call, spends nothing, and costs one gate resolution
  only where candidates actually reached the model stage.
- The cycle report gains a state — candidates left untriaged, with a reason and, where known, a
  return time — which `serve.ts`'s summary and the decision record both have to be able to
  express. `condition-backoff` already requires the idle reasons to be tellable apart in the
  cycle report; this adds one to that set rather than a second mechanism.
- Discovery watermarks advance more slowly during a held period, by design. The items come back
  when capacity does.
- The operator-facing failure changes shape: a correctly configured server reports a held pool
  and a reset hour instead of reporting that it is not logged in.
- [#55](https://github.com/adamstallard/igor/issues/55) is unaffected. A refusal met *during*
  triage is a calibration point only when the gate believed there was headroom, which is
  precisely the case #55 covers and precisely the case this change leaves running.
- Nothing in `src/` is touched by this change. It is a specification; the implementation is the
  second gate on this branch.
