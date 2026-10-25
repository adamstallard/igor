## Decisions

Adam decided 1 to 52 on 2026-10-13, 2026-10-17, 2026-10-18, 2026-10-19 and 2026-10-21, and
rewrote some of them on 2026-10-24, each marked with that date, such as 22 and 49. On 2026-10-24
he also approved 53, 54, 56 and 57, which this change drew up, and made 55 and 58.
`design.md` gives the reasoning for each. Decisions 39 to 52 are his answers of 2026-10-21.
This change drew up 45 to 48 from what other changes reported to it, and Adam confirmed them that
day. This change drew up 53, 54, 56 and 57 from consistency reads on 2026-10-24, and Adam approved
them that day. Where a decision replaces an earlier one, the earlier one is rewritten to match.

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
5. **A claim is verified within one poll interval of its message,** or the process works nothing
   from it and gives the claim back as decision 46 says.
6. **Only the rank whose claim message holds an item gives the claim back.** Standing down after
   a failed verification, setting an item down after a repeated failure before the worker
   (#173), and answering a stop remove the shared label only when the holder does them; any
   other rank drops out silently. A stop on a handed-over item is answered only by the holder,
   and other ranks ignore it. Decision 42 lists the one exception.

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
    and those of runs that are gone (decisions 38 and 39).
    `igor run --plan` changes nothing and removes no tree.

**Recovery and the abandonment bound**

12. **Each rank writes a heartbeat to its own file on the state branch every half poll
    interval,** from a timer of Igor's own, its first before its first cycle. The file holds an
    id the process picks at each start and a counter it increments on each write, and a process
    counts a sibling gone only once it has itself watched that file fail to change for three
    poll intervals, each measured as decision 49 says. No time in the file is compared across
    processes. *Rejected:* judging by the
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
    the failing file and check. That condition is #208's `lore:config:<role>`, the read-cleared
    kind #171 defines in `stuck-conditions`, which opens and clears by #208's rules; a roster
    that drops the rank is no failed check (decision 47). Under #171 the configuration read at a cycle includes the seat files, and
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
    0's trees; each `igor run` removes its own, and those a gone run left (decisions 38 and 39).

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
22. **A `condition-backoff` probe (PR #101) lapses when its Igor stops keeping it alive in the
    log** (Adam, 2026-10-24, replacing his round-three rule that it lapse when its rank is gone).
    While it works the probe item, the process that took the probe appends a keepalive row
    naming its probe row every poll interval, and the probe lapses after 90 minutes, three of the
    maximum poll interval, with no such row. A process of another role sharing the probe's scope
    cannot see the rank's heartbeat, and #228 (`probe-claim`) requires every Igor in the scope to
    judge a lapse alike from the log. The model does not cover probes.

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
    late works nothing, even for the rank that holds the item, and gives the claim back as
    decision 46 says. On an item with no label
    that carries a gone rank's claim message, a taker adds the label, removes it and adds it
    again before posting.

**Decided on 2026-10-18 and 2026-10-19, Adam's latest answers**

29. **`igor run` runs as rank 0, outside the roster, with its own heartbeat file.** It contends
    for items like any rank, so `NoTwoWorkers` covers it, never takes over another rank's claims,
    and sweeps its own trees and those a gone run left (decision 39). Fencing by start id, the requirement that stopped a process
    for good on a foreign id, and `igor run`'s wait are removed. *Rejected:* `igor run` as rank 1
    with a fence, which TLC showed still let both processes work one item.
30. **The edited or deleted claim message risk is accepted.** An edit or deletion of the
    holder's message while it works lets a sibling take the item (`model/findings/EditedMessage.cfg`).
    Adam's reason: only a person with maintain or admin access can edit or delete the bot's
    comment. The risk stays accepted whatever task 2.19 measures (decision 40).
31. **Ranks choose items by a hash-assigned owner, and the claim stays.** It replaces a start
    place per rank (decision 9). A stale heartbeat read can only cause contention, which the
    claim settles; `negative/NoVerifyClaims.cfg` shows the claim is still needed.
32. **A rank removed from the roster exits with status 0; a refusal exits 78.** The unit uses
    `Restart=on-failure` with `RestartPreventExitStatus=78`, as #82 has it, so a retired rank
    stays down. Compose restarts every exit under #82, so there a rank is retired by removing its
    service, as #82 says. Status 79 and `SuccessExitStatus=79` are gone.
33. **A heartbeat says whether its rank is available:** free, and with a seat it can spend, as
    #143's *A role has a seat it can spend when the gate would choose one now* defines. Only available ranks go first
    for an item.
34. **A review to act on means resume.** On a held pull request that still merges, a review to
    act on counts as something changed, and the holder runs a worker over it, as #150 says. A
    catch-up with no such review stays worker-free. This applies only on the Igor's own two-gate
    pull request (decision 51).
35. **The settle interval must be shorter than the poll interval;** a configuration that sets it
    otherwise is refused, naming both values.
36. **#101's watermark rule names a stand-down, through a `MODIFIED` block this change carries**
    on *Watermarks reduce reconsideration without governing it*. #101 is merged and archived, so
    the block modifies the requirement in force.
37. **A mention is answered by the first available rank from its hash owner, with no claim.**
    Each rank works out the mention's order itself and answers only where it finds itself first;
    with no rank available, the mention waits for the next cycle. Usually one reply; a stale
    heartbeat can bring a second, with no hard limit, which Adam chose over a limit because a
    duplicate reply is harmless and waiting is the worse failure. `directed-interaction`'s
    proposal records it.
38. **Two `igor run`s of one role at once share no tree and no home** (Adam, 2026-10-19). Each run
    picks a run id at its start, every tree id it gives starts with that run id, and it removes
    no live run's trees (decision 39 adds those of a gone run). Each run also gets a home of its own, the `HOME` its worker runs in;
    #174 (`pinned-skills`) specifies it.

**Decided on 2026-10-21, Adam's latest answers**

39. **Two `igor run`s of one role tell their claims apart by run id.** A claim message `igor
    run` posts carries `Igor-Run: <run id>` beside `Igor-Rank: 0`, and verification compares the
    run id where the rank is 0. Each run writes a heartbeat file of its own,
    `heartbeats/<role>-0-<run id>.json`, so a crashed run's claim is taken over once its own file
    stops changing, while another run goes on. At its start a run removes the trees and the home
    that an earlier run of its role left, where that run's process is gone, with the plugin
    directory #174 assembles for that run; #174 and #175 record it. `ConcurrentInstancesTwoRuns.cfg`, the former finding, now passes, and
    `negative/NoRunIds.cfg` shows the run id is needed.
40. **Decision 30's accepted risk stands whatever task 2.19 measures:** "accept either way".
    Task 2.19 is for information only.
41. **The window in which this change cites rules not yet in force is accepted.** Issue #204
    archives #82 and #173 after this change, so this change cites #82's restart policy and
    #173's set-down before either is in force. Until #82 archives, the in-force unit restarts a process that exits 0.
42. **A process whose claim message failed to post removes the label it set: the one listed
    exception to decision 6,** because no holder exists and the label is its own. It applies
    where the process's test finds no claim message that counts. This change bounds it: the
    process sends the removal only while less than half a settle interval has passed since it
    started to set the label, by its own monotonic clock, and otherwise sends none and leaves
    the label. Any sibling that posts after the test then verifies after the removal and works
    nothing. `negative/NoSettleWithdraw.cfg`
    shows the bound is needed.
43. **Ranks do not coordinate on a lore commit.** Each applies the newest commit it has fetched,
    at its own cycle start. Adam's reasons: skew cannot be removed, only shortened, since ranks
    read at their own cycle starts; safety rests on the claim, not on agreement; and
    coordinating adds failure modes. The model gives each process its own roster and poll
    interval. With different rosters every invariant holds; with different poll intervals TLC
    found two workers until decision 49.
44. **Readings approved:** a run id is eight lowercase letters and digits, and a run tells its
    own trees by that fixed-length prefix; rank 0 owns no item and comes last in each item's
    order; a rank waits one settle interval per available rank ahead of it.

**Drawn up by this change on 2026-10-21 from other changes' reports, and confirmed by Adam the same day**

45. **How a withdrawal releases only claims from before its test** (#173's decision 29 left the
    mechanism here). The withdrawal removes the label only where the withdrawing process's own
    claim message holds the item, by a fresh read of the heartbeat files and the item's claim
    messages just before the removal, or under decision 42's bound. A claim message posted after
    the test is then later than one that still counts, so its process loses at verification, and
    the fresh read sees it and keeps the label on. *Rejected:* recording the latest claim
    message's id at the test and re-checking after the removal. A message the re-check finds was
    posted before the removal, and a release is ordered against a message by time, so it no
    longer counts; the re-check cannot keep it. Without the fresh read, TLC found a late
    withdrawal removing the label from an item a restarted rank had recovered and was working
    (`LabelWhileWorked`, a new invariant).
46. **A claim never ends in silence after a failed read** (reconciling #173's decisions 22 and 35
    with decision 28's silent late verification). After a failed post or verification, the
    process makes #173's test, a read of the item's claim messages. Its own message holding:
    it withdraws, out loud, removing the label. Another process's message counting: it drops
    out silently. No message counting: out loud, with #173's refusal, the post a refused run
    makes when it gives the claim back to be tried again next cycle (Adam, 2026-10-24, replacing
    a post that named the item as still held). It leaves the label, except where decision 42
    applies: a process whose claim message failed to post then removes the label it set. The read
    failing too: nothing now, and a reread at its next cycle's start, or before `igor run`
    exits, which decides the same way. A reread failing again follows #173's decision 41
    (decision 52). A verification later than one poll interval works nothing and gives the claim back
    the same way. Apart from a process whose test found another process's message counting, only a
    process that stood down stays silent.
47. **The refused configuration follows #208** (`lore-pull`, its decisions 13, 30, 36 and 37).
    The condition is #208's `lore:config:<role>`, shared by the role. Only a passing read of the
    refused commit or one descending from it clears it, or one of a branch head that no longer
    holds the refused commit; a commit already known does not reopen it. A roster that drops
    the process's own rank is no failed check: the read passes and the rank retires.
48. **The sweep takes `<tree>-prompt` with each tree** (#175 reported it). Prompts go on stdin
    under #175, but the system prompt still goes in a file in `<tree>-prompt`, beside the tree,
    which a crash leaves. Decision 48 also reads decision 39's "where that run's process is
    gone", a reading Adam confirmed with the rest of decision 48: a run is gone when another run can take the lock
    it held on `<role>-0-<run id>.lock` while it ran, which the system releases when its process
    ends.

**Decided on 2026-10-21, Adam's answers to this change's questions**

49. **Each heartbeat declares its process's poll interval; a watcher counts in what it saw
    declared, or else in a maximum.** Igor has a maximum poll interval of 30 minutes, three
    times the default, and refuses a configuration above it. A process counts a sibling gone
    after three of the longest of its own current interval and the intervals the sibling
    declared in heartbeats this process saw written since the later of its own start and the last
    loss or rollback of the state branch it detected; without such a declaration, after three of
    the maximum. Counting in the watcher's own interval too only makes it wait longer. Without it,
    TLC found a watcher on the doubled interval that counted in a sibling's shorter declared
    interval, so it counted the stood-down sibling gone within its own one-interval verification
    window, and both worked the item once the sibling resumed (Adam, 2026-10-24). A process stands down
    after two of the shortest interval it has applied since it started. No coordination is
    added: each process still applies its own commit (decision 43). Declarations keep recovery
    fast in normal running; the maximum makes a loss, a rollback or a restart safe, at the
    cost of slower adoption after one of them: until the sibling's next heartbeat lands, a watcher
    counts in the maximum, up to 90 minutes. Adam decided the maximum on 2026-10-24, replacing a stand-down counted in
    the shortest interval a sibling declared, which TLC showed insufficient. There a watcher moved
    to the shorter interval after the writer last read the watcher's file, so the writer kept
    standing down in the longer interval, and the watcher counted the writer gone while the
    writer still worked. Without declarations, a rank on a doubled interval stands down only
    after four of a sibling's shorter intervals, and the sibling counts it gone after three
    (`negative/NoDeclaredInterval.cfg`). Without the maximum, a watcher that lost a sibling's
    declaration counts in its own shorter interval (`negative/NoCeiling.cfg`).
    `ConcurrentInstancesPollSkew.cfg`, the former finding, passes, and so do the split
    configurations that put a change of interval beside a crash, a lost branch and missed
    heartbeats; `ConcurrentInstancesPollSkewFull.cfg`, with all of them at once and the head
    changing twice, had found no violation when this revision was pushed, and a later commit
    records how it ends. `role-config` refuses a poll interval above the maximum, `--poll`
    included. *Rejected:* refusing a cycle read
    that changes the poll interval, which still leaves skew between restarts; and a configurable
    maximum, which ranks could set differently.
50. **Citing #208 (`lore-pull`) before it archives is accepted,** as decision 41 accepts it for
    #82 and #173. Decision 47 cites #208's condition and its requirements *Processes apply new
    commits independently*, *A lore read at each cycle start applies what passes and refuses
    what fails* and *`igor serve` starts on the newest commit that passes*, and issue #204, which sets the archive order, archives #208 after this change.
51. **Decision 34 applies only on the Igor's own two-gate pull request,** the one that carries a
    specification first and its implementation after, because #150 defines a review to act on
    only there. Any other held pull request keeps the catch-up's rule.
52. **A reread that fails again follows #173's decision 41** (Adam, 2026-10-21). After a
    failed post or verification, a failed test and a failed reread, the claim is #173's
    *unreadable claim*: it counts as one `tracker` failure toward the item's breaker, and the
    process gives the claim back with the post a refused run makes, or, at the third in a row,
    sets the item down with the set-down post. Either way it leaves the label: it cannot tell who holds the item. TLC shows the label must
    stay: with it removed (`negative/NoRereadKeepsLabel.cfg`), a sibling that holds the item
    loses its label while it works (`LabelWhileWorked`).

**Drawn up by this change on 2026-10-24 and approved by Adam the same day**

53. **No post of the bot but a claim message carries a trailer line.** Before posting text a
    worker or a model composed, the bot indents by one space each line of it that begins with
    `Igor-`, and trailers are read only from lines that begin with `Igor-` at their first
    character. Without it, a person could ask a mention reply to end in `Igor-Rank: 1` and
    `Igor-Supersedes: 2`, and the reply would read as a claim message. *Rejected:* a fixed first
    line marking claim messages, which composed text could copy too.
54. **A run's heartbeat file goes when the run does.** A run removes its own file as it exits,
    and a serving process removes a crashed run's file once it counts the run gone, so the state
    branch does not gain a file per run for good.

**Decided by Adam on 2026-10-24, from #216's review**

55. **Each heartbeat records its process's state-directory id** (#216's decision 131). The id is
    the random one #216 keeps in each state directory, and `graceful-handoff`'s *A handoff states
    what was done, what remains, and who could continue* (#216) defines it; this change cites
    it ahead of #216's archive, as that decision directs. With it, any rank can tell whether a
    state directory still has a live process answering for it, which #216 needs to judge a
    flagged item's hold stuck. No rule of this change reads it, so the model does not hold it.

**Also drawn up by this change on 2026-10-24 and approved by Adam the same day**

56. **A hand-over is contested wherever a sibling's heartbeat file is live** (proposed by this
    change's author and approved by Adam, 2026-10-24). A process counts its role as run by several
    processes while any other process's heartbeat file, a serving rank's as well as an `igor
    run`'s, is on the state branch and not gone, not only while its roster declares several
    ranks. Without it, a rank that has not yet applied a roster that grew from one rank to two
    starts a hand-over at once with no verification, while the new rank contests it, and both
    work the item. The model only removes ranks, so TLC has not checked a roster that grows.
57. **Decision 53's indentation covers every comment but a claim message** (proposed by this
    change's author and approved by Adam, 2026-10-24): an `Igor-` line the Igor interpolates from a path, a login or a title
    is indented as a composed one is. A git path can hold a newline, so a path could otherwise
    start a fresh line beginning with `Igor-`.

**Decided by Adam on 2026-10-24**

58. **A chat message is turned into an issue by the first available rank from its hash owner,
    as decision 37 has for a mention** (Adam, 2026-10-24). Every rank polls the chat channel,
    and two ranks reading the same message could each pass the in-force check for an issue
    already linking it and open two issues. Each rank works out the message's order of ranks
    from its id and creates the issue only where it finds itself the first available; with no
    rank available, the message waits for the next cycle. A crashed owner still on the roster
    holds the message only until the others count it gone, three poll intervals after its last
    heartbeat, rather than until it restarts. A stale heartbeat can still bring a second issue,
    which Adam accepts as rare, as he does a second reply to a mention.

**Still open:**

- **Measurements the requirements rest on:** requests per cycle per rank against the App's rate
  limit, and the limit an App installation gets (task 4.19), which a heartbeat every half
  interval raises; and a request that reads every heartbeat file with its contents at once (task
  4.11). Task 2.19, which roles can edit the bot's comment, is for information only (decision
  40). Tasks 2.12, 2.15 and 2.18 are measured, and `design.md` records them.
- **Taking over on Linear,** where removing the label and adding it again has no counterpart
  (task 2.13).
- **Several ranks overshooting a seat's reserve line,** about two runs each, as #143 measured,
  since a run's reading arrives only after its first model call,
  which `design.md` leaves to be settled with #143.
- **A roster change reaches a running rank through its lore checkout,** which #208
  (`lore-pull`, for #176) fetches; until #208 is built, a person's pull on the host brings it.
- **What an adapter must supply.** The claim rules need each surface's sequence key, the time of
  an item's latest release and the times of its label events, and whether a comment was edited
  (GraphQL `lastEditedAt`), but no `surface-adapter` requirement obliges an adapter to supply them.
- **Conflicts with other open changes, recorded and not resolved:**
  - #106 (`role-keyed-watermark`) also modifies *Watermarks reduce reconsideration without
    governing it* and archives after this change, so its block must carry decision 36's
    stand-down; #106's task 1.6 says so.
  - #106 says a role served by one process runs it as rank 1, but a role served only by `igor
    run` saves its marks as rank 0. The marks still combine by this change's rule; only #106's
    sentence is wrong for that case, and #106 can say "rank 0 under `igor run`".
  - #216 (`lore-search`) replaces `surface-adapter`'s *An Igor that cannot act as its App does
    not start* whole, as this change does, so whichever archives second carries the other's
    text. It cites *A killed worker's failure names the limit it breached*, which this change
    removes. Its *run id* names one execution of an item, where decision 39's names one `igor
    run` process. Its hold records are keyed state that several ranks write, which task 5.1's
    list does not name, nor #138's store. And its authority checks spend the App's rate limit
    that heartbeats share.
  - #141 defers an item whose Igor pull request closed unmerged, where `design.md` has a
    person's label hand the item back to a rank; #141 and #150 are not in #204's order.
  - #99 clears its carried candidates once a cycle decides, where task 5.12's union of each
    rank's latest line keeps a gone rank's carried ids.
  - #173 names the claim-window test against claim messages "of another rank"; under decision
    39 two runs are both rank 0, so the test compares run ids too, as #173's decision 22 expects.
- **For Adam, from the 2026-10-21 consistency read:**
  - **A set-down that keeps the label.** Under decision 52 a third unreadable claim sets the
    item down but leaves the label, and every cycle considers each item its role's label holds,
    whatever the mark. Whether the deferral or the label wins at the next cycle is unsaid.
    *Recommendation:* a deferred item is passed over before claiming even while labelled, until
    its deferral ends or a person adds the label again.
  - **`lore:config:<role>` is not of #171's read-cleared kind.** #171's kind clears on any
    later passing read and lets a citing rule add no clearing rules; #208's decisions 13, 36 and
    37 have passing reads that clear nothing. *Recommendation:* #171's definition makes room for
    clearing rules, as #208 asked.
  - **A mention answered twice may act twice.** Under #140 an answer can open an issue or act on
    a chosen option, so decision 37's harmless duplicate reply can become two issues.
    *Recommendation:* a mention that opens an issue or acts goes through a claim.
  - **A mention while no rank is available waits,** where `docs/architecture.md` says an Igor
    out of budget says so with the reset time. *Recommendation:* the hash owner answers with the
    reset time when no rank has a seat to spend.
  - **One serving process per rank is an operator invariant nothing detects** (task 4.24). Two
    hosts running one rank each re-work the other's claims. *Recommendation:* accept it as a
    decision, with the docs saying so.
  - **A run id can read as a rank.** `heartbeats/web-0-12345678.json` is both role `web`'s run
    and role `web-0`'s rank 12345678. *Recommendation:* a run id starts with a letter, amending
    decision 44's reading.
- **For the next revision, from the same read:** whether a rank whose message stopped counting,
  or that stood down after its worker ended, may still publish, which #153's post-worker steps
  also meet; #150's actionable approval past gate one, which decision 34 would have start a
  worker, and #150 archiving after this change with no leave to cite it ahead; #173's exception to the holder rule in the claim window, beside decision 42's "one
  listed exception"; #175's and this change's circular credit for where trees live and who
  removes them; decision 37's rule, in two proposals and no spec; the rewording of #101's
  watermark sentence in this change's copy; a test for removing a gone run's lock file; which run's mark counts where two `igor run`s share rank 0; the `--poll` flag,
  which overrides the role's poll interval and escapes the settle check; rationale, task numbers
  and PR numbers inside requirement text; the unmeasured claim that only maintain or admin access
  edits a bot's comment, stated as fact in a requirement; `igor run`'s per-user state directory,
  under which two people's runs never share trees; #216's test of the roster where this change
  tests "gone"; #217's redaction of `deferred.json` as a file rewritten whole, which this change
  makes a log; and a retired rank's lore worktree under #208, which nothing removes.
- **The in-force "one comment" rules meet several ranks.** On an item with work in flight, or
  held by another Igor, each rank reaching it would post the one comment the in-force rules
  allow; nothing yet restricts the comment to one rank.
- **From the consistency read of this revision, 2026-10-24:**
  - *For Adam:* a refusal of a line in `/etc/igor/<role>.env` names the line and its key, as
    task 1.6's message is written. Inside a malformed multi-line value, such as a private key in
    double quotes, a line like `AbCd12==` reads as an environment key, so the refusal would print
    part of the private key. *Recommended:* name the line number only, rewording task 1.6's message to drop
    `<KEY>`.
  - *For Adam:* #216 expects this change's unit edit to drop `ProtectHome=read-only`, so that
    workers can write the home; tasks 1.3 and 1.8 do not. *Recommended:* this change takes it,
    in task 1.8.
  - *With #173:* #173's proposal still says a process whose claim failed in the window holds
    nothing, which decision 46 replaced; #173 adds a further exception to the holder rule, in the
    claim window; and the reread and unreadable-claim rule, with near-identical scenarios, is
    stated in both changes, so one should own it and the other cite it.
  - *With #228:* the `stuck-conditions` requirement on the probe lapse cites a 5-minute clock
    skew that #228 assumes; that figure, and #228's account of this change's decision 22, are in
    #228's revision pushed after this one.
  - *For this change's next revision:* the one request that reads every heartbeat file with its
    contents has no fallback if task 4.11 finds no such request; task 2.19's measurement of who
    can edit the bot's comment is stated as fact; no scenario covers `--poll` above the maximum,
    an interpolated `Igor-` line, a pending reread before a cycle chooses, or a chat message
    waiting with no rank available.

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
changes:** `worker-user` (#175), whose worker users the sweep runs as and whose user names the role-name
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
fail to change for three poll intervals, 30 minutes at the default poll; any process
may then take the sibling's claims. Each heartbeat declares its process's poll interval, so ranks
on different intervals still agree: a watcher counts in the longest of its own interval and those
it has seen declared, or in the 30-minute maximum where it has seen none, and a writer stands down in the shortest it has
applied. No time in the file is compared, so neither a clock stepped
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
  claims of a rank whose heartbeat stops changing for three poll intervals become adoptable,
  each heartbeat declares its process's poll interval, and a claim left on the Igor's
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
  trees by rank rather than by age; each `igor run` removes its own trees and those a gone run
  left.
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
- `stuck-conditions`: A probe lapses when the process working it stops appending keepalive rows
  to the execution log, the record of runs on the state branch that every role can read.

## Impact

- Makes the settle interval load-bearing where it has so far been precautionary: with one
  process there was nothing to race.
- Duplicated triage of an item no process has claimed becomes an ordinary cost of running
  several processes.
- The failure this prevents — two pull requests for one issue — is the most visible kind of
  misfire an Igor can produce, in front of exactly the people the claim was meant to reassure.
