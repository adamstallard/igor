## Context

The rules of this change are in its proposal and spec deltas. This file holds the readings
chosen where the spec's wording allowed two, each with its reason. No person chose them; the
pull request lists each one for the reviewer to confirm or overturn.

## Decisions

1. **A refused `repos` entry refuses every role because `repos` is part of the org base**
   (*A refused repos entry refuses every role*). The rule is the one the pushed text stated
   without a reason; the reason given is the in-force *A role file refuses a key nobody reads*, under which a fault in the org base
   refuses every role inheriting it, so that no role quietly loses what the org base meant to
   set. The rule has its own requirement and a scenario of a role on another repository.
2. **At most two rounds of checks run per execution of an item, across both worker runs**
   (*Each round of checks has a time limit*). "A run makes one round, or two" could be read as
   two rounds per worker run. `task-execution` says an execution row "holds both worker runs and
   both rounds where there are two", and *A failed check goes back to the worker once* never
   starts a third run, so the count is per execution, which the requirement says in those words.
3. **Where #175's wrapper cannot report a missing program apart from the program's own exit
   code, the check is recorded as failed with the exit code the wrapper gave** (*Under igor
   serve a check starts through the worker-user wrapper*). The proposal's *Still open* item on
   the wrapper and task 0.6 already said so; the requirement stated only the other case.

## Open Questions

Each entry is a finding of the consistency read of this text that the text does not settle.
The proposal's *Still open* holds the earlier ones.

- **The abandoned-tree threshold.** The in-force threshold, which #242 restates, is the
  absolute ceiling, the longest a worker may run, plus the provisioning and publication either side of one worker. An
  execution that runs the checks can hold its tree through two worker runs and two rounds of
  up to `check_minutes` each, so the sweep could remove a tree still in use. Either the
  threshold counts both runs and both rounds, or this change bounds the whole execution.
- **A termination under `igor serve`.** The in-force *Igor forwards the termination it is sent*
  and #242 leave the worker in hand running when the process winds down gracefully, but *A stop or
  termination during the checks kills the running check* kills a running check on that same
  termination, so an item's checks die where its worker would have been spared.
- **Worker slots under #242.** #242 runs a role's workers in numbered slots, each with a Unix
  user of its own, and gives each running worker a seat, a model subscription account, of its
  own. The checks run as "the worker user", though a kill by worker user reaches only one
  slot's processes. Nothing holds the slot's seat through the checks and the second run, so
  #242 may give it to another worker before the second run starts.
- **#175's wrapper, against decision 3.** #175's task defines `runAsWorker`, which returns
  `not-found` wherever `env` exits 127. Under it, a program that itself exits 127 would read as
  not found, and decision 3's case, a missing program execution cannot tell apart, would never
  arise.
- **A refused `sudo` before a check.** #175 fails the run when the worker user's `sudo` is
  refused before a check; here it is one failed check, and a second run follows.
- **A limit kill of the second run.** The in-force scenario under *A limit does not destroy what
  the worker already produced* publishes nothing after a limit kill; this change publishes the
  first run's work then. It also cites that requirement for the other four cases in which it
  publishes the first run's work (the gate refusing the second run, the second run exiting with
  an error, a refusal of its changes, and #153 refusing to commit them), which the requirement
  does not cover.
- **Per-run refusals applied to the second run.** #120, #137 and #125 publish nothing for a run
  their refusals catch or that changed nothing; this change publishes the first run's work in
  those cases, and the proposal's decision 17 lists the refusals without theirs.
- **#153 and the second run.** #153 publishes nothing after two failed signing attempts, where
  this change publishes the first run's work; #153's offer of work after a lost claim assumes
  nothing is signed yet, where the first commit here is signed; and under #153 a role listing
  `prose` publishes no worker summary, where the proposal's decision 23 publishes the last run's.
- **A draft under `pr` alone and #216.** #216's text of *Only reversible artifacts are
  produced* closes the exceptions to `allow` at two, citations and question-branch files, and a draft for a role allowing only `pr`
  is not one.
- **Gate one's and gate two's boundaries under #150.** Under #150, an item whose gate-one drop
  leaves nothing under `openspec/changes/**` is handed off with nothing published, but this
  change still runs a round on it. #150's gate one keeps everything under
  `openspec/changes/**`, where this change keeps only the specification change and restores the
  rest to the base. At gate two #150 publishes nothing where only specification edits remain,
  a case this change's test for a tree equal to the pull request's head misses.
- **A fix folded into a merge.** Without #153, a check fix joins the merge commit. #150 counts a
  review as current while only merges of the base land, so an approval would stay current
  over a fix nobody reviewed.
- **A push made when Igor acts on the option a person chose from those it offered (#140)** is not
  among the later pushes that run the checks.
- **The budget gate and #143.** The second run passes the budget gate as any run does, so the
  gate can refuse it, while #143 never stops an item already running on its seat. #143's
  accepted overshoot also counts each item as one run, not two.
- **The execution row and its logs.** #216 names the ledger `executions/<yyyy-mm-dd>.ndjson`,
  and #188 gives each run's action log its own path and three labels; where the second run's
  transcript and log entries go, and how they are labelled, is defined nowhere.
- **What a check inherits.** Under `igor run` a check can inherit `IGOR_RUN_TOKEN` (#174, #171);
  a check runs with the worker's home before #174 copies the session log out, so it can read a
  token the worker printed there; and #217 registers no secret shorter than 8 characters, so a
  short proxy password is not redacted from check output.
- **The proxy rule stated twice.** The rule that a check keeps the worker's proxy variables, and
  its scenario, are also in #175.
- **Wording carried by task only.** The comment heading and the CI-only wording live in tasks
  3.3 and 3.2, which the archived requirements point at; the prompt block a second run gets has
  no verbatim wording; and task 0.4 gives wording for the comment only, where the spec also
  changes the body's Tests row.
