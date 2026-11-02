## Why

`changes()` reads the working tree through one assumption: **every changed path is a regular file
holding UTF-8 text.** `ChangedFile` says so in its own shape — `content: string`, with a comment
conceding *"a deletion carries no content, and a binary is not reported at all."* Each kind of
entry that is not a text file fails differently, and each failure is filed:

| | what happens |
|---|---|
| [#134](https://github.com/adamstallard/igor/issues/134) | a base change to a symbolic link or a submodule can be neither published nor declared, so **every resolution on that repository refuses** |
| [#127](https://github.com/adamstallard/igor/issues/127) | an unmerged submodule is a gitlink, `readFile` throws `EISDIR`, and the catch records a **deletion** — the artifact drops it on a run where the worker touched nothing |
| [#115](https://github.com/adamstallard/igor/issues/115) | a rename whose destination cannot be read publishes the source's removal alone. The cause reachable today is a **dangling symbolic link**: `readFile` follows it and throws |
| [#67](https://github.com/adamstallard/igor/issues/67) | a binary read as `utf8` becomes replacement characters and is published as a file that **looks plausible and is wrong** |

**A tree can already hold every one of these.** `120000` is a symbolic link whose content is its
target; `160000` is a submodule naming a commit. The publishing path is not what flattens them —
the read is, and `CodeHost.resolve` sending `100644` only keeps them flat.

**And the reachability is ordinary.** `docs/latest -> v3/` is a normal thing for a repository to
contain. A base branch bumping a submodule is routine wherever submodules are used. Neither needs a
worker to do anything unusual: the worker never touches them, the merge brings them in, and the
resolution must carry them forward or they read as reverted.

## What Changes

One **added** `task-execution` requirement: an artifact carries a changed path as the tree holds
it, whatever kind of entry that is, and refuses naming the path where a kind cannot be
represented.

**It overturns a decision, which is why it is a change rather than a fix.**
`docs/architecture.md` §6.7.3 records the binary case as *"known, and deliberately unguarded"*, and
it is entry 12 in that file's accepted-gaps list. A `FIX` commit cannot retire an accepted gap; the
gap is a decision, and decisions are what a change is for.

## Why added, rather than modifying what is in force

`task-execution` already says *"An artifact SHALL carry every change execution **read** out of the
working tree"*, and — once `carry-only-what-happened` lands — that it carries no change the worker
did not make. Neither reaches these.

The reason is exact: **each turns on what execution read.** A path `readFile` throws on was never
read, so a requirement about every change read is satisfied by not reading it. Every one of the
four defects above lives in that gap. So this requirement is stated over what the **tree holds**
rather than over what execution obtained, which is the only phrasing that reaches them.

The three together say what must be **present**, what must be **absent**, and what must be
**accurate**. The third was missing.

## Impact

- A repository holding a symbolic link or a submodule becomes usable for conflict resolution.
  Today it refuses every time.
- A binary a worker touches is carried or refused rather than corrupted, retiring accepted gap 12.
- `ChangedFile` widens past `content: string`, which reaches every consumer of `changes()`. This is
  the largest part of the work and `design.md` argues the shape.
- Nothing changes for a change whose every path is a regular text file, which is nearly all of
  them.
