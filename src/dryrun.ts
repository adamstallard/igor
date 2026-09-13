import type { Candidate, Tracker } from './adapter.js'
import { GitHubTracker } from './github-adapter.js'
import { countStages, screen, type Triaged } from './predicate.js'
import { freshCandidates, type Watermark } from './discovery.js'
import type { ResolvedRole } from './role.js'
import { systemPrompt, triageBatch, TRIAGE_MODEL } from './triage.js'

/**
 * Reports what a role would pick up, and why, without claiming or posting anything.
 *
 * This is the milestone the build order exists to reach: lane predicates get found wrong here,
 * against real data, before anything is visible to colleagues. It deliberately does not read or
 * write the watermark — a dry run must be repeatable, and it must never move the loop's state.
 */

export interface DryRunOptions {
  /** How far back to look. Independent of any stored watermark, so the run is repeatable. */
  sinceDays: number
  /** Cap on model calls, since the residue on a first look can be large. */
  limit: number
  useModel: boolean
  model: string
}

export const DRY_RUN_DEFAULTS: DryRunOptions = {
  sinceDays: 7,
  limit: 20,
  useModel: true,
  model: TRIAGE_MODEL,
}

export interface DryRunReport {
  role: string
  lines: string[]
  costUsd: number
  wouldClaim: Candidate[]
}

const pct = (n: number, of: number) => (of === 0 ? '  0%' : `${String(Math.round((n / of) * 100)).padStart(3)}%`)

function windowWatermark(sinceDays: number, now: number): Watermark {
  return { lastSeen: new Date(now - sinceDays * 24 * 60 * 60 * 1000).toISOString() }
}

export async function dryRun(
  resolved: ResolvedRole,
  options: Partial<DryRunOptions> = {},
  trackers: Record<string, Tracker> = { github: new GitHubTracker() },
  now: number = Date.now(),
): Promise<DryRunReport> {
  const opts = { ...DRY_RUN_DEFAULTS, ...options }
  const { role } = resolved
  const lines: string[] = [`dry run — role "${role.name}", nothing will be claimed or posted`, '']

  if (role.sources.length === 0) {
    lines.push('This role declares no sources, so it would never find anything.')
    return { role: role.name, lines, costUsd: 0, wouldClaim: [] }
  }

  const screened: Triaged[] = []
  for (const source of role.sources) {
    const tracker = trackers[source.tracker]
    if (tracker === undefined) {
      lines.push(`  ${source.tracker} ${source.repo}  — no adapter for this tracker, skipped`)
      continue
    }
    const returned = await tracker.search(source)
    const fresh = freshCandidates(returned, windowWatermark(opts.sinceDays, now), now)
    const stage = screen(role.lane, fresh)
    screened.push(...stage)

    const counts = countStages(stage)
    lines.push(
      `source  ${source.tracker} ${source.repo}  ${source.query}`,
      `  returned by query        ${String(returned.length).padStart(5)}`,
      `  updated in last ${String(opts.sinceDays).padStart(2)} days  ${String(fresh.length).padStart(5)}`,
      `  skipped, closed or busy  ${String(counts.universal).padStart(5)}  ${pct(counts.universal, fresh.length)}`,
      `  skipped by lane          ${String(counts.predicate).padStart(5)}  ${pct(counts.predicate, fresh.length)}`,
      `  reaching the model       ${String(counts.survivors).padStart(5)}  ${pct(counts.survivors, fresh.length)}`,
      '',
    )
  }

  const survivors = screened.filter((t) => t.verdict.outcome === 'proceed').map((t) => t.candidate)
  const skipped = screened.filter((t) => t.verdict.outcome === 'skip')

  if (skipped.length > 0) {
    lines.push(`skipped before any model call (${skipped.length}):`)
    for (const { candidate, verdict } of skipped.slice(0, 40)) {
      lines.push(`  ${candidate.native.padStart(6)}  ${verdict.reason}  — ${candidate.title.slice(0, 60)}`)
    }
    if (skipped.length > 40) lines.push(`  … and ${skipped.length - 40} more`)
    lines.push('')
  }

  if (!opts.useModel) {
    lines.push(`${survivors.length} would reach the model. Re-run without --no-model to see its verdicts.`)
    return { role: role.name, lines, costUsd: 0, wouldClaim: [] }
  }

  const considered = survivors.slice(0, opts.limit)
  if (survivors.length > opts.limit) {
    lines.push(`triaging the first ${opts.limit} of ${survivors.length} survivors (--limit to change)`, '')
  }

  const system = systemPrompt(role.name, role.instructions)
  const batch = await triageBatch(considered, system, opts.model)

  const wouldClaim: Candidate[] = []
  lines.push(`model verdicts (${batch.results.length}):`)
  for (const { candidate, verdict } of batch.results) {
    const mark = verdict.outcome === 'proceed' ? 'CLAIM' : 'skip '
    if (verdict.outcome === 'proceed') wouldClaim.push(candidate)
    lines.push(`  ${mark} ${candidate.native.padStart(6)}  ${candidate.title.slice(0, 52)}`)
    lines.push(`         ${verdict.reason}`)
  }
  for (const { candidate, error } of batch.failures) {
    lines.push(`  ERROR ${candidate.native.padStart(6)}  ${error.message.slice(0, 80)}`)
  }

  lines.push(
    '',
    `would claim ${wouldClaim.length} of ${considered.length} triaged`,
    `model cost  $${batch.costUsd.toFixed(4)}` +
      (batch.results.length > 0 ? `  ($${(batch.costUsd / batch.results.length).toFixed(4)} each)` : ''),
    '',
    'Nothing was claimed, assigned, or posted.',
  )
  return { role: role.name, lines, costUsd: batch.costUsd, wouldClaim }
}
