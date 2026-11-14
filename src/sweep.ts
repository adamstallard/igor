import { lstat, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ABSOLUTE_CEILING_MS } from './execute.js'
import { OUTBOX_SUFFIX, TREE_PREFIX } from './worktree.js'
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
 * The longest a worker can live, plus the clone and the push either side of it. The margin is
 * added rather than multiplied because what a tree outlives its worker by is a fixed cost, not
 * a share of the run. Deleting a live sibling's tree corrupts its run; leaving debris another
 * hour costs disk.
 */
export const SWEEP_AFTER_MS = ABSOLUTE_CEILING_MS + 60 * 60 * 1000

/**
 * Exactly what `mkdtemp` appends to the prefix — a non-empty run of alphanumerics — and then
 * whatever fixed suffix the caller adds after it. A name whose random part holds a separator or
 * a dot, or that has no random part at all, was not made here.
 *
 * Both ends are escaped rather than interpolated raw. Neither holds a metacharacter today, but this
 * rule decides what gets deleted, and a later prefix containing `.` or `+` would widen it
 * silently — an unescaped `igor.tree-` matches `igorXtree-abc`.
 */
export function nameRuleFor(prefix: string, suffix = ''): RegExp {
  const literal = (part: string) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${literal(prefix)}[A-Za-z0-9]+${literal(suffix)}$`)
}

const TREE_NAME = nameRuleFor(TREE_PREFIX)
/** A run strands two directories, and only one of them is the checkout. */
const OUTBOX_NAME = nameRuleFor(TREE_PREFIX, OUTBOX_SUFFIX)

/** The only names a sweep may touch. */
export function isTreeName(name: string): boolean {
  return TREE_NAME.test(name) || OUTBOX_NAME.test(name)
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
