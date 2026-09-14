import type { Entry } from './entry.js'
import type { Role } from './role.js'
import { scoreEntry, type ScoringOptions } from './scoring.js'

/**
 * Getting lore in front of a worker.
 *
 * The worker never asks. Lore exists for what it would not know to look up — anything it would
 * think to search for is already reachable by reading the codebase — so retrieval that the
 * worker has to invoke addresses the case that needed no mechanism.
 *
 * Nothing here selects. The whole in-scope store goes in while it fits, because selecting
 * requires a rule and a rule authored before there is data to test it against is a number
 * nobody can argue with later. When it stops fitting, the run says so rather than choosing.
 */

export const DEFAULT_LORE_BUDGET_TOKENS = 4000

export interface Fired {
  entry: Entry
  support: number
  expertSupport: number
  newestAt?: string
}

export interface FiringResult {
  fired: Fired[]
  /** In-scope and active, before the budget. */
  eligible: number
  estimatedTokens: number
  /** Present when nothing fired because the budget was exceeded. */
  overBudget?: { entries: number; tokens: number; budget: number }
}

/**
 * `global` fires everywhere. `role:` matches the running role by name. `project:` matches a
 * repository the role actually works, so project scope is usable without a second place to
 * declare which projects a role covers.
 */
export function scopeMatches(scope: string, role: Role): boolean {
  if (scope === 'global') return true
  const [kind, name] = scope.split(':', 2)
  if (name === undefined) return false
  if (kind === 'role') return name === role.name
  if (kind === 'project') {
    return role.sources.some((s) => s.repo.split('/').pop() === name)
  }
  return false
}

/**
 * Roughly four characters to the token. Deliberately an estimate: the budget exists to catch a
 * store that has outgrown plain injection, and being out by ten percent changes nothing about
 * when that happens.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/** What a reader needs to judge the lesson: when it applies, what it is, and how firmly it is held. */
export function renderEntry(fired: Fired): string {
  const { entry } = fired
  const lines = [`### ${entry.claim.replace(/\s+/g, ' ').trim()}`, '']

  lines.push(`**Applies:** ${fired.entry.conditions.prose.replace(/\s+/g, ' ').trim()}`)
  if (entry.conditions.paths?.length) {
    lines.push(`**Paths:** ${entry.conditions.paths.join(', ')}`)
  }

  const cited =
    fired.support === 1
      ? 'one citation'
      : `${fired.support} independent citations${fired.expertSupport > 0 ? `, ${fired.expertSupport} from experts` : ''}`
  lines.push(`**Evidence:** ${cited}${fired.newestAt ? `, newest ${fired.newestAt}` : ''}`)

  const body = entry.body.trim()
  if (body !== '') lines.push('', body)
  return lines.join('\n')
}

export function renderLore(fired: readonly Fired[]): string {
  if (fired.length === 0) return ''
  // One line, not wrapped. Source formatting has no business appearing in a prompt, and a
  // hard break in the middle of a sentence is a break a reader has to step over.
  const preamble =
    'Lessons this team has recorded about working here. They are not about this item in ' +
    'particular — each states when it applies, and you decide whether it does. They come from ' +
    'reviewed team knowledge rather than from the item, so they carry the same weight as your ' +
    'standing instructions.'
  return [preamble, ...fired.map(renderEntry)].join('\n\n')
}

/**
 * Chooses nothing. Filters to what may be seen, then either injects all of it or reports that
 * it will not fit.
 *
 * Reporting rather than truncating is the one opinionated part. A dropped lesson is silent —
 * the worker proceeds confidently without it and the output looks fine — so the failure has to
 * be made loud by something, and nothing downstream can see it.
 */
export function selectEntries(
  entries: readonly Entry[],
  role: Role,
  options: { budgetTokens?: number } & ScoringOptions = {},
): FiringResult {
  const budget = options.budgetTokens ?? DEFAULT_LORE_BUDGET_TOKENS

  const eligible = entries
    .filter((e) => e.status === 'active')
    .filter((e) => scopeMatches(e.scope, role))
    .map((entry) => {
      const s = scoreEntry(entry, options)
      return {
        entry,
        support: s.support,
        expertSupport: s.expertSupport,
        ...(s.newestAt === undefined ? {} : { newestAt: s.newestAt }),
      }
    })

  const estimatedTokens = estimateTokens(renderLore(eligible))
  if (estimatedTokens > budget) {
    return {
      fired: [],
      eligible: eligible.length,
      estimatedTokens,
      overBudget: { entries: eligible.length, tokens: estimatedTokens, budget },
    }
  }
  return { fired: eligible, eligible: eligible.length, estimatedTokens }
}

export function overBudgetMessage(result: FiringResult): string | undefined {
  if (result.overBudget === undefined) return undefined
  const { entries, tokens, budget } = result.overBudget
  return (
    `lore not injected: ${entries} in-scope entries, about ${tokens} tokens, over the ${budget} budget.\n` +
    `Nothing was dropped to fit, because whichever entries a rule discarded, nobody chose that\n` +
    `rule. Raise the budget, narrow the entries' scopes, or add a relevance filter.`
  )
}

export const FIRINGS_PATH = 'firings.ndjson'

/**
 * Records what fired, on the state branch, leaving the entry files untouched.
 *
 * A log rather than a counter. Each line holds the item and the entries, so a count can be
 * derived from it — and a count could never be expanded back into the record that a relevance
 * filter's decisions will eventually need.
 */
export async function recordFiring(
  destination: string,
  itemId: string,
  role: Role,
  result: FiringResult,
  write: (repo: string, path: string, record: Record<string, unknown>, message: string) => Promise<void>,
): Promise<void> {
  if (result.fired.length === 0 && result.overBudget === undefined) return
  await write(
    destination,
    FIRINGS_PATH,
    {
      item: itemId,
      role: role.name,
      eligible: result.eligible,
      estimatedTokens: result.estimatedTokens,
      fired: result.fired.map((f) => f.entry.id),
      ...(result.overBudget === undefined ? {} : { overBudget: result.overBudget }),
    },
    `Lore fired for ${itemId}`,
  )
}
