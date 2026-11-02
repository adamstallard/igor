## 0. Order and measurement

- [ ] 0.1 Build and archive this change after #101 (`condition-backoff`), #171 (`seat-files`),
      #113 (`check-a-lore-repository`) and #82 (`stopped-scope-visible`). Issue #204 holds the
      whole order.
- [ ] 0.2 Measure whether a source's query can return an item of a repository other than the
      source's `repo`: on `main`, `src/github-adapter.ts` prefixes every query with
      `repo:<source.repo>`, and `normalizeIssue` sets each candidate's repository from the
      source. Run a query holding a second `repo:` qualifier and record the result in this
      change's `design.md`. Either way, read the candidate's repository from the item's own URL
      or repository field, so the check never trusts the source's `repo`

## 1. Reading a visibility

- [ ] 1.1 Add `visibilityOf(repo)` to `src/github.ts`: `GET /repos/{owner}/{repo}` with the role's
      App installation token, returning `'public'`, `'private'` or `'internal'` from the
      `visibility` field, or failing where GitHub does not answer
- [ ] 1.2 Add `mismatch(store, worked)`: true where the store is `public` and the worked
      repository is `private` or `internal`
- [ ] 1.3 Leave `publicStore` out of the comparison. `isPublic` (`src/github.ts`, which reads a
      repository's `private` flag) and the `publicStore` setting keep their other readers
      (`src/propose.ts`, `src/wiring.ts`)

## 2. The start check

- [ ] 2.1 In `actAsApp` (`src/cli.ts`), after `startApp`'s check that the App can act on every
      repository the role works, and before discovery, compare the
      store with every repository in `role.sources`. On a mismatch, refuse to start, naming the
      private repository and the store: through #82's refusal path (exit 78) for `igor serve`,
      and with a non-zero exit for `igor run`
- [ ] 2.2 A visibility read GitHub does not answer ends `igor serve`'s start as #82's rule for an
      unanswered start check says (exit 1), and ends `igor run`'s with a non-zero exit

## 3. The cycle

- [ ] 3.1 At each cycle, before triage, read the store's visibility once. Read once each
      repository that a candidate comes from, and each repository with an open
      `repo:<owner>/<name>:visibility` condition
- [ ] 3.2 Skip each candidate whose repository is a mismatch: no triage, no claim, no record
- [ ] 3.3 A read GitHub does not answer leaves that repository's candidates unworked for the
      cycle, opens and clears no condition, and is named in the cycle's report
- [ ] 3.4 Add the condition scope kind `repo` to `scopeOf` in #101's `src/conditions.ts`, for the
      key `repo:<owner>/<name>:visibility`, as #171's read-cleared kind: one failing read opens
      it. It stops no scope itself: the skip in 3.2, not the condition, keeps the repository's
      candidates from being worked
- [ ] 3.5 The condition's report names the repository and the store, and its cure: make the store private
      or the repository public

## 4. The write

- [ ] 4.1 Before writing a run's records to the state branch (`src/execute.ts`), read both
      visibilities again. On a mismatch, or a read GitHub does not answer, write the records
      with their structured fields only (item id, cost, outcome, exit code), write no
      transcript, and open the 3.4 condition where the read found a mismatch
- [ ] 4.2 A pull request from such a run names no transcript path in its body

## 5. igor doctor

- [ ] 5.1 Add the start check of 2.1 to `igor doctor`'s checks, invoked per role, never
      re-implemented. Without a role's App key, report it unchecked

## 6. Tests

- [ ] 6.1 Each scenario in `specs/visibility-guard/spec.md` has a test, with GitHub's
      `visibility` answers stubbed: public, private, internal, and no answer
