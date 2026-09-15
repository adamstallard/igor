## 1. A kill reaches the process group

- [x] 1.1 The worker is spawned into its own process group
- [x] 1.2 The watchdog kills the group
- [x] 1.3 The stop path kills the group
- [x] 1.4 A group that is already gone does not make cleanup throw

## 2. Igor forwards the termination it is sent

- [x] 2.1 SIGINT and SIGTERM kill the worker's group where nothing else winds the process down
- [x] 2.2 `untilSignalled` declares that it winds down, so the item in hand keeps running
- [x] 2.3 An exit hook kills whatever is still live, so no worker outlives the process
- [x] 2.4 A worker is forgotten when it closes or errors, so no recycled pid is ever signalled

## 3. Prove it rather than reason about it

- [x] 3.1 A probe spawning a grandchild that writes after a delay, on the watchdog path
- [x] 3.2 The same on the stop path
- [x] 3.3 Both assert the subprocess was running when the kill landed
- [x] 3.4 Signal forwarding driven as a real process under both shapes, recorded in `design.md`
- [x] 3.5 What the systemd unit needs, concluded and recorded
