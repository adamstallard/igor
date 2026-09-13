import { basename } from 'node:path'
import type { Config } from './config.js'
import { loadEntry, writeEntry, takenIds, StoreError } from './store.js'
import { BRANCH_PREFIX } from './propose.js'
import { listOpenedBy, proposedFiles, repoFromCheckout, type PrState } from './github.js'

export interface Promoted {
  id: string
  by: string
  at: string
  pr: number
}

export interface Declined {
  id: string
  pr: number
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

    const proposed = idsFrom(await proposedFiles(repo, pr.number))
    for (const id of proposed) {
      if (!present.has(id)) {
        // Either the reviewer deleted it, or the checkout is behind. Both look identical
        // from here, which is why the caller is told to pull first.
        result.declined.push({ id, pr: pr.number })
        continue
      }
      const loaded = loadEntry(config.destination, id)
      if (loaded.entry === undefined) {
        result.missingLocally.push(id)
        continue
      }
      if (loaded.entry.status !== 'provisional') continue
      const by = pr.mergedBy ?? pr.assignees[0] ?? 'unknown'
      const at = pr.mergedAt ?? now.toISOString().slice(0, 10)
      writeEntry(config.destination, {
        ...loaded.entry,
        status: 'active',
        reviewed: { by, at },
      })
      result.promoted.push({ id, by, at, pr: pr.number })
    }
  }
  return result
}

export { StoreError }
export type { PrState }
