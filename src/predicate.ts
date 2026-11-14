import picomatch from 'picomatch'
import type { Candidate, InFlight } from './adapter.js'
import type { Lane } from './role.js'

/**
 * Stage two of triage: declarative predicates over normalized candidates.
 *
 * Free, deterministic, and where an org's own conventions live — which is what lets the model
 * call be reserved for the residue. The same evaluator answers "is this in lane" and "does
 * this lore entry fire", so the two can never disagree about what a path predicate means.
 */

export type Stage = 'universal' | 'predicate' | 'model'

export interface Verdict {
  outcome: 'proceed' | 'skip'
  stage: Stage
  /** Human-readable, and specific enough to name what excluded the candidate. */
  reason: string
}

const proceed = (stage: Stage, reason: string): Verdict => ({ outcome: 'proceed', stage, reason })
const skip = (stage: Stage, reason: string): Verdict => ({ outcome: 'skip', stage, reason })

/** Compiled once per evaluation rather than per candidate — a lane is checked against many. */
function globMatcher(patterns: string[]): (path: string) => boolean {
  const matchers = patterns.map((p) => picomatch(p))
  return (path: string) => matchers.some((m) => m(path))
}

/**
 * The Igor's own in-flight artifact, where it can no longer merge — the one thing in flight
 * that is not somebody else's work in review.
 *
 * Only a stated conflict counts; see `Mergeability` for why unknown is not a conflict. Without
 * an identity nothing is ours, which is the safe direction for a preview that does not know
 * who would be running.
 */
export function staleOwnArtifact(candidate: Candidate, as?: string): InFlight | undefined {
  const artifact = candidate.inFlight
  if (artifact === undefined || as === undefined || as === '') return undefined
  if (artifact.author !== as) return undefined
  return artifact.mergeable === 'conflicting' ? artifact : undefined
}

/**
 * What a tracker's holder field shows for this Igor, and whether that field is separate from
 * the assignee. Read off the tracker, so these rules never name the field.
 */
export interface Holding {
  holder: string
  distinctFromAssignee: boolean
}

/**
 * Who, other than this Igor, holds an item: the reason it is not this Igor's to claim. Empty
 * where it may be claimed.
 *
 * - **Another holder in the holder field** means the item is somebody else's, even where this
 *   Igor is also there: on GitHub, another Igor's `igor:` label. A person reassigns an issue by
 *   removing the holding Igor's label first, never by adding a second.
 * - **Where the holder field is distinct from the assignee**, an item assigned to a person is
 *   theirs unless the holder field names this Igor: handing it over is their decision.
 *
 * Without `holding` (a preview that does not know which Igor would run), every assignee other
 * than `as` reads as somebody else, which is the safe direction.
 */
export function heldByOthers(candidate: Candidate, as?: string, holding?: Holding): string[] {
  if (holding === undefined) return candidate.assignees.filter((a) => a !== as)
  const others = candidate.holders.filter((h) => h !== holding.holder)
  if (others.length > 0) return others
  if (holding.distinctFromAssignee && !candidate.holders.includes(holding.holder)) return [...candidate.assignees]
  return []
}

/**
 * Skips no configuration can switch off. These are not lanes an org could forget to write:
 * acting on a closed item, on one already being worked, or on one somebody else holds is
 * visible noise on a surface people watch rather than an organizational preference.
 *
 * Who holds an item is `heldByOthers`, the same reading a stopped item is checked against.
 *
 * The in-flight rule narrows rather than gains an exception. It exists because duplicating
 * work in review is never an organizational preference — and an artifact of one's own that
 * cannot merge is not duplication, it is the same work, unfinished. It is read last so that
 * an item both in flight and taken over by somebody else reports the holder, which is the
 * more useful of the two reasons and the one that keeps the Igor off it either way.
 */
export function universalSkip(candidate: Candidate, as?: string, holding?: Holding): Verdict | undefined {
  if (candidate.state === 'closed') return skip('universal', 'item is closed')
  const others = heldByOthers(candidate, as, holding)
  if (others.length > 0) return skip('universal', `held by ${others.join(', ')}`)
  if (candidate.inFlight && staleOwnArtifact(candidate, as) === undefined) {
    return skip('universal', `work already in flight: ${candidate.inFlight.ref}`)
  }
  return undefined
}

/**
 * Every inclusive constraint is a group from one level of the role's lineage: any member
 * satisfies the group, and every group must be satisfied. See `Lane`.
 */
export function laneVerdict(lane: Lane, candidate: Candidate): Verdict {
  const excludes = lane.labels?.excludes ?? []
  const hit = candidate.labels.filter((l) => excludes.includes(l))
  if (hit.length > 0) return skip('predicate', `excluded by label: ${hit.join(', ')}`)

  for (const group of lane.labels?.includes ?? []) {
    if (!candidate.labels.some((l) => group.includes(l))) {
      return skip('predicate', `carries none of the required labels: ${group.join(' or ')}`)
    }
  }

  for (const group of lane.paths?.under ?? []) {
    const matches = globMatcher(group)
    if (!candidate.paths.some(matches)) {
      const named = candidate.paths.length === 0 ? 'names no paths' : `names ${candidate.paths.join(', ')}`
      return skip('predicate', `${named}, none under ${group.join(' or ')}`)
    }
  }

  const maxDays = lane.age?.maxDays
  if (maxDays !== undefined && candidate.ageDays > maxDays) {
    return skip('predicate', `created ${candidate.ageDays} days ago, over the ${maxDays}-day limit`)
  }

  return proceed('predicate', 'in lane')
}

export interface Triaged {
  candidate: Candidate
  verdict: Verdict
}

/**
 * Runs the free stages over a whole discovery result. Returns a verdict for every candidate,
 * including the skips, so the ratio at each stage is determinable from the record rather than
 * estimated.
 */
export function screen(lane: Lane, candidates: readonly Candidate[], as?: string, holding?: Holding): Triaged[] {
  return candidates.map((candidate) => ({
    candidate,
    verdict: universalSkip(candidate, as, holding) ?? laneVerdict(lane, candidate),
  }))
}

export interface StageCounts {
  total: number
  universal: number
  predicate: number
  survivors: number
}

export function countStages(triaged: readonly Triaged[]): StageCounts {
  let universal = 0
  let predicate = 0
  for (const { verdict } of triaged) {
    if (verdict.outcome === 'skip') {
      if (verdict.stage === 'universal') universal++
      else predicate++
    }
  }
  return {
    total: triaged.length,
    universal,
    predicate,
    survivors: triaged.length - universal - predicate,
  }
}
