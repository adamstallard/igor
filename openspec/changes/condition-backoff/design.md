# Design notes

## Since review: an unread seat is probed, not run (2026-09-28)

Added 2026-09-28 on the branch of [#101](https://github.com/adamstallard/igor/pull/101), which
absorbs `credential-breaker`'s stop into this change's conditions. This change had no `design.md`,
and this note changes no requirement, scenario or task. It records how a decision made after review
bears on the credential condition, and how Adam settled the question it raised, the same day.

### The decision

Adam decided on 2026-09-28 that a seat's reserve is a line that moves toward the reset, checked
against the seat's latest unreset reading of each window
([`docs/architecture.md` §6.3.4](../../../docs/architecture.md#634-a-seats-reserve-is-a-line-that-moves-toward-the-reset--decided-2026-09-28-specified-on-143-not-built)).
The line is `1 − r × remaining` with `r = max(seat reserve, role reserve)`, since a role file may
also set its own reserve. It replaces the dollar bound as the gate. A seat with no unreset reading
is not admitted: a *seat probe* on the Igor server reads it first, with one minimal call on the
seat's own token. It is specified on [#143](https://github.com/adamstallard/igor/pull/143) and not
built.

### What it does to this change

**Two different things are called a probe.** Here, the probe is the next item a stopped scope is
allowed after its cooldown. #143's seat probe is a minimal model call that spends no item. They
are separate mechanisms, and nothing yet connects them.

**A revoked seat nobody has read would open no condition.** Once #143's gate two lands, a seat with no
unreset reading is never run. Its seat probe meets the 401, but a seat probe produces no handoff,
so without the decision below it would mint no `seat:<id>:credential`, the condition would
never open, and the seat would be out of rotation with no reason given. A seat revoked after a reading is unaffected: it keeps that reading
until its window resets, its runs meet the 401, and the condition opens as specified here.

**The clearing probe for a seat condition is the seat probe (decided below).** A credential condition
clears on a changed discriminator, or on a probe that does not meet it. For a seat-scoped
condition, #143's seat probe tests the credential without spending an item.

### Decided (Adam, 2026-09-28): a seat probe opens and clears the credential condition

**A seat probe that gets a 401 opens `seat:<id>:credential`, and a seat probe that succeeds counts
as the clearing check.** It is specified on [#143](https://github.com/adamstallard/igor/pull/143),
where the seat probe is. This change's conditions own that stop, so the seat probe opens and clears
it there; `credential-breaker` is folded into this change (*Folded in from #65*, below).

For this change that means a seat-scoped credential condition clears without spending an item: the
seat probe is its clearing probe. Nothing in this change's requirements has to change for it. The
requirement already says a credential condition clears on a probe that does not meet it, and on
the credential changing. What is new is only which mechanism the probe is, and #143 specifies it.

## Folded in from #65 (Adam, 2026-10-11)

**#65's credential breaker is folded into this change instead of merging.** Adam decided this on
2026-10-11, since nobody runs Igor yet and two mechanisms owning one stop would be reviewed,
built and then reconciled. This change's conditions are the only owner of the credential
stop. #65's code and tests are the starting point for its credential case (task 4.5).

**What this change already covered.** Counting per seat rather than per role (a condition's scope
is its cure's scope), a sequence that a successful run ends rather than a total (a condition
clears by not recurring), clearing at once on a replaced credential (the discriminator), and one
run after a growing cooldown (the probe).

**What it takes from #65**, now in the spec's two credential requirements: recognising a refusal
by the provider's authentication-error status only, on a run that did not finish; the full hash
as the discriminator, ambient credentials included; passing a stopped seat over before its
headroom is checked, whatever it reads; reporting a refused credential apart from an unreadable
one; and no command that clears a condition. The cooldown's ceiling is in the constants
requirement.

**What it leaves behind:** `credentialBreaker`'s own trailing count, `BREAKER_TRIP_AFTER` and its
cooldown, which the condition's count, rebuilt from the log, and its threshold and cooldown replace.
Their values are the starting point for task 6.2: a threshold of 3, because one refusal trips on a
blip, two can be coincidence, and three items is a tolerable cost against holding a working seat
out; and a cooldown of 15 minutes doubling to 6 hours, because a revoked credential can stay revoked
for days, where a fixed hour spends twenty-four items a day and doubling spends about six in total.

**Decided (Adam, 2026-10-11): no stored record.** #65 derived its count from
`executions.ndjson` and rejected a separate store, because a summary beside a log can disagree
with it. That holds here too, so a condition is rebuilt from the same log: from run rows carrying
its cure key, and from condition rows appended for what no run shows. The one such row the spec
needs is a probe being taken, so a second Igor waits rather than taking a probe item of its own.
Rows that are not runs carry a `kind`, and readers that count runs skip them (task 2.3).

Two facts from #65 that the spec does not carry:

- **A signed-in login the environment does not carry is not named.** A seat relying on a
  `~/.claude` login under the forwarded `HOME`, with no token in its environment, has no credential
  Igor can hash. Such a seat can be told its credential was refused, but no condition can be held
  against it.
- **A documented signal exists beside the 401.** The CLI's `system/api_retry` stream event carries
  an `error` category such as `authentication_failed`, `account_on_hold` or `billing_error`
  ([headless docs, *Handle API retries*](https://code.claude.com/docs/en/headless#handle-api-retries)).
  Workers receive it and Igor discards it. It is sent only before a retry, so a refusal that is not
  retried never produces one, and it cannot be the only signal.

## How it is built

**Every condition is rebuilt from `executions.ndjson` each time it is asked about**
(`src/conditions.ts`). The log holds three kinds of row:

- **A run row** is written for each item an Igor worked, and carries no `kind`. Its `cures` are
  the keys the run minted, that is, recorded as the cause of its failure.
- **A probe row** (`kind: 'probe'`) says an Igor is taking the one item a condition's cooldown
  lets through, and names that item. It is written before the claim, so a second Igor sees it and
  waits. With `void: true` it says the probe never produced a run row, as when the claim was lost
  to somebody else, so the next item may probe at once.
- **A check row** (`kind: 'check'`) records a test of one condition that spent no item, with `met`
  saying whether the condition held. `serve` writes one when GitHub refuses or accepts its App's
  credentials again. #143's seat probe, when it is built, writes the same kind.

`loadSpend` returns run rows only, so spend attribution, capacity and `igor budget` count no
probe or check row.

**How a condition is counted.** Reading back from the newest row, the condition's current
occurrence is the unbroken sequence of rows that meet its key, all observed against one
discriminator (for a credential key, the credential's hash). It ends at the first row of the
condition's scope (the role, seat or Igor the key names) that does not meet the key, or that meets
it against a different discriminator. A run row is read for every condition on its role and its
seat; a check row only for its own key; a probe row is a marker and never counted.

**A run that could not have met a condition says nothing about it.** A run that started no worker
(marked `workerless`, such as a catch-up whose merge came out clean in the clone) ran no command,
and neither did one the provider refused for its credential. Each counts toward the key it met and
is not read as evidence for any other. A run meets a key in its `cures` or one its worker's
denials name. The second matters for a run whose publish threw after the worker was denied a
command: its row carries the denials but no `cures`, because a handoff carrying a cure key is
never deferred and this item should be, yet the worker still met the key.

**A probe ends with its own item's run row**, whatever that row shows. If the row met the
condition, the condition backs off further; if it cleared it, there is no condition; if it did
neither, as a workerless run does, the next item may probe. A row for any other item ends no
probe: it was written after the probe row, but its run began earlier. The lore an item is worked
with is read before the probe row is written, because reading it can throw on a malformed entry,
and a throw after the row would leave a probe that never runs.

**A probe that never ends lapses** after `SWEEP_AFTER_MS`, the longest a run can hold a working
tree. Without it, a process killed between its probe row and its run row would hold the scope for
good. A shorter limit would let a second Igor probe beside a run still going.

**A run that met a usage limit still clears a condition it did not meet.** Exempting it, as a
credential refusal is exempt, was considered and rejected: a limit can arrive after commands ran,
and then a run row without the key is real evidence that those commands were allowed. This holds
only while a limit envelope says nothing of how far the run got.

**The threshold and cooldown are org-wide, in `igor.config.yaml` under `conditions`.** Several
Igors, and several roles on one seat, meeting one key are one condition, counted once. A setting
per role would let one role's threshold stop a seat that another role's still counts as open,
which is two stops again. A role or org base file that tries to grade a condition, by declaring it
fatal, degraded or ranked, is refused with the reason before the unknown-key check runs, because
that check would only name the key.

**The credential hash is of the environment a worker gets**: `CLAUDE_CODE_OAUTH_TOKEN=<token>`, or
the ambient pair (`credentialFingerprint`). `readAllSeats` hashes the environment a worker on that
seat would get, and `execute` hashes the one it built, so both hash the same string without
`workerEnv` handing the credential anywhere new.

**`serve` records a run without waiting for it, and the gate waits.** The wiring tracks each run
row still being written, and the next gate reads the log only once they have landed, so the item
after the one that opened a condition is not taken.

### What the build contradicted

- **A refused App may be unable to write its own refusal.** The state branch is written with the
  App's installation token, so the check row that opens `app:<identity>:credential` can fail for
  the very reason it records. The stop is therefore decided by the mint attempt's own answer, in
  memory, and the row is written when it can be: while the last installation token is still
  valid, or on recovery as the row that clears it. Nothing is lost by this, because a restarted
  process asks GitHub again before its first cycle.
- **#65's two messages said a different credential is the only clear.** The condition's lines in
  `igor budget` and `--credentials` say both: a different credential at once, or a probe on the
  same one that is not refused.
- **An item triaged to proceed could be passed by the watermark without being taken.** The
  watermark is a timestamp per source: discovery reconsiders only items updated after it.
  `planCycle` used to move it past every item it gave a verdict, before `serve` worked any item, so
  an item left untaken when a condition opened mid-cycle, or when the budget ran out, was never
  seen again. Now the caller settles the mark after the items are worked (`markAfterWork`, then
  `settle(untaken)`), and keeps it earlier than each chosen item it did not take. That changes
  `work-discovery`'s watermark requirement, so this change carries a delta for it. The cost: every
  item updated after an untaken one is above the mark too, so it is triaged again next cycle.

  Three details of how the mark is settled:
  - An item counts as taken only where its run left a trace on the tracker (`leftATrace`). A
    claim that failed before the tracker recorded it posts nothing and leaves the item's
    `updatedAt` unchanged, so a mark moved past it would drop it for good.
  - `settle` re-reads `discovery.json` before writing. The file holds the mark of every source of
    every role, and a cycle settled hours after it loaded the file would otherwise put back other
    roles' older marks. Two Igors on the same source can still overwrite each other's mark, as
    they could before.
  - A cycle that throws before `settle`, such as one whose lore cannot be read, saves no mark, so
    the items it skipped are triaged again next cycle. Settling in a `finally` was considered and
    left out: the in-force `work-discovery` requirement advances the mark only for a cycle that
    acted, and accepts paying for the same triage call again as the price of not dropping items.

### Open questions

- **A seat whose usage reading keeps failing cannot be probed** (Adam, 2026-10-13: written down,
  not fixed). Once its credential condition's cooldown passes, the condition is due a probe, but
  the gate passes the seat over for its failed reading before any probe, so no item ever tests
  the credential. The condition then clears only when the operator configures a different
  credential and Igor reads it.

  It costs little: the seat would be passed over for its reading anyway, so no item is held
  back. What stays wrong is the record, which keeps the condition open after the provider may
  have accepted the credential again. Whether that is worth fixing depends on how often a refused
  credential makes the reading fail at all, which nobody has measured; the one measurement taken
  had `/usage` exit zero for a revoked token, which suggests it is rare.
