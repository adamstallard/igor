import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * The one seam through which execution gets a place to work.
 *
 * Execution is the only stage that needs a checkout — discovery, triage, claiming and state
 * all go through the API. A tree is disposable and provisioned per task: nothing may assume a
 * checkout persists between tasks or is shared with another.
 *
 * Deliberately says nothing about *how* a tree is made. One Igor running one task at a time is
 * well served by a throwaway clone; many Igors on one server want a shared object store with
 * `git worktree add` per task, because fetch cost is paid once rather than N times. Naming a
 * shape here would bake in the clone-per-task assumption that arrangement exists to avoid.
 */

export class TreeError extends Error {}

/** Every tree this module makes is named with it, and only these may ever be swept. */
export const TREE_PREFIX = 'igor-tree-'

export interface ChangedFile {
  path: string
  content: string
  /** Deletions and binaries are reported but cannot be carried by the tree-API artifact path. */
  kind: 'added' | 'modified' | 'deleted'
}

export interface WorkingTree {
  readonly path: string
  readonly repo: string
  /** Files the worker touched, read back from the tree rather than from what it claimed. */
  changes(): Promise<ChangedFile[]>
  release(): Promise<void>
}

export interface TreeProvider {
  readonly name: string
  provision(repo: string, ref?: string): Promise<WorkingTree>
}

function run(cmd: string, args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    child.stdout.on('data', (c) => (out += c))
    child.stderr.on('data', (c) => (err += c))
    child.on('error', reject)
    child.on('close', (code) =>
      code === 0 ? resolve(out) : reject(new TreeError(`${cmd} ${args[0]}: ${err.trim() || code}`)),
    )
  })
}

/** Statuses git reports that mean the file is gone. */
const DELETED = new Set(['D', 'AD', 'RD'])

/** Exported so the change-collection rules can be tested against a real repository. */
export class ClonedTree implements WorkingTree {
  private released = false

  constructor(
    readonly path: string,
    readonly repo: string,
  ) {}

  async changes(): Promise<ChangedFile[]> {
    // Read from the tree, never from what the worker said it did. A worker that reports a
    // change it did not make, or omits one it did, cannot mislead the artifact this way.
    // `-uall`, because porcelain otherwise collapses an untracked directory to one entry —
    // `?? openspec/` rather than the files under it. Reading that path throws EISDIR, the
    // catch below skips it, and every file a worker created in a new directory is lost from
    // the artifact without a word. Spec deltas are always new files in new directories.
    const status = await run('git', ['-C', this.path, 'status', '--porcelain', '-z', '-uall'])
    const entries = status.split('\0').filter((e) => e.length > 0)
    const out: ChangedFile[] = []

    for (const entry of entries) {
      const code = entry.slice(0, 2).trim()
      const path = entry.slice(3)
      if (path === '') continue
      if (DELETED.has(code)) {
        out.push({ path, content: '', kind: 'deleted' })
        continue
      }
      let content: string
      try {
        content = await readFile(join(this.path, path), 'utf8')
      } catch {
        // A binary or unreadable file; the caller reports it rather than guessing. With
        // `-uall` a directory never reaches here, which is what this used to swallow.
        continue
      }
      out.push({ path, content, kind: code.includes('?') || code === 'A' ? 'added' : 'modified' })
    }
    return out
  }

  /** Idempotent, because release runs from a finally that may also run on an already-failed path. */
  async release(): Promise<void> {
    if (this.released) return
    this.released = true
    await rm(this.path, { recursive: true, force: true })
  }
}

/**
 * A throwaway shallow clone per task. Correct for one Igor at a time, and the simplest thing
 * that cannot leak state between tasks — the tree is a fresh directory that did not exist a
 * moment ago and will not exist a moment later.
 */
export class CloneProvider implements TreeProvider {
  readonly name = 'clone'

  constructor(private readonly depth = 1) {}

  async provision(repo: string, ref?: string): Promise<WorkingTree> {
    const dir = await mkdtemp(join(tmpdir(), TREE_PREFIX))
    const args = ['clone', '--depth', String(this.depth), '--quiet']
    if (ref !== undefined) args.push('--branch', ref)
    args.push(`https://github.com/${repo}.git`, dir)
    try {
      await run('gh', ['auth', 'setup-git'])
      await run('git', args)
    } catch (error) {
      await rm(dir, { recursive: true, force: true })
      throw error
    }
    return new ClonedTree(dir, repo)
  }
}

/**
 * Runs work in a tree and releases it however the work ends.
 *
 * The release is the point: a task that throws, hands off, or is stopped must not leave a tree
 * behind, and putting that in a `finally` here means no caller can forget it.
 */
export async function withTree<T>(
  provider: TreeProvider,
  repo: string,
  fn: (tree: WorkingTree) => Promise<T>,
  ref?: string,
): Promise<T> {
  const tree = await provider.provision(repo, ref)
  try {
    return await fn(tree)
  } finally {
    await tree.release().catch(() => undefined)
  }
}
