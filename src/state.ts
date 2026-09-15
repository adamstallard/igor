import { gh, GhError } from './gh.js'

/**
 * Machine output gets a machine venue. State lives on an orphan branch so `main` stays
 * purely human-meaningful, while state still survives a fresh clone and stays inspectable
 * with `git show <branch>:<path>`.
 */
export const STATE_BRANCH = 'igor-state'

export class StateError extends GhError {}

const ghJson = gh

async function branchExists(repo: string, branch: string): Promise<boolean> {
  try {
    await ghJson(['api', `repos/${repo}/git/ref/heads/${branch}`, '--jq', '{ref}'])
    return true
  } catch {
    return false
  }
}

/**
 * Creates the state branch with no parent, so it shares no history with `main` and cannot be
 * merged into it by accident.
 */
async function createOrphanBranch(repo: string, branch: string): Promise<void> {
  const tree = (await ghJson(
    ['api', `repos/${repo}/git/trees`, '--method', 'POST', '--input', '-'],
    JSON.stringify({
      tree: [
        {
          path: 'README.md',
          mode: '100644',
          type: 'blob',
          content:
            '# igor state\n\nMachine-written. Watermarks, decisions, transcripts and budget\n' +
            'observations. Shares no history with `main` on purpose.\n\n' +
            'This is a **cache**: the tracker is the source of truth for what is claimed.\n' +
            'Deleting this branch costs re-examination, never a duplicate claim.\n',
        },
      ],
    }),
  )) as { sha: string }

  const commit = (await ghJson(
    ['api', `repos/${repo}/git/commits`, '--method', 'POST', '--input', '-'],
    JSON.stringify({ message: 'Initialize igor state', tree: tree.sha, parents: [] }),
  )) as { sha: string }

  await ghJson(
    ['api', `repos/${repo}/git/refs`, '--method', 'POST', '--input', '-'],
    JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
  )
}

export async function ensureStateBranch(repo: string, branch = STATE_BRANCH): Promise<void> {
  if (!(await branchExists(repo, branch))) await createOrphanBranch(repo, branch)
}

/** Raw bytes, for the append-only logs that are newline-delimited rather than a JSON document. */
export async function readStateRaw(
  repo: string,
  path: string,
  branch = STATE_BRANCH,
): Promise<string | undefined> {
  try {
    const file = (await ghJson([
      'api',
      `repos/${repo}/contents/${path}?ref=${branch}`,
      '--jq',
      '{content}',
    ])) as { content: string }
    return Buffer.from(file.content, 'base64').toString('utf8')
  } catch {
    return undefined
  }
}

/** Returns undefined rather than throwing when absent — state is a cache, not a dependency. */
export async function readState<T>(
  repo: string,
  path: string,
  branch = STATE_BRANCH,
): Promise<T | undefined> {
  try {
    const file = (await ghJson([
      'api',
      `repos/${repo}/contents/${path}?ref=${branch}`,
      '--jq',
      '{content}',
    ])) as { content: string }
    return JSON.parse(Buffer.from(file.content, 'base64').toString('utf8')) as T
  } catch {
    return undefined
  }
}

async function currentSha(repo: string, path: string, branch: string): Promise<string | undefined> {
  try {
    const file = (await ghJson([
      'api',
      `repos/${repo}/contents/${path}?ref=${branch}`,
      '--jq',
      '{sha}',
    ])) as { sha: string }
    return file.sha
  } catch {
    return undefined
  }
}

/**
 * Writes only when the content actually differs. Discovery runs on an interval and most
 * cycles change nothing; writing regardless would fill the branch with empty commits.
 */
export async function writeState(
  repo: string,
  path: string,
  value: unknown,
  message: string,
  branch = STATE_BRANCH,
): Promise<boolean> {
  await ensureStateBranch(repo, branch)
  const next = `${JSON.stringify(value, null, 2)}\n`
  const existing = await readState<unknown>(repo, path, branch)
  if (existing !== undefined && `${JSON.stringify(existing, null, 2)}\n` === next) return false

  const sha = await currentSha(repo, path, branch)
  await ghJson(
    ['api', `repos/${repo}/contents/${path}`, '--method', 'PUT', '--input', '-'],
    JSON.stringify({
      message,
      branch,
      content: Buffer.from(next, 'utf8').toString('base64'),
      ...(sha === undefined ? {} : { sha }),
    }),
  )
  return true
}

/**
 * Where a record stamped `at` belongs. One file per UTC day, so a log stops growing at
 * midnight and an append re-uploads a day of traffic rather than all of history.
 */
export function partitionPath(path: string, at: string): string {
  return `${path.replace(/\.ndjson$/, '')}/${at.slice(0, 10)}.ndjson`
}

/** Names of the `.ndjson` files in a directory, sorted. An absent directory reads as empty. */
async function listPartitions(repo: string, dir: string, branch: string): Promise<string[]> {
  try {
    const entries = await ghJson<unknown>(['api', `repos/${repo}/contents/${dir}?ref=${branch}`])
    if (!Array.isArray(entries)) return []
    return (entries as { name?: unknown; type?: unknown }[])
      .filter((e) => e.type === 'file' && typeof e.name === 'string' && e.name.endsWith('.ndjson'))
      .map((e) => e.name as string)
      .sort()
  } catch {
    return []
  }
}

/**
 * A whole log, oldest first: the unpartitioned file, then every partition in date order.
 *
 * The unpartitioned file holds records written before this log was partitioned, so it leads.
 * Partition names are ISO dates, so sorting them by name orders them by time.
 */
/**
 * A past day's partition never changes, so it is read once per process.
 *
 * `loadSpend` reads the whole log on every budget gate, and `serve` gates once per item — so
 * an uncached read costs a request per day of history, every item. Sixty gates an hour against
 * a 5,000/hour REST budget reaches the limit in about eighty days, and sooner where several
 * processes share one account, since the limit is per account rather than per token.
 *
 * Today's partition and the directory listing are always re-read. Both are constant, and it is
 * the per-day term that grows. The legacy unpartitioned file is re-read too: this build never
 * appends to it, but caching it would go stale under a fleet where something older still does,
 * and one constant request is not worth that.
 */
const settled = new Map<string, string>()

/** Tests share a process, so a fake repository's contents must not outlive its test. */
export function forgetSettledPartitions(): void {
  settled.clear()
}

export async function readLog(
  repo: string,
  path: string,
  branch = STATE_BRANCH,
  now: number = Date.now(),
): Promise<string> {
  const dir = path.replace(/\.ndjson$/, '')
  const today = new Date(now).toISOString().slice(0, 10)
  const [whole, names] = await Promise.all([
    readStateRaw(repo, path, branch),
    listPartitions(repo, dir, branch),
  ])
  const parts = await Promise.all(
    names.map(async (name) => {
      const key = `${repo}\u0000${branch}\u0000${dir}/${name}`
      const settledDay = name.replace(/\.ndjson$/, '') < today
      if (settledDay) {
        const hit = settled.get(key)
        if (hit !== undefined) return hit
      }
      const body = await readStateRaw(repo, `${dir}/${name}`, branch)
      if (settledDay && body !== undefined) settled.set(key, body)
      return body
    }),
  )
  // A part whose last line lost its newline must not glue itself onto the next part's first.
  return [whole, ...parts]
    .filter((part): part is string => part !== undefined && part !== '')
    .map((part) => (part.endsWith('\n') ? part : `${part}\n`))
    .join('')
}

/**
 * Appends a timestamped record to a newline-delimited JSON log on the state branch.
 *
 * The Contents API has no append, so the day's partition is downloaded and re-uploaded with
 * the line on the end. Partitioning is what bounds that: the file being rewritten is one
 * day's, not the log's whole history. Read the log back with `readLog`, never by path.
 */
export async function appendRecord(
  repo: string,
  path: string,
  record: Record<string, unknown>,
  message: string,
  branch = STATE_BRANCH,
): Promise<void> {
  await ensureStateBranch(repo, branch)
  // One clock read: a write straddling midnight must not stamp a record outside its partition.
  const at = new Date().toISOString()
  const line = `${JSON.stringify({ at, ...record })}\n`
  const target = partitionPath(path, at)

  let existing = ''
  let sha: string | undefined
  try {
    const file = (await ghJson([
      'api',
      `repos/${repo}/contents/${target}?ref=${branch}`,
      '--jq',
      '{content, sha}',
    ])) as { content: string; sha: string }
    existing = Buffer.from(file.content, 'base64').toString('utf8')
    sha = file.sha
  } catch {
    // First record of the day for this log.
  }

  await ghJson(
    ['api', `repos/${repo}/contents/${target}`, '--method', 'PUT', '--input', '-'],
    JSON.stringify({
      message,
      branch,
      content: Buffer.from(existing + line, 'utf8').toString('base64'),
      ...(sha === undefined ? {} : { sha }),
    }),
  )
}
