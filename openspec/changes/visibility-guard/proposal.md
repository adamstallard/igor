# Visibility guard: no private repository's content on a public state branch (#219)

Builds on: read-seat-windows-from-the-stream (adamstallard/igor#143)
Builds on: check-a-lore-repository (adamstallard/igor#113)
Builds on: seat-files (adamstallard/igor#171)
Builds on: stopped-scope-visible (adamstallard/igor#82)

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
   triage and before any claim, so nothing is posted on it, and the only record written is the
   condition. The
   condition is #171's kind, *A read-cleared condition opens on a failing read and clears on a
   passing one*, with the cure key `repo:<owner>/<name>:visibility` naming the worked
   repository. A candidate's repository is the code-host repository its run works: for a GitHub
   item, the item's own, which may differ from the one its source names (task 0.2 measures
   whether a source's query can return such an item).
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
   outcome, because seat budgets sum every run's cost from the state branch. A run's pull request
   is published before its records are written. It names a transcript only where a read just
   before publishing finds the store public and no mismatch. Where the read before the write then
   withholds the transcript, as when the repository was made private in between, Igor removes the
   transcript path from the body. *Rejected:* reading
   once per cycle only, which leaves that window open for as long as a run lasts; and writing
   nothing at all, which would drop the run's cost from its seat's budget.
8. **`igor doctor` (#113) reports a mismatch by invoking the start check of decision 3** (Adam),
   for each role, under #113's decision 3: `doctor` invokes an existing check and never
   re-implements one. Where `doctor` lacks a role's App key, that role's check is reported
   unchecked.
9. **#188 and #190 cite this change for public stores, and neither drops any of its content by
   visibility** (Adam).
10. **A visibility read GitHub does not answer at a cycle leaves that repository's candidates for
    the next cycle, and opens no condition.** Where the unanswered read is the store's, every
    candidate of the cycle waits, since none can be shown not to be a mismatch. Each waiting
    candidate holds its source's watermark back, as an untriaged one does, so the next cycle sees
    it again. An outage is not a mismatch, and a condition whose cure is changing a repository's
    visibility would mislead. At start, #82's rule for a check GitHub did not answer applies
    (exit 1).
11. **What counts as content is any text a run produced or read; structured fields are not.**
    A record's item id, cost, outcome and exit code stay, so the ledger stays whole.
12. **The rules live in a new capability, `visibility-guard`.** *Rejected:* `lore-store`, which
    #212 names for its startup refusal. The guard reaches discovery, execution and `igor
    doctor`, not only the store's configuration.
13. **A pull request whose run's records were written without content names no transcript.**
    The code on `main` links the transcript in a pull request's body only where the store is
    public, since only then can the pull request's readers open it. Where a store turns public
    during a run on a private repository, decision 7 writes no transcript, so the link would
    point at nothing. Decision 7 says how the body is kept from naming one.

The questions still open are in `design.md`.

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

- `task-execution`: *Transcripts and outcomes are captured to the state branch* writes no
  transcript for a run whose content the guard withholds.

## Impact

- **Archive order:** after the changes it builds on, above. Issue #204 holds the whole order.
  `lore-search` (#216) modifies *Transcripts and outcomes are captured to the state branch* too,
  so it must build on this change and restate that requirement from this change's text.
- **Code:** the start path in `src/cli.ts` (`actAsApp`), the cycle in `src/loop.ts`, the
  state-branch writes and the pull request body in `src/execute.ts`, `scopeOf` in
  `src/conditions.ts`, and `igor doctor`'s checks once #113 builds them.
