## Why

Nothing in force says how long a worker may run or on what signal it is killed, and the code
answers with a fifteen-minute wall clock. That number is a proxy for two different concerns and
serves neither: a productive three-hour run is destroyed, and a wedged one is tolerated for the
full fifteen minutes.

The worker's stream is the evidence that was missing when the cap was written. `headlessClaude`
runs the CLI with `--output-format stream-json --verbose` and the caller sees every event, so
what the worker is doing — and what it is waiting for — can be read rather than guessed at from
elapsed time.

Measured over two real runs: gaps between events run from 0.02s to 2.5s, and each event carries
one content block, so a dispatched `tool_use` and its matching `tool_result` are both visible
and pair by id. Liveness is well supported. Spend is not: `total_cost_usd` appears only on the
terminal `result` event, and per-event `output_tokens` summed to 9 against that event's 429.

## What Changes

**A worker is killed for silence, not for duration.** The window is measured from the last
event off its stream and reset by the next one.

**The window depends on what the worker is waiting for.** A worker blocked on a tool it
dispatched is legitimately quiet for as long as that tool runs — a build, a test suite, a fetch
— and gets a long window. A worker with nothing outstanding but the model's next turn is quiet
only through a retry or a hang, and gets a short one. Which applies is read from the tool calls
the stream shows outstanding, not from the type of the last event, because tools dispatched
together return one at a time.

**An absolute ceiling stays as a backstop.** A worker emitting an event every thirty seconds
forever satisfies every silence window and still never finishes. The ceiling is set far above
any run anyone expects, so it is a last resort rather than a limit met in practice.

**The failure says which limit was breached.** A tool that never returned, a model that never
answered and a run that never ended are three diagnoses for whoever reads the handoff, and one
message for all three tells them nothing.

**The abandoned-tree sweep is re-derived.** Its threshold was a multiple of the wall clock
because that was the cap on how long a tree could be in use. The ceiling is that cap now, and
the sweep sits above it by the clone and push a tree outlives its worker by.

Explicitly out of scope:

- **A mid-run spend ceiling.** The stream does not carry a running total, so a cap enforced
  from it would be enforced against a number that is wrong by a factor of forty-seven. It needs
  cumulative usage per event or an out-of-band spend read; neither exists today.
- **A worker declaring its own next deadline.** It would be guessing at how long its own shell
  command takes, which is the one thing it cannot know and the only thing that matters here.
  The stream reports it as fact instead.
- **Resuming a killed worker.** A kill ends the item and owes a handoff, as it does now.

## Capabilities

### Modified Capabilities

- `task-execution`: a worker is bounded by silence on its stream, by a window that depends on
  whether a tool is outstanding, with an absolute ceiling behind both, and the failure names
  which one ended it.

## Impact

- A long item can finish instead of being cut off at an arbitrary quarter of an hour.
- A hung model is detected in minutes rather than held open for fifteen.
- A twenty-minute test suite is no longer mistaken for a wedged worker.
- The shutdown grace period in `deploy/` no longer covers the longest possible item, so an
  operator who wants shutdown to wait must say so.
