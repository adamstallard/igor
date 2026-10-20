## Decisions

**Decided by Adam:**

1. **Checks are declared per repository, in a `repos` map in the org base, `roles/org.yaml`**
   (Adam, 2026-10-18, on #154). `repos` maps a repository, as `owner/name`, to the list of
   exact command lines Igor runs on every change to it, under `checks`, and to their time
   limit, `check_minutes`. Every role with that repository in its `sources` gets the same
   checks; a repository with no entry gets none. Only the org base may name `repos`; no role
   key declares a check. *Rejected:* a `checks` key on each role, accumulating down inheritance.
   Checks belong to the repository, not to whichever role touches it, and the one lore
   repository, which holds every role file, serves many code repositories with different
   checks.
2. **A failed check goes back to the worker once** (Adam, 2026-10-18). A round is one pass
   through every check of the repository. Where any check of the first round fails or times out, the loop starts the worker a second time in the same tree, giving it each such
   check's command, result, exit code and the end of its output, and runs every check again on
   what that run leaves. Where a check still does not pass, Igor publishes a draft pull request
   that names each check that failed. *Rejected:* publishing a draft at once, which hands a
   reviewer a failure the worker could often have fixed; and retrying until the checks pass,
   which has no bound on cost.
3. **A draft is within `pr`** (Adam, 2026-10-13). A role whose `allow` lists `pr` and not
   `draft-pr` still gets a draft when a check still fails. `allow` says what the work may
   become, and a draft is a pull request not yet ready. *Rejected:* opening the pull request
   ready because `allow` lists only `pr`, which presents failing work as ready for review.
4. **Checks run after #153's staging and signing** (Adam, 2026-10-13), so they test the tree
   that is published. #153 (`signed-publishing`) signs every commit Igor pushes other than a
   merge; its prose pass, a model step, may edit docs and comments before it signs. The second
   run's changes become a second signed commit before the checks run again (decision 10). A
   conflict resolution is a merge and carries no signature: Igor stages the merged tree in the
   clone the worker worked in, and the checks run on that. Where this change is built before
   #153, nothing is staged or signed, the checks run once the loop has read the changes, and
   both runs' changes are published as one commit. *Rejected:* checks before signing, which test
   a tree the prose pass may still change.
5. **Which account a check runs as follows the command that started the Igor** (Adam,
   2026-10-17). Under #175 (`worker-user`), `igor serve` always runs its worker as a separate
   worker user and `igor run` never does, so a check runs as the worker user under `serve` and as
   the Igor's own account under `run`. Under `run` a check can read the Igor's credentials, such
   as its GitHub App key; so can the worker that wrote the code the check runs, and #175 accepts
   that for `igor run`, the one-shot command for development. *Rejected:* checks as the Igor's
   own account under `serve`, which hands repository code the Igor's App key and the tokens of
   every seat it holds; and building this change before #175, which would leave #175 two starts
   of repository code to move to the worker user, the worker's and the checks', instead of one.
6. **A pull request opened after a lost claim requests no reviewers**, even with a failed check
   (Adam, 2026-10-13). *Rejected:* requesting them anyway, which asks people to review work the
   Igor no longer holds the issue for.
7. **Checks run before every later push of the worker's changes onto an existing pull
   request**: a conflict resolution, gate two's push under #150, and each revision answering a
   reviewer (Adam, 2026-10-13). Once the push is published, a comment with a fixed heading
   reports the result, and a still-failing check returns the pull request to draft. The comment
   is posted only on a repository that declares checks. A clean merge the code host makes with
   no worker runs no checks. *Rejected:* checking only the opening run, which leaves gate two's
   implementation untested; reporting only through the table #190 rebuilds in the body after
   every push, which adds nothing to the pull request's timeline for a watcher to see; and a
   comment on every push of a repository with no checks, which says nothing.
8. **The checks' result is written only into #190's evidence table**, in #190's wording, with
   each failed check's output in the block #190 lays out under the table (Adam, 2026-10-13). The
   comment in decision 7 is the one exception. *Rejected:* a line of this change's own in the
   body, which would give the same result two wordings and two places.
9. **This change builds and archives after #188 (`keep-action-log`) and #190
   (`review-evidence`)** (Adam, 2026-10-13). It also follows #175, under decision 5, and #179,
   whose sweep it relies on (*Impact*). #153 may land before or after it. Issue #204, the only
   place the whole archive order is stated, lists #188, #190 and then this change, all after
   #175 and #179 (Adam, 2026-10-19).
10. **The second run's changes are a second commit, on top of the first run's signed commit**
    (Adam, 2026-10-19, on #153's *For Adam* 20). Where #153 is built, the first run's changes
    are a signed commit before the first round runs (decision 4). The second run's edits become
    a second commit on top of it. #153's steps, bug-hunter and the prose pass with its cold read,
    run on that commit's diff alone, and it carries trailers of its own. The second round runs on
    the second commit's tree. #153 (`signed-publishing`) sets out the steps; this change says
    only when the second commit is made. *Rejected:* restaging both runs' changes as one commit,
    with every step from bug-hunter on run again over the whole of it, as #153 had recommended.
11. **Role-level checks wait until a role needs them** (Adam, 2026-10-19). #154 proposed on
    2026-10-01 that a role could add checks to its repository's list or drop some. Decision 1
    gives a role no key for either, and this change adds none. A later change can add such a key
    without amending any rule here, since every rule here reads the repository's list.
12. **A later push whose checks all pass marks the pull request ready again** (Adam,
    2026-10-19), but only where Igor's own failed check made it a draft, the role's `allow`
    lists `pr`, and the claim is held. A draft a person made, or one a role limited to
    `draft-pr` opened, stays a draft.
13. **#190's Tests row names the commit its checks ran on** (Adam, 2026-10-19), so a reviewer
    sees when the head has moved past it, as after a clean merge the code host makes with no
    worker, where no check runs. That is #190's to write (*Reported to other changes*).
14. **Under `igor serve`, the worker user restores the tree before the second run** (Adam,
    2026-10-19), from the tree object #175 records before the checks (#175's *The Igor
    publishes the tree it recorded before the checks*), which the worker user can read and
    cannot change. Igor's own account cannot remove what a check wrote inside a directory the
    worker user made. Under `igor run` the restore runs as Igor's own account, as the checks
    do.

**Proposed, for Adam to approve:**

15. **A check is an exact command line, run as its words with no shell, and a role that may open
    a pull request is refused when its `commands` does not permit a check of a repository in its
    `sources`.** The reason: without it, the loop would run on the role's behalf a command the
    role may not run. A role whose `allow` lists neither `pr` nor `draft-pr` runs no check and
    needs no such permission.

    Two costs, for Adam to accept. First, a command granted for a check is one the worker may
    also run while it works, and a command the worker runs can read the seat's token through
    the worker's `claude` process (#175's measurement 6.4). A check the loop runs after the
    worker exits cannot. Second, comparing a check line with a `commands` entry is a prefix
    test on whole words. `docs/architecture.md` rules out any such test between two `commands`
    entries, where a role narrows what it inherits only by repeating an entry verbatim, because
    a test that lets one wider pattern through lets `*` through. A check line is no pattern: it
    can hold no `*` and no shell character, so the test cannot widen anything.

    A line
    holding any of ``; & | < > ( ) ' " \ $ ` * ? [ ] { } ~ # !``, a tab, a newline or two spaces
    in a row, or beginning or ending with a space, is refused at load. So `npm test && curl …`
    cannot pass as a line `npm test:*` permits, and `npm test src/*.ts` cannot pass a `*` its
    author meant a shell to expand.
    *Rejected:* running every `commands` entry, since those are permission patterns, not command
    lines: `git log:*` is no check, and `npm test:*` names no single line to run. Also rejected:
    running each line through `sh -c`, under which the permitted-by-`commands` rule means
    nothing.
16. **Each round of a run's checks gets the full `check_minutes`, a time limit of its own:** a whole number from
    1 to 60, default 15, set on the repository's entry beside its checks, since how long a
    repository's tests take is the repository's property. 15 and 60 are starting points to tune
    against observation, not derived values. At the limit the running check is killed and
    recorded as timed out, and the rest as not run. *Rejected:* a fixed constant, which a
    repository with slow tests cannot change; no limit, under which a hung test holds the run and
    its tree with no end; and a role setting, which would let two roles give one repository's
    checks different limits.
17. **Checks run only on work the loop would publish:** after it reads the changed paths and
    their contents, reads the claim, and applies every refusal that reads only the changes
    (`allow`, path names, conflict markers, undeclared reverts, and gate one's drop of everything
    outside the specification, whose paths are restored before the checks). The second run's
    changes pass the same refusals before the second round. The claim is read again when the
    checks end. A worker stopped, or killed for a limit before reporting a result, runs none. *Rejected:* checks before
    those refusals, which spend a round of checks and a second model run on work that is then
    refused; and checks before the read, which would publish what the checks write, such as test
    snapshots and build output.
18. **A check's output is redacted, cut to its last 1,000 characters, and escaped,** both where it
    is published and where it goes back to the worker. The worker's prompt marks an item's
    untrusted text with an opening and a closing delimiter; the failed output is placed between
    them in the same way, with every occurrence of the closing delimiter in it escaped, so a
    check cannot end the untrusted span and write instructions after it. Redacting first means a token the cut would
    split is still found. The loop keeps only the last 64 KiB of a check's output while it runs,
    so a check that prints without end cannot fill the Igor's memory.
19. **Before the second run, the tree is restored to the changes read before the checks, and the
    outbox is emptied and given back the first run's declarations.** The outbox is the directory
    beside the tree where the worker writes its declarations, files such as `reverts.json` that
    state what its change discards; under `igor serve` it also holds #175's copy of the git
    index, which execution makes again. Where #153 is built, the restored changes are the first
    commit's tree, so the second commit's diff holds only what the second run changed. Nothing
    the first round wrote, such as a rewritten snapshot or a declarations file, is then read as
    the second run's work, and a resolution's declared revert survives. Files git ignores, such
    as installed dependencies or a coverage report, stay: execution never reads them as changes, and the
    second run may need the dependencies. *Rejected:* removing ignored files too, which would
    make the second run reinstall dependencies.
20. **A lost claim, found before, during or at the end of the first round, starts no second
    run.** The round
    runs to its end, and the work is offered under *Work finished before a claim is lost is
    offered, not discarded*, with that round's result. A claim found lost during the second run
    or the second round stops neither, and the work is offered with the second round's result;
    where #153 is built, none of #153's model steps runs once the loss is found, and #153 says
    how that work is offered.
    *Rejected:* a second run after the claim is lost, which spends the seat on an item the Igor
    no longer holds.
21. **A second run that cannot finish keeps the first run's work.** It passes the budget gate as
    any run does. In five cases the loop publishes the first run's changes, as a draft with the
    first round's result and the first run's summary: the gate refuses the second run; the second
    run exits with an error; it is killed for a limit; a refusal refuses its changes; or #153
    refuses to commit them, as when their signing fails both attempts. Where #153 is built, that
    publishes the first commit alone; on a later push, Igor pushes it and returns the pull request
    to draft. A second run killed after reporting its result has settled, and its work goes on to
    the second round. Where the item is stopped during the second run, nothing
    is published. *Rejected:* publishing nothing on a failed retry, which discards work the worker
    finished.
22. **After a conflict resolution, the second run's changes are a second commit on top of the
    merge,** signed by #153's steps on its own diff, as decision 10 has it after any other run.
    The merge itself still carries no signature (decision 4). Where this change is built before
    #153, they join the merge commit, since neither commit would be signed. *Rejected:* adding
    them to the merge commit once #153 is built, which leaves a fix for a failing check, code
    that resolves no conflict, unsigned and unhunted.
23. **The pull request's summary is that of the last run whose changes are published:** the
    second run's, except under decision 21, where only the first run's are. The execution row
    keeps both rounds' checks.
24. **A check gets the worker's environment without its model login,** both
    `CLAUDE_CODE_OAUTH_TOKEN` and `ANTHROPIC_API_KEY`. A repository whose tests call Anthropic's
    API gets no key from Igor. Under `igor run` a check can still read a login `claude` stored in
    the Igor's own home, as decision 5 accepts for the App key there. *Rejected:* passing `ANTHROPIC_API_KEY`, which hands repository
    code the key the seat spends.
25. **A `repos` key matches a source's repository ignoring case,** as GitHub's names do, and two
    keys that differ only in case are refused. *Rejected:* an exact match, under which `Org/Web`
    silently gives `org/web` no checks.
26. **Every check of a round runs, even after one fails,** so the worker and the reviewer see every
    failure at once. *Rejected:* stopping at the first failure, which hides the other failures from
    the one second run the worker gets.
27. **A second run that undoes every change publishes nothing,** as any run that changes
    nothing, even where the first run's work failed a check: where the tree it leaves equals the
    base, or on a later push the pull request's head, neither run's changes are published. A
    second run that changes nothing the first run left makes no second commit, and the second
    round runs on the first run's tree. On a later push, publishing nothing means the
    reviewer's requested revision is not pushed; the reviewer learns of it as for any revision
    that leaves nothing to publish, which under #150 is a reply on the pull request. *Rejected:*
    publishing the first run's failing work, which the worker has just undone.
28. **The execution row keeps, per round, each check's command, result (`passed`, `failed`,
    `timed-out`, `not-run`), exit code and seconds,** never its output. A check that could not
    start, or that a signal ended other than at the time limit, is `failed` with no exit code.
    The one row holds both worker runs, each with its cost and transcript, and records whether
    Igor opened or returned the pull request to draft for a failed check, which decision 12
    reads.
29. **Where the code host refuses a draft, the pull request is opened ready,** and its Tests row says
    Igor could not open it as a draft (task 0.5). *Rejected:* publishing nothing, which loses
    the work for a host setting.

**Still open:**

- **Which account restores gate one's dropped paths to the base before the first round**
  (for Adam). Decision 14 settles the restore before the second run only. The same limit holds
  here: under `igor serve` Igor's own account cannot remove a file the worker user made inside a
  directory it made. *Recommendation:* the worker user restores them, from the base's tree, as
  decision 14 has it restore the tree from the recorded one.
- **A role whose `allow` lists `draft-pr` but not `pr`, where the code host refuses a draft**
  (for Adam). Decision 29 then opens the pull request ready, which that role's `allow` does not
  permit. *Recommendation:* publish nothing for such a role, and record why; open it ready only
  where `allow` lists `pr`.
- **Whether the code host opens a draft on every repository Igor works, and how a refusal
  shows**, is not measured (task 0.5). Until it is, decision 29 cannot tell a refused draft from
  any other failure of the create call.
- **Whether GitHub's timeline names who converted a pull request to draft** is not measured
  (task 0.7). Decision 12 relies on it to tell Igor's draft from a person's. Where it does not,
  a later push leaves every draft a draft.
- **Findings of the 2026-10-19 consistency read, for the next pass** (the author's):
  - Decision 3's reading that a draft is within `pr` is not in the in-force *Execution SHALL be
    confined to the artifact types the role's effective `allow` list permits*, which this
    change does not modify.
  - The delimiter around a check's output, and how its closing delimiter is escaped, are not
    defined: an item's text is delimited with `<item>` on `main` and never escaped. The task
    should carry the wording verbatim.
  - Five SHALLs have no scenario: the first round on the signed commit's tree, the new copy of
    #175's git index in the outbox (decision 19), the two cases where #153 is not built, and `repos` naming a repository no source
    names.
- **How #175's wrapper reports a check whose program is missing under `igor serve`** is not
  measured (task 0.6). Until it is, such a check is recorded as failed with whatever exit code
  the wrapper gives.
- **Whether the GitHub App may call `convertPullRequestToDraft` and
  `markPullRequestReadyForReview`** is not measured (task 0.4). Where it may not return the pull
  request to draft, the comment after the push says Igor could not, in place of the Tests row's
  claim that the pull request is a draft. Where it may not mark it ready, the pull request stays a draft and the
  comment says Igor could not mark it ready.

**Reported to other changes,** not edited here:

- **#153 (`signed-publishing`):** its text should record Adam's answer to its *For Adam* 20,
  which decision 10 here follows.
- **#190 (`review-evidence`):** its Tests row names the commit its checks ran on (decision 13).
  *Impact* lists three more places #190 needs amending.
- **#175 (`worker-user`):** its decision 17 says the second run's tree "is recorded, checked
  and published the same way". Under decision 10 it is published as a second commit, on top of
  the first run's.

## Why

The loop runs no test or lint command (#186). The worker's system prompt lists the role's
commands and leaves testing to the worker (`src/execute.ts:169-182`). The pull request body is
the worker's own summary (`prBody`, `src/execute.ts:1169-1185`). So the only evidence that a
change passes is the worker saying so. Igor also never runs `git commit`, so a repository's
pre-commit hooks never run on its changes (#154). This change runs no hooks: a repository gets
what its hooks run only by declaring the same commands as checks.

## What Changes

- A new org-base key, `repos`, mapping each repository to its `checks` and `check_minutes`.
- After the worker exits and its changes are read, the loop runs the repository's checks in the
  worker's tree, as the worker's user, with the worker's environment less its model login,
  within a time limit for
  each round, re-reading the claim while they run.
- Where a check does not pass, the worker runs once more with the failures, and the checks run
  again. A check that still does not pass opens the pull request as a draft.
- The last round's result fills the Tests row of `review-evidence`'s evidence table: each check
  passed, failed with its exit code and the end of its output, timed out, or was not run; or the
  repository declares none.
- Each execution row records every round's checks: command, result, exit code and duration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `role-config`: the org base's `repos` map, the one key only the org base may hold, and the refusal of a role whose `commands` does not permit its repositories' checks.
- `task-execution`: the loop runs the checks, sends a failure back to the worker once, and
  publishes and records the result.

## Impact

- **Depends on `worker-user` (#175).** Under `serve` the checks use #175's code for starting a
  process as the worker user, killing it, and removing what the worker user wrote. Under `run`
  they run as the Igor's own user, as the worker does.
- **Built after `concurrent-instances` (#179).** Its sweep removes leftover trees by rank, not by
  age, so a tree held through the checks and the second run needs no change to the sweep.
- **Overlaps `review-evidence` (#190)**, which owns the table, its Tests row wording, and the
  output block under it. #190 needs amending in three places. It words the checks as the role's
  (`not checked: the role declares no checks`, the role's `check_minutes`, the order the role
  declares them), where under decision 1 they are the repository's. It says this change writes
  only into its table, while decision 7 adds a comment after a later push. And its failed Tests
  row says the pull request is a draft, which is false where GitHub refuses the conversion
  (task 0.4) or the draft (task 0.5); it needs a wording for that case.
- **Overlaps `keep-action-log` (#188)**, which defines *credential redaction* and builds its
  function.
- Code: `src/role.ts`, `src/execute.ts`, and the GitHub adapter (returning a pull request to
  draft). Docs: `README.md` roles section, `templates/org.yaml`.
