## Context

Detaching the worker is two lines. What it costs is signal semantics for the whole tree, and
that is what this records.

## What the probe measured

A stub worker spawns a grandchild that writes `started` at once and `late` after 1.2 seconds,
then goes silent with a tool outstanding. The watchdog kills it at 0.5 seconds; the markers are
read 2 seconds later. `started` is asserted as well as `late`, because a test that only checks
for the absent marker passes just as well when the grandchild never ran.

- **Before:** `started` present, `late` present. The grandchild outlived the kill on both the
  watchdog path and the stop path, reproducing what issue #14 observed.
- **After:** `started` present, `late` absent, on both paths.

Two further shapes were driven as real processes and signalled, rather than reasoned about:

- **One-shot, no graceful shutdown.** SIGINT to Igor; the grandchild's 1.5-second marker never
  appears. Termination reached the group.
- **Winds down gracefully.** SIGINT to Igor; the grandchild's 1.5-second marker *does* appear,
  its 4-second marker does not, and the process exits in between. The item in hand kept
  running through the signal, and nothing outlived the process.

## Where forwarding lives

In the module that spawns, installed on the first spawn. Detaching creates the obligation and
the thing that detaches discharges it — put the handler in the command instead and the next
command that spawns a worker reopens the orphan silently, which is how `igor serve` came to run
with no lore at all.

Handlers are installed on the first spawn rather than on import: installing one suppresses
Node's default, and an importer that never spawns a worker did not ask for that.

The graceful path opts out rather than being detected. `untilSignalled` — the one function that
exists because Igor handles signals gracefully — declares it, so the signal handler stands down
and the exit hook does the work. Sniffing `process.listenerCount` would have coupled this to
whatever unrelated library happened to register a handler.

The exit hook is the net under both. A pid is removed from the live set when its process closes
or errors, because a pid left there is a pid the operating system may hand to something else,
and the next group kill would reach that instead.

## What detaching does not change

**The unit needs nothing.** `detached: true` changes process group and session, not control
group: the worker stays inside `igor@%i.service`, so the default `KillMode=control-group` still
sends it `KillSignal=SIGTERM` and `TimeoutStopSec=900` still SIGKILLs everything left. Under
systemd the tree was already contained, and still is. Reasoned from systemd's cgroup semantics;
the probes above ran on macOS, where there is no such containment and the fix is what provides
it.

`PrivateTmp=true` points the same way: the detached child inherits the mount namespace, so
trees under the private `/tmp` are the unit's and die with it. Neither is a reason to change
the fix, and neither substitutes for it on a laptop.

**A second impatient Ctrl-C no longer reaches the worker.** `untilSignalled` already ignores
repeat signals, so this follows from winding down gracefully rather than from detaching.

## What the implementation contradicted

`docs/deployment.md` says a worker may legitimately run for hours after Igor is signalled, and
that `TimeoutStopSec` should be raised where a long item matters. Under systemd that was
already untrue before this change: the default `KillMode=control-group` sends SIGTERM to every
process in the unit's cgroup, the worker included, at the first step of shutdown. What the
paragraph describes is now true interactively — a detached worker survives the Ctrl-C that used
to kill it through the foreground group — and remains untrue under the unit the same paragraph
is about. Left as found: correcting it is a doc question about what systemd should be
configured to do, not about this fix.
