import type { IssueComment } from './github.js'

/**
 * What marks a comment as reconciliation's nudge, carrying the day the proposal went quiet.
 *
 * Recognized by this and never by author: the merge-triggered job posts as its actor and a
 * person's local run posts as that person, so the same nudge has two possible authors. Edit the
 * marker out and the next run nudges again.
 *
 * Anchored to the start of the body, where the nudge puts it, so a reply quoting the raw text
 * of one is still a reply.
 *
 * The date is here because the nudge is itself activity. Once posted, the pull request's
 * `updatedAt` is the nudge's, and the day the proposal actually went quiet survives only in the
 * comment.
 */
const MARKER = /^<!-- igor:quiet-proposal quiet-since=(\d{4}-\d{2}-\d{2}) -->/

export interface Nudge {
  /** When the nudge was posted, to the second. */
  at: string
  /** The day the proposal had been quiet since when it was nudged. */
  quietSince: string
}

/** The nudge a comment carries, if it is one. */
function asNudge(c: IssueComment): Nudge | undefined {
  const since = MARKER.exec(c.body)?.[1]
  return since === undefined ? undefined : { at: c.createdAt, quietSince: since }
}

/** The most recently posted nudge among `comments`, whichever pull requests they are on. */
export function newestNudge(comments: readonly IssueComment[]): Nudge | undefined {
  let newest: Nudge | undefined
  for (const c of comments) {
    const nudge = asNudge(c)
    if (nudge === undefined) continue
    if (newest === undefined || Date.parse(nudge.at) > Date.parse(newest.at)) newest = nudge
  }
  return newest
}

/**
 * Names as plain text. A login carries no `@`, but a configured reviewer may have been typed
 * with one, and an `@` in a posted comment notifies whoever it names.
 */
function plain(names: readonly string[]): string {
  return names.map((n) => n.replaceAll('@', '')).join(', ')
}

/**
 * The comment posted on a proposal quiet past the window.
 *
 * It names all three endings and marks the one that cannot be undone, because it is read by
 * somebody who stopped reading this pull request weeks ago, and the nearest gesture is the one
 * that gets made.
 */
export function nudgeBody(
  quietSince: string,
  now: Date,
  assignees: readonly string[],
  reviewers: readonly string[],
): string {
  const days = Math.floor((now.getTime() - Date.parse(quietSince)) / 86_400_000)
  return [
    `<!-- igor:quiet-proposal quiet-since=${quietSince} -->`,
    `This lore proposal has had no activity since ${quietSince}, ${days} days before this comment.`,
    ``,
    assignees.length === 0
      ? `Nobody is assigned to review it.`
      : `Assigned to review it: ${plain(assignees)}.`,
    reviewers.length === 0
      ? `No store reviewers are configured.`
      : `Where the assignees cannot act, the store reviewers can: ${plain(reviewers)}.`,
    ``,
    `It ends one of three ways, and they are not interchangeable:`,
    ``,
    `- **Merge** to approve every candidate still in it.`,
    `- **Delete a candidate's file, then merge**, to reject that candidate. Rejection is ` +
      `permanent: the candidate is never proposed again.`,
    `- **Close without merging** to defer. Nothing is rejected, and every candidate may be ` +
      `proposed again.`,
    ``,
    `Of the three, only rejecting cannot be undone.`,
    ``,
  ].join('\n')
}
