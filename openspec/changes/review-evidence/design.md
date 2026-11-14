## Context

The rules of this change are in its proposal and spec deltas. This file holds the readings
chosen where the spec's wording allowed two, each with its reason. No person chose them; the
pull request lists each one for the reviewer to confirm or overturn.

## Decisions

1. **An invalid skim threshold in the org base refuses every role inheriting it, even a role
   that sets a valid value of its own** (*A role sets the size a pull request may have and
   still be skimmed*). The in-force *A role file refuses a key nobody reads* treats a fault in
   the org base the same way: every inheriting role is refused, so no role quietly runs on a
   setting its author got wrong.
2. **A sentence end is a `.` followed by a space or a line break, and the cut keeps the `.`**
   (*The worker's summary is capped at 700 characters*). That is where `prBody` cuts today
   (`src/execute.ts:1190`), and this change turns the existing cap into a requirement without
   altering it.
3. **`prose verify-post` on a signed description is #153's rule, for the roles whose `skills`
   lists `prose`** (*The worker's summary is capped at 700 characters*). The pushed requirement
   named the roles whose signed description replaces the summary as those listing `prose`, and
   the roles `verify-post` covers as "a role under #153", which read as two sets. They are one
   set, since #153 checks a role by its `skills` list. The requirement adds no rule of its own;
   task 2.3 makes the call where the body is built, as #153 requires of the code that
   publishes.
4. **A summary line that contains the table's heading is removed whole**, not only a line that
   is exactly the heading (*A summary cannot pose as evidence*). The scenario of that name
   already says "contains", and a line that quotes the heading inside other text can pose as
   evidence just as well. Task 2.3 drops such lines.
5. **A revision replaces a worker's summary with the revision run's, capped, and the transcript
   pointer follows the new summary; every other publish keeps the summary and the pointer**
   (*Each publish onto a pull request rebuilds its evidence section*). On a revision #153
   rewrites a signed description, and decision 23 of `loop-verifies-commands` (#189) publishes the
   summary of the last worker run on a later push,
   so keeping the earlier summary only for roles without `prose` would treat the two kinds of
   role differently for no reason. Whether every later push, not only a revision, replaces the
   summary stays open: see proposal, *Still open*, *Gate two's push*, and #189's question on it
   for Adam, the repository's owner.
6. **The sandbox is the worker's permission check**, not an operating-system sandbox around the
   worker's process, which nothing in Igor records denials from. The check lets the worker run
   only what the role's `commands` permits and reports each call it refuses; the row lists the
   refused shell commands, and a refused call of another tool, such as a file edit, is not
   listed (*The Sandbox denials row
   lists each command the sandbox refused the worker*). That report, `permission_denials` in the
   worker's result (`src/execute.ts:324`), is the only record of denials the loop holds.
   Whether bug-hunter's and the prose pass's denials are recorded stays open: see proposal,
   *Still open*, *The spec itself*.
7. **The Commands run list's cap of 30 is in the requirement** (*The Commands run row counts
   every model step's shell calls*). The proposal decides 30, and the requirement relied on "a
   cap" without saying how many.
8. **A catch-up resolution is a worker's resolution of the conflicts left when the base is
   merged into the pull request** (*The Files changed row gives the published paths and their
   scope*). The in-force *A published artifact is kept mergeable* runs a worker only when that
   merge conflicts, so a clean merge publishes nothing of a worker's and is no resolution.
9. **A role listing `spec-trace` has its worker's standing instructions direct it to the
   skill, with no condition on #153 having shipped** (*A role listing spec-trace directs its
   worker to tag tests*). #153 adds the `skills` key and is built before this change in issue
   #204's order, and without #153 no role has `skills`, so #153 has shipped wherever a role can
   list `spec-trace`. #153 directs no worker to
   use a listed skill (its proposal, *Still open*), so this change gives the direction itself.
   `igor:spec-trace` is the name `pinned-skills` (#174) loads the skill under.

10. **The Spec scenarios row is read from a checkout of the pull request's head that the loop
    makes** (*The Spec scenarios row is read from spec-trace*). The worker's tree is released
    when its run ends (the in-force *A published artifact is kept mergeable*), and only a
    checkout of the head holds exactly what the pull request carries.

## Open Questions

- **Which rule labels a resolution?** A resolution's Files changed row says its push was not
  checked, which *A pull request is labelled skim only when its evidence is clean* makes
  `review: read`, while that requirement's scenario *A resolution keeps the scope condition it
  last met* expects `review: skim`. The proposal records this under *Still open*, *The label*,
  and it is not decided here. Proposal decision 6 rejects making every resolution
  `review: read`, which favours `review: skim`.
- **Does the Igor image carry the OpenSpec CLI that `spec_trace.py report` needs?** The script
  reads scenarios only through `openspec show --json`, from version 1.15.0. Without it the
  Spec scenarios row says `not checked: spec-trace failed`. Task 3.2 measures it.
- **A run flagged under `lore-search` (#216).** #216 keeps only the name of each denied command
  of such a run and forbids its pull request body any excerpt of the worker's result. This
  change's Sandbox denials row lists whole commands, and a signed description is such an
  excerpt. The proposal's *Withheld runs* covers the summary, the transcript pointer and the
  Commands run lines, not the Sandbox denials row's whole commands or a signed description.
- **The label and `allow` under #216.** #216's text of *Only reversible artifacts are
  produced* closes the list of exceptions to `allow` at two, citations and question-branch files, and the
  review label is neither. The proposal's *For Adam* item raises the conflict with the in-force
  text of that requirement.
- **How `spec_trace.py` reads the worker's tree under `worker-user` (#175).** #175 has Igor read
  a file from the worker's tree only when it is a regular file with one link, follow no
  symbolic link, run git with no system or global configuration, and read only after every
  model step has exited. The script's `git grep` and file reads keep none of these rules, so a
  link in the tree could put the text of a credential file on the Igor host, such as a private key, in the Spec
  scenarios row.
- **A revert a person authorised under `answer-a-refused-revert` (#138).** #138 reports such a
  revert exactly as a declared one, naming who authorised it. This change marks the Files
  changed row, and withholds `review: skim`, only for a base change the run declared.
- **The skim keys in role-config's list of settings.** `seat-from-stream` (#143) and
  `directed-asks` (#140) each restate role-config's list of settings merged by override, and
  #140 its list of keys, without `skim_max_paths` and `skim_max_lines`. If either archives after
  this change, its list replaces role-config's without them.
