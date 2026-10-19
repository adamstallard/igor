## Context

Every `igor serve` process on a server starts in one lore checkout, `/srv/igor/lore` under the
shipped unit and `/srv/lore` under compose, whatever its role or rank. Today each reads
`igor.config.yaml` and its role file there at start, and reads lore entries there before each
item. `igor serve` writes nothing to that checkout: the state branch is written through GitHub's
API. Workers run inside the cycle, one after another (`src/serve.ts`). Two open changes this one
builds on add more: under #179 a process rereads `igor.config.yaml` at the start of each cycle,
and under #171 seat files are decrypted on each lore read.

The requirements fix what must hold. This document records how, where they leave a choice.

## A process reads one commit, from a worktree of its own

**Chosen.** Each process keeps two refs of its own:
- `refs/igor/lore/<role>-<rank>/fetched`, which each fetch moves to the branch's tip;
- `refs/igor/lore/<role>-<rank>/applied`, which names the last commit whose read passed.

The process keeps a detached worktree of the lore checkout at the commit it applies. The worktree
sits inside the lore checkout's directory, at `.igor/worktrees/<role>-<rank>`, which the process
lists in `.git/info/exclude` so that the shared checkout's status does not show it. Inside the
checkout, the worktree is on the volume every compose container shares and inside the unit's
writable paths. Before each lore read the process runs, in its worktree,
`git -c core.hooksPath=/dev/null checkout --force --detach <commit>` and then
`git clean -ffdx`. Any change or extra file left there is thereby discarded, and no hook runs.
It then loads the configuration from the worktree exactly as it loads from a checkout today.
`loadConfig`'s check that the lore store, the directory `destination` names, sits at the root of
its repository still works, because a linked
worktree answers `git rev-parse --show-prefix` with an empty prefix at its root, as a checkout
does.

A relative path in `igor.config.yaml` that resolves inside the repository is read from the
worktree. One that resolves outside the repository, such as `seatKey: ../seat.key`, resolves
against the lore checkout's directory as it does today. Resolving it against the worktree would
point it at a file that is not there.

To find a removed seat file between cycles, the process lists `seats/` in the newly fetched
commit with `git ls-tree`, which reads the object store and touches no working tree. Finding a
removal decrypts nothing.

**The fetch** is
`git -c core.hooksPath=/dev/null fetch --no-auto-gc --no-write-fetch-head https://github.com/<owner>/<repo>.git +refs/heads/<branch>:refs/igor/lore/<role>-<rank>/fetched`,
with the App's token supplied for that command by the one-command credential helper that
`src/worktree.ts` uses. Naming the URL rather than the remote means no remote-tracking ref is
updated, so processes share no ref. `<owner>/<repo>` and `<branch>` come from the upstream of the
checkout's branch, which the start checks is a credential-free `https://github.com/` URL.
Because the checkout's `.git/config` is still read, the start also refuses a
`url.<base>.insteadOf` there: one could send the fetch to SSH, past the App's token.

The fetch and the worktree checkouts share the checkout's object store. Each process writes only
its own refs, its own worktree and its own index. Concurrent writes of new objects into one store
are safe in git. Whether git still contends some lock shared by the whole repository, such as
one taken for packed refs, is task 1.5's measurement; a lock failure is a failed fetch, retried
at the next firing.

**No process prunes another's worktree.** Every process, and under compose every container,
shares the checkout's `.git`. A process recreating its worktree leaves its directory missing for
a moment, and `git worktree prune` run by another process then would remove its entry. So a
process never runs it, and repairs or recreates only its own
worktree.

**Rejected: fast-forwarding the shared checkout**, the wording of Adam's 2026-10-11 decision
(the proposal's decision 7). Two failures follow from several processes sharing one working tree:

- **A read during a rewrite.** Git replaces a file during checkout by unlinking it and writing it
  again. A process that lists `seats/` in that moment sees a seat file missing, and *A removed
  seat file always takes effect* would kill the workers using a seat that nobody removed. A
  half-written role file could also pass validation and apply a configuration nobody committed.
- **Lock contention.** Each process fast-forwarding the same checkout takes the same index lock,
  so all but one fail at each firing and report a failed pull that is not a fault.

A file lock around every read and every fast-forward would prevent both, but every loader, and
the per-item read of lore entries, would have to take it. Node has no portable file lock, and a
process that crashed holding the lock would block every other.

**Rejected: reading each file with `git show <commit>:<path>`.** It reads one commit with no
working tree at all, but every loader and the store would need a second way to read files, and
the store's root check asks git about a directory.

**What the operator gives up.** An uncommitted edit, or a local commit, in the shared checkout
no longer reaches `igor serve`, even at start. An operator who edited configuration on the server
loses that way of changing it. Such an edit is the drift `docs/architecture.md` §6.7 warns of,
configuration that differs by machine, so the loss is intended; the start reports each such
change so that it is not silently ignored.

## A restart starts on a commit that passed

A process that restarts fetches first, then reads the commit `fetched` names; where that fetch
fails, `fetched` still names what it fetched before stopping. Where that commit fails the startup
checks and `applied` exists, the process starts on `applied` with the refused-read condition
open. Only a process with no `applied` ref, one that has never run, refuses to start on a failing
commit.

`applied` names a commit that may still hold a seat file a later, refused commit removed. The
configuration in force therefore always drops every seat file the `fetched` commit lacks, at
start as between cycles. A removal survives a restart without any record beyond the two refs.

A process that has never fetched, and whose first fetch fails, sets `fetched` to the commit the
checkout's own remote-tracking ref names, the one the operator last fetched.

## The seat notice goes out once

Every process on every server applies each commit, so without a guard a seat-file change would be
announced once per process. The guard is a record on the state branch at
`notices/seats/<seat-id>/<blob-id>.json`, created only where it is absent. A process creates it
with the Contents API call `writeState` makes, a `PUT` of the path, sent without a `sha`. GitHub
documents that a `PUT` updating an existing file needs that file's `sha`, so the call fails
where the record exists; task 5.2 measures it. The process posts only when its own `PUT` created
the record.

A crash between creating the record and posting loses that notice. The alternative, posting
first and recording afterwards, sends two notices whenever two processes apply the commit within
the same few seconds, which servers on one poll interval regularly do. The seat-notice workflow
has already mentioned the owner on the pull request before the merge. Losing Igor's notice after
the merge, the owner's second, costs less than a duplicate on every busy merge.

Keying the record by the file's blob id rather than by commit means that a later commit leaving
the seat file unchanged posts nothing, and a file changed back to an earlier content is not
announced again. If the state branch is deleted, which `work-discovery` allows since state is a
cache, a process applying a change late, after another process announced it, would announce it
again.

## Why no TLA+ model here

The repository owner's rule asks for a TLA+ model beside the spec where a change is about
concurrency or state that several processes share. This change has two such places:

- **Which commit each rank applies.** The question is whether #179's rules still keep two workers
  off one item while ranks run on different commits. Those rules and their invariants live in
  #179's model, so a model here would copy #179's heartbeat and claim logic. The gap exists in
  #179 already: a person restarting ranks one at a time after a lore change gives the ranks
  different rosters and poll intervals for a while. The proposal recommends that #179's model
  give each process its own view of the roster and the poll interval.
- **The notice record.** Its one guarantee, at most one notice per seat and content, follows
  directly from a create that fails where the record exists. A model would restate that single
  step.

## Measurements

- That fetches into distinct per-process refs, and checkouts of distinct worktrees of one
  repository, run concurrently from several processes without lock failures, and how long one
  fetch of the lore repository takes (task 1.5).
- That a Contents API `PUT` without `sha` fails on an existing file (task 5.2).
