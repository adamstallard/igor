## Decisions

Adam decided these on 2026-10-13, 2026-10-17, 2026-10-18 and 2026-10-19. `design.md` gives the
reasoning for each. Decisions 29 to 38 are his latest answers: 29 to 37 on 2026-10-18 after the
others, and 38 on 2026-10-19. Where they replace an earlier decision, the earlier one is
rewritten to match.

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
9. **Each item has an owner, by a hash of its id over the roster's ranks, and the owner goes
   first** (decision 31). Where the owner is not available, the next available rank after it, in
   roster order and wrapping, goes first. A rank attempts the items it goes first for before the
   others, and waits one settle interval per available rank ahead of it before claiming any
   other item. *Rejected:* a shuffled order, which makes collisions rarer but still produces
   claim-and-retract comments; and a start place per rank, rank k at its k-th candidate, which
   the hash replaced.
10. **A hand-over among one role's ranks goes through the same contest.** A rank taking over a
    handed-over item records the hand-over in its claim message, as `Igor-Handed-Over-By:
    <login>`, so the item still reads as handed over.
11. **`igor run <role>` runs as rank 0, outside the roster, with its own heartbeat file**
    (decision 29), and spends the token in `IGOR_RUN_TOKEN`, as #171 records. It starts at once, beside any serving rank, and contends for items as any rank
    does. It takes over no claim message, its own rank's included, and removes only its own trees
    (decision 38).
    `igor run --plan` changes nothing and removes no tree.

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
    loud, then exits with status 0 (decision 32). Siblings adopt its claims only if it dies
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
    Working trees are named `<role>-<rank>-<id>`, kept where #175 puts them, which every rank
    on the host sees, and swept by rank, never by age. A sibling removes the trees of a gone
    rank the roster no longer declares, as #175's release removes them. No serving rank removes rank
    0's trees; each `igor run` removes only its own (decision 38).

**Discovery and state**

19. **Discovery uses the lowest of the ranks' latest marks,** one mark per role and rank, never
    one per run, counting a sibling's only once this process has seen it alive. With every rank
    gone, it uses the lowest of every latest mark, no earlier than the cold start's look-back.
20. **A cycle appends its mark only after attempting every candidate,** and considers every
    labelled item whatever the mark, passing over before triage any item a live sibling holds.
    A cycle cut short holds its mark back as #101's watermark rule has it do. That rule lists
    every reason a cycle holds its mark back, and this change adds a stand-down to the list with a `MODIFIED` block (decision 36).
21. **Every state file more than one process writes is written so a retry discards nothing,**
    which for `discovery.json` and `deferred.json` means a log replayed on read.
22. **A `condition-backoff` probe (PR #101) records its rank and lapses when that rank is gone,**
    in place of the ceiling-based `SWEEP_AFTER_MS`.

**Decided on 2026-10-18, round four**

23. **Removed by decision 29.** It had a process that found another's id in its heartbeat file
    stop for good.
24. **A startup refusal exits with status 78** (#82). A rank removed from the roster exits with
    status 0 (decision 32).
25. **The abandonment bound, the heartbeat period and the stand-down threshold follow the poll
    interval and have no settings of their own:** three intervals, half an interval and two
    intervals. The poll interval stays configurable. TLC checked safety at these ratios.
26. **An edited claim message counts for nothing.** A bot comment GitHub reports as edited, by
    GraphQL `lastEditedAt`, is no claim message, and its trailers are not read, so an edit can
    neither fake nor erase `Igor-Supersedes:` or `Igor-Handed-Over-By:`. A hidden or unhidden
    message still counts (Adam, 2026-10-18, from task 2.18's measurement: hiding changes REST
    `updated_at` with no edit, and `lastEditedAt` changes only on an edit).
27. **The holder of an item whose own pull request still merges triages it again only when the
    item or the pull request has updated since it last looked, the pull request stops merging,
    or it carries a review to act on** (decision 34), not every cycle.
28. **Readings of earlier decisions that Adam confirmed, needing no approval.** Round one's two rules on checkpoint gaps, a checkpoint at least every
    two poll intervals and a stand-down at one missed heartbeat where gaps were longer, are
    removed: the heartbeat timer of decision 17 stops a stood-down worker whatever the gap. A stop on a
    hand-over nobody has claimed is answered by the first rank to reach it. A single-quoted
    value in the role's environment file cannot hold a single quote. A key that file sets takes
    the place of the same key in the environment. A verification more than one poll interval
    late stands down silently, even for the rank that holds the item. On an item with no label
    that carries a gone rank's claim message, a taker adds the label, removes it and adds it
    again before posting.

**Decided on 2026-10-18 and 2026-10-19, Adam's latest answers**

29. **`igor run` runs as rank 0, outside the roster, with its own heartbeat file.** It contends
    for items like any rank, so `NoTwoWorkers` covers it, never takes over another rank's claims,
    and sweeps only its own trees. Fencing by start id, the requirement that stopped a process
    for good on a foreign id, and `igor run`'s wait are removed. *Rejected:* `igor run` as rank 1
    with a fence, which TLC showed still let both processes work one item.
30. **The edited or deleted claim message risk is accepted.** An edit or deletion of the
    holder's message while it works lets a sibling take the item (`model/findings/EditedMessage.cfg`).
    Adam's reason: only a person with maintain or admin access can edit or delete the bot's
    comment. Task 2.19 measures that; if less access is enough, this comes back to him.
31. **Ranks choose items by a hash-assigned owner, and the claim stays.** It replaces a start
    place per rank (decision 9). A stale heartbeat read can only cause contention, which the
    claim settles; `negative/NoVerifyClaims.cfg` shows the claim is still needed.
32. **A rank removed from the roster exits with status 0; a refusal exits 78.** The unit uses
    `Restart=on-failure` with `RestartPreventExitStatus=78`, as #82 has it, so a retired rank
    stays down. Compose restarts every exit under #82, so there a rank is retired by removing its
    service, as #82 says. Status 79 and `SuccessExitStatus=79` are gone.
33. **A heartbeat says whether its rank is available:** free, and with a seat it can spend, as
    #143's *A role has a seat it can spend when the gate would choose one now* defines: some seat
    the role may draw on is below its reserve line and not held back by pacing. Only available ranks go first
    for an item.
34. **A review to act on means resume.** On a held pull request that still merges, a review to
    act on counts as something changed, and the holder runs a worker over it, as #150 says. A
    catch-up with no such review stays worker-free.
35. **The settle interval must be shorter than the poll interval;** a configuration that sets it
    otherwise is refused, naming both values.
36. **#101's watermark rule names a stand-down, through a `MODIFIED` block this change carries**
    on *Watermarks reduce reconsideration without governing it*. This change archives after
    #101, in the order issue #204 states for every open change.
37. **A mention is answered by the first available rank from its hash owner, with no claim.**
    Each rank works out the mention's order itself and answers only where it finds itself first;
    with no rank available, the mention waits for the next cycle. Usually one reply; a stale
    heartbeat can bring a second, with no hard limit, which Adam chose over a limit because a
    duplicate reply is harmless and waiting is the worse failure. `directed-interaction`'s
    proposal records it.
38. **Two `igor run`s of one role at once share no tree and no home** (Adam, 2026-10-19). Each run
    picks a run id at its start, every tree id it gives starts with that run id, and it removes
    only its own trees. Each run also gets a home of its own, the `HOME` its worker runs in;
    #174 (`pinned-skills`) is to specify it, and #174 as last pushed keeps one home per role.

**Still open:**

- **Measurements the requirements rest on:** requests per cycle per rank against the App's rate
  limit, and the limit an App installation gets (task 4.19), which a heartbeat every half
  interval raises; a request that reads every heartbeat file with its contents at once (task
  4.11); and which roles can edit the bot's comment (task 2.19). Tasks 2.12, 2.15 and 2.18 are
  measured, and `design.md` records them.
- **Taking over on Linear,** where removing the label and adding it again has no counterpart
  (task 2.13).
- **Several ranks overshooting a seat's reserve line,** about two runs each, as #143 measured,
  since a run's reading arrives only after its first model call,
  which `design.md` leaves to be settled with #143.
- **A roster change reaches a running rank only through its lore checkout,** which nothing
  pulls until #176 is built (the lore checkout is the host's clone of the lore repository, which
  holds `igor.config.yaml`): a process rereads `igor.config.yaml` each cycle, so a person's pull
  on the host is what brings the change. Nothing is asked of Adam; it waits on #176.
- **What an adapter must supply.** The claim rules need each surface's sequence key, the time of
  an item's latest release and the times of its label events, and whether a comment was edited
  (GraphQL `lastEditedAt`), but no `surface-adapter` requirement obliges an adapter to supply them.
- **For Adam, from TLC: two `igor run`s of one role can still both work one item.** Decision 38
  keeps their trees and homes apart, but both run at rank 0 and a claim message names only the
  rank, so each reads the earliest message as its own claim and works the item
  (`model/findings/TwoRuns.cfg`). One answer: the claim message also carries the run's id, and
  verification compares it where the rank is 0.
- **For Adam: two `igor run`s at once still share rank 0's heartbeat file and its discovery
  mark.** Where one run crashes holding a claim while the other goes on, the survivor's writes
  keep rank 0 from reading as gone, so the claim waits until the survivor also stops: serving
  ranks take over rank 0's claims only once rank 0 is gone, and a run takes over nothing. The
  file's availability also flips between the two runs' values.
- **For Adam: a crashed `igor run`'s trees** are removed by no process: no serving rank removes a
  rank-0 tree, and every later run removes only its own. They stay until a person removes them.
- **For Adam, from the consistency read:**
  - **Who can edit the bot's comment.** Decision 30 accepts the edited-message risk because only
    maintain or admin access can edit a bot's comment, but `design.md` had read GitHub as letting
    write or triage access do it. Task 2.19 measures it; if write access is enough, the accepted
    risk is wider than the one decided.
  - **#82 and #173 archive after this change in #204's order,** yet this change cites #82's
    restart policy, which keeps a retired rank down, and #173's set-down. Until #82 archives, the
    in-force unit restarts a process that exits 0 (`Restart=always`), and each restart is then
    refused. Either #204's order moves #82 and #173 ahead of this change, or the citations stand
    as pointers to changes still open.
  - **A process whose claim message failed to post removes the label it set** where no other
    message counts. That is an exception to decision 6 that no decision lists, and the model
    does not cover it; a sibling may have set the same label and be about to post. It predates
    Adam's latest answers.
  - **Which lore commit the ranks read.** Issue #176 lists this as settled in #179, this change,
    but it does not settle it: ranks reading different checkouts can compute different owners and see
    different rosters. A different owner costs only contention; a different roster changes who
    retires.
  - **#150's actionable review is defined for the Igor's own two-gate pull request only,** so
    decision 34 applies to those; a held pull request that is not a two-gate artifact keeps the
    catch-up's rule.
- **For Adam, readings of decisions 29 and 31 this change made:** rank 0 comes after every
  serving rank in each item's order and owns no item; a rank waits one settle interval per
  available rank ahead of it before claiming an item it does not go first for, which replaces
  the wait of `k − 1` intervals; a serving rank never removes rank 0's trees; and, for decision
  38, a run id is eight lowercase letters and digits, so a run tells its own trees by a
  fixed-length prefix.
- **Conflicts with other open changes, recorded and not resolved:**
  - #101: decision 22 has a probe lapse when its rank is gone, but a condition on a seat or on
    the whole Igor is shared by every role, and a process watches only its own role's heartbeat
    files, so a process of another role cannot tell whether the probe's rank is gone. Decision 22
    is in task 4.9 only, with no requirement.
  - #106 (`role-keyed-watermark`) also modifies *Watermarks reduce reconsideration without
    governing it* and archives after this change, so its block must carry decision 36's
    stand-down; #106's task 1.6 says so.
  - #173 (`pre-worker-breaker`): a process whose verification fails counts as not holding the
    item here, so a failure in the claim window is never the holder's; #173 lists whether such
    failures count as an open question for Adam.
  - #106 says a role served by one process runs it as rank 1, but a role served only by `igor
    run` saves its marks as rank 0. The marks still combine by this change's rule; only #106's
    sentence is wrong for that case, and #106 can say "rank 0 under `igor run`".
  - **#175 and #174 as last pushed predate decision 38:** #175's decision 25 has `igor run` remove
    every rank-0 tree of its role at its start, where decision 38 has it remove only its own, and
    #174 keeps one home per role under `igor run`, where decision 38 gives each run its own.
- **The in-force "one comment" rules meet several ranks.** On an item with work in flight, or
  held by another Igor, each rank reaching it would post the one comment the in-force rules
  allow; nothing yet restricts the comment to one rank. It predates Adam's latest answers.

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

**Depends on `core-igor-loop` and `one-claiming-surface` (#156), both archived, and on open
changes:** `condition-backoff` (#101), whose watermark rule the discovery delta modifies;
`worker-user` (#175), whose worker users the sweep runs as and whose user names the role-name
check bounds; `read-seat-windows-from-the-stream` (#143) and `seat-files` (#171), whose seat
rules the heartbeat's availability and `igor run`'s token cite; `pre-worker-breaker` (#173),
whose set-down is one of the give-backs only the holder makes; and `stopped-scope-visible` (#82),
whose restart policy keeps a retired rank down. Issue #204 orders the archives. The disambiguating mechanism, the claim message, already exists
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
the next checkpoint. Once #143 (`read-seat-windows-from-the-stream`) is built, the seat's reserve line, a spend
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

**Each process has a rank, and each item has an owner among the ranks.**

Rank is a number given to a process when it is started — not discovered, not negotiated, and
needing no registry: a missing rank costs nothing, since a rank waits only for available ranks
ahead of it. One serving process per rank is an operator invariant, in the same class as not
declaring two seats with one id; `igor run` is rank 0, outside the roster.

*An item's owner goes first.* A hash of the item's id picks its owner among the ranks the roster
declares, so every process computes the same owner without asking anyone. Where the owner is
not available, as its heartbeat says, the next available rank after it goes first. Each process
attempts the items it goes first for before the others, so ranks mostly work different items
from the start, and the claim still settles any collision.

*A rank behind the owner waits.* Before claiming an item another available rank goes first for,
a rank waits one settle interval per available rank ahead of it, and then **reads before
claiming**. Seeing the item already taken, it moves on silently. This is the property a shuffle
cannot give: a shuffle makes a collision less likely. Here the rank that goes first reads the
item first and claims it, and the one behind it then sees the claim and moves on; a retraction
is left only where two ranks both read the item before either has posted, as when their
heartbeat reads differ. The cost of a collision was never the wasted request — it was the
claim-and-retract comment landing on somebody's issue.

The interval is `settleSeconds`, which already means "long enough for a claim to become visible
to someone else". That is exactly what a rank behind the owner is waiting for, so it is not a
second number to keep in agreement with the first.

**Processes attempt candidates in different orders.** Today every process sorts its candidates
the same way, oldest first, and keeps the first ten, so every process receives the same list and
every process tries the first item first. N−1 lose it, then N−2 lose the
second, and so on — quadratic wasted claims, each burning a settle interval and posting a claim
comment that is immediately retracted. Diverging the order makes a collision incidental instead
of guaranteed, and costs only the wait behind the owner above.

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
  Verification distinguishes a sibling process from the Igor itself, each item's hash owner
  goes first for it, a hand-over goes through the same contest, the
  claims of a rank whose heartbeat stops changing for three poll intervals become adoptable, and a claim left on the Igor's
  open pull request is caught up whoever left it. `igor run` runs as rank 0, beside any serving
  rank. A retired rank exits with status 0, and an edited claim message counts for nothing.
- `work-triage`: An item a live sibling holds is passed over before triage, a claim this
  process takes over on the Igor's own pull request is not skipped as work in flight, and an
  item the process holds whose pull request still merges is triaged again only once it changes
  or carries a review to act on.
- `work-discovery`: A conflicted state write is retried rather than failing the cycle,
  processes saving one source keep the lower watermark, and #101's watermark rule names a
  stand-down.
- `task-execution`: The worker's absolute ceiling is removed, and the sweep removes working
  trees by rank rather than by age; each `igor run` removes only its own trees.
- `role-config`: A role's processes share one identity and differ only by rank, the roster
  declares the ranks each role may run, a process is named `<role>-<rank>`, a role's name fits
  its worker users, and `igor serve` reads the role's environment file itself, which holds
  single-quoted or plain values. The poll interval stays configurable, the settle interval must
  be shorter than it, and the three timings
  derived from it have no settings. The in-force scenarios that start `igor serve reviewer` give
  the rank.
- `surface-adapter`: The in-force scenarios that start `igor serve reviewer` give the rank.
- `graceful-handoff`: A rank that stood down, or does not hold the item, ends its part in
  silence.

## Impact

- Makes the settle interval load-bearing where it has so far been precautionary: with one
  process there was nothing to race.
- Duplicated triage of an item no process has claimed becomes an ordinary cost of running
  several processes.
- The failure this prevents — two pull requests for one issue — is the most visible kind of
  misfire an Igor can produce, in front of exactly the people the claim was meant to reassure.
