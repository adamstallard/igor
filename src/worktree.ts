import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
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
  /** A deletion carries no content, and a binary is not reported at all. */
  kind: 'added' | 'modified' | 'deleted'
  /**
   * Whether the file is executable. Only a resolution reads it: it lays blobs over a tree the
   * branch already has, so a mode assumed here replaces the mode that is there.
   */
  executable?: boolean
  /**
   * The name git wrote, present only where `path` is not that name decoded and re-encoded —
   * that is, only where the name is not text and `path` is the U+FFFD spelling of it.
   *
   * Its presence is the signal that this entry must not be published: see `named`.
   */
  rawName?: Buffer
}

/**
 * Splits what the tree reported into what an artifact carries.
 *
 * A path can be reported both ways at once: a file removed with git and written back again is
 * a deletion record and an addition record for the one path. The file on disk wins, because a
 * tree carries each path once — a removal sent beside its own blob either drops the file from
 * the artifact or has the host reject the whole tree.
 *
 * Shared rather than applied twice, because the second place to apply it is whatever tells a
 * person what the run did, and a count that disagrees with the artifact sends them looking for
 * a deletion that is not in the diff.
 */
export function carried(changed: readonly ChangedFile[]): {
  written: ChangedFile[]
  removed: string[]
} {
  const written = changed.filter((c) => c.kind !== 'deleted')
  const paths = new Set(written.map((c) => c.path))
  return {
    written,
    removed: changed.filter((c) => c.kind === 'deleted' && !paths.has(c.path)).map((c) => c.path),
  }
}

/**
 * One path the base changed since the merge base, as blob names on three sides.
 *
 * Shas rather than content: a resolution is checked against these, and the check asks only
 * whether two blobs are the same one. The content of every changed path on both sides would be
 * the whole of the base's diff held in memory for a question three forty-byte strings answer.
 */
export interface BaseChange {
  /** The name decoded, and — only where decoding lost it — the bytes git wrote. */
  path: string
  rawName?: Buffer
  /** The blob at the merge base. Absent where the base added the path. */
  before?: string
  /** The blob the base holds. Absent where the base deleted the path. */
  after?: string
  /**
   * The blob the tree's own head holds, which is what a resolution publishes for this path
   * unless it says otherwise. Absent where head does not hold the path.
   */
  head?: string
}

/** What a merge left behind, and the two commits a resolution of it has to be parented on. */
export interface MergeState {
  /** Paths left with conflict markers in them. Empty where the merge was clean. */
  conflicts: string[]
  /** The tree's head before the merge. */
  head: string
  broughtIn: string
  /**
   * What the base changed since the merge base, against which a resolution is checked for
   * reverts before it is published.
   *
   * Read here rather than at the publish site: the comparison needs the merge base and two
   * trees this clone holds and a released tree can answer nothing.
   */
  baseChanges: BaseChange[]
}

/**
 * The name git would store `content` under: the digest of `blob <bytes>\0` and the bytes
 * themselves, where the bytes are the UTF-8 of `content` because that is what a publish sends.
 */
export function blobSha(content: string, algorithm: 'sha1' | 'sha256' = 'sha1'): string {
  const bytes = Buffer.from(content, 'utf8')
  return createHash(algorithm).update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

/**
 * Whether a string in hand is the blob a tree already holds, answered without writing either
 * one down.
 *
 * The length of the name settles the algorithm, which is the only place a repository's object
 * format is visible from here: forty hex characters is sha1, sixty-four is sha256.
 */
export const sameBlob = (content: string, sha: string): boolean =>
  blobSha(content, sha.length === 64 ? 'sha256' : 'sha1') === sha

export interface WorkingTree {
  readonly path: string
  readonly repo: string
  /** Files the worker touched, read back from the tree rather than from what it claimed. */
  changes(): Promise<ChangedFile[]>
  /**
   * The commit this tree was cut from, which is the tree an artifact built from it must be
   * laid over. Re-reading the branch head at publish time instead opens a window the length of
   * a worker run: a path the base branch deletes inside it, and the worker deletes too, is
   * published as a removal of a path the base tree no longer holds, and the host refuses the
   * whole request with `422 GitRPC::BadObjectState`.
   *
   * Optional on the same terms as `merge`: `TreeProvider` says nothing about how a tree is
   * made, and a publisher that is not given one falls back to reading the branch head.
   */
  head?(): Promise<string>
  /**
   * Merges `ref` in without committing, leaving conflict markers where it conflicts.
   *
   * Optional, because `TreeProvider` deliberately says nothing about how a tree is made and
   * not every arrangement can offer this. A caller that needs it and does not find it hands
   * off rather than guessing at a resolution it has no way to compute.
   */
  merge?(ref: string): Promise<MergeState>
  /**
   * The blobs the commits this tree sits on hold at `path` — its own head, and the commit a
   * merge brought in where one is in progress.
   *
   * Asked about a file the loop reads out of the tree and never publishes. Such a file is the
   * worker's word only where the repository does not keep one at that path: a committed copy is
   * on disk in every fresh clone, and read as this run's it speaks for every run forever.
   *
   * Optional on the same terms as `merge`. A caller that cannot get an answer has no way to
   * tell the two apart and must not take the file as the worker's.
   */
  committed?(path: string): Promise<string[]>
  release(): Promise<void>
}

export interface TreeProvider {
  readonly name: string
  provision(repo: string, ref?: string): Promise<WorkingTree>
}

function runBytes(cmd: string, args: readonly string[], cwd?: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    // Never decode a chunk as it arrives: a multi-byte character the pipe splits in two becomes
    // replacement characters on both sides of the boundary, so a path git listed or the reason
    // it refused comes back wrong and nothing raises. Bytes in, one decode at the end.
    const out: Buffer[] = []
    const err: Buffer[] = []
    child.stdout.on('data', (c: Buffer) => out.push(c))
    child.stderr.on('data', (c: Buffer) => err.push(c))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) return resolve(Buffer.concat(out))
      const why = Buffer.concat(err).toString('utf8').trim()
      reject(new TreeError(`${cmd} ${args[0]}: ${why || code}`))
    })
  })
}

async function run(cmd: string, args: readonly string[], cwd?: string): Promise<string> {
  return (await runBytes(cmd, args, cwd)).toString('utf8')
}

/** One `git status -z` record: the two status columns, and the name as the bytes git wrote. */
export interface StatusRecord {
  flags: string
  path: Buffer
}

/** Splits `-z` output into its entries, dropping the empty one every trailing NUL leaves. */
function nulSeparated(out: Buffer): Buffer[] {
  const entries: Buffer[] = []
  for (let at = 0; at < out.length; ) {
    const nul = out.indexOf(0, at)
    const end = nul === -1 ? out.length : nul
    if (end > at) entries.push(out.subarray(at, end))
    at = end + 1
  }
  return entries
}

/**
 * How many bytes of pathspec go into one `ls-tree`. Well under `ARG_MAX` — 1 MiB on darwin, and
 * Linux caps a single argument at 128 KiB regardless of the total.
 */
const PATHSPEC_BUDGET = 100_000

/**
 * Which of `paths` the tree's own HEAD holds — the one question a removal has to answer, asked
 * of the tree an artifact is laid over rather than of a status flag that stands in for it.
 *
 * **Keyed by the bytes git wrote, not by the decoded name.** Two names differing only in bytes
 * that do not decode share one string, so a set keyed on the string answers for one of them
 * with the other's entry.
 *
 * One process per `PATHSPEC_BUDGET` of names, and none at all where nothing is being removed:
 * the cost is proportional to the removals in hand, not to the size of the repository.
 */
async function heldByHead(treePath: string, paths: readonly Buffer[]): Promise<Set<string>> {
  // `:(literal)`, because a pathspec is a glob otherwise: `foo*` would match `foobar` and call a
  // path HEAD does not hold held, while `a[b].txt` would match nothing and call a path it does
  // hold absent. Joined in bytes, like `inside`, so the prefix cannot disturb the name.
  //
  // Every caller filters out names that are not text first. `spawn` takes arguments as strings
  // and writes them to `argv` as UTF-8, so bytes that did not decode cannot make the trip — they
  // would arrive as U+FFFD, match nothing, and turn a removal into a silent omission.
  const specs = paths.map((p) => Buffer.concat([Buffer.from(':(literal)'), p]).toString('utf8'))
  const held = new Set<string>()
  for (let at = 0; at < specs.length; ) {
    const batch: string[] = []
    for (let bytes = 0; at < specs.length; at += 1) {
      bytes += Buffer.byteLength(specs[at]!) + 1
      if (bytes > PATHSPEC_BUDGET && batch.length > 0) break
      batch.push(specs[at]!)
    }
    const listed = await runBytes('git', [
      '-C',
      treePath,
      // **A pathspec is a channel, and darwin normalises it.** `core.precomposeunicode` is on by
      // default there and git precomposes `argv` before parsing it, so a name HEAD holds in
      // decomposed form is matched by no pathspec at all — the check would say HEAD lacks a path
      // it has, and drop a legitimate removal in silence. Off, the bytes are compared as written.
      '-c',
      'core.precomposeunicode=false',
      'ls-tree',
      'HEAD',
      '-z',
      '-r',
      '--name-only',
      '--full-tree',
      '--',
      ...batch,
    ])
    for (const name of nulSeparated(listed)) held.add(name.toString('latin1'))
  }
  return held
}

/**
 * Splits `git status -z` output into records without decoding any name.
 *
 * A filename is bytes, and on ext4 the only ones it may not contain are `/` and NUL — which is
 * why `-z` separates on NUL. Decoded to a string first, a name that is not valid UTF-8 becomes
 * replacement characters, and the file under that name is one nothing can open.
 *
 * Exported so the parse can be tested against byte sequences no filesystem here will hold.
 */
export function statusRecords(status: Buffer): StatusRecord[] {
  const entries = nulSeparated(status)
  const records: StatusRecord[] = []
  for (let i = 0; i < entries.length; i += 1) {
    const flags = entries[i]!.subarray(0, 2).toString('latin1')
    // One record per entry, and no record carries a second. A rename or a copy would arrive as
    // two — the new path, then the original alone — and reading that second one as a status
    // line takes a path out of the middle of a filename. `changes()` reads with `--no-renames`
    // so porcelain emits neither, and a rename arrives as an ordinary removal and addition.
    const path = entries[i]!.subarray(3)
    records.push({ flags, path })
  }
  return records
}

/**
 * Statuses that mean the file is gone: the work tree column reads `D`, or the index says
 * deleted and the work tree has nothing to add. `MD` counts as much as `AD` — a path the
 * merge staged and the worker then removed is a deletion, and read as an unreadable file
 * instead it is dropped from the files *and* the deletions, so the resolution keeps the
 * artifact's older copy and reverts the base's own change to that path on merge.
 */
const GONE = /^(?:.D|D )$/

/**
 * Either side of an unmerged entry, which is where a delete/modify conflict shows up. Tested
 * before `GONE`, because `UD` reads as gone by that shape while the file is still on disk:
 * reported deleted it would throw away the side the artifact edited.
 */
const UNMERGED = /^(?:U.|.U|AA|DD)$/

/**
 * Joins a name onto the tree it sits in, in bytes. `path.join` takes strings, and a name that
 * is not valid UTF-8 does not survive one: what comes back names no file on disk.
 */
const inside = (tree: string, name: Buffer): Buffer => Buffer.concat([Buffer.from(`${tree}/`), name])

/**
 * A name as a `ChangedFile` carries it: decoded, and — only where decoding lost it — the bytes
 * git actually wrote.
 *
 * The test is a **round trip**, not a search for U+FFFD. A file may legitimately be named with
 * that character, so a search refuses a name that publishes perfectly well; re-encoding the
 * decoded string and comparing it to the bytes has no such case, and no heuristic in it.
 */
export function named(name: Buffer): { path: string; rawName?: Buffer } {
  const path = name.toString('utf8')
  return Buffer.from(path, 'utf8').equals(name) ? { path } : { path, rawName: name }
}

/**
 * Writes a name that is not text so it can be read: printable ASCII as itself, every other byte
 * as `\xHH`, and the backslash doubled so no ordinary name can spell an escape.
 *
 * Distinct bytes give distinct renderings, which is the property that matters — two names
 * differing only in the bytes that did not decode are the case a refusal has to tell apart,
 * and naming both by their decoded spelling names one of them twice.
 *
 * **The backtick and the space are escaped too, although both are printable.** A refusal puts
 * the name inside a code span so markdown leaves the backslashes alone, and the span is what
 * makes those two unsafe: a backtick closes it early, dropping the rest of the name into body
 * text where `\\` collapses to `\`; and a span whose content begins and ends with a space has
 * one taken off each end, so ` \xe9 ` and `\xe9` arrive as the same name. Every other printable
 * byte is inert inside a span, and escaping those would only make the name harder to read.
 */
export function quoteName(name: Buffer): string {
  let out = ''
  for (const byte of name) {
    if (byte === 0x5c) out += '\\\\'
    else if (byte > 0x20 && byte <= 0x7e && byte !== 0x60) out += String.fromCharCode(byte)
    else out += `\\x${byte.toString(16).padStart(2, '0')}`
  }
  return out
}

/**
 * A changed file's name for a person to read: the bytes where the name is not text, and the
 * name itself — backslashes doubled — where it is.
 *
 * **Both sides, or neither.** A backslash is a legal byte in a filename, so doubling only
 * inside `quoteName` leaves a file really named `a\xe9.md` reading exactly like the escape of
 * one named with the byte `0xe9`. That is the collision the refusal exists to stop, reappearing
 * in the sentence that reports it.
 *
 * What keeps the two sides apart is the parity of each backslash run: an escape always carries
 * an odd one, a doubled name never can. Only the escaped side is safe to put in markdown — a
 * backtick in an ordinary name passes through — so a new site that wraps one of these in a code
 * span must escape the ordinary branch too. Today the only one that does is the refusal, which
 * lists escaped names alone.
 */
export const showName = (file: Pick<ChangedFile, 'path' | 'rawName'>): string =>
  file.rawName === undefined ? file.path.replaceAll('\\', '\\\\') : quoteName(file.rawName)

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
    //
    // `-uall`, because porcelain otherwise collapses an untracked directory to one entry —
    // `?? openspec/` rather than the files under it. Reading that path throws EISDIR, the
    // catch below skips it, and every file a worker created in a new directory is lost from
    // the artifact without a word. Spec deltas are always new files in new directories.
    //
    // `--no-renames`, because detection folds two changed paths into one record and a fold
    // **loses** a path from the input rather than misreading one that is present. Where a
    // conflicted merge leaves one path unmerged and the worker deletes another that resembles
    // it, the pair is reported as a rename of the unmerged path and the deletion is absent from
    // the output entirely — nothing downstream can recover what was never read. Off, the same
    // two paths arrive as a removal and an addition, which is the shape the artifact wants
    // anyway: the tree API removes a path or adds one and has no notion of a move.
    const status = await runBytes('git', [
      '-C',
      this.path,
      'status',
      '--porcelain',
      '-z',
      '-uall',
      '--no-renames',
    ])
    const out: ChangedFile[] = []

    const records = statusRecords(status)

    // **Every removal is checked against the tree it will be laid over, before it is one.** Both
    // publishing paths lay their tree over the commit this clone holds — `commitOnBranch` over
    // `parents[0]`, which is the HEAD `merge()` read before merging, and `produce` over
    // `head()` — and `merge --no-commit` leaves HEAD where it was, conflict or no conflict. So
    // HEAD is `base_tree`, and the tree API refuses a removal of a path `base_tree` does not
    // hold with `422 GitRPC::BadObjectState`, refusing the *whole* request: nothing publishes,
    // not even the changes that were correct.
    //
    // Asked of HEAD rather than of the status flags, because no flag answers it. An index column
    // of `A` says the path is the run's own invention, but an intent-to-add path deleted before
    // it was committed prints a column of *space*, indistinguishable from a tracked file's
    // unstaged deletion; and the unmerged codes whose "ours" side HEAD never had — `DD`, `DU`,
    // `AA`, `AU`, `UA` — are told from `UD` and `UU`, which it did, only by the tree.
    //
    // A name that is not text is checked by nobody and kept: `spawn` cannot carry those bytes in
    // `argv`, and dropping the removal would turn a refusal that names the file into an omission.
    // Such a run never publishes — execution stops on any `rawName` before it builds a tree.
    const checkable = records.flatMap(({ flags, path }) =>
      path.length > 0 && (GONE.test(flags) || UNMERGED.test(flags)) && named(path).rawName === undefined
        ? [path]
        : [],
    )
    const inHead = checkable.length === 0 ? new Set<string>() : await heldByHead(this.path, checkable)
    const removable = (name: { rawName?: Buffer }, path: Buffer): boolean =>
      name.rawName !== undefined || inHead.has(path.toString('latin1'))

    for (const { flags, path } of records) {
      const code = flags.trim()
      if (path.length === 0) continue
      // The name the artifact would publish under, and the bytes beside it where that name is
      // not the one on disk. Nothing is dropped here: the publishing path decides what to do
      // with a name that did not survive, and a run that never reaches it — a kill, a stop —
      // still owes an account of what changed.
      const name = named(path)
      if (!UNMERGED.test(flags) && GONE.test(flags)) {
        if (!removable(name, path)) continue
        out.push({ ...name, content: '', kind: 'deleted' })
        continue
      }
      let content: string
      let executable = false
      try {
        content = await readFile(inside(this.path, path), 'utf8')
        executable = ((await stat(inside(this.path, path))).mode & 0o111) !== 0
      } catch {
        // A path still unmerged and no longer on disk is a deletion the worker made. A
        // delete/modify conflict carries no markers, so removing the file is the only way a
        // worker that was told not to run git can say "honour the deletion" — and read as an
        // unreadable file it says nothing at all, so the resolution keeps the artifact's copy
        // and the base's deletion comes back the moment the artifact merges.
        //
        // `DU` is the shape that makes the HEAD check load-bearing here rather than tidy: the
        // artifact branch deleted the path, so HEAD never held it, and the base's copy sitting
        // in the tree is exactly what `conflictPrompt` invites the worker to remove.
        if (UNMERGED.test(flags)) {
          if (!removable(name, path)) continue
          out.push({ ...name, content: '', kind: 'deleted' })
          continue
        }
        // An unreadable file. A binary is not this case and never reaches here: `utf8`
        // substitutes U+FFFD rather than throwing, so a binary is read as mojibake and
        // published as text — see `docs/architecture.md` §6.7.3 for why nothing stops that.
        // With `-uall` a directory never reaches here, which is what this used to swallow.
        continue
      }
      out.push({
        ...name,
        content,
        kind: code.includes('?') || code === 'A' ? 'added' : 'modified',
        ...(executable ? { executable } : {}),
      })
    }
    return out
  }

  /**
   * The clone's own commit, which stays the one it was cut from for the whole run: the worker
   * edits the working tree and Igor publishes, and `merge` brings its side in without
   * committing.
   */
  async head(): Promise<string> {
    return (await run('git', ['-C', this.path, 'rev-parse', 'HEAD'])).trim()
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
    let conflicts: string[]
    try {
      await git('merge', '--no-commit', '--no-ff', broughtIn)
      conflicts = []
    } catch (error) {
      const unmerged = await git('diff', '--name-only', '--diff-filter=U', '-z').catch(() => '')
      conflicts = unmerged.split('\0').filter((p) => p !== '')
      if (conflicts.length === 0) throw error
    }
    // After the merge, although it asks about the two commits rather than about the tree.
    // A merge that cannot run at all — unrelated histories — owes git's own sentence, and
    // `merge-base` gets there first with an exit code and an empty stderr.
    return { conflicts, head, broughtIn, baseChanges: await this.baseChanges(head, broughtIn) }
  }

  /**
   * What `broughtIn` changed since it and `head` last agreed, and what `head` holds for each of
   * those paths — the three blobs a revert is read off.
   *
   * Two `--raw` diffs off the merge base rather than a lookup per path: `--raw` names both
   * blobs of every changed path in one pass, and head's side of a path the base changed is
   * either in head's own diff or unchanged since the merge base, which is `before`. That also
   * keeps names as the bytes git wrote — a lookup would have to pass each one back through
   * `argv`, where a name that is not text cannot go.
   */
  private async baseChanges(head: string, broughtIn: string): Promise<BaseChange[]> {
    const mergeBase = (await run('git', ['-C', this.path, 'merge-base', head, broughtIn])).trim()
    type Sides = { before: string | undefined; after: string | undefined; name: Buffer }
    const diff = async (to: string): Promise<Map<string, Sides>> => {
      // `--no-abbrev` because `--raw` shortens both names by default, and a prefix of a blob
      // name answers a different question from the name — `--abbrev=40` is not the same thing,
      // since it truncates a sha256 repository's names to a length `sameBlob` reads as sha1.
      // `--no-renames` for the reason `changes()` gives: a fold loses a path rather than
      // misreading one.
      const raw = await runBytes('git', [
        '-C',
        this.path,
        'diff',
        '--raw',
        '-z',
        '--no-renames',
        '--no-abbrev',
        mergeBase,
        to,
      ])
      // `:<srcmode> <dstmode> <srcsha> <dstsha> <status>\0<path>\0`, so the entries come in
      // pairs. An all-zero name is the side that does not hold the path.
      const entries = nulSeparated(raw)
      const changed = new Map<string, Sides>()
      for (let i = 0; i + 1 < entries.length; i += 2) {
        const fields = entries[i]!.toString('latin1').split(' ')
        const name = entries[i + 1]!
        const blob = (sha: string | undefined): string | undefined =>
          sha === undefined || /^0+$/.test(sha) ? undefined : sha
        changed.set(name.toString('latin1'), { before: blob(fields[2]), after: blob(fields[3]), name })
      }
      return changed
    }
    const base = await diff(broughtIn)
    const ours = await diff(head)
    return [...base].map(([key, change]) => {
      // A path head's own diff does not mention stands where the merge base left it.
      const ourSide = ours.has(key) ? ours.get(key)!.after : change.before
      return {
        ...named(change.name),
        ...(change.before === undefined ? {} : { before: change.before }),
        ...(change.after === undefined ? {} : { after: change.after }),
        ...(ourSide === undefined ? {} : { head: ourSide }),
      }
    })
  }

  async committed(path: string): Promise<string[]> {
    const shas: string[] = []
    for (const commit of ['HEAD', 'MERGE_HEAD']) {
      // `rev-parse <commit>:<path>` names the blob or exits non-zero, which is the whole
      // question. `MERGE_HEAD` is absent outside a merge, and that is one of the ways.
      const sha = await run('git', ['-C', this.path, 'rev-parse', `${commit}:${path}`]).catch(() => '')
      if (sha.trim() !== '') shas.push(sha.trim())
    }
    return shas
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
