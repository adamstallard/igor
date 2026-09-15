## Why

`child.kill('SIGKILL')` signals one pid. The worker's tool subprocesses are not that pid, so
they survive every kill: a build, a test run or a script still writing to a working tree the
Igor is about to release and sweep. Observed before this change, and again while writing it — a
grandchild spawned by a stub worker wrote its marker 1.2 seconds after the watchdog killed its
parent.

The tool-silence window makes it systematic rather than incidental. That window exists
*because* a tool subprocess may legitimately run long, so a kill on it lands by construction
while one is running. Under a long-lived `igor serve` the survivors accumulate.

## What Changes

**The worker runs in its own process group, and a kill reaches the group.** Both kill sites —
the watchdog and the stop path — signal the group, so what the worker spawned dies with it. A
group that has already gone is not an error: a worker that exited on its own must not make
cleanup throw.

**Igor forwards termination it is sent.** A detached worker is outside the terminal's
foreground group, so nothing else signals it, and the obligation falls on the process that
detached it. A one-shot `igor run` takes the worker with it on SIGINT, which is what happens
today. A process that winds down gracefully — `igor serve`, through `untilSignalled` — says so,
keeps the item in hand running, and its worker is caught on the way out instead.

## Non-goals

**A graceful stop of the worker.** The group is signalled SIGKILL, as the single pid was. What
a killed run leaves behind is already the subject of its own requirement.

**Windows.** A negative pid is a POSIX process group; the deployment targets are Linux and
macOS.
