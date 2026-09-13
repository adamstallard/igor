/**
 * The seam between the loop and the surfaces it works on.
 *
 * A surface plays one or two roles: a **tracker**, where work is discovered, claimed, verified
 * and reported on; and a **code host**, where an artifact is produced and linked back. GitHub
 * plays both. Linear plays only the first, which is why they are separate interfaces even
 * though only GitHub ships now.
 */

/** Work already underway on an item — the reason to leave it alone. */
export interface InFlight {
  kind: 'pull-request' | 'branch'
  ref: string
  url: string
  draft: boolean
}

/**
 * The normalized shape every tracker must produce. Normative rather than per-adapter: lane
 * predicates are only as portable as this is consistent.
 *
 * Two ages, deliberately. `ageDays` is what `lane.age.max_days` reads; `idleDays` is carried
 * so the dry-run milestone can observe whether time-since-creation is the wrong axis — an
 * ancient issue commented on yesterday is arguably live, and only real data settles it.
 */
export interface Candidate {
  /** Globally unique and stable: `<tracker>:<repo>#<native id>`. */
  id: string
  tracker: string
  repo: string
  native: string
  url: string
  title: string
  body: string
  author: string
  state: 'open' | 'closed'
  labels: string[]
  assignees: string[]
  /** Paths the item names. Issues have no files, so these are read out of the text. */
  paths: string[]
  createdAt: string
  updatedAt: string
  ageDays: number
  idleDays: number
  inFlight?: InFlight
}

export type ClaimStatus = 'held' | 'lost' | 'stopped'

/**
 * `stopped` outranks `lost`. An Igor that was both unassigned and stopped must report the
 * stop, because a stop carries a receipt obligation that losing a race does not — so
 * precedence belongs in the contract rather than in whichever call site checks first.
 */
export interface ClaimVerdict {
  status: ClaimStatus
  /** Who holds it now, when lost; who stopped it, when stopped. */
  by?: string
  at?: string
  /** Verbatim text of the stop, for the receipt. */
  reason?: string
}

export interface Source {
  tracker: string
  repo: string
  query: string
}

export interface Tracker {
  readonly name: string
  /**
   * Whether the surface has an assignment field. This determines how a claim is *expressed*,
   * never how it is resolved — resolution is ordering plus a settle interval on every surface.
   */
  readonly nativeAssignment: boolean

  /** Who this Igor is on this surface, for claiming and for reading its own claim back. */
  identity(): Promise<string>

  search(source: Source): Promise<Candidate[]>

  /** Expresses a claim. Returns what the surface actually recorded, which may not be what was asked. */
  claim(candidate: Candidate, as: string): Promise<boolean>

  /**
   * Re-reads the item to answer held / lost / stopped in one operation, rather than adding a
   * second one. `since` bounds the scan for a stop to what arrived after the claim.
   */
  verifyClaim(candidate: Candidate, as: string, since: string): Promise<ClaimVerdict>

  report(candidate: Candidate, message: string): Promise<void>

  release(candidate: Candidate, as: string): Promise<void>

  /** How an artifact refers back to an item on this tracker — `Closes #12`, a branch name, … */
  linkage(candidate: Candidate): string
}

export interface ArtifactRequest {
  repo: string
  branch: string
  base?: string
  title: string
  body: string
  files: { path: string; content: string }[]
  reviewers?: string[]
  draft: boolean
}

export interface Artifact {
  kind: 'pull-request'
  ref: string
  url: string
}

export interface CodeHost {
  readonly name: string
  produce(request: ArtifactRequest): Promise<Artifact>
}

export class AdapterError extends Error {}

const DAY = 24 * 60 * 60 * 1000

export function daysSince(iso: string, now: number = Date.now()): number {
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.floor((now - then) / DAY))
}

/**
 * Reads paths out of an item's text.
 *
 * Issues have no files, so a `paths.under` predicate would match nothing at all if paths came
 * only from a linked artifact — and items with a linked artifact are precisely the ones triage
 * skips as work in flight. Routing by area is a real thing an org wants ("the API Igor takes
 * anything mentioning `src/api/`"), so it is worth reading the text for.
 *
 * Deliberately conservative: a token must contain a slash and end in an extension, so prose
 * with a slash in it does not become a path.
 */
const PATH_PATTERN = /(?:^|[\s`'"(<[])((?:[\w.-]+\/)+[\w.-]+\.[A-Za-z][\w]{0,9})(?=$|[\s`'")>\],.:;])/g

export function extractPaths(...texts: string[]): string[] {
  const found = new Set<string>()
  for (const text of texts) {
    for (const match of text.matchAll(PATH_PATTERN)) {
      const path = match[1]
      if (path === undefined) continue
      // A URL's tail is not a path in the repository.
      if (/^https?:/.test(path) || path.includes('://')) continue
      found.add(path.replace(/^\.\//, ''))
    }
  }
  return [...found]
}
