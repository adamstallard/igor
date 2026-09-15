import type { Candidate, ClaimVerdict, Tracker } from './adapter.js'
import { isGoAhead } from './signals.js'
import type { Role } from './role.js'

/**
 * Taking, holding, and losing a claim.
 *
 * Two properties are not configurable and are enforced here rather than by policy: **an Igor
 * claims before it starts**, and **a stop takes effect for anyone, with no permission check**.
 * Everything else — how long to settle, how long to wait after a stop — is tunable.
 */

export type Outcome = 'held' | 'lost' | 'stopped' | 'refused'

export interface ClaimResult {
  outcome: Outcome
  candidate: Candidate
  /** When the claim was taken, which is what every later stop scan is measured from. */
  claimedAt: string
  verdict?: ClaimVerdict
  reason: string
}

/**
 * The claim message, posted on every claim rather than only where a tracker has no holder
 * field.
 *
 * It does three jobs at once, which is why it is not conditional: it names the specific Igor
 * where the surface can only show one shared identity, it carries the stop instruction so
 * nobody has to know a convention, and it is the only claim signal at all on a message-only
 * surface.
 */
export function claimMessage(role: Role, identity: string): string {
  const who = identity === role.name ? `**${role.name}**` : `**${role.name}** (\`${identity}\`)`
  return (
    `${who} picked this up and is working on it.\n\n` +
    `Reply **stop** to hand it back — that works for anyone, immediately, no permission needed.`
  )
}

/** The receipt owed on a stop: what exists so far, so nobody has to go looking. */
export function stopReceipt(role: Role, verdict: ClaimVerdict, artifact?: string): string {
  const who = verdict.by ? ` at ${verdict.by}'s request` : ''
  const left = artifact
    ? `What exists so far: ${artifact}. It is yours to keep, continue, or discard.`
    : 'Nothing was produced, so there is nothing to clean up.'
  return `**${role.name}** stopped${who} and released this. ${left}`
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

export interface ClaimOptions {
  /** Injected so tests do not wait, and so a dry run can pass a zero. */
  wait?: (ms: number) => Promise<void>
  now?: () => number
  /** Skip the claim message — used only by callers that post their own. */
  announce?: boolean
  onSettle?: () => void
}

/**
 * Claims an item, then verifies after the settle interval.
 *
 * The stop scan starts at `claimedAt` minus the settle interval rather than at `claimedAt`.
 * Surfaces filter comments at second granularity and some filter on modification rather than
 * creation, so a stop posted in the same second as the claim would otherwise fall in the gap
 * between the two — the one window where a person is most likely to be reacting to the claim
 * they just saw appear.
 */
export async function takeClaim(
  tracker: Tracker,
  candidate: Candidate,
  role: Role,
  identity: string,
  options: ClaimOptions = {},
): Promise<ClaimResult> {
  const wait = options.wait ?? sleep
  const now = options.now ?? Date.now
  const claimedAt = new Date(now()).toISOString()
  const since = new Date(now() - role.settleSeconds * 1000).toISOString()

  if (tracker.nativeHolderField) {
    const recorded = await tracker.claim(candidate, identity)
    if (!recorded) {
      // GitHub accepts an assignment naming a non-collaborator and silently drops it, so a
      // claim that did not stick must refuse the work rather than proceed unclaimed.
      return {
        outcome: 'refused',
        candidate,
        claimedAt,
        reason:
          `the tracker did not record ${identity} as holding ${candidate.id} — ` +
          `most likely it lacks write access to ${candidate.repo}`,
      }
    }
  }

  if (options.announce !== false) {
    await tracker.report(candidate, claimMessage(role, identity))
  }

  options.onSettle?.()
  await wait(role.settleSeconds * 1000)
  const verdict = await tracker.verifyClaim(candidate, identity, since)

  if (verdict.status === 'held') {
    return { outcome: 'held', candidate, claimedAt, verdict, reason: 'claim stands' }
  }

  // Standing down releases our own claim in both cases: someone else holding it is not a
  // reason to leave a second name on the item, and a stop must leave nothing behind.
  await tracker.release(candidate, identity).catch(() => undefined)

  return {
    outcome: verdict.status,
    candidate,
    claimedAt,
    verdict,
    reason:
      verdict.status === 'stopped'
        ? `stopped${verdict.by ? ` by ${verdict.by}` : ''}`
        : `lost to ${verdict.by ?? 'another party'}`,
  }
}

/**
 * Re-checks a held claim mid-execution.
 *
 * Always scans from the *original* claim time, never from the previous checkpoint. Scanning
 * forward from the last check would leave a gap between checkpoints in which a stop could
 * land and never be seen again — and honouring a stop late is the one failure this whole
 * mechanism exists to avoid. Re-reading the same comments repeatedly is the cheaper mistake.
 */
export async function checkpoint(
  tracker: Tracker,
  claim: ClaimResult,
  identity: string,
): Promise<ClaimVerdict> {
  const since = new Date(Date.parse(claim.claimedAt) - 1000).toISOString()
  return tracker.verifyClaim(claim.candidate, identity, since)
}

export interface EligibilityInput {
  candidate: Candidate
  stoppedAt: string
  cooldownMinutes: number
  /**
   * Anything said on the item since the stop, oldest or newest order does not matter. Fetched
   * on demand because reading it costs a request per item and most verdicts do not need it.
   */
  since: () => Promise<{ body: string; at: string }[]>
  identity: string
  now?: number
}

export interface Eligibility {
  eligible: boolean
  reason: string
}

/**
 * What may follow a stop, read from the tracker rather than from a second command.
 *
 * There is deliberately no resume verb. A person who wants an Igor to wait says stop; whether
 * it comes back is then a question about the item's state, not about a command someone has to
 * remember to issue.
 *
 * The clause order is also the cost bound. A go-ahead can only make an item eligible *sooner*,
 * so it cannot change a verdict that another holder or an elapsed cooldown already settled —
 * and those two read fields already in hand. `since` is therefore reached for only inside the
 * cooldown window, which is zero requests in the steady state. Keep the order if you change
 * anything here; a caller that duplicated it would be a second copy of the rule.
 */
export async function eligibleAfterStop(input: EligibilityInput): Promise<Eligibility> {
  const now = input.now ?? Date.now()
  const others = input.candidate.assignees.filter((a) => a !== input.identity)
  if (others.length > 0) {
    return { eligible: false, reason: `${others.join(', ')} took it` }
  }

  const elapsedMinutes = (now - Date.parse(input.stoppedAt)) / 60000
  if (elapsedMinutes >= input.cooldownMinutes) {
    return { eligible: true, reason: 'cooldown elapsed and nobody took it' }
  }

  const goAhead = (await input.since()).find((m) => isGoAhead(m.body, input.identity))
  if (goAhead) {
    return { eligible: true, reason: 'someone said to carry on' }
  }

  const left = Math.ceil(input.cooldownMinutes - elapsedMinutes)
  return { eligible: false, reason: `cooling down, ${left} minute${left === 1 ? '' : 's'} left` }
}
