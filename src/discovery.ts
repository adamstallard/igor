import { createHash } from 'node:crypto'
import type { Candidate, Source, Tracker } from './adapter.js'
import { readState, writeState } from './state.js'

/**
 * Stage one of triage, plus the watermark that bounds how often stage three runs.
 *
 * Measured on a busy repository: an open-issue query returns a thousand candidates, of which
 * five were updated in the last day. So the watermark is not an optimization — it is the
 * difference between a few model calls a day and a few hundred every cycle. Correctness still
 * never depends on it: losing it costs re-examination, never a duplicate claim.
 */

/**
 * Only the high-water mark is persisted. Recording the time of the run here too would change
 * the state on every cycle, so every cycle would commit — which is exactly what "write only
 * when something changed" exists to prevent. When the run happened is a property of the run,
 * and belongs in its record rather than in the cache.
 */
export interface Watermark {
  /** Most recent `updatedAt` seen from this source. */
  lastSeen: string
}

export interface DiscoveryState {
  watermarks: Record<string, Watermark>
}

export const STATE_PATH = 'discovery.json'

/** Stable across runs and independent of declaration order, so a reordered config keeps its place. */
export function sourceKey(source: Source): string {
  const digest = createHash('sha256').update(source.query).digest('hex').slice(0, 8)
  return `${source.tracker}:${source.repo}:${digest}`
}

/**
 * How much history a source considers on its very first run.
 *
 * Without a bound, an Igor pointed at an established repository wakes up facing its entire
 * backlog — a thousand candidates, a few hundred surviving predicates, all triaged at once and
 * any of them claimable. That is both a cost spike and, worse, an Igor appearing to lay claim
 * to years of open work in its first minute. A first run therefore looks back a short way and
 * sets the watermark; the backlog is something a person can deliberately hand it later.
 */
export const COLD_START_DAYS = 7

const DAY = 24 * 60 * 60 * 1000

/**
 * Timestamps are compared as instants, never as strings. GitHub returns `...T00:00:00Z` while
 * anything generated here carries milliseconds, and lexicographically `.000Z` sorts before `Z` —
 * so string comparison would call an item fresh purely because of how its timestamp was
 * spelled. An unparseable timestamp sorts oldest, which re-examines rather than skips.
 */
function instant(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? -Infinity : t
}

/**
 * Pure, so the watermark's behaviour is testable without a tracker: given what a search
 * returned and what was seen last time, what still deserves triage?
 */
export function freshCandidates(
  candidates: readonly Candidate[],
  watermark: Watermark | undefined,
  now: number = Date.now(),
  coldStartDays: number = COLD_START_DAYS,
): Candidate[] {
  const floor =
    watermark === undefined ? now - coldStartDays * DAY : instant(watermark.lastSeen)
  return candidates.filter((c) => instant(c.updatedAt) > floor)
}

/** The high-water mark to record, which is the newest thing seen — not the time of the run. */
export function nextWatermark(
  candidates: readonly Candidate[],
  previous: Watermark | undefined,
  now: number = Date.now(),
): Watermark {
  let lastSeen = previous?.lastSeen ?? new Date(now - COLD_START_DAYS * DAY).toISOString()
  for (const c of candidates) if (instant(c.updatedAt) > instant(lastSeen)) lastSeen = c.updatedAt
  return { lastSeen }
}

export interface SourceResult {
  source: Source
  key: string
  /** Everything the query returned, before the watermark, so no caller re-runs the search. */
  candidates: Candidate[]
  returned: number
  /** What the watermark let through, and what triage will therefore consider. */
  fresh: Candidate[]
  watermark: Watermark
  coldStart: boolean
  at: string
}

export async function discoverSource(
  tracker: Tracker,
  source: Source,
  state: DiscoveryState,
  now: number = Date.now(),
): Promise<SourceResult> {
  const key = sourceKey(source)
  const previous = state.watermarks[key]
  const candidates = await tracker.search(source)
  return {
    source,
    key,
    candidates,
    returned: candidates.length,
    fresh: freshCandidates(candidates, previous, now),
    watermark: nextWatermark(candidates, previous, now),
    coldStart: previous === undefined,
    at: new Date(now).toISOString(),
  }
}

/**
 * Runs every source a role declares. Sources are independent, so one tracker being down does
 * not cost the others their cycle — a failure is reported and the source's watermark is left
 * where it was, so nothing is skipped as a result.
 */
export async function discover(
  trackers: Record<string, Tracker>,
  sources: readonly Source[],
  state: DiscoveryState,
  now: number = Date.now(),
): Promise<{ results: SourceResult[]; failures: { source: Source; error: Error }[] }> {
  const results: SourceResult[] = []
  const failures: { source: Source; error: Error }[] = []

  for (const source of sources) {
    const tracker = trackers[source.tracker]
    if (tracker === undefined) {
      failures.push({ source, error: new Error(`no adapter for tracker "${source.tracker}"`) })
      continue
    }
    try {
      results.push(await discoverSource(tracker, source, state, now))
    } catch (error) {
      failures.push({ source, error: error instanceof Error ? error : new Error(String(error)) })
    }
  }
  return { results, failures }
}

/**
 * Pulls each source's mark back below the oldest item nobody managed to look at.
 *
 * Not the same as refusing to move it. Everything older than that item was considered, and
 * making the next cycle reconsider it would cost the model call again for the same answer —
 * while letting the mark pass the item nothing looked at would drop it from the pool, since
 * nothing is going to touch it and make it fresh again.
 */
export function heldBelow(
  results: readonly SourceResult[],
  unexamined: ReadonlySet<string>,
): SourceResult[] {
  if (unexamined.size === 0) return [...results]
  return results.map((result) => {
    let oldest: number | undefined
    for (const candidate of result.candidates) {
      if (!unexamined.has(candidate.id)) continue
      const at = instant(candidate.updatedAt)
      if (oldest === undefined || at < oldest) oldest = at
    }
    if (oldest === undefined || !Number.isFinite(oldest)) return result
    if (instant(result.watermark.lastSeen) < oldest) return result
    return { ...result, watermark: { lastSeen: new Date(oldest - 1).toISOString() } }
  })
}

/** Folds results into the state to persist. Unchanged sources keep their previous entry. */
export function advance(state: DiscoveryState, results: readonly SourceResult[]): DiscoveryState {
  const watermarks = { ...state.watermarks }
  for (const result of results) watermarks[result.key] = result.watermark
  return { watermarks }
}

export const EMPTY_STATE: DiscoveryState = { watermarks: {} }

/** Absent state is a cold start, not an error — the branch may not exist yet, or may be gone. */
export async function loadDiscoveryState(repo: string): Promise<DiscoveryState> {
  const stored = await readState<DiscoveryState>(repo, STATE_PATH)
  return stored?.watermarks === undefined ? EMPTY_STATE : stored
}

/**
 * Returns whether anything was actually written. Most cycles change nothing, and committing
 * regardless would fill the branch with empty commits.
 */
export async function saveDiscoveryState(repo: string, state: DiscoveryState): Promise<boolean> {
  return writeState(repo, STATE_PATH, state, 'Update discovery watermarks')
}
