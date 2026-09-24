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

## `init-workflow` stays a command

`init` writes the workflow, so folding `init-workflow` into it would leave one way to do it.
Rejected: every repository set up before `init` exists still needs that one file, and a repository
whose workflow was deleted or superseded needs it again. Re-running `init` for it is
harmless — it skips what is there and writes what is not — but only because of the
skip-and-continue rule below, and a command that exists is a smaller promise than a refusal
shape holding it up.

The direction matters too: `init` calls the workflow writer, not the reverse. One code path
writes `.github/workflows/reconcile-on-merge.yml` and it is the one that already exists,
with its own output about racing jobs and the bypass list.

## Skip and continue, rather than refuse the whole run

`init-workflow` refuses outright when its one target exists. With four targets the same shape
would mean a repository that has a config and nothing else can never be initialized without
`--force`, and `--force` over four files to get three is how a hand-edited config gets
overwritten.

So each target is decided separately: write it if absent, name it if present, and succeed
either way. The failure this avoids is the common one — a second run after adding a role — and
the case it gives up, a run that quietly does nothing because everything was already there, is
covered by naming every skip.

`--force` keeps `init-workflow`'s meaning: overwrite rather than skip. It is all-or-nothing
across the four files, because a per-file force is a flag nobody can hold in their head.

## Not a design decision: the `commands` list

The default action space and its exclusions are in the requirement, not here. What a worker
may execute with a seat's credential is the thing being agreed to, not an implementation
detail of agreeing to it — and a reader looking for what their Igor may run should find it in
the spec rather than in a design note beside it.
