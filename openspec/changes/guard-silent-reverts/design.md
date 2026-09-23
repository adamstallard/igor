## Context

A resolution is published by `resolve` as a commit with two parents — the artifact's head and
the base it takes in — and its tree is the artifact head's tree with the resolution's files laid
over it and its deletions removed from it. That is why a path the resolution never mentions is
not neutral: the merge result keeps the artifact's copy, and the base's change to that path is
gone.

The paths a resolution mentions come from `git status --porcelain` in the tree after the worker
has run, which reports what differs from the artifact's head. A path the base changed and the
worker resolved to the artifact's own content differs from nothing and appears in no record.
**The revert is invisible in the same input the resolution is built from**, which is why no
amount of care in reading that output finds it.

Both of the proven instances are that shape reached two ways: one through a deletion that was
dropped, one through a status code (`MD`) that matched no branch and threw on read. A third of
the same class — a rename's second porcelain record parsed as a status line, leaving the old
path in the tree and publishing the file twice — was fixed inside the original feature commit's
own bug-hunter iterations. Three reachings of one shape is the argument for guarding the shape.

## Decisions

### The signal for "explicitly accounted for" is nothing the worker can send

This is the open question of the change, and the recommendation is the strictest of the three
candidates: **every revert hands off, and a person decides.** There is no field, no phrase and no
sentinel file that lets a worker publish one.

The constraint that decides it is already settled here. What changed is read from the tree,
never from what the worker said it did, precisely so that a worker reporting a change it did not
make cannot mislead the artifact. A declaration that unlocks a publish is exactly that: the
worker's account of its own intent, taken as authority over what may be committed. The guard
exists because the tree disagreed with the intent; asking the intent is asking the side that was
wrong.

The second argument is the injection surface. A worker reads untrusted text — the item, the
diff, the conflicting content itself. A declaration channel is a channel that text can reach,
and silently undoing a change on the base is close to the most valuable thing an injection could
ask for, because it is the one outcome review is structurally blind to. Everything ingested is
data and never instruction; a field that authorizes a publish would make an exception of the one
case where it matters most.

The cost is bounded rather than recurring. An item handed back is not re-worked until something
answers, so a refused resolution produces one handoff and then goes quiet — not a worker run per
cycle at the same artifact.

### Roads not taken on that question

**The worker names the reverted paths in its resolution request.** The natural-language version.
It fails on the rule above, and it fails a second time on reliability: a path named in prose has
to be matched against a path in the tree, and the failure mode of that match is a revert
published because the worker spelled the path slightly differently — a guard that is weakest
exactly where the content is most confusing to the model.

**An explicit per-path field.** The structured version — a sentinel file in the tree, or a field
on the resolution the loop reads and strips. It is precise where prose is not, and it is the
same authority handed to the same party, now in a form that parses cleanly. It also asks every
future caller of `resolve` to carry a field whose only purpose is to switch off a safety check,
which is the shape of thing that ends up defaulted on.

**Preferring the base's version automatically where a revert is detected.** Tempting, because
the information is in hand and no human is needed. It decides correctness, which this change
explicitly declines to do: the base's version may be exactly what the artifact's work replaced,
and overwriting it is the same class of silent wrong in the other direction.

**Asking a person before resolving rather than before publishing.** Consent to attempt is not
verification of the result. The same silent revert lands, with somebody having agreed to it.

### The comparison is exact restoration, not divergence

A path counts as reverted where the published content is what stood at the merge base while the
base holds something else — including presence against a deletion, and absence against an
addition. Content that matches neither is a resolution, and it is published.

Two consequences, both accepted. A worker that erodes a base change partially is not caught: the
guard has no way to distinguish that from a legitimate combination, and a guard that guessed
would fire on ordinary resolutions and be switched off. And a base change the artifact head
already happened to contain is not a revert at all, which falls out of comparing content rather
than comparing which paths were touched.

### The guard sits at the seam where the merge happened

`resolve` receives `{repo, branch, parents, files, deletions, message}` and nothing about what
the base changed. Putting the check in the adapter means widening that interface to carry the
merge base and the base's diff to every code host that will ever exist, so that one host can
recompute something the caller already knew.

The tree is where the data is. The merge unshallows the clone and already reports the artifact's
head and the commit brought in, which is everything a merge-base-relative diff of the base
needs. So the check belongs between the merge and the publish, on the same side of the seam as
the conflict-marker check it stands beside.

Merging is optional on a working tree — a provider that cannot offer it hands off rather than
guessing at a resolution. The guard inherits that fallback rather than needing one: where there
was no local merge there is no resolution to publish.

### Refusing is not publishing, on every path out

The refusal is a decision about the commit, so it precedes it unconditionally. In particular it
is not the post-publish re-ask in another guise: that asks the host whether the branch merges,
and a revert merges perfectly cleanly. It also runs where the re-ask does not — a claim lost
mid-execution publishes the resolution and returns before asking anything.

## Open

**What a person does with the handoff.** Today the answer is that they resolve the branch
themselves; the Igor has no way to be told "that revert was intended" and no memory that would
carry the answer to the next cycle. A lore entry scoped to the artifact is the shape that could,
and this change does not propose it — it would be the escape hatch again, one layer out, and it
should be argued on its own.
