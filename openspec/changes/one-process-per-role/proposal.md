# One process per role

## Why

- A role works one item at a time, so its throughput is one worker's, however many seats it could spend (#169).
- Two processes of one role both claim with the role's label, cannot tell their claims apart, and work the same item; nothing stops a second process from being started.
- A process that starts after a crash recovers its predecessor's claims only by accident: an item that triage now skips, or one whose pull request is already open, stays labelled with nobody working it.

## What Changes

**One `igor serve` process serves a role, and runs up to the role's `workers` workers at once,**
each in a numbered worker slot, on its own item and its own seat. A cycle hands the items it
would claim to free slots without waiting for a worker to finish, and passes over items its
workers already hold. A stop on an item reaches the worker working it.

**A second process of the role refuses to start.** Each serving process keeps a serving record
on the state branch and rewrites it every 5 minutes. A starting process takes its role's lock
beside its lore checkout, then watches the record for 30 minutes and exits with status 78 if a
write lands on it. These timings are fixed in code, whatever each process's poll interval. A
restart from the same lore checkout, which finds its own lock free and the record naming that
lock, takes over at once. A serving process that cannot rewrite its record for 20 minutes stops
its workers and exits, so it has stopped before anyone else could take over.

**A process that takes over adopts or gives back every claim under its role's label.** An item
with the Igor's open pull request is caught up; any other is triaged again and worked under a
fresh claim message, or given back out loud. A stop said while no process served the role is
answered at adoption. The process removes the working trees its role's slots left, whatever
their age.

**Replaces `concurrent-instances`.** This change replaces both #179's restated
`concurrent-instances` (closed unmerged; see #241) and the earlier version merged on `main`,
whose directory, `openspec/changes/concurrent-instances/`, this change deletes. Both versions of
`concurrent-instances` ran one role as several processes told apart by rank.

**Specs:**
- `role-process` (new): one process per role, the serving record and the startup guard, the
  stand-down, adoption, worker slots, seats per worker, stops, retried state writes, and the
  sweep of slot trees.
- `role-config`: adds *A role sets how many workers its process runs*; modifies *An Igor holds
  exactly one role*, whose processes of one role were interchangeable, and *Timing values are
  configurable with stated defaults*, which now excepts the serving record's fixed timings.
- `graceful-handoff`: modifies *An Igor never goes silent on a claimed item*, so a process that
  stands down leaves its claims silent for the process taking over to answer.
- `work-discovery`: modifies *The cycle repeats without supervision*, so that shutdown now
  finishes every item in hand, not one.
- `task-execution`: modifies *Igor forwards the termination it is sent*, which leaves every
  running worker to finish on a graceful wind-down, and *The abandoned-tree threshold derives
  from the worker's longest possible life*, which now covers only trees no worker slot names.
- `work-triage`: modifies *An item held by another party is never a candidate*, whose scenario
  for an item the Igor holds now excludes items its own workers hold.

No entry in a capability's `decisions.md` record is added, changed or removed.

## Capabilities

### New Capabilities

- `role-process`: one serving process per role, which runs the role's workers concurrently,
  refuses to start beside a live process of its role, and adopts its predecessor's claims.

### Modified Capabilities

- `role-config`: a role sets `workers`; processes of one role are no longer interchangeable;
  the serving record's timings are fixed, not configurable.
- `graceful-handoff`: a stand-down leaves its claims to the process taking over.
- `work-discovery`: shutdown finishes every item in hand.
- `task-execution`: winding down leaves every worker running; the age-based tree sweep covers
  only trees no worker slot names.
- `work-triage`: an item the Igor's own workers hold is not a candidate.

## Impact

- `src/serve.ts`, `src/loop.ts`, `src/budget.ts`, `src/sweep.ts`, `src/worktree.ts`,
  `src/state.ts`, `src/role.ts` and `src/cli.ts`; a new module for the serving record and lock.
- `docs/architecture.md` and `docs/deployment.md`, where they say a role may run as several
  interchangeable processes.
- A TLA+ model of the startup guard and adoption, run by a new CI workflow.
- Open pull requests that cite #179 need their citations moved here; #241 lists them.
