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
  proposedFiles,
  proposingCommitFiles,
  repoFromCheckout,
  type PrState,
} from './github.js'

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
 * every pull request the destination has, so one bad candidate in one old proposal would
 * otherwise abort every run forever, including the merge-triggered one, and never get past
 * the pull request that wedged it.
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
 * Whether a pull request proposes lore — a question about its files, not its branch name,
 * because anyone may open one by hand.
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
  const prs = await listPullRequests(repo)

  const result: Reconciliation = {
    promoted: [],
    declined: [],
    stale: [],
    deferred: [],
    missingLocally: [],
    unreadable: [],
  }
  const present = takenIds(config.destination)
  const rejected = rejectedIds(config.destination)

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

    for (const id of proposedIds) {
      const path = `${ENTRIES_DIR}/${id}.md`
      if (!present.has(id)) {
        // A local absence means the reviewer deleted it, or this checkout is behind. Rejection
        // is permanent, so the pull request's own diff settles it. Asking the destination's
        // current state instead would read an entry retired long afterwards as a rejection.
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
