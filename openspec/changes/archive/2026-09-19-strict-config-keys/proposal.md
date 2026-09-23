## Why

A key a parser does not know is a key it drops without a word, and every level of this
configuration did it. One of them has already cost something: `capacity_stimate` in a live
config left a seat reporting `NO_CAPACITY_FIGURE` while the figure sat on the page, and the
seat level was made strict in response ([#59](https://github.com/adamstallard/igor/issues/59)).
The same hole is one level up, two levels up, and in the role files beside them.

The level above the seat is the one with teeth. `budget.seats` is read as an empty list
whenever it is not a list, so `seast:` — or a mapping where a sequence belongs — is not a
smaller budget but **no budget**: every ceiling disappears, no reserved seat is passed over,
nothing in `igor budget` says anything is missing, and the first sign is a person's own
allowance gone. Where the seat-level case passed one seat over visibly, this one removes
enforcement from the whole fleet silently.

The rest are the same defect with smaller blast radii. A pool reads `id` and `seats` and drops
the rest. The config file reads five keys and drops the rest, so a misspelt `destination`
reports itself as an absence. A role file rejects an unrecognised *action* inside `allow` while
accepting any key at all around it — including a misspelt `excludes`, which is a safety rail
going missing rather than a setting not taking.

## What Changes

**One rule, one place.** `keyCheck` builds a refusal that names the offending key and the
accepted ones, and each parser raises it with its own error type. The seat-level message is
already this shape; every other level now matches it rather than inventing a fourth wording.

**Refused at every level of both files.** The config file's own keys; `budget`'s; a pool's; a
role file's, including the nested `lane`, its `labels`, `paths` and `age`, and each `sources`
entry. The role check sits in the one function every read of a role file goes through, so a
role, the org base it inherits, and a parent read only for what it contributes are all covered
once.

**A list that is not a list is refused, not emptied.** Absent stays empty — running with no
budget declared is the documented way to run unenforced, and that path is untouched. Declared
and malformed now fails, because the failure it silently produces is indistinguishable from
being configured correctly.

**`claim` is refused with its reason rather than dropped.** A role may not replace the claim
message, and that held by ignoring the key: whoever wrote it went on believing their fleet said
what they told it to. It now refuses, naming what the message carries and why it is not a
role's to replace. `name` already worked this way. Both are deliberate settings, and "not a role
key" is the wrong answer to either.

**Every documented configuration is parsed by the parser that would read it.** A guard that
refuses a documented example is worse than the hole it closes, and nothing else here reads the
docs. Each fenced block declares the level it sits at so it cannot be checked by a parser that
never looks at it. Two blocks did not survive the first run, on the rules as they already
stood: an example pool listing four seats nobody declared, and an example role narrowing
`allow` past the completion action it declares.

Explicitly out of scope:

- **Entry frontmatter.** `validateFrontmatter` refuses derived fields by name and otherwise
  accepts what it does not read. It is data people write in prose, not configuration a parser
  silently half-applies, and whether an unknown field there is an error is a separate question.
- **A `budget:` key with nothing under it.** It still reads as no budget, like an absent one.

## Capabilities

### Modified Capabilities

- `lore-store`: the config file refuses a key it does not read, before it reports a required
  one missing.
- `seat-budget`: `budget`, a seat and a pool each refuse a key nobody reads, and `seats` or
  `pools` declared as anything but a list is refused rather than read as empty.
- `role-config`: a role file refuses a key nobody reads, at the top level and inside `lane` and
  `sources`; `claim` is refused with its reason instead of being dropped.

## Impact

- A budget that does not enforce can no longer look like one that does.
- A typo anywhere in either file is now a one-line fix with the line named, rather than a
  symptom somewhere else — `NO_CAPACITY_FIGURE`, a role that never matches, a floor that was
  never held.
- Anything relying on a key being ignored stops working. Within this repository that is
  `claim`, which was ignored on purpose; the refusal is the point.
- The docs are now parsed, so a block that drifts from the parser fails a test rather than
  waiting for somebody to copy it.
