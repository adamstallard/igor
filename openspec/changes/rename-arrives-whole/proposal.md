## Why

`changes()` emits a rename's source removal **before** it reads the destination. Where that read
throws, the removal is already in the output and the catch's last branch is a bare `continue` —
no throw, no refusal, nothing in the record:

```ts
} catch {
  if (UNMERGED.test(flags)) { out.push({ ...name, content: '', kind: 'deleted' }); continue }
  // An unreadable file.
  continue
}
```

**The artifact then publishes a clean removal with no addition, and the diff reads as a
deliberate deletion.** `git mv link link2` on a dangling symlink does this on `main` today.

**Nothing makes it visible.** The old path is in `base_tree` — it is a rename of a tracked file —
so the removal is exactly the case the tree API accepts, measured on the archived
`artifacts-carry-removals` work: removing a path the base tree holds succeeds, removing one it
does not returns 422 `GitRPC::BadObjectState`. There is no error to surface. A reviewer sees a
file deleted on purpose.

**It is pre-existing and not [#114](https://github.com/adamstallard/igor/pull/114)'s.** That
change fixed *which* records get paired; this is the order in which a pair's two halves are
handled. Found by the bug-hunter run on #114 and deliberately left out of it, the fix being in a
different part of the function.

**Third instance of one class** — *the published artifact does not match what the worker did, and
review cannot see it*: [#68](https://github.com/adamstallard/igor/issues/68) (a resolution undoes
what the base did), [#116](https://github.com/adamstallard/igor/issues/116) (a worker's deletion
vanishes from `git status` during a conflicted merge), and this one. One guard over all three was
considered and does not work: the natural shape — compare what is published against what the
worker did — reads `changes()` output, which is the very thing #116 corrupts, so the comparison
would find a corrupted list in perfect agreement with a tree built from it. Catching that one
needs the working tree itself. Three routes, three fixes.

## What Changes

One **added** `task-execution` requirement: a changed path execution cannot read stops the publish
rather than being omitted from it silently.

**Stated over paths rather than over renames, deliberately.**
[#118](https://github.com/adamstallard/igor/pull/118) switches `changes()` to `--no-renames` and
deletes the pairing in `statusRecords` as unreachable, so after it lands a rename arrives as an
unrelated removal and addition. The failure survives that change unaltered — the removal is
emitted, the addition's read throws, the artifact carries a lone deletion — but a requirement
phrased as *both halves of a pair* would not, because there would be no pair to speak of. Phrased
over paths it holds under either reading of the working tree, and covers the same failure reached
by an addition that stands alone.

Nothing else changes. An artifact whose every changed path is readable is built exactly as it is
today.

## Why `task-execution`, and why added rather than modified

`task-execution` holds *The artifact carries every change the worker made, including removals*,
which is the requirement this failure defeats — but it defeats it from a direction the words do
not describe. That requirement governs *"every change execution read out of the working tree"*,
and here the destination was **never read**: the `readFile` threw. Nothing execution read was
dropped. The artifact is missing a change execution never obtained, and carrying one half of a
pair whose other half failed is a case the existing text does not reach.

So it is satisfied literally and violated in spirit, which is an added requirement rather than a
reworded one — the same call
[#118](https://github.com/adamstallard/igor/pull/118) made for #116, and for the same reason.

## Impact

- A worker renaming a file whose destination cannot be read no longer publishes a deletion. The
  run refuses, names the path, and hands the item off.
- A dangling symlink is the case that reaches it today; any unreadable destination does the same.
- No artifact that publishes today stops publishing, except the ones publishing a half-rename.
