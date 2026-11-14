## Decisions

The proposal's numbered decisions say how the guard works. This file holds what is still open,
and task 0.2's measurement once it is made.

## Open Questions

1. **For Adam: #212's ranking.** Issue #212, whose rule is settled but has no OpenSpec change
   yet, refuses a start where the lore store is more visible than at least one repository a role
   works,
   ranking private below internal below public. #216 (`lore-search`) writes the same ranking into
   its rule for where a lore citation may go. Both are stricter than this change for an internal
   store serving a private repository, which this change allows. #212 also counts a store whose
   visibility GitHub does not return as public, so with a private source it refuses that start
   as a mismatch, with status 78, which systemd does not restart. This change exits 1 under #82's
   rule for an unanswered check, which systemd restarts, since an outage may pass.
   *Recommended:* when #212 is specified, it changes this change's comparison into #212's
   three-level ranking, and this change's handling of an unanswered store read into #212's, so one
   rule states visibility for the state branch. An internal store would
   then no longer serve a private repository, which reverses the consequence decision 2 states.
   #216 keeps its ranking for citations either way.
2. **For Adam: what a skipped candidate may say.** Decision 4 skips a mismatched candidate before
   triage, posting and recording nothing. Requirements in force expect more of some candidates.
   `work-triage` records every candidate a cycle examined. Under `work-claiming`, Igor posts the
   claim message when a person hands it an item, and posts a stop receipt and removes itself from
   the holder field when a stop is said on a handed-over item. Under `graceful-handoff`, silence
   never follows a claim, so Igor never leaves its own claim held without a word. A skipped candidate does none of these, and this change does not
   modify them. *Recommended:* the skip writes a triage record holding only structured fields, and
   on an item the Igor holds or was handed, Igor releases the holder field with a fixed notice
   naming the visibility mismatch. The triage record holds structured fields on the state
   branch, and the notice is posted in the worked repository, so no content reaches the public
   branch.
3. **For #216's author: where the store's visibility is read.** #216 states its own rule for
   reading the store's visibility from GitHub, and counts a store whose visibility cannot be read
   as public. This change withholds the run's content and leaves candidates for the next cycle
   instead (decisions 7 and 10). *Recommended:* this change owns the reading. #216 cites it, as #188
   already does, and drops its own rule, so in #216 too a store whose visibility cannot be read
   withholds content and leaves candidates waiting, rather than counting as public.
4. **For a later change: `lore-review`'s trust in `publicStore`.** The in-force requirement *A
   public destination refuses privately-sourced entries* still lets the store's visibility be
   declared in configuration, which this change does not trust. *Recommended:* a later change
   has that requirement read GitHub too, as #91 asks.
5. **For #208's author: this check and `lore-pull`.** #208 fetches the lore repository, which
   holds the role files, and lets a process whose newest lore commit fails a startup check start
   on the last commit that passed. *Recommended:* this change's start check is one of #208's
   startup checks, so where a lore commit adds a private source to a role with a public store, the
   process starts on the last lore commit that passed, rather than refusing to start.
6. **For Adam: the watermark passes a skipped mismatch.** The in-force *Watermarks reduce
   reconsideration without governing it* lets the watermark advance over items a cycle skipped,
   so after the cure a skipped item is seen again only once it is updated. *Recommended:* accept
   it. A mismatch is a setup fault, so it skips few items, and each is seen again once it is
   updated. Holding the mark back would modify that requirement, which #179 and #106 also
   modify. An unanswered read holds the mark back instead (decision 10).
7. **For Adam: the condition names a private repository on a public branch.** Condition rows are
   written to the state branch, so decision 4's row names the private repository there. A
   repository a role's sources name is already public where the role files sit in the public
   store. #208 lets them sit in a private lore repository instead, and a repository found only
   through an item is named nowhere else, so the condition row can be the only public place that
   name appears. *Recommended:* accept it, since a
   name is not content.
8. **For Adam: private text from a tracker that is not a repository,** such as a Linear issue,
   can still reach a public state branch: the guard compares repositories only. #190 left this
   question to the guard. *Recommended:* a later change, once a non-GitHub tracker is in use.
9. **For Adam: what the state branch already holds when a store is made public.** The guard stops
   new writes; it cannot unpublish records written while the store was private. *Recommended:*
   `docs/architecture.md` warns that making a store public publishes its whole state branch.
10. **Unmeasured: can a source's query return an item of another repository?** Task 0.2 measures
    it. Either way the guard reads each candidate's repository from its item, so if sources
    never return another repository's item, the guard has only made reads it did not need.
