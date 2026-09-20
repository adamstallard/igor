# Choosing the escalation surface

[#50](https://github.com/adamstallard/igor/issues/50) lists four candidates and picks none.
This is the argument for one and against the other three, and then the two mechanisms that are
choices rather than consequences: how the surface knows it has already spoken, and what keeps
Igor from working its own message.

## The test the surface has to pass

Two producers conclude something only a person can act on:

- `reconcile` finds an open lore proposal quiet past the window. It has a pull request.
- `condition-backoff` stops a scope on a recurring cure key. It has **nothing** — no pull
  request, no item, no thread. The cure is a configuration on a surface with no channel back
  to the loop.

Any surface that serves only the first is not an answer, because the issue is explicit that
answering them separately gives an operator two places to watch, which is the same as none.
A third test comes from the producers' cadence: both run on every merge or every poll and
conclude the same thing every time, so a surface that re-announces is one people mute, and a
muted surface is the defect being fixed.

So: **reaches a person who did not go looking**, **exists without a pull request**, **speaks
once**.

## Why the three lose

**A comment on the quiet pull request** lands exactly where the assignee already is, and for
the lore half it is the best of the four. It fails the second test outright: a stopped scope
has no pull request to comment on. Taking it would mean shipping half an answer and leaving
the harder half to a later change — which is the state we are already in.

**The job's step summary** is stdout one click deeper. It is still a pull surface: a person
must decide to visit Actions, on a repository whose runs are all green, to discover that one
of them concluded something. It also fails the second test for a structural reason rather than
a cosmetic one — the step summary exists only inside a GitHub Actions run, and the loop that
stops a scope is a long-running process that need not be in Actions at all. A surface that
only exists in one of the two producers' runtimes cannot be the shared one.

**A file committed to the store** is where a stopped scope's record *already lives*:
`condition-backoff` puts the condition in the state branch, and its own Impact says a fleet
stopped on one cure key is a strong signal and nothing currently surfaces it. Committing a
second file next to the first does not make anybody read either. "Read by whatever runs next"
names a machine reader, and the missing reader is a person.

## Why the issue wins

A repository's issue list is the only one of the four that **pushes**: opening one notifies its
assignees on whatever channel they already use, without anybody having chosen to look. It needs
no pull request, so both producers can raise onto it. It is assignable, which is how the
surface acquires subscribers at all. And it has a lifecycle a person can end with a gesture
they already know — closing it — which is what makes the idempotence below cheap.

The cost is that Igor becomes an author of items in the destination, which it has never been.
That is the prior question inside #50, and it is answered rather than worked around, narrowly:
Igor opens an item to *say something to a person*, and nothing here authorizes it to open one
as work.

## Idempotence: the open issue is the record

The producer concludes the same thing on every run. It must not say so twice.

**Nothing new is written down.** Before raising, the producer searches the destination for an
escalation carrying the same subject; where an open one exists it says nothing. The issue's own
state is the record. This is the shape `reconcile` already uses — it reads pull request state
back rather than keeping a file that says what it announced — and the shape `stillDeferred`
uses, where a reply from anybody other than the Igor is the answer and no signal shaped for
Igor is ever required.

**A subject is an occurrence, not a thing.** This is where the two producers differ and where a
careless key breaks `condition-backoff`. Its clearing rule (task 4.2) is that a probe outcome
without the condition closes it and one with it *reopens* it, so a single cure key goes open →
closed → open over its life. Keyed on the cure key alone, a condition that cleared in March and
recurred in June would find a closed escalation, match it, and stay silent while the fleet sat
stopped. So:

- a quiet proposal's subject is its pull request number **and the last activity it went quiet
  from**;
- a stopped scope's subject is its cure key **and that occurrence's opening**.

**Closing is the answer.** A person who closes an escalation has said "seen", and the same
unchanged fact never raises another. A *new* escalation follows only from the subject having
changed and gone wrong again — the `fingerprint` shape from `src/deferred.ts`, applied to the
subject rather than to an item.

Two honest consequences of that, which are easier to state than to have discovered:

- **Closing is weaker than it sounds.** The realistic gesture is closing the escalation *and*
  nudging the pull request, and a nudge moves `updatedAt`. That re-arms the subject, so when it
  goes quiet again past the window it escalates again. This is correct — the fact changed and
  then re-occurred — but "closed stays closed" only holds for a subject nobody touched.
- **An escalation does not track probes.** Its open/closed state follows the *condition's*,
  not the probe's. A condition that oscillates probe → reopen → probe would otherwise produce
  an escalation per cooldown, which is precisely the re-announcement that gets a surface muted.
  One condition, one escalation, however many probes it takes.

## The guard: an escalation is not work, by what it is

The tempting mechanism is assignment. `universalSkip` in `src/predicate.ts` skips an item held
by anybody other than this Igor, so an escalation assigned to the store `reviewers` is already
unclaimable, and the act that says who is subscribed would do both jobs.

**It does not hold.** `requireStringArray` in `src/config.ts` returns `[]` for an absent key, so
`reviewers` is optional — and `src/cli.ts:229` already prints `(no store reviewers configured)`,
so empty is a state the tool expects. With nobody to assign, `others.length === 0`, the
escalation falls through to `laneVerdict`, and whether Igor claims its own message then depends
on a role's label filters, which Igor cannot guarantee. Unassigned is not the edge case; it is
the default for anybody who has not filled the key in.

So the escalation must be excluded **by what it is**, as a universal skip alongside `closed`,
`inFlight` and `held` — not by who happens to hold it. Assignment then does only the job it can
actually do: naming who is subscribed.

Recognizing it requires a marker Igor writes, which sits awkwardly beside `lore-review`'s rule
that a proposal is recognized by the entry files it adds and explicitly **not** by its branch
prefix. The two are not in conflict. A lore proposal exists independently of Igor — a person
can open one by hand, so recognizing it by a convention Igor happens to follow would miss
theirs. An escalation has no existence apart from Igor having raised it; the item *is* the
announcement, and there is no natural act underneath to read instead. Where there is nothing
but the marker, the marker is not a shortcut.

The corollary is deliberate: strip the marker and it becomes an ordinary item, workable like
any other. That is a person converting Igor's message into their own work item, which is a
reasonable thing to want and costs nothing to allow.

## What is left open

Who is subscribed for a stopped scope. The store-level `reviewers` is the only configured list
of people who own the destination, so both producers use it. But it is named for people who
approve lore claims, and a stuck Igor is an operations problem — plausibly a different list.
Adding a key now would be guessing at a distinction no team has yet needed, so `reviewers`
stands, provisionally, on the same grounds `condition-backoff` marks its threshold and cooldown
provisional: nothing has been measured because nothing has been run.
