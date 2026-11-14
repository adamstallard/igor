# Design

The requirements say what `init` writes and what it leaves alone. Five things about *how* had
more than one defensible answer, and the rejected ones are worth having in writing.

## Why the shipped `commands` carries `git rm:*` and `git mv:*`

A worker with `git rm:*` can delete a file. The publishing path used to drop the deletion: the
worker did the work, the seat was spent, the artifact arrived without the removal, and nothing
in it said a file was meant to go. [#88](https://github.com/adamstallard/igor/pull/88) made a
removal survive, and everything since has kept it that way: #118 closed the fold that lost one
during a conflicted merge, and the routes by which the tree API refused a whole publish.

**Why the list carries them at all.** Granting a command whose effect is silently dropped spends
a seat on work that never arrives and says nothing. An operator who follows the setup exactly
would get an Igor that appears able to delete a file and finds out from a diff that is missing
one. That is the argument for `git rm:*` and `git mv:*` being in the shipped list rather than
left out, and it is why they are the two entries worth explaining.

**A conditional requirement stood here and has been removed.** It said the two entries SHALL ship
commented where a removal does not survive into the published artifact. It was written while #88
was open, when `init` might genuinely have shipped first, and it was phrased as a condition rather
than against a pull request so it would not go stale the day #88 merged. It did its job: the
condition was wrong twice in one day and the text needed no amendment either time.

It is gone because `task-execution` now owns the property outright — *the artifact carries every
change the worker made, including removals*, *no removal is lost to a read that folds two changed
paths into one*, *no removal is published for a path the base does not hold* — with tests behind
them. A regression violates those, in the capability where the behaviour lives. The clause here
was a second statement of the same property, in a different capability, phrased as a contingency
nobody would execute: if removals broke, the answer is to fix them, not to ship a release whose
scaffolding withholds `git rm`.

## `init-workflow` is folded into `init`

`init` writes the workflow, so keeping `init-workflow` would leave two ways to write one file.
It is retired, and `init --force workflow` replaces it — naming the one target to overwrite.

Three reasons to keep it were considered, and all three fail:

- **Repositories set up before `init` existed still need that one file.** Void. `init` ships
  before Igor is installable from anywhere but a clone, so by the time anyone can set up a
  store, `init` exists. Exactly one store predates it — this repository's author's — and it is
  served by the next point.
- **A workflow deleted or superseded needs writing again.** Discharged by skip-and-continue:
  re-running `init` where the config and org role are present but the workflow is not writes the
  workflow and leaves the rest alone, which is a scenario in this delta.
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

## `--force` takes its targets, and there is no unforced way to name one

Skip-and-continue covers a target that is *absent*. It cannot cover one that is **stale**, and the
workflow is the only target that can go stale: it is the one file of the four that Igor owns rather
than the operator. The configuration holds reviewers, experts and seats; the org role holds the
action space; the role stub is a starting point. Igor writes those once and has no further opinion.
The workflow is a shipped artifact in `templates/`, taken wholesale, and it changes when Igor
changes — `promote-on-merge.yml` became `reconcile-on-merge.yml`, and the job it runs went from
`promote` to `reconcile`.

So *replace the workflow from the current template, leave my files alone* recurs for the life of a
store, and it is the only thing a flag is needed for.

**Two flags were considered and collapsed into one.** An earlier draft had `--only <target…>` to
narrow and `--force` to overwrite. That pairing has a combination that cannot be right: for an
absent target the plain run already writes it and names what it skipped, so `--only` without
`--force` either does nothing or duplicates the plain run. Making `--only` imply overwriting was
rejected — *only* reads as narrowing, narrowing flags do not destroy things, and someone typing it
to make sure they had a configuration would silently lose their reviewers, experts and seats.

So the scoping moved onto the destructive word: `--force <target…>`, which overwrites exactly what
it names and touches nothing else. **Bare `--force` is refused rather than meaning all four.**
Replacing the configuration, the org role, the role stub and the workflow together is starting
over, which is a deletion followed by a plain run; a flag that does it by omission is a flag that
does it by accident, and the file it destroys is the one holding values nobody can regenerate.

**The case with no other answer** is a template whose *content* changes under the same filename.
Skip-and-continue passes over it as present, so nothing reports it and nothing replaces it, and the
store keeps running a superseded job indefinitely. Detecting that a workflow differs from the
shipped template belongs with [#110](https://github.com/adamstallard/igor/issues/110); writing the
replacement once detected is `--force workflow`.

## Skip and continue, rather than refuse the whole run

`init-workflow` refuses outright when its one target exists. With four targets that shape
would mean a repository that has a config and nothing else can never be initialized without
`--force`, and forcing four files to get three is how a hand-edited config gets overwritten.

So each target is decided separately: write it if absent, name it if present, and succeed
either way. The failure this avoids is the common one — a second run after adding a role — and
the case it gives up, a run that quietly does nothing because everything was already there, is
covered by naming every skip.

`--force` keeps the meaning `init-workflow` gave it — overwrite rather than skip — but not its
scope: it applies to the targets it names and to nothing else. The earlier note here said a
per-file force is a flag nobody can hold in their head. That was inherited from a command with one
file, where the distinction did not arise; with four it is the all-or-nothing version that nobody
should hold, because it destroys three files to refresh one.

## The template explains the model rather than warning against the absences

`commands` is a list of what a worker may run, and its interesting content is what is missing.
The obvious way to handle that is a warning — *do not add `git commit`, it will break your runs* —
and it is the wrong one.

**Committing is already forbidden three times over.** The standing instructions every worker
receives say it (`src/execute.ts:144`: *"Edit files in the working directory; do not commit, push,
or open"*), `conflictPrompt` repeats it for the resolution path (*"do not run git — the loop
publishes the"*), and the requirement above excludes `git commit:*` by name. A fourth restatement
in the template is the one people stop reading, and a file of prohibitions reads as a list of
things that are nearly allowed.

**One line of model does more.** *Igor reads the working directory and publishes it, so nothing
here needs to stage or commit.* An operator who has read that does not reach for `git add` or
`git commit`, because they can see there is nothing for either to do — a new file is read as
untracked, `git rm` and `git mv` stage themselves, and a change that is committed is a change
`git status` no longer reports, so committing **hides the worker's own work** rather than
finishing it.

That last point is also the honest reason `git commit:*` is excluded, and it is not the one the
requirement gives. The requirement's reason — *a worker that can push routes around every check
the publishing path makes on its behalf* — is exactly right for `git push:*` and is a security
argument. For `git commit:*` alone there is no security question: it is self-defeating. Both
belong, and they are different.

## What the implementation found: the shipped `commands` is a ceiling

`capabilitiesOf` refuses a role whose `commands` is not a verbatim subset of what it inherits, and
the org file is what every role in a store inherits. So the shipped list is not a starting point a
role can add to — it is the most any Igor in that store will ever be able to run.

That decides where a team's own build and test commands go. They cannot go on a role, because a
role listing `npm test:*` that `roles/org.yaml` does not list is refused as widening; they have to
go in the org file. The template therefore carries them **commented, with the reason**, rather
than shipping them live: only the team knows what they are, and `npm test` is whatever their
`package.json` says it is — a file the worker can edit, run with the seat's token in its
environment, which is the same objection that excludes `node:*` and `sh`.

The README's role example lists `npm test:*`, and did so before this change. It is now shown
beneath an org example that lists it too, because the pair is what makes the narrowing rule
legible — and because copying the role alone into an initialized store is a `RoleError`.

## Not a design decision: the `commands` list

The default action space and its exclusions are in the requirement, not here. What a worker
may execute with a seat's credential is the thing being agreed to, not an implementation
detail of agreeing to it — and a reader looking for what their Igor may run should find it in
the spec rather than in a design note beside it.
