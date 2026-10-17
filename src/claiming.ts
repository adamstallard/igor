import type { Candidate, ClaimVerdict, Tracker } from './adapter.js'
import { isGoAhead, type Accounts } from './signals.js'
import { heldByOthers, type Holding } from './predicate.js'
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
   * Set where the tracker may have failed rather than the item: here, on every throw out of the
   * claim window, which cannot tell the two apart. `serve` ends the cycle on the second
   * consecutive one, so an outage does not refuse, and post on, every remaining item.
   */
  surfaceFailed?: true
  /**
   * Set where standing down left the holder field set. The caller owes the correction on a
   * `stopped` claim, because the sentence it corrects is the caller's stop receipt and a
   * correction written before it stands above the claim it answers. A `lost` claim gets no
   * sentence from anybody, so that one is said here and this flag only reports it.
   */
  releaseStuck?: true
  /**
   * Whether anything was said on the item. On a refusal, only a claim window that threw after
   * announcing has said anything: the claim message, then its withdrawal.
   */
  spoke?: boolean
  /** Set where a person handed the item to this Igor; see `ClaimOptions.directed`. */
  directed?: true
  /** Set where a go-ahead lifted a stop the claim's check found; see `ClaimVerdict.liftedAt`. */
  liftedAt?: string
}

/**
 * The hidden line a claim message carries where the claim answers whatever brought the item to
 * the Igor. A person's hand-over counts as answered once a comment carrying it follows the
 * hand-over (`findDirected`).
 */
export const CLAIM_MARKER = '<!-- igor:claim -->'

/**
 * The hidden line a claim message carries instead where the Igor is bringing its own pull request
 * up to date. That is not an answer to a person's hand-over, which still stands afterwards.
 */
export const CATCH_UP_MARKER = '<!-- igor:catch-up -->'

/**
 * The claim message, posted on every claim, not only where a tracker has no holder field.
 *
 * It does three jobs, so it is never skipped: it names the specific Igor where the surface
 * shows only one shared identity, it tells people how to stop the Igor, and on a surface with
 * no holder field it is the only sign of the claim.
 */
export function claimMessage(role: Role, identity: string, catchUp = false): string {
  const who = identity === role.name ? `**${role.name}**` : `**${role.name}** (\`${identity}\`)`
  return (
    `${who} picked this up and is working on it.\n\n` +
    `Reply **stop** to hand it back — that works for anyone, immediately, no permission needed.\n\n` +
    (catchUp ? CATCH_UP_MARKER : CLAIM_MARKER)
  )
}

/**
 * Said where a claim was taken, announced, and then could not be finished.
 *
 * Posted wherever the claim message may have reached the item, including where the call that
 * posted it threw, because a surface can accept a write and then fail before answering. A claim
 * message nobody withdraws tells everyone to stand off an item nobody holds. Where the claim
 * message never landed, posting this is usually harmless: whatever failed that post usually
 * fails this one too.
 *
 * It names no cause. What failed goes to the run's record, because the protocol keeps tracker
 * errors off the item.
 */
export function claimWithdrawn(role: Role, directed = false): string {
  return (
    `**${role.name}** could not finish taking this and has released it. ` +
    `Nothing was done, so there is nothing to clean up.` +
    (directed ? ` ${relabelSentence(role)}` : '')
  )
}

/**
 * Said after a directed claim is released: the release removed the label a person added, which
 * was the only thing bringing the item to this Igor.
 */
export function relabelSentence(role: Role): string {
  return `To have it try again, add the \`igor:${role.name}\` label again.`
}

/**
 * Said where the claim could not be finished **and** could not be given up either.
 *
 * The item still carries this Igor's name, so the withdrawal's "has released it" would be
 * false. It names the one action that clears the name, because nothing else will: the next run
 * cannot take an item somebody else appears to hold.
 */
export function claimStuck(role: Role, directed = false): string {
  return (
    `**${role.name}** could not finish taking this and could not release it either, so it still carries ` +
    `its \`igor:${role.name}\` label. Nothing was done. Remove the label to let another run pick it up.` +
    // The label is still there, so adding it again records nothing: only a removal and a fresh
    // addition is a new hand-over.
    (directed ? ` To have **${role.name}** try again, remove the label and add it again.` : '')
  )
}

/**
 * Posted after a message that said the claim was released, where the release then did not take.
 *
 * It corrects rather than replaces: the message before it, a stop receipt or a handoff, is
 * still true about what happened, except for its clause about releasing. It names no cause,
 * which goes to the run's record.
 */
export function stillHeld(role: Role): string {
  return `This still carries the \`igor:${role.name}\` label — releasing it did not take. Remove the label to free it.`
}

/**
 * Said where a claim was lost to somebody else and could not then be given up.
 *
 * Standing down silently is right only where the release worked, because the other holder is
 * visible and a second message adds nothing. Where this Igor's name is still on the item,
 * silence leaves two apparent holders and nothing to explain the second.
 */
export function stoodDownStuck(role: Role): string {
  return `**${role.name}** stood down here, and could not remove its own \`igor:${role.name}\` label. Remove the label to free it.`
}

/**
 * Said where a claim was lost on a holder field that holds one value. The field already names
 * the winner, so clearing it would remove the winner's claim; this reply is all the loser does.
 */
export function handingBack(role: Role): string {
  return `**${role.name}** was beaten to this and is handing it back. Nothing was done.`
}

/**
 * The hidden line a waiting notice carries, naming the holders it was posted about, so the
 * notice is posted once while the issue's labels stay as they are.
 */
export function waitingMarker(holders: readonly string[]): string {
  return `<!-- igor:waiting ${[...holders].sort().join(' ')} -->`
}

/**
 * Said, once, where a person handed an item to this Igor while work is already in flight on it,
 * such as an open pull request. Claiming would duplicate work in review, so the Igor leaves the
 * item until that work closes, when the label still on it directs the Igor. The marker keeps
 * this from being posted twice and from counting as an answer to the hand-over.
 */
export function inFlightNotice(role: Role, ref: string, url: string): string {
  return (
    `**${role.name}** was asked to take this, but [${ref}](${url}) is already open for it. ` +
    `It takes this up once ${ref} closes.\n\n` +
    waitingMarker([ref])
  )
}

/**
 * Said, once, where a person handed an item to this Igor while another Igor holds it. This Igor
 * does not claim it: a second label never hands an item over, or adding one would be a stop.
 */
export function waitingNotice(role: Role, holders: readonly string[]): string {
  const held = holders.map((h) => `\`${h}\``).join(', ')
  return (
    `**${role.name}** was asked to take this, but ${held} holds it. ` +
    `Removing ${holders.length === 1 ? 'that label' : 'those labels'} hands it to **${role.name}**.\n\n` +
    waitingMarker(holders)
  )
}

/**
 * The hidden line a receipt carries where the stop was a removal from the holder field. Such a
 * stop leaves no comment of its own, so this line, on this Igor's receipt, is what the cooldown
 * after a stop is measured from.
 *
 * Read only by the cooldown, never by `isStop`: a claim's own stop scan would otherwise read the
 * Igor's old receipt as a fresh stop of the new claim.
 */
export const STOPPED_MARKER = '<!-- igor:stopped -->'

/**
 * The hidden line every stop receipt carries. A stop on a handed-over item counts as answered
 * only by this Igor's comment carrying it: a notice or a claim after a stop is not its answer.
 */
export const RECEIPT_MARKER = '<!-- igor:receipt -->'

/** The receipt owed on a stop: what exists so far, so nobody has to go looking. */
export function stopReceipt(role: Role, verdict: ClaimVerdict, artifact?: string): string {
  const who = verdict.by ? ` at ${verdict.by}'s request` : ''
  const left = artifact
    ? `What exists so far: ${artifact}. It is yours to keep, continue, or discard.`
    : 'Nothing was produced, so there is nothing to clean up.'
  const mark = verdict.fromHolder === true ? `\n\n${STOPPED_MARKER}` : ''
  return `**${role.name}** stopped${who} and released this. ${left}${mark}\n\n${RECEIPT_MARKER}`
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const why = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export interface ClaimOptions {
  /** Injected so tests do not wait, and so a dry run can pass a zero. */
  wait?: (ms: number) => Promise<void>
  now?: () => number
  /** Skip the claim message — used only by callers that post their own. */
  announce?: boolean
  /**
   * A person put this Igor in the holder field, so the item is directed to it: the field is not
   * written again, and work starts without the settle interval. No other Igor competes for an
   * item that names a holder, and the person has already chosen.
   */
  directed?: boolean
  /**
   * Where the stop scan starts, in place of the claim time minus the settle interval. A directed
   * claim passes the hand-over time, so a stop said between the cycle reading the item and this
   * claim stops it.
   */
  since?: string
  /** The claim is the Igor bringing its own pull request up to date; see `CATCH_UP_MARKER`. */
  catchUp?: boolean
  onSettle?: () => void
}

/**
 * Claims an item, then verifies the claim after the settle interval.
 *
 * The stop scan starts at `options.since` where given, and otherwise at `claimedAt` minus the
 * settle interval, not at `claimedAt`. Surfaces filter comments to the second, and some by
 * modification time rather than creation, so a stop posted in the same second as the claim could
 * otherwise be missed. That second is when a
 * person is most likely to be reacting to the claim they just saw appear.
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
  const since = options.since ?? new Date(now() - role.settleSeconds * 1000).toISOString()

  // **The claim starts at the assignment call, so the guard opens before it.** That call can
  // apply on the surface and still throw, and on a surface with no holder field the claim is
  // the message posted below. Either way, a throw escaping this window would leave the item held
  // with nothing said on it, which is the state a claim exists to prevent, and an ordinary
  // tracker 503 is enough to cause it. The whole window is guarded, not each call in it, so a
  // call added here later is covered without anyone remembering to guard it.
  let announced = false
  try {
    if (tracker.nativeHolderField && options.directed !== true) {
      const recorded = await tracker.claim(candidate, identity)
      if (!recorded) {
        // GitHub accepts an assignment naming a non-collaborator and silently drops it, so a
        // claim that did not stick must refuse the work rather than proceed unclaimed.
        return {
          outcome: 'refused',
          candidate,
          claimedAt,
          reason:
            `the tracker did not record ${identity} as holding ${candidate.id}: ` +
            `read back after it was written, the holder field does not name it`,
        }
      }
    }

    if (options.announce !== false) {
      // Set before the call, never after. It answers whether a claim message may be on the item,
      // and a surface that accepted the write can still throw. Set afterwards, it would answer
      // a different question: whether this process saw the write succeed.
      announced = true
      await tracker.report(candidate, claimMessage(role, identity, options.catchUp === true))
    }

    // A directed item is checked at once rather than after the settle interval, which still
    // catches a person who took it back between the cycle finding it and this claim.
    if (options.directed !== true) {
      options.onSettle?.()
      await wait(role.settleSeconds * 1000)
    }
    // A go-ahead lifts a stop for work the Igor found itself, never for a hand-over the stop
    // cancelled.
    const verdict = await tracker.verifyClaim(candidate, identity, since, { liftable: options.directed !== true })

    if (verdict.status === 'held') {
      return {
        outcome: 'held', candidate, claimedAt, verdict, reason: 'claim stands',
        ...(options.directed === true ? { directed: true as const } : {}),
        ...(verdict.liftedAt === undefined ? {} : { liftedAt: verdict.liftedAt }),
      }
    }

    // Standing down releases this Igor's claim whether it was lost or stopped: another holder is
    // no reason to leave a second name on the item, and a stop must leave nothing behind.
    //
    // Where the release does not take, the item keeps this Igor's name, and who posts the
    // correction depends on what else will be said. On a stop, the caller posts a receipt saying
    // "released this", and the correction must follow it, so the caller gets `releaseStuck` and
    // posts it. Nobody posts anything on a lost claim, so its standalone message is posted here.
    const stoodDown = await standDown(tracker, candidate, identity, verdict)
    if (verdict.status === 'lost' && tracker.holderField.holds === 'single') {
      await tracker.report(candidate, handingBack(role)).catch(() => undefined)
    } else if (!stoodDown && verdict.status === 'lost') {
      await tracker.report(candidate, stoodDownStuck(role)).catch(() => undefined)
    }

    return {
      outcome: verdict.status,
      candidate,
      claimedAt,
      verdict,
      ...(stoodDown ? {} : { releaseStuck: true as const }),
      reason:
        verdict.status === 'stopped'
          ? `stopped${verdict.by ? ` by ${verdict.by}` : ''}`
          : `lost to ${verdict.by ?? 'another party'}`,
    }
  } catch (error) {
    // **Release first, then say so.** The withdrawal is posted only where the release cleared
    // the holder field; otherwise the item gets `claimStuck`, which says it is still held.
    //
    // Releasing is safe even where the claim itself failed, or where the check that would have
    // said whether it stands failed. What a release means on a surface with no holder field is
    // the adapter's to decide. A release the surface refuses is caught and goes into the reason.
    //
    // `release` has three answers: the holder field is clear, the surface says it is not, or the
    // surface did not answer. Only the first makes the withdrawal true, so `stillHeld` is
    // undefined only then.
    //
    // **The reasons below assert nothing this call cannot know.** Whether the item was ever held
    // is unknown, because the assignment call can throw before its request leaves or after it
    // applies, so both reasons are worded to be true either way.
    const stillHeld = await tracker.release(candidate, identity).then(
      (clear) => (clear ? undefined : `the ${candidate.repo} holder field is still set`),
      why,
    )
    if (announced) {
      await tracker
        .report(
          candidate,
          stillHeld === undefined
            ? claimWithdrawn(role, options.directed === true)
            : claimStuck(role, options.directed === true),
        )
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
 * Gives a claim up after a verdict, and answers whether the holder field is clear of this Igor.
 *
 * On a single-valued holder field, a lost claim changes nothing: the field already names the
 * winner, and a release would clear the winner's claim. A stop removes this Igor on any field.
 * A release the surface refuses reads as not clear.
 */
export async function standDown(
  tracker: Tracker,
  candidate: Candidate,
  identity: string,
  verdict: ClaimVerdict,
): Promise<boolean> {
  if (verdict.status === 'lost' && tracker.holderField.holds === 'single') return true
  const how = verdict.status === 'stopped' ? { stop: true } : {}
  return tracker.release(candidate, identity, how).then((clear) => clear, () => false)
}

/**
 * Re-checks a held claim mid-execution.
 *
 * Always scans from the *original* claim time, never from the previous checkpoint. Scanning on
 * from the last check would leave a gap between checkpoints where a stop could land and never
 * be seen, and missing a stop is the failure this mechanism exists to prevent. Re-reading the
 * same comments each time costs less.
 *
 * Where a go-ahead lifted a stop when the claim was checked, the scan starts at that go-ahead
 * instead, so the stop it lifted does not end the run it allowed.
 */
export async function checkpoint(
  tracker: Tracker,
  claim: ClaimResult,
  identity: string,
): Promise<ClaimVerdict> {
  const since = claim.liftedAt ?? new Date(Date.parse(claim.claimedAt) - 1000).toISOString()
  return tracker.verifyClaim(claim.candidate, identity, since)
}

export interface EligibilityInput {
  candidate: Candidate
  stoppedAt: string
  cooldownMinutes: number
  /**
   * Everything said on the item after the stop, in creation order. Fetched on demand, because it
   * costs a request per item and most verdicts do not need it.
   */
  since: () => Promise<{ body: string; at: string; accounts: Accounts }[]>
  identity: string
  /** How the tracker's holder field shows this Igor; see `heldByOthers`. */
  holding?: Holding
  now?: number
}

export interface Eligibility {
  eligible: boolean
  reason: string
}

/**
 * Whether a stopped item may be taken again, read from the tracker rather than from a command.
 *
 * There is deliberately no resume command. A person who wants an Igor to wait says stop, and
 * whether it comes back then depends on the item's state, not on someone remembering to issue
 * a second command.
 *
 * **Keep the checks in this order: it is what keeps this cheap.** A go-ahead can only make an
 * item eligible *sooner*, so it cannot change a verdict that another holder or an elapsed
 * cooldown already settled, and those two checks read fields already in hand. So `since`, the
 * one check that costs a request, runs only inside the cooldown window: no requests in the
 * steady state. Callers ask this function rather than repeating its checks, so the rule
 * lives in one place.
 */
export async function eligibleAfterStop(input: EligibilityInput): Promise<Eligibility> {
  const now = input.now ?? Date.now()
  const others = heldByOthers(input.candidate, input.identity, input.holding)
  if (others.length > 0) {
    return { eligible: false, reason: `${others.join(', ')} took it` }
  }

  const elapsedMinutes = (now - Date.parse(input.stoppedAt)) / 60000
  if (elapsedMinutes >= input.cooldownMinutes) {
    return { eligible: true, reason: 'cooldown elapsed and nobody took it' }
  }

  const goAhead = (await input.since()).find((m) => isGoAhead(m.body, input.identity, m.accounts))
  if (goAhead) {
    return { eligible: true, reason: 'someone said to carry on' }
  }

  const left = Math.ceil(input.cooldownMinutes - elapsedMinutes)
  return { eligible: false, reason: `cooling down, ${left} minute${left === 1 ? '' : 's'} left` }
}
