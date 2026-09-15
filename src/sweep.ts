import { lstat, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_TIMEOUT_MS } from './execute.js'
import { TREE_PREFIX } from './worktree.js'
import type { Reporter } from './wiring.js'

/**
 * Reclaims working trees left behind by a process that died.
 *
 * `withTree` releases in a `finally`, and a `finally` does not run on SIGKILL, an OOM kill or
 * a power loss — so every crash strands a full checkout in the temp directory. Exit is the one
 * path that cannot clean up, so this runs on the way in instead.
 *
 * Age is the only safe signal. Several processes of one role are a design goal, so a tree that
 * looks idle may belong to a live sibling; nothing here may assume it is the only Igor.
 */

/**
 * Four worker timeouts. A tree outlives its worker only by a clone and an artifact push, so an
 * hour is many times the longest one can plausibly be in use — and deleting a live sibling's
 * tree corrupts a run, while leaving debris another hour costs nothing.
 */
export const SWEEP_AFTER_MS = 4 * DEFAULT_TIMEOUT_MS

/**
 * Exactly what `mkdtemp` appends to the prefix: a non-empty run of alphanumerics. A name with a
 * separator, a dot, or no suffix at all was not made here.
 */
const TREE_NAME = new RegExp(`^${TREE_PREFIX}[A-Za-z0-9]+$`)

/** The only names a sweep may touch. */
export function isTreeName(name: string): boolean {
  return TREE_NAME.test(name)
}

/** Ours by name, and older than any live worker's tree can be. */
export function sweepable(name: string, newestMs: number, now: number, olderThanMs: number): boolean {
  return isTreeName(name) && now - newestMs >= olderThanMs
}

export interface SweepOptions {
  /** Where trees are provisioned. Injectable so a test never sweeps the real temp directory. */
  root?: string
  now?: number
  olderThanMs?: number
}

export interface SweepResult {
  removed: number
  failed: number
  oldestHours: number
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export async function sweepAbandonedTrees(out: Reporter, options: SweepOptions = {}): Promise<SweepResult> {
  const root = options.root ?? tmpdir()
  const now = options.now ?? Date.now()
  const olderThanMs = options.olderThanMs ?? SWEEP_AFTER_MS
  const result: SweepResult = { removed: 0, failed: 0, oldestHours: 0 }

  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    out.warn(`cannot sweep abandoned trees in ${root}: ${reason(error)}`)
    return result
  }

  for (const entry of entries) {
    if (!isTreeName(entry.name)) continue
    // A symlink reports isSymbolicLink() and never isDirectory(), so one planted under our
    // name is left alone rather than followed out of the temp directory.
    // readdir yields bare basenames and the name rule rejects separators, so the join stays in `root`.
    if (entry.isSymbolicLink() || !entry.isDirectory()) continue
    const path = join(root, entry.name)
    try {
      const stats = await lstat(path)
      // The newest of the three, so a tree whose age is ambiguous looks young and survives.
      const newest = Math.max(stats.birthtimeMs, stats.mtimeMs, stats.ctimeMs)
      if (!sweepable(entry.name, newest, now, olderThanMs)) continue
      await rm(path, { recursive: true, force: true })
      result.removed++
      result.oldestHours = Math.max(result.oldestHours, (now - newest) / 3_600_000)
    } catch (error) {
      // One tree nobody can delete must not cost the rest of the sweep.
      result.failed++
      out.warn(`cannot remove abandoned tree ${path}: ${reason(error)}`)
    }
  }

  if (result.removed > 0) {
    const plural = result.removed === 1 ? '' : 's'
    out.say(
      `swept ${result.removed} abandoned tree${plural} from ${root} ` +
        `(oldest ${result.oldestHours.toFixed(1)}h)`,
    )
  }
  return result
}
