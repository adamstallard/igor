## Context

One Igor is one role with one identity: on GitHub, the role's GitHub App, which claims with the
`igor:<role>` label and a claim message. Capacity is how many processes run behind that
identity. Everything here follows from refusing to conflate the two.

## Decisions

Adam decided 1 to 52 on 2026-10-13, 2026-10-17, 2026-10-18, 2026-10-19 and 2026-10-21, and
rewrote some of them on 2026-10-24, each marked with that date, such as 22 and 49. On 2026-10-24 he also made 55 and 58 himself, and approved 53, 54, 56 and 57, which this change drew up for him; those he approved count as his too. He made 62 and 63 on 2026-10-28, 74 on 2026-11-01 and 75 on 2026-11-02. The agents coordinating this work decided 59 and 61 on 2026-10-24,
64 to 68 on 2026-10-28, 69 to 72 on 2026-10-30 and 73 on 2026-11-01, under a rule Adam set, kept outside this
repository, on which questions they may settle without him: one with a single option that fits
the rest of the change, an answer already given, or a proof or cheap reversal behind it. These
stand until he says otherwise. They also made 60 and withdrew it, as *Open Questions* records.
The sections after this list give the reasoning. Decisions 39 to 52 are his answers of 2026-10-21; of them, 45 to 48 were drawn up by this change from what other changes reported, and he confirmed them that day. Where a decision replaces an earlier one, the earlier one is rewritten to match.

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
   and other ranks ignore it. This holder rule has two exceptions: decision 42's removal of the label after a failed post, and the stop on an item no message holds, which decision 28 has the first rank to reach answer.

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
    the failing file and check. That condition is #208's `lore:config:<role>`, decided to be the read-cleared kind #171 defines in `stuck-conditions`, carrying #208's rules for opening and clearing; #171 does not yet let a read-cleared condition carry such rules, and decision 66 asks it to; a roster
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
    rank the roster no longer declares, running the removal as the worker user #175's release uses. No serving rank removes rank
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
22. **A `condition-backoff` probe (PR #101), the one item let through after a cooldown to test whether a recurring fault has cleared its scope, the role or seat the fault stopped, lapses when its Igor stops keeping it alive in the log** (Adam, 2026-10-24, replacing his round-three rule that it lapse when its rank is gone).
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
28. **Readings of earlier decisions, which Adam confirmed as readings rather than new decisions.** Round one's two rules on checkpoint gaps, a checkpoint at least every
    two poll intervals and a stand-down at one missed heartbeat where gaps were longer, are
    removed: the heartbeat timer of decision 17 stops a stood-down worker whatever the gap. A stop on a
    hand-over nobody has claimed is answered by the first rank to reach it, the second listed
    exception to decision 6. A single-quoted
    value in the role's environment file cannot hold a single quote. A key that file sets takes
    the place of the same key in the environment. A verification more than one poll interval
    late works nothing, even for the rank that holds the item, and gives the claim back as
    decision 46 says. On an item with no label
    that carries a gone rank's claim message, a taker adds the label, removes it and adds it again before posting, so that a release comes after the gone rank's message and that message no longer counts (*Taking over*, below).

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
    with no rank available, the mention waits for the next cycle; decision 67 has the mention's hash owner answer at once with the reset time, a reply that needs no seat, while the real answer waits for that later cycle; where the owner is gone, the next rank not gone sends it (agents, 2026-11-01). Usually one reply; a stale
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
    #173's set-down before either is in force. The unit this change ships already has #82's
    restart lines, `Restart=on-failure` and `RestartPreventExitStatus=78` (task 1.3), so a rank
    that exits 0 is not restarted.
42. **A process whose claim message failed to post removes the label it set: the first listed
    exception to decision 6,** because no holder exists and the label is its own. It applies
    where the process's test finds no claim message that counts. This change bounds it: the
    process sends the removal only while less than half a settle interval has passed since it
    started to set the label, by its own monotonic clock, and otherwise sends none and leaves
    the label. Any sibling that posts after the test then verifies after the removal, since it waits a settle interval before verifying and the removal comes within half of one, and works nothing. `negative/NoSettleWithdraw.cfg`
    shows the bound is needed.
43. **Ranks do not coordinate on a lore commit.** Each applies the newest commit it has fetched,
    at its own cycle start. Adam's reasons: skew cannot be removed, only shortened, since ranks
    read at their own cycle starts; safety rests on the claim, not on agreement; and
    coordinating adds failure modes. The model gives each process its own roster and poll
    interval. With different rosters every invariant holds; with different poll intervals TLC
    found two workers until decision 49.
44. **Readings approved:** a run id is eight lowercase letters and digits, the first a letter
    as decision 68 amends it, and a run tells its
    own trees by that fixed-length prefix; rank 0 owns no item and comes last in each item's
    order; a rank waits one settle interval per available rank ahead of it.

**Drawn up by this change on 2026-10-21 from other changes' reports, and confirmed by Adam the same day**

45. **How a withdrawal releases only claims from before its test** (#173's decision 29 left the
    mechanism here). The withdrawal removes the label only where the withdrawing process's own
    claim message holds the item, by a fresh read of the heartbeat files and the item's claim
    messages just before the removal, or under decision 42's bound. A claim message posted after
    the test is then later than one that still counts, so its process loses at verification, and
    the fresh read sees it and keeps the label on. *Rejected:* recording the latest claim
    message's id at the test and re-checking after the removal. Any message the re-check finds was posted before the removal; since a release is ordered against a message by time, the removal makes that message stop counting, so the re-check cannot keep the label on. Without the fresh read, TLC found a late
    withdrawal removing the label from an item a restarted rank had recovered and was working
    (`LabelWhileWorked`, a new invariant).
46. **A claim never ends in silence after a failed read** (reconciling #173's decisions 22 and 35
    with decision 28's silent late verification). After a failed post or verification, the
    process makes #173's test, a read of the item's claim messages. Its own message holding:
    it withdraws, out loud, removing the label. Another process's message counting: it drops
    out silently. No message counting: out loud, with #173's refusal, #173's post giving a claim back after a failure before the worker, the post a refused run
    makes when it gives the claim back to be tried again next cycle (Adam, 2026-10-24, replacing
    a post that named the item as still held). It leaves the label, except where decision 42
    applies: a process whose claim message failed to post then removes the label it set. The read
    failing too: nothing now, and a reread at its next cycle's start, or before `igor run`
    exits, which decides the same way. A reread failing again follows #173's decision 41
    (decision 52). A verification later than one poll interval works nothing and gives the claim back by the same test and its outcomes. Every give-back speaks except four: a process whose test found another process's message counting, a process that stood down, a process stopped as a second writer on its rank (decision 72), and a failed post's refusal past decision 65's bound.
47. **The refused configuration follows #208** (`lore-pull`, its decisions 13, 30, 36 and 37).
    The condition is #208's `lore:config:<role>`, shared by the role, and it opens, clears and
    does not reopen as #208's requirements say. A roster that drops
    the process's own rank is no failed check: the read passes and the rank retires.
48. **The sweep takes `<tree>-prompt` with each tree** (#175 reported it). Prompts go on stdin
    under #175, but the system prompt still goes in a file in `<tree>-prompt`, beside the tree,
    which a crash leaves. This decision also reads decision 39's "where that run's process is
    gone", a reading Adam confirmed with the rest of decision 48: a run is gone when another run can take the lock
    it held on `<role>-0-<run id>.lock` while it ran, which the system releases when its process
    ends.

**Decided on 2026-10-21, Adam's answers to this change's questions**

49. **Each heartbeat declares its process's poll interval; a watcher counts in what it saw
    declared, or else in a maximum.** Igor has a maximum poll interval of 30 minutes, three
    times the default, and refuses a configuration above it. A process counts a sibling gone after three of the longest of several intervals: its own current one, and each the sibling declared in a heartbeat this process saw written within a window. The window starts at this process's start, or at the last loss or rollback of the state branch it detected if that came later. Where it saw no declaration in the window, it counts three of the maximum. Including the
    watcher's own interval among them can only make the watcher wait longer before it counts a
    sibling gone. When the watcher's own interval was left out, TLC found this failure. A commit
    to the lore head doubled the poll interval, and each process applies such a change at its own
    cycle start. The watcher had applied the doubled interval and its sibling had not, so the
    watcher counted the sibling in the sibling's shorter interval alone. The sibling had only stood down, holding a claim it had posted but not yet verified, and verification may come up to one poll interval after the claim. The watcher counted it gone within that interval and took the item; the sibling then resumed, verified its own claim, and both worked the item (Adam, 2026-10-24). A process stands down
    after two of the shortest interval it has applied since it started. No coordination is
    added: each process still applies its own commit (decision 43). Declarations keep recovery
    fast in normal running; the maximum makes a loss, a rollback or a restart safe, at the
    cost of slower adoption after one of them: until the sibling's next heartbeat lands, a watcher
    counts in the maximum, up to 90 minutes. Adam decided the maximum on 2026-10-24, replacing a stand-down counted in
    the shortest interval a sibling declared, which TLC showed insufficient. Under that rule each process, the
    writer of a heartbeat its siblings watch, read its siblings' files to learn the shortest
    interval they declared, and stood down after two of it. A watcher moved to the shorter
    interval after the writer last read the watcher's file, so the writer kept standing down in
    the longer interval, and the watcher counted the writer gone while the writer still worked. Without declarations, a rank on a doubled interval stands down only
    after four of a sibling's shorter intervals, and the sibling counts it gone after three
    (`negative/NoDeclaredInterval.cfg`). Without the maximum, a watcher that lost a sibling's
    declaration counts in its own shorter interval (`negative/NoCeiling.cfg`).
    `ConcurrentInstancesPollSkew.cfg`, the former finding, passes, and so do the split
    configurations that put a change of interval beside a crash, a lost branch and missed
    heartbeats; `ConcurrentInstancesPollSkewFull.cfg`, with all of them at once and the head
    changing twice, finished on 2026-10-28 with no error found, as *Bounds and results* records. `role-config` refuses a poll interval above the maximum, `--poll`
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
    Decision 69 makes a process remember each sibling whose heartbeat file it has read, so that
    knowledge survives a lost state branch.
57. **Decision 53's indentation covers every comment but a claim message** (proposed by this
    change's author and approved by Adam, 2026-10-24): an `Igor-` line the Igor interpolates from a path, a login or a title
    is indented as a composed one is. A git path can hold a newline, so a path could otherwise
    start a fresh line beginning with `Igor-`. The indenting matches `Igor-` in any letter case,
    while trailers are read only in exactly that case, and it runs on the final text, after #153's cold read, a fresh reader's review that may lead to changes, and before signing, so that the text signed is the text posted; Adam approved the decision; the agent coordinating this work settled both details, the letter case and the order, on 2026-10-24, under the rule Adam set for questions it may settle, and they stand until he says otherwise.

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

**Decided on 2026-10-24 by the coordinating agents, under Adam's rule for questions they may
settle**

59. **A refused line of `/etc/igor/<role>.env` is named by its line number only.** Task 1.6's
    message had named the line's key, which could print part of a secret: where a stray single
    quote inside a multi-line value ends it early, the value's remaining lines are read as lines
    of their own, and one such as `AbCd12==` reads as a key `AbCd12` with a value that fails the
    check. So the message now names only the number.

61. **A prober whose keepalive appends fail twice in a row stops its worker.** The keepalive goes
    into the execution log's day partition, which an append rewrites whole, so it can keep
    failing while the small heartbeat writes succeed and no stand-down stops the worker. After
    90 minutes another Igor would then count the probe lapsed and take a second probe item while
    the first still works. So the heartbeat timer, which runs whether or not a cycle does,
    appends the keepalive at every other firing, which is once per poll interval, since the
    timer fires every half interval; an append that has not landed within half a
    poll interval counts as failed, before the next is due; and two failed appends in a row stop the probe's worker, append a
    void row naming its probe row, so that the stopped probe neither clears the condition nor
    holds the scope, and give the claim back out loud. After the last keepalive that
    landed, a live probe is stopped within two and a half poll intervals, at most 75 minutes at
    decision 49's 30-minute maximum, inside the 90-minute bound. The 15 minutes beyond those 75
    cover the 5 minutes of clock skew between hosts that #228 assumes. It mirrors the heartbeat's stand-down and is
    cheap to reverse, so the agent coordinating this work decided it under the rule Adam set for
    questions it may settle.

**Decided by Adam on 2026-10-28**

These answer questions the consistency read of 2026-10-21 had left for him in *Open Questions*.

62. **A mention whose answer opens an issue or acts on a chosen option goes through a claim
    first, like any item.** Under #140 (`directed-interaction`), answering a mention can open an
    issue or carry out an option the person chose. A plain reply stays unclaimed under decision
    37, since a second reply is harmless; an answer that acts would act twice if two ranks gave
    it.
63. **Igor detects two processes serving one rank, through the heartbeat.** The rank then stops,
    with a condition naming the hosts involved. This replaces the reading that keeping one
    serving process per rank is the operator's job, and task 4.24 builds it. Adam also named a
    counter going backwards under the same id as a sign of a second writer; decision 72 reads
    that as a rollback instead, and says how a second writer shows. The model has no hosts, so a
    task and a test cover this, not TLA+.

**Decided on 2026-10-28 by the agents coordinating this work, under the same rule**

64. **A set-down that keeps the label still defers the item** (one good option). A *set-down* is
    #173's deferral of an item after repeated failures before its worker; under decision 52, a
    third claim in a row whose claim messages cannot be read is set down, and the role's label
    stays on it. A deferred item is passed over before claiming, even while labelled, until #173's *What lifts a set-down* lifts it. Otherwise every cycle would consider the
    labelled item, as every cycle considers each item its role's label holds, and the unreadable
    claim would be tried again each cycle.
65. **A failed post's refusal takes decision 42's time bound** (one good option). The bound applies only to the refusal after a claim message that failed to post; as first recorded it covered all of #173's refusal and set-down posts, and the agents narrowed it on 2026-10-30, since it would silence every other refusal and the set-down, as the next sentences explain. The
    refusal is the post a refused run makes when it gives its claim back; the set-down post says
    the item is deferred. Decision 42 lets a process whose claim message failed to post remove
    the label only within half a settle interval of setting it, so that no sibling's claim comes
    after. The refusal of a process whose own claim message failed to post is made only within
    that same half settle interval, for the same reason. Every other refusal and the set-down
    come later, a settle interval after the label for a failed verification and a cycle later
    for a reread or an unreadable claim, so the bound would silence them every time; they keep #173's out-loud rule (agents, 2026-10-30). The failed post's refusal past the bound is silent, as a stand-down's give-back is, which the agents accepted on 2026-11-01: a late refusal could land after a sibling's claim and read as giving it back, while the silent item keeps the label with no claim message counting, so the rank that claims it next speaks.
66. **#171 is asked to let a read-cleared condition take clearing rules** (#208 has already made the request, so this change only reports it). #171 (`seat-files`) defines a *read-cleared* kind of condition, one that
    clears on any later passing read, and lets a rule citing it add no clearing rules of its own.
    #208's `lore:config:<role>` needs its own limits on clearing, so #171's definition should
    allow a citing rule to add them, as #208 asked. #171 owns that definition and decides; until it does, `lore:config:<role>` is read-cleared with #208's limits, which #171 does not yet allow (*Open Questions*).
67. **A mention while no rank is available is answered by its hash owner, with the time its
    seat's budget resets** (already answered: `docs/architecture.md` promises that an Igor out
    of budget says so with the reset time).
68. **A run id starts with a letter** (one good option), amending decision 44's reading of a run
    id as eight lowercase letters and digits. A rank is digits only and a role's name may end in
    a dash and digits, so `heartbeats/web-0-12345678.json` reads both as role `web`'s run
    `12345678` and as role `web-0`'s rank 12345678; a run id that starts with a letter cannot
    read as a rank.

**Decided on 2026-10-30 by the agents coordinating this work, under Adam's rule**

Decisions 69 to 71 close the four correctness gaps a consistency read of 2026-10-24 found: a lost
state branch hiding a sibling (69), the Discord read marker and the discovery marks passing a
message another rank is first for (70, closing two), and which rank posts the one comment (71).
Each has one option that fits the rest of the change and is cheap to reverse. Decision 72
settles the question decision 63 left. In decision 63, Adam named a counter going back under one
id as a sign of a second writer. But decision 49 relies on `work-claiming`'s *A process detects a
lost or rolled-back state branch from the heartbeat files*, and that detection reads the same sign
as a rollback. So decision 72 keeps Adam's detection of a second writer, and has it look for a
sign that no rollback gives.

69. **A process knows its siblings from memory, not only from the state branch.** Decision 56
    counted a sibling's heartbeat file on the state branch, so a lost or rolled-back branch that
    removed the file let a rank whose roster says one process start a hand-over with no
    verification while the sibling contested it. A process now keeps in memory every sibling
    whose file it has read since it started, and counts it until it counts that sibling gone,
    which after a detected loss takes three of the maximum poll interval, since a process forgets
    the intervals siblings declared once it detects a loss (decision 49); and for one maximum
    poll interval after its own start it counts the role as run by several processes whatever
    the files show, since a sibling writes at least every half maximum. Correctness then no
    longer rests on the state branch, as `work-discovery` requires. The cost is a settle
    interval on a hand-over during a process's first 30 minutes.
70. **No marker passes an unanswered request another rank owns.** The Discord read marker is
    shared by role and channel, and each rank's discovery mark passed a mention another rank was
    first for, so if that rank was gone before answering, nothing read the message again. A
    rank now leaves the marker, and its mark, before such a message until it has an answer: a reply to it from the role's bot account; for a chat message, an issue linking it; or, for a mention whose answer acts, the claim that answer takes (62). Since
    the held-back marker makes every rank read the message again at later cycles, a rank
    answers no message that already has an answer; otherwise the first rank, or a later one,
    would answer it again. This mirrors how a cycle already holds its mark back
    before an item it chose and did not take. The other
    option, a marker per rank, still loses the message once every rank's marker has passed it,
    and makes each rank re-read the channel's whole history after a restart.
71. **Only the first available rank in an item's order posts the one comment** on a handed-over
    item that waits, for work in flight or another Igor's label. No rank holds such an item, so
    the holder rule cannot pick one; the item's order, as for found work, does. Where a
    stale heartbeat lets two ranks each take itself as first, the in-force check that the
    comment is not already there stops the second comment.
72. **A second writer is a foreign id that advances.** Decision 63 named a counter going back
    under the same id as a sign of a second writer, but decision 49 reads that as a rolled-back
    state branch, and only a rollback produces it: each process picks its id at its start, so a
    second process always writes an id of its own. The id here is the start id that each process
    picks at its start and writes, with a counter it raises at each write, in every heartbeat;
    decision 29 removed fencing by start id, not the id itself. A process therefore treats its
    rank's file as written by a second process where the counter written under a start id other
    than its own rises between two of its reads after its own first write; a rollback by itself
    only restores an older copy, whose counter does not rise. Each process reads its own file at every heartbeat firing, so a process busy with
    a long worker still notices. The condition has the cure key
    `instance:<role>-<rank>:duplicate`, on the instance scope #175 adds; it names each writer's
    host and operating-system process number, the host once where both share one. Both writers
    stop their workers and take no items, keep their claims in silence as a stand-down does, and record in their heartbeat files that they are
    not available, until a person ends one of the two processes; the condition then clears like a read-cleared one, with
    no probe item, once three of the maximum poll interval pass in which no counter under a
    start id other than its own rises, and is recorded in the execution log where it opens and clears.
    Since it opens at its first observation and clears after a span of time with no probe item,
    it is a kind of condition of its own, beside the read-cleared and refused-credential kinds.
    The stop is `work-claiming`'s rule; the condition only records it.

**Decided on 2026-11-01 by the agents coordinating this work, under Adam's rule**

73. **A chat message with no rank available gets the reset time** (one good option, cheap to
    reverse). `docs/architecture.md` says an Igor out of allowance says so with the reset time,
    and decision 67 does that for a mention; a chat message waited in silence instead. The rank
    first in the message's order now answers in the chat with the time the role's seats next
    reset, and the message becomes an issue at a later cycle.

**Decided by Adam on 2026-11-01**

74. **Host names and process numbers go on the state branch, even where it is public.** They are
    not secrets, and the operator needs them to find the second writer that decisions 63 and 72
    detect.

**Decided by Adam on 2026-11-02**

75. **A stop waits for a holder that has stood down or has stopped on finding a second process
    on its rank.** The holder's worker has already stopped: decision 17's timer stops a
    stood-down process's worker, and decision 72 has both processes on a rank stop theirs. The
    label stays on and no stop receipt is posted until the holder resumes and answers the stop,
    or the first sibling to reach the item after counting the holder gone answers it. This is an
    exception to the in-force rule that a stop releases immediately. The holder does not answer
    while it waits, because it keeps its claims in silence: decision 17 gives the reason for a
    stand-down, that a sibling may already have taken the item over, and decision 72 has a second
    process do as a stand-down does. The reasons for the wait:
    - The work has already stopped; only the acknowledgement waits.
    - The stood-down wait is bounded wherever another process serves the role: a sibling counts
      the holder gone once its file has not changed for three of the longest poll interval the
      holder's heartbeats have declared to that sibling (decision 49), 90 minutes at the
      30-minute maximum. With no other process serving the role, the stop waits until the holder
      resumes. The wait usually ends sooner by itself, once the holder's heartbeat writes succeed
      again and it resumes. A sibling sees only that the holder's heartbeat file has stopped
      changing; until it counts the holder gone it cannot know the holder has stood down and
      stopped its worker, so an earlier answer risks a receipt while the worker still runs
      (`NoReceiptWhileWorked`).
    - The wait where a second process was found has no bound, and that is accepted. No sibling
      counts the rank gone, since its file keeps changing. The wait ends once the operator ends
      one of the two processes and the duplicate condition then clears, three of the maximum poll
      interval later; the process that remains holds the rank's claims and answers the stop.
      Nothing alerts the operator today: the condition shows only in the process's own output,
      the decision records and the execution log, so the stop waits until someone checks. #238
      is an open issue to make Igor tell the operator when a condition keeps a scope, such as
      this rank, from taking items.

### How the decisions were made

Adam decided in two rounds on 2026-10-17: first the answers to two reviews' questions, then a
second set settling what those answers left open. A decision from the second set is marked
*round two*. On 2026-10-18 he answered what round two left open, marked *round three*, and then
what round three left open, marked *round four*. His latest answers, given after round four on
2026-10-18 and, for decision 38, on 2026-10-19, are marked *in his latest answers* or dated; the
list numbers them 29 to 38. His answers of 2026-10-21 are dated, and the list numbers them
39 to 52. Decisions 45 to 48 the agent writing this change drew up from what other changes reported, and
Adam confirmed them on 2026-10-21. On 2026-10-24 he rewrote some earlier decisions in place,
which keep their numbers and carry that date, such as 22 and 49, and the list numbers that day's new ones 53 to 58. The agents made 59 and 61 on 2026-10-24, 64 to 68 on 2026-10-28, 69 to 72 on 2026-10-30 and 73 on 2026-11-01, under his rule, as the list's opening says.

Where this file says *decision n*, it means decision n in the list above. The numbered rules 1 to 24
under *Each decision, and what breaks without it* are a separate list, the model's rules, each
named there by its constant. Adam's rounds, above, are rounds of answers. 

### The marker rides in the claim message

Every claim already posts a message after setting the holder field, naming the Igor and saying
how to stop it. Processes of one role set the same label, so the message is the only part of a
claim that can say which process took it. It gains the process's rank as a machine-readable
trailer: a last line `Igor-Rank: 2`, in the form of a git trailer (Adam, 2026-10-13).

**Which claim messages count** (Adam, 2026-10-13). Among processes of one role, the earliest
claim message holds the item. Messages from before the item's latest release don't count: the
latest time the role's label was removed from the item, which the item's events record. Neither
do messages of ranks that are gone, their heartbeat unchanged for three poll intervals (*Retirement is recorded, not
detected*, below). Without that, a process taking over a dead rank's claim would always lose to
the dead rank's older message.

**A process that loses to its own role keeps the label on the item** (Adam, 2026-10-17). The
in-force rule has a losing Igor remove its own entry from a list-valued holder field. Processes
of one role share one label, so that entry is the winner's too: removing it releases the
winner's claim, and the winner reads the removal, made by its own bot account, as its own
release and carries on.

**Verification comes within one poll interval of the claim message** (Adam, 2026-10-17). A
process that reaches it later works nothing and gives the claim back, as for any failed
verification. Verification is the re-read a settle interval after claiming. In a longer
wait, a rank with an earlier message can pass the abandonment bound, three poll intervals without its heartbeat changing,
under *Retirement is recorded, not detected*. The verifier then leaves that rank's message out
and holds the item, and the rank returns and recovers it.

Without the rank in the claim message, every process of a role reads every claim as its own,
since all of them act as the role's identity and set the same label. Two processes would both
work the item and open two pull requests for one issue, the most visible misfire an Igor can make, in front of
the people the claim was meant to reassure.

The alternative was a lease keyed by item on the state branch: cheaper to read and unambiguous
to parse. It was rejected because the state branch is a cache — losing it must cost
re-examination and never correctness — and a lease makes correctness depend on it. The tracker
is the source of truth for what is claimed, and a claim marker is a fact about what is claimed.

A trailer rather than prose, so the protocol does not depend on parsing a sentence someone may
reword.

**An edited claim message counts for nothing** (Adam, 2026-10-18, round four). A person who can
edit the bot's comment could otherwise fake or erase `Igor-Supersedes:` or
`Igor-Handed-Over-By:`. Adam accepted the remaining risk, an edit or deletion of the holder's
message while it works, on the understanding that only maintain or admin access can edit a bot's
comment (decision 30). Task 2.19 measures which access GitHub requires, for information only:
the risk stays accepted whatever it shows (decision 40). A bot comment GitHub reports as edited is
therefore no claim message, and none of its trailers is read. Igor never edits a claim message
itself.

**An edit is read from GraphQL `lastEditedAt`, not from `updated_at`** (Adam, 2026-10-18, from
task 2.18's measurement on 2026-10-19). On five comments of one issue, a reaction left REST
`updated_at` equal to `created_at`; an edit changed it and set `lastEditedAt`; hiding a comment,
and unhiding it, changed `updated_at` and left `lastEditedAt` empty. Testing `updated_at` against
`created_at` would therefore make a hidden claim message stop counting, so the rule tests
`lastEditedAt`, and a hidden or unhidden message still counts. Transferring the issue kept every
comment's times but gave every comment a new id, in the same relative order, so ordering by id
within an issue holds across a transfer; anything that stored a comment's id does not.

In the model an edit removes a message from those that count. An edit made before any process has read the message as holding the item leaves the item just as
a message that never counted leaves it, and the model already had such messages: one posted in
the release's second never counts. An edit made after the message holds the item is a case the
model did not have before: the holding message disappears from what its siblings read while the
holder works. The model now lets a person edit any message at any time (`EditMsg`), and TLC finds that a
sibling then sees a labelled item with no claim message that counts, claims it and works it
beside the holder (`model/findings/EditedMessage.cfg`). Adam accepted that risk (decision 30).

**No other post of the bot carries a trailer line** (decision 53, drawn up by this change and
approved by Adam on 2026-10-24). Reading claim messages only from the bot's own unedited
comments does not stop the bot itself from posting one by mistake. An Igor answers mentions with
text a model composed, and a person can ask it to end a reply with `Igor-Rank: 1` and
`Igor-Supersedes: 2`. Read as a claim message, such a reply could supersede the holder's message
and put two workers on one item. So before posting composed text the bot indents by one space
each line beginning with `Igor-`, and trailers are read only from lines beginning with `Igor-`
at their first character. In Markdown the indent is invisible. *Rejected:* a fixed first line
marking claim messages, which composed text could copy as easily as a trailer.

### Ordering is the surface's sequence key, never a timestamp

GitHub returns comment times to the second. Sibling processes on one poll interval wake
together and claim inside the same second, so "the earliest claim wins" is a tie exactly where
the tiebreak is needed — and with identical intervals, simultaneity is the normal case rather
than a rare race.

Comment ids ascend strictly with creation. Measured on three comments spanning an hour:
5673068718, 5673143226, 5673525664. The id is a total order the timestamp is not. Task 2.12
measured it within one second (2026-10-19): six writers posting at one instant, six rounds, 36
comments. In four rounds all six shared one `created_at` second; the ids were all distinct, no id
order ever contradicted `created_at`, and the REST listing and GraphQL's `comments` both return
ascending ids. Within one second nothing else shows which comment the server created first, so
the measurement shows only that ids never contradict the seconds; ids are the one total order
there is, and every listing uses it.

`work-claiming` already required resolution to "rely on the storage order of writes". This is
that requirement meant literally; the drift to a clock happened in prose, not in the decision.


**A claim message is ordered against the item's latest release by timestamp** (Adam,
2026-10-17). Which messages came after the release compares a comment with a label event, and
the two have separate ids, so only their times compare, to the second. A message in the
release's second does not count, because it may have been posted before the release. Task 2.15
measured that the two share one clock in whole seconds (2026-10-19): in 70 sequenced pairs of an
unlabel and a comment, in either order, the later action never showed an earlier second, and 24
shared a second. A skew below one second, which could put a comment posted just before a release
into the next second, is not ruled out by 70 pairs; none showed one.

**Nobody waits out a release's second** (Adam, 2026-10-17, round two). A claim message posted in
the second of the item's latest release does not count, and that item goes to the next cycle.
This holds for a process taking over a gone rank's claim, which releases the item just before
posting, and for one claiming an unlabelled item right after a sibling finished it. Its claimer
finds no claim message that counts at its verification, so it loses, works nothing, and leaves
the label on. At the next cycle any rank finds the item labelled with no claim message that
counts, and claims it by posting one. The previous version had a taker wait for the second to
pass; TLC found no violation of any invariant or liveness property with the wait off, so it is
dropped, and the model now checks the change without it.

On Linear, removing the label and adding it again has no counterpart yet, so taking over a gone
rank's claim is not defined there. It must be defined before a Linear adapter is built (task
2.13).

### Rank is given by the supervisor

A process is told its rank when it is started. It is not discovered, negotiated, or counted —
rank 3 waits its turn whether or not a rank 2 exists, and a gap costs only the wait.

Every supervisor already has stable slot identity, because the problem is generic: systemd
template instances, StatefulSet ordinals. A parent process that spawned Igors and assigned ranks
would be a coordinator — a single point of failure that itself needs supervising, and the thing
this design refuses everywhere else.

**Under systemd the rank is in the instance name** (Adam, 2026-10-13; its form, 2026-10-17, round
two). One template unit runs as `igor@<role>-<rank>`, such as `igor@generalist-2`, and passes
the instance to `igor serve <role>-<rank>`, which splits it. The rank is always written, and is
the name's last dash-separated part, so `front-end-2` is rank 2 of `front-end`, and an instance
named by its role alone is refused. The unit uses `%i` directly wherever it names something per
instance, as #175 names the worker user `igor-worker-%i`. The role's GitHub App identity stays
one per role; no rank has an App of its own. The rank reaches `igor` as part of its argument,
the instance name, so the process learns role and rank from one place.

**Igor reads the role's environment file itself** (Adam, 2026-10-18, round three). Every rank of
a role reads one file, `/etc/igor/<role>.env`. systemd has no specifier for the part of an
instance name before its last dash, so `EnvironmentFile=/etc/igor/%i.env` would name
`generalist-2.env`. The unit's `ExecStart` is `/usr/local/bin/igor serve %i`, and `igor serve`
takes the role from its argument and reads the role's file before anything reads a credential,
setting each key in its own environment. Only the instance name is passed as an argument, so no
credential appears in a process's argument list, where any user on the host can read it. The
shared `/etc/igor/env`, the seat tokens every role reads, stays a systemd `EnvironmentFile=`.

*Rejected:* a shell wrapper, `/bin/sh -c` loading the file with its dot command, which the
2026-10-13 decision chose. The shell runs a `$(...)` in a value before Igor can look at the file,
so a check in Igor came too late to stop it.

**Every value in the role's file is single-quoted or plain** (Adam, 2026-10-17; plain values,
round two; the parser in Igor, round three; the refusal's wording, decision 59,
made by the coordinating agents on 2026-10-24). A line is blank, a `#` comment, or `KEY=value`. A
plain value uses only `[A-Za-z0-9_./:@-]`, so a path or an App ID needs no quotes. A
single-quoted value is everything between its two quotes, as written, and may span lines, as a
private key does. Igor refuses to start on any other line, naming its number and nothing of its
content. Naming the key, as the message once did, could print part of a secret: where a stray single quote inside a multi-line value ends it early, the value's remaining lines are read as lines of their own, and one such as `AbCd12==` reads as a key `AbCd12` with a value that fails the check (decision 59). The two forms, single-quoted and plain, judged by their
characters alone keep the parser from having to work out
what a shell would have done; with no shell, a single quote inside a value has no way to be
written, and the shell's `'it'\''s'` is refused like any other form. A key the file sets takes
the place of the same key in the environment Igor started with, as the shell's `set -a; .` did.

**A process rereads `igor.config.yaml` at each cycle,** roster included, from its lore checkout, the host's clone of the lore repository that holds the configuration.
Until #176 builds pulling, that checkout changes only when a person pulls it on the host, so a
roster change reaches a running rank that way. Under #82, configuration a process does not
reread takes effect at its next start; `igor.config.yaml` is not such configuration, since the
process rereads it.

**The roster is a list of ranks per role** (Adam, 2026-10-17, who asked for its key and shape to
be specified, and confirmed it in round two), under the top-level key `roster` in
`igor.config.yaml`. A list rather than a count, so that a rank can be retired without
renumbering the ranks above it. A role the roster does not name runs rank 1 only, so a
deployment with one process per role needs no roster.

**A role's name is lowercase letters, digits and dashes** (Adam, 2026-10-18, round three). It
matches `[a-z][a-z0-9-]*`, and for every rank the role may run, `igor-worker-<role>-<rank>` must
fit Linux's 32-character limit on a user name, since #175 (`worker-user`) names each rank's
worker user that way. Loading the configuration refuses any other name, naming the role, so a
name that could never become a user is refused before any process starts. With the rank always
the last dash-separated part, a dash in a role's name is never ambiguous.

**A role's processes share one identity and differ only by rank** (Adam, 2026-10-17).
`role-config` and `docs/architecture.md` §2 said they were interchangeable. Under this change
they are not: the same rank takes back its predecessor's claims at once, other ranks only once
the holder is gone, and rank sets the order and the wait of contention. The `role-config` delta
says so, and task 6.3 restates the architecture passages.

Note the layering: the `claude -p` worker is not an Igor. It is one short-lived subprocess per
item with no identity, no claim, and no rank. The Igor is the long-running process that polls.

### A run by hand runs as rank 0

Decided by Adam, 2026-10-18, in his latest answers. `igor run <role>` runs as rank 0, a rank no
roster declares, with a heartbeat file of its own, `heartbeats/<role>-0-<run id>.json`. It starts at once,
beside any serving rank, and contends for items as any rank does: its claim messages carry
`Igor-Rank: 0`, and the claim and its verification decide who works an item. So `NoTwoWorkers`
covers it with no rule of its own. It takes over no claim message of any rank: not an earlier
run's at rank 0, and not a gone serving rank's. A claim it leaves is taken over by a serving rank
once that run is gone. It removes only its own trees, and those of runs that are gone.

This replaces running `igor run` as rank 1. At rank 1, beside a serving rank 1, a run would read
that rank's claims as its predecessor's, re-work them and sweep its trees. To prevent that, round
four had the run wait half a poll interval for a sign that rank 1 was serving, and had both
processes write a start id into rank 1's file, the one that found the other's id stopping for
good: a *fence*. TLC showed that the wait and the fence together still let both work one item: one failed heartbeat write during the run's wait made rank 1 look unserved
while its worker ran, and a rank 1 restarted beside the run took the run's claim for its
predecessor's. With rank 0 neither can happen: `findings/RunBesideWorker.cfg` and
`findings/RestartBesideRun.cfg` found no violation once `igor run` ran as rank 0, and were
removed. A rollback of the state branch, which could put back a file with another process's id
and stop a live rank, no longer stops anyone, since no process reads its own file's id.

`igor run --plan` changes nothing: it writes no heartbeat and removes no tree.

**Two `igor run`s of one role at once share no tree and no home** (Adam, 2026-10-19). Each run
picks a run id at its start and makes that id the start of every tree id it gives, so a run
removes no live run's trees. Each run also gets a home of its own, the `HOME` its worker's
`claude -p` calls run in, which #174 (`pinned-skills`) specifies.

**Two runs at once tell their claims apart by run id** (Adam, 2026-10-21). Both run at rank 0,
so with only the rank in a claim message each read the earliest message as its own claim and
worked the item (`findings/TwoRuns.cfg` at `5dc5273`). A run's claim message now carries
`Igor-Run: <run id>`, and where the rank is 0, verification compares it. Each run also writes a
heartbeat file of its own, `heartbeats/<role>-0-<run id>.json`: with one file shared at rank 0,
a run that crashed holding a claim never read as gone while the other kept writing, and the
file's availability flipped between the two runs' values. The model now names each process in its
claim messages and keeps a heartbeat file per process. Two runs beside rank 1 pass with a crash
(`ConcurrentInstancesTwoRuns.cfg`) and with a claim given back before its worker
(`ConcurrentInstancesTwoRunsGiveBacks.cfg`); `negative/NoRunIds.cfg` drops the run id and finds
two workers.

**A run removes what a crashed run left** (Adam, 2026-10-21). At its start a run removes the
rank-0 trees of its role whose run's process is gone, with each tree's outbox, `<tree>-git` and
`<tree>-prompt`, and the home and plugin directory #174 gives that run; #174 and #175 record it. A run tells
another run's process is gone by a lock. The lock is the author's reading of Adam's "whose
process is gone", which Adam confirmed on 2026-10-21 with decision 48: each run holds an exclusive lock on `<role>-0-<run id>.lock` in the
trees' directory while it runs, which the system releases when its process ends, so a run whose
lock another can take is gone. A heartbeat file could not say this at a run's start: it takes
three poll intervals of watching, and a run runs one cycle.

**A run's heartbeat file goes when the run does** (decision 54, drawn up by this change and
approved by Adam on 2026-10-24). Every run writes a file of its own, so without a removal the
state branch would gain a file per run for good. A run removes its file as it exits; a serving
process removes a crashed run's file once it counts that run gone, which is when the file stops
mattering to the claim rules.

**A heartbeat records its process's state-directory id** (decision 55, Adam, 2026-10-24, from
#216's decision 131). In #216 (`lore-search`), an item whose run met a sensitive question is held
for a person, and the files of that hold sit in the state directory, the directory on its host
where a process keeps its own files. #216 judges such a hold stuck once no live process answers
for that directory, and the heartbeat is where a rank sees which processes are live. #216's rules read the id, to tell whether a live process, one no sibling counts gone, answers
for a directory. No claim rule of this change reads it, so the model leaves it out.

`igor run` spends the token in `IGOR_RUN_TOKEN`, an implicit local seat, as #171 records.

### An item's owner goes first

Decided by Adam, 2026-10-18, in his latest answers, replacing a start place per rank (rank k at
its k-th candidate). Each item has an owner among the ranks the roster declares: a hash of its
id, modulo the number of declared ranks, picks the owner's place in the roster's ranks in order.
Every process computes the same owner from the item and the roster, with nothing shared. The
item's order of ranks is its owner, the ranks after it, wrapping, and then rank 0. The first
rank in that order that its heartbeat shows available goes first.

**Available means free and with a seat to spend.** A rank's heartbeat says whether it is
available: holding no claim, not stood down, and with a seat it can spend, as #143's *A role has
a seat it can spend when the gate would choose one now* defines. A rank with no seat to spend would only claim
and give back, so the item falls to the next available rank.

**Ownership orders the attempts; the claim decides who works.** A heartbeat read can be half an
interval old, so two ranks can each judge themselves first for one item. Each then posts and
verifies, and the earliest message holds the item. The model makes a process attempt the items
it goes first for before the others, and `negative/NoVerifyClaims.cfg` shows that trusting
ownership instead of verifying lets two ranks work one item.

**A rank behind the owner waits one settle interval per available rank ahead of it** before
claiming, then reads before claiming and moves on silently if the item is held. That replaces
the wait of `k − 1` intervals, which counted every lower rank, busy or not. Rank 0 owns no item
and comes last in every order, so an `igor run` beside serving ranks takes what they leave.
Both, the wait per available rank and rank 0 coming last, were this change's readings of Adam's
answers, and he approved them on 2026-10-21 (decision 44).

Requests, which people make by mentioning an Igor under the open change `directed-interaction`,
join the one candidate list ahead of found work. A request is answered with no claim: the first available rank in its order,
starting from the mention's owner by the same hash, answers, and every other rank leaves it
(Adam, 2026-10-18). `directed-interaction`'s proposal says so.

### The wait settles collisions without comments

A shuffled candidate order, rejected under *Roads not taken*, would only make a collision less
likely. Here the rank that goes first reads the item first and
claims it, and the rank behind it then sees the claim and moves on. A retraction is left only
where two ranks both read the item before either has posted. The cost of a collision was never
the wasted request — it was the claim-and-retract comment landing on somebody's issue, which is
noise aimed at exactly the people the claim exists to reassure.

The interval is `settleSeconds`, which already means "long enough for a claim to become visible
to someone else". That is what a rank behind the owner waits for, so it is not a second number to
keep in agreement with the first. It must be shorter than the poll interval (Adam, 2026-10-18):
a claim is verified within one poll interval of its message, so a settle interval as long would
make every verification late, and the role would work nothing. Such a configuration is refused,
naming both values.

### A hand-over among one role's ranks goes through the same contest

Decided by Adam, 2026-10-17. A *hand-over* is a person adding `igor:<role>` to an issue. The
in-force rule has the Igor post and start work without the settle interval, since no other Igor
competes for an item a person has given to one of them. Among one role's ranks, every rank would
read the hand-over as its own, and each would start work.

So the ranks contend as for found work: the item's owner, or the next available rank after it,
posts at once, and any other free rank waits, re-reads, and posts only if no claim message that
counts is there. Only a free rank contends; a rank whose worker is running does not. Normally
exactly one claim message appears, from the rank that goes first. The rank that posts still verifies after the settle interval, so two
ranks that both post resolve by the earliest message. The no-settle rule keeps applying between
different Igors.

**A taken-over hand-over still stands** (Adam, 2026-10-17). A rank taking over a gone rank's
claim removes the label and adds it again, which replaces the person's label with the bot's.
The item would then read as one the Igor found, and the in-force rules treat the two differently
in two places. When the Igor brings its own pull request up to date (a *catch-up*) and gives its
claim back, it keeps a person's label but removes its own, so the hand-over would be lost
unanswered. And a person's "go ahead" after a stop lifts the stop on a found item but not on a
handed-over one, so a stop that should stand could be lifted. So the taker's claim
message records that the item was handed over, as a trailer `Igor-Handed-Over-By: <login>`
(Adam confirmed the wording on 2026-10-17, round two), and the adapter reads that record as the
person's hand-over still standing.

### A claim is recovered by identity, not by waiting

A sibling can observe only how old a claim is, and a progress-bounded worker has no maximum
duration, so no age is ever conclusive. Making the marker the rank replaces the question.

Rank 2 restarts, finds a claim marked rank 2, and knows its predecessor is dead, because only
one serving rank 2 runs at a time. It takes the item back and, unless the Igor's pull request for it is
open, re-works it from scratch — the
predecessor's working tree is gone, and a tree that survived a crash is debris rather than a
checkpoint, since the worker's context died with its process.

Rank 3 finds a claim marked rank 2 and leaves it while rank 2 is not gone, because rank 2 will
recover it.

**A claim left on the Igor's open pull request is caught up, whoever left it** (Adam,
2026-10-17; any gone rank's, round two). A process that opened a pull request and then died
leaves its claim behind. Re-working the item would duplicate work in review, against triage's
skip for work in flight. So the process that takes the claim over, its restarted successor or
any sibling once the rank is gone, carries on with it as a catch-up: it brings the pull request
up to date where it no longer merges, and gives the claim back as a catch-up does, leaving the
pull request and any person's label. Without the sibling's part, triage would skip the item as
work in flight, and the role's label would stay on it with nobody behind it; `work-triage`'s
skip gains that exception, and the model shows it is needed (`CatchUpAny`).

**Every catch-up over a gone rank's claim ends with the adopting rank's own claim message**
(Adam, 2026-10-17, round two). Adam's words: the gone rank's claim message stops counting once a
later claim by the same role exists, so no release is needed and a person's label stays. That is
a new rule, supersession: everywhere else the earliest claim message holds the item, and a later
one never cancels an earlier one. The adopting rank posts its own claim message, without
removing and re-adding the label, and verifies it as for any claim. Its message supersedes the gone rank's for good, even
once that rank returns; the model shows that a gone rank's message that counts again on its
return puts two workers on the item (`CatchUpSupersedes`). Adam confirmed this reading on
2026-10-18 (round three). A returning rank can tell an adopter's message from a contender's only
if the message says so, so the message carries a trailer, `Igor-Supersedes: <rank>` (task 2.14),
which Adam accepted in round three.

A catch-up's own claim message keeps counting after the catch-up gives its claim back while a
person's label stays, since no release happens. The worry was that the message would hold the
item for a rank that is not working it, so that a later claim by another rank loses to it. It
does hold the item, but for a rank that acts on it. At each cycle, a process of that rank finds a message
carrying its own rank, and reads it as its predecessor's claim whether it posted the message
itself or a predecessor did. It carries on with the catch-up, which runs no worker and changes
nothing on the item while the pull request still merges. When the pull request closes, the person's label hands the item to the Igor again, and that
rank works it. Once the rank is gone, a later claim supersedes its message.

**The holder triages such an item again only when something changed** (Adam, 2026-10-18, round
four). Round three took `work-triage`'s exception, for a catch-up's claim message that keeps counting,
to mean triaging the item every cycle while the pull request is open: a model call each for
nothing. Now the holder passes the item over before triage unless the item or
its pull request has updated since the holder last triaged it, or the pull request no longer
merges. The last triage time is kept in memory, so a restarted holder triages the item once.

**A review to act on means resume** (Adam, 2026-10-18, in his latest answers). On the Igor's own
pull request for an item the holder holds, where it still merges, a review to act on, #150's actionable review, counts as
something changed: the holder triages the item and resumes it with a worker, as #150 says. A
catch-up over a pull request with no such review still runs no worker. #150 defines a review to
act on only for the Igor's own two-gate pull request, so this rule applies only there, a reading
Adam confirmed on 2026-10-21 (decision 51); any other held pull request keeps the catch-up's rule.

### Retirement is recorded, not detected

Retiring a process is a decision, so there is nothing to detect. A crash is not retirement: the
supervisor restarts the process and it recovers its own claim.

The roster — the ranks each role may run — is declared configuration in `igor.config.yaml`. The supervisor starts processes and the roster says which may run: a
process whose rank the roster lacks refuses to start, so the two cannot silently disagree.

Counting instances at runtime would be a registry. Being told what exists is configuration.

**A rank removed from the roster shuts down** (Adam, 2026-10-17, round two). A process reads the
roster at the start of each cycle. One whose own rank has left it starts no claim, and behaves as
when the supervisor asks it to shut down: it finishes the item in hand or hands it off out loud,
then exits. It keeps writing heartbeats
until it exits. Siblings adopt its claims only if it dies first, once its heartbeat has failed
to change for three polls, the same bound as for a declared rank that stopped running, and its
trees are swept then too. The model shows that adopting such a claim at once lets two processes
work one item (`RosterWaits`). This replaces an earlier choice, that such a process stood down
and left its claim for a sibling to adopt once its worker stopped.

**It exits with status 0, a clean exit** (Adam, 2026-10-18). #82 (`stopped-scope-visible`) has
the unit restart a process only on a failure, `Restart=on-failure`, and never after a startup
refusal, which exits 78 (`RestartPreventExitStatus=78`). Compose, under #82, restarts every exit,
0 included, so there a rank is retired by removing its service (`docker compose up -d
--remove-orphans`), as #82 says. Under the systemd unit a retired rank stays down, its unit inactive with Igor's line saying the roster no
longer declares the rank (task 4.25) in the journal, and a person who starts it again while the
roster still leaves it out gets the refusal. A retired rank needs no
status of its own; the 79 that round four gave it, with `SuccessExitStatus=79`, is gone. Nothing alerts anyone: the unit's state and
its journal say why. Measured on 2026-10-19 under systemd 252: with `Restart=on-failure` and
`RestartPreventExitStatus=78`, an exit 0 was not restarted and the unit showed inactive, an exit
78 showed failed, and an exit 1 was restarted. This change's unit has those lines (task 1.3), so a
retired rank, which exits 0, stays down.

The abandonment bound is therefore what frees any rank's claims, whether the rank crashed and
was not restarted, was left in the roster with nothing running, or was removed from it.

**No condition makes a process exit, and a failing configuration read at a cycle is refused**
(Adam, 2026-10-18, round three). Where the configuration a process reads at the start of a cycle
fails a check a starting process makes on it, the process goes on under the last configuration
that passed, roster included, and raises a condition naming the failing file and the check.
Adam's reason: an exited process comes back only by a systemd
restart loop or a person, a restart reads the same state, and anything a person fixes a running
process can pick up. Refusing to start on a bad configuration stays. #208 (`lore-pull`), which
specifies pulling the lore checkout for issue #176, records the same rule for a pull, and owns the
condition: it is `lore:config:<role>`, shared by the role, since one passing commit cures every
rank. Three kinds of passing read clear it: a read of the refused commit, a read of a commit
descending from it, and a read of a branch head that no longer holds the refused commit, as after
a force-push. A read of a commit already known does not open it again (#208's decisions 13, 36
and 37). A rank that passes on an
older commit has not seen the cure, so its read clears nothing. Whether the roster declares the
rank is no startup check on a lore read: a read whose roster drops the rank passes, and the rank
retires (#208's decision 30). This change follows #208 on all of it (decision 47). The condition is of
the read-cleared kind (Adam, 2026-10-18, round four), which #171 (`seat-files`) defines once in
`stuck-conditions`, where #171 also uses it for a seat file Igor cannot decrypt; this change
cites that definition rather than stating it. Under #171 and #208 the configuration a cycle
reads includes the seat files in the lore checkout, and where a read is refused but finds a seat file deleted, the deletion still takes effect, the one exception #171's *A removed seat file always takes
effect* makes.

**Each rank writes a heartbeat** (Adam, 2026-10-13). Every process overwrites its own small file
on the state branch, `heartbeats/<role>-<rank>.json`, every half poll interval (round three). A
timer of Igor's own writes it, apart from the cycle and from any worker, so it keeps writing
while a worker runs. Its first heartbeat lands before its first cycle (Adam,
2026-10-17): until then its file shows only its predecessor, who may have been gone long enough
that a sibling still counts the rank gone, and so leaves out every claim message of that rank,
the new process's included. **A rank is gone when its heartbeat has not
changed for three poll intervals**, measured as `work-claiming`'s *A heartbeat declares its
process's poll interval* says: the longest of the watcher's own interval and those the sibling
declared, or the 30-minute maximum where the watcher has seen no declaration (decision 49). At
the default 10-minute poll on every process that is 30 minutes, six missed firings of its timer. The bound is that fixed multiple of the poll interval; it has no setting of its own. Any
process of the role may take a gone rank's claims.

A heartbeat rather than a record written once per cycle, such as a line in `decisions.ndjson`,
because a process works its items inside the cycle: a per-cycle record goes quiet for as long as
a run lasts, and a run longer than the bound would make a working rank look gone. The heartbeat
keeps a working rank counted, which is what makes the `work-claiming` scenario *The bound does
not shorten a run* true.

**Liveness is judged by a counter, never by timestamps** (Adam, 2026-10-17, round two). The
heartbeat file holds a counter the rank increments on each write. A sibling judges liveness only
by whether the counter changed across its own polls, timed by its own clock. No time in the file
is compared across processes, or at all. Each process keeps in its own memory, per sibling, what
it last read from the sibling's file and the moment it last saw that change, and counts the
sibling gone once three poll intervals, measured as above, pass after that moment, or after its
own start if that is later.

This closes a hole in the version before it, which counted a heartbeat when its time was later
than any read from the file. A rank whose clock went back, restarted on another host or stepped
by the clock's own correction, then wrote times that never counted, so its siblings counted it
gone and took its claims while it worked. The model shows it: with times compared and one clock
stepped back, TLC finds two workers on one item (`CounterLiveness`).

**What changed means, across a restart and a rollback.** A restarted rank cannot carry its
counter on from its own file, since a lost or rolled-back state branch puts an older counter
back, and counting from there would write values its siblings have already read past. So the
file also holds an id the process picks at random when it starts, and a heartbeat counts when
the id and counter differ from what the watcher last read, not only when the counter is higher.
Adam decided on a counter that advances, and accepted reading "advances" as "differs from the
last read", with the id picked at each start, on 2026-10-18 (round three).

- **A lost or reset state branch changes no heartbeat.** A missing file lets the count run on
  from the sibling's last real heartbeat. A live rank rewrites its file within one poll
  interval, so its count restarts long before three. A crashed rank is still recovered three
  intervals after its last real heartbeat.
- **A rolled-back branch may read as a change, once.** The file put back differs from the one
  last read, so it restarts the count for its rank. That postpones a gone verdict by up to three
  poll intervals and never hastens one; the model includes it.
- **A restart forgets the counts** and starts every sibling's afresh, which postpones a gone
  verdict by up to three poll intervals and never hastens one. Storing the counts on the state
  branch would put them beside the files whose loss they exist to survive.

Watching the file replaces judging by its age, which the model showed a rollback defeats: an old
commit leaves every file present and old, so every live rank looks gone at once, and its claims
are adopted while it works them (`WatchAdvance`).

**Heartbeats are read before each claim decision** (Adam, 2026-10-17): before choosing a
candidate and again before verifying, not once a cycle. A cycle includes its worker runs, so a
read from its start can be older than the bound when the cycle reaches its next candidate, and
a sibling that restarted after the read would still look gone.

**All the role's heartbeat files are read in one request, if one request can return them** (Adam, 2026-10-17; task 4.11 measures it). Every rank of a
role acts as one GitHub App, so all of them share one budget of GitHub's rate limits, and a read
per file before every candidate and verification would multiply against it. A rate limit that
stopped heartbeats would stand every rank down at once. Under the counter a file has changed
exactly when its blob id has. Since each file also says whether its rank is available, the read
returns the files' contents too: one GraphQL query for the `heartbeats/` tree's entries can give
each blob's id and text, spending the `graphql` limit rather than `core`. Task 4.11 measures that
query. For the REST alternative, measured on 2026-10-19 (task 4.19), one Git Trees read and one
Contents PUT each cost one `core` request; the requests per cycle per rank, and an App
installation's own limit, are not yet measured. GitHub also documents secondary
limits on writes, 80 a minute and 500 an hour, which every rank's heartbeat writes count against.

**One heartbeat write takes about a second, far inside its half-interval period** (measured
2026-10-19), so a write that conflicts and retries still lands long before a process would stand
down. A Contents PUT took 0.62 to 1.04 s alone. Writes to different paths still conflict on the branch: with two writers at one
instant every round collided, the loser got a 409 and its immediate retry landed, within 1.7 s;
with three, the last needed three attempts and landed within 2.7 s.

**A rank that cannot write its heartbeat stands down** (Adam, 2026-10-17). After two poll
intervals without a heartbeat landing, as in an outage or under a rate limit, a process starts
no claim, leaving its claims as they are. It resumes once a heartbeat lands. Two is one fewer
than the three a sibling waits, so the process has stopped its worker before any sibling may
count it gone and take its claims.

**It keeps the claim in silence** (Adam confirmed, 2026-10-17, round two). By the time it stands
down, a sibling may already count it gone and have taken the item over, so a release could undo
the sibling's fresh claim. That is the stated exception to *A claim that cannot be kept is given
back, out loud*. A sibling takes the claim over once the rank is gone.

**The heartbeat timer stops a stood-down worker** (Adam, 2026-10-18, round three). At each firing,
every half poll interval, the timer that writes the heartbeat also checks whether the process has
stood down, and if it has, stops the worker itself. Deciding to stand down needs no tracker read,
so the timer needs nothing from the worker. On `main`, by contrast, a checkpoint is the claim
re-read in `src/execute.ts`, made on a worker event at most once every 30 seconds
(`CHECKPOINT_INTERVAL_MS`). `claude -p` runs with `--output-format stream-json` and no partial
messages, so a model turn is one event when it ends: a worker may go `MODEL_SILENCE_MS`, 5
minutes, with no event while the model writes, and `TOOL_SILENCE_MS`, 30 minutes, while a tool
runs. At the default 10-minute poll, 30 minutes is three intervals, the whole bound, so a sibling
could count the rank gone while its worker still ran. Waiting for
an event to stop a stood-down worker would have needed a rule on how far apart events may be;
the timer needs none. A person's stop is still seen on worker events, as on `main`.

Round one had two rules for the event gap: a worker reaching a checkpoint at least every two poll
intervals, and a process standing down at one missed heartbeat where its worker could go longer
than one. With the timer stopping a stood-down worker within half an interval, neither can
matter, and both are removed. The model checks the timer against workers whose events come two
intervals apart (`TimerHalts`).

**Taking over a gone rank's claim releases the item first** (Adam, 2026-10-17). The taker
removes the role's label and adds it again before posting its claim message, and posts at once.
Without that, the gone rank's earlier message stays the earliest since the latest release,
counts again once the rank returns, and the returning rank takes the item back as its own while
the taker works it. An item with no label can carry such a message too: a rank mid-claim posts
it just after the holder gives the claim back. A taker of that item adds the label, removes it
and adds it again. TLC found this case on 2026-10-18, once the model let a holder give its claim
back before its worker started (*Only the rank holding a claim gives it back*, below), and Adam
confirmed the release the same day (round four). A claim on the Igor's open pull request is the exception, taken over by a
superseding claim message instead, as above.

One file per rank means a write replaces only that rank's own heartbeat. It does not avoid write
conflicts: a write to any path on the state branch is rejected while another write moves the
branch (see *State becomes append-only*). A rejected heartbeat is retried like any other write,
and a retry cannot overwrite a sibling's file.

The bound governs how long an *unattended claim* may sit, never how long *work* may run.

### Ranks do not coordinate on a lore commit

Decided by Adam, 2026-10-21 (decision 43). Each rank applies the newest lore commit it has
fetched, at its own cycle start, so ranks run on different rosters and poll intervals for a while
after a commit lands. His reasons: the skew cannot be removed, only shortened, since each rank
reads at its own cycle start, and a rank whose worker runs for hours starts its next cycle that
much later; safety rests on the claim, not on the ranks agreeing; and coordinating which commit
they read would add failure modes of its own, a rank waiting on another being one.

The model gives each process its own roster and poll interval, applied at its own cycle start.
The *lore head*, the newest commit of the lore repository's branch, may drop a rank or double
the poll interval. A rank that has not fetched the head yet keeps what it had.

- **Different rosters are safe.** The roster orders attempts and retires ranks, and a retired
  rank's claims are taken only once it is gone, so the claim keeps one worker per item. Every
  configuration with a rank removed passes.
- **Different poll intervals are safe because each heartbeat declares its interval, and a
  watcher with no declaration counts in a maximum** (Adam, 2026-10-21 and 2026-10-24, decision
  49). The gone verdict compares durations kept by two processes: a writer stands down after two
  intervals without a heartbeat, and a watcher counts it gone after three. Each counting in its
  own current interval, a writer that applied a doubled interval while the watcher did not
  stands down only after four of the watcher's intervals, so three missed heartbeats let the
  watcher take the item over while the writer still works it. So each heartbeat declares its
  process's interval, and a watcher counts in the longest of its own current interval and the
  intervals the sibling declared in heartbeats the watcher saw written since the later of its own
  start and the last loss or rollback it detected. The watcher's own interval stays in. A
  watcher on the doubled interval verifies a claim within one of its own intervals; counting in
  a sibling's shorter declared interval alone, it counted the sibling gone after three short
  intervals, which can fall inside that verification window. TLC found the sibling, which had
  stood down, resuming and working the item beside the watcher
  (`ConcurrentInstancesPollSkewCrash.cfg`, before the watcher's own interval was added). A writer
  stands down after two of the shortest interval it has applied since it started. Every interval
  it declared is one it applied, so that is never longer than an interval it declared, and it
  stands down before any watcher counts it gone. `ConcurrentInstancesPollSkew.cfg` passes with the rule, and
  `negative/NoDeclaredInterval.cfg` finds two workers without it.

  A watcher that restarts, or that detects a lost or rolled-back state branch, may hold no
  declaration from a sibling, and then counts in Igor's maximum poll interval, 30 minutes. The
  maximum is three times the default 10-minute poll interval: a role may triple its interval,
  and a watcher that has lost every declaration adopts a claim after at most 90 minutes. No
  writer can apply a longer interval, since `role-config` refuses a poll interval above the
  maximum (decision 49), so none stands down later than two of the maximum, 60
  minutes. The cost is slower adoption after a loss, a rollback or a restart, up to 90 minutes,
  until the sibling's next heartbeat lands; in normal running declarations keep it to three of
  the sibling's own interval. The maximum is fixed in Igor rather than configured, so every
  rank of a role assumes the same one. A declaration counts only from a heartbeat seen written,
  its counter changed, because a file read once may be a rolled-back copy declaring an older,
  shorter interval. `negative/NoCeiling.cfg`, where a watcher with no declaration counts in its
  own interval and what the file says now, finds two workers.

  A first remedy was rejected on 2026-10-24: a writer standing down in the shortest interval it
  had read any sibling declare. TLC found a watcher that moved to the shorter interval after the
  writer last read the watcher's file. The writer, not knowing of the move, stood down later
  than the watcher counted it gone, and still worked the item when the watcher took it.
  *Rejected also:* refusing a cycle read that changes the poll interval, so that it changes only
  when every rank restarts, which still leaves skew between restarts.

### Only the rank holding a claim gives it back

Decided by Adam, 2026-10-18, round three. The ranks of one role share one label, so a removal by
any of them releases the item for all of them. The in-force rules remove it in several places
other than a run's end: a verification that fails, a failure before the worker that repeats
(#173, `pre-worker-breaker`), and a stop. So only the rank whose claim message holds the item
removes the label; any other rank drops out silently, removing and posting nothing. A rank that
loses to a sibling already kept the label (*A process that loses to its own role keeps the label
on the item*, above); this extends that to every give-back.

**After a failed read, the claim still goes back out loud** (decision 46, drawn up by this change
and confirmed by Adam on 2026-10-21, reconciling #173's decisions 22 and 35 with the silent late verification of decision
28). #173's *claim window* is the time from starting a claim, by setting the label, to holding the item. When a
claim fails there, #173 has the rank read the item's claim messages, its *test*. Where no other
rank's claim message counts, the rank posts the *refusal*, the post a refused run makes when it
gives the claim back to be tried again next cycle, or, at a third identical failure, the
*set-down*, which defers the item. Where the test's read fails, the rank reads again at its next
cycle and gives the claim back out loud unless another rank's claim counts. Where that reread
fails too, the claim is #173's *unreadable claim* (Adam, 2026-10-21, decision 52): it counts as
one `tracker` failure toward the item's breaker, and the rank posts the refusal, or the set-down
at the third in a row. It leaves the label, because it cannot tell whether a sibling holds the
item: where a process removes the label after its reread fails again, TLC finds a sibling working an item whose label is gone
(`LabelWhileWorked`, `negative/NoRereadKeepsLabel.cfg`). Before this
revision, this change had a process whose verification failed count as not holding the item,
and a verification later than one poll interval stand down in silence, so neither could post.
Both now follow #173: after a failed post or verification the process makes the test, and its own
message holding means it holds the item. A late verification works nothing, as decision 5 in the list
above requires of a claim verified more than one poll interval after its message, and gives the
claim back the same way. Four give-backs are silent: a process whose test found another process's
claim message counting drops out; a process that stood down for missed heartbeats, and one
stopped as a second writer on its rank (decision 72), keep their claims; and a failed post's
refusal past decision 65's bound is not posted. A process that stood down keeps its claim until a
sibling counts it gone, and that sibling takes the item over and says so. A second writer keeps
writing heartbeats, so no sibling counts it gone: its claims stay until a person ends one of the
two processes, as decision 72 says (see *Open Questions*).

**A withdrawal reads again before it removes the label** (decision 45, drawn up by this change from
#173's decision 29 and confirmed by Adam on 2026-10-21). #173's test and its removal of the label are two tracker calls, and a claim posted
between them must not be released while its process works. Removing the label releases every
claim message posted before the removal, since a release is ordered against a message by time,
so the timing of the removal cannot protect a claim posted between the two calls. What protects
it is who may withdraw: only a process whose own message holds the item. Any message posted
after the test is later than that one, which still counts, so its process loses at
verification. A fresh read of the heartbeat files and the claim messages just before
the removal adds two things: it sees a message posted since the test, and keeps the label on;
and it sees a rank that has come back since the test. TLC found the second. A process P's test
failed, and P reread the item a cycle later. By then the rank whose message was earlier than P's
was gone, so P read itself as holding. That rank then restarted and recovered the item, and P
removed the label from under its worker (`LabelWhileWorked`). The model makes the fresh read and the removal one step, as it does
a takeover's read and release. *Rejected:* recording the latest claim message's id at the test
and re-checking after the removal, which the report from #173 suggested. A message the re-check
finds was posted before the removal, so it no longer counts, and the re-check cannot make it
count again.

**A failed post's label is the first listed exception** (Adam, 2026-10-21, decision 42); the
second is a stop on an item no claim message holds, answered by the process that reaches it. A process that set
the label and whose claim message failed to post has no message to hold by, so the holder rule
alone would leave the label on an item nobody holds, which the next cycle claims anyway. Adam
decided the process removes the label it set, as a listed exception. With no message of its own,
nothing stops a sibling that posts after the test from verifying before the removal, and the
removal would then release that sibling's claim while it works. So the removal is bounded: the
process sends it only while less than half a settle interval has passed since it started to set
the label, by its own monotonic clock, and otherwise sends none and leaves the label. A sibling
can post only after the label is set, and verifies a settle interval after posting. The half
interval left over is for the removal to land and be visible, the visibility the settle wait
itself assumes, so the sibling verifies after the removal, finds the label gone, and works
nothing. The bound compares two durations, each on its own process's clock, as the settle wait
does. `negative/NoSettleWithdraw.cfg` removes the bound and finds two workers.

**Only the holder answers a stop on a handed-over item** (round three). The in-force rule has the
Igor remove its label and post a stop receipt when it sees a stop while no run of its own is
active. A rank cannot see a sibling's run, so a rank not working the item would post a receipt
saying the Igor stopped while the sibling's run went on to its next checkpoint. Where no claim
message on the item counts, because no rank has claimed it yet or its holder is gone, there is
no holder to leave it to, so the rank that reaches the item answers it, a reading Adam confirmed
on 2026-10-18 (round four).

The model shows both rules are needed (`HolderReleases`, `HolderStops`). Checking them also
showed that the in-force stand-down on a stop seen at verification is a give-back too: a rank
that did not hold the item answered the stop while the holder's run carried on, and the model
now applies `HolderReleases` there.

### State becomes append-only

Retrying a conflicted write is mandatory, not a choice. Measured against the Contents API: two
concurrent writes to **different paths** on one branch return 409 — `is at f3b1c59… but
expected 93283b5…` — because the conflict is on the branch ref, not the blob. Per-process files
buy nothing. A retry once the ref settles succeeds.

So the only question is whether retry is *correct*. `discovery.json` and `deferred.json` are
both folds, so each becomes a log replayed on read. `deferred.json` keeps the last record per
item. `discovery.json` keeps, for each source, the lowest of the ranks' latest marks, as the next
section says. Retrying then means re-reading and re-appending the same line: order
independent, incapable of clobbering. Retrying a keyed map means re-applying a semantic change
to a base that moved, and the naive form of that — reissuing the same bytes with a fresh sha —
destroys whatever the other writer just recorded.

Append-only is the mechanism, not the contract. A surface with a real append primitive would
meet the same requirement differently.

**Every state file more than one process writes is covered** (Adam, 2026-10-17), not only
`discovery.json` and `deferred.json`. `reconcile.json` and the daily record logs, which
`src/state.ts` re-uploads whole, are read-modify-write too, so a retry of either could discard
what a sibling wrote (task 5.1). A conflicted write is ordinary operation between siblings, so it
is never reported as a failed cycle, which would make normal concurrency read as a defect.

Two open pull requests change what `discovery.json` holds, and whichever lands second adapts:

- **PR #106** keys the watermark by role rather than by source alone. Under this change the log
  keeps one line per rank, each naming its role, folded on read into one mark per role and
  source (task 5.11). A mark belongs to a role and rank, never to one run (Adam, 2026-10-18,
  round three), and #106 now allows that, citing this change.
- **PR #99** adds the candidate ids a cycle carries to the next. They become log lines too,
  replayed per source as the union of each rank's latest (task 5.12).

### The replayed watermark is the lowest live rank's

Decided by Adam, 2026-10-13. Each line of the `discovery.json` log names its source, its rank and
its mark. The replay takes each rank's latest mark for a source, and uses the lowest of those
from ranks that still count. A rank past the abandonment bound stops counting. When no rank
counts, which happens only for a process whose own rank has saved no mark yet, since a process's own
rank always counts, while every rank that has saved one is gone, the
replay uses the lowest of every rank's latest mark rather than starting cold: a cold start would triage every
issue of the last 7 days (`COLD_START_DAYS`) again.

The two errors cost different things. A mark too low makes a process triage some items again,
a model call each. A mark too high skips items a sibling has not yet taken, and nothing brings
those items back until the issue is updated again, such as by a new comment. Taking the lowest
of every mark ever written would never advance, which is why only each rank's latest counts, and
a rank that stopped running would hold the mark down forever, which is why the bound ends its
say.

**A rank holds the mark down only once this process has seen it alive** (Adam, 2026-10-17). A
restarted process watches every sibling afresh, so for three polls it counts each one, even a
rank that died long ago and is still declared. That rank's old mark would drag the mark down,
below even a cold start's look-back. So a sibling's mark counts only once this process has seen
that rank's heartbeat change since it started; its own rank's mark always counts. **The
every-rank-gone fallback is capped** at the cold start's look-back, 7 days, for the same reason.

**An item a sibling holds is passed over before triage** (Adam, 2026-10-17). Every cycle
considers every labelled item, so without this each rank would triage every item a live sibling
holds, every cycle, with a model call each. The pass-over uses the same test as choosing a
candidate: the item's holding claim message carries a sibling's rank that is not gone.

**A cycle appends its mark only after attempting every candidate** (Adam, 2026-10-17). A cycle
that stops early holds its mark back as #101's change to *Watermarks reduce reconsideration
without governing it* says; #101 is archived, so this change cites that rule rather than restating it. Adam decided on 2026-10-18 (round four) that the reasons a cycle that stops early holds its
mark back, a stand-down among them, belong in that rule, and this change carries a `MODIFIED`
block on it that adds the stand-down (decision 36). A mark appended right after triage
passes every item the cycle meant to take, and a crash before the
claims would leave those items untaken below every mark. The code on `main` already saves the
mark only after the items are worked (`report.settle` in `src/serve.ts`, and `markAfterWork` in
`src/cli.ts`), so for one process this rule describes what the code does.

**Every cycle also considers every item carrying its role's label** (Adam, 2026-10-17), whatever
the mark. A crashed rank's claimed item can sit below every mark: a sibling saw it while the rank
still counted, passed it as held, and marked past it, and the crashed rank's own lower mark
stopped counting once the rank was gone. Without this, nothing offers the item again, and the
claim is never recovered.

#101 (`condition-backoff`, merged) re-reads `discovery.json` before saving and writes only the
saving cycle's own sources, so roles no longer put back each other's marks. Two processes of one
role still write the same source, and there the later save wins. Task 5.1 replaces that save
with the log: an append overwrites nobody's marks, so the log protects other roles' marks as
#101's re-read does.

### The tree sweep goes by rank, and the ceiling goes

A working tree's name carries its role and rank. At startup a process removes the trees of its
own role and rank, which its dead predecessor left: only one process runs at a rank, so none of
them is in use. It never removes another declared rank's, so it needs no age (Adam, 2026-10-13).
It leaves a declared rank's trees even once that rank is gone: a sibling may take a gone rank's
claims, but deleting a tree that is still in use corrupts a run, and leaving one costs only
disk. A rank the roster no longer declares will not come back, so its trees are removed, but
only once it is gone, at the start of a cycle (Adam, 2026-10-17).

**Rank 0's trees are `igor run`'s alone** (Adam, 2026-10-18). Rank 0 is no rank the roster
declares, but no serving rank removes its trees: an `igor run` may be running, and no worker
user exists for rank 0 to remove them as. Each `igor run` removes its own as it releases them,
and at its start those of runs whose process is gone (decisions 38 and 39).

**Trees live where every rank on the host can see them** (Adam, 2026-10-17). A sweep in each
instance's private temporary directory would never see another rank's trees, so trees go in a
directory every instance shares, which #175 (`worker-user`) specifies.

**The sweep takes each tree's git directory and prompt directory with it** (Adam, 2026-10-17,
and decision 48). PR #175, not merged, adds a git directory beside each tree, named `<tree>-git`,
and a prompt directory, `<tree>-prompt`, holding the system prompt file a worker's `claude -p`
reads. Prompts go on stdin under #175, but the system prompt still goes in that file, and a
crash leaves it. This change sweeps both with the tree, assuming those names, and task 4.20
checks them against #175 as merged.

**A sibling sweeps the trees of a gone rank the roster no longer declares as #175's release
removes them** (Adam, 2026-10-18): the
tree and its outbox as that rank's worker user, who owns what the worker wrote, and `<tree>-git`
and `<tree>-prompt` as the service user, who owns them under #175 and whom the worker user cannot
act for.

Adam decided on 2026-10-13 to remove `ABSOLUTE_CEILING_MS` entirely, including the worker's
6-hour kill.

**What bounds a worker once the ceiling is gone** (Adam, 2026-10-13). The silence windows kill a
worker whose stream goes quiet. A worker that keeps emitting events and never finishes is not
killed by any limit; that is accepted. Two things contain it instead. A person can stop it: a stop
is honoured mid-run at the next checkpoint (`surface-adapter`, scenario *Stop is detected during
long execution*). And the seat's reserve line, from #143 (`read-seat-windows-from-the-stream`), stops new items once
the seat's spend crosses it, so a runaway worker cannot draw others after it.

**A probe lapses when its Igor stops keeping it alive in the log** (Adam, 2026-10-24, decision
22). #101's `condition-backoff`, on `main`, lets one item through after a recurring fault stops a
role or seat, to test whether the fault has cleared: a probe. It lapses a probe that never ends
after `SWEEP_AFTER_MS`, the worker's ceiling plus an hour, and this change removes that ceiling.
A probe recording its rank and lapsing when the rank is gone, as Adam first decided on
2026-10-13, cannot be judged by a process of another role sharing the seat, which watches only
its own role's heartbeat files; and #228 (`probe-claim`) requires every Igor in a scope to judge
a lapse alike from the log, since Igors that disagree on which probes have lapsed disagree on
which probe decides. So the process working a probe item appends a keepalive row to the log
every poll interval, and the probe lapses once 90 minutes, three of the maximum poll interval,
pass without one. The model does not cover probes; #228's model covers the race between competing probe bids.

### Derived timings are fixed multiples of the poll interval

Four timings follow the role's poll interval and have no setting of their own: a rank is gone
after three intervals, a heartbeat is written every half interval, and a process stands down
after two intervals without one (Adam, 2026-10-18, round four); and a probe's keepalive is
appended every interval (decision 22, Adam, 2026-10-24). The in-force `role-config` said every
interval is configurable; this change's MODIFIED *Timing values are configurable with stated
defaults* keeps the poll interval configurable, and its ADDED *Igor fixes its maximum poll interval and the timings derived from it* makes these four the exception. The model does
not cover probes, so TLC checked safety only at the first three: gone after three intervals, a
heartbeat every half interval, and a stand-down after two. Safety depends on those three. The
stand-down after two intervals must come before the three intervals after which a sibling counts
a process gone, so that a process has stopped its worker before a sibling counts it gone. The settle interval stays configurable but must be shorter than the poll interval.

### Decisions of 2026-10-28 and 2026-10-30

The consistency read of 2026-10-21 left seven questions for Adam, listed in
*Open Questions*. Adam answered two on 2026-10-28, and the agents coordinating this work, under the
rule Adam set for which questions they may settle (one with a single option that fits, an answer
already given, or a proof or cheap reversal behind it; such a decision stands until he overrides
it), settled the five that had one good option or
an answer already given (decisions 62 to 68). On 2026-10-30 the agents closed, under
the same rule, the four correctness gaps a consistency read of 2026-10-24 found, with decisions
69 to 71, decision 70 closing
two of them, the read marker and the discovery marks, and settled the question decision 63 left, how a second writer is told from a rollback
(decision 72). The spec deltas and tasks carry all of them.

None of decisions 62 to 72 changes what the TLA+ model checks, so no configuration was run
again. The model has no mentions, chat messages or one-comment rules (62, 67, 70, 71), no hosts
or second process on a rank (63, 72), no set-down or #173 posts (64, 65), and does not spell run
ids, only distinguish them (68). Decision 69 changes nothing the model checks either. Remembering a
sibling, and counting the role as several during a process's first maximum interval, only make
a process contest a hand-over where it might otherwise work it at once, and the model contests
every hand-over whenever `HandoverContest` is TRUE, as every configuration sets it. Decision 66 is a request to #171.

- **A mention that acts goes through a claim** (decision 62, Adam). Decision 37 lets a mention
  go unclaimed because a second reply costs nothing. Under #140 an answer can open an issue or
  carry out an option the person chose, which is not harmless twice, so such an answer takes the
  claim any item takes.
- **Two processes on one rank are detected** (decisions 63, Adam, and 72). Each heartbeat
  carries its writer's host and operating-system process id, besides the start id the writer
  picks when it starts and the counter it raises at each write. A process that sees, between two
  of its reads of its own rank's file after its own first write, the counter go up under a start
  id other than its own stops
  taking items and raises a condition naming both writers. A rolled-back branch restores an older copy, which does not advance by itself, so
  it is read as a loss, as decision 49 says; only a later restore after the rollback can make an
  old id seem to advance, the gap *Open Questions* names. The model has no hosts, so a task and a test cover it.
- **The deferral wins over the label** (decision 64). A set-down, #173's deferral of an item
  after repeated failures before its worker, follows a third claim in a row whose claim messages
  cannot be read, and leaves the role's label on. Every cycle considers each labelled item, so
  without this rule the unreadable claim would be tried again every cycle; a deferred item is
  passed over before claiming until #173's *What lifts a set-down* lifts it.
- **A failed post's refusal shares decision 42's bound** (decision 65). Decision 42 lets a
  process whose claim message failed to post remove the label only within half a settle interval
  of setting it, so that the removal comes before any sibling's claim; that process's refusal
  takes the same bound. Every other refusal comes at least a settle interval after the label is set, and a set-down normally a cycle later, so the bound would silence them; they keep #173's out-loud rule.  Past the bound the failed post's refusal is silent, as a stand-down's give-back is: the item keeps the label with no claim message counting, and the rank that claims it next speaks.
- **#171 is asked to let a read-cleared condition take clearing rules** (decision 66). #171's
  read-cleared kind clears on any later passing read and lets a citing rule add none, while
  #208's `lore:config:<role>` needs its own limits; #208 asked #171 to allow them, and this is
  reported to #171, which decides.
- **A mention with no rank available gets the seat's reset time** (decision 67), from its hash
  owner, as `docs/architecture.md` promises.
- **A process knows its siblings from memory** (decision 69), so a lost state branch that
  removes a sibling's file does not make the role read as one process. And for one maximum poll
  interval after its own start it counts the role as several processes, because a sibling writes
  at least every half maximum, so by then the process has read every live sibling's file.
- **No marker passes an unanswered request another rank owns** (decision 70): a rank does not
  move the Discord read marker past a chat message, nor its discovery mark past a mention, that
  another rank is first for, until the message has an answer: a reply from the role's bot account, for a chat message an
  issue linking it, or, for a mention whose answer acts, the claim it takes. A later rank in the
  order then finds itself first once the first rank is counted gone or unavailable, and answers.
  A cycle already holds its mark back the same way before an untaken item.
- **Only the first available rank posts the one comment** (decision 71): the comment saying a
  handed-over item waits, for work in flight or for another Igor's label, which the in-force
  rules allow once per item. No rank holds such an item, so the holder rule, that only the rank whose claim message holds an item acts on it,
  cannot choose one.
- **A run id starts with a letter** (decision 68). A rank is digits only and a role's name may
  end in a dash and digits, so a run id of digits could make a run's heartbeat file name read as
  another role's rank, as `heartbeats/web-0-12345678.json` does.

### Reasoning the compacted requirements no longer carry

Several requirements this change modifies or adds stated their reasons in their own text. Where
no `design.md` held a reason, it moved here.

- **A rank such as `02` is refused** (*A process is named by its role and rank*), so each rank
  has one spelling.
- **The maximum poll interval is fixed, not set** (*Igor fixes its maximum poll interval and the
  timings derived from it*), so every process of a role assumes the same maximum; it is derived
  from the default poll interval rather than tuned.

- **A predecessor's start id in a process's own file is a rollback** (*A process detects a lost or
  rolled-back state branch from the heartbeat files*), since only a restored commit can bring that
  id back.

- **Silence after a claim is not a permitted outcome** (*An Igor never goes silent on a claimed
  item*), because the claim told others to stand off the item.
- **Every interval has a stated default** (*Timing values are configurable with stated
  defaults*), since an unstated default is a value someone guesses differently each time.

- **A killed worker's failure names which silence it breached** (*A killed worker's failure names
  the silence it breached*). Whoever reads the handoff acts on a tool that never returned and a
  model that never answered differently, and a single message covering both tells them neither.
- **A probe lapses by the execution log alone** (*A probe lapses when its Igor stops keeping it
  alive in the log*), so every Igor in the condition's scope judges it alike, including one of
  another role that cannot see the prober's heartbeat files. A prober that stops appends a void
  row so that the stopped probe neither clears the condition nor holds the scope.

- **A stop is looked for back to the cycle's read, not to the claim** (*A claim is verified after
  a settle interval*). A cycle works its items one after another, so a stop said on one item while
  the Igor works another comes after the cycle read it and before the claim; looking only back to
  the claim would miss it.
- **Giving a claim back leaves a person's hand-over** (*A claim that cannot be kept is given
  back, out loud*). Bringing its own pull request up to date is not the Igor's answer to a
  hand-over, so removing the person's `igor:<role>` label then would spend a hand-over the Igor
  has not answered.
- **The holder field is written before the claim message** (*Assignment expresses a claim;
  ordering resolves it*). Written the other way round, an Igor that fails between the two writes
  leaves a message claiming an item whose field shows nobody, a claim people miss. A list-valued
  field keeps every write rather than replacing one, so any other holder there means the claim is
  lost. Processes of one role write the same value to the holder field, so the field cannot tell
  them apart, and claim messages decide among them.
- **A release that fails is not announced** (*A claim that cannot be kept is given back, out
  loud*). The item still carries the Igor's name, so a message saying it was released would be
  false where somebody is looking. And when a surface does not answer, every remaining item would
  reach the same outcome and speak on each of them, at a volume that is itself a cause of the
  failure.
- **Two runs a surface did not answer, not one, stop the cycle** (*A claim that cannot be kept is
  given back, out loud*). A run cannot tell a surface outage from a bad item: `produce` fails
  inside the worker call, and a tracker that does not answer the release fails outside it, so
  neither the error nor how far the run got separates the two. How many items they affect does:
  an outage fails every item, and a bad item fails one. To count only runs a surface did not
  answer, a run must tell those apart from runs the surface answered with a refusal (*A refusal
  about the item does not stop the cycle*). So a write answers with what the surface recorded,
  not merely that no error was raised (*A write says what the surface recorded*), because a
  raised error cannot separate *this did not happen* from *this happened and the answer was
  lost*.
- **A go-ahead's line-break rule** (*What follows a stop is read from the tracker, not from a
  second command*). A go-ahead's names are not read past a line break, so "go ahead:" on its own
  line, with a mention on the next line, names no Igor and lifts the stop for every Igor stopped
  on the item. It is the one place a go-ahead does not err toward lifting fewer stops: "go
  ahead:" on its own line is usually meant for everyone, and a mention on the next line belongs to
  another sentence.
- **A handed-over item with work in flight waits, out loud** (*An item handed to an Igor waits
  for work already in flight*). Claiming would duplicate work already in review, which no
  hand-over overrides; saying nothing would leave the person who asked with no sign the Igor saw
  the request. Handing the item over again while that work is open changes nothing, so a handoff
  does not suggest it.
- **A second Igor's label is a request, not a claim** (*A person reassigns an issue by removing
  the holding Igor's label first*). On Linear a person replaces a delegate rather than adding a
  second; on GitHub, removing the holding Igor's label first is the equivalent.
- **A go-ahead errs the other way from a stop** (*What follows a stop is read from the tracker,
  not from a second command*). Where its names are unclear, a go-ahead lifts fewer stops, because
  lifting a stop by mistake costs more than leaving one in place.
- **The search, not a record, prevents a duplicate issue from chat** (*An issue created from chat
  points back to the chat*). A record of handled messages only saves work: losing it costs API
  calls, never a second issue.
- **A directed stop gets no handoff** (*An Igor never goes silent on a claimed item*). Posting one
  would delay the release, and whoever said stop is presumably taking the work.
- **Work finished before a claim is lost is published, not discarded** (*Work finished before a
  claim is lost is offered, not discarded*). The working tree is disposable by design, so
  discarding it then is unrecoverable: the transcript records that a change was made, not the
  change itself. Someone taking an item over is saying they are taking it, not that the work so
  far should be destroyed; and an Igor that has lost an item must not then appear in anyone's
  review queue over it, so it requests no reviewer.
- **An Igor holds exactly one role** (*An Igor holds exactly one role*), because a person reading a
  claim sees which role took the item, and hands work to a role by naming it. Igors of different
  roles may share a seat, since a seat is capacity, not an identity.
- **The App's variables are the `github-app` skill's** (*An Igor's GitHub App identity is its
  role's name*). They are the skill's environment contract, so the skill's `check` works against
  the same file. On a server they come from the role's environment file, `/etc/igor/<role>.env`;
  when a person runs an Igor themselves, from their shell.
- **Why a cycle's watermark moves as it does** (*Watermarks reduce reconsideration without
  governing it*). Deciding not to act on an item is still having considered it, so a cycle that
  acted advances past skipped items rather than paying for the same triage call each cycle. A
  preview decided nothing, so it has no such reason. Holding the mark back costs only a repeated
  triage call, the efficiency the requirement declines to treat as governing; advancing past an
  item chosen and never taken costs the item itself: marked seen, never rediscovered, never
  worked, with no decision against it. A refused claim is about the item or about what the Igor
  may do, such as an App without permission to add the label, and a retry would be refused the
  same way; since the watermark is one timestamp per source, holding it below the item would
  triage every later item again each cycle while the refusal lasted. So the item, once passed, is
  reconsidered only after somebody edits or comments on it.
- **Why a first run is bounded** (*A first run does not face the whole backlog*). Without the
  bound, an Igor pointed at an established repository faces every open item at once: a cost
  spike, and an Igor appearing to claim years of open work in its first minute. Handing it the
  backlog stays a deliberate act. What stops the next run facing the backlog again is the bound,
  which applies to every run with no watermark however many previews came before it.
- **Why the in-flight skip has exceptions** (*Items with work already in flight are skipped*). An
  artifact of the Igor's own that cannot merge is not duplication: it is the same work,
  unfinished, which nothing else will bring back. A claim left on the Igor's own artifact by a process no longer behind it is not duplication: the
  process that takes it over catches the item up rather than re-working it.
- **Why the held-by-another skip is not left to a lane** (*An item held by another party is never
  a candidate*). Acting on work that is visibly someone else's is not an organizational
  preference: an organization that forgets to write this skip into a role's lane gets an Igor that
  claims and retracts on a colleague's issue every cycle, noise aimed at exactly the people a
  claim exists to inform.

## Open Questions

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
    text. It cites *A killed worker's failure names the limit it breached*, which this change lists
    under REMOVED in `task-execution`. The ADDED *A killed worker's failure names the silence it
    breached* keeps two of its three limits, so after this change archives #216 cites a
    requirement that no longer exists. Its *run id* names one execution of an item, where decision 39's names one `igor
    run` process. Its hold records are keyed state that several ranks write, which task 5.1's
    list does not name, nor #138's store. And its authority checks spend the App's rate limit
    that heartbeats share.
  - #141 defers an item whose Igor pull request closed unmerged, where `design.md` has a
    person's label hand the item back to a rank; #141 is not in #204's order.
  - #99 clears its carried candidates once a cycle decides, where task 5.12's union of each
    rank's latest line keeps a gone rank's carried ids.
  - #173 names the claim-window test against claim messages "of another rank"; under decision
    39 two runs are both rank 0, so the test compares run ids too, as #173's decision 22 expects.
- **For the next revision, from the same read:** whether a rank whose message stopped counting,
  or that stood down after its worker ended, may still publish, which #153's post-worker steps
  also meet; #150's actionable approval past gate one, which decision 34 would have start a
  worker, and #150 archiving after this change with no leave to cite it ahead; #173's exception to the holder rule, under which a rank alone on the item in the claim window counts as holding it, beside the two this change lists; #175's and this change's circular credit for where trees live and who
  removes them; decision 37's rule, in two proposals and no spec; the rewording of #101's
  watermark sentence in this change's copy; a test for removing a gone run's lock file; which run's mark counts where two `igor run`s share rank 0; the `--poll` flag,
  which overrides the role's poll interval and escapes the settle check; rationale, task numbers
  and PR numbers inside requirement text; the unmeasured claim that only maintain or admin access
  edits a bot's comment, stated as fact in a requirement; `igor run`'s per-user state directory,
  under which two people's runs never share trees; #216's test of the roster where this change
  tests "gone"; #217's redaction of `deferred.json` as a file rewritten whole, which this change
  makes a log; and a retired rank's lore worktree under #208, which nothing removes.
- **From the consistency read of this revision, 2026-10-24:**
  - *With #173:* #173's proposal still says a process whose claim failed in the window holds
    nothing, which decision 46 replaced; #173 adds a further exception to the holder rule, in the
    claim window; and the reread and unreadable-claim rule, with near-identical scenarios, is
    stated in both changes, so one should own it and the other cite it.
  - *With #216, open until #216 is told:* #216 asked this change to drop `ProtectHome=read-only`
    from `deploy/igor.service`, so that a worker can write its home. The agent coordinating this
    work made decision 60 to drop it on 2026-10-24 and withdrew the decision the same day, so it
    is no longer listed. `ProtectHome=` makes only `/home`, `/root` and `/run/user` read-only,
    and the worker's home is `/var/lib/igor-worker-<role>-<rank>`: #175 puts it there, and #174
    resets that home before each model step. `ProtectSystem=strict` keeps `/var/lib` read-only,
    so dropping the line would change nothing; #175's unit already adds that home to
    `ReadWritePaths=`, which is what makes it writable. So `deploy/igor.service` keeps the line.
    The agent revising this change is to tell #216 that #175's `ReadWritePaths=` already meets
    its need.
  - *From the same read, for the next revision:* a catch-up that keeps a person's label leaves
    its rank's message holding the item, so after the pull request closes that rank re-works it
    with no contest. Also open: what counts as a line for the `Igor-` indenting; #173's and this
    change's rules on a message that posted but does not count, on who posts the set-down, and
    on what "several processes" means; the `role-config` scenario of a poll interval above the
    maximum, which exits 78 where #208 has the process start instead on an older commit that
    passed; #189's checks for a stop said on an item during a run, which notice it only at each
    checkpoint interval and are not yet reconciled with this change's rule on which rank
    answers a stop; and overlaps with #99, #106,
    #175 and #216 that the conflicts listed above name only in part. The criteria for detecting a lost or rolled-back state branch, which task 4.27 lists and decision 72 relies on, were drawn up by this change and are in its spec; no decision records them.
  - *From a later read on 2026-10-24, brought up to date with the decisions since:* this change
    edits #140's `directed-interaction`
    proposal directly, in the paragraph on how ranks share a request, for decisions 31, 62, 67
    and 70, and #140 edits the same paragraph; and #140's `directed-interaction` spec says
    acting on a mention claims nothing, which decision 62 changes for an answer that acts. #140
    is to bring its spec in line.
  - *With #228:* this change gives the keepalive append a deadline of half a poll interval,
    where #228's spec says no append but a probe row's has a deadline; #228 is to allow a
    deadline on the keepalive append too.
    - **From the consistency read of 2026-11-01, made when spec-check, the repository's check of
  OpenSpec changes, was reinstalled.**
  - *Reported to other changes. The changes named need to act on these findings; this change needs nothing more for them:* #150
    replaces work-triage's candidate requirement whole and drops this change's exception, as
    this change drops #150's; #150 says resuming costs no triage call and takes a fresh claim,
    where this change triages the item and its holder resumes it. #171 says a condition stops
    nothing by itself and #82 lists only read-cleared and refused-credential conditions as clearing without a probe, which conflicts with this change's condition for a second process on a rank, a third kind.
    #173 posts `claimWithdrawn`, its withdrawal message, after a failed post whose message may still land, where this change has the process post #173's refusal, so the two changes post different messages for one case; and #173 states decision 42's bound with
    scenarios, as this change does. #175 states the same SHALL for removing a gone rank's trees
    as its worker user, and its check that the worker user cannot read the environment files
    the unit loads no longer covers `/etc/igor/<role>.env`, which `igor serve` reads itself.
    #216's scenario `igor serve reviewer` is refused under this change's naming.
    - *Open:* the GitHub write budget the ranks share (task
    4.19); whether the run lock is released on every death (task 4.29). Three counts in *What
    the model proves*, for `OwnerFirst` FALSE, a rank-0 configuration and the two two-run
    configurations together, come from configurations not committed under `model/`, so they
    cannot be rerun as written.
  - *A known gap in decision 72:* two state-branch events in a row, a rollback and then a
    restore of a later commit, can make the start id of the rank's previous process appear to advance once, and so
    read as a second writer; the process then stops until the condition clears. That needs a
    rare double event and costs a pause, not a second worker, so closing it waits for a measurement of
    how often rollbacks happen (task 4.24).
  
- **From compacting the requirements under issue #232, 2026-11-02.** Every requirement keeps its
  name; some gave part of their text to a new requirement. Other open changes cite these:
  - #208 (`lore-pull`) cites *A retired rank does not hold its items forever* for retiring a rank
    the roster drops and for refusing a configuration read at a cycle's start. Both are now in *A
    process reads the roster and its configuration at each cycle start*, which #208 should cite.
  - A serving process's sweep of its own and gone ranks' trees is now *A serving process removes
    only its own and gone undeclared ranks' trees*; *The sweep removes trees by rank, never by
    age* keeps the rule that each `igor run` picks a run id and starts its trees' ids with it, and
    an `igor run`'s removal of what a gone run left; #174 cites both.
  - #150 and #106 copy this change's text of *Items with work already in flight are skipped* and
    *Watermarks reduce reconsideration without governing it* when they archive. The compaction added no
    scenario to either, so #150 and #106 need to update only the requirement text they copy.
    *Items with work already in flight are skipped* gave its rule for a held item whose
    pull request still merges to the ADDED *A held item whose own pull request still merges is
    triaged only when it changes*. #216 copies *An Igor that cannot act as its App does not
    start*, which gained no scenario.
- **Earlier findings the compaction did not resolve, for the author:**
  - With no rank available, the rank first in a chat message's order answers it with the seats'
    reset time (*A chat message becomes an issue at the first available rank in its order*), but
    a reply from the role's bot account is an answer (*An issue created from chat points back to
    the chat*), so every rank's read marker passes the message and no rank creates the issue,
    against the scenario in which it becomes an issue at a later cycle. A mention answered with
    the reset time meets the same, through `work-discovery`'s *A rank holds its mark before a
    mention another rank answers*.
  - *Only the rank holding a claim gives it back* lets a process remove the role's label only
    where its own claim message holds the item, while *A retired rank does not hold its items
    forever* has a process remove the label from an item a gone rank's message held, and the
    holder rule does not list that takeover among its exceptions.
- **From the consistency read of 2026-11-02, for the author.** None of these comes from the
  compaction; the read found them in text the compaction left as it was.
  - *A stop waits for a holder that has stood down or found a second process* states its
    exception to the in-force *Stop is unconditional and open to anyone* in its own text, as
    *A process that cannot write its heartbeat stands down* does for its exceptions. The change
    carries no `MODIFIED` copy of that requirement, whose text says a stop takes effect
    immediately; this is left as it is, since a copy would conflict with #237, an open pull
    request that shortens that requirement's text on main. Whether to add one once #237 merges
    is the author's to decide.
  - *A run by hand runs as rank 0* says a rollback of the state branch no longer stops anyone,
    since no process reads its own file's id; under decisions 63 and 72 every process reads its
    own rank's file, so that section is stale.
  - The TLA+ model runs one process per rank, so `StopNeverLost` and `OrphanRecovered` do not
    cover a rank whose two processes have stopped on finding each other. Such a rank keeps its
    claims (decision 72), and leaves the stops on them unanswered (decision 75), until the
    duplicate condition clears. This
    is accepted: as decision 63 says, a task and a test cover that state instead.
  - The proposal's *Out of scope* says nothing needs the number of processes, while hand-overs,
    give-backs and stand-downs branch on whether one process or several run the role.
  - With the state branch unwritable, heartbeats and keepalives both fail: the prober stands down
    in silence after two intervals, then gives its claim back out loud under `stuck-conditions`'
    *A prober whose keepalives fail twice in a row stops*. No scenario covers both failing.
  - The scenario *A rank's removal of the shared label does not halt another rank* describes a
    worker running on an unlabelled item, which the model's `LabelWhileWorked` says is
    unreachable.
  - The `directed-interaction` proposal text this change adds restates *available* without two of
    its conditions, and says a rank judges itself by its own state where *A chat message becomes
    an issue at the first available rank in its order* has it judge itself by its heartbeat read.
  - Work-claiming cites `signed-publishing` (#153), which #204 archives after this change, with no
    leave to cite ahead.
  - The chat channel's read marker, the mention rule that "as for a mention" points to, and what
    makes a bot comment a claim message are defined in no requirement; the trailer formats appear
    only in scenarios and tasks.
  - No scenario tests "has its heartbeat file present", "write itself not available", the lapse
    of a probe row whose void row cannot be written, a run id's first letter, or a gone run found
    by its lock with no tree left.
  - The failed-post exception assumes a label removal is visible within half a settle interval,
    which nobody has measured, and the settle interval has no lower bound; the model takes the
    removal as one step.
  - A sibling whose heartbeat writes fail is stood down only after two of its intervals, up to 60
    minutes, so it can go unseen past a starting process's 30-minute window and contest a
    hand-over made with no settle interval.
  - Ordering a claim message against a release by the second assumes no clock skew below one
    second (the 70 pairs task 2.15 measured, under *A claim message is ordered against the item's
    latest release by timestamp*, do not rule it out); there is no task to measure it.
  - In a fenced code block the one-space indent of a line beginning `Igor-` changes the quoted
    content, so *In Markdown the indent is invisible* is not always true.

## Roads not taken

**A shuffled candidate order.** Reduces collisions probabilistically and still produces
retractions. Ranking removes them.

**Per-process state files.** Measured false: the conflict is on the ref.

**A heartbeat on the claim.** The working process periodically edits its own claim comment, so
its `updated_at` means "alive as of a minute ago". Rejected in favour of the per-rank heartbeat
on the state branch: an edit every poll interval is a schedule of writes on somebody's issue, and one
file per rank covers every claim the rank holds.

**Partitioning work between processes.** Removes the race rather than resolving it, and needs a
coordinator.

**Knowing how many processes are running.** Nothing needs the number.

## What the model proves

[`model/ConcurrentInstances.tla`](model/ConcurrentInstances.tla) models this change in TLA+, and
CI runs TLC, the TLA+ model checker, on it (`.github/workflows/tla-concurrent-instances.yml`).

**TLC finds no violation in the change as specified, within what the model covers.** The model
leaves out decision 54's removal of a run's heartbeat file, decision 55's state-directory id
and the probe keepalive, none of which a modelled invariant reads. It also never grows a roster.
Decision 56 makes a process count its role as run by several processes, and so contest a
hand-over, while it knows of a sibling it has not counted gone, or within a maximum poll interval of its start (decision 69); the model contests every hand-over, so
that rule can only add contests the model already makes. Each rule the model checks is a constant,
TRUE in the change as specified. The twenty-one configurations CI runs, and `ConcurrentInstancesPollSkewFull.cfg`, set every rule TRUE.
Each of the twenty-one passes every invariant it checks, and so does `PollSkewFull`, run once
locally, though a likely fingerprint collision left a few of its states unchecked, as *Bounds and
results* explains. Each file in `model/negative/` turns one rule off and checks only the property that
breaks without it; TLC finds that violation, which shows the rule is needed. CI checks both: the
configurations beside the model must pass, and every negative file must fail.

The model's first run found eight ways the change, as first written, let two processes work one
item, lost an item, or never recovered a crashed rank's claim. Adam decided each on 2026-10-17
and added a ninth rule, for a rank that cannot write its heartbeat. Two reviews of the change
against the in-force specs and the open pull requests then raised twenty questions. Adam's
answers, the same day, added four more rules the model shows are needed (10 to 13
below). Adam's second round of decisions that day added three more (14 to 16), and dropped the
taker's wait for its release's second: every configuration now runs with a claim message free to
land in that second and not count. His third round, on 2026-10-18, added two (17 and 18) and
replaced 13 with the heartbeat timer. Modelling claims given back before the worker found two
holes. A rank that did not hold an item answered a stop seen at verification by removing the
label, which 17 now forbids. And a taker of an unlabelled item that still carried a gone rank's
claim message posted without releasing first, which *Taking over a gone rank's claim releases the
item first*, above, now covers. His latest answers, the same day, replaced the fence his fourth
round had added for `igor run`, a wait and a start id in rank 1's heartbeat file, with rank 0, and the start place per rank with a hash-assigned
owner. The model now runs each `igor run` as a process at rank 0, and orders each process's
attempts by ownership (`OwnerFirst`), with the claim's verification still deciding who works
(`VerifyClaims`, 19 below). With `OwnerFirst` FALSE, every process attempting candidates in the
source's order, TLC finds no violation either: ownership only orders attempts. That was checked on
`ConcurrentInstances.cfg`, which then reaches 48,323,006 distinct states rather than 48,487,914,
since a different order reaches different states; on `ConcurrentInstancesLiveness.cfg`; and on a
rank-0 configuration with a crash, a lost branch, a hand-over and two missed heartbeats
together, which finished at 145,557,318 states in 21 minutes. The model also
lets a person edit a claim message; the rule that an edited message counts for nothing is no
constant, since the model simply removes the edited message from those that count, so it has no
negative file. Allowing edits shows a hole, under *Findings*, below.

Adam's answers of 2026-10-21 changed the model in four ways. A claim message names its process,
and each `igor run` has a heartbeat file of its own, so two runs at once no longer read each
other's claims as their own (`RunIds`, 20 below). A claim given back before its worker now
follows #173: after a failed post or verification the process reads the claim messages, its
test; holding the item, it withdraws, removing the label in a later step after a fresh read;
where the test read fails, it reads again at its next cycle's start. A process whose claim
message failed to post removes the label it set within half a settle interval
(`SettleWithdraw`, 21 below). And each process applies its own roster and poll interval at its
own cycle start, with each heartbeat declaring its process's interval (`DeclaredInterval`, 22
below), and a watcher that has seen no declaration from a sibling since the last loss counts in Igor's
maximum poll interval (`Ceiling`, 24 below; 23, `RereadKeepsLabel`, is another rule). A new invariant, `LabelWhileWorked`, checks that no give-back removes the label
from an item a worker runs on. Before the withdrawal's fresh read was added, TLC found it
violated in `ConcurrentInstancesGiveBacks.cfg` and in a two-run configuration with a crash and
a claim given back together: a process
rereading a cycle late counted gone the crashed rank whose message was earlier than its own, and
removed the label after that rank had restarted and recovered the item.

These rules are checked without a negative file:

- **A rank removed from the roster shuts down,** finishing its item or handing it off out loud.
  Standing down in silence instead would be safe too, since siblings still wait out the
  abandonment bound, so no property breaks without it; `RosterWaits` is the rule that guards
  safety.
- **A rolled-back state branch may read as a heartbeat changing.** The model lets a rollback
  restart some watchers' counts, and checks that this loses nothing.
- **A sibling's mark counts only once this process has seen it alive, and the every-rank-gone
  fallback is capped.** Both bound how much triage is repeated, which the model does not measure.
  The model checks that neither lets the mark pass an untaken item. Every item in the model is
  inside the cold start's look-back, so the cap changes nothing in it.
- **An item a sibling holds is passed over before triage.** That saves triage calls, which the
  model does not count; the model checks that it loses no item.

The model releases an item before taking it over only where the taker leaves out a gone rank's
claim message and the item has no pull request open, as *A retired rank does not hold its items
forever* requires, whether or not the item carries the label. With the pull request open, the
taker's message supersedes instead.

**States are fingerprinted by what a step can tell apart, not by clock.** Update times and marks
are values of a counter every tracker write advances, so two runs alike but for how many writes
came between were distinct states. Each configuration declares `VIEW StateView`, and TLC
fingerprints a state by that view instead.

The view used through round four replaced each time by its place among all the times in the
state, update times and marks alike. Its distinct-state counts varied by about 0.15% from run to
run (`ConcurrentInstancesLongGaps.cfg`, 1,549,443 to 1,551,723 with 8 workers), which shows it
merged states whose next steps it then fingerprinted differently. An example:

- State A has update times 3 and 4; state B has 3 and 5. In both the times have places 1 and 2,
  so the old view merged A and B.
- In each, a cycle cut short appends a mark one below the later item's time: 3 in A, 4 in B.
- Both marks pass exactly the earlier item, so the two successors behave alike. But in A the mark
  equals the earlier time and in B it lies between the two, so the old view gave the successors
  different places, and TLC counted them as two states.

Which of A and B TLC kept, a matter of thread timing, so decided which successors
it went on to count. Verdicts were not affected, since the merged states always behaved alike.

The view now keeps exactly what a step can tell apart (decided 2026-10-18): each item's place
among the items' update times, and each mark's count of the items it passes. Every guard asks
whether an item is above a mark, takes the least or greatest of some marks, or takes the greatest
update time among some items; a new update time is always the latest; and a new mark passes
exactly the items updated before some item, or that item too. Two states with the same view are
therefore the same up to a renaming of times, and every step of one maps onto a step of the
other. Run twice, each configuration now gives the same count (see *Bounds and results*), and the
counts are smaller: `ConcurrentInstancesLongGaps.cfg` has 582,427 distinct states, against
1,551,474 under the old view and 22,856,832 with no view at round four.

Every configuration was also run once with no view, to compare verdicts and counts (*Bounds and
results*).

### Invariants and properties

| Name | Requirement it proves | What it says |
| --- | --- | --- |
| `NoTwoWorkers` | *A claim names the process that took it*; *Assignment expresses a claim; ordering resolves it*; *A hand-over among one role's ranks is contested like found work*; *A claim left on the Igor's open pull request is caught up*; *A run by hand runs as rank 0* | Never two live workers on one item, a catch-up's and an `igor run`'s included. |
| `LiveRankNeverGone` | *A retired rank does not hold its items forever*, scenarios *The bound does not shorten a run*, *A lost state branch takes no live rank's claim*, *A rolled-back state branch takes no live rank's claim* and *A rank whose clock goes back is still counted* | A live rank's claim is never taken: no other process judges gone a running rank that has written its heartbeat since it started and has not stood down. |
| `MarkNeverPassesUntaken` | *Processes saving one source keep the lower watermark* | The replayed mark never passes an item no live process has taken: such an item is among some live process's candidates this cycle, or above the mark some live process would replay. |
| `HandOverStands` | *A hand-over among one role's ranks is contested like found work*, scenario *A taken-over hand-over still stands* | An item a person handed over reads as handed over while it carries the label, until a release or a stop ends the hand-over; a catch-up keeps it. |
| `NoReceiptWhileWorked` | *Only the rank holding a claim gives it back*; *A stop on a handed-over item is answered by its holder* | A stopped item's label is off only once no worker runs on it, so a stop receipt never says the Igor stopped while a run goes on. |
| `LabelWhileWorked` | *Only the rank holding a claim gives it back*, scenario *A claim message that failed to post leaves no label behind*; *A process whose claim may have failed tests who holds the item*, scenario *A withdrawal takes no claim that came after its test*; *A test that cannot read the claim messages is read again* | No give-back removes the label from an item a worker runs on. |
| `OrphanRecovered` (liveness) | *A process recovers the claims of its own predecessor*; *A retired rank does not hold its items forever*; *Every cycle considers the items its role's label holds*; *A claim left on the Igor's open pull request is caught up* | A crashed or retired rank's claims are eventually recovered: a labelled item that no running process holds and no run has finished is eventually worked again, finished or released. |
| `EveryItemHandled` (liveness) | *Processes saving one source keep the lower watermark*, with *A process recovers the claims of its own predecessor* | Every item is eventually finished or stopped. |
| `StopNeverLost` (liveness) | *Stop is unconditional and open to anyone*, already in `openspec/specs/work-claiming`, not added by this change | A stop is never lost: eventually no worker runs on the item and its label is off, for good. |

The liveness properties hold in behaviours where some process is eventually always running.

*A conflicted state write discards nothing*, with the scenario *A heartbeat replaces only its own
rank's*, is assumed rather than proved. It says a rejected write is retried and lands the same record it first tried to write,
so the model treats a conflict as a delay before the write lands, during which a crash can lose it.

*Contention is resolved before a claim, not after it* is checked only as far as it orders
attempts: the model computes each item's owner and the first available rank from the heartbeat
files' availability, and has each process attempt the items it goes first for before the
others. It does not time the wait behind the owner, so every free rank may post, and the model
checks that verification leaves one worker. The same holds for the wait in the hand-over
contest. A configuration with one item tracks no availability, since every process then attempts
the same one item.

*A mention is answered by the first available rank* (`directed-interaction`) is not modelled. A plain reply to a mention claims nothing and starts no worker, so no invariant here speaks of it, and an answer that acts takes a claim (decision 62), which the model's claim rules cover; and Adam accepted
that a stale heartbeat can bring a second reply.

### Each decision, and what breaks without it

Each line gives the constant, its file in `model/negative/`, and what TLC finds with it FALSE.

1. **Heartbeats are read before each claim decision** (`ReReadHeartbeats`,
   `NoReReadHeartbeats.cfg`). With one read a cycle, a sibling that restarts after the read stays
   gone to the reader for the rest of its cycle, and the reader adopts the sibling's new claim.
   TLC: `LiveRankNeverGone` violated.
2. **The first heartbeat lands before the first cycle** (`HeartbeatFirst`,
   `NoHeartbeatFirst.cfg`). A rank that restarts after more than three intervals down claims while
   its siblings still count it gone; a sibling verifying a claim on the same item leaves its
   message out, and both work the item. TLC: `NoTwoWorkers` violated.
3. **Taking over a gone rank's claim releases the item first** (`ReleaseOnTakeover`,
   `NoReleaseOnTakeover.cfg`). Otherwise the gone rank's message stays the earliest since the
   latest release; when the rank returns, it takes the item back while the taker works it. TLC:
   `NoTwoWorkers` violated.
4. **Verification comes within one poll interval** (`VerifyWithinPoll`, `NoVerifyWithinPoll.cfg`).
   A later verification leaves out the message of a rank that has gone in the meantime, and the
   rank returns and recovers the item. TLC: `NoTwoWorkers` violated.
5. **A process that loses to its own role keeps the label on the item** (`LoserKeepsLabel`,
   `NoLoserKeepsLabel.cfg`). Removing it releases the winner's claim; the winner carries on, and
   the loser claims the unlabelled item again. TLC: `NoTwoWorkers` violated.
6. **A cycle appends its mark after attempting every candidate** (`MarkAfterAttempts`,
   `NoMarkAfterAttempts.cfg`). A crash between an early mark and the claims leaves items below
   every mark. TLC: `MarkNeverPassesUntaken` violated.
7. **Every cycle considers every labelled item** (`LabelSweep`, `NoLabelSweep.cfg`). A crashed
   rank's claim can sit below every mark once its own lower mark stops counting. TLC:
   `OrphanRecovered` violated.
8. **A sibling is gone only once its heartbeat has not changed for three polls, as this process
   watched it** (`WatchAdvance`, `NoWatchAdvance.cfg`). Judged by the file's age instead,
   a state branch rolled back to an old commit makes every live rank look gone at once. TLC:
   `LiveRankNeverGone` violated.
9. **A process that cannot write its heartbeat for two intervals stands down**
   (`StandDownOnMisses`, `NoStandDownOnMisses.cfg`). Without it, a live rank whose heartbeats fail
   for three intervals keeps working while its siblings count it gone. TLC: `LiveRankNeverGone`
   violated.
10. **A hand-over among one role's ranks goes through the contest** (`HandoverContest`,
    `NoHandoverContest.cfg`). Under the in-force rule, both ranks read the hand-over as their own,
    post, and start work without verifying. TLC: `NoTwoWorkers` violated.
11. **A taker's claim message records the hand-over** (`HandoverRecorded`,
    `NoHandoverRecorded.cfg`). A rank takes over a crashed rank's claim on a handed-over item, and
    removing and re-adding the label makes the item read as found. TLC: `HandOverStands`
    violated.
12. **A rank removed from the roster is adopted only once it is gone** (`RosterWaits`,
    `NoRosterWaits.cfg`). Adopted at once, the removed rank's claim is taken while its worker is
    still running. TLC: `NoTwoWorkers` violated.
13. **Igor's heartbeat timer stops a stood-down worker** (`TimerHalts`, `NoTimerHalts.cfg`, with
    worker events two intervals apart). Waiting for the worker's next event instead, the worker
    may still run at the third missed heartbeat, when a sibling counts the rank gone and takes
    the item. TLC: `NoTwoWorkers` violated.
14. **Liveness is judged by a counter, never by timestamps** (`CounterLiveness`,
    `NoCounterLiveness.cfg`). Comparing the times in the file, a rank whose clock stepped back
    writes heartbeats that never count; a sibling counts it gone while it works, takes over its
    item, and both work it. TLC: `NoTwoWorkers` violated.
15. **A gone rank's claim on the Igor's open pull request is caught up by any process**
    (`CatchUpAny`, `NoCatchUpAny.cfg`). Otherwise triage skips it as work in flight, and a
    crashed rank that is never restarted leaves its label on the item for good. TLC:
    `OrphanRecovered` violated.
16. **Over such a claim, the taker's message supersedes the gone rank's for good**
    (`CatchUpSupersedes`, `NoCatchUpSupersedes.cfg`). With no release and no supersession, the
    gone rank's message counts again once it restarts, and it catches the item up while the
    taker does. TLC: `NoTwoWorkers` violated.
17. **Only the rank holding a claim gives it back** (`HolderReleases`, `NoHolderReleases.cfg`).
    A rank that gives its claim back before its worker starts removes the label while its
    sibling, the holder, works the item; the rank claims the unlabelled item again at its next cycle and works it too. TLC:
    `NoTwoWorkers` violated.
18. **Only the holder answers a stop on a handed-over item** (`HolderStops`,
    `NoHolderStops.cfg`). A rank that is not working the item removes the label on the stop
    while its sibling's run goes on. TLC: `NoReceiptWhileWorked` violated.
19. **A claim the poster goes first for is still verified** (`VerifyClaims`,
    `NoVerifyClaims.cfg`). Trusting ownership and its own heartbeat read, a rank works an item it
    goes first for as soon as its message is posted; another rank, whose read differs or which
    does not go first, posts too and verifies, and its message can be the earlier. TLC:
    `NoTwoWorkers` violated. So ownership alone keeps no item to one worker, and the claim is the
    safety net.
20. **An `igor run`'s claim message carries its run id** (`RunIds`, `NoRunIds.cfg`). With rank 0
    alone, two runs of one role each read the earliest rank-0 message as their own claim. TLC:
    `NoTwoWorkers` violated.
21. **A failed post's label is removed only within half a settle interval** (`SettleWithdraw`,
    `NoSettleWithdraw.cfg`). Removed whenever the test finds no message that counts, it releases
    a sibling that posted after the test and verified first, and the process claims the item
    again while the sibling works it. TLC: `NoTwoWorkers` violated.
22. **Each heartbeat declares its process's poll interval** (`DeclaredInterval`,
    `NoDeclaredInterval.cfg`). Counting in its own current interval instead, a rank on a
    doubled interval stands down only after four of its sibling's intervals, while the sibling
    counts it gone after three and takes over the item it still works. TLC: `NoTwoWorkers`
    violated.
23. **A reread that fails again leaves the label** (`RereadKeepsLabel`,
    `NoRereadKeepsLabel.cfg`). Removing it, the process releases a sibling that holds the item
    and works it, though it cannot have told that from its failed reads. TLC: `LabelWhileWorked`
    violated.
24. **A watcher holding no declaration counts in the maximum poll interval** (`Ceiling`,
    `NoCeiling.cfg`). Counting instead in the longest of its own interval and what the
    sibling's file says now, which after a loss is a file the loss removed or an older one
    declaring the shorter interval, a watcher on the shorter interval whose declarations from a
    sibling were lost with the state branch counts that sibling gone after three of the shorter
    intervals, while the sibling, on the doubled interval, stands down only after four. TLC:
    `NoTwoWorkers` violated.

### Findings

Each file in `model/findings/` sets every rule TRUE and finds a violation the rules leave. CI
does not run them; they are for Adam.

- `EditedMessage.cfg`: a person edits the claim message of the rank working an item, so the
  message stops counting, and a sibling claims and works the item. `NoTwoWorkers` violated. Adam
  accepted this risk on 2026-10-18 (decision 30), taking it, unmeasured (task 2.19), that only a person with maintain or
  admin access can edit or delete the bot's comment, so the file stays as a record.
`5dc5273`'s `findings/TwoRuns.cfg`, two `igor run`s at once reading each other's claims as their own, now
passes with the run id and is `ConcurrentInstancesTwoRuns.cfg`. `7a96c14`'s `findings/PollSkew.cfg`,
ranks on different poll intervals both working one item, now passes with `DeclaredInterval` and
is `ConcurrentInstancesPollSkew.cfg`.

Two findings of the fourth round's model, `RunBesideWorker.cfg` and `RestartBesideRun.cfg`, found
two workers where `igor run` shared rank 1 with a serving process. Run again with `igor run` at
rank 0, neither finds a violation (17,363,917 and 45,066,556 distinct states), so both files are
removed.

### Bounds and results

Every run uses an abandonment bound of three poll intervals and TLC 2.19 from `tla2tools.jar`
v1.7.4. The runs without `igor run` use two serving ranks, both declared at the start; the
rank-0 runs use rank 1 alone beside one `igor run`, and the two-run ones rank 1 beside two. Time
is unbounded: the model holds two counts capped at the bound, the polls since each sibling's
heartbeat changed and the intervals since each process's own last heartbeat. A lost branch in
these runs may also be a rollback to an old commit. The `PollSkew` files change the poll interval: `ConcurrentInstancesPollSkew.cfg` has the head change
it once, and the files after it combine a change of interval with crashes, a lost branch and
missed heartbeats, each split so that one CI job stays well within its hour. A split names the
one rank that misses heartbeats, or the one that crashes, and its twin swaps them. The two ranks
are alike in the model, so each pair gives the same count.

In CI, each must pass. *With the view* is the run CI makes, on this revision's model. *Without the
view* is one run with no `VIEW`, on 4 workers, stopped after 40 minutes where it had not finished,
made on the model at `5dc5273` and not repeated since.

| Configuration | Items | Environment | Checks | Distinct states, with the view | Time | Without the view (`5dc5273`) |
| --- | --- | --- | --- | --- | --- | --- |
| `ConcurrentInstances.cfg` | 2 | 1 crash, 1 lost or rolled-back branch, 1 hand-over | invariants | 48,487,914 | 11 min 37 s, from the earlier run described below the table | stopped at 185,732,188, no violation |
| `ConcurrentInstancesMisses.cfg` | 2 | 3 missed heartbeats | invariants | 22,290,265 | 3 min 33 s, from the earlier run described below the table | stopped at 83,756,607, no violation |
| `ConcurrentInstancesLongGaps.cfg` | 1 | 3 missed heartbeats; worker events 2 intervals apart, the timer stopping a stood-down worker | invariants | 582,427 | 7 s | passes, 22,856,832 |
| `ConcurrentInstancesRoster.cfg` | 2 | 1 crash, 1 hand-over, 1 rank removed from the roster, applied by each process at its own cycle start | invariants | 50,196,866 | 9 min 46 s | stopped at 86,425,142, no violation |
| `ConcurrentInstancesCatchUp.cfg` | 2 | 1 run that opens its pull request, 1 crash, 1 hand-over | invariants | 29,707,815 | 5 min 21 s | stopped at 82,220,005, no violation |
| `ConcurrentInstancesGiveBacks.cfg` | 1 | 1 crash, 1 hand-over, 1 claim given back before its worker, 1 stop | invariants | 3,600,115 | 36 s | stopped at 113,383,292, no violation |
| `ConcurrentInstancesRunRankZero.cfg` | 2 | rank 1 and 1 `igor run`; 1 crash, 1 lost or rolled-back branch, 1 hand-over | invariants | 8,410,136 | 1 min 50 s | stopped at 64,919,964, no violation |
| `ConcurrentInstancesRunRankZeroMisses.cfg` | 2 | rank 1 and 1 `igor run`; 2 missed heartbeats | invariants | 2,136,707 | 23 s | passes, 20,216,806 |
| `ConcurrentInstancesTwoRuns.cfg` | 1 | rank 1 and 2 `igor run`s; 1 crash | invariants | 14,368,406 | 2 min 49 s | not run |
| `ConcurrentInstancesTwoRunsGiveBacks.cfg` | 1 | rank 1 and 2 `igor run`s; 1 claim given back before its worker | invariants | 13,779,513 | 2 min 38 s | not run |
| `ConcurrentInstancesLiveness.cfg` | 1 | 1 crash, 1 stop | invariants and liveness | 336,418 | 55 s | stopped at 5,186,995, no violation |
| `ConcurrentInstancesLivenessRoster.cfg` | 1 | 1 hand-over, 1 stop, 1 rank removed from the roster | invariants and liveness | 481,693 | 1 min 28 s | passes, 3,231,478 |
| `ConcurrentInstancesLivenessCatchUp.cfg` | 1 | 1 run that opens its pull request, 1 crash, 1 hand-over, 1 stop | invariants and liveness | 1,295,519 | 4 min 35 s | stopped at 3,984,894, no violation |
| `ConcurrentInstancesLivenessRankZero.cfg` | 1 | rank 1 and 1 `igor run`; 1 crash, 1 stop | invariants and liveness | 91,700 | 14 s | passes, 465,757 |
| `ConcurrentInstancesPollSkew.cfg` | 1 | 3 missed heartbeats; the lore head doubles the poll interval, and each process applies it, or keeps its own, at its own cycle start | invariants | 5,194,943 | 1 min 7 s | not run |
| `ConcurrentInstancesPollSkewLoss.cfg` | 1 | every process starts on the doubled interval; the head changes it once; 1 lost or rolled-back branch; 3 missed heartbeats, by rank 2 only | invariants | 45,836,405 | 9 min 41 s | not run |
| `ConcurrentInstancesPollSkewLoss1.cfg` | 1 | as `PollSkewLoss`, with rank 1 the one that misses | invariants | 45,836,405 | 8 min 40 s | not run |
| `ConcurrentInstancesPollSkewCrash.cfg` | 1 | the head changes the interval twice; 1 crash, of rank 1; 3 missed heartbeats, by rank 2 | invariants | 53,324,134 | 9 min 59 s | not run |
| `ConcurrentInstancesPollSkewCrash1.cfg` | 1 | as `PollSkewCrash`, with the ranks swapped | invariants | 53,324,134 | 9 min 10 s | not run |
| `ConcurrentInstancesPollSkewCrashLoss.cfg` | 1 | the head changes the interval once; 1 crash, of rank 1; 1 lost or rolled-back branch; 1 missed heartbeat, by rank 2 | invariants | 47,548,114 | 10 min 2 s | not run |
| `ConcurrentInstancesPollSkewCrashLoss1.cfg` | 1 | as `PollSkewCrashLoss`, with the ranks swapped | invariants | 47,548,114 | 9 min 54 s | not run |

All pass with the view, in a run of every configuration on this revision's model, on 6 TLC workers
of a 10-core Mac shared with `ConcurrentInstancesPollSkewFull.cfg`, below. The first two ran while
the host was short of memory and swapping, and took 112 min 29 s and 37 min 32 s; their counts
match the earlier run, made on 8 workers before the ceiling rule, so the table gives that run's
times for them. The other `PollSkew` files are new. Every count but
`ConcurrentInstancesPollSkew.cfg`'s is the same as before the ceiling rule, which shows the rule adds no state where the interval never changes; `PollSkew`
moved from 5,350,517 to 5,194,943, since a watcher now counts in the longest of its own interval
and the intervals it has seen declared, or in the maximum before it has seen any. The view's counts repeat exactly:
`ConcurrentInstances.cfg` gives 48,487,914 and `ConcurrentInstancesLongGaps.cfg` 582,427 on this
revision's model, the same as at `5dc5273`, where they repeated on three runs and four runs
respectively. `ConcurrentInstancesRoster.cfg` and `ConcurrentInstancesLivenessRoster.cfg` grew,
before this revision, when each process came to apply the roster at its own cycle start, and
`ConcurrentInstancesGiveBacks.cfg` when a claim given back came to have a test, a withdrawal and a
reread. The two two-run configurations together, a crash and a claim given back in one TLC run,
also pass, at 74,648,408 states in 18 min 35 s, too long for a CI job on GitHub's slower runner, so
CI runs them split. A single configuration of `igor run` beside rank 1 with a crash, a lost branch,
a hand-over and two missed heartbeats together is too large for a CI job too: with `OwnerFirst`
FALSE it took 21 minutes on 8 workers here, and with it TRUE it had passed 47 million states in 6
minutes when stopped. So CI runs it split into the two `RunRankZero` files above.

`ConcurrentInstancesPollSkewFull.cfg` puts every poll-interval fault in one run: the head changes
the interval twice, any rank may crash twice, the branch may be lost or rolled back once, and any
rank may miss three heartbeats. It is too large for CI and runs here only. It finished on
2026-10-28 with no error found: 3,210,473,091 distinct states, a complete search to depth 94, in
3 days 21 hours on 4 workers, part of that time paused while the other configurations ran. TLC
printed two estimates of whether two distinct states shared a fingerprint, so that some state
went unchecked: `val = 4.1`, which TLC calls optimistic because it assumes evenly spread
fingerprints rather than because it is lower, and `val = 1.0`, computed from the fingerprints
actually seen. TLC reports these as probabilities, and a value of 1 or more means a collision is
likely rather than giving its odds, so a few of the 3.2 billion states were probably not
checked. The run is strong evidence, not an exhaustive proof. It need not be repeated with another fingerprint seed unless the modelled rules change: a second
run would take about four days and would miss a different few states, while the split
configurations CI runs each combine a change of interval with some of these faults and check
that combination in full, and none combines all of them: only `PollSkewFull` puts a crash, a lost branch and three missed
heartbeats with a change of interval in one run, where the split file that combines a crash with
a lost branch allows one missed heartbeat.

Each of the twenty-four files in `model/negative/` finds its violation on one worker, which is how
CI runs them, the slowest, `NoCeiling.cfg`, in 5 min 12 s, and all of them in 17 min 53 s added
together. CI runs them in two jobs, by the first letter after `No`, to keep each well within its
hour. `model/findings/EditedMessage.cfg` finds its violation, `NoTwoWorkers`, within a second.

To reproduce a run, download `tla2tools.jar` from the TLA+ release v1.7.4
(`https://github.com/tlaplus/tlaplus/releases/download/v1.7.4/tla2tools.jar`) into `model/`, and
from `model/` run:

```sh
java -cp tla2tools.jar tlc2.TLC -workers auto -config ConcurrentInstances.cfg ConcurrentInstances.tla
```

A negative file runs the same way, as `-config negative/NoLabelSweep.cfg`.

### What the model assumes

Adam accepted these on 2026-10-17.

- **A stop on an item whose holder is down is answered by the next process that reaches the item**,
  which releases the claim. That holder is that process's own predecessor, or a gone rank.
- **A label removed by the role's own bot account does not stop a running worker.** The in-force
  rules call that removal the Igor's own release and say nothing more.
- **Triage says proceed** for every candidate that is not finished.
- **A stop is permanent.** No go-ahead or cooldown follows it.
- **A claim-and-retract is acceptable.** A sibling that reads a claim between its label and its
  message posts a message of its own, and one of the two stands down. No invariant forbids it.

The model also assumes:

- **Every heartbeat write changes the file.** The counter goes up, and a restarted process
  writes a new id, so no clock enters into it. A clock stepped back therefore changes nothing
  the model reads under the counter, and no configuration that must pass includes one;
  `NoCounterLiveness.cfg` includes one to show what comparing times would break.
- **A claim is visible at once.** The settle interval's length is not modelled.
- **Igor's timer stops a stood-down process's worker within the interval in which it stood
  down** (`TimerHalts`). With the rule off, the worker stops at its next event, up to
  `CheckpointGap` intervals later.
- **A claim given back before its worker starts** (`MaxFails`) fails at its post or at its
  verification, and the test that follows may itself fail. The model removes a failed post's
  label only in the same step as the failed post and its test, which stands for decision 42's
  bound; a process that does not remove it then leaves the label. The withdrawal's fresh read and its removal are one step,
  as a takeover's read and release are. A reread that fails again changes nothing the model
  holds: the refusal and set-down posts and the deferral are not modelled, and the label stays.
  A reread decides nothing about the worker: whatever it
  finds, the process works nothing from it.
- **A process whose rank leaves the roster keeps writing heartbeats until it exits.** It sees
  the change at a cycle start of its own, when it applies the lore head or keeps the commit it
  had. Nothing obliges a fetch to bring the head, so a process may run on the old roster for
  good, which the liveness properties allow.
- **Time is counted in the shorter poll interval where the interval may change.** A process on
  the doubled interval writes a heartbeat every half of its own interval, which is once per
  shorter interval, and may let one shorter
  interval end between setting its label and verifying. It counts a sibling gone after three of
  the longest of its own interval and those it saw the sibling declare since it started and since
  the last loss, or else in `CeilLen`, the maximum, and stands down after two of the shortest it has applied. The
  head may change twice, the second time back. A process forgets every declaration at a loss or
  rollback, which it is taken to detect: a serving rank's file missing, or a counter lower than
  the one it last read. A rollback that leaves a file's counter where the watcher last read it changes nothing
  the watcher holds.
  A process on the doubled interval may start its cycles as often as one on the shorter
  interval, which only adds behaviours.
- **A pull request is opened only by a run, before it finishes,** at most once per behaviour
  (`MaxPRs`), and a catch-up then finishes the item. What a person's label does after the pull
  request closes is not modelled, nor is the tree sweep.
- **Each `igor run` runs one cycle and starts at most once, at any point** (`NRuns`); the
  two-run configurations run two beside rank 1.
- **A lost state branch takes every heartbeat file's availability with it; a rollback leaves each
  file's availability as it was just before the rollback.** Which rank goes first decides nothing the invariants check, and the
  configurations pass with `OwnerFirst` FALSE too.

## Since review: the reserve becomes a line checked against a stream reading (2026-09-28)

Recorded 2026-09-28. This changes no requirement or task here.

Adam decided that a seat's reserve is a line that rises toward the reset, checked against the
seat's latest unreset stream reading ([`docs/architecture.md` §6.3.4](../../../docs/architecture.md#634-a-seats-reserve-is-a-line-that-moves-toward-the-reset--decided-2026-09-28-specified-on-143-not-built)).
The line is `1 − r × remaining` with `r = max(seat reserve, role reserve)`, since a role file may
set its own reserve. It is specified on [#143](https://github.com/adamstallard/igor/pull/143). Its accepted cost is that Igor sees its own spend only in the next reading, which #143
measured as arriving after a run's first model call. A process can therefore start a second run
before the first run's reading shows the line crossed, so each Igor process can overshoot the
line by about two runs.

The proposal's *Per-process budget* says concurrency "spends faster without spending
differently", because the gate is checked before each item. Under the line that stops being quite
true. Each process checks the gate before its own item, and none of them sees the others' runs
until a reading arrives. So the overshoot is about two runs per process, not per Igor, and N
ranks can start about 2N runs past the line before any of them reads it. This is the same slack #143
leaves open for several Igors on one seat, and it would be settled with that. Nothing needs to be
decided here before then.
