import { gh, ghGraphql, ghPaginated } from './gh.js'
import { isStop } from './signals.js'
import {
  AdapterError,
  daysSince,
  extractPaths,
  type Artifact,
  type ArtifactRequest,
  type Candidate,
  type ClaimVerdict,
  type Comment,
  type CatchUp,
  type CatchUpRequest,
  type CodeHost,
  type InFlight,
  type Mergeability,
  type ResolutionRequest,
  type Source,
  type Tracker,
} from './adapter.js'
import {
  branchSha,
  commitOnBranch,
  createBranchWithFiles,
  defaultBranch,
  mergeIntoBranch,
  openPullRequest,
  requestReviewers,
} from './github.js'

/**
 * One request returns issues with their labels, assignees and linked pull requests, at a
 * rate-limit cost of 1 per page. The REST equivalent is a search plus a call per issue to find
 * out whether work is in flight — which is the cost shape the whole three-stage triage exists
 * to avoid, paid before triage even starts.
 */
const SEARCH = `
query($q: String!, $n: Int!, $after: String) {
  search(query: $q, type: ISSUE, first: $n, after: $after) {
    pageInfo { hasNextPage endCursor }
    nodes {
      ... on Issue {
        number
        url
        title
        body
        state
        createdAt
        updatedAt
        author { login }
        labels(first: 50) { nodes { name } }
        assignees(first: 10) { nodes { login } }
        timelineItems(itemTypes: [CROSS_REFERENCED_EVENT, CONNECTED_EVENT], first: 20) {
          nodes {
            ... on CrossReferencedEvent { source { ...pr } }
            ... on ConnectedEvent { subject { ...pr } }
          }
        }
      }
    }
  }
}

fragment pr on PullRequest {
  number
  url
  state
  isDraft
  mergeable
  headRefName
  baseRefName
  author { login }
}`

interface RawPr {
  number: number
  url: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
  /** Computed asynchronously, so `UNKNOWN` — or nothing at all — is the ordinary first answer. */
  mergeable?: 'MERGEABLE' | 'CONFLICTING' | 'UNKNOWN' | null
  headRefName?: string
  baseRefName?: string
  author?: { login: string } | null
}

export interface RawIssue {
  number: number
  url: string
  title: string
  body: string | null
  state: 'OPEN' | 'CLOSED'
  createdAt: string
  updatedAt: string
  author: { login: string } | null
  labels: { nodes: { name: string }[] }
  assignees: { nodes: { login: string }[] }
  timelineItems: { nodes: ({ source?: RawPr | null; subject?: RawPr | null } | null)[] }
}

/**
 * Only an **open** pull request is work in flight. A merged one means the work is done and a
 * closed one means it was abandoned; treating either as in-flight would make an Igor skip
 * every issue that was ever attempted.
 */
function inFlightFrom(issue: RawIssue): InFlight | undefined {
  for (const node of issue.timelineItems.nodes) {
    const pr = node?.source ?? node?.subject
    if (pr && pr.state === 'OPEN') {
      const branch = pr.headRefName ?? ''
      const base = pr.baseRefName ?? ''
      return {
        kind: 'pull-request',
        ref: `#${pr.number}`,
        url: pr.url,
        draft: pr.isDraft,
        author: pr.author?.login ?? '',
        // An artifact whose branch or base did not come back is unknown however it reported
        // its mergeability: acting on one means merging into a branch named by nothing.
        mergeable: branch === '' || base === '' ? 'unknown' : mergeabilityFrom(pr.mergeable),
        branch,
        base,
      }
    }
  }
  return undefined
}

/** Anything but a stated `CONFLICTING` is `unknown` rather than a pessimistic guess. */
function mergeabilityFrom(raw: RawPr['mergeable']): Mergeability {
  if (raw === 'MERGEABLE') return 'clean'
  if (raw === 'CONFLICTING') return 'conflicting'
  return 'unknown'
}

/**
 * Pure, so the normalized shape can be tested against fixtures rather than against the
 * network — including the cases that differ only by absence.
 */
export function normalizeIssue(repo: string, issue: RawIssue, now: number = Date.now()): Candidate {
  const body = issue.body ?? ''
  const inFlight = inFlightFrom(issue)
  return {
    id: `github:${repo}#${issue.number}`,
    tracker: 'github',
    repo,
    native: String(issue.number),
    url: issue.url,
    title: issue.title,
    body,
    author: issue.author?.login ?? '',
    state: issue.state === 'OPEN' ? 'open' : 'closed',
    labels: issue.labels.nodes.map((l) => l.name),
    assignees: issue.assignees.nodes.map((a) => a.login),
    paths: extractPaths(issue.title, body),
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt,
    ageDays: daysSince(issue.createdAt, now),
    idleDays: daysSince(issue.updatedAt, now),
    ...(inFlight === undefined ? {} : { inFlight }),
  }
}

interface SearchResult {
  search: { pageInfo: { hasNextPage: boolean; endCursor: string }; nodes: (RawIssue | null)[] }
}

/**
 * Issue bodies are what make a page expensive. Measured against a repository with long ones,
 * 30 per page succeeds and 50 returns "Resource limits for this query exceeded" — but the
 * ceiling moves with body length, so it is a repo-dependent property rather than a constant to
 * hardcode confidently. Start below the measured limit and halve on refusal.
 */
const PAGE_SIZE = 25
const MIN_PAGE_SIZE = 5
/**
 * Enough pages to reach GitHub's own 1000-result search cap, so truncation is always the
 * surface's rather than a limit of ours quietly hiding candidates. A query that actually
 * returns a thousand issues is a query needing narrowing, which `dry-run` is what surfaces.
 */
const MAX_PAGES = Math.ceil(1000 / MIN_PAGE_SIZE)

export interface RawComment {
  body: string | null
  user: { login: string } | null
  created_at: string
}

/**
 * Pure, so the precedence between a stop and a lost claim can be tested against fixtures
 * rather than against the network.
 *
 * **Any holder other than this Igor means the item is not ours**, even where the Igor's own
 * name is still on it: people add themselves to an assignee list rather than replacing what
 * is there, so a second name reads as somebody taking the work. Do not reach for the
 * timeline's `AssignedEvent` timestamps to decide who was first — an assignment can be
 * removed and re-added, so the earliest event naming a login need not be the one that
 * produced the current state, and standing down is right for a colleague joining just as
 * much as for one who won a race.
 */
export function verdictFrom(
  as: string,
  holders: readonly string[],
  comments: readonly RawComment[],
): ClaimVerdict {
  // Read before the holders, because a stop outranks a lost claim: it carries a receipt
  // obligation, and someone who stops an Igor may well unassign it in the same breath.
  for (const comment of comments) {
    const body = comment.body ?? ''
    if (isStop(body, as)) {
      return {
        status: 'stopped',
        ...(comment.user ? { by: comment.user.login } : {}),
        at: comment.created_at,
        reason: body.trim().slice(0, 500),
      }
    }
  }

  const other = holders.find((h) => h !== as)
  if (other !== undefined) return { status: 'lost', by: other }
  return holders.length > 0 ? { status: 'held' } : { status: 'lost' }
}

/**
 * Pure, and total over what the endpoint can return: a deleted author comes back as null, and
 * a caller comparing identities should never have to consider undefined.
 */
export function commentsFrom(raw: readonly RawComment[] | null | undefined): Comment[] {
  return (raw ?? []).map((c) => ({ author: c.user?.login ?? '', at: c.created_at, body: c.body ?? '' }))
}

export class GitHubTracker implements Tracker {
  readonly name = 'github'
  /** GitHub has assignees, so a claim is visible where people already look. */
  readonly nativeHolderField = true

  private login?: string

  async identity(): Promise<string> {
    if (this.login === undefined) {
      const me = await gh<{ login: string }>(['api', 'user', '--jq', '{login}'])
      this.login = me.login
    }
    return this.login
  }

  /**
   * The query is passed through verbatim. Stage one is deliberately loose and written in the
   * tracker's own language; narrowing is the job of predicates, where an org's conventions
   * live and where evaluation is free.
   */
  async search(source: Source): Promise<Candidate[]> {
    const q = `repo:${source.repo} ${source.query}`.trim()
    const out: Candidate[] = []
    let after: string | undefined
    let size = PAGE_SIZE
    const now = Date.now()

    for (let page = 0; page < MAX_PAGES; page++) {
      let data: SearchResult
      for (;;) {
        try {
          data = await ghGraphql<SearchResult>(SEARCH, {
            q,
            n: size,
            ...(after === undefined ? {} : { after }),
          })
          break
        } catch (error) {
          const refused = error instanceof Error && /Resource limits/i.test(error.message)
          if (!refused || size <= MIN_PAGE_SIZE) throw error
          size = Math.max(MIN_PAGE_SIZE, Math.floor(size / 2))
        }
      }

      for (const node of data.search.nodes) {
        // Search over type ISSUE returns pull requests too; they arrive as empty selections.
        if (node && typeof node.number === 'number') out.push(normalizeIssue(source.repo, node, now))
      }
      if (!data.search.pageInfo.hasNextPage) return out
      after = data.search.pageInfo.endCursor
    }
    return out
  }

  async claim(candidate: Candidate, as: string): Promise<boolean> {
    // GitHub silently drops an assignee who is not a collaborator, so the result is read back
    // rather than inferred from the call succeeding.
    const issue = await gh<{ assignees: { login: string }[] }>(
      ['api', `repos/${candidate.repo}/issues/${candidate.native}/assignees`, '--method', 'POST', '--input', '-'],
      JSON.stringify({ assignees: [as] }),
    )
    return issue.assignees.some((a) => a.login === as)
  }

  async verifyClaim(candidate: Candidate, as: string, since: string): Promise<ClaimVerdict> {
    const [issue, comments] = await Promise.all([
      gh<{ assignees: { login: string }[]; state: string }>([
        'api',
        `repos/${candidate.repo}/issues/${candidate.native}`,
        '--jq',
        '{assignees, state}',
      ]),
      ghPaginated<RawComment>([
        'api',
        `repos/${candidate.repo}/issues/${candidate.native}/comments?since=${encodeURIComponent(since)}&per_page=100`,
      ]),
    ])
    return verdictFrom(as, issue.assignees.map((a) => a.login), comments ?? [])
  }

  async commentsSince(candidate: Candidate, since: string): Promise<Comment[]> {
    return commentsFrom(
      await ghPaginated<RawComment>([
        'api',
        `repos/${candidate.repo}/issues/${candidate.native}/comments?since=${encodeURIComponent(since)}&per_page=100`,
      ]),
    )
  }

  async report(candidate: Candidate, message: string): Promise<void> {
    await gh(
      ['api', `repos/${candidate.repo}/issues/${candidate.native}/comments`, '--method', 'POST', '--input', '-'],
      JSON.stringify({ body: message }),
    )
  }

  async release(candidate: Candidate, as: string): Promise<void> {
    await gh(
      ['api', `repos/${candidate.repo}/issues/${candidate.native}/assignees`, '--method', 'DELETE', '--input', '-'],
      JSON.stringify({ assignees: [as] }),
    )
  }

  linkage(candidate: Candidate): string {
    return `Closes #${candidate.native}`
  }
}

export class GitHubCodeHost implements CodeHost {
  readonly name = 'github'

  async produce(request: ArtifactRequest): Promise<Artifact> {
    if (request.files.length === 0) throw new AdapterError('an artifact needs at least one file')
    const base = request.base ?? (await defaultBranch(request.repo))
    const baseSha = await branchSha(request.repo, base)
    await createBranchWithFiles(request.repo, request.branch, baseSha, request.files, request.title)
    const pr = await openPullRequest(
      request.repo,
      request.branch,
      base,
      request.title,
      request.body,
      request.draft,
    )
    if (request.reviewers?.length) await requestReviewers(request.repo, pr.number, request.reviewers)
    return { kind: 'pull-request', ref: `#${pr.number}`, url: pr.url }
  }

  async catchUp(request: CatchUpRequest): Promise<CatchUp> {
    if (request.branch === '' || request.base === '') {
      throw new AdapterError('catching up needs both the artifact\'s branch and its base')
    }
    return mergeIntoBranch(request.repo, request.branch, request.base)
  }

  async resolve(request: ResolutionRequest): Promise<string> {
    if (request.files.length === 0 && request.deletions.length === 0) {
      throw new AdapterError('a resolution needs at least one changed path')
    }
    return commitOnBranch(
      request.repo,
      request.branch,
      request.parents,
      request.files,
      request.deletions,
      request.message,
    )
  }
}
