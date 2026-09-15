import { basename } from 'node:path'
import type { Config } from './config.js'
import {
  ENTRIES_DIR,
  loadEntry,
  parseEntry,
  rejectedIds,
  writeEntry,
  writeRejection,
  takenIds,
  StoreError,
} from './store.js'
import { BRANCH_PREFIX } from './propose.js'
import {
  fileAtRef,
  landedFiles,
  listOpenedBy,
  proposedFiles,
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

export interface Reconciliation {
  promoted: Promoted[]
  declined: Declined[]
  stale: Stale[]
  deferred: number[]
  /** Entries a merged pull request added that are not in the local checkout yet. */
  missingLocally: string[]
}

function daysBetween(iso: string, now: Date): number {
  return (now.getTime() - Date.parse(iso)) / 86_400_000
}

function idsFrom(paths: readonly string[]): string[] {
  return paths.filter((p) => p.endsWith('.md')).map((p) => basename(p, '.md'))
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
  const prs = await listOpenedBy(repo, BRANCH_PREFIX)

  const result: Reconciliation = {
    promoted: [],
    declined: [],
    stale: [],
    deferred: [],
    missingLocally: [],
  }
  const present = takenIds(config.destination)
  const rejected = rejectedIds(config.destination)

  for (const pr of prs) {
    if (pr.state === 'open') {
      if (daysBetween(pr.updatedAt, now) >= staleAfterDays) {
        result.stale.push({
          pr: pr.number,
          url: pr.url,
          assignees: pr.assignees,
          lastActivity: pr.updatedAt,
        })
      }
      continue
    }
    if (!pr.merged) {
      // Closed without merging means deferred. Declining is permanent, so it must be the
      // deliberate act of deleting a file, never the passive one of closing a tab.
      result.deferred.push(pr.number)
      continue
    }

    const proposal = await proposedFiles(repo, pr.number)
    const by = pr.mergedBy ?? pr.assignees[0] ?? 'unknown'
    const at = pr.mergedAt ?? now.toISOString().slice(0, 10)
    // Only fetched once something is missing locally, which is the uncommon case.
    let landed: Set<string> | undefined
    const wasLanded = async (id: string): Promise<boolean> =>
      (landed ??= new Set(idsFrom(await landedFiles(repo, pr.number)))).has(id)

    for (const id of idsFrom(proposal.files)) {
      const path = `${ENTRIES_DIR}/${id}.md`
      if (!present.has(id)) {
        // A local absence means the reviewer deleted it, or this checkout is behind. Rejection
        // is permanent, so the pull request's own diff settles it. Asking the destination's
        // current state instead would read an entry retired long afterwards as a rejection.
        if (await wasLanded(id)) {
          result.missingLocally.push(id)
          continue
        }
        if (rejected.has(id)) continue
        const text =
          proposal.commit === undefined ? undefined : await fileAtRef(repo, path, proposal.commit)
        const entry = text === undefined ? undefined : parseEntry(path, text).entry
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
      const loaded = loadEntry(config.destination, id)
      if (loaded.entry === undefined) {
        result.missingLocally.push(id)
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
 * Promotes provisional entries in place. Used by a merge-triggered workflow in the
 * destination repository, where the answer to "who approved this" comes from the event
 * rather than from querying pull requests.
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
