/**
 * Recognizing the two things a person says to a working Igor: stop, and carry on.
 *
 * Surface-agnostic on purpose. A GitHub comment, a Discord reply and a Linear comment are all
 * just text written by a person, and the words they use do not change with the venue — so the
 * recognition lives here rather than in whichever adapter needed it first.
 */

/** Deliberate enough not to fire on prose, loose enough that nobody has to learn a syntax. */
const STOP = /^stop\b/i
const GO_AHEAD = /^(go ahead|go on|resume|carry on|continue|proceed|unblocked|all yours)\b/i

function addressed(text: string, identity: string, verb: RegExp): boolean {
  const named = identity.replace(/^@/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (named === '') return false
  const match = text.match(new RegExp(`@?${named}\\b[\\s,:—-]+(.*)$`, 'is'))
  return match?.[1] !== undefined && verb.test(match[1].trim())
}

/**
 * A stop is unconditional and open to anyone, so recognition cannot depend on who wrote it.
 *
 * It must still be deliberate. A bare opening `stop` counts; so does a stop addressed to this
 * Igor by name. A generic leading mention does not — "@alice stop doing that" is one person
 * talking to another on an item an Igor happens to hold, and treating it as a stop would let a
 * conversation between two other people halt the work.
 */
export function isStop(body: string, identity: string): boolean {
  const text = body.trim()
  return STOP.test(text) || addressed(text, identity, STOP)
}

/**
 * The counterpart, which exists so a stop needs no second verb to undo it. Someone says the
 * work may resume and the cooldown is over; nothing else about the protocol changes.
 *
 * Same shape as a stop, and deliberately narrow: "we should go ahead with the redesign" is a
 * remark about the work, not permission to resume, so only an opening phrase or one addressed
 * to this Igor counts.
 */
export function isGoAhead(body: string, identity: string): boolean {
  const text = body.trim()
  return GO_AHEAD.test(text) || addressed(text, identity, GO_AHEAD)
}
