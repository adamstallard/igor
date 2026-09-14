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

/** Appends a timestamped record to a newline-delimited JSON log on the state branch. */
export async function appendRecord(
  repo: string,
  path: string,
  record: Record<string, unknown>,
  message: string,
  branch = STATE_BRANCH,
): Promise<void> {
  await ensureStateBranch(repo, branch)
  const line = `${JSON.stringify({ at: new Date().toISOString(), ...record })}\n`

  let existing = ''
  let sha: string | undefined
  try {
    const file = (await ghJson([
      'api',
      `repos/${repo}/contents/${path}?ref=${branch}`,
      '--jq',
      '{content, sha}',
    ])) as { content: string; sha: string }
    existing = Buffer.from(file.content, 'base64').toString('utf8')
    sha = file.sha
  } catch {
    // First record for this log.
  }

  await ghJson(
    ['api', `repos/${repo}/contents/${path}`, '--method', 'PUT', '--input', '-'],
    JSON.stringify({
      message,
      branch,
      content: Buffer.from(existing + line, 'utf8').toString('base64'),
      ...(sha === undefined ? {} : { sha }),
    }),
  )
}
