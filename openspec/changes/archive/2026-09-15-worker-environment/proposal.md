## Why

Three faults in one place — how the worker is spawned — and two of them only look harmless
because the third is in the way.

**The worker cannot run anything, so it cannot check its own work.** `headlessClaude` passes
`--permission-mode acceptEdits`, which grants edits and leaves everything else to a prompt
nobody is there to answer. Measured against `claude` 2.1.272: `echo`, `touch` and
`node --version` still run, because the CLI classifies them as safe, but `node -e '…'` and
`npm install` are denied. That is exactly the boundary that matters. The worker on the run that
produced pull request #5 said so itself:

> this sandbox blocks `npm install`, `npx`, and even direct `node script.js` execution (all
> require approval that isn't available here), so the test suite and `tsc --noEmit` never
> actually ran. I hand-traced `provenanceFromCitations` against all six test cases…

**The worker inherits every credential the Igor holds.** The spawn passes no `env`, so the
child gets `GH_TOKEN` and every seat token on the machine. Nothing can read them today only
because the denial above blocks the shell. Grant commands without fixing this and one `env` in
an injected issue body reads the lot, with the network available to send it. The two land
together or neither does.

**The seat that is chosen is not the seat that pays.** `readUsage` sets
`CLAUDE_CODE_OAUTH_TOKEN` from the seat's `token_env` when reading usage; the spawn sets
nothing, so the worker authenticates with whatever login is ambient. `chooseSeat` picks a seat
and `recordExecution` bills it while a different one is drawn down. It coincides today only
because one seat is declared. `seat-budget` already requires otherwise — "A role referencing a
pool SHALL spend from the first seat in that list with headroom remaining" — so this is an
in-force requirement that was never implemented, and needs no delta.

## What Changes

**The worker is spawned with an environment that is written out rather than inherited.** It
holds the search path, a home directory, the host's network settings, and one credential: the
token of the seat this work is charged to. Nothing else. The worker has no use for anything
else — it edits files in a disposable tree, and claiming, commenting, branching and publishing
all happen afterwards in the loop, with the loop's credentials.

**The chosen seat's token reaches the spawn.** The budget gate already resolves a seat; it now
carries that seat's `token_env` alongside its id, and execution reads the variable at the one
point where the child's environment is built. The name travels, never the value, so the
credential exists in the parent's environment and the child's and in no object between them.

**A role declares the commands its worker may run**, in a new `commands` field passed as
`--allowed-tools`. It merges monotonically, like `allow`: a role may narrow what it inherits
and is rejected if it widens it, for the same reason and with the same message. A role
declaring none leaves the worker where it is today.

The list comes from the role, which lives in the org's lore repository. It is deliberately not
read from the worked repository's own `.claude/settings.json`, tempting as that is: a worker
that can edit files can edit that file, and self-widening permissions is the one thing the
action space exists to prevent.

## Capabilities

### Modified Capabilities

- `role-config`: a role declares `commands`, merged monotonically.
- `task-execution`: the worker is given an explicit environment carrying no credential but its
  seat's.

## Impact

- An Igor can run its role's tests, so a transcript claiming the change works can mean it.
- A prompt-injected worker reaches no credential, which was previously true by accident.
- Spend lands on the seat the gate chose, which makes `budget_share` and every pool ordering
  mean what configuration says.
- An org running with no seats declared keeps working: with no seat naming a token, the
  ambient one is forwarded, as `readUsage` already does on the reading side.
