import picomatch from 'picomatch'
import type { Candidate } from './adapter.js'
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
 * Skips no configuration can switch off. These are not lanes an org could forget to write:
 * acting on a closed item, or on one already being worked, is visible noise on a surface
 * people watch rather than an organizational preference.
 */
export function universalSkip(candidate: Candidate): Verdict | undefined {
  if (candidate.state === 'closed') return skip('universal', 'item is closed')
  if (candidate.inFlight) {
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
export function screen(lane: Lane, candidates: readonly Candidate[]): Triaged[] {
  return candidates.map((candidate) => ({
    candidate,
    verdict: universalSkip(candidate) ?? laneVerdict(lane, candidate),
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
