## Decisions

Adam decided these on 2026-10-13, 2026-10-17 and 2026-10-18, the last day in two rounds.
`design.md` gives the reasoning for each.

**The claim**

1. **A claim message carries the rank of the process that posted it,** as a last line
   `Igor-Rank: N`. Among one role's processes, the earliest claim message that counts holds the
   item. *Rejected:* a lease keyed by item on the state branch, which would make correctness
   depend on a cache whose loss must cost only re-examination.
2. **Claim messages are ordered among themselves by the surface's sequence key, never by a
   timestamp.** A claim message and the item's latest release, a label event, share no sequence
   key, so those two are compared by timestamp. A message in the release's second does not
   count, and that item is claimed at a later cycle: nobody waits for the second to pass.
3. **Messages from before the item's latest release, and messages of gone ranks, do not count.**
   A rank is *gone* once the deciding process has watched its heartbeat fail to change for three
   polls (decision 12).
4. **A process that loses to its own role keeps the role's label on the item,** since the label
   is the winner's too.
5. **A claim is verified within one poll interval of its message,** or the process stands down.
6. **Only the rank whose claim message holds an item gives the claim back.** Standing down after
   a failed verification, setting an item down after a repeated failure before the worker
   (#173), and answering a stop remove the shared label only when the holder does them; any
   other rank drops out silently. A stop on a handed-over item is answered only by the holder,
   and other ranks ignore it.

**Rank**

7. **Rank comes from the systemd instance name,** `igor@<role>-<rank>`, with the rank always
   written as the name's last dash-separated part. The role's GitHub App identity is the same
   for every rank. The unit runs `igor serve %i` with no shell, and `igor serve` reads the
   role's credentials from `/etc/igor/<role>.env` itself, refusing any line other than a blank
   line, a `#` comment, `KEY='single-quoted'`, or `KEY=plain`, where a plain value holds only
   letters, digits and `_ . / : @ -`. A
   role's name is lowercase letters, digits and dashes, starting with a letter, and short enough
   that every worker user `igor-worker-<role>-<rank>` fits Linux's 32 characters.
8. **A role's processes share one identity and differ only by rank.** The roster, a list of ranks
   per role under `roster` in `igor.config.yaml`, declares which may run, and a role it does
   not name runs rank 1 only.
9. **Rank k starts at its k-th candidate, and contends only when it has fewer than k.** A
   contending rank waits `k − 1` settle intervals and re-reads before claiming. *Rejected:* a
   shuffled order, which makes collisions rarer but still produces claim-and-retract comments.
   Rank 1 comes first everywhere. The open change `directed-interaction` adds requests people
   make by mentioning an Igor; they join the one candidate list, ahead of found work, so rank 1
   takes the first request and the same contention applies to requests.
10. **A hand-over among one role's ranks goes through the same contest.** A rank taking over a
    handed-over item records the hand-over in its claim message, as `Igor-Handed-Over-By:
    <login>`, so the item still reads as handed over.
11. **`igor run <role>` runs as rank 1, and refuses when a process is serving rank 1,** naming
    it. It says what it is waiting for and for how long, half a poll interval plus one heartbeat
    write, before it decides. A role nobody serves runs by hand as before. Once it goes ahead it writes rank 1's
    heartbeat file with an id of its own, as decision 23 needs. `igor run --plan` changes
    nothing, skips the startup sweep, and may run beside a serving rank 1.

**Recovery and the abandonment bound**

12. **Each rank writes a heartbeat to its own file on the state branch every half poll
    interval,** from a timer of Igor's own, its first before its first cycle. The file holds an
    id the process picks at each start and a counter it increments on each write, and a process
    counts a sibling gone only once it has itself watched that file fail to change for three of
    its own polls. No time in the file is compared across processes. *Rejected:* judging by the
    file's age, which a rolled-back state branch defeats, and by the times in the file, which a
    clock stepped back defeats.
13. **A process reads all its role's heartbeat files in one request,** before choosing each
    candidate and before verifying.
14. **A gone rank's claims may be taken by any process,** which first removes the label and adds
    it again, then posts its claim message at once. Decision 15 is the one exception.
15. **A claim left on an item with the Igor's open pull request is caught up, whoever left it.**
    The process taking it over brings the pull request up to date rather than re-working the
    item, and gives the claim back, keeping a person's label. Taking over a gone rank's claim
    here, it does not remove and re-add the label as decision 14 does: its own claim message,
    carrying `Igor-Supersedes: <rank>`, supersedes the gone rank's for good.
16. **A rank removed from the roster shuts down:** it finishes its item or hands it off out
    loud, then exits with status 79 (decision 24). Siblings adopt its claims only if it dies
    first. A configuration read at a cycle that fails a starting process's checks is refused:
    the process goes on under the last configuration that passed and raises a condition naming
    the failing file and check. That condition is the read-cleared kind #171 defines in
    `stuck-conditions`. Under #171 the configuration read at a cycle includes the seat files, and
    a seat file the read finds removed takes effect even when the rest is refused, as #171 has
    it. That condition, like every condition, never makes the process exit.
17. **A process that cannot write its heartbeat for two intervals stands down,** starting no
    claim, and keeps the claim in silence, since a sibling may already have taken the item over.
    Igor's heartbeat timer checks for a stand-down at each firing and stops the worker itself,
    without waiting for a worker event.
18. **`ABSOLUTE_CEILING_MS` is removed.** A person's stop ends a worker that never finishes.
    Working trees are named `<role>-<rank>-<id>`, kept in `/var/lib/igor/trees` where every rank
    on the host sees them, and swept by rank, never by age. A sibling removes the trees of a gone
    rank the roster no longer declares, as that rank's worker user.

**Discovery and state**

19. **Discovery uses the lowest of the ranks' latest marks,** one mark per role and rank, never
    one per run, counting a sibling's only once this process has seen it alive. With every rank
    gone, it uses the lowest of every latest mark, no earlier than the cold start's look-back.
20. **A cycle appends its mark only after attempting every candidate,** and considers every
    labelled item whatever the mark, passing over before triage any item a live sibling holds.
    A cycle cut short holds its mark back as #101 has it do: the reasons a cycle that stops early
    holds its mark back, a stand-down among them, belong in #101's watermark rule, which
    this change cites. #101 does not name a stand-down yet; *Still open* lists that.
21. **Every state file more than one process writes is written so a retry discards nothing,**
    which for `discovery.json` and `deferred.json` means a log replayed on read.
22. **A `condition-backoff` probe (PR #101) records its rank and lapses when that rank is gone,**
    in place of the ceiling-based `SWEEP_AFTER_MS`.

**Decided in round four, 2026-10-18**

23. **A process that finds another's id in its own heartbeat file stops for good.** Each
    heartbeat write names the blob the process last wrote, so a write over another process's is
    refused, and a process then reads the file's id. An id not its own, written since it
    started, means another process took its rank: it stops its worker, leaves its claims, logs
    why, and exits with status 78. `igor run` writes rank 1's file the same way, so a rank 1
    that comes back beside it, or a run beside a restarted rank 1, stops. *Rejected:* nothing;
    before this, two processes at one rank was the operator's to prevent, and unhandled.
24. **A startup refusal exits with status 78, and a rank removed from the roster with 79.** The
    unit lists both in `RestartPreventExitStatus=` and 79 in `SuccessExitStatus=`, so systemd
    stops restarting: a refusal shows the unit failed, a retired rank inactive, each with Igor's
    reason in the journal. #82 defines 78; this change defines 79. No requirement to alert anyone
    comes back.
25. **The abandonment bound, the heartbeat period, the stand-down threshold and `igor run`'s
    wait follow the poll interval and have no settings of their own:** three intervals, half an
    interval, two intervals, and half an interval plus a fixed allowance for one heartbeat write,
    set from task 1.11's measurement. The poll interval stays configurable. TLC checked safety at
    the first three ratios; it does not time the allowance.
26. **An edited claim message counts for nothing.** A bot comment whose updated time differs
    from its created time is no claim message, and its trailers are not read, so an edit can
    neither fake nor erase `Igor-Supersedes:` or `Igor-Handed-Over-By:`.
27. **The holder of an item whose own pull request still merges triages it again only when the
    item or the pull request has updated since it last looked, or the pull request stops
    merging,** not every cycle.
28. **Readings of earlier decisions that Adam confirmed, needing no approval.** Round one's two rules on checkpoint gaps, a checkpoint at least every
    two poll intervals and a stand-down at one missed heartbeat where gaps were longer, are
    removed: the heartbeat timer of decision 17 stops a stood-down worker whatever the gap. A stop on a
    hand-over nobody has claimed is answered by the first rank to reach it. A single-quoted
    value in the role's environment file cannot hold a single quote. A key that file sets takes
    the place of the same key in the environment. A verification more than one poll interval
    late stands down silently, even for the rank that holds the item. On an item with no label
    that carries a gone rank's claim message, a taker adds the label, removes it and adds it
    again before posting.

**Still open:**

- **Measurements the requirements rest on:** same-second claim ids on GitHub (task 2.12),
  whether a label event's time and a comment's time come from one clock (task 2.15), and
  requests per cycle per rank against the App's rate limit (task 4.19), which a heartbeat every
  half interval raises.
- **Taking over on Linear,** where removing the label and adding it again has no counterpart
  (task 2.13).
- **Several ranks overshooting a seat's reserve line,** about two runs each, as #143 measured,
  since a run's reading arrives only after its first model call,
  which `design.md` leaves to be settled with #143.
- **Measurements added this round:** whether GitHub keeps an unedited bot comment's updated time
  equal to its created time, through reactions, hiding and an issue's transfer (task 2.18); if
  not, decision 26 makes every claim message stop counting, and comes back to Adam. And how long
  one heartbeat write takes, a retry after a conflict included, which `igor run`'s wait adds to
  half a poll interval (task 1.11).
- **A roster change reaches a running rank only through its lore checkout,** which nothing
  pulls until #176 is built (the lore checkout is the host's clone of the lore repository, which
  holds `igor.config.yaml`): a process rereads `igor.config.yaml` each cycle, so a person's pull
  on the host is what brings the change. Nothing is asked of Adam; it waits on #176.
- **What an adapter must supply.** The claim rules need each surface's sequence key, the time of
  an item's latest release and the times of its label events, and now a comment's created and
  updated times, but no `surface-adapter` requirement obliges an adapter to supply them.
- **Conflicts with other open changes, recorded and not resolved:**
  - #101 (`condition-backoff`, under review): its *Watermarks reduce reconsideration without
    governing it* lists the reasons a cycle that stops early holds its mark back, and decision 20
    has this change cite it for all of them, but it does not yet name a stand-down. Until it
    does, a cycle cut short by a stand-down has no rule holding its mark back (task 5.6).
  - #101: decision 22 has a probe lapse when its rank is gone, but a condition on a seat or on
    the whole Igor is shared by every role, and a process watches only its own role's heartbeat
    files, so a process of another role cannot tell whether the probe's rank is gone. Decision 22
    is in task 4.9 only, with no requirement.
  - `directed-interaction`: decision 9 has requests join the one candidate list, so contention
    applies to them, but a request is answered without a claim, and contention works by a higher
    rank finding a claim message after its wait. Two ranks can answer one mention. And with
    requests at the head of the list, a request waits while rank 1 is busy, since every other
    free rank starts further down, until a free rank, wrapping round from its later starting place, reaches it.
  - #150 (`two-gate`): a pull request of the Igor's own that still merges and carries a review
    to act on is work to resume under #150, while a catch-up here over such a pull request runs
    no worker. Task 5.14 merges the two deltas' text at archive, but what a catch-up does over
    such a pull request is Adam's to decide.
  - #173 (`pre-worker-breaker`): its scenario for a repeated failure in the claim window sets the
    item down, but a process whose verification fails counts as not holding the item here, so with several ranks a failure in the claim window, before verification shows who holds the
    item, is never counted as the holder's, while a failure after a verification that held still
    is. #173 lists this too.
- **For Adam, from the consistency read:**
  - **A settle interval as long as the poll interval** makes every verification late, so the role
    works nothing. Nothing refuses such a setting.
  - **A deleted claim message** vanishes as an edited one stops counting, so a person deleting
    the holder's message while it works lets a sibling take the item, as in
    `model/findings/EditedMessage.cfg`.
- **For Adam, from TLC:**
  - **Decision 23 stops one of two processes at one rank, but not before both can work one
    item.** TLC finds two workers on one item in two ways (`model/findings/`). An `igor run`
    may start while rank 1's worker still runs, since one failed heartbeat write during the
    run's half-interval wait makes rank 1 look unserved; rank 1 stops only at its next write or
    read. And a rank 1 restarted beside a running `igor run` takes the run's id for its
    predecessor's, then takes the run's claims as its predecessor's, while the run's worker
    goes on until the run's next write or read.
  - **A rollback past a start stops a live rank.** A state branch rolled back to a commit from
    before a process started can put back its predecessor's file, whose id is not its own and
    was not in the file at its start; the process then stops for good and exits with status 78.
    The model leaves this out.
  - **Decision 26 against a holder already working.** An edited claim message stops counting at
    once, so an edit to the holder's message while its worker runs makes the item look
    unclaimed to its siblings (see `design.md`, *An edited claim message counts for nothing*).
- **For Adam, a reading of decision 24:** one exit status cannot leave the unit failed in one
  case and inactive in the other, so a startup refusal uses 78 and a rank removed from the
  roster uses 79. A process that finds another's id uses 78, so its unit shows failed.

## Why

Capacity and identity are different things, and the claim protocol currently conflates them.

An Igor is one role with one identity, its GitHub App on GitHub, so a claim says which role has
your issue. Capacity is how many processes run behind that identity. Wanting more backend
throughput should mean starting more processes, not inventing a `backend-2` role — a second
`igor:` label that nobody asked for and that means nothing to a reader.

But two processes of one role cannot currently tell their claims apart. Both claim with the
role's `igor:<role>` label, and verification asks whether any *other* holder's label is on the
item. Neither finds one, so both answer that the claim is theirs. They would work the same item
in parallel and open two pull requests.

**Depends on `core-igor-loop` and `one-claiming-surface` (#156), both archived, and on three
open changes that archive first:** `condition-backoff` (#101), whose watermark rule the
discovery delta cites; `worker-user` (#175), whose worker users the sweep runs as and whose user
names the role-name check bounds; and `pre-worker-breaker` (#173), whose set-down is one of the
give-backs only the holder makes. The disambiguating mechanism, the claim message, already exists
for a different reason.

The universal skip for an item somebody else holds does not cover this. It cannot: an item only
the role's own label holds has to stay a candidate, or a claim left behind by a process that died
is never recovered. That is precisely the case a sibling's live claim is indistinguishable from.

## What Changes

**A process identifies itself, and a claim records which one took it.** Every claim already
posts a message after setting the holder field, naming the Igor and saying how to stop it. The
message gains the process's rank, and verification becomes a conjunction: the role's label is
the only holder, *and* the earliest claim message on the item that counts is this process's.

That is the mechanism the claim protocol already uses: storage ordering plus a settle interval.
Nothing new is introduced, and no coordinator, lease service or inbound endpoint appears.

**Ordering is the surface's own sequence key, never a timestamp.** GitHub returns comment
times to the second — `2026-09-15T01:11:12Z` — and sibling processes on one poll interval wake
together and claim inside the same second, so "earliest" is a tie exactly where the tiebreak is
needed. Simultaneity is the normal case here, not a rare race. Comment ids ascend strictly with
creation (measured: 5673068718, 5673143226, 5673525664 over an hour), so the id is a total order
where the timestamp is not. Each adapter exposes its surface's key as an opaque comparable, and
claim messages are never ordered against each other by time. Only the item's latest release, a
label event with no shared key, is compared with a message by time.

**A dead process's claim is recovered by identity, not by waiting.** A sibling can observe only
how old a claim is, and a worker bounded by silence rather than duration has no maximum age, so
no age is conclusive. Because only one process runs at a rank, a claim carrying a process's own
rank was left by a predecessor that is gone, and the restarted process takes the item back and
re-works it, or catches it up where the Igor's pull request is open. A sibling leaves it alone while the rank is alive, which the rank's heartbeat
shows, as *Retiring a rank is recorded, not detected* below says.

The cooldown does not cover this. It governs when a stopped or deferred item may be reconsidered,
not a claim nobody is behind.

**The worker's absolute ceiling goes.** `ABSOLUTE_CEILING_MS` killed a worker after 6 hours, and
set the age past which the startup sweep deleted a working tree. The sweep now goes by rank, and
Adam decided on 2026-10-13 to remove the ceiling entirely. A worker that keeps emitting events
and never finishes is then killed by no limit, which is accepted: a person's stop is honoured at
the next checkpoint. Once `budget-pacing` (#143) is built, the seat's reserve line, a spend
threshold per seat, also stops new items; this change does not wait for it.

**Retiring a rank is recorded, not detected.** A crash is not retirement: the supervisor restarts
the process and it recovers its own claim. Removing a process is a decision, and the roster — the
ranks that exist, declared like seats — is where it is recorded. A removed rank shuts down as
when its supervisor stops the process, finishing or handing off its item, and its claims are freed by the abandonment
bound only if it dies first, as are those of a rank left declared that no longer runs. Each
process writes a heartbeat to its own file on the state branch every half poll interval, from a
timer of its own that keeps running while a worker runs, and its first one before its first
cycle: a counter it increments on each write, beside an id picked at each start. A process counts a sibling gone only after it has itself watched the sibling's counter
fail to change for three of its own poll intervals, 30 minutes at the default poll; any process
may then take the sibling's claims. No time in the file is compared, so neither a clock stepped
back nor a lost, reset or rolled-back state branch makes a live rank look gone. A process that
cannot write its heartbeat for two intervals stands down: it starts no claim, and the heartbeat
timer stops its worker. A process taking over an item from a gone rank first removes the
label and adds it again. Without that, the gone rank's old claim message would count again when
the rank returned, and both would work the item. The bound governs how long an unattended claim
may sit, never how long work may run: a working process keeps writing heartbeats.

**Discovery may hand the same candidate to several processes**, and that is allowed to happen.
Watermarks are a cache, so the cost is duplicated triage rather than duplicated work; the claim
protocol resolves the race after it. Preventing the overlap would need coordination this
design has done without everywhere else.

**Processes saving one source keep the lower watermark.** Each rank's latest mark for a source
counts, and discovery uses the lowest of them, until a rank passes the abandonment bound and stops
counting. A mark is an issue update time, and discovery triages only issues updated after it.
A mark too low costs repeated triage; a mark too high skips issues a sibling has not taken,
until the issue is updated again, such as by a new comment. When every rank is gone,
discovery uses the lowest of every rank's latest mark rather than starting cold.
A cycle appends its mark only after attempting every candidate, so a crash between triage and
the claims loses no item. Every cycle also considers each item carrying its role's label,
whatever the mark, so a crashed rank's claim is found even below every mark.

**Each process has a rank, and rank decides both where it starts and when it may act.**

Rank is a number given to a process when it is started — not discovered, not negotiated, and
needing no registry: rank 3 waits its turn whether or not a rank 2 exists, and a gap costs only
the wait. One process per rank is an operator invariant, in the same class as not declaring two
seats with one id.

*Rank is a starting offset.* Given roughly the same candidate list, rank 1 begins at the first
item, rank 2 at the second, rank 3 at the third. A rank k with at least k candidates starts at
one no lower rank starts at, and does not wait. Its later candidates can still collide, and
verification resolves those.

*Rank is also a delay, for when it has fewer.* Rank k waits `(k-1)` settle intervals before
acting on a contested item, and then **reads before claiming**. Seeing the item already taken,
it moves on silently. This is the property a shuffle cannot give: a shuffle makes a collision
less likely. Under rank, the higher rank waits, so the lower rank reads the item first and claims
it, and the higher rank then sees the claim and moves on; a retraction is left only where two
ranks both read the item before either has posted. The cost of a
collision was never the wasted request — it was the claim-and-retract comment landing on
somebody's issue.

The interval is `settleSeconds`, which already means "long enough for a claim to become visible
to someone else". That is exactly what a lower rank is waiting for, so it is not a second number
to keep in agreement with the first.

Capacity is therefore consumed in rank order, the same shape as a seat pool taking the first
with headroom. A persistently thin queue leaves the highest ranks idle, which is the correct
outcome.

**Processes attempt candidates in different orders.** Today every process sorts its candidates
the same way, oldest first, and keeps the first ten, so every process receives the same list and
every process tries the first item first. N−1 lose it, then N−2 lose the
second, and so on — quadratic wasted claims, each burning a settle interval and posting a claim
comment that is immediately retracted. Diverging the order makes a collision incidental instead
of guaranteed, and costs only the rank offset above.

**Concurrent state writes conflict, and a conflicted write is retried rather than fatal.** Today
one throws and the cycle is reported as failed, which is recoverable but reads as a defect.

The conflict cannot be laid out away. Measured against the Contents API: two concurrent writes
to **different paths** on one branch still return 409 — `is at f3b1c59… but expected 93283b5…` —
because the conflict is on the branch ref, not the blob. Per-process files buy nothing. A retry
once the ref settles succeeds.

So retry is mandatory, and the only question is whether it is *correct*. **State becomes
append-only, which is what makes it so.** `discovery.json` and `deferred.json` are both folds
over a stream — for discovery, each rank's latest mark per source and then the lowest across
the ranks that count; for deferrals, the last record per item — so each can be a log that is
replayed on read. Retrying then means re-reading and re-appending the same line:
order-independent, and incapable of clobbering. Retrying a read-modify-write of a keyed map
means re-applying a semantic change to a base that moved, and the naive form of it — reissuing
the same bytes with a fresh sha — silently destroys whatever the other writer just recorded.

Explicitly out of scope:

- **Partitioning work between processes.** Handing each a disjoint slice would remove the race
  rather than resolve it, and requires a coordinator — the thing polling exists to avoid.
- **Knowing how many processes are running.** Nothing needs the number. A design that has to
  count its own instances has grown a registry.
- **Per-process budget.** Seats are shared and the gate is checked before each item, so
  concurrency spends faster without spending differently.

  The tracker's rate limit is not like that, and is worth knowing before scaling ranks.
  Measured on a personal account: `core` (REST) allows 5,000 requests an hour, `graphql`
  5,000 points, and `search` 30 a minute — three separate budgets, each held by the identity
  making the requests. Discovery runs on `graphql` so it does not compete; claims, comment reads
  and every state read and write land in `core`.

  Each role acting as its own GitHub App therefore gives each role its own budgets. But
  processes of one role share their App, so N ranks divide one budget rather than multiplying
  it. Nothing here bounds that, and nothing needs to yet; it is the ceiling on how far ranks
  scale, and it is reached by request count rather than by spend.

## Capabilities

### Modified Capabilities

- `work-claiming`: A claim is held by the process that took it, not by the role's identity.
  Verification distinguishes a sibling process from the Igor itself, candidates are attempted
  in an order that differs between processes, a hand-over goes through the same contest, the
  claims of a rank whose heartbeat stops changing for three poll intervals become adoptable, and a claim left on the Igor's
  open pull request is caught up whoever left it. `igor run` refuses beside a serving rank 1. A
  process that finds another's id in its heartbeat file stops for good, a retired rank exits with
  status 79, and an edited claim message counts for nothing.
- `work-triage`: An item a live sibling holds is passed over before triage, a claim this
  process takes over on the Igor's own pull request is not skipped as work in flight, and an
  item the process holds whose pull request still merges is triaged again only once it changes.
- `work-discovery`: A conflicted state write is retried rather than failing the cycle, and
  processes saving one source keep the lower watermark.
- `task-execution`: The worker's absolute ceiling is removed, and the sweep removes working
  trees by rank rather than by age.
- `role-config`: A role's processes share one identity and differ only by rank, the roster
  declares the ranks each role may run, a process is named `<role>-<rank>`, a role's name fits
  its worker users, and `igor serve` reads the role's environment file itself, which holds
  single-quoted or plain values. The poll interval stays configurable, and the four timings
  derived from it have no settings. The in-force scenarios that start `igor serve reviewer` give
  the rank.
- `surface-adapter`: The in-force scenarios that start `igor serve reviewer` give the rank.
- `graceful-handoff`: A rank that stood down, does not hold the item, or found another's id in
  its heartbeat file ends its part in silence.

## Impact

- Makes the settle interval load-bearing where it has so far been precautionary: with one
  process there was nothing to race.
- Duplicated triage of an item no process has claimed becomes an ordinary cost of running
  several processes.
- The failure this prevents — two pull requests for one issue — is the most visible kind of
  misfire an Igor can produce, in front of exactly the people the claim was meant to reassure.
