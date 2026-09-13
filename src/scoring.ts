import type { Entry, ProvenanceItem } from './entry.js'

export interface ScoringOptions {
  halfLifeDays: number
  experts?: readonly string[]
  /** Defaults to now; injectable so tests and reports can score as of a given date. */
  asOf?: Date
}

export interface Scores {
  /** Number of independent provenance items. */
  support: number
  /** 1.0 for something recorded today, 0.5 one half-life ago. Reads the freshest item. */
  recency: number
  /** Provenance items authored by a designated expert. */
  expertSupport: number
}

const MS_PER_DAY = 86_400_000

function ageInDays(at: string, asOf: Date): number {
  const then = Date.parse(at)
  if (Number.isNaN(then)) return Number.POSITIVE_INFINITY
  return Math.max(0, (asOf.getTime() - then) / MS_PER_DAY)
}

function decay(at: string, halfLifeDays: number, asOf: Date): number {
  const days = ageInDays(at, asOf)
  if (!Number.isFinite(days)) return 0
  return Math.pow(2, -days / halfLifeDays)
}

/**
 * Scores are computed from provenance every time rather than stored, because a stored
 * recency is wrong the day after it is written.
 *
 * `recency` reads the freshest item rather than summing: the question it answers is
 * "is this still current", which the staleness check needs, and a pile of old evidence
 * should not make a dead convention look alive.
 */
export function score(
  provenance: readonly ProvenanceItem[],
  options: ScoringOptions,
): Scores {
  const asOf = options.asOf ?? new Date()
  const experts = new Set(options.experts ?? [])

  let recency = 0
  let expertSupport = 0
  for (const item of provenance) {
    recency = Math.max(recency, decay(item.at, options.halfLifeDays, asOf))
    if (experts.has(item.author)) expertSupport++
  }

  return { support: provenance.length, recency, expertSupport }
}

export function scoreEntry(entry: Entry, options: ScoringOptions): Scores {
  return score(entry.provenance, options)
}
