import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

const run = promisify(execFile)

export class GitHubError extends Error {}

/**
 * Runs a command, optionally writing to its stdin. `execFile`'s promisified form silently
 * ignores an `input` option — that belongs to `execFileSync` — so anything reading stdin
 * hangs forever waiting on input that never arrives.
 */
function runWithInput(
  command: string,
  args: readonly string[],
  input: string,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr.trim() || `exited with code ${code}`))
    })
    child.stdin.end(input)
  })
}

/** Uses the gh CLI so credentials and enterprise hosts are whatever the user already set up. */
async function gh(args: string[], input?: string): Promise<unknown> {
  try {
    const stdout =
      input === undefined
        ? (await run('gh', args, { maxBuffer: 32 * 1024 * 1024 })).stdout
        : await runWithInput('gh', args, input)
    return stdout.trim() === '' ? null : JSON.parse(stdout)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new GitHubError(`gh ${args.slice(0, 2).join(' ')} failed: ${message}`)
  }
}

/** Reads `owner/name` from a checkout's origin remote, so it cannot drift from config. */
export async function repoFromCheckout(dir: string): Promise<string> {
  let url: string
  try {
    const { stdout } = await run('git', ['-C', dir, 'remote', 'get-url', 'origin'])
    url = stdout.trim()
  } catch {
    throw new GitHubError(
      `${dir} has no origin remote — the lore destination must be a checkout of the repository pull requests are opened against`,
    )
  }
  const match = url.match(/github\.com[:/](?<owner>[^/]+)\/(?<name>[^/.]+)(\.git)?$/)
  if (!match?.groups) throw new GitHubError(`cannot read a GitHub repository from ${url}`)
  return `${match.groups['owner']}/${match.groups['name']}`
}

export async function isPublic(repo: string): Promise<boolean> {
  const data = (await gh(['api', `repos/${repo}`, '--jq', '{private}'])) as { private: boolean }
  return !data.private
}

export async function defaultBranch(repo: string): Promise<string> {
  const data = (await gh(['api', `repos/${repo}`, '--jq', '{default_branch}'])) as {
    default_branch: string
  }
  return data.default_branch
}

export async function branchSha(repo: string, branch: string): Promise<string> {
  const data = (await gh(['api', `repos/${repo}/git/ref/heads/${branch}`, '--jq',
    '{sha: .object.sha}'])) as { sha: string }
  return data.sha
}

export interface FileToCommit {
  path: string
  content: string
}

/**
 * Creates a branch carrying the given files as one commit. Uses the tree API rather than a
 * checkout, so nothing has to be cloned.
 */
export async function createBranchWithFiles(
  repo: string,
  branch: string,
  baseSha: string,
  files: readonly FileToCommit[],
  message: string,
): Promise<string> {
  const blobs: { path: string; sha: string }[] = []
  for (const file of files) {
    const blob = (await gh(
      ['api', `repos/${repo}/git/blobs`, '--method', 'POST', '--input', '-'],
      JSON.stringify({ content: file.content, encoding: 'utf-8' }),
    )) as { sha: string }
    blobs.push({ path: file.path, sha: blob.sha })
  }

  const tree = (await gh(
    ['api', `repos/${repo}/git/trees`, '--method', 'POST', '--input', '-'],
    JSON.stringify({
      base_tree: baseSha,
      tree: blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
    }),
  )) as { sha: string }

  const commit = (await gh(
    ['api', `repos/${repo}/git/commits`, '--method', 'POST', '--input', '-'],
    JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }),
  )) as { sha: string }

  await gh(
    ['api', `repos/${repo}/git/refs`, '--method', 'POST', '--input', '-'],
    JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }),
  )
  return commit.sha
}

export interface OpenedPr {
  number: number
  url: string
}

export async function openPullRequest(
  repo: string,
  head: string,
  base: string,
  title: string,
  body: string,
): Promise<OpenedPr> {
  const pr = (await gh(
    ['api', `repos/${repo}/pulls`, '--method', 'POST', '--input', '-'],
    JSON.stringify({ title, head, base, body }),
  )) as { number: number; html_url: string }
  return { number: pr.number, url: pr.html_url }
}

/**
 * Assigns and reports who was actually assigned. GitHub accepts a request naming a
 * non-collaborator and silently drops them, so the caller has to read the result back rather
 * than trust that the call succeeded.
 */
export async function assign(
  repo: string,
  number: number,
  logins: readonly string[],
): Promise<string[]> {
  if (logins.length === 0) return []
  const issue = (await gh(
    ['api', `repos/${repo}/issues/${number}/assignees`, '--method', 'POST', '--input', '-'],
    JSON.stringify({ assignees: logins }),
  )) as { assignees: { login: string }[] }
  return issue.assignees.map((a) => a.login)
}

export async function requestReviewers(
  repo: string,
  number: number,
  logins: readonly string[],
): Promise<void> {
  if (logins.length === 0) return
  try {
    await gh(
      ['api', `repos/${repo}/pulls/${number}/requested_reviewers`, '--method', 'POST', '--input', '-'],
      JSON.stringify({ reviewers: logins }),
    )
  } catch {
    // GitHub refuses a review request for the PR author and for non-collaborators. Assignment
    // already puts the PR in front of them, so this is not worth failing the run over.
  }
}

export interface PrState {
  number: number
  state: 'open' | 'closed'
  merged: boolean
  mergedBy?: string
  mergedAt?: string
  updatedAt: string
  assignees: string[]
  url: string
}

interface RawPr {
  number: number
  state: 'open' | 'closed'
  merged_at: string | null
  updated_at: string
  html_url: string
  assignees: { login: string }[]
  merged_by: { login: string } | null
  head: { ref: string }
}

export async function listOpenedBy(repo: string, branchPrefix: string): Promise<PrState[]> {
  // `--slurp` cannot be combined with `--jq`, so the filtering happens here rather than in
  // the query. Pages come back as an array of arrays.
  const pages = (await gh([
    'api',
    `repos/${repo}/pulls?state=all&per_page=100`,
    '--paginate',
    '--slurp',
  ])) as RawPr[][]

  return pages
    .flat()
    .filter((p) => p.head.ref.startsWith(branchPrefix))
    .map((p) => ({
      number: p.number,
      state: p.state,
      merged: p.merged_at !== null,
      ...(p.merged_by ? { mergedBy: p.merged_by.login } : {}),
      ...(p.merged_at ? { mergedAt: p.merged_at.slice(0, 10) } : {}),
      updatedAt: p.updated_at.slice(0, 10),
      assignees: p.assignees.map((a) => a.login),
      url: p.html_url,
    }))
}

/** Files a pull request proposed, read from its first commit rather than from stored state. */
export async function proposedFiles(repo: string, number: number): Promise<string[]> {
  const commits = (await gh([
    'api', `repos/${repo}/pulls/${number}/commits`, '--jq', '[.[] | .sha]',
  ])) as string[]
  const first = commits[0]
  if (first === undefined) return []
  const commit = (await gh([
    'api', `repos/${repo}/commits/${first}`, '--jq', '[.files[] | .filename]',
  ])) as string[]
  return commit
}

export async function fileExistsOnBranch(
  repo: string,
  path: string,
  branch: string,
): Promise<boolean> {
  try {
    await gh(['api', `repos/${repo}/contents/${path}?ref=${branch}`, '--jq', '{sha}'])
    return true
  } catch {
    return false
  }
}
