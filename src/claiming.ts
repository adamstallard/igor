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
  /**
   * Set where this refusal is about the surface rather than about the item — the tracker did
   * not answer, so nothing here would have gone differently on any other item. A cycle that
   * meets one stops, instead of doing the same thing to everything else in the pool.
   */
  surfaceFailed?: true
  /**
   * Whether anything was said on the item. Only a claim window that threw after announcing
   * says anything on a refusal, and it says two things — the claim, then its withdrawal.
   */
  spoke?: boolean
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

/**
 * Said where a claim was taken, announced, and then could not be finished.
 *
 * Posted wherever the claim message may have reached the item, including where the call that
 * posted it threw: a surface can accept a write and fail on the way home, and a claim message
 * nobody withdraws tells everyone to stand off an item nobody holds. The waste the other way
 * is bounded — a claim message that truly never landed usually failed for a reason that is
 * still there, which fails this post too and leaves the item untouched.
 *
 * It names no cause: what failed goes to the run's record, and the protocol keeps tracker
 * errors off the item.
 */
export function claimWithdrawn(role: Role): string {
  return (
    `**${role.name}** could not finish taking this and has released it. ` +
    `Nothing was done, so there is nothing to clean up.`
  )
}

/**
 * Said where the claim could not be finished **and** could not be given up either.
 *
 * The item still carries this Igor's name, so the withdrawal's "has released it" would be
 * false. Naming the one action that clears it, because nothing else will: the next run cannot
 * take an item somebody else appears to hold.
 */
export function claimStuck(role: Role): string {
  return (
    `**${role.name}** could not finish taking this and could not release it either, so it is ` +
    `still assigned. Nothing was done. Unassign it to let another run pick it up.`
  )
}

/** The receipt owed on a stop: what exists so far, so nobody has to go looking. */
/**
 * Appended wherever something has already been said and the release then did not take.
 *
 * A correction rather than a replacement: the sentence above it — a stop receipt, a handoff —
 * is still true about what happened, and only its last clause about releasing is not. Says
 * nothing about the cause, which goes to the run's record.
 */
export function stillAssigned(): string {
  return 'This is still assigned — releasing it did not take. Unassign it to free it.'
}

/**
 * Said where a claim was lost to somebody else and could not then be given up.
 *
 * Standing down silently is right only where the release worked: the other holder is visible
 * and a second voice adds nothing. Where this Igor's name is still on the item, silence leaves
 * two apparent holders and no account of the second.
 */
export function stoodDownStuck(role: Role): string {
  return `**${role.name}** stood down here, and could not clear its own name from it. Unassign it to free it.`
}

export function stopReceipt(role: Role, verdict: ClaimVerdict, artifact?: string): string {
  const who = verdict.by ? ` at ${verdict.by}'s request` : ''
  const left = artifact
    ? `What exists so far: ${artifact}. It is yours to keep, continue, or discard.`
    : 'Nothing was produced, so there is nothing to clean up.'
  return `**${role.name}** stopped${who} and released this. ${left}`
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const why = (error: unknown): string => (error instanceof Error ? error.message : String(error))

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

  // **The claim starts at the assignment call, so the guard opens before it.** That call can
  // apply on the surface and throw on the way home, and on a surface with no holder field the
  // claim is the message posted below — either way a throw escaping this window leaves the item
  // held with nothing said on it, the one state a claim exists to prevent, and an ordinary
  // tracker 503 reaches it. The window is guarded rather than each call in it: a guard per
  // route is a guard that misses the next route.
  let announced = false
  try {
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
      // Set before the call, never after. The question it answers is whether a claim message
      // may be on the item, and a surface that accepted the write can still throw on the way
      // home — a flag set afterwards answers the different question of whether this process
      // saw the write succeed.
      announced = true
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
    //
    // Where it does not take, the item keeps this Igor's name. A stop receipt is posted by the
    // caller and says "released this", so the correction is appended here; a lost claim says
    // nothing at all today, which is right only while the release works.
    const stoodDown = await tracker.release(candidate, identity).then((clear) => clear, () => false)
    if (!stoodDown) {
      await tracker
        .report(candidate, verdict.status === 'lost' ? stoodDownStuck(role) : stillAssigned())
        .catch(() => undefined)
    }

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
  } catch (error) {
    // The release goes first, so the withdrawal is true wherever the release succeeded. Where
    // the release is refused too the item keeps this Igor's name, the withdrawal posted on it
    // is wrong, and the run's record is the only place left that can say so — **so a reason
    // here asserts nothing this call cannot know.** Whether the item was ever held is one of
    // those unknowns: the assignment call throws both before its request leaves and after it
    // applies, so both reasons below are worded to hold either way.
    //
    // Releasing is safe even where the claim itself is what failed, or where what failed was
    // the check that would have said whether the claim still stands. What a release means on
    // a surface with no holder field is the adapter's to decide; one the surface refuses
    // lands in the second reason rather than escaping.
    // Three answers, not two. The contract distinguishes *the holder field is clear* from *the
    // surface says it is not* from *the surface did not answer*, and only the first of those
    // makes the withdrawal below true.
    const stillHeld = await tracker.release(candidate, identity).then(
      (clear) => (clear ? undefined : `the ${candidate.repo} holder field is still set`),
      why,
    )
    if (announced) {
      await tracker
        .report(candidate, stillHeld === undefined ? claimWithdrawn(role) : claimStuck(role))
        .catch(() => undefined)
    }
    const releaseRefused = stillHeld
    return {
      outcome: 'refused',
      candidate,
      claimedAt,
      surfaceFailed: true,
      spoke: announced,
      reason:
        releaseRefused === undefined
          ? `${identity} could not finish taking ${candidate.id}, and any claim it took ` +
            `was released: ${why(error)}`
          : `${identity} could not finish taking ${candidate.id}: ${why(error)}. Releasing it ` +
            `failed too, so it is still held if the claim landed: ${releaseRefused}`,
    }
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
