## Why

`changes()` in `src/worktree.ts` skips a path it cannot read. A removal enters the change list
without a read, and an added or modified path is read with `readFile`; where that read throws and
the path is not unmerged, the catch's last branch (`src/worktree.ts:565`) is a bare `continue`. No
throw, no refusal, nothing in the record:

```ts
        // An unreadable file is skipped. A binary is not this case and never reaches here:
        // ...
        continue
```

**A rename whose destination cannot be read then publishes a clean removal with no addition, and
the diff reads as a deliberate deletion.** Since [#118](https://github.com/adamstallard/igor/pull/118)
merged, `changes()` passes `--no-renames`, so a rename arrives as an unrelated `D` record and `A`
record: the `D` is emitted, and the `A`'s read throws and is skipped. Reading the code on `main`
shows `git mv link link2` on a dangling symlink reaching that `continue`, because `readFile` follows the
link. No run has observed it, and none will be made for it: #137 and #175 each retire that route
(*Related changes*), and the tests use a file without read permission instead.

**Nothing makes it visible.** The tree API accepts the lone removal without error, because the old
path is a tracked file the base tree holds. The archived `artifacts-carry-removals` work measured
this: removing a path the base tree holds succeeds, and removing one it does not returns 422
`GitRPC::BadObjectState`. A reviewer sees a file deleted on purpose.

**It is one of three instances of one class**, *the published artifact does not match what the
worker did, and review cannot see it*, with [#68](https://github.com/adamstallard/igor/issues/68), where a
resolution undid what the base did, and [#116](https://github.com/adamstallard/igor/issues/116),
where a worker's deletion was missing from `changes()` output during a conflicted merge; both are
closed. One guard over all three does not work: comparing what is published against what the
worker did reads `changes()` output, which in #116's case was itself incomplete, so the comparison
would agree with a tree built from the same incomplete list. Each instance gets its own fix.

## What Changes

One **added** `task-execution` requirement: a path the worker added or modified that execution
cannot read stops the publish rather than being omitted from it silently, and the item is handed
off naming the path. It is stated over paths, not renames, and leaves removals to the in-force
removals requirements; design.md says why.

Nothing else changes. An artifact whose every changed path is readable is built exactly as it is
today.

## Why `task-execution`, and why added rather than modified

`task-execution` holds *The artifact carries every change the worker made, including removals*,
which is the requirement this failure defeats, from a direction its words do not describe. That
requirement governs *"every change execution read out of the working tree"*, and here the
destination was **never read**: the `readFile` threw. Nothing execution read was dropped. The
artifact is missing a change execution never obtained, which the existing text does not reach. The
new requirement governs exactly those paths and does not weaken the old one.

So the old requirement is satisfied literally and violated in spirit, which calls for an added
requirement rather than a reworded one.

## Related changes

[#137](https://github.com/adamstallard/igor/pull/137) and
[#175](https://github.com/adamstallard/igor/pull/175) each carry a symbolic link as a link rather
than following it, so once either lands a dangling symlink is published and no longer reaches this
requirement. A file without read permission stays unreadable after both, and #175's *A file the
worker made unreadable is not dropped* names this change for that case.

[#125](https://github.com/adamstallard/igor/pull/125) rewrites the same catch in `changes()`. Its
task 5.2 tells a path gone from disk from one present but unreadable before concluding a deletion,
as this change's task 2.3 does, and it omits a path the worker did not touch that is not a regular
file, such as an unmerged submodule. design.md's *Open Questions* holds what the two must settle.

[#150](https://github.com/adamstallard/igor/pull/150) modifies *The artifact carries every change
the worker made, including removals* so that gate one of the two-gate workflow carries only
changes under `openspec/changes/**` and names the rest. Under gate one, an unreadable path outside
`openspec/changes/` is one #150 would not carry anyway; design.md's *Open Questions* holds it.

## Impact

- A worker renaming a file whose destination cannot be read no longer publishes a deletion. The
  run refuses, names the path, and hands the item off.
- A worker adding or modifying a file that cannot be read no longer publishes the rest without it;
  that run refuses too, where today it publishes.
- A run killed for a limit records every path it changed, the unreadable one included, where today
  the unreadable one is skipped.
