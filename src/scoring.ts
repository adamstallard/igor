import type { Entry, ProvenanceItem } from './entry.js'

export interface ScoringOptions {
  experts?: readonly string[]
}

export interface Scores {
  /** Number of independent provenance items. */
  support: number
  /** Provenance items authored by a designated expert. */
  expertSupport: number
  /** Date of the freshest provenance item, or undefined when there is none. */
  newestAt?: string
}

/**
 * Derived from provenance every time rather than stored, because a stored count is wrong the
 * moment someone adds a citation.
 *
 * There is no time-decayed weight. Lore is mined from historical review comments and is old by
 * construction, so a decay curve reports an entire store as stale while saying nothing about
 * whether any lesson still holds — and it buries the most architectural entries, whose evidence
 * is oldest precisely because they have held longest. The date is the fact; what to make of it
 * is a reader's judgment.
 */
export function score(provenance: readonly ProvenanceItem[], options: ScoringOptions = {}): Scores {
  const experts = new Set(options.experts ?? [])
  let expertSupport = 0
  let newestAt: string | undefined

  for (const item of provenance) {
    if (experts.has(item.author)) expertSupport++
    const at = Date.parse(item.at)
    if (Number.isNaN(at)) continue
    if (newestAt === undefined || at > Date.parse(newestAt)) newestAt = item.at
  }

  return { support: provenance.length, expertSupport, ...(newestAt === undefined ? {} : { newestAt }) }
}

export function scoreEntry(entry: Entry, options: ScoringOptions = {}): Scores {
  return score(entry.provenance, options)
}
