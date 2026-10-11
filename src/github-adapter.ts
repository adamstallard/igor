import { gh, GhError, ghGraphql, ghPaginated } from './gh.js'
import type { BotAccount } from './app.js'
import { bareName, isGoAhead, isStop, namesToResolve, type Accounts } from './signals.js'
import {
  AdapterError,
  daysSince,
  extractPaths,
  type Artifact,
  type ArtifactRequest,
  type Candidate,
  type ClaimVerdict,
  type Comment,
  type HolderSetting,
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
        author { __typename login }
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
  author { __typename login }
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
  author?: Actor | null
}

/** An author as GraphQL reports one. */
interface Actor {
  login: string
  /** `Bot` for a GitHub App's bot account. */
  __typename?: string
}

/**
 * The login as REST spells it. GraphQL drops the `[bot]` an App's bot account carries everywhere
 * else (measured 2026-10-04: `igor-generalist` against REST's `igor-generalist[bot]`), so without
 * this an Igor's own pull request reads as somebody else's work. Spelled here, as each author is
 * read, so every comparison downstream compares one spelling with another of the same kind.
 */
export function loginOf(actor: Actor | null | undefined): string {
  if (!actor) return ''
  return actor.__typename === 'Bot' && !actor.login.endsWith('[bot]') ? `${actor.login}[bot]` : actor.login
}

export interface RawIssue {
  number: number
  url: string
  title: string
  body: string | null
  state: 'OPEN' | 'CLOSED'
  createdAt: string
  updatedAt: string
  author: Actor | null
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
        author: loginOf(pr.author),
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
    author: loginOf(issue.author),
    state: issue.state === 'OPEN' ? 'open' : 'closed',
    labels: issue.labels.nodes.map((l) => l.name),
    assignees: issue.assignees.nodes.map((a) => a.login),
    holders: issue.labels.nodes.map((l) => l.name).filter(isHolderLabel),
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

/** Every label naming an Igor starts with this; the rest of it is the Igor's role. */
export const HOLDER_PREFIX = 'igor:'

export const isHolderLabel = (name: string): boolean => name.startsWith(HOLDER_PREFIX)

/** One entry of `GET /repos/{owner}/{repo}/issues/{n}/events`, as far as claims read it. */
export interface RawEvent {
  id: number
  event: string
  actor: { login: string; id: number; type?: string } | null
  label?: { name: string } | null
  created_at: string
}

/**
 * The latest `kind` event for `label`, by event id.
 *
 * **By id, never by `created_at`.** Events a second apart share a timestamp, and ids rise
 * strictly in the order of the actions (measured 2026-10-04 on four label events, two of which
 * shared a second).
 */
export function latestLabelEvent(
  events: readonly RawEvent[],
  kind: 'labeled' | 'unlabeled',
  label: string,
): RawEvent | undefined {
  let latest: RawEvent | undefined
  for (const event of events) {
    if (event.event !== kind || event.label?.name !== label) continue
    if (latest === undefined || event.id > latest.id) latest = event
  }
  return latest
}

/** This Igor, as a claim read compares it: its label, and its App's bot account. */
export interface ClaimSelf {
  /** The comment author a stop addressed to this Igor names, and the login a stop compares. */
  login: string
  /** The App bot's numeric id, which an event's actor is matched by. */
  accountId: number
  /** `igor:<role>`. */
  holder: string
}

/**
 * A stop in `comments` created at or after `since`, as a verdict, or `undefined`. A comment whose
 * creation time cannot be read counts. `comments` are in creation order.
 *
 * Not `liftable`, the first stop decides. `liftable`, the last one does, and a go-ahead after it
 * in the list, by anyone but this Igor and not itself a stop, lifts it; a stop said after the
 * go-ahead still stands. List order decides rather than the time, which GitHub gives to the second,
 * so a go-ahead in the same second as a stop lifts it only if it came after. A lifted stop answers
 * `liftedAt`, the creation time of the go-ahead that lifted it, where that time can be read.
 */
function stopFrom(
  as: string,
  comments: readonly RawComment[],
  since: string,
  liftable = false,
  accounts?: Accounts,
): { stop: ClaimVerdict } | { liftedAt?: string } | undefined {
  const floor = Date.parse(since)
  const stops = comments.filter((comment) => {
    const at = Date.parse(comment.created_at)
    if (!Number.isNaN(floor) && !Number.isNaN(at) && at < floor) return false
    return isStop(comment.body ?? '', as, accounts)
  })
  if (stops.length === 0) return undefined
  const verdict = (comment: RawComment): { stop: ClaimVerdict } => ({
    stop: {
      status: 'stopped',
      ...(comment.user ? { by: comment.user.login } : {}),
      at: comment.created_at,
      reason: (comment.body ?? '').trim().slice(0, 500),
    },
  })
  if (!liftable) return verdict(stops[0]!)

  const latest = stops[stops.length - 1]!
  const lifting = comments.slice(comments.indexOf(latest) + 1).find((c) => {
    const body = c.body ?? ''
    return c.user?.login !== as && !isStop(body, as, accounts) && isGoAhead(body, as, accounts)
  })
  if (lifting === undefined) return verdict(latest)
  return Number.isNaN(Date.parse(lifting.created_at)) ? {} : { liftedAt: lifting.created_at }
}

/**
 * Pure, so the precedence between a stop, a removed label and a lost race can be tested against
 * fixtures rather than against the network. `events` is read only where a label needs
 * explaining; without them, a missing label is a loss and other labels are not.
 *
 * **A stop comment outranks everything.** It carries a receipt obligation, and someone who stops
 * an Igor may well remove its label in the same breath.
 *
 * **A stop is one created at or after `since`.** GitHub's `since` filters on when a comment was
 * last updated, so it also returns an older comment edited since then, and a stop said before
 * the claim, perhaps before a hand-over that answered it, is not a stop of this claim.
 * Creation time decides. With `liftable`, a go-ahead after the last stop lifts it, and a held
 * verdict carries the go-ahead's time as `liftedAt`; see `stopFrom`.
 *
 * **This Igor's label gone means it was removed, and the latest `unlabeled` event says by whom.**
 * The Igor's own bot account is its own release: no receipt. Anyone else is a stop by that person,
 * and the receipt names them. The two cases are exhaustive, because an Igor that loses a race
 * removes only its own label. The actor is matched by its numeric id with `type == "Bot"`;
 * `performed_via_github_app` is null even for an App's own actions (measured 2026-10-04).
 *
 * **Another Igor's label is a competing claim only where that Igor added it itself**, read from
 * the label's latest `labeled` event: a `Bot` actor other than this Igor. A label a person added
 * hands the issue to that Igor once this one lets go, and never makes this one lose its claim.
 */
export function labelVerdictFrom(
  self: ClaimSelf,
  labels: readonly string[],
  events: readonly RawEvent[] | undefined,
  comments: readonly RawComment[],
  since: string,
  liftable = false,
  /** Which mentioned names are Igors; see `Accounts`. */
  accounts?: Accounts,
): ClaimVerdict {
  const stop = stopFrom(self.login, comments, since, liftable, accounts)
  if (stop !== undefined && 'stop' in stop) return stop.stop
  const held: ClaimVerdict =
    stop?.liftedAt === undefined ? { status: 'held' } : { status: 'held', liftedAt: stop.liftedAt }

  if (!labels.includes(self.holder)) {
    const removed = events === undefined ? undefined : latestLabelEvent(events, 'unlabeled', self.holder)
    if (removed?.actor == null || isSelf(removed.actor, self)) return { status: 'lost' }
    return {
      status: 'stopped',
      by: removed.actor.login,
      at: removed.created_at,
      reason: `removed the ${self.holder} label`,
      fromHolder: true,
    }
  }

  for (const label of labels) {
    if (!isHolderLabel(label) || label === self.holder || events === undefined) continue
    const added = latestLabelEvent(events, 'labeled', label)
    if (added?.actor != null && added.actor.type === 'Bot' && !isSelf(added.actor, self)) {
      return { status: 'lost', by: added.actor.login }
    }
  }
  return held
}

const isSelf = (actor: { id: number; type?: string }, self: Pick<ClaimSelf, 'accountId'>): boolean =>
  actor.type === 'Bot' && actor.id === self.accountId

/**
 * Pure, and total over what the endpoint can return: a deleted author comes back as null, and
 * a caller comparing identities should never have to consider undefined.
 */
export function commentsFrom(raw: readonly RawComment[] | null | undefined): Comment[] {
  return (raw ?? []).map((c) => ({ author: c.user?.login ?? '', at: c.created_at, body: c.body ?? '' }))
}

/**
 * GitHub as a tracker, for an Igor acting as a GitHub App.
 *
 * **The holder field is the label `igor:<role>`, never the assignee.** An App's bot user cannot
 * be an issue assignee (404 and 403, measured), so the label is the Igor's field and the
 * assignee stays the person's, as Linear's delegate and assignee are. Labels hold a list.
 */
export class GitHubTracker implements Tracker {
  readonly name = 'github'
  readonly nativeHolderField = true
  readonly holderField = { holds: 'list', distinctFromAssignee: true } as const
  readonly holder: string
  /** Whether each name mentioned after a stop or a go-ahead is an Igor, as `accountsIn` found. */
  private readonly kinds = new Map<string, 'igor' | 'other'>()

  /**
   * `account` is the Igor's App's bot, which the startup check read. `GET /user` is never asked:
   * it describes a user, and an installation token has none behind it. `role` names the label.
   */
  constructor(private readonly self: { account?: BotAccount; role?: string } = {}) {
    this.holder = `${HOLDER_PREFIX}${self.role ?? ''}`
  }

  private claimSelf(): ClaimSelf {
    const account = this.self.account
    if (account === undefined || this.self.role === undefined) {
      throw new AdapterError('this tracker was built without the role and App bot account it claims as')
    }
    return { login: account.login, accountId: account.id, holder: this.holder }
  }

  async identity(): Promise<string> {
    if (this.self.account === undefined) {
      throw new AdapterError('this tracker was built without the App bot account it acts as')
    }
    return this.self.account.login
  }

  /** The App's bot account's numeric id, which an event's actor is compared with. */
  get accountId(): number | undefined {
    return this.self.account?.id
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

  /** The item's labels, read rather than taken from whatever answered the last write. */
  private async labels(candidate: Candidate): Promise<string[]> {
    const labels = await gh<{ name: string }[]>([
      'api',
      `repos/${candidate.repo}/issues/${candidate.native}/labels?per_page=100`,
    ])
    return (labels ?? []).map((l) => l.name)
  }

  /** Every page of the item's events, which name who added and removed each label. */
  private async events(candidate: Candidate): Promise<RawEvent[]> {
    return ghPaginated<RawEvent>([
      'api',
      `repos/${candidate.repo}/issues/${candidate.native}/events?per_page=100`,
    ])
  }

  /**
   * Adds this Igor's label and answers whether the issue carries it, read back afterwards rather
   * than trusted from the response. Adding a label the repository lacks creates it (measured
   * 2026-10-04 through this same REST call), so a new role needs no label set up.
   */
  async claim(candidate: Candidate, _as: string): Promise<boolean> {
    const { holder } = this.claimSelf()
    await gh(
      ['api', `repos/${candidate.repo}/issues/${candidate.native}/labels`, '--method', 'POST', '--input', '-'],
      JSON.stringify({ labels: [holder] }),
    )
    return (await this.labels(candidate)).includes(holder)
  }

  /**
   * Two reads in the ordinary case, the labels and the comments since the claim. The events are
   * read only where a label needs explaining: this Igor's is gone, or another Igor's is there.
   */
  async verifyClaim(
    candidate: Candidate,
    _as: string,
    since: string,
    options: { liftable?: boolean } = {},
  ): Promise<ClaimVerdict> {
    const self = this.claimSelf()
    const [labels, comments] = await Promise.all([
      this.labels(candidate),
      ghPaginated<RawComment>([
        'api',
        `repos/${candidate.repo}/issues/${candidate.native}/comments?since=${encodeURIComponent(since)}&per_page=100`,
      ]),
    ])
    const puzzling = !labels.includes(self.holder) || labels.some((l) => isHolderLabel(l) && l !== self.holder)
    const events = puzzling ? await this.events(candidate) : undefined
    const accounts = await this.accountsIn((comments ?? []).map((c) => c.body ?? ''))
    return labelVerdictFrom(self, labels, events, comments ?? [], since, options.liftable === true, accounts)
  }

  /**
   * Which names that `bodies` mention after a stop or a go-ahead are Igors. An Igor is a GitHub
   * App, so a name is one where GitHub has a bot account `<name>[bot]`, the same read the Igor
   * makes of its own account at startup. A 404 says the name is no Igor; any other failure leaves
   * it unresolved. Answers are kept for the life of the process, since an account does not change
   * kind.
   */
  async accountsIn(bodies: readonly string[]): Promise<Accounts> {
    const names = [...new Set(bodies.flatMap(namesToResolve))]
    const own = this.self.account === undefined ? undefined : bareName(this.self.account.login)
    const found: Record<string, 'igor' | 'other'> = {}
    for (const name of names) {
      if (name === own) {
        found[name] = 'igor'
        continue
      }
      let kind = this.kinds.get(name)
      if (kind === undefined) {
        try {
          const user = await gh<{ type?: string }>(['api', `users/${encodeURIComponent(`${name}[bot]`)}`])
          kind = user?.type === 'Bot' ? 'igor' : 'other'
        } catch (error) {
          if (!(error instanceof GhError) || error.status !== 404) continue
          kind = 'other'
        }
        this.kinds.set(name, kind)
      }
      found[name] = kind
    }
    return found
  }

  /**
   * Read from the item's events, never from `candidate.holders`: a cycle's candidate can be
   * minutes old, and a catch-up that trusted it would keep a label the Igor had just put back
   * itself, or remove one a person had just added. The label is on the item where its latest
   * `labeled` event is newer than its latest `unlabeled` one.
   */
  async holderSetBy(candidate: Candidate): Promise<HolderSetting | undefined> {
    const self = this.claimSelf()
    const events = await this.events(candidate)
    const added = latestLabelEvent(events, 'labeled', self.holder)
    const removed = latestLabelEvent(events, 'unlabeled', self.holder)
    if (added === undefined || (removed !== undefined && removed.id > added.id)) return undefined
    if (added.actor == null) return undefined
    return { self: isSelf(added.actor, self), by: added.actor.login, at: added.created_at }
  }

  async directed(repo: string): Promise<Candidate[]> {
    const { holder } = this.claimSelf()
    return this.search({ tracker: this.name, repo, query: `is:issue is:open label:"${holder}"` })
  }

  async commentsSince(candidate: Candidate, since: string): Promise<Comment[]> {
    const comments = commentsFrom(
      await ghPaginated<RawComment>([
        'api',
        `repos/${candidate.repo}/issues/${candidate.native}/comments?since=${encodeURIComponent(since)}&per_page=100`,
      ]),
    )
    const accounts = await this.accountsIn(comments.map((c) => c.body))
    return comments.map((c) => (namesToResolve(c.body).length === 0 ? c : { ...c, accounts }))
  }

  async report(candidate: Candidate, message: string): Promise<string | undefined> {
    // The comment's own url, read off what GitHub answered rather than inferred from the call
    // not throwing. A surface that answers nothing usable yields `undefined`, which says the
    // write may have landed and was not confirmed — the one thing a throw cannot say.
    const created = await gh<{ id?: number; html_url?: string }>(
      ['api', `repos/${candidate.repo}/issues/${candidate.native}/comments`, '--method', 'POST', '--input', '-'],
      JSON.stringify({ body: message }),
    )
    return created.html_url ?? (created.id === undefined ? undefined : String(created.id))
  }

  /**
   * Removes this Igor's label and nothing else, then reads the labels back.
   *
   * A label already gone answers 404, which is the release having happened, not failed. Any
   * other failure throws, and callers read a throw as *not clear*: claiming a release that did
   * not happen leaves an item held with nobody told, while the opposite mistake costs one
   * person one label removal on an item already free.
   */
  async release(candidate: Candidate, _as: string): Promise<boolean> {
    const { holder } = this.claimSelf()
    try {
      await gh([
        'api',
        `repos/${candidate.repo}/issues/${candidate.native}/labels/${encodeURIComponent(holder)}`,
        '--method',
        'DELETE',
      ])
    } catch (error) {
      if (!(error instanceof GhError && error.status === 404)) throw error
    }
    return !(await this.labels(candidate)).includes(holder)
  }

  /**
   * Searches descriptions for the link, then keeps only issues that carry it whole: search
   * matches words, and a link's words appear in links to other messages too. Whole means not
   * followed by more of a path, since a link to message 3 is the start of a link to message 30.
   */
  async findLinking(repo: string, url: string): Promise<string | undefined> {
    const found = await this.search({ tracker: this.name, repo, query: `is:issue in:body "${url}"` })
    const whole = new RegExp(`${url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w/-])`)
    return found.find((c) => whole.test(c.body))?.url
  }

  async createIssue(repo: string, title: string, body: string): Promise<string> {
    const created = await gh<{ html_url?: string }>(
      ['api', `repos/${repo}/issues`, '--method', 'POST', '--input', '-'],
      JSON.stringify({ title, body }),
    )
    if (typeof created?.html_url !== 'string') throw new AdapterError(`GitHub did not say where the issue in ${repo} is`)
    return created.html_url
  }

  linkage(candidate: Candidate): string {
    return `Closes #${candidate.native}`
  }
}

/**
 * Refuses a publish that changes a workflow file where the App's installation cannot write
 * workflows, naming the permission. GitHub refuses such a commit too, but with an error that
 * names neither the permission nor the path.
 */
export function refuseWorkflows(
  paths: readonly string[],
  canWriteWorkflows: boolean,
): void {
  if (canWriteWorkflows) return
  const workflows = paths.filter((path) => path.startsWith('.github/workflows/'))
  if (workflows.length > 0) {
    throw new AdapterError(
      `this changes ${workflows.join(', ')}, which needs the App's Workflows write permission, ` +
        `and its installation lacks it`,
    )
  }
}

export class GitHubCodeHost implements CodeHost {
  readonly name = 'github'

  /**
   * `canWriteWorkflows` is read from the installation at startup. Left out, nothing is refused
   * here and GitHub decides.
   */
  constructor(private readonly options: { canWriteWorkflows?: boolean } = {}) {}

  private checkWorkflows(request: { files: readonly { path: string }[]; deletions: readonly string[] }): void {
    refuseWorkflows(
      [...request.files.map((f) => f.path), ...request.deletions],
      this.options.canWriteWorkflows ?? true,
    )
  }

  async produce(request: ArtifactRequest): Promise<Artifact> {
    if (request.files.length === 0 && request.deletions.length === 0) {
      throw new AdapterError('an artifact needs at least one changed path')
    }
    this.checkWorkflows(request)
    const base = request.base ?? (await defaultBranch(request.repo))
    // The sha the caller's tree was cut from, in preference to the branch head now. Reading the
    // head here is a round-trip that buys a race: the base branch can delete a path inside the
    // worker's run, and a removal of a path the base tree no longer holds is refused with
    // `422 GitRPC::BadObjectState` — the whole request, so nothing publishes.
    const baseSha = request.baseSha ?? (await branchSha(request.repo, base))
    await createBranchWithFiles(
      request.repo,
      request.branch,
      baseSha,
      request.files,
      request.deletions,
      request.title,
    )
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
    this.checkWorkflows(request)
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
