# Design

The requirements say what `init` writes and what it leaves alone. Three things about *how* had
more than one defensible answer, and the rejected ones are worth having in writing.

## Shipping `git rm:*` before a removal can be published

A worker with `git rm:*` can delete a file. The publishing path used to drop the deletion: the
worker did the work, the seat was spent, the artifact arrived without the removal, and nothing
in it said a file was meant to go. [#88](https://github.com/adamstallard/igor/pull/88) is the
change that makes a removal survive, and it has merged and archived — so the condition below is
met and the two entries ship live. The fork is recorded because the requirement is written to
outlive it.

Three answers:

- **Ship the two entries active anyway.** Rejected. The failure is silent and it costs money to
  reach. An operator who follows the setup exactly gets an Igor that appears to be able to
  delete a file, and finds out from a diff that is missing one.
- **Block this change on #88.** Rejected as a dependency, not as an outcome. The rest of `init`
  — the config at the root, the org role, the workflow, the refusals — is useful now and has
  nothing to do with removals. Making the whole command wait on an unrelated pull request buys
  one accurate default at the cost of everything else.
- **Ship them commented, with a note naming what unlocks them.** Taken, and already discharged:
  #88 landed before this was implemented, so the condition in the requirement is satisfied and
  the two entries ship live. The requirement is written against the condition rather than against
  the pull request number, which is why it needed no amendment when #88 merged — and why it stays
  correct if a future change ever makes a removal stop surviving again.

The requirement states the condition ("where a removal a worker makes does not yet survive into
the published artifact") rather than the pull request, because a spec that names an open PR
goes stale the day it merges.

## `init-workflow` is folded into `init`

`init` writes the workflow, so keeping `init-workflow` would leave two ways to write one file.
It is retired, and `init --only <target…>` replaces it — the same shape `promote --only` already
has in this CLI.

Three reasons to keep it were considered, and all three fail:

- **Repositories set up before `init` existed still need that one file.** Void. `init` ships
  before Igor is installable from anywhere but a clone, so by the time anyone can set up a
  store, `init` exists. Exactly one store predates it — this repository's author's — and it is
  served by the next point.
- **A workflow deleted or superseded needs writing again.** Discharged by skip-and-continue:
  re-running `init` where the config and org role are present but the workflow is not writes the
  workflow and leaves the rest alone, which is a scenario in this delta. `--only` narrows that
  to a single target for an operator who wants to be certain.
- **`--config` can target a store you are not standing in, and `init` cannot.** True in
  mechanism, empty in motivation. Writing the workflow copies a file into
  `<destination>/.github/workflows/`, so the destination is already a checkout on disk, and
  `cd` into it reaches the same config by upward search — the two are interchangeable by
  construction. They diverge only for a config living outside its destination, which the README
  argues against: a config not committed alongside the store drifts between whoever runs the
  tool until an entry scores differently depending on whose machine computed it.

**And the thing being re-run happens once per team.** The workflow goes in the lore store, not
in each repository an Igor watches — those are read through the tracker's API and have nothing
installed in them. A dedicated top-level command for a file written once per store is a command
nobody needs twice.

The direction still matters: one code path writes `.github/workflows/reconcile-on-merge.yml`,
and after this change `init` owns it outright.

## Skip and continue, rather than refuse the whole run

`init-workflow` refuses outright when its one target exists. With four targets that shape
would mean a repository that has a config and nothing else can never be initialized without
`--force`, and `--force` over four files to get three is how a hand-edited config gets
overwritten.

So each target is decided separately: write it if absent, name it if present, and succeed
either way. The failure this avoids is the common one — a second run after adding a role — and
the case it gives up, a run that quietly does nothing because everything was already there, is
covered by naming every skip.

`--force` keeps the meaning `init-workflow` gave it: overwrite rather than skip. It is
all-or-nothing across the targets the run is writing — all four by default, or the ones `--only`
named — because a per-file force is a flag nobody can hold in their head.

## Not a design decision: the `commands` list

The default action space and its exclusions are in the requirement, not here. What a worker
may execute with a seat's credential is the thing being agreed to, not an implementation
detail of agreeing to it — and a reader looking for what their Igor may run should find it in
the spec rather than in a design note beside it.
