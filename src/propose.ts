import { basename } from 'node:path'
import type { Config } from './config.js'
import type { Entry, ProvenanceItem } from './entry.js'
import { GhError } from './gh.js'
import { slugFromClaim } from './id.js'
import { ENTRIES_DIR, REJECTED_DIR } from './store.js'
import {
  assign,
  branchSha,
  createBranchWithFiles,
  defaultBranch,
  filesUnder,
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

export interface Eligibility {
  /** Candidates that may be proposed. */
  entries: Entry[]
  inStore: string[]
  rejected: string[]
}

/**
 * Splits candidates by whether they may be proposed, and why not where they may not.
 *
 * A rejected id is held back forever: a reviewer who deleted it said no, and asking again
 * costs the attention the `provisional` gate exists to spend carefully. The two reasons are
 * reported apart because they are different news — one is nothing to do, the other is a
 * decision being honoured.
 */
export function eligibleToPropose(
  candidates: readonly Entry[],
  taken: ReadonlySet<string>,
  rejected: ReadonlySet<string>,
): Eligibility {
  const result: Eligibility = { entries: [], inStore: [], rejected: [] }
  for (const entry of candidates) {
    if (taken.has(entry.id)) result.inStore.push(entry.id)
    else if (rejected.has(entry.id)) result.rejected.push(entry.id)
    else result.entries.push(entry)
  }
  return result
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

export interface ProposeOutcome {
  results: ProposalResult[]
  /**
   * Candidates dropped against the upstream tip. A caller that filtered against a checkout
   * first and still sees ids here is holding a checkout that is behind.
   */
  skipped: { inStore: string[]; rejected: string[] }
}

/**
 * The ids a store holds at one commit — entries and rejections both.
 *
 * Read from the tree a proposal is committed onto, never from a checkout, because the two are
 * not the same tree. A checkout behind upstream reports an id free that the commit would
 * overwrite, and an overwrite arrives at review as an edit to an entry somebody already
 * approved: not a proposal, so nothing reconciles it, and the pull request is invisible to
 * every report that would have raised it.
 */
async function idsAt(
  repo: string,
  sha: string,
): Promise<{ taken: Set<string>; rejected: Set<string> }> {
  const dirs = await filesUnder(repo, sha, [ENTRIES_DIR, REJECTED_DIR])
  const ids = (dir: string): Set<string> =>
    new Set((dirs.get(dir) ?? []).filter((f) => f.endsWith('.md')).map((f) => basename(f, '.md')))
  return { taken: ids(ENTRIES_DIR), rejected: ids(REJECTED_DIR) }
}

export interface TipIds {
  /** Ids entries hold on the default branch. */
  taken: Set<string>
  /** Ids rejection records hold there. A rejected id is never proposable again. */
  rejected: Set<string>
  /** Both together, which is what an id may not collide with. */
  ids: Set<string>
  /** Why the default branch could not be read, where it could not. All three sets are then empty. */
  unread?: string
}

/**
 * What to tell someone whose new id is not the name their claim derives, because the default
 * branch holds that name and this checkout does not show it.
 *
 * Moving the id in silence reads as a name that was free. Nothing downstream catches the case
 * where it was not: proposing gates on the id, and the moved id really is free there, so a second
 * entry for a claim already upstream is proposed like any other. A rejection holding the name is
 * the graver half — the claim review turned down travels past the gate meant to refuse it — so
 * the two are said differently.
 *
 * Silent where the checkout holds that name in the same kind: the entry, or the rejection, is in
 * front of the person already. Kind by kind, because a name the checkout has as an entry and the
 * branch as a rejection is news the checkout cannot show.
 */
export function upstreamHoldsTheName(
  claim: string,
  id: string,
  tip: TipIds,
  checkout: { taken: ReadonlySet<string>; rejected: ReadonlySet<string> },
): string | undefined {
  const base = slugFromClaim(claim)
  // A name the branch holds both ways is read as the rejection, the half worth stopping for.
  const held =
    tip.rejected.has(base) && !checkout.rejected.has(base)
      ? {
          how: 'is rejected on',
          then: 'read that record: if this is the claim it turned down, it must not be proposed again',
        }
      : tip.taken.has(base) && !checkout.taken.has(base)
        ? {
            how: 'is an entry on',
            then: 'read it: if it makes this claim already, delete this draft rather than proposing a second entry for one claim',
          }
        : undefined
  if (held === undefined) return undefined
  return (
    `! ${base} ${held.how} the destination's default branch, which this checkout does not show, ` +
    `so this one is ${id}.\n` +
    `  Pull the destination and ${held.then} — proposing gates on the id, and ${id} is free there.\n`
  )
}

/**
 * The ids a proposal from this checkout would collide with, read from the default branch.
 *
 * Minting an id against the checkout alone hands out one that upstream already holds, and the
 * proposal carrying it is dropped by the gate above — an entry written under an id that was
 * never free. The same tree answers it before the entry exists.
 *
 * Where the tip cannot be read — no network, no credentials, a store too large to list in one
 * request — the reason comes back rather than an empty set passed off as a complete one. A
 * collision then survives to `propose`, which is late but never silent.
 */
export async function idsOnDefaultBranch(destination: string): Promise<TipIds> {
  try {
    const repo = await repoFromCheckout(destination)
    const sha = await branchSha(repo, await defaultBranch(repo))
    const { taken, rejected } = await idsAt(repo, sha)
    return { taken, rejected, ids: new Set([...taken, ...rejected]) }
  } catch (error) {
    // Only a failure of the read degrades. Anything else is a fault of ours, and swallowing it
    // would hand back an empty store as though the branch had been read and found bare.
    if (!(error instanceof GhError)) throw error
    return { taken: new Set(), rejected: new Set(), ids: new Set(), unread: error.message }
  }
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
): Promise<ProposeOutcome> {
  if (entries.length === 0) {
    throw new ProposeError(
      'every candidate is already in the store or was rejected, so there is nothing to propose',
    )
  }

  const repo = await repoFromCheckout(config.destination)
  const storeIsPublic = config.publicStore ?? (await isPublic(repo))
  await checkProvenanceVisibility(entries, storeIsPublic)

  const base = await defaultBranch(repo)
  const baseSha = await branchSha(repo, base)

  // Gated on the tree the commit below is built on, named by the same sha, so nothing can
  // take an id in between the two.
  const upstream = await idsAt(repo, baseSha)
  const eligible = eligibleToPropose(entries, upstream.taken, upstream.rejected)
  const skipped = { inStore: eligible.inStore, rejected: eligible.rejected }
  if (eligible.entries.length === 0) {
    // Stated as what is true on the default branch, with no remedy attached: a checkout can be
    // behind on `entries/` and ahead on `rejected/` at the same time, and "pull" is wrong for
    // the second — `reconcile` writes rejections locally, and un-rejecting deletes one.
    const why = [
      ...(skipped.inStore.length > 0 ? [`already in the store: ${skipped.inStore.join(', ')}`] : []),
      ...(skipped.rejected.length > 0 ? [`rejected: ${skipped.rejected.join(', ')}`] : []),
    ].join('; ')
    throw new ProposeError(
      `every candidate is taken on ${base}, though this checkout does not show it — ${why}`,
    )
  }

  const now = options.now ?? new Date()

  const results: ProposalResult[] = []
  for (const [author, group] of groupByDominant(eligible.entries)) {
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
      [],
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
  return { results, skipped }
}
