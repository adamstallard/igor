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
own bug-hunter iterations. **That mechanism no longer exists**: #118 reads the tree with
`--no-renames` and deleted the pairing outright, so porcelain emits no record of that shape for
anything to misparse. The instance happened; the code it happened in is gone, and a reader going
looking for it will not find it.

**The class has been probed much harder since this was written, and every probe found another
route.** #118 closed a path the run's own index invented, an intent-to-add path deleted before
commit, an unmerged path whose own side had deleted it, and the base branch moving underneath the
publish — four more ways for the artifact not to match what the worker did. It closed them only
after three route-specific guards had each missed the next case, and only by replacing all three
with one check asking the requirement's own question rather than a proxy for it.

That is this change's own argument, learned again independently and at a cost. Reaching one shape
by that many routes is why the shape is guarded rather than the instance.

## Decisions

### A revert is publishable where the resolution declares the path, structurally

The guard needs a way for a worker to say *"yes, I meant to undo the base's change to this
path"*, because without one every legitimate revert is a refusal. The decision is an **explicit
per-path declaration**, carried as structured data out of the working tree: one entry per path,
each naming the base state it discards.

This change first recommended **no escape at all** — every revert hands off, a person decides.
Adam decided against it after reading that argument, and what moved it is recorded below rather
than quietly dropped, because one of the two reasons given was weaker than it read and the other
is now a cost being accepted rather than one that was refuted.

**The authority argument does not carry.** It ran: what changed is read from the tree, never
from what the worker said it did, so a declaration hands that authority back. But `changes()`
distrusts the worker's *summary of what it edited*, and it can, because the tree already holds
that answer — a summary is a competing account of a fact already in hand, and the stale or wrong
one loses. *"Did you mean to drop the base's change to X?"* is not a fact the tree can contain.
It is different information, not a rival account of the same information, and the rule that
settles the first case says nothing about the second.

**The injection argument does carry, and it is accepted rather than answered.** A worker reads
untrusted text — the item, the diff, the conflicting content itself. Silently undoing a change on
the base is close to the most valuable thing an injection could ask for, because it is the one
outcome review is structurally blind to. An attacker who can make the worker produce the revert
can make it produce the declaration alongside; with no channel the revert is caught, and with one
it is not. **That is a real loss, taken with eyes open.** What the mitigations below do is change
what a successful injection buys: not a silent revert, but a recorded one that names the path and
the base state it discarded, on the commit and in the run record. The attack goes from invisible
to attributable. It does not go away.

### Structured, because prose is what actually failed

Adam's first instinct was the worker naming the reverted paths in prose, and the reason it is a
field instead survives the flip. A path named in a sentence has to be matched against a path in
the tree, and the failure mode of that match is a revert published because the worker spelled the
path slightly differently, or named a directory, or described the file rather than naming it. The
guard would be weakest exactly where the conflicting content is most confusing to the model —
which is where reverts come from in the first place.

A structured entry either names a path that exists in the comparison or it does not, and the
answer is the same on every reading.

### Answering the objection this design inherits

The rejected per-path field was rejected partly on the grounds that *a field whose only purpose
is to switch off a safety check gets defaulted on*. That objection now applies to the chosen
design, and three properties answer it. All three are in the requirement rather than left to the
implementation, because a safety property that lives only in code is the one that gets relaxed.

**It names paths and can never be blanket.** There is no wildcard, no per-resolution flag, and
nothing a role or an org config can set. The only way to permit a revert is to write down the
path being reverted, once, for that resolution. A blanket form is the shape that gets set and
forgotten; a list of paths is a decision that has to be retaken every time, because the next
resolution's paths are different.

**It names what it is overriding, not just where.** A declaration carries the base state it
discards — the base's content for the path, or its absence where the base deleted it — and
authorizes nothing if that is not what the base holds. So a declaration is a statement about one
specific change rather than a standing permission on a filename: the base moving underneath it,
or the same path being reverted for a different reason later, invalidates it rather than
inheriting it. This is also what stops a declaration written early in a run from covering
something that became true after it was written.

**A declared revert is still reported.** It is named on the published resolution and recorded
with the run, in the same place the refusal would have been reported. This is the property that
makes the escape tolerable at all: almost the whole value of the guard is that an undone base
change stops being invisible, and that value survives a declaration. What a declaration buys is
not silence — it is not having to stop.

One further mitigation was considered and rejected: **capping how many paths one resolution may
declare**, or refusing where every flagged path is declared. It would catch the crudest injection
and nothing else, at the price of a number nobody can derive — and a legitimate resolution that
genuinely supersedes a large base change is exactly the case it would break. The recording
property does the same work without a threshold.

### The comparison is exact restoration, not divergence

A path counts as reverted where the published content is what stood at the merge base while the
base holds something else — including presence against a deletion, and absence against an
addition. Content that matches neither is a resolution, and it is published.

Two consequences, both accepted. A worker that erodes a base change partially is not caught: the
guard has no way to distinguish that from a legitimate combination, and a guard that guessed
would fire on ordinary resolutions and be switched off. And a base change the artifact head
already happened to contain is not a revert at all, which falls out of comparing content rather
than comparing which paths were touched.

### The guard, and the declaration, sit at the seam where the merge happened

`resolve` receives `{repo, branch, parents, files, deletions, message}` and nothing about what
the base changed. Putting the check in the adapter means widening that interface to carry the
merge base and the base's diff to every code host that will ever exist, so that one host can
recompute something the caller already knew.

The tree is where the data is. The merge unshallows the clone and already reports the artifact's
head and the commit brought in, which is everything a merge-base-relative diff of the base needs.
So the check belongs between the merge and the publish, on the same side of the seam as the
conflict-marker check it stands beside.

The declaration arrives the same way, as a file the worker writes into the tree and the loop
reads. That keeps the worker's side of the contract to the thing it already does — editing files
— rather than adding an output channel, and it keeps the loop reading one place. The requirement
that it never reaches the published commit follows from where it lives: a file in the tree is
otherwise just another change to publish, and a declaration committed onto the artifact would be
a standing permission that outlives the run that made it.

Merging is optional on a working tree — a provider that cannot offer it hands off rather than
guessing at a resolution. The guard inherits that fallback rather than needing one: where there
was no local merge there is no resolution to publish.

### Refusing is not publishing, on every path out

The refusal is a decision about the commit, so it precedes it unconditionally. In particular it
is not the post-publish re-ask in another guise: that asks the host whether the branch merges,
and a revert merges perfectly cleanly. It also runs where the re-ask does not — a claim lost
mid-execution publishes the resolution and returns before asking anything.

## Roads not taken

**No escape at all.** Every revert hands off; a person decides. Its case, intact: the injection
surface above, which this design now accepts rather than closes; and the cost is bounded rather
than recurring, since an item handed back is not re-worked until something answers, so a refused
resolution produces one handoff and then goes quiet. What decided against it is that a
legitimate revert — the base rewrote a file the artifact's work removes, the base changed
something this work supersedes — then has no path through the Igor at all. Not a slower path: no
path. The person resolves the branch by hand, and does so every time, for a case the worker had
already got right. Weighed against an injection risk that the recording property makes
attributable rather than silent, that was judged the worse trade.

**The worker naming the reverted paths in prose.** See above: it fails where the content is
hardest, which is where reverts come from.

**Preferring the base's version automatically where a revert is detected.** Tempting, because the
information is in hand and no human is needed. It decides correctness, which this change
explicitly declines to do: the base's version may be exactly what the artifact's work replaced,
and overwriting it is the same class of silent wrong in the other direction.

**Asking a person before resolving rather than before publishing.** Consent to attempt is not
verification of the result. The same silent revert lands, with somebody having agreed to it.

## Open

**Nothing carries a decision to the next cycle.** The declaration answers the question inside one
run: a worker that means the revert says so, and the resolution publishes. It deliberately does
not persist — it never reaches the commit, and the tree is disposable — so a revert that was
refused, handed off, and then agreed to by a person is not thereby permitted next cycle. The
person resolves that branch themselves; the next run starts from the same comparison and would
refuse again.

That is the right default for a permission that should be retaken rather than inherited, and it
is still a gap: the human's answer goes nowhere an Igor can read. A lore entry scoped to the
artifact is the shape that could carry it, and it is exactly the blanket, standing form this
design refuses within a run — so it belongs in its own change, argued on its own, rather than
smuggled in as a durability improvement on a field that is meant not to last.

## What the implementation found

Three things the measurement said that this design did not, recorded here rather than only in
the pull request, because they are what the next person touching this area needs.

**The declaration is read off disk, not out of the change list.** "A file the worker writes into
the tree and the loop reads" was written as though the loop's one read of the tree would report
it. It does not: `changes()` runs `git status --porcelain -uall`, which says nothing about an
ignored path, and igor's own `.gitignore` covers `.igor/`. Read through the change list the
channel is dead exactly where an Igor works on itself, and *every* declared revert refuses —
which is the "no escape at all" road this design rejected, reached by accident. The loop reads
the path directly and still strips it from the changes, so a repository that does not ignore it
publishes nothing either.

**A deletion is undone by presence, not by the merge base's own content.** The comparison was
first written as one rule — published content equals the merge base — which reads the deletion
clause out of the requirement. It made the guard fire only where head still held the merge-base
blob, which is to say only on a deletion nobody meant to drop; the delete/modify conflict a
worker resolves by keeping the file, which `conflictPrompt` explicitly invites, went through
unremarked. A deletion has no content to combine with, so the erosion this design declines to
catch has no instance here: present or absent, and present is the revert.

**The guard is bounded by what a published tree can carry, and says so loudly.** `git diff --raw`
sees every path git tracks; `changes()` reads regular UTF-8 files and `resolve` sends `100644`
blobs. A symlink to a directory, a dangling symlink and a submodule the base bumped are therefore
dropped from the published tree and flagged, correctly, as undone base changes — and on a clean
catch-up there is no worker to declare them. Those resolutions refuse rather than publishing a
silent revert, which is the requirement holding; that they cannot be published at all is
[#134](https://github.com/adamstallard/igor/issues/134), and it needs the other half of the
problem — a tree read and a publish that carry non-blob paths.
