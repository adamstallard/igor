import { gh, ghGraphql } from './gh.js'
import { isStop } from './signals.js'
import {
  AdapterError,
  daysSince,
  extractPaths,
  type Artifact,
  type ArtifactRequest,
  type Candidate,
  type ClaimVerdict,
  type CodeHost,
  type InFlight,
  type Source,
  type Tracker,
} from './adapter.js'
import { branchSha, createBranchWithFiles, defaultBranch, openPullRequest, requestReviewers } from './github.js'

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
            ... on CrossReferencedEvent { source { ... on PullRequest { number url state isDraft } } }
            ... on ConnectedEvent { subject { ... on PullRequest { number url state isDraft } } }
          }
        }
      }
    }
  }
}`

interface RawPr {
  number: number
  url: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  isDraft: boolean
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
      return { kind: 'pull-request', ref: `#${pr.number}`, url: pr.url, draft: pr.isDraft }
    }
  }
  return undefined
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
      gh<{ body: string; user: { login: string } | null; created_at: string }[]>([
        'api',
        `repos/${candidate.repo}/issues/${candidate.native}/comments?since=${encodeURIComponent(since)}&per_page=100`,
      ]),
    ])

    // Checked before the assignee, because a stop outranks a lost claim: it carries a receipt
    // obligation, and someone who stops an Igor may well unassign it in the same breath.
    for (const comment of comments ?? []) {
      if (isStop(comment.body ?? '', as)) {
        return {
          status: 'stopped',
          ...(comment.user ? { by: comment.user.login } : {}),
          at: comment.created_at,
          reason: comment.body.trim().slice(0, 500),
        }
      }
    }

    const holders = issue.assignees.map((a) => a.login)
    if (holders.includes(as)) return { status: 'held' }
    const other = holders[0]
    return { status: 'lost', ...(other === undefined ? {} : { by: other }) }
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
}
