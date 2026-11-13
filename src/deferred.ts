import { createHash } from 'node:crypto'
import type { Candidate, Comment } from './adapter.js'
import { readState, writeState } from './state.js'
import { instant } from './time.js'

/**
 * Why an Igor stays quiet on an item it would otherwise pick up: it handed the item back and
 * nothing has answered.
 *
 * A handoff releases the claim and leaves no pull request behind, so nothing downstream stops
 * the item returning — and the handoff comment itself lifts the item above the watermark,
 * which is what makes it return. The lane still admits it and the model gives the same verdict
 * on the same text, so the Igor re-claims and re-works it every poll interval, at full worker
 * cost, forever.
 *
 * A stop is not kept here. It is somebody else's message, sitting on the item and recognised
 * by `isStop`, so `dropStopped` reads it straight off the tracker before any claim. A handoff
 * is the Igor's own prose, which nothing could recognise without parsing it back — which is
 * why one of the two is a record and the other is not.
 */

export interface Deferral {
  /** The item's own fields as they stood, so an edit to any of them lifts the deferral. */
  fingerprint: string
  /** When it was handed back, which bounds the scan for a reply. */
  at: string
  reason: string
}

export interface DeferralState {
  items: Record<string, Deferral>
}

export const STATE_PATH = 'deferred.json'

/**
 * What an Igor with no state assumes, and why nothing is at stake in it.
 *
 * Everything here is a handoff, so losing the file costs one repeated handoff per item. It
 * cannot cost a re-claim of something a person stopped: that is read live off the tracker.
 */
export const NO_DEFERRALS: DeferralState = { items: {} }

const MAX_AGE_DAYS = 30
const MAX_ENTRIES = 500
const DAY = 24 * 60 * 60 * 1000

/**
 * Over the item's own fields and deliberately not its timestamp. The Igor's own handoff moves
 * `updatedAt`, which is the whole reason the item came back; a fingerprint including it would
 * match nothing and defer nothing.
 */
export function fingerprint(candidate: Candidate): string {
  const parts = [
    candidate.state,
    candidate.title,
    candidate.body,
    [...candidate.labels].sort().join(','),
    [...candidate.assignees].sort().join(','),
  ]
  // The separator is written as an escape rather than a raw control character: a literal
  // NUL makes git treat this whole file as binary and hide it from every diff. It is part
  // of every fingerprint already stored, so changing it invalidates all of them.
  return createHash('sha256').update(parts.join('\0')).digest('hex').slice(0, 16)
}

/**
 * Pure. A deferral holds only while the item is unchanged *and* nobody but the Igor has
 * spoken.
 *
 * Both, because a handoff asks for a reply. Suppressing until a field changes would leave the
 * Igor silent on exactly the items where a person supplied the missing context in a comment —
 * the failure this exists to prevent, inverted, and worse: it asked, got an answer, and never
 * came back.
 */
export function stillDeferred(
  entry: Deferral | undefined,
  candidate: Candidate,
  spoken: readonly Comment[],
  as: string,
): boolean {
  if (entry === undefined) return false
  if (entry.fingerprint !== fingerprint(candidate)) return false
  return !spoken.some((c) => c.author !== as)
}

function newest<T extends { at: string }>(entries: Record<string, T>, floor: number): Record<string, T> {
  const kept = Object.entries(entries)
    .filter(([, e]) => instant(e.at) > floor)
    .sort(([, a], [, b]) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, MAX_ENTRIES)
  return Object.fromEntries(kept)
}

/** Newest kept. Age first, so a quiet Igor's record shrinks rather than only ever growing. */
export function prune(state: DeferralState, now: number = Date.now()): DeferralState {
  const floor = now - MAX_AGE_DAYS * DAY
  return { items: newest(state.items, floor) }
}

export function defer(
  state: DeferralState,
  candidate: Candidate,
  reason: string,
  now: number = Date.now(),
): DeferralState {
  const entry: Deferral = { fingerprint: fingerprint(candidate), at: new Date(now).toISOString(), reason }
  return prune({ ...state, items: { ...state.items, [candidate.id]: entry } }, now)
}

export async function loadDeferrals(repo: string): Promise<DeferralState> {
  const stored = await readState<DeferralState>(repo, STATE_PATH).catch(() => undefined)
  if (stored?.items === undefined) return NO_DEFERRALS
  // Projected, not spread, so a key this no longer owns does not survive the next write.
  return { items: stored.items }
}

export async function saveDeferrals(repo: string, state: DeferralState): Promise<boolean> {
  return writeState(repo, STATE_PATH, state, 'Update deferred items')
}

/**
 * Which outcomes are about the item.
 *
 * Suppression follows from the item having produced the outcome, so a handoff carrying any
 * cure key is exempt: each key names a configuration, the next item meets it identically, and
 * no comment on this one would cure one. Money running out is the same case arriving without
 * a key. A handoff naming none is the item's, and an Igor would hand it back again on the
 * same text.
 *
 * Carrying a key rather than having been caused by it, because a refusal rides in the trace
 * of whatever the run went on to do and the two are indistinguishable from the item's side: a
 * worker the allowlist stopped and a worker refused something incidental both come back having
 * changed nothing. Read the other way round, one Igor misconfigured for an afternoon parks
 * every item it touched behind a cure nobody has been told to make.
 */
export function shouldDefer(outcome: string, kind?: string, cures: readonly string[] = []): boolean {
  return outcome === 'handed-off' && kind !== 'budget' && cures.length === 0
}

export async function noteHandoff(
  destination: string,
  candidate: Candidate,
  reason: string,
  now: number = Date.now(),
): Promise<void> {
  const state = await loadDeferrals(destination)
  await saveDeferrals(destination, defer(state, candidate, reason, now))
}
