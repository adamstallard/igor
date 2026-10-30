# Visibility guard: no private repository's content on a public state branch (#219)

## Decisions

Decisions 1 to 6, 8 and 9 are Adam's, of 2026-10-21. Decisions 7 and 10 to 13 are this change's
proposals, which approving the change approves.

1. **Igor refuses to work a private repository while its lore store is public** (Adam). The lore
   store is the repository `igor.config.yaml` names as `destination`, and its `igor-state`
   branch holds every Igor's records, worker transcripts among them. So no private
   repository's content reaches a public state branch.
2. **The comparison is of two visibilities, each read from GitHub's API as the role's GitHub
   App, and an internal repository counts as private** (Adam). A repository's `visibility`
   field is `private`, `internal` or `public`. An internal repository's readers are its
   enterprise's members, not the public, so an internal store may serve a private repository.
   The `publicStore` setting is never read for this, since a store made public after the setting
   was written leaves it wrong (#91).
3. **At start, the check covers every repository the role's sources name, and a mismatch refuses
   the start, naming both repositories** (Adam). An `igor run` or `igor serve` process serves
   one role, so refusing the role refuses the start: `igor serve` exits with status 78, under
   #82's *A process that refuses to start exits with status 78*.
4. **A candidate from a private repository, while the store is public, is skipped, and a
   read-cleared condition names both repositories** (Adam). The candidate is skipped before
   triage and before any claim, so nothing is posted on it and no record of it is written. The
   condition is #171's kind, *A read-cleared condition opens on a failing read and clears on a
   passing one*, with the cure key `repo:<owner>/<name>:visibility` naming the worked
   repository. A candidate's repository is the one its item belongs to, which is not always the
   one its source names (task 0.2).
5. **A visibility change while Igor runs is caught at the next read** (Adam): a repository made
   private, or a store made public. At every cycle the code reads the store's visibility, the
   visibility of each repository a candidate comes from, and that of each repository with an
   open visibility condition (decision 4).
6. **Igor never writes a private repository's transcript or content to a public state branch**
   (Adam).
7. **The code reads both visibilities again just before it writes a run's records, and on a
   mismatch, or a read GitHub does not answer, writes the records without their content.** A run
   can outlast a cycle, so a store made public after the cycle's read would otherwise receive
   that run's transcript. The run's ledger row keeps its structured fields, such as cost and
   outcome, because seat budgets sum every run's cost from the state branch. *Rejected:* reading
   once per cycle only, which leaves that window open for as long as a run lasts; and writing
   nothing at all, which would drop the run's cost from its seat's budget.
8. **`igor doctor` (#113) reports a mismatch by invoking the start check of decision 3** (Adam),
   for each role, under #113's decision 4: `doctor` invokes an existing check and never
   re-implements one. Where `doctor` lacks a role's App key, that role's check is reported
   unchecked.
9. **#188 and #190 cite this change for public stores** (Adam). #188 drops its trimming of the
   action log by store visibility, since under decision 6 a public store never holds a private
   repository's log. #190 (`review-evidence`) adds a table of what the run checked and ran to
   each pull request Igor opens, and does no trimming by visibility: the pull request is in the
   worked repository, which is no more visible than that repository.
10. **A visibility read GitHub does not answer at a cycle leaves that repository's candidates for
    the next cycle, and opens no condition.** An outage is not a mismatch, and a condition whose
    cure is changing a repository's visibility would mislead. At start, #82's rule for a check
    GitHub did not answer applies (exit 1).
11. **What counts as content is any text a run produced or read; structured fields are not.**
    A record's item id, cost, outcome and exit code stay, so the ledger stays whole.
12. **The rules live in a new capability, `visibility-guard`.** *Rejected:* `lore-store`, which
    #212 names for its startup refusal. The guard reaches discovery, execution and `igor
    doctor`, not only the store's configuration.
13. **A pull request whose run's records were written without content names no transcript.**
    The code on `main` links the transcript in a pull request's body only where the store is
    public, since only then can the pull request's readers open it. Where a store turns public
    during a run on a private repository, decision 7 writes no transcript, so the link would
    point at nothing.

**Still open:**

- **This change against #212 and #216's three-level ranking.** Issue #212, decided by Adam and
  not yet specified, refuses a start where the lore store is more visible than at least one
  repository a role works, ranking private below internal below public. #216 (`lore-search`)
  writes the same ranking into its rule for where a lore citation may go. Both are stricter than
  this change for an internal store serving a private repository, which this change allows.
  *Recommended:* when #212 is specified, make it a change that modifies this change's
  comparison to #212's ranking, so one rule states visibility for the state branch. An internal
  store would then no longer serve a private repository, which reverses the consequence decision
  2 states, so that is Adam's call. #216 keeps its ranking for citations either way.
- **Where the visibility rule is stated.** #188 (as it stands) and #216 each state their own rule
  for reading the store's visibility from GitHub, and each counts a store whose visibility cannot
  be read as public. This change handles an unread visibility as decisions 7 and 10 say instead:
  the run's content is withheld, and the repository's candidates wait for the next cycle.
  *Recommended:* this change owns the reading, and #188 and #216 cite it. #188 is amended to do
  so with decision 9; this change's pull request tells #216's author.
- **The in-force `lore-review` requirement *A public destination refuses privately-sourced
  entries*** still lets the store's visibility be declared in configuration, which this change
  does not trust. *Recommended:* a later change has that requirement read GitHub too, as #91
  asks.
- **The visibility check and #208 (`lore-pull`).** #208 lets a process whose lore commit fails a
  startup check start on the last good commit instead. Whether this change's start check is one
  of #208's startup checks is not settled. *Recommended:* it is, so a lore commit adding a
  private source to a role with a public store is refused like any other failing lore commit.
  This change's pull request tells #208's author.
- **The watermark passes a skipped candidate.** The in-force *Watermarks reduce reconsideration
  without governing it* lets the watermark advance over items a cycle skipped, so after the cure
  a skipped item is seen again only once it is updated. *Recommended:* accept it for now, since
  a mismatch is a setup fault fixed once; the alternative modifies that requirement, which #101,
  #179 and #106 also modify.
- **The condition names a private repository on a public branch.** Condition rows are written to
  the state branch, so decision 4's row names the private repository there. A repository a
  role's source names is already named in that role's file in the public store; one found only
  through an item is not. *Recommended:* accept it, since a name is not content.
- **Private text from a tracker that is not a repository,** such as a Linear issue, can still
  reach a public state branch: the guard compares repositories only. #190 deferred this question
  to the guard. *Recommended:* a later change, once a non-GitHub tracker is in use.
- **What the state branch already holds when a store is made public.** The guard stops new
  writes; it cannot unpublish records written while the store was private. *Recommended:*
  `docs/architecture.md` warns that making a store public publishes its whole state branch.

## Why

An Igor's transcripts and other records go to the state branch of its lore store, which is a
different repository from the one it works. A transcript can quote the worked repository's code
and its issues' text. Nothing compares the two repositories' visibilities, so a public store
serving a private repository publishes that repository's content.

The in-force `lore-review` requirement *A public destination refuses privately-sourced entries*
guards lore entries only, and trusts a `publicStore` setting that can be out of date (#91).

## What Changes

- New capability `visibility-guard`: the comparison, the start check, the per-candidate skip and
  its condition, the read before a state-branch write, and `igor doctor`'s report.
- `src/github.ts` gains a read of a repository's `visibility` as the App.

## Capabilities

### New Capabilities

- `visibility-guard`: Igor never works a private repository through a public lore store, and
  writes nothing from one to its state branch.

### Modified Capabilities

None.

## Impact

- **Archive order:** after #101 (`condition-backoff`), #171 (`seat-files`), #113
  (`check-a-lore-repository`) and #82 (`stopped-scope-visible`), whose requirements or code this
  change cites. Issue #204 holds the whole order.
- **Code:** the start path in `src/cli.ts` (`actAsApp`), the cycle in `src/loop.ts`, the
  state-branch writes and the pull request body in `src/execute.ts`, `scopeOf` in #101's
  `src/conditions.ts`, and `igor doctor`'s checks once #113 builds them.
