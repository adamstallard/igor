## Context

The worker is not short of the skill to rebase a branch. It never gets the chance: it edits
files in a disposable clone, the loop publishes what changed through the code host's API, and
the tree is released in a `finally`. There is no local branch and no remote. Keeping an
artifact current is therefore a loop action, and this adds the one the loop lacks.

## Decisions

### Narrow the in-flight rule rather than carve an exception into it

The rule says work in flight is skipped because *duplicating work in review is never an
organizational preference*. An artifact of one's own that cannot merge is not duplication — it
is the same work, unfinished. So the requirement's sentence changes and its reason does not,
which is the difference between narrowing a rule and punching a hole in it.

The rule stays non-configurable. An org that could switch this off would get an Igor whose
pull requests quietly rot.

### Ask the code host to merge, rather than merging locally

`POST /repos/{owner}/{repo}/merges` performs the merge server-side and reports a conflict
instead of producing one. So finding out whether a reported conflict is still real costs one
request, no clone, no worker, no tokens — and a `CONFLICTING` that has cleared since it was
read comes back merged rather than escalating.

The other half of that observation decides the trigger. Most staleness is incidental: `main`
moved eight times under PR #21 and only the last one conflicted. Seven of those moves wanted
nothing done to them, which is why the Igor acts on the conflict rather than on the move.

### Resolve on the branch; do not regenerate

Re-running the worker against the new base is cheaper to build and produces a correct artifact.
It also throws away the review conversation, and the reviewer is the one who paid for that.

The asymmetry decides it: regeneration is cheaper for the Igor and more expensive for the
person, and the whole point of publishing a draft rather than a merge is that the person's
attention is the scarce thing.

### The worker is handed a conflict, not git

What escalates is files with conflict markers in a working tree — the shape the worker already
handles. It is not given push access, a remote, or a branch to manage. The action space that
bounds a steered worker is unchanged, which would not be true of a worker driving git.

## Roads not taken

**Rebasing instead of merging.** Rewrites published history a reviewer may have commented
against, and turns one conflict into one per commit.

**Regenerating the artifact.** See above. Cheaper for us, paid for by someone else.

**Letting the worker manage the branch.** It would work, and it would put credentials and
push access inside the one component that reads untrusted text. The loop publishes precisely so
that it does not.

**Acting on a conflicting artifact somebody else opened.** Theirs. The holder rule already says
so, and this change does not want an exception to that one as well.

**Gating on staleness rather than on conflict.** Asking the host to merge the base into every
own artifact every cycle, rather than only the ones that conflict, puts a merge commit, a CI
run and a notification on a branch whose only problem was being slightly behind. This change
already refuses to regenerate an artifact because the person's attention is the scarce thing,
and refuses to rebase because that rewrites published history a reviewer may have commented
against; both arguments cut the same way here. It is also self-perpetuating where the conflict
path is self-limiting — a conflict is resolved or handed off and then goes quiet, while a
branch merely behind has no terminating event and costs a request per open artifact per cycle
indefinitely. What would reopen it: a repository that turns on *"Require branches to be up to
date before merging"*, where a clean-but-behind branch genuinely cannot merge while GitHub
still reports `mergeable: MERGEABLE`. The field that reveals that is `mergeStateStatus ===
'BEHIND'`, not `mergeable`.

## Open

**What the claim protocol should say about a published artifact.** The claim is released at
publication, but the work is not finished until the artifact merges or somebody closes it. This
change stops an Igor being silent about its own stale work without settling whether it still
holds anything — which is the question `concurrent-instances` would have to answer too, since
an artifact outlives the process that made it.
