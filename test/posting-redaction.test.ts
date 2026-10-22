import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from '../src/adapter.js'
import { rememberSecret } from '../src/redact.js'
import { githubToken } from './tokens.js'

/**
 * Every body `gh` is handed, so a test can check what would have been posted. `gh` is the one
 * process every post goes through, and faking only it runs the real adapter code that calls `gh`.
 */
const posted = vi.hoisted(() => [] as string[])
vi.mock('../src/gh.js', async (actual) => {
  const real = await actual<typeof import('../src/gh.js')>()
  const call = async (args: readonly string[], input?: string) => {
    if (input !== undefined) posted.push(input)
    const endpoint = args[1] ?? ''
    if (endpoint.endsWith('/pulls')) return { number: 9, html_url: 'https://github.com/o/r/pull/9' }
    if (endpoint.endsWith('/issues')) return { html_url: 'https://github.com/o/r/issues/12' }
    if (endpoint.endsWith('/comments')) return { id: 1, html_url: 'https://github.com/o/r/issues/7#issuecomment-1' }
    return { sha: 'sha1' }
  }
  return { ...real, gh: call, ghPaginated: call }
})

const { GitHubTracker, GitHubCodeHost } = await import('../src/github-adapter.js')
const { commitOnBranch, createBranchWithFiles, mergeIntoBranch, openPullRequest } = await import('../src/github.js')

// Assembled at run time, so no token-shaped literal sits in the source for a scanner to flag.
const GITHUB = githubToken('ghp_')
// A secret the Igor registered, such as an installation token it minted. The text below puts it
// in a remote's URL.
const URL_SECRET = 'hunter2secret-minted'
rememberSecret(URL_SECRET)
const leak = `push failed: ${GITHUB} via https://x-access-token:${URL_SECRET}@github.com/o/r.git`

const item = { id: 'github:o/r#7', repo: 'o/r', native: '7', holders: [] } as unknown as Candidate
const tracker = () => new GitHubTracker({ role: 'reviewer', account: { login: 'acme-reviewer[bot]', id: 99 } })

function expectClean(): void {
  const all = posted.join('\n')
  expect(all).not.toContain(GITHUB)
  expect(all).not.toContain(URL_SECRET)
  expect(all).toContain('[redacted]')
}

describe('text Igor posts is redacted before it is sent', () => {
  beforeEach(() => {
    posted.length = 0
  })

  it("a comment on an item (the tracker's report)", async () => {
    await tracker().report(item, `Handing this back: ${leak}`)
    expectClean()
  })

  it("an issue's title and body (the tracker's createIssue)", async () => {
    await tracker().createIssue('o/r', `Failed: ${GITHUB}`, leak)
    expectClean()
  })

  it("a pull request's title, body and commit message (the code host's produce)", async () => {
    await new GitHubCodeHost().produce({
      repo: 'o/r',
      branch: 'igor/7',
      base: 'main',
      baseSha: 'base',
      title: `Fix ${GITHUB}`,
      body: `Transcript: ${leak}`,
      files: [{ path: 'a.txt', content: 'kept as written' }],
      deletions: [],
      draft: false,
    })
    expectClean()
    expect(posted.join('\n')).toContain('kept as written')
  })

  it("a resolution's commit message (the code host's resolve)", async () => {
    await new GitHubCodeHost().resolve({
      repo: 'o/r',
      branch: 'igor/7',
      parents: ['p1', 'p2'],
      files: [{ path: 'a.txt', content: 'x' }],
      deletions: [],
      message: `Merge main: ${leak}`,
    })
    expectClean()
  })

  it("openPullRequest's title and body, called directly as lore proposals do", async () => {
    await openPullRequest('o/r', 'lore/x', 'main', `Lore ${GITHUB}`, leak)
    expectClean()
  })

  it("createBranchWithFiles's commit message", async () => {
    await createBranchWithFiles('o/r', 'lore/x', 'base', [{ path: 'a.md', content: 'x' }], [], leak)
    expectClean()
  })

  it("commitOnBranch's commit message", async () => {
    await commitOnBranch('o/r', 'igor/7', ['p1'], [{ path: 'a.md', content: 'x' }], [], leak)
    expectClean()
  })

  it("mergeIntoBranch's commit message, which names both branches", async () => {
    await mergeIntoBranch('o/r', `igor/${GITHUB}`, 'main')
    const sent = JSON.parse(posted[0] ?? '{}') as { base: string; commit_message: string }
    expect(sent.commit_message).not.toContain(GITHUB)
    expect(sent.base).toBe(`igor/${GITHUB}`)
  })
})
