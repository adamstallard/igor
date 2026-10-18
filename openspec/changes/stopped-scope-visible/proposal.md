## Decisions

1. **`igor serve` never exits at runtime because of a condition** (Adam, 2026-10-18). Whatever
   conditions are open, on the Igor's GitHub App credential, on its role or on every seat its
   role could spend from, the process keeps polling. A stopped scope takes no new item, as
   `condition-backoff` ([#101](https://github.com/adamstallard/igor/pull/101)) requires. Where
   [#171](https://github.com/adamstallard/igor/pull/171) has a role with no usable seat give each
   item back to a person with a comment naming the condition, the process does that. Each
   condition clears as those changes clear it, and the cycle report says what is stopped. *Rejected:* exiting when the open conditions leave the process no
   item it could take, which earlier revisions of this change specified. An exited process comes
   back only through a supervisor's restart loop or a person, and a restart reads the same
   conditions from the same state branch. A fix to a setting the process rereads while running
   is picked up at its next probe or read. This supersedes Adam's
   2026-10-17 decision on the exit this change then specified, which exempted only a seat Igor
   could not decrypt from it. Decision 4, also from 2026-10-17, is about reporting and stands.
2. **Refusing to start on a bad setup stays.** Every check a process makes before its first cycle
   still stops it, such as a configuration that fails validation, and, under
   [#175](https://github.com/adamstallard/igor/pull/175), a missing worker user or
   `fs.protected_hardlinks` not set to `1`. These are checks on the setup made once at start, not
   conditions.
3. **A seat's stop is reported where the seat is reported:** a line of the seat's own in `igor
   budget`, told apart from a credential that could not be read, one the provider refused, and no
   headroom.
4. **A seat Igor could not decrypt reads as an unreadable credential in `igor budget`** (Adam,
   2026-10-17), with the decryption failure as the reason and the condition named, never as a
   stopped seat. [#171](https://github.com/adamstallard/igor/pull/171) (`seat-files`) opens that
   condition.
5. **A role's stop is not in the budget report.** Every open condition is listed by a command that
   takes no argument and names no role; `design.md` argues for naming it `igor conditions`.

**Still open:**

- Which cures a running process can pick up. A setting kept in the lore repository reaches it
  only once [#176](https://github.com/adamstallard/igor/issues/176) specifies pulling the lore
  checkout, and one in the unit's environment file, such as the App's key, is read only at
  start. After a lore fix, until #176 is built, and after any environment-file fix, a person
  restarts the process; its probe would otherwise meet the condition again on the old setting.

- Whether the supervision recipes this repository ships should escalate a process that keeps
  refusing to start, and restart it no faster than the poll interval. This change required both
  only so that an exit on a condition reached someone. With no such exit, the requirement is
  dropped, and nothing specifies how the startup refusals in decision 2 reach anyone.

## Why

`condition-backoff` stops a scope after the same cure key recurs, and says in its own Impact
what it does not do: *"A stopped scope is visible only where somebody looks at the record."*

At a terminal that is fine: somebody typed `igor run` and is reading the output. Unattended it is
not. An Igor stopped on a condition stays up, takes nothing, and looks like a healthy Igor with an
empty queue to anyone who does not read the record.

Exiting would make the stop visible, and this change specified that first. But an exit only moves
the problem to the supervisor: the restarted process reads the same open conditions, so it either
exits again in a loop or idles exactly as before. The process that stays up is the one that can
notice a cure. So this change leaves the process running and makes the stop readable where each
reader looks.

## What Changes

**`igor serve` keeps running on every condition.** It polls, takes no new item in a stopped
scope, lets each condition clear as `condition-backoff` clears it, and states what is stopped in
its cycle report. The checks that refuse a bad setup at start are unchanged.

**A seat's stop is reported where the seat is reported.** `igor budget` already prints a line of
the seat's own for a credential it could not read, and `condition-backoff` adds one for a
credential the provider refused. A seat a condition has stopped is a third answer to the same
question, whether this seat can be spent from, and belongs beside them. A seat Igor could not
decrypt goes on the unreadable-credential line, because #171 treats it as a credential this
machine could not read.

**A role's stop is not a fact about a seat, and does not go in a budget report.** Its reader is
asking *is anything stuck*, which no budget report answers. The requirement pins the reader and
the content: every open condition, listed by a command that needs no argument and names no role,
saying what would cure it and when the probe is due.

### Rejected: an issue in the destination

[#77](https://github.com/adamstallard/igor/pull/77), now closed. It pushes, which is its real
advantage over everything here. It was rejected because it costs a new concept, an Igor authoring
issues, with `universalSkip` taught about issues an Igor wrote and `issues: write` on the template,
and stopped conditions would be the only thing using it. #77 also proposed Igor-authored issues
for quiet proposals, but [#79](https://github.com/adamstallard/igor/issues/79) answers those
separately. An
operations alert would also land in a work tracker whose readers are reviewers, which is the wrong
audience for it.

### Deferred, not rejected: a configured command hook

An `on_condition_command`, the same shape as a seat's `token_command`: the operator wires it to
whatever they page on. It is the push option that assumes no particular stack, and the right thing
to add **if** pull turns out not to be enough. The evidence that would bring it back: an Igor found
stopped long after the fact, where the listing and the budget line existed and nobody had run
either.

## Capabilities

### Modified Capabilities

- `stuck-conditions`: `igor serve` keeps running whatever conditions are open, and every open
  condition is readable without naming a role. (Added to the capability `condition-backoff`
  creates; this change alters no requirement that change states.)
- `seat-budget`: a seat a condition has stopped reads as stopped, distinctly from a seat whose
  credential could not be read, one whose credential the provider refused, and one with no
  headroom.

## Impact

- A stopped Igor stays up, and recovers by itself once a cure it rereads while running lands;
  other cures need a restart, as *Still open* says. A person learns of the stop from the cycle
  report, `igor budget` or the conditions listing.
- A stop requires somebody to look. Nothing here pushes, deliberately; the hook that would is
  deferred above with the evidence that would bring it back.
- Implementation lands in `src/serve.ts`, `src/cli.ts` and `src/budget.ts`. It is sequenced behind
  `condition-backoff`, which produces the conditions every requirement here reads.
