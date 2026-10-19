## Context

Igor's worker edits files in a throwaway clone and never commits. Deterministic code builds the
commit remotely through GitHub's Git Data API (`createBranchWithFiles`) and opens the pull
request. So the prose and bug-hunter skills' usual safety net, a hook that reads the reflog
after `git commit`, never sees an Igor commit. Igor has to run the checks itself.

Issue [#139](https://github.com/adamstallard/igor/issues/139) holds the full reasoning.

## Decisions

### A model step signs; the code verifies

Each half does what the other cannot.

- **The model step runs the checks**, because running `prose check` or `prose sign` prints the
  pass and the rules to the model while it writes. A trailer or footer is the check's output, so
  a step that skipped the check has nothing to return.
- **The code verifies**, because the model's word is not proof. A step can return a footer
  from an earlier draft, or text edited after signing; `prose verify-post` and
  `prose verify-staged` catch both.

No model step commits, pushes or posts. No code step writes prose.

### A commit is signed three ways, once, at the end

- **Bug-hunter's** trailer binds the tree (`Bug-hunter-Tree:`).
- **The prose pass's** trailer binds the staged tree and the message together
  (`Prose: ✓ <tree>:<message>`).
- **The issue title** is the subject, because a person wrote it. The prose pass is given the
  title; the code checks it was kept.

The code compares both signed trees with the sha that `POST /git/trees` returns, which is known
before the commit exists. Igor never rebases its branches, so that hash still matches whenever
the commit is checked later.

**Decided by Adam, 2026-10-17 (on #175): for a commit, the steps edit, and the trailers are made
once.** This narrows *A model step signs; the code verifies*, above: for a commit, neither step
signs while it runs. Bug-hunter runs, then the prose pass, which also rewrites the code comments
bug-hunter's fixes added. After the last model step exits, Igor stages the change once, in its
own index, and every trailer is created against that tree, the one Igor records and publishes.
So the prose pass's edits are always in the tree the trailers name. Under #175 (`worker-user`)
the steps run as a worker user that cannot write the git directory, which rules out a step
staging for itself.

**Decided by Adam, 2026-10-17, answering questions raised on #175: Igor runs the signing
calls, and bug-hunter triages the prose pass's diff.** Each step ends by reporting its pass
result. Bug-hunter's is its result block: the `Bug-hunter:` value, such as `1 iteration, 1 bug
fixed`, which becomes that trailer, and any open decisions. The prose pass's is the pass token
its first `prose check` call printed. Bug-hunter then runs its usual triage on the prose pass's
diff: a diff that touches only comments or docs is skipped, and anything else gets one more
bug-hunter iteration. Igor then stages once and runs both signing calls itself: prose's second
`prose check` call with the prose pass's token, and bug-hunter's minting script, which writes
`Bug-hunter-Tree:` for the staged tree (task 0.10 confirms it can run as a separate call). The
scripts come from the root-owned skills directory (#174), so Igor's service user runs nothing
the worker wrote. The token is what shows the model ran the call that prints the rules: prose's
second call accepts only a token its first call issued. `Bug-hunter-Tree:` names the staged
tree, which bug-hunter reviewed in full apart from prose-pass edits its triage judged to touch
only comments or docs.

**Accepted by Adam, 2026-10-18: no second prose pass after the extra iteration.** Comments that
iteration writes reach the tree after the prose pass, so no prose pass reads them, and the
`Prose:` trailer Igor then makes vouches for a tree holding comments no prose pass read. The
prose pass is not meant to change code, so a prose-pass diff that needs another hunt is an edge
case, and Adam judged the gap not worth a second prose pass.

Two mismatches can still refuse a commit, and neither goes back to a step, because Igor's code
made both bindings. The tree the trailers name, from Igor's clone, can differ from the tree the
Git Data API builds for the commit (item 3, task 0.4). The message Igor commits can differ from
the message the `Prose:` trailer hashes. Either is recorded as the item's failure.

Merge commits carry no trailers: `resolve` and the server-side `Merge X into Y` commits are
Igor's own mechanics, and the skills' checks skip merges.

### A failure goes back, a bounded number of times

A failed check returns the text to the step that wrote it, with the reason ("the footer does
not verify", "prose refused the pass token"). The step redoes its check: for a post it signs
again, and for a commit the prose pass runs its first call again and reports the new token. A
commit's tree and message are bound by Igor's code, not by a step, so a tree or message
mismatch goes back to no step: it refuses the commit and is recorded as the item's failure.

The bound is two attempts, the same for every role. Without a bound, a step that keeps failing
spends the seat's budget on one item. A per-role setting can be added later if a role needs one. After the last attempt the code
publishes nothing and records the failure, with each reason, to the state branch.

### Text the code assembles is not signed

The rule covers text a model writes. Handoffs, stop receipts and claim messages are assembled
by the code from recorded state; the code's authors wrote them, and they are reviewed as code.

A handoff is needed exactly when a model call may be impossible: the budget is exhausted, or
the model step itself failed. Requiring a model step to sign it would leave an Igor silent on
its claim in the very case `graceful-handoff` exists for, so that capability stays as it is.

### What a signature proves, and what it does not

- **Proves:** the check's script ran over this exact text, or this exact tree, and nothing
  changed afterwards.
- **Does not prove** that the pass or the hunt was done well. Igor running the steps itself is
  what guarantees they ran.
- **Does not prove who signed.** The footer is a hash, not a key: anyone can run `prose sign`.
  It shows the text is unchanged since signing, which is all the posting code needs to know.

## Decided questions

Adam accepted the recommendation on each question below on 2026-10-11. Items 1 to 4 were raised
in review on 2026-10-04.

### Which roles: a role lists the skills its worker uses

**Decided by Adam, 2026-10-11.** The opt-in is a list of skills, not a switch for "posts" and
"commits". A role declares `skills: [<name>, …]`, the pinned skills of #174's `igor` plugin its
worker uses. The org base may set the list for every role, and a role may add to it;
inheritance adds and never removes, so a skill the org requires stays required. A name that is
not installed under `skills_dir` is refused at load.

Igor's code verifies per listed skill. `prose` means every model-written post needs a valid
`prose ✓` footer and every commit a matching `Prose:` trailer. `bug-hunter` means every commit
needs a `Bug-hunter:` trailer bound to the staged tree. A role that lists neither publishes as
it does today. Each skill's check is written in Igor's code, because only these two exist; a
configurable table of checks would be configuration for two rows.

Which skills an org lists for every role is its own choice, informed by the cost task 4.1
measures.

### 1. Igor opens the prose hook's gate for its worker

**Decided on 2026-10-11, and open again:** under #174's reset nothing in a worker checks the gate
this item opens (*Interactions*, below), so whether Igor runs `prose start` at all is listed for
Adam in the proposal. Where it runs, Igor runs `prose start` for the worker's session id itself,
before the worker starts. *Rejected:* leaving the worker to open the gate with its own first call, which spends
a turn, and where the worker's first act is a file write, has that write blocked by the gate
described below.

If prose's hooks are installed for the user Igor runs as, the first-write gate blocks a
worker's first file write until prose's first call has run in that session. The gate is per
session: it opens once `prose start` or a first `check` or `sign` has marked the session id.
`prose.py start --session <id>` marks a given session, and `claude -p` accepts
`--session-id <uuid>`. So Igor opens the gate itself:

1. It generates a uuid for the worker.
2. It runs `prose.py start --session <uuid>` with reader goals for the item's commit and
   description, which marks the session and prints the rules. What those goals are is not yet
   defined; the proposal lists it for Adam.
3. It writes those rules to a file in a directory Igor owns, which no worker user can write, and
   passes it with `--append-system-prompt-file`.
4. It starts the worker with `claude -p --session-id <uuid>`, its prompt on stdin.

No prompt text, rule or goal goes on a command line (proposal, decision 15), since every user on
the server can read a process's `/proc/<pid>/cmdline`. `prose start` takes its goals only as
`--goals` today, so task 0.13 finds or adds another way to pass them, and these four steps are
not built until it has.

Nothing depends on the model running a step, and the role needs no permission to run prose.
The mark lives under `$XDG_STATE_HOME` or `$HOME`, and the worker's environment is given
rather than inherited, so `start` runs with the same values the worker gets.

**Not measured:** that a fresh `claude -p --session-id <uuid>` reports that id as `session_id`
in its hook payload. Task 0.3 measures it.

**Interactions.** `--bare` would skip hooks, and the gate with them, but it also drops the
seat's OAuth token (#144), so it is no way around the gate. `pinned-skills` (#174) loads skills
as the `igor` plugin with `--plugin-dir`; the plugin declares no hooks and the install wires
none, so the plugin itself turns on no first-write hook. And #174 resets the home every model
step runs in, the worker's and the later prose and bug-hunter steps', to a template whose
`settings.json` holds no hooks. So in a worker the gate never runs, whatever is installed for the
user Igor runs as, and `prose start` opens a gate nothing checks.

### 2. The worker is granted the scripts it signs with, by path

**Decided:** a role that lists `prose` or `bug-hunter` is granted the commands its skills
need, from the list below, by path into the
pinned skills directory that `pinned-skills` (#174) installs. Where Igor's own code can run a script instead, as in item
1, it does, and the role needs no grant for it. *Rejected:* granting the scripts by bare
name, which would run whatever copy is first on the worker's `PATH`.

`prose check` and `prose sign` are shell commands the model step runs, and the `commands` list
in `roles/org.yaml` of the `igor-lore` repository, which holds this organization's shared role
configuration, allows neither without this grant.

| Step | Run by | Why |
| --- | --- | --- |
| `prose check -F <msg>`, the first call, given its goals | model | run on the step's draft message, it prints the rules and a pass token before the model rewrites; the step reports the token (proposal, decision 12) |
| `prose sign`, the first call, given its goals, then `prose sign --pass <token>` with the token the first call printed | model | the first call prints the rules and a token before the model writes the post, and the second signs it. Neither first call may take its goals on its command line; task 0.13 finds how they take them |
| bug-hunter's run, and its triage of the prose pass's diff | model | the hunt is the model's work; the step reports its result block |
| `prose start --session <uuid>` | code | item 1 |
| `git add -A` once, after the last model step exits | code | only Igor's code can write its own index (task 2.1) |
| `prose check -F <msg> --pass <token>`, the second call, and bug-hunter's minting script | code | they mint against Igor's staged tree, which the steps cannot write (proposal, decision 12) |
| `prose verify-post`, `prose verify-staged` | code | verifying is the code's half |

So the grant, where `<skills>` stands for `<skills_dir>/skills`, the `skills/` folder of the
pinned directory (#174):

- `python3 <skills>/prose/scripts/prose.py check`
- `python3 <skills>/prose/scripts/prose.py sign`

The regression tests bug-hunter writes are expected to run under the `npm test` and `npx vitest
run` entries the role's `commands` list already holds. Task 0.15 measures it; if they do not,
the grants come back to Adam before building.

### 3. The clone's staged tree is measured against the API's tree before either is trusted

**Decided:** measure first (task 0.4), and if the two trees can differ, sign and verify against
the API's tree instead of the clone's index. *Rejected:* assuming the two trees agree, which
fails silently on the first executable or deletion where they do not.

`prose verify-staged` checks the git index, but Igor builds its commit through the Git Data
API (`createBranchWithFiles`) and never stages in its clone. Comparing the signed trees with
the sha `POST /git/trees` returns holds only if Igor stages in the clone (`git add -A`, task
2.1) and `git write-tree` there equals the API's tree sha, with the same modes, deletions and
symlinks.

The modes are where they can differ: `createBranchWithFiles` writes an executable file as
`100755` and every other file as `100644`, so the two trees agree only if the clone's modes map
onto those two exactly. The measurement stages a change in a clone, runs `git write-tree`,
builds the same tree through the Git Data API, and compares the shas, with a deletion and an
executable file among the changes.

### 4. Igor's posting code refuses an unsigned post

**Decided:** a test that Igor itself refuses a post without a valid footer, with no hook
installed (task 1.4). *Rejected:* relying on prose's posting hook, which guards only posts made
from a Claude Code session.

Prose's posting hook guards only posts made from a Claude Code session. Igor posts from its
own code, so `prose verify-post` in Igor's posting code is the only guard.
