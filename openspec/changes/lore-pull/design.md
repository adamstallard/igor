## Context

Every `igor serve` process on a server starts in one lore checkout, `/srv/igor/lore` under the
shipped unit and `/srv/lore` under compose, whatever its role or rank. In the code on `main` each process reads
`igor.config.yaml` and its role file there at start, and reads lore entries there before each
item. `igor serve` writes nothing to that checkout: the state branch is written through GitHub's
API. Workers run inside the cycle, one after another (`src/serve.ts`). Two open changes this one
builds on add more: under #179 a process rereads `igor.config.yaml` at the start of each cycle,
and under #171 seat files are decrypted on each lore read.

The requirements fix what must hold. This document records how, where they leave a choice.

## A process reads one commit, from a worktree of its own (Adam, 2026-10-18)

Each process keeps two refs of its own:
- `refs/igor/lore/<role>-<rank>/fetched`, which each fetch moves to the branch's tip;
- `refs/igor/lore/<role>-<rank>/applied`, which names the last commit whose read passed.

The process keeps a detached worktree of the lore checkout at the commit it applies. The worktree
sits inside the lore checkout's directory, at `.igor/worktrees/<role>-<rank>`, and the process
lists `.igor/` in `.git/info/exclude` so that the shared checkout's status does not show it. Inside the
checkout, the worktree is on the volume every compose container shares and inside the unit's
writable paths. The process creates and repairs it with
`git -c core.hooksPath=/dev/null worktree add --detach` and `worktree repair`, and before each
lore read runs, in its worktree,
`git -c core.hooksPath=/dev/null checkout --force --detach <commit>` and then
`git clean -ffdx`. The forced checkout and the clean discard any change or extra file left in
the worktree. Every one of these commands runs with no hook and with `GIT_CONFIG_NOSYSTEM=1` and
`GIT_CONFIG_GLOBAL=/dev/null`, so that only the checkout's own configuration, which the start
has checked, is read.
It then loads the configuration from the worktree exactly as `main` loads from a checkout.
`loadConfig`'s check that the lore store, the directory of lore entries that `destination`
names, sits at the root of its repository then runs against the worktree, where `destination`
resolves, and still passes, because a linked
worktree answers `git rev-parse --show-prefix` with an empty prefix at its root, as a checkout
does.

A relative path in `igor.config.yaml` resolves against the directory holding `igor.config.yaml`
in the lore checkout, as `src/config.ts` resolves it on `main` and as #171 says of `seatKey`.
Where the result lies inside the checkout, the process reads the same path in its worktree;
where it lies outside, such as `seatKey: ../seat.key`, it reads that file. Resolving against the
worktree instead would point `../seat.key` at `.igor/worktrees/seat.key`, a file that is not
there.

After each fetch, even mid-cycle, the process finds the seats to keep out with
`git log --no-renames -m --first-parent --diff-filter=D --name-only <applied>..<fetched> -- seats/`.
`--no-renames` reports a renamed seat file as deleted, which by default git would report as a
rename. `-m --first-parent` compares each merge with its first parent, so a deletion a merge
brings, or one made while resolving a merge, is listed. The command thus lists every seat file
that some commit since the applied one deleted. Task 4.4 tests a rename and a deletion made only
in a merge's resolution. The command reads the object store without touching a working tree.
Finding a removal decrypts nothing, so seat files are still decrypted only on a lore read
(decision 4). A seat on that list stays out until a read that passes holds its file again
(decision 15), even where a later commit adds the file back. A process with no applied ref has
nothing in force to remove from: its configuration holds the seats the fetched commit holds.

**The fetch** is
`git -c core.hooksPath=/dev/null fetch --no-auto-gc --no-write-fetch-head https://github.com/<owner>/<repo>.git +refs/heads/<branch>:refs/igor/lore/<role>-<rank>/fetched`,
run with `GIT_CONFIG_NOSYSTEM=1` and `GIT_CONFIG_GLOBAL=/dev/null`, and with the App's token
supplied for that command by the one-command credential helper that `src/worktree.ts` uses. Naming the URL rather than the remote means no remote-tracking ref is
updated, so processes share no ref. `<owner>/<repo>` and `<branch>` come from the upstream of the
checkout's branch, which the start checks is a credential-free `https://github.com/` URL.
Because the checkout's `.git/config` is still read, the start also refuses any key there under
`url.`, `http.`, `credential.`, `filter.`, `include.` or `includeIf.`, and `core.fsmonitor`,
`core.sshCommand` and `core.gitProxy`. A URL rewrite could send the fetch to SSH, an extra header
or a credential helper could authenticate it as a person, a proxy could take it elsewhere, an
include could bring any of these from another file, and a filter or fsmonitor runs a command.

The fetch runs as a child process, so it never holds up #179's heartbeat timer it rides on: the
heartbeat is written at each firing whether or not a fetch is running. A fetch rides every second
firing, once per poll interval. One still running when the next fetch is due is killed and counts
as a failed fetch, so a hung fetch costs one poll interval and never makes siblings count a live
rank gone.

The fetch and the worktree checkouts share the checkout's object store. Each process writes only
its own refs, its own worktree and its own index, and one shared file: at start, where
`.git/info/exclude` lacks the line `.igor/`, it appends that line. Two processes appending at
once can at worst write it twice, which git reads as one rule. Concurrent writes of new objects into one store
are safe in git. Whether git still contends some lock shared by the whole repository, such as
one taken for packed refs, is task 1.5's measurement; a lock failure is a failed fetch, retried
at the next firing.

**No process prunes another's worktree.** Every process, and under compose every container,
shares the checkout's `.git`. A process recreating its worktree leaves its directory missing for
a moment, and `git worktree prune` run by another process then would remove its entry. So a
process never runs it, and repairs or recreates only its own
worktree.

**Rejected: fast-forwarding the shared checkout.** Two failures follow from several processes sharing one working tree:

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

## A restart starts on a commit that passed (Adam, 2026-10-18)

A process that restarts fetches first, then reads the commit `fetched` names; where that fetch
fails, `fetched` still names what it fetched before stopping. Where that commit fails the startup
checks and `applied` exists, the process reads `applied`. Where that passes, it starts there with
the refused-read condition open. Where `applied` fails too, as after an Igor upgrade that tightens
a check, the process has nothing that passes and refuses to start, naming both commits (decision
17, proposed). A process with no `applied` ref refuses to start on a failing commit: one that has
never applied a commit, or whose checkout or volume was replaced.

`applied` names a commit that may still hold a seat file a later commit deleted. The
configuration in force leaves out every seat the `git log` above lists, at start as after each
fetch, so a removal survives a restart without any record beyond the two refs and the history
between them.

A process that has never fetched, and whose first fetch fails, sets `fetched` to the commit the
checkout's own remote-tracking ref names, the one the operator last fetched (decision 16,
proposed).

## The seat notice goes out at most once (decision 14, proposed)

Each process applies the newest commit it fetched, and several processes apply most commits, so
without a guard a seat-file change would be announced once per process. The guard is a record on
the state branch at `notices/seats/<seat-id>/<commit-id>.json`, where the commit is the most
recent one that changed the seat file, created only where it is absent. `writeState` cannot
create it: it reads the current `sha` and sends it, so it overwrites. The record takes a
create-only call of its own in `src/state.ts`, a Contents API `PUT` of the path sent without a
`sha`. GitHub documents that a `PUT` updating an existing file needs that file's `sha`, so the
call fails where the record exists; task 5.2 measures it. The process posts only when its own
call created the record. A call that fails for another reason, such as GitHub not answering or a
conflict with another write moving the state branch, creates nothing, and the process tries it
again at each later passing read while it runs.

A crash between creating the record and posting loses that notice. The alternative, posting
first and recording afterwards, sends two notices whenever two processes apply the commit within
the same few seconds, which servers on one poll interval regularly do. Where a pull request
brought the change, the seat-notice workflow has already mentioned the owner on it before the
merge, so the lost notice is the owner's second. For a commit pushed without a pull request it is
the owner's only one; that takes a crash in the second between two calls, and costs less than a
duplicate on every busy merge.

Keying the record by the commit that last changed the file means that a later commit leaving the
seat file unchanged posts nothing, and a file changed back to an earlier content, which may
restore a token the lender had replaced, is announced again. The notice mentions the owner the file
named in that commit's first parent and, where the commit the process applied before names
another owner, that owner too. A change superseded before any process applied it is not
announced on its own: the next change to the file is, and since the superseded change may have
edited `owner`, mentioning both owners means the lender whose token the process last held is
always told. If the state branch is deleted, which `work-discovery` allows since state is a
cache, a process applying a change late, after another process announced it, would announce it
again.

## Why no TLA+ model here (decision 19, proposed)

The repository owner's rule asks for a TLA+ model beside the spec where a change is about
concurrency, crashes between writes, or state that several processes share. This change has
three such places:

- **Which commit each rank applies.** The question is whether #179's rules still keep two workers
  off one item while ranks run on different commits. Those rules and their invariants live in
  #179's model, so a model here would copy #179's heartbeat and claim logic. The gap exists in
  #179 already: a person restarting ranks one at a time after a lore change gives the ranks
  different rosters and poll intervals for a while. The proposal recommends that #179's model
  give each process its own view of the roster and the poll interval.
- **The two refs across a crash.** Each process writes only its own two refs. A crash after
  moving `fetched` and before reading leaves `fetched` ahead of `applied`, which is the state a
  restart already starts from. A crash after a passing read and before moving `applied` reruns
  that read. A seat removal is derived from the refs and the history between them, so no crash
  can lose it. No other process writes either ref, so there is no interleaving to check.
- **The notice record.** Its guarantee, at most one notice per change, and exactly one where no
  process crashes between its two calls, follows directly from a create that fails where the
  record exists. A model would restate that single step.

## Measurements

- That fetches into distinct per-process refs, and checkouts of distinct worktrees of one
  repository, run concurrently from several processes without lock failures, and how long one
  fetch of the lore repository takes, which says how often a fetch would be killed when the
  next one is due (task 1.5).
- That `docker compose kill -s HUP <service>` reaches `igor serve` under the shipped compose
  file, where `igor` is the container's main process, and that the process keeps running (task
  1.6).
- That a Contents API `PUT` without `sha` fails on an existing file (task 5.2).
