## 1. Bound the worker by silence

- [x] 1.1 A watchdog that kills on whichever limit comes first, with the deadlines injectable
- [x] 1.2 Every parsed event resets the window; stderr and unparsable lines do not
- [x] 1.3 Outstanding tool calls are tracked by id off the stream's content blocks
- [x] 1.4 A resumed top-level turn clears the set; a subagent's own events do not
- [x] 1.5 A longer window while a tool is outstanding, a shorter one otherwise, each justified
- [x] 1.6 The ceiling is chosen to be unreachable in normal operation, and says why

## 2. Say which limit ended the run

- [x] 2.1 Distinct failures for a running tool, a silent model and a run that never ended
- [x] 2.2 The watchdog fires once, so a run killed at one limit is not also reported at another

## 3. Re-derive what depended on the old cap

- [x] 3.1 The sweep threshold derives from the ceiling, with an additive margin for clone and push
- [x] 3.2 `docs/architecture.md` states the new derivation
- [x] 3.3 `docs/deployment.md` states what the shutdown grace period now does and does not cover

## 4. Keep what the run produced

- [x] 4.1 A kill after the result event settles with that result rather than as a failure
- [x] 4.2 The failure path reads the working tree, so a killed worker's changes are recorded

## 5. Tests

- [x] 5.1 A steadily-emitting worker survives well past the window
- [x] 5.2 A silent model is killed, and the failure names silence
- [x] 5.3 A dispatched tool earns the longer window, and its expiry names the tool
- [x] 5.4 A result arriving while a sibling tool runs does not shorten the window
- [x] 5.5 A worker emitting inside its window but past the ceiling is killed, and names length
- [x] 5.6 The real spawn path is exercised against a stub binary, so the wiring from event to
      window is covered
- [x] 5.7 A finished run whose process lingers keeps its result and cost
- [x] 5.8 A killed worker's recorded outcome names what it changed
- [x] 5.9 A subagent narrating does not drop the tools of the turn that spawned it
- [x] 5.10 Block order within one event does not change the outcome
- [x] 5.11 The sweep threshold clears the ceiling

## 6. Work that outlives the change

- [x] 6.1 A kill does not reach the worker's tool subprocesses — issue #14
- [x] 6.2 A killed run still records no cost, over a far longer window — issue #11
