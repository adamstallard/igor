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

### A commit is signed three ways

- **Bug-hunter** signs the tree it reviewed (`Bug-hunter-Tree:`).
- **The prose pass** signs the staged tree and the message together (`Prose: ✓ <tree>:<message>`).
- **The issue title** is the subject, because a person wrote it. The prose pass is given the
  title; the code checks it was kept.

The code compares both signed trees with the sha that `POST /git/trees` returns, which is known
before the commit exists. Igor never rebases its branches, so that hash still matches whenever
the commit is checked later.

The prose pass runs after bug-hunter, so it also rewrites bug-hunter's comments. If it changes
a file, bug-hunter's tree no longer matches, and bug-hunter runs once more to sign the new tree.
Bug-hunter's triage skips a comments-only change, so that round costs little.

Merge commits carry no trailers: `resolve` and the server-side `Merge X into Y` commits are
Igor's own mechanics, and the skills' checks skip merges.

### A failure goes back, a bounded number of times

A failed check returns the text to the step that wrote it, with the reason ("the footer does
not verify", "the staged tree differs from the signed tree"). The step redoes its check and
signs again.

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

**Decided:** Igor runs `prose start` for the worker's session id itself, before the worker
starts. *Rejected:* leaving the worker to open the gate with its own first call, which spends
a turn, and where the worker's first act is a file write, has that write blocked by the gate
described below.

If prose's hooks are installed for the user Igor runs as, the first-write gate blocks a
worker's first file write until prose's first call has run in that session. The gate is per
session: it opens once `prose start` or a first `check` or `sign` has marked the session id.
`prose.py start --session <id>` marks a given session, and `claude -p` accepts
`--session-id <uuid>`. So Igor opens the gate itself:

1. It generates a uuid for the worker.
2. It runs `prose.py start --session <uuid> --goals "<the item's reader goals>"`, which marks
   the session and prints the rules.
3. It puts those rules into the worker's system prompt.
4. It starts the worker with `claude -p --session-id <uuid>`.

Nothing depends on the model running a step, and the role needs no permission to run prose.
The mark lives under `$XDG_STATE_HOME` or `$HOME`, and the worker's environment is given
rather than inherited, so `start` runs with the same values the worker gets.

**Not measured:** that a fresh `claude -p --session-id <uuid>` reports that id as `session_id`
in its hook payload. Task 0.3 measures it.

**Interactions.** `--bare` would skip hooks, and the gate with them, but it also drops the
seat's OAuth token (#144), so it is no way around the gate. `pinned-skills` (#174) loads skills
as the `igor` plugin with `--plugin-dir`; the plugin declares no hooks and the install wires
none, so the plugin itself never starts the gate. The gate still runs where prose's hooks are
installed for the user Igor runs as, and Igor's own `prose start` above opens it there.

### 2. The worker is granted the scripts it signs with, by path

**Decided:** a role that lists `prose` or `bug-hunter` is granted the commands its skills
need, from the list below, by path into the
pinned skills directory that `pinned-skills` (#174) installs. Where Igor's own code can run a script instead, as in item
1, it does, and the role needs no grant for it. *Rejected:* granting the scripts by bare
name, which would run whatever copy is first on the worker's `PATH`.

`prose check`, `prose sign` and bug-hunter's scripts in caller-commits mode are shell commands
the model step runs, and the `commands` list in igor-lore's `roles/org.yaml` allows none of
them without this grant.

| Step | Run by | Why |
| --- | --- | --- |
| `prose check -F <msg> --goals …` and `--pass <token>` | model | the first call prints the rules and the prose in the change while the model rewrites it |
| `prose sign --goals …` and `--pass <token>` | model | the same, for a post |
| bug-hunter's run and `caller-result.sh` | model | the hunt is the model's work; the script mints over what the run staged |
| `git add` (bug-hunter staging its fixes and tests) | model | part of the run |
| `prose start --session <uuid>` | code | item 1 |
| `git add -A` after the worker ends | code | task 2.1 |
| `prose verify-post`, `prose verify-staged` | code | verifying is the code's half |

So the grant, where `<skills>` stands for `<skills_dir>/skills`, the `skills/` folder of the
pinned directory (#174):

- `python3 <skills>/prose/scripts/prose.py check`
- `python3 <skills>/prose/scripts/prose.py sign`
- `<skills>/bug-hunter/scripts/caller-result.sh`
- `git add`

Bug-hunter's tests run under the `npm test` and `npx vitest run` entries the list already holds.

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
