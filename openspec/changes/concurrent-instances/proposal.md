## Decisions

Adam decided these on 2026-10-13 and 2026-10-17. `design.md` gives the reasoning for each.

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
   polls (decision 11).
4. **A process that loses to its own role keeps the role's label on the item,** since the label
   is the winner's too.
5. **A claim is verified within one poll interval of its message,** or the process stands down.

**Rank**

6. **Rank comes from the systemd instance name,** `igor@<role>-<rank>`, with the rank always
   written as the name's last dash-separated part. The role's GitHub App identity is the same
   for every rank. One template unit loads the role's credentials from `/etc/igor/<role>.env`
   through a shell wrapper, and a starting process refuses that file unless every value in it is
   single-quoted or plain: made only of letters, digits and `_ . / : @ -`.
7. **A role's processes share one identity and differ only by rank.** The roster, a list of ranks
   per role under `roster` in `igor.config.yaml`, declares which may run, and a role it does
   not name runs rank 1 only.
8. **Rank k starts at its k-th candidate, and contends only when it has fewer than k.** A
   contending rank waits `k − 1` settle intervals and re-reads before claiming. *Rejected:* a
   shuffled order, which makes collisions rarer but still produces claim-and-retract comments.
   Rank 1 comes first everywhere: the open change `directed-interaction`, which adds requests
   people make by mentioning an Igor as their own list of candidates, now has rank 1 start at the
   first request too.
9. **A hand-over among one role's ranks goes through the same contest.** A rank taking over a
   handed-over item records the hand-over in its claim message, as `Igor-Handed-Over-By:
   <login>`, so the item still reads as handed over.
10. **`igor run <role>` runs as rank 1, and refuses when a process is serving rank 1,** naming
    it. A role nobody serves runs by hand as before.

**Recovery and the abandonment bound**

11. **Each rank writes a heartbeat to its own file on the state branch every poll interval,** its
    first before its first cycle. The file holds a counter the rank increments on each write,
    and a process counts a sibling gone only once it has itself watched that counter fail to
    change for three of its own polls. No time in the file is compared across processes.
    *Rejected:* judging by the file's age, which a rolled-back state branch defeats, and by the
    times in the file, which a clock stepped back defeats.
12. **A process reads all its role's heartbeat files in one request,** before choosing each
    candidate and before verifying.
13. **A gone rank's claims may be taken by any process,** which first removes the label and adds
    it again, then posts its claim message at once. Decision 14 is the one exception.
14. **A claim left on an item with the Igor's open pull request is caught up, whoever left it.**
    The process taking it over brings the pull request up to date rather than re-working the
    item, and gives the claim back, keeping a person's label. Taking over a gone rank's claim
    here, it does not remove and re-add the label as decision 13 does: its own claim message
    supersedes the gone rank's for good.
15. **A rank removed from the roster shuts down:** it finishes its item or hands it off out
    loud, then exits. Siblings adopt its claims only if it dies first.
16. **A process that cannot write its heartbeat for two intervals stands down,** starting no
    claim and stopping its worker at the next checkpoint, and keeps the claim in silence, since
    a sibling may already have taken the item over. A worker reaches a checkpoint at least once
    every two intervals; where it can go longer than one, the process stands down at one
    missed heartbeat.
17. **`ABSOLUTE_CEILING_MS` is removed.** A person's stop ends a worker that never finishes.
    Working trees are named by role and rank, kept in `/var/lib/igor/trees` where every rank on
    the host sees them, and swept by rank, never by age.

**Discovery and state**

18. **Discovery uses the lowest of the ranks' latest marks,** counting a sibling's only once this
    process has seen it alive. With every rank gone, it uses the lowest of every latest mark, no
    earlier than the cold start's look-back.
19. **A cycle appends its mark only after attempting every candidate,** and considers every
    labelled item whatever the mark, passing over before triage any item a live sibling holds.
20. **Every state file more than one process writes is written so a retry discards nothing,**
    which for `discovery.json` and `deferred.json` means a log replayed on read.
21. **A `condition-backoff` probe (PR #101) records its rank and lapses when that rank is gone,**
    in place of the ceiling-based `SWEEP_AFTER_MS`.

**Still open:**

- **Checkpoints on `main` wait for a worker event** (task 4.15). The claim is re-read on a
  worker event at most every 30 seconds, and a worker may go 5 minutes without one while the
  model writes a turn and 30 minutes while a tool runs. That breaks the rule of a checkpoint
  every two intervals at the default 10-minute poll. A stand-down needs no tracker read, so it
  could stop the worker on a timer instead.
- **Whether a run by hand may wait a poll interval.** To see rank 1's counter change, `igor run`
  waits one poll interval before running, 10 minutes at the default. The question is whether
  that wait is acceptable, or a run by hand should start at once and risk running beside rank 1.
  Either way, a served rank 1 that has stood down looks unserved.
- **Whether `igor run --plan` may run beside a serving rank 1.** It claims nothing, but its
  startup sweep would remove rank 1's trees, so the spec refuses it too. A plan that sweeps
  nothing could be allowed.
- **Adam to confirm: "the counter advanced" read as "the file changed".** A restarted rank cannot
  trust its own file for where its counter stood, since a lost or rolled-back state branch puts
  an older one back. So the spec has the file also hold an id the process picks at start, and
  counts a heartbeat when the id and counter differ from the last read, not only when the
  counter is higher. A rolled-back file then reads as changed once, which postpones a gone
  verdict and never hastens one.
- **How a superseding claim message is told from a contending one.** Decision 14 makes the gone
  rank's message stop counting for good, but its rank, returning, cannot tell an adopter's later
  message from a contender's unless the message says so. Task 2.14 proposes a trailer,
  `Igor-Supersedes: <rank>`.
- **Measurements the requirements rest on:** same-second claim ids on GitHub (task 2.12),
  whether a label event's time and a comment's time come from one clock (task 2.15), and
  requests per cycle per rank against the App's rate limit (task 4.19).
- **The role's environment file is read by the shell before Igor checks it,** so a `$(...)` in
  an unquoted or double-quoted value has already run when Igor refuses to start. A check the
  unit runs before the dot command would refuse first.
- **Other give-backs still remove the shared label.** A process keeps the label when it loses to
  a sibling, but the in-force rules have a failed verification, or a failure before the worker,
  release the claim, which removes the label a sibling's winning claim shares.
- **A stop on a handed-over item that another rank is working.** The in-force rule has the Igor
  remove the label and post a receipt when it sees a stop while no run of its own is active. A
  rank cannot see a sibling's run, so a rank not working the item could remove the label and
  post a receipt while the sibling's run carries on, until the sibling's next checkpoint.
- **Taking over on Linear,** where removing the label and adding it again has no counterpart
  (task 2.13).
- **Several ranks overshooting a seat's reserve line,** one run each, which `design.md` leaves to
  be settled with #143.
- **`igor serve <role>` with no rank is refused** under decision 6, while the in-force
  `role-config` and `surface-adapter` scenarios, `README.md` and `deploy/docker-compose.yml`
  still start a role by its name alone. Task 6.4 updates the docs and the compose file; the
  in-force scenarios are not changed here.

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

**Depends on `core-igor-loop` and `one-claiming-surface` (#156), both archived.** Nothing else
is needed: the disambiguating mechanism, the claim message, already exists for a different
reason.

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
process writes a heartbeat to its own file on the state branch every poll interval, including
while a worker runs, and its first one before its first cycle: a counter it increments on each
write. A process counts a sibling gone only after it has itself watched the sibling's counter
fail to change for three of its own poll intervals, 30 minutes at the default poll; any process
may then take the sibling's claims. No time in the file is compared, so neither a clock stepped
back nor a lost, reset or rolled-back state branch makes a live rank look gone. A process that
cannot write its heartbeat for two intervals stands down: it starts no claim, and its worker
stops at its next checkpoint. A process taking over an item from a gone rank first removes the
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
  claims of a rank that misses three heartbeats become adoptable, and a claim left on the Igor's
  open pull request is caught up whoever left it. `igor run` refuses beside a serving rank 1.
- `work-triage`: An item a live sibling holds is passed over before triage, and a claim this
  process takes over on the Igor's own pull request is not skipped as work in flight.
- `work-discovery`: A conflicted state write is retried rather than failing the cycle, and
  processes saving one source keep the lower watermark.
- `task-execution`: The worker's absolute ceiling is removed, and the sweep removes working
  trees by rank rather than by age.
- `role-config`: A role's processes share one identity and differ only by rank, the roster
  declares the ranks each role may run, a process is named `<role>-<rank>`, and the role's
  environment file holds single-quoted or plain values.

## Impact

- Makes the settle interval load-bearing where it has so far been precautionary: with one
  process there was nothing to race.
- Duplicated triage of an item no process has claimed becomes an ordinary cost of running
  several processes.
- The failure this prevents — two pull requests for one issue — is the most visible kind of
  misfire an Igor can produce, in front of exactly the people the claim was meant to reassure.
