import { basename } from 'node:path'
import type { Config } from './config.js'
import type { Entry } from './entry.js'
import {
  ENTRIES_DIR,
  loadEntry,
  parseEntry,
  type LoadedEntry,
  rejectedIds,
  writeEntry,
  writeRejection,
  takenIds,
  StoreError,
} from './store.js'
import {
  fileAtRef,
  landedFiles,
  listPullRequests,
  pullRequest,
  proposedFiles,
  proposingCommitFiles,
  repoFromCheckout,
  type PrState,
} from './github.js'
import { readState, writeState } from './state.js'

/** Where the closed-pull-request floor lives on the destination's state branch. */
export const STATE_PATH = 'reconcile.json'

/**
 * How many unfinished pull requests are carried. Each costs a handful of requests per run, so
 * the cap is what keeps the bound a bound; a destination with more than this many standing
 * conditions has something wrong with it that re-reading them will not fix.
 */
const MAX_PENDING = 100

interface ReconcileState {
  /**
   * Every closed pull request whose activity is at or before this instant has been examined.
   * Losing it costs one full re-examination and nothing else, which is the state branch's
   * standing bargain.
   */
  closedSeen: string
  /**
   * Pull requests the last run left something to do on, carried by number so that the floor can
   * keep moving without abandoning them. A floor held behind them instead would re-read
   * everything newer on every run forever: one entry retired after it was promoted, or one file
   * with frontmatter nobody fixes, and the bound is gone.
   */
  pending?: number[]
}

export interface Promoted {
  id: string
  by: string
  at: string
  pr: number
  /**
   * Set when whoever merged was not among the assignees. Their name is still recorded —
   * they did approve it — but attributing the judgment silently would misstate who vouched.
   */
  mergerWasNotAssigned?: boolean
}

export interface Declined {
  id: string
  pr: number
  by: string
  at: string
  /** The rejection record written for it, which is also how a person undoes the rejection. */
  record: string
}

export interface Stale {
  pr: number
  url: string
  assignees: string[]
  lastActivity: string
}

/** An entry file that is there and cannot be read — broken frontmatter, or unreadable on disk. */
export interface Unreadable {
  id: string
  reason: string
}

export interface Reconciliation {
  promoted: Promoted[]
  declined: Declined[]
  stale: Stale[]
  deferred: number[]
  /** Entries a merged pull request added that are not in the local checkout yet. */
  missingLocally: string[]
  unreadable: Unreadable[]
  /**
   * The floor the closed half of the sweep stopped at, absent where it read the whole history.
   * Reported rather than inferred: what was not looked at is the one thing a reader of this
   * cannot work out from the rest of it.
   */
  scannedSince?: string
}

function daysBetween(iso: string, now: Date): number {
  return (now.getTime() - Date.parse(iso)) / 86_400_000
}

/** An entry file, by where it lives. A markdown file elsewhere shares no namespace with it. */
function isEntryFile(path: string): boolean {
  return path.startsWith(`${ENTRIES_DIR}/`) && path.endsWith('.md')
}

function idsFrom(paths: readonly string[]): string[] {
  return paths.filter(isEntryFile).map((p) => basename(p, '.md'))
}

/**
 * Entry text that a person wrote and nothing validated. Unparseable frontmatter is ordinary —
 * an unquoted colon in a claim is enough — and it must not be fatal: reconciliation sweeps
 * every pull request it has not already settled, and a throw leaves the watermark unwritten —
 * so one bad candidate in one old proposal would otherwise abort every run forever, including
 * the merge-triggered one, and never get past the pull request that wedged it.
 *
 * Says why rather than only that it failed, because the two callers report it to a person who
 * has to go and fix the file.
 */
function readEntry(read: () => LoadedEntry): { entry?: Entry; reason: string } {
  let loaded: LoadedEntry
  try {
    loaded = read()
  } catch (error) {
    return { reason: error instanceof Error ? error.message : String(error) }
  }
  if (loaded.entry === undefined) {
    const why = loaded.errors.map((e) => `${e.field} ${e.message}`).join('; ')
    return { reason: why === '' ? 'could not be read' : why }
  }
  return { entry: loaded.entry, reason: '' }
}

/**
 * Whether a pull request proposes lore — a question about the entry files it adds, not its
 * branch name, because anyone may open one by hand.
 *
 * The diff answers it in one request for every shape but one, so it is asked first. The
 * exception is a proposal whose every candidate the reviewer deleted: its diff is empty and it
 * is still a proposal, which only the proposing commit can say, at two requests more.
 *
 * Costs requests either way, so the loop calls it only where it has no files in hand already
 * and the answer changes what gets reported.
 */
async function isProposal(repo: string, number: number): Promise<boolean> {
  if (idsFrom(await landedFiles(repo, number)).length > 0) return true
  return idsFrom((await proposingCommitFiles(repo, number)).files).length > 0
}

/**
 * How far the floor may move: to the newest closed pull request the scan actually read.
 *
 * Nothing is held back here, because a floor is a prefix and holding it behind one pull request
 * abandons nothing while re-reading everything newer than it, run after run. Unfinished work is
 * carried by number in `pending` instead, which costs a few requests each and clears itself.
 *
 * A scan that cannot be vouched for moves nothing. Everything below the floor is abandoned by
 * definition, so a scan that may have hidden a row behind a page boundary must not set one.
 */
function nextMark(
  examined: readonly PrState[],
  previous: string | undefined,
  complete: boolean,
): string | undefined {
  if (!complete || examined.length === 0) return undefined
  const instant = (pr: PrState): number => Date.parse(pr.updatedAtInstant)
  const newest = examined.reduce((a, b) => (instant(a) >= instant(b) ? a : b))
  if (previous !== undefined && instant(newest) <= Date.parse(previous)) return undefined
  return newest.updatedAtInstant
}

/**
 * Runs at the start of every invocation rather than on a timer: there is no daemon, so a
 * merged pull request stays unpromoted until someone next uses the tool.
 */
export async function reconcile(
  config: Config,
  options: { now?: Date; staleAfterDays?: number } = {},
): Promise<Reconciliation> {
  const now = options.now ?? new Date()
  const staleAfterDays = options.staleAfterDays ?? 7
  const repo = await repoFromCheckout(config.destination)
  const stored = await readState<ReconcileState>(repo, STATE_PATH)
  const since = typeof stored?.closedSeen === 'string' ? stored.closedSeen : undefined
  const scan = await listPullRequests(repo, since)
  // Carried from the last run because the floor has already passed them. Each costs one request
  // to read back, and a read that fails keeps the number rather than failing the run — see the
  // write below for why it is kept rather than dropped.
  const carried = Array.isArray(stored?.pending) ? stored.pending : []
  const scanned = new Set(scan.prs.map((p) => p.number))
  const extra: PrState[] = []
  /** Carried numbers this run could not read back, which is not the same as no longer there. */
  const unread: number[] = []
  for (const number of carried) {
    if (typeof number !== 'number' || scanned.has(number)) continue
    const pr = await pullRequest(repo, number)
    if (pr === undefined) unread.push(number)
    else extra.push(pr)
  }
  const prs = [...scan.prs, ...extra]

  const result: Reconciliation = {
    promoted: [],
    declined: [],
    stale: [],
    deferred: [],
    missingLocally: [],
    unreadable: [],
    ...(since === undefined ? {} : { scannedSince: since }),
  }
  const present = takenIds(config.destination)
  const rejected = rejectedIds(config.destination)
  /** Closed pull requests the scan itself covered, which is what the floor may move over. */
  const examined = scan.prs.filter((p) => p.state !== 'open')
  /** Pull requests this run left something to do on, whichever half they came from. */
  const unfinished: number[] = []

  for (const pr of prs) {
    if (pr.state === 'open') {
      // The window is tested before the files are: a quiet pull request is the only open one
      // this reports on, so a backlog of active ones costs no request at all.
      if (daysBetween(pr.updatedAt, now) < staleAfterDays) continue
      if (!(await isProposal(repo, pr.number))) continue
      result.stale.push({
        pr: pr.number,
        url: pr.url,
        assignees: pr.assignees,
        lastActivity: pr.updatedAt,
      })
      continue
    }
    if (!pr.merged) {
      if (!(await isProposal(repo, pr.number))) continue
      // Closed without merging means deferred. Declining is permanent, so it must be the
      // deliberate act of deleting a file, never the passive one of closing a tab.
      result.deferred.push(pr.number)
      continue
    }

    const proposal = await proposedFiles(repo, pr.number)
    // Free on this path: these are the files the loop was fetching anyway.
    const proposedIds = idsFrom(proposal.files)
    if (proposedIds.length === 0) continue
    const by = pr.mergedBy ?? pr.assignees[0] ?? 'unknown'
    const at = pr.mergedAt ?? now.toISOString().slice(0, 10)
    const landed = new Set(idsFrom(proposal.landed))
    /**
     * What this pull request had produced before its entries were walked. Anything it adds is
     * something a later run still has to see: a promotion or a rejection because the write into
     * the checkout is committed by somebody else and may never be, and a missing or unreadable
     * entry because the promotion it is owed is still owed once the checkout or the file is
     * fixed.
     */
    const produced = (): number =>
      result.promoted.length +
      result.declined.length +
      result.missingLocally.length +
      result.unreadable.length
    const before = produced()

    for (const id of proposedIds) {
      const path = `${ENTRIES_DIR}/${id}.md`
      if (!present.has(id)) {
        // A local absence means the reviewer deleted it, or this checkout is behind. Rejection
        // is permanent, so the pull request's own diff settles it. Asking the destination's
        // current state instead would read an entry retired long afterwards as a rejection.
        //
        // A draft the author added and deleted themselves lands here too, and accepting that is
        // deliberate. It is `added` in the proposing commit and absent at head, which is exactly
        // the file list a reviewer's deletion produces; separating them needs a signal the file
        // list does not carry. Recording nothing instead would lose reviewer deletions, which
        // are the gesture this exists for, and a stray record and its id are deletable by hand.
        if (landed.has(id)) {
          result.missingLocally.push(id)
          continue
        }
        if (rejected.has(id)) continue
        const text =
          proposal.commit === undefined ? undefined : await fileAtRef(repo, path, proposal.commit)
        const entry =
          text === undefined ? undefined : readEntry(() => parseEntry(path, text)).entry
        const record = writeRejection(config.destination, {
          id,
          by,
          at,
          pr: pr.number,
          ...(entry === undefined ? {} : { entry }),
        })
        rejected.add(id)
        result.declined.push({ id, pr: pr.number, by, at, record })
        continue
      }
      // Reached only when the id is present, so a failure here is a file that is there and
      // broken. Reporting it as behind would send someone to pull a checkout that is current.
      const loaded = readEntry(() => loadEntry(config.destination, id))
      if (loaded.entry === undefined) {
        result.unreadable.push({ id, reason: loaded.reason })
        continue
      }
      if (loaded.entry.status !== 'provisional') continue
      writeEntry(config.destination, {
        ...loaded.entry,
        status: 'active',
        reviewed: { by, at },
      })
      const unexpected = pr.mergedBy !== undefined && !pr.assignees.includes(pr.mergedBy)
      result.promoted.push({
        id,
        by,
        at,
        pr: pr.number,
        ...(unexpected ? { mergerWasNotAssigned: true } : {}),
      })
    }
    if (produced() > before) unfinished.push(pr.number)
  }

  const closedSeen = nextMark(examined, since, scan.complete) ?? since
  if (closedSeen !== undefined) {
    // A read that failed stays carried. `pullRequest` cannot tell a pull request that is gone
    // from one the API would not hand over just now, and dropping it on a rate limit would
    // abandon the promotion it is owed with nothing above the floor to find it again.
    //
    // Newest first, so a cap that bites drops the oldest standing condition rather than the
    // pull request somebody merged a minute ago.
    const pending = [...new Set([...unfinished, ...unread])]
      .sort((a, b) => b - a)
      .slice(0, MAX_PENDING)
    // Swallowed: a destination that refuses the write reconciles unbounded, which is slow
    // rather than wrong, and nothing in this run reads it back.
    await writeState(
      repo,
      STATE_PATH,
      { closedSeen, ...(pending.length === 0 ? {} : { pending }) } satisfies ReconcileState,
      'Update reconciliation watermark',
    ).catch(() => undefined)
  }
  return result
}

/**
 * Promotes provisional entries in place, recording whoever ran it as the approver.
 *
 * A manual repair, not an event's mechanism: reconciliation is what promotes, and it sweeps
 * pull requests. An entry that reached the default branch without one has nothing to sweep,
 * and this is how a person puts it in force and says so.
 */
export function promoteInPlace(
  config: Config,
  by: string,
  at: string,
  only?: readonly string[],
): Promoted[] {
  const wanted = only === undefined ? undefined : new Set(only.map((p) => basename(p, '.md')))
  const promoted: Promoted[] = []
  for (const id of takenIds(config.destination)) {
    if (wanted !== undefined && !wanted.has(id)) continue
    const loaded = loadEntry(config.destination, id)
    if (loaded.entry === undefined || loaded.entry.status !== 'provisional') continue
    writeEntry(config.destination, { ...loaded.entry, status: 'active', reviewed: { by, at } })
    promoted.push({ id, by, at, pr: 0 })
  }
  return promoted
}

export { StoreError }
export type { PrState }
