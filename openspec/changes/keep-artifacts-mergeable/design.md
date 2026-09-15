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
instead of producing one. So the ordinary case — a base that moved without touching the same
lines — costs one request, no clone, no worker, no tokens.

That matters more than it sounds. Most staleness is incidental: `main` moved eight times under
PR #21 and only the last one conflicted. A design that spent a worker run on each of those
would cost more than the work it protects.

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

## Open

**What the claim protocol should say about a published artifact.** The claim is released at
publication, but the work is not finished until the artifact merges or somebody closes it. This
change stops an Igor being silent about its own stale work without settling whether it still
holds anything — which is the question `concurrent-instances` would have to answer too, since
an artifact outlives the process that made it.
