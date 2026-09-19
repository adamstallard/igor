import { spawn } from 'node:child_process'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
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
  /**
   * Whether the file is executable. Only a resolution reads it: it lays blobs over a tree the
   * branch already has, so a mode assumed here replaces the mode that is there.
   */
  executable?: boolean
}

/** What a merge left behind, and the two commits a resolution of it has to be parented on. */
export interface MergeState {
  /** Paths left with conflict markers in them. Empty where the merge was clean. */
  conflicts: string[]
  /** The tree's head before the merge. */
  head: string
  broughtIn: string
}

export interface WorkingTree {
  readonly path: string
  readonly repo: string
  /** Files the worker touched, read back from the tree rather than from what it claimed. */
  changes(): Promise<ChangedFile[]>
  /**
   * Merges `ref` in without committing, leaving conflict markers where it conflicts.
   *
   * Optional, because `TreeProvider` deliberately says nothing about how a tree is made and
   * not every arrangement can offer this. A caller that needs it and does not find it hands
   * off rather than guessing at a resolution it has no way to compute.
   */
  merge?(ref: string): Promise<MergeState>
  release(): Promise<void>
}

export interface TreeProvider {
  readonly name: string
  provision(repo: string, ref?: string): Promise<WorkingTree>
}

function run(cmd: string, args: readonly string[], cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    // Text, not raw chunks: a multi-byte character the pipe splits in two decodes to replacement
    // characters, so a path git listed or the reason it refused comes back wrong and nothing
    // raises.
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
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

/** Either side of an unmerged entry, which is where a delete/modify conflict shows up. */
const UNMERGED = /^(?:U.|.U|AA|DD)$/

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

    for (let i = 0; i < entries.length; i += 1) {
      const entry = entries[i]!
      const code = entry.slice(0, 2).trim()
      const path = entry.slice(3)
      // A rename or a copy is **two** records: the new path, then the original alone on the
      // next one. Read as a status line that second record is a path sliced out of the middle
      // of a filename, so the original is reported as neither changed nor deleted — and a
      // resolution, which lays its files over the tree the branch already has, keeps the old
      // path and publishes the file twice. A merge is where renames arrive, so this is the
      // ordinary case rather than an exotic one.
      const from = entry.startsWith('R') || entry.startsWith('C') ? entries[++i] : undefined
      if (entry.startsWith('R') && from !== undefined && from !== '') {
        out.push({ path: from, content: '', kind: 'deleted' })
      }
      if (path === '') continue
      if (DELETED.has(code)) {
        out.push({ path, content: '', kind: 'deleted' })
        continue
      }
      let content: string
      let executable = false
      try {
        content = await readFile(join(this.path, path), 'utf8')
        executable = ((await stat(join(this.path, path))).mode & 0o111) !== 0
      } catch {
        // A path still unmerged and no longer on disk is a deletion the worker made. A
        // delete/modify conflict carries no markers, so removing the file is the only way a
        // worker that was told not to run git can say "honour the deletion" — and read as an
        // unreadable file it says nothing at all, so the resolution keeps the artifact's copy
        // and the base's deletion comes back the moment the artifact merges.
        if (UNMERGED.test(entry.slice(0, 2))) {
          out.push({ path, content: '', kind: 'deleted' })
          continue
        }
        // A binary or unreadable file; the caller reports it rather than guessing. With
        // `-uall` a directory never reaches here, which is what this used to swallow.
        continue
      }
      out.push({
        path,
        content,
        kind: code.includes('?') || code === 'A' ? 'added' : 'modified',
        ...(executable ? { executable } : {}),
      })
    }
    return out
  }

  /**
   * Brings `ref` in and stops before the commit, so the tree holds the merge and nothing else
   * does — no local commit to push, no identity to configure, and the loop still publishes.
   *
   * The clone is deepened first. A depth-1 clone has no ancestor in common with anything, so
   * git refuses the merge outright rather than conflicting on it, and the worker would be
   * handed an error instead of the files it is here for.
   *
   * A conflict is not a failure of this call: git exits non-zero and leaves exactly the tree
   * that was asked for. Unmerged paths are what tells the two apart, rather than the exit
   * code, which a merge refused for some other reason shares.
   */
  async merge(ref: string): Promise<MergeState> {
    const git = (...args: string[]): Promise<string> => run('git', ['-C', this.path, ...args])
    if ((await git('rev-parse', '--is-shallow-repository')).trim() === 'true') {
      await git('fetch', '--quiet', '--unshallow', 'origin')
    }
    await git('fetch', '--quiet', 'origin', ref)
    const head = (await git('rev-parse', 'HEAD')).trim()
    const broughtIn = (await git('rev-parse', 'FETCH_HEAD')).trim()
    try {
      await git('merge', '--no-commit', '--no-ff', broughtIn)
      return { conflicts: [], head, broughtIn }
    } catch (error) {
      const unmerged = await git('diff', '--name-only', '--diff-filter=U', '-z').catch(() => '')
      const conflicts = unmerged.split('\0').filter((p) => p !== '')
      if (conflicts.length === 0) throw error
      return { conflicts, head, broughtIn }
    }
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
