import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from '../src/adapter.js'

/** `gh`, answered from a table keyed by method and path, recording every call. */
const gh = vi.hoisted(() => ({ calls: [] as string[], answers: new Map<string, () => unknown>(), searched: [] as string[], found: [] as unknown[] }))
vi.mock('../src/gh.js', async (actual) => {
  const real = await actual<typeof import('../src/gh.js')>()
  const call = async (args: readonly string[]) => {
    const method = args.includes('--method') ? args[args.indexOf('--method') + 1] : 'GET'
    const key = `${method} ${args[1]}`
    gh.calls.push(key)
    const answer = gh.answers.get(key)
    if (answer === undefined) return []
    return answer()
  }
  return {
    ...real,
    gh: call,
    ghPaginated: call,
    ghGraphql: async (_q: string, vars: { q: string }) => {
      gh.searched.push(vars.q)
      return { search: { pageInfo: { hasNextPage: false, endCursor: '' }, nodes: gh.found } }
    },
  }
})

const { GitHubTracker } = await import('../src/github-adapter.js')
const { GhError } = await import('../src/gh.js')

const item = { id: 'github:o/r#7', repo: 'o/r', native: '7', holders: ['igor:reviewer'] } as unknown as Candidate
const tracker = () => new GitHubTracker({ role: 'reviewer', account: { login: 'acme-reviewer[bot]', id: 99 } })
const LABELS = 'repos/o/r/issues/7/labels?per_page=100'

describe('the GitHub label claim', () => {
  beforeEach(() => {
    gh.calls.length = 0
    gh.answers.clear()
    gh.searched.length = 0
    gh.found = []
  })

  it('adds its label, never an assignee, and reads the labels back', async () => {
    gh.answers.set(`GET ${LABELS}`, () => [{ name: 'igor:reviewer' }])
    expect(await tracker().claim(item, 'acme-reviewer[bot]')).toBe(true)
    expect(gh.calls).toEqual(['POST repos/o/r/issues/7/labels', `GET ${LABELS}`])
  })

  it('reports a label that did not stick', async () => {
    expect(await tracker().claim(item, 'acme-reviewer[bot]')).toBe(false)
  })

  it('removes only its own label, and reads a label already gone as released', async () => {
    gh.answers.set('DELETE repos/o/r/issues/7/labels/igor%3Areviewer', () => {
      throw new GhError('Label does not exist', 404)
    })
    gh.answers.set(`GET ${LABELS}`, () => [{ name: 'igor:backend' }])
    expect(await tracker().release(item, 'acme-reviewer[bot]')).toBe(true)
    expect(gh.calls).toEqual(['DELETE repos/o/r/issues/7/labels/igor%3Areviewer', `GET ${LABELS}`])
  })

  it('answers not released where the label is still there', async () => {
    gh.answers.set(`GET ${LABELS}`, () => [{ name: 'igor:reviewer' }])
    expect(await tracker().release(item, 'acme-reviewer[bot]')).toBe(false)
  })

  it('reads no events while its label is the only one', async () => {
    gh.answers.set(`GET ${LABELS}`, () => [{ name: 'igor:reviewer' }, { name: 'bug' }])
    expect(await tracker().verifyClaim(item, 'acme-reviewer[bot]', '2026-10-10T00:00:00Z')).toEqual({ status: 'held' })
    expect(gh.calls.some((c) => c.includes('/events'))).toBe(false)
  })

  it('reads the events to name who removed its label', async () => {
    gh.answers.set('GET repos/o/r/issues/7/events?per_page=100', () => [
      { id: 1, event: 'unlabeled', actor: { login: 'adam', id: 5, type: 'User' }, label: { name: 'igor:reviewer' }, created_at: 't' },
    ])
    const v = await tracker().verifyClaim(item, 'acme-reviewer[bot]', '2026-10-10T00:00:00Z')
    expect(v).toMatchObject({ status: 'stopped', by: 'adam' })
  })

  it('says who last added its label, and whether that was itself', async () => {
    gh.answers.set('GET repos/o/r/issues/7/events?per_page=100', () => [
      { id: 1, event: 'labeled', actor: { login: 'acme-reviewer[bot]', id: 99, type: 'Bot' }, label: { name: 'igor:reviewer' }, created_at: 'a' },
      { id: 2, event: 'labeled', actor: { login: 'adam', id: 5, type: 'User' }, label: { name: 'igor:reviewer' }, created_at: 'b' },
    ])
    expect(await tracker().holderSetBy(item)).toEqual({ self: false, by: 'adam', at: 'b' })
  })

  it('says nobody set its label once a removal follows the latest addition, whatever the candidate read', async () => {
    gh.answers.set('GET repos/o/r/issues/7/events?per_page=100', () => [
      { id: 2, event: 'labeled', actor: { login: 'adam', id: 5, type: 'User' }, label: { name: 'igor:reviewer' }, created_at: 'b' },
      { id: 3, event: 'unlabeled', actor: { login: 'adam', id: 5, type: 'User' }, label: { name: 'igor:reviewer' }, created_at: 'c' },
    ])
    expect(await tracker().holderSetBy(item)).toBeUndefined()
  })

  it('reads its label from the events, not from a candidate read before a person added it', async () => {
    gh.answers.set('GET repos/o/r/issues/7/events?per_page=100', () => [
      { id: 2, event: 'labeled', actor: { login: 'adam', id: 5, type: 'User' }, label: { name: 'igor:reviewer' }, created_at: 'b' },
    ])
    expect(await tracker().holderSetBy({ ...item, holders: [] })).toEqual({ self: false, by: 'adam', at: 'b' })
  })

  it('refuses to claim without the role and account it claims as', async () => {
    await expect(new GitHubTracker().claim(item, 'x')).rejects.toThrow(/without the role and App bot account/)
  })
})

const node = (number: number, body: string) => ({
  number, url: `https://github.com/o/r/issues/${number}`, title: 't', body, state: 'OPEN',
  createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', author: { login: 'a' },
  labels: { nodes: [] }, assignees: { nodes: [] }, timelineItems: { nodes: [] },
})

describe('looking up and opening issues on GitHub', () => {
  beforeEach(() => {
    gh.found = []
    gh.searched.length = 0
  })

  it('finds an issue only where its description carries the whole link', async () => {
    gh.found = [node(3, 'see https://discord.com/channels/1/2/30'), node(4, 'from https://discord.com/channels/1/2/3 here')]
    expect(await tracker().findLinking('o/r', 'https://discord.com/channels/1/2/3')).toBe('https://github.com/o/r/issues/4')
    expect(await tracker().findLinking('o/r', 'https://discord.com/channels/1/2/30')).toBe('https://github.com/o/r/issues/3')
    gh.found = [node(5, 'see https://discord.com/channels/1/2/30')]
    expect(await tracker().findLinking('o/r', 'https://discord.com/channels/1/2/3')).toBeUndefined()
  })

  it("searches for items carrying this Igor's label", async () => {
    await tracker().directed('o/r')
    expect(gh.searched).toEqual(['repo:o/r is:issue is:open label:"igor:reviewer"'])
  })

  it('answers the link of an issue it opens', async () => {
    gh.answers.set('POST repos/o/r/issues', () => ({ html_url: 'https://github.com/o/r/issues/12' }))
    expect(await tracker().createIssue('o/r', 'title', 'body')).toBe('https://github.com/o/r/issues/12')
  })
})
