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

## What Changes

**A process identifies itself, and a claim records which one took it.** Every claim already
posts a message — added so a message-only surface can say *which* Igor holds something. It
gains an instance marker, and verification becomes a conjunction: the account is among the
holders, *and* the earliest claim message on the item is this process's.

That is the mechanism already committed to for surfaces with no holder field: storage ordering
plus a settle interval. Nothing new is introduced, and no coordinator, lease service or
inbound endpoint appears.

**Processes are interchangeable and hold nothing.** A process that dies mid-item leaves a claim
its siblings will not adopt — the tracker still shows the item held, and the cooldown returns
it to the pool. Correctness never depends on knowing whether a process is alive.

**Discovery may hand the same candidate to several processes**, and that is allowed to happen.
Watermarks are a cache, so the cost is duplicated triage rather than duplicated work; the claim
protocol resolves the race after it. Preventing the overlap would need coordination this
design has done without everywhere else.

**Concurrent state writes conflict, and a conflicted write is retried rather than fatal.** Two
processes advancing a watermark race on the same blob. Today one throws and the cycle is
reported as failed, which is recoverable but reads as a defect.

Explicitly out of scope:

- **Partitioning work between processes.** Handing each a disjoint slice would remove the race
  rather than resolve it, and requires a coordinator — the thing polling exists to avoid.
- **Knowing how many processes are running.** Nothing needs the number. A design that has to
  count its own instances has grown a registry.
- **Per-process budget.** Seats are shared and the gate is checked before each item, so
  concurrency spends faster without spending differently.

## Capabilities

### Modified Capabilities

- `work-claiming`: A claim is held by the process that took it, not by the account. Verification
  distinguishes a sibling process from the Igor itself, and an item assigned to someone else as
  well as to the Igor reads as lost rather than held.
- `work-discovery`: A conflicted state write is retried rather than failing the cycle.

## Impact

- Makes the settle interval load-bearing where it has so far been precautionary: with one
  process there was nothing to race.
- Duplicated triage becomes an ordinary cost of running several processes, visible in the
  decision log rather than hidden.
- The failure this prevents — two pull requests for one issue — is the most visible kind of
  misfire an Igor can produce, in front of exactly the people the claim was meant to reassure.
