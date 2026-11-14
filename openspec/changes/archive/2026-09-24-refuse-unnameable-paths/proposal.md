## Why

A file whose name is not valid UTF-8 used to be dropped from an artifact in silence.
[#97](https://github.com/adamstallard/igor/pull/97) fixed that: `git status -z` is read as
bytes, so the name survives the parse and the file's content reaches the artifact. It stopped
short of the last step, and said so — `ChangedFile.path` is still a decoded string, because
the GitHub tree API takes a path as a JSON string, and #97 accepted three costs rather than
adding a detection branch:

- A **modified** file publishes at the U+FFFD spelling, which is a **new path**. The original
  is left as it was, and the branch carries the file twice.
- A **deletion** sends a mangled path and removes nothing.
- **Two names differing only in the undecodable bytes decode to the same string**, so both
  publish at one path: the last wins, or the host rejects the whole tree.

All three are a change that is *wrong* rather than one that is *missing*. Recovering a name
correctly and then publishing it wrongly is a stranger state than either not recovering it or
not publishing it — #97 put the bytes in hand, and publishing at the mangled spelling throws
them away at the last step.

**And the check is exact now, which is what changed.** Detect-and-refuse was considered and
rejected for this before the bytes existed, when the only available test was "does the decoded
name contain U+FFFD" — a test with a false-positive class, since a file may legitimately be
named with that character. With the bytes in hand the test is a **round trip**: re-encode the
decoded name and compare it to what git wrote. Equal means the name survived, unequal means it
did not. No heuristic, and no false positives.

## What Changes

**One added `task-execution` requirement: a change is not published under a name that is not
text.** Where any changed file's name fails the round trip, the run publishes nothing and hands
off naming that file by the bytes git wrote — escaped, so two names that decode alike are two
different strings in the message. The requirement states the round trip explicitly, because the
substring test it replaces is the reason this was not done sooner.

**A delta, where #97 rightly took none.** #97 made an existing requirement true for an input it
was already wrong for; nothing in force describes what an artifact does with a name that is not
text, so there was nothing to add. This is the other shape — it **removes an outcome**. A run
that would have produced an artifact now does not, and under the rule
[#61](https://github.com/adamstallard/igor/pull/61) applied ("a new refusal is behaviour the
command never promised"), new behaviour is written down rather than left in a comment.

**The run still says what it changed.** The refusal lives in the publishing path, not in
`changes()`, so every other reader of the tree is untouched — including the kill path, which a
requirement in force obliges to name what the worker changed. The recorded change list names
such a file by its bytes as well, so the reason and the record agree.

## Capabilities

### Modified Capabilities

- `task-execution`: a run whose changed files include a name that is not valid UTF-8 publishes
  nothing and hands off naming that file by its bytes, rather than publishing it at the
  spelling decoding left behind.

## Impact

- A repository holding a file whose name is not text can no longer receive an artifact that
  silently renames, duplicates or fails to remove it.
- A run that touches such a file produces nothing at all, where before it produced something
  wrong. The whole-run scope is argued in `design.md`, along with the per-file alternative.
- Ordinary runs are unaffected, and so is a file legitimately named with U+FFFD — the round
  trip is what keeps the refusal off it.
