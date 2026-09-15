## Why

Capacity and identity are different things, and the claim protocol currently conflates them.

An Igor is one named teammate with one account, so a claim says who has your issue. Capacity is
how many processes run behind that name. Wanting more backend throughput should mean starting
more processes, not inventing `igor-backend-2` — a second name in the assignee field that
nobody asked for and that means nothing to a reader.

But two processes of one Igor cannot currently tell their claims apart. `verifyClaim` asks "am
I among the assignees", both are `igor-backend`, and both answer yes. They would work the same
item in parallel and open two pull requests.

**Depends on `core-igor-loop`.** Nothing else is needed: the disambiguating mechanism already
exists for a different reason.

The universal skip for an item somebody else holds does not cover this. It cannot: an item only
the Igor's account holds has to stay a candidate, or a claim left behind by a process that died
is never recovered. That is precisely the case a sibling's live claim is indistinguishable from.

## What Changes

**A process identifies itself, and a claim records which one took it.** Every claim already
posts a message — added so a message-only surface can say *which* Igor holds something. It
gains an instance marker, and verification becomes a conjunction: the account is among the
holders, *and* the earliest claim message on the item is this process's.

That is the mechanism already committed to for surfaces with no holder field: storage ordering
plus a settle interval. Nothing new is introduced, and no coordinator, lease service or
inbound endpoint appears.

**Ordering is the surface's own sequence key, never a timestamp.** GitHub returns comment
times to the second — `2026-09-15T01:11:12Z` — and sibling processes on one poll interval wake
together and claim inside the same second, so "earliest" is a tie exactly where the tiebreak is
needed. Simultaneity is the normal case here, not a rare race. Comment ids ascend strictly with
creation (measured: 5673068718, 5673143226, 5673525664 over an hour), so the id is a total order
where the timestamp is not. Each adapter exposes its surface's key as an opaque comparable, and
nothing in the claim path compares times.

**A dead process's claim is recovered by identity, not by waiting.** A sibling can observe only
how old a claim is, and a worker bounded by silence rather than duration has no maximum age, so
no age is conclusive. Because only one process runs at a rank, a claim carrying a process's own
rank was left by a predecessor that is gone: it takes the item back and re-works it. A sibling
leaves it alone. Correctness still never depends on knowing whether a process is alive — the
question is whose claim it is, which does not decay.

The cooldown does not cover this. It governs when a stopped or deferred item may be reconsidered,
not a claim nobody is behind.

**Retiring a rank is recorded, not detected.** A crash is not retirement: the supervisor restarts
the process and it recovers its own claim. Removing a process is a decision, and the roster — the
ranks that exist, declared like seats — is where it is recorded, so scaling down releases the
orphan on the next cycle. An abandonment bound backs it up for the one case the roster cannot
cover, a rank left declared that no longer runs. That bound governs how long an unattended claim
may sit, never how long work may run, so it cuts nothing short.

**Discovery may hand the same candidate to several processes**, and that is allowed to happen.
Watermarks are a cache, so the cost is duplicated triage rather than duplicated work; the claim
protocol resolves the race after it. Preventing the overlap would need coordination this
design has done without everywhere else.

**Each process has a rank, and rank decides both where it starts and when it may act.**

Rank is a number given to a process when it is started — not discovered, not negotiated, and
needing no registry: rank 3 waits its turn whether or not a rank 2 exists, and a gap costs only
the wait. One process per rank is an operator invariant, in the same class as not declaring two
seats with one id.

*Rank is a starting offset.* Given roughly the same candidate list, rank 1 begins at the first
item, rank 2 at the second, rank 3 at the third. Where there are at least as many items as
processes, nothing collides and nothing waits.

*Rank is also a delay, for when there are not.* Rank k waits `(k-1)` settle intervals before
acting on a contested item, and then **reads before claiming**. Seeing the item already taken,
it moves on silently. This is the property a shuffle cannot give: a shuffle makes a collision
less likely, while a lower rank that looks first makes the retraction impossible. The cost of a
collision was never the wasted request — it was the claim-and-retract comment landing on
somebody's issue.

The interval is `settleSeconds`, which already means "long enough for a claim to become visible
to someone else". That is exactly what a lower rank is waiting for, so it is not a second number
to keep in agreement with the first.

Capacity is therefore consumed in rank order, the same shape as a seat pool taking the first
with headroom. A persistently thin queue leaves the highest ranks idle, which is the correct
outcome and a question the decision log should be able to answer.

**Processes attempt candidates in different orders.** Nothing sorts or shuffles today: GitHub's
search order flows through discovery, screening and triage unchanged, so every process receives
the same list and every process tries the first item first. N−1 lose it, then N−2 lose the
second, and so on — quadratic wasted claims, each burning a settle interval and posting a claim
comment that is immediately retracted. Diverging the order makes a collision incidental instead
of guaranteed, and costs a shuffle.

**Concurrent state writes conflict, and a conflicted write is retried rather than fatal.** Today
one throws and the cycle is reported as failed, which is recoverable but reads as a defect.

The conflict cannot be laid out away. Measured against the Contents API: two concurrent writes
to **different paths** on one branch still return 409 — `is at f3b1c59… but expected 93283b5…` —
because the conflict is on the branch ref, not the blob. Per-process files buy nothing. A retry
once the ref settles succeeds.

So retry is mandatory, and the only question is whether it is *correct*. **State becomes
append-only, which is what makes it so.** `discovery.json` and `deferred.json` are both folds
over a stream — the newest `updatedAt` per source, the last record per item — so each can be a
log that is replayed on read. Retrying then means re-reading and re-appending the same line:
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
  5,000 points, and `search` 30 a minute — three separate budgets, and the limit is per
  *account*. Discovery runs on `graphql` so it does not compete; claims, comment reads and
  every state read and write land in `core`.

  One machine account per Igor therefore buys each Igor its own 5,000 an hour, which is a
  capacity argument for per-Igor accounts on top of identity. But processes of one Igor share
  an account, so N ranks divide one budget rather than multiplying it. Nothing here bounds
  that, and nothing needs to yet; it is the ceiling on how far ranks scale, and it is reached
  by request count rather than by spend.

## Capabilities

### Modified Capabilities

- `work-claiming`: A claim is held by the process that took it, not by the account. Verification
  distinguishes a sibling process from the Igor itself.
- `work-discovery`: A conflicted state write is retried rather than failing the cycle, and
  candidates are attempted in an order that differs between processes.

## Impact

- Makes the settle interval load-bearing where it has so far been precautionary: with one
  process there was nothing to race.
- Duplicated triage becomes an ordinary cost of running several processes, visible in the
  decision log rather than hidden.
- The failure this prevents — two pull requests for one issue — is the most visible kind of
  misfire an Igor can produce, in front of exactly the people the claim was meant to reassure.
