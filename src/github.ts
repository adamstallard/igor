import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { gh, ghPaginated, GhError } from './gh.js'

const run = promisify(execFile)

export class GitHubError extends GhError {}

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
  draft = false,
): Promise<OpenedPr> {
  const pr = (await gh(
    ['api', `repos/${repo}/pulls`, '--method', 'POST', '--input', '-'],
    JSON.stringify({ title, head, base, body, draft }),
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
}

/**
 * Every pull request the repository has, open or closed. Which of them is a lore proposal is
 * decided by the entry files it adds, and the list endpoint carries no file list: `RawPr` is
 * exactly the fields a page holds. So the caller filters, where it can do it on files it was
 * fetching anyway.
 */
export async function listPullRequests(repo: string): Promise<PrState[]> {
  // `--slurp` cannot be combined with `--jq`, so the mapping happens here rather than in
  // the query. Pages come back as an array of arrays.
  const pages = (await gh([
    'api',
    `repos/${repo}/pulls?state=all&per_page=100`,
    '--paginate',
    '--slurp',
  ])) as RawPr[][]

  return pages
    .flat()
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

export interface ProposingCommit {
  /** The proposing commit. A file the reviewer deleted survives at this ref and nowhere else. */
  commit?: string
  files: string[]
}

/**
 * Every status meaning the path was not in the base, which is not just `added`. GitHub pairs a
 * deletion with a sufficiently similar addition and reports the pair as one `renamed` row, so
 * a proposal that retires an entry and replaces it arrives carrying no `added` row at all.
 */
const NEW_PATH_STATUSES = new Set(['added', 'renamed', 'copied'])

/**
 * The paths a read put in the tree, which is what proposing an entry means. `modified`,
 * `changed` and `unchanged` amend a claim somebody already approved and `removed` retires one;
 * counting any of them promotes an entry under whoever merged the sweep that touched it. A
 * status GitHub does not report is dropped on the same principle — nothing is promoted on a
 * guess.
 *
 * Do not narrow this to `added`. The two reads see different diffs — the proposing commit
 * against its own parent, the landed files against the merge base — so the same file comes back
 * `added` in one and `renamed` in the other, and `reconcile` reads a file counted in one and
 * not the other as a candidate the reviewer deleted.
 *
 * Filtering here rather than in a `--jq` string, which no test can reach.
 */
function newPaths(files: readonly { filename: string; status?: string }[]): string[] {
  return files.filter((f) => NEW_PATH_STATUSES.has(f.status ?? '')).map((f) => f.filename)
}

/**
 * The first commit and what it put there — two requests, so callers that can avoid it should.
 *
 * Only what the commit put there, here and in `landedFiles`: see `newPaths`.
 */
export async function proposingCommitFiles(
  repo: string,
  number: number,
): Promise<ProposingCommit> {
  const commits = (await gh([
    'api', `repos/${repo}/pulls/${number}/commits`, '--jq', '[.[] | .sha]',
  ])) as string[]
  const first = commits[0]
  if (first === undefined) return { files: [] }
  const files = (await gh([
    'api', `repos/${repo}/commits/${first}`, '--jq', '[.files[] | {filename, status}]',
  ])) as { filename: string; status?: string }[]
  return { commit: first, files: newPaths(files) }
}

export interface Proposal extends ProposingCommit {
  /** Everything the pull request put forward, whether or not it survived review. */
  files: string[]
  /**
   * Paths the pull request left on the default branch, which is a wider set than `files`: a
   * file it only edited is there too. A proposed entry missing from here was deleted by the
   * reviewer, and that is recorded permanently, so this must not be narrowed to what `files`
   * counts.
   */
  landed: string[]
}

/**
 * What a pull request proposed: the union of its first commit and its base-to-head diff.
 *
 * Neither half is enough alone. The first commit is the only place a candidate the reviewer
 * deleted still exists. The diff is the only place an entry added by a *later* commit shows up,
 * which is the ordinary shape of a pull request somebody opened by hand — and recognizing those
 * is the point of judging a proposal by its files.
 */
export async function proposedFiles(repo: string, number: number): Promise<Proposal> {
  const diff = await landedDiff(repo, number)
  const proposing = await proposingCommitFiles(repo, number)
  return {
    ...proposing,
    files: [...new Set([...proposing.files, ...diff.proposed])],
    landed: diff.atHead,
  }
}

/**
 * A pull request's base-to-head diff, read for the two different questions it answers.
 *
 * Keeping them apart is the point. `proposed` is recognition and must be narrow, or a
 * formatting sweep proposes every entry it reformatted. `atHead` is a fact about the tree, and
 * must not be: a caller absent from it is taken to have been deleted by the reviewer, and that
 * is written to `rejected/` permanently. An entry the pull request only modified is still
 * there, so narrowing `atHead` the way recognition is narrowed would reject a live entry.
 */
interface LandedDiff {
  /** Entry paths the pull request put there — recognition's half of the union. */
  proposed: string[]
  /** Paths the pull request left behind it, added or not. Only a deletion is missing. */
  atHead: string[]
}

async function landedDiff(repo: string, number: number): Promise<LandedDiff> {
  const files = await ghPaginated<{ filename: string; status?: string }>([
    'api', `repos/${repo}/pulls/${number}/files?per_page=100`,
  ])
  return {
    proposed: newPaths(files),
    atHead: files.filter((f) => f.status !== 'removed').map((f) => f.filename),
  }
}

/**
 * The entry files a pull request would put on the default branch — the diff half of
 * recognition, for a caller that only needs to know whether there is a proposal here at all.
 *
 * Shares `newPaths` with the proposing commit, and must: see there.
 */
export async function landedFiles(repo: string, number: number): Promise<string[]> {
  return (await landedDiff(repo, number)).proposed
}

/** A file's text at any ref — a commit, branch or tag. Undefined when it is not there. */
export async function fileAtRef(
  repo: string,
  path: string,
  ref: string,
): Promise<string | undefined> {
  try {
    const file = (await gh([
      'api', `repos/${repo}/contents/${path}?ref=${ref}`, '--jq', '{content}',
    ])) as { content: string }
    return Buffer.from(file.content, 'base64').toString('utf8')
  } catch {
    return undefined
  }
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
