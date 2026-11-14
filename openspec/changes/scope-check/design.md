## Decisions

The decisions behind this change are in the proposal's *Decisions for the reviewer*.

## Open Questions

- **Does a hyphen end a whole word?** *Naming a capability or change names what
  its files name* counts a capability or change as named when the item contains its directory
  name as a whole word. It does not say whether a hyphen ends a word. With capabilities `budget`
  and `budget-pacing`, an item that writes `budget-pacing` may or may not also name `budget`.
- **Should a gate-two revision, or a resolution's own edits, be checked?** Only gate two's push is
  checked, so a revision answering a change request at gate two can add a path nothing names, and
  #190 keeps `review: skim` on the last checked push's result. Such a revision can carry source
  code, since #150 lets a gate-two revision touch `src/`. Resolutions go unchecked because they
  carry what the base changed, but #190, when it measures a run's size for its label, already
  counts only what a resolution itself changed and leaves out what the base brought in. Checking
  revisions and a resolution's own edits would close the gap; it is a change to decision 6.
- **Planted text can name its own target.** The named set is read from the same title and body
  where planted text would sit. Text that names its target, such as
  `.github/workflows/release.yml`, or a wide directory such as `src/` or `.github/`, puts the edit
  in scope, so the check does not flag it, and #190 may label the pull request `review: skim`.
  Is that limit acceptable, or should some paths, such as `.github/`, always be flagged?
- **How often does an item name anything?** Nobody has measured it (task 0.2). An item that names
  nothing is not checked, and #190 then labels the pull request `review: read`. If most items name
  nothing, the check mostly says "not checked".
