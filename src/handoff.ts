import type { Artifact, Candidate, Tracker } from './adapter.js'
import type { ExecutionResult } from './execute.js'
import type { Role } from './role.js'

/**
 * What an Igor says before it lets go of something it claimed.
 *
 * A claim tells other people to stand off, so going quiet afterwards is the worst available
 * outcome: the item looks handled and is not. Every self-directed stop — exhaustion, failure,
 * a timeout — owes a handoff before releasing.
 *
 * **Composed from recorded state, with no model call.** Reserving budget for a model-written
 * handoff was considered and rejected: the situation that demands a handoff is frequently the
 * one where no call can be made at all, so a handoff depending on the thing that just failed
 * is not a handoff. Everything here is string assembly over facts already known.
 *
 * A stop directed *at* the Igor is exempt and gets a one-line receipt instead (see
 * `stopReceipt`). Composing a handoff would delay the release, and whoever issued the stop is
 * presumably taking the work.
 */

/**
 * Budget or failure. There is deliberately no "busy" — an Igor with capacity does not defer on
 * the grounds of having a lot on, and leaving the variant out is a cheaper guarantee than a
 * rule saying so.
 */
export type HandoffReason =
  | {
      kind: 'budget'
      seat?: string
      resetAt?: string
      /** `resetAt` is the latest it can still be shut rather than a return the provider
       *  stated, so the sentence says "back by" and does not promise the hour. */
      resetApproximate?: boolean
    }
  // Every configuration of the Igor's own the run proved wrong, and often more than one: a
  // run can be refused an action and have been denied a command, and both have to be fixed.
  // Nothing suppresses an item handed back carrying any, so a sentence promising no retry
  // does not belong on it.
  | { kind: 'failure'; detail: string; cures?: readonly string[] }
  // Looking carefully and finding nothing is a result, not a breakdown, and reads as one.
  | { kind: 'nothing-to-do'; detail: string }

export interface Handoff {
  reason: HandoffReason
  done: string[]
  remaining: string[]
  suggested: string[]
  artifact?: Artifact
}

const MINUTE = 60_000

function ago(fromIso: string, now: number): string {
  const ms = now - Date.parse(fromIso)
  if (!Number.isFinite(ms) || ms < 0) return 'recently'
  const minutes = Math.round(ms / MINUTE)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.round(minutes / 60)
  return `${hours} hour${hours === 1 ? '' : 's'} ago`
}

/** Backticked and joined so one key and several read as the same sentence. */
function keys(cures: readonly string[]): string {
  const quoted = cures.map((c) => `\`${c}\``)
  const last = quoted.pop() ?? ''
  return quoted.length === 0 ? last : `${quoted.join(', ')} and ${last}`
}

/** A person reads this, so render a wall-clock time rather than a machine timestamp. */
function clock(iso: string): string {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return iso
  return `${new Date(t).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

function until(iso: string, now: number): string {
  const ms = Date.parse(iso) - now
  if (!Number.isFinite(ms)) return ''
  if (ms <= 0) return ' (now)'
  const minutes = Math.round(ms / MINUTE)
  if (minutes < 60) return ` (in about ${minutes} minute${minutes === 1 ? '' : 's'})`
  const hours = Math.round(minutes / 60)
  return ` (in about ${hours} hour${hours === 1 ? '' : 's'})`
}

/**
 * Derives the two lists from what was recorded, so they are facts rather than a narration the
 * Igor produces about itself.
 */
export function stepsFrom(
  claimedAt: string,
  result: ExecutionResult | undefined,
  now: number = Date.now(),
): { done: string[]; remaining: string[] } {
  const done = [`claimed this ${ago(claimedAt, now)}`]
  const remaining: string[] = []

  if (result === undefined) {
    remaining.push('everything — the work never started')
    return { done, remaining }
  }

  const edits = result.changed.filter((c) => c.kind !== 'deleted').length
  if (edits > 0) done.push(`changed ${edits} file${edits === 1 ? '' : 's'}`)
  if (result.artifact) done.push(`opened ${result.artifact.ref} as a draft`)

  for (const refusal of result.refusals) {
    remaining.push(`${refusal.action} was not attempted — ${refusal.why}`)
  }

  switch (result.outcome) {
    case 'produced':
      remaining.push('review the draft, finish it, or discard it')
      break
    case 'nothing-to-do':
      remaining.push('all of it — nothing was changed, so this needs a person to look')
      break
    case 'refused':
    case 'failed':
    // A budget stop is nobody's fault and everything is still to do, which is the same two
    // sentences: what reached the tree is gone with it, and the rest was never attempted.
    case 'budget':
      remaining.push(
        edits > 0
          ? 'the edits were made but never published, so they are gone with the working copy'
          : 'all of it — nothing usable was produced',
      )
      break
  }
  return { done, remaining }
}

/** Reviewers first, then whoever raised it. Never the Igor, and never nobody. */
export function suggest(role: Role, candidate: Candidate, identity: string): string[] {
  const people = [...role.reviewers, candidate.author].filter(
    (p) => p !== '' && p !== identity && p !== role.name,
  )
  return [...new Set(people)]
}

export function composeHandoff(role: Role, candidate: Candidate, handoff: Handoff, now: number = Date.now()): string {
  const why =
    handoff.reason.kind === 'budget'
      ? `the budget${handoff.reason.seat ? ` on seat \`${handoff.reason.seat}\`` : ''} is used up` +
        (handoff.reason.resetAt
          ? `, back ${handoff.reason.resetApproximate === true ? 'by' : 'at'} ` +
            `${clock(handoff.reason.resetAt)}${until(handoff.reason.resetAt, now)}`
          : ', and when it returns is not known')
      : handoff.reason.kind === 'nothing-to-do'
        ? handoff.reason.detail
        : // Another layer's sentence, and several of them end in a full stop of their own —
          // the seat's "export it." among them, which the reader then meets as "export it.."
          `it hit something it could not get past: ${handoff.reason.detail.replace(/\.$/, '')}. ` +
          (handoff.reason.cures === undefined || handoff.reason.cures.length === 0
            ? 'It will not retry'
            : `Nothing about this item caused that — ${keys(handoff.reason.cures)} ` +
              `${handoff.reason.cures.length === 1 ? 'is' : 'are'} what would change it — so it ` +
              'comes back to this rather than waiting for a reply')

  const who =
    handoff.suggested.length > 0 ? `${handoff.suggested.join(' or ')} could pick this up.` : ''

  // Most handoffs happen before anything was produced, where a sectioned report is seven
  // headings around two facts. Expand only when there is something to expand about.
  const substantive = handoff.done.length > 1 || handoff.artifact !== undefined
  if (!substantive) {
    const nothing = handoff.remaining[0] ?? 'nothing was done'
    return [`**${role.name}** released this — ${why}.`, '', `Still to do: ${nothing}.`, who]
      .filter((l) => l !== '')
      .join('\n')
  }

  const lines = [
    `**${role.name}** released this — ${why}.`,
    '',
    `**Done:** ${handoff.done.join(', ')}.`,
    `**Left:** ${handoff.remaining.join('; ')}.`,
  ]
  if (handoff.artifact) {
    lines.push(`**Partial work:** ${handoff.artifact.url} — continue from it rather than starting over.`)
  }
  if (who !== '') lines.push('', who)
  return lines.join('\n')
}

export interface HandoffOutcome {
  posted: boolean
  released: boolean
  text: string
  /** Why posting failed, when it did. The handoff exists for broken situations. */
  error?: string
}

/**
 * Posts the handoff, then releases the claim.
 *
 * In that order deliberately: releasing first would briefly show an unclaimed item with no
 * explanation, which is the state the handoff exists to prevent. A failure to post is recorded
 * and the claim is still released — holding a claim an Igor has abandoned is worse than an
 * unexplained release.
 */
export async function handOff(
  tracker: Tracker,
  candidate: Candidate,
  role: Role,
  identity: string,
  handoff: Handoff,
  now: number = Date.now(),
): Promise<HandoffOutcome> {
  const text = composeHandoff(role, candidate, handoff, now)
  let posted = false
  let error: string | undefined

  try {
    await tracker.report(candidate, text)
    posted = true
  } catch (e) {
    error = e instanceof Error ? e.message : String(e)
  }

  let released = false
  try {
    await tracker.release(candidate, identity)
    released = true
  } catch {
    // Recorded by the caller through the returned flags; nothing here can fix it.
  }

  return { posted, released, text, ...(error === undefined ? {} : { error }) }
}

/**
 * The whole self-directed path in one call: derive the steps, name who could continue, post,
 * release. Takes no worker and makes no model call, which is the property that matters.
 */
export async function handOffFrom(
  tracker: Tracker,
  candidate: Candidate,
  role: Role,
  identity: string,
  claimedAt: string,
  reason: HandoffReason,
  result?: ExecutionResult,
  now: number = Date.now(),
): Promise<HandoffOutcome> {
  const { done, remaining } = stepsFrom(claimedAt, result, now)
  return handOff(
    tracker,
    candidate,
    role,
    identity,
    {
      reason,
      done,
      remaining,
      suggested: suggest(role, candidate, identity),
      ...(result?.artifact ? { artifact: result.artifact } : {}),
    },
    now,
  )
}
