## Decisions

- **The log is written before the run's ledger row, which names it only once written.**
  Execution takes the run's time first and passes it to `appendRecord`, so the row and the log's
  path share one time. The path, `-2` suffix included, is known when the row is appended, and a
  failed log write leaves a row that names no log.
- **No tool call, no log.** A run whose steps made no tool call has nothing to audit, and an
  empty file would only add a path to the state branch.
- **A long output's cut comes after its exit code is read.** The entry holds the code in its own
  field, so the cut may drop the `Exit code <n>` prefix without losing it.
- **Labels follow the skill a step serves.** A model call `signed-publishing` (#153) runs for its
  bug-hunter step, such as a triage of the step's findings or a further iteration, is labelled
  `bug-hunter`. One it runs for its prose pass, such as the pass's cold read, is labelled
  `prose`. Every worker pass, a second one included, is labelled `worker`. A new label per step
  would make `review-evidence` (#190) and an auditor learn each step #153 adds.
- **The measurements behind the exit code and the merged output** are Rationale entries in
  `openspec/specs/task-execution/decisions.md`.

## Open Questions

1. **For Adam: should a private store keep commands' output at all?** Decision 3 settles that an
   entry is the same in every store the visibility guard lets the log reach, and the spec keeps
   output; this asks whether a private store should get output at all. A private store is
   readable by its own collaborators, who need not be able to read the worked repository. They can read the
   output of what the worker ran there, `cat` of a private file included, as they can already
   read the worker's closing summary. The alternative is to treat a private store whose
   collaborators are not all readers of the worked repository like a public one, which needs a
   collaborator comparison on every write.
2. **For Adam: redaction coverage.** Should a public store keep a public repository's commands'
   output whole? Redaction matches the credentials the Igor (the running agent that starts the
   worker) holds, and GitHub and Anthropic token shapes. A command can print a secret the Igor
   never held, such as an AWS key from `~/.aws/credentials`, or `CLAUDE_CODE_MESSAGING_TOKEN`, which Claude Code sets itself. The log
   keeps such a secret as printed.
3. **For Adam: should a log also be withheld where the item's tracker is private?** The tracker
   is where the item comes from, such as Linear. `visibility-guard` compares repositories only,
   and a command or subagent prompt kept whole can quote a private Linear issue's text into a
   public store. `visibility-guard` lists the same question.
4. **For #216's author, with Adam: which rule governs a flagged run's log?** `lore-search` (#216)
   withholds a run's transcript where the run met a question #216 flags as sensitive, and keeps
   only each call's tool name, command name and exit code in that run's action log. This change
   keeps every entry whole. #216's proposal also describes a `tools-only` tier, a reduced log for
   public stores, which this change does not have.
5. **Unmeasured: what a result carries** (tasks 1.2 and 1.3). Whether Read, Edit and subagent
   results carry an error flag and output text is unmeasured; the spec records no error status
   where there is no flag. A shell call run in the background returns a result that is not an
   error, so it is recorded as exit 0 although its command has not finished. Which tools write
   files, beyond those the spec lists, is unmeasured too. An unlisted one keeps its input, cut to
   1,000 characters, so its entry may hold up to 1,000 characters of what it writes.
