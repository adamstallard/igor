import { describe, expect, it } from 'vitest'
import type { Candidate, Comment, HolderSetting, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { findDirected } from '../src/loop.js'
import { claimMessage, inFlightNotice, waitingNotice, takeClaim } from '../src/claiming.js'
import { labelVerdictFrom } from '../src/github-adapter.js'
import { IGORS } from './igors.js'

const role = { name: 'frontend', settleSeconds: 10, sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue' }] } as unknown as Role
const holding = { holder: 'igor:frontend', distinctFromAssignee: true }
const ME = 'igor-frontend[bot]'
const item = (n: number, over: Partial<Candidate> = {}): Candidate =>
  ({ id: `github:o/r#${n}`, tracker: 'github', repo: 'o/r', native: String(n), state: 'open',
    labels: [], assignees: [], holders: ['igor:frontend'], paths: [], title: 't', body: '', author: 'a', ...over }) as Candidate
function tracker(found: Candidate[], setting: () => HolderSetting | undefined, spoken: () => Comment[]) {
  return { name: 'github', holder: 'igor:frontend', holderField: { holds: 'list', distinctFromAssignee: true },
    directed: async () => found, holderSetBy: async () => setting(), commentsSince: async () => spoken() } as unknown as Tracker
}
const person = { self: false, by: 'adam', at: '2026-10-10T10:00:00Z' }
const pr = { kind: 'pull-request', ref: '#5', url: 'https://github.com/o/r/pull/5', draft: true, author: 'igor-backend[bot]', mergeable: 'clean', branch: 'b', base: 'main' }
const show = (r: any) => ({ stopped: r.stopped.length, waiting: r.waiting.length, directed: r.directed.length })

describe('a stop on a handed-over item that no receipt answered', () => {
  it('is still owed the label off where a notice of the Igor followed the stop', async () => {
    const said = [
      { author: 'bob', at: '2026-10-10T10:05:00Z', body: 'stop', accounts: {} },
      { author: ME, at: '2026-10-10T10:05:40Z', body: inFlightNotice(role, '#5', pr.url), accounts: {} },
    ]
    const report = { failures: [] as string[] }
    const r = await findDirected(tracker([item(1, { inFlight: pr } as any)], () => person, () => said), role, ME, holding, report)
    expect(report.failures).toEqual([])
    expect(show(r).stopped).toBe(1)
  })
  it('is still owed the label off where a notice shares the stop\'s second', async () => {
    const said = [
      { author: ME, at: '2026-10-10T10:05:00Z', body: waitingNotice(role, ['igor:backend']), accounts: {} },
      { author: 'bob', at: '2026-10-10T10:05:00Z', body: 'stop', accounts: {} },
    ]
    const report = { failures: [] as string[] }
    const r = await findDirected(tracker([item(1, { holders: ['igor:frontend', 'igor:backend'] })], () => person, () => said), role, ME, holding, report)
    expect(report.failures).toEqual([])
    expect(show(r).stopped).toBe(1)
  })
  it('is still owed the label off where a claim, not a receipt, followed the stop', async () => {
    const stop = { body: 'stop', user: { login: 'bob' }, created_at: '2026-10-10T10:05:00Z', updated_at: '2026-10-10T10:05:00Z' } as any
    const comments: any[] = [stop]
    const claimAt = Date.parse('2026-10-10T10:07:00Z')
    const t = {
      name: 'github', holder: 'igor:frontend', nativeHolderField: true, holderField: { holds: 'list', distinctFromAssignee: true },
      claim: async () => true,
      report: async (_c: Candidate, m: string) => { comments.push({ body: m, user: { login: ME }, created_at: '2026-10-10T10:07:00Z', updated_at: '2026-10-10T10:07:00Z' }); return 'u' },
      // GitHub ?since= on updated_at, then the adapter's own verdict
      verifyClaim: async (_c: Candidate, _as: string, since: string) =>
        labelVerdictFrom({ login: ME, accountId: 1, holder: 'igor:frontend' }, ['igor:frontend'], undefined,
          comments.filter((c) => Date.parse(c.updated_at) >= Date.parse(since)), since, IGORS),
      release: async () => true,
    } as unknown as Tracker
    const claim = await takeClaim(t, item(1), role, ME, { directed: true, now: () => claimAt, wait: async () => {} })
    void claim
    const said = comments.map((c) => ({ author: c.user.login, at: c.created_at, body: c.body, accounts: {} }))
    const report = { failures: [] as string[] }
    const r = await findDirected(tracker([item(1)], () => person, () => said), role, ME, holding, report)
    expect(report.failures).toEqual([])
    expect(show(r).stopped).toBe(1)
  })
  it('is not one addressed to another Igor, which neither stops this Igor nor takes its label off', async () => {
    const said = [
      { author: ME, at: '2026-10-10T10:01:00Z', body: waitingNotice(role, ['igor:backend']), accounts: {} },
      { author: 'adam', at: '2026-10-10T10:05:00Z', body: 'stop @igor-backend, frontend will take this', accounts: IGORS },
    ]
    const report = { failures: [] as string[] }
    const r = await findDirected(tracker([item(1, { holders: ['igor:frontend', 'igor:backend'] })], () => person, () => said), role, ME, holding, report)
    expect(report.failures).toEqual([])
    expect(show(r).stopped).toBe(0)
  })
  it('is one where the name after it could not be resolved, which counts as no name and stops this Igor', async () => {
    const said = [
      { author: ME, at: '2026-10-10T10:01:00Z', body: waitingNotice(role, ['igor:backend']), accounts: {} },
      { author: 'adam', at: '2026-10-10T10:05:00Z', body: 'stop @igor-backend, frontend will take this', accounts: {} },
    ]
    const report = { failures: [] as string[] }
    const r = await findDirected(tracker([item(1, { holders: ['igor:frontend', 'igor:backend'] })], () => person, () => said), role, ME, holding, report)
    expect(report.failures).toEqual([])
    expect(show(r).stopped).toBe(1)
  })
})
