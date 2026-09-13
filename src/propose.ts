import type { Config } from './config.js'
import type { Entry, ProvenanceItem } from './entry.js'
import { ENTRIES_DIR } from './store.js'
import {
  assign,
  branchSha,
  createBranchWithFiles,
  defaultBranch,
  isPublic,
  openPullRequest,
  repoFromCheckout,
  requestReviewers,
  type OpenedPr,
} from './github.js'

export const BRANCH_PREFIX = 'lore/propose/'

export class ProposeError extends Error {}

function latestFor(author: string, provenance: readonly ProvenanceItem[]): string {
  return provenance
    .filter((p) => p.author === author)
    .map((p) => p.at)
    .sort()
    .at(-1)!
}

/**
 * The author contributing the most provenance items. An equal split breaks toward the later
 * contribution, as the one closer to current practice.
 */
export function dominantAuthor(entry: Entry): string {
  const counts = new Map<string, number>()
  for (const item of entry.provenance) {
    counts.set(item.author, (counts.get(item.author) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1]
    return latestFor(b[0], entry.provenance).localeCompare(latestFor(a[0], entry.provenance))
  })[0]![0]
}

export function contributingAuthors(entry: Entry): string[] {
  return [...new Set(entry.provenance.map((p) => p.author))]
}

export function groupByDominant(entries: readonly Entry[]): Map<string, Entry[]> {
  const groups = new Map<string, Entry[]>()
  for (const entry of entries) {
    const author = dominantAuthor(entry)
    groups.set(author, [...(groups.get(author) ?? []), entry])
  }
  return groups
}

function repoOf(url: string): string | undefined {
  return url.match(/github\.com\/([^/]+\/[^/]+)/)?.[1]
}

/**
 * A public store must not accumulate knowledge derived from private repositories — the
 * failure is silent and nobody notices it later.
 */
export async function checkProvenanceVisibility(
  entries: readonly Entry[],
  storeIsPublic: boolean,
): Promise<void> {
  if (!storeIsPublic) return
  const repos = new Set<string>()
  for (const entry of entries) {
    for (const item of entry.provenance) {
      const repo = item.url === undefined ? undefined : repoOf(item.url)
      if (repo) repos.add(repo)
    }
  }
  const offending: string[] = []
  for (const repo of repos) {
    if (!(await isPublic(repo))) offending.push(repo)
  }
  if (offending.length > 0) {
    throw new ProposeError(
      `the destination is public but these entries cite private repositories: ${offending.join(', ')}`,
    )
  }
}

export function pullRequestBody(entries: readonly Entry[], author: string): string {
  const lines: string[] = [
    `These are proposed lore entries drawn from review comments you wrote. Each one is a`,
    `convention someone would want an agent — or a new colleague — to know without being told.`,
    ``,
    `## How to review`,
    ``,
    `- **Delete a file** to reject that entry. Rejection is permanent: it will not be proposed again.`,
    `- **Edit a file** to fix the wording, the conditions, or the scope. Edits are kept as-is.`,
    `- **Merge** to accept everything still present.`,
    `- **Close without merging** to defer. Nothing is rejected and these can be proposed again.`,
    ``,
    `Entries land as \`provisional\` and are promoted to \`active\` on the next run, which also`,
    `records anything you deleted.`,
    ``,
    `## Proposed (${entries.length})`,
    ``,
  ]

  for (const entry of entries) {
    const others = contributingAuthors(entry).filter((a) => a !== author)
    lines.push(`### \`${entry.id}\``)
    lines.push('')
    lines.push(`> ${entry.claim.replace(/\s+/g, ' ').trim()}`)
    lines.push('')
    lines.push(`**Applies:** ${entry.conditions.prose.replace(/\s+/g, ' ').trim()}`)
    if (entry.conditions.paths?.length) {
      lines.push(`**Paths:** ${entry.conditions.paths.map((p) => `\`${p}\``).join(', ')}`)
    }
    if (others.length > 0) {
      // Plain names, not @mentions: a mention notifies someone who may have no idea this
      // repository exists, and they did not ask to be pulled into it.
      lines.push(`**Also drawn from:** ${others.join(', ')}`)
    }
    lines.push(`**Derived from ${entry.provenance.length} comment(s):**`)
    for (const item of entry.provenance) {
      lines.push(`- ${item.url ?? `written by ${item.author}`} — ${item.at}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}

export interface ProposalResult {
  author: string
  entries: string[]
  reviewers: string[]
  pr: OpenedPr
  /** Set when the dominant author could not be assigned and the store reviewers took it. */
  reassignedTo?: string[]
}

function branchName(author: string, now: Date): string {
  const stamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 12)
  return `${BRANCH_PREFIX}${author.toLowerCase()}-${stamp}`
}

export async function propose(
  config: Config,
  entries: readonly Entry[],
  serialize: (entry: Entry) => string,
  options: { now?: Date } = {},
): Promise<ProposalResult[]> {
  if (entries.length === 0) throw new ProposeError('no candidates to propose')

  const repo = await repoFromCheckout(config.destination)
  const storeIsPublic = config.publicStore ?? (await isPublic(repo))
  await checkProvenanceVisibility(entries, storeIsPublic)

  const base = await defaultBranch(repo)
  const baseSha = await branchSha(repo, base)
  const now = options.now ?? new Date()

  const results: ProposalResult[] = []
  for (const [author, group] of groupByDominant(entries)) {
    const branch = branchName(author, now)
    const files = group.map((entry) => ({
      path: `${ENTRIES_DIR}/${entry.id}.md`,
      content: serialize(entry),
    }))

    await createBranchWithFiles(
      repo,
      branch,
      baseSha,
      files,
      `Propose ${group.length} lore ${group.length === 1 ? 'entry' : 'entries'} from ${author}'s reviews`,
    )

    const pr = await openPullRequest(
      repo,
      branch,
      base,
      `Lore: ${group.length} ${group.length === 1 ? 'entry' : 'entries'} from ${author}'s reviews`,
      pullRequestBody(group, author),
    )

    const others = [...new Set(group.flatMap(contributingAuthors))].filter((a) => a !== author)
    let assigned = await assign(repo, pr.number, [author])
    let reassignedTo: string[] | undefined

    if (!assigned.includes(author)) {
      // The dominant author is not a collaborator here — common when mining a repository
      // whose contributors are not in the lore repository. Falling back keeps the pull
      // request from sitting unowned, which is the same reasoning as a departed author.
      assigned = await assign(repo, pr.number, config.reviewers)
      reassignedTo = assigned
    }
    await requestReviewers(repo, pr.number, others)

    results.push({
      author,
      entries: group.map((e) => e.id),
      reviewers: others,
      pr,
      ...(reassignedTo ? { reassignedTo } : {}),
    })
  }
  return results
}
