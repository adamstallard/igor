import type { Artifact, Candidate, Tracker } from './adapter.js'
import type { ExecutionResult } from './execute.js'
import type { Role } from './role.js'
import type { SeatVerdict } from './budget.js'

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
      /** `resetAt` is not a return the provider stated, so the sentence says "back around"
       *  and promises neither the hour nor a side of it. */
      resetApproximate?: boolean
      /**
       * Which of the ways to have no seat this is. Only `spent` and `share` are a budget that
       * ran out; the rest are a pool that could not be used, and saying "the budget is used up"
       * about one of those sends its reader to look at spend when the fix is a credential or a
       * reading — #49.
       *
       * The kind stays `budget` whatever this says, because `stillDeferred` exempts that kind
       * and nothing about the item caused any of these. A variant of its own would park items
       * for a fault they had no part in.
       */
      blocked?: SeatVerdict
      /** Every seat the pool passed over, with its verdict, so the sentence can be true of each
       *  rather than of whichever one won the summary. Verdict words only, never a seat's error
       *  text: a handoff is posted where anyone can read it. */
      passedOver?: readonly { seat: string; verdict: SeatVerdict }[]
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
  // An artifact that already existed was brought up to date, not opened — saying otherwise
  // tells the reader a pull request they have been reviewing for a week is new.
  if (result.artifact) {
    done.push(
      result.caughtUp === true
        ? `brought ${result.artifact.ref} up to date`
        : `opened ${result.artifact.ref} as a draft`,
    )
  }

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
      // An artifact means the edits reached it. Telling somebody the work is gone in the same
      // message that links to it is wrong twice, and it is the catch-up paths that get here
      // holding one: they publish and then discover the resolution did not take.
      remaining.push(
        result.artifact !== undefined
          ? `what was published is on ${result.artifact.ref}; the rest needs a person`
          : edits > 0
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

/**
 * What to say where no seat could be used and none of them ran out.
 *
 * `undefined` for a pool that really is spent, which keeps the sentence it always had. The
 * others each name a different thing to go and look at: one sends the reader to configuration,
 * one to a reading nobody has taken. Saying "the budget is used up" about either was #49 —
 * true of one way to reach "no seat" and false of the rest.
 *
 * No hour is offered, and none exists: nothing here comes back on a clock.
 */
function unspendable(
  blocked: SeatVerdict | undefined,
  passedOver: readonly { seat: string; verdict: SeatVerdict }[] = [],
): string | undefined {
  if (blocked === undefined || blocked === 'spent') return undefined
  const named = passedOver.length === 0 ? '' : ` (${passedOver.map((p) => p.seat).join(', ')})`

  // A pool where the seats failed differently gets one clause each. The focused sentences below
  // quantify over the whole pool — "no seat's usage could be read" — and saying that of a pool
  // holding one seat that was read perfectly well is the same false report, one verdict over.
  if (!passedOver.every((p) => p.verdict === blocked)) {
    return `no seat in the pool could be used — ${passedOver.map(clauseFor).join('; ')}`
  }

  switch (blocked) {
    case 'credential':
      return `no seat's usage could be read${named}, so nothing was spent and nothing says the budget is`
    case 'no-figure':
      return (
        `no seat has a capacity figure to spend against${named} — a reserve is a fraction of one, ` +
        'so until the seat is observed or a capacity is declared there is no quantity to reserve'
      )
    case 'absent':
      return `the seats this role draws on are not declared${named}`
    case 'share':
      return `this role is at its own share of every seat it could draw on${named}, which no hour clears`
    default:
      return undefined
  }
}

/** One passed-over seat, in the fewest words that still say where to look. */
function clauseFor({ seat, verdict }: { seat: string; verdict: SeatVerdict }): string {
  switch (verdict) {
    case 'credential':
      return `${seat}'s usage could not be read`
    case 'no-figure':
      return `nothing bounds ${seat}`
    case 'spent':
      return `${seat} has run out`
    case 'share':
      return `${seat} is at this role's share`
    case 'absent':
      return `${seat} is not declared`
    default:
      return seat
  }
}

/**
 * Why nothing can be spent, and when that stops being true.
 *
 * One sentence for both places the Igor says it — the handoff on an item it claimed, and the
 * cycle report where it claimed nothing — so the two cannot come to describe the same gate
 * differently. The seat is named only where one ran out; a pool that named no seat has none to
 * name.
 */
export function noCapacity(
  reason: {
    seat?: string
    blocked?: SeatVerdict
    passedOver?: readonly { seat: string; verdict: SeatVerdict }[]
    resetAt?: string
    resetApproximate?: boolean
  },
  now: number = Date.now(),
): string {
  return (
    unspendable(reason.blocked, reason.passedOver) ??
    `the budget${reason.seat ? ` on seat \`${reason.seat}\`` : ''} is used up` +
      (reason.resetAt
        ? `, back ${reason.resetApproximate === true ? 'around' : 'at'} ` +
          `${clock(reason.resetAt)}${until(reason.resetAt, now)}`
        : ', and when it returns is not known')
  )
}

export function composeHandoff(role: Role, candidate: Candidate, handoff: Handoff, now: number = Date.now()): string {
  const why =
    handoff.reason.kind === 'budget'
      ? noCapacity(handoff.reason, now)
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
