import { describe, expect, it } from 'vitest'
import type { Candidate, Comment, HolderSetting, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { findDirected, honourIdleStop } from '../src/loop.js'
import { claimMessage, inFlightNotice, stopReceipt, waitingNotice } from '../src/claiming.js'

const role = { name: 'frontend', sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue' }] } as unknown as Role
const holding = { holder: 'igor:frontend', distinctFromAssignee: true }
const ME = 'igor-frontend[bot]'

const item = (n: number, over: Partial<Candidate> = {}): Candidate =>
  ({
    id: `github:o/r#${n}`, tracker: 'github', repo: 'o/r', native: String(n), state: 'open',
    labels: [], assignees: [], holders: ['igor:frontend'], paths: [], title: 't', body: '', author: 'a',
    ...over,
  }) as Candidate

function tracker(found: Candidate[], setting: (c: Candidate) => HolderSetting | undefined, spoken: (c: Candidate) => Comment[] = () => []) {
  return {
    name: 'github',
    holder: 'igor:frontend',
    holderField: { holds: 'list', distinctFromAssignee: true },
    directed: async () => found,
    holderSetBy: async (c: Candidate) => setting(c),
    commentsSince: async (c: Candidate) => spoken(c),
  } as unknown as Tracker
}

const person = { self: false, by: 'adam', at: '2026-10-10T10:00:00Z' }

describe('items a person handed to this Igor', () => {
  it('claims one a person labelled, saying who', async () => {
    const r = await findDirected(tracker([item(1, { assignees: ['adam'] })], () => person), role, ME, holding, { failures: [] })
    expect(r.directed.map((d) => [d.candidate.native, d.directed, d.reason])).toEqual([['1', true, 'adam handed it to igor:frontend']])
  })

  it('takes no label of its own for a hand-over', async () => {
    const r = await findDirected(tracker([item(1)], () => ({ ...person, self: true, by: ME })), role, ME, holding, { failures: [] })
    expect(r.directed).toEqual([])
  })

  it('answers a hand-over once: its claim since is the answer', async () => {
    const said = [{ author: ME, at: '2026-10-10T10:01:00Z', body: claimMessage(role, ME) }]
    const r = await findDirected(tracker([item(1)], () => person, () => said), role, ME, holding, { failures: [] })
    expect(r.directed).toEqual([])
  })

  it('is not answered by its own waiting notice, so removing the other label hands it over', async () => {
    const said = [{ author: ME, at: '2026-10-10T10:01:00Z', body: waitingNotice(role, ['igor:backend']) }]
    const r = await findDirected(tracker([item(1)], () => person, () => said), role, ME, holding, { failures: [] })
    expect(r.directed).toHaveLength(1)
  })

  it('holds a hand-over somebody stopped after it', async () => {
    const said = [{ author: 'adam', at: '2026-10-10T10:01:00Z', body: 'stop' }]
    const r = await findDirected(tracker([item(1)], () => person, () => said), role, ME, holding, { failures: [] })
    expect(r.directed).toEqual([])
  })

  it("owes one notice where another Igor's label is there too, and claims nothing", async () => {
    const both = item(1, { holders: ['igor:frontend', 'igor:backend'] })
    const first = await findDirected(tracker([both], () => person), role, ME, holding, { failures: [] })
    expect(first.directed).toEqual([])
    expect(first.waiting.map((w) => w.holders)).toEqual([['igor:backend']])
    const said = [{ author: ME, at: '2026-10-10T10:01:00Z', body: waitingNotice(role, ['igor:backend']) }]
    const again = await findDirected(tracker([both], () => person, () => said), role, ME, holding, { failures: [] })
    expect(again.waiting).toEqual([])
  })

  it('reports a source it could not search and carries on', async () => {
    const t = { ...tracker([], () => person), directed: async () => { throw new Error('502') } } as unknown as Tracker
    const report = { failures: [] as string[] }
    const r = await findDirected(t, role, ME, holding, report)
    expect(r.directed).toEqual([])
    expect(report.failures[0]).toMatch(/could not look for items handed to igor:frontend: 502/)
  })
})

describe('an item handed over while work is in flight', () => {
  const pr = { kind: 'pull-request', ref: '#5', url: 'https://github.com/o/r/pull/5', draft: true, author: 'igor-backend[bot]', mergeable: 'clean', branch: 'b', base: 'main' }
  const inFlight = item(1, { inFlight: pr } as Partial<Candidate>)

  it('is not claimed, and is owed one notice naming the pull request', async () => {
    const r = await findDirected(tracker([inFlight], () => person), role, ME, holding, { failures: [] })
    expect(r.directed).toEqual([])
    expect(r.waiting.map((w) => [w.candidate.native, w.reason, w.notice])).toEqual([
      ['1', 'work already in flight: #5', inFlightNotice(role, '#5', 'https://github.com/o/r/pull/5')],
    ])
    expect(r.waiting[0]?.notice).toContain('It takes this up once #5 closes.')
  })

  it('is told once while that pull request stays open', async () => {
    const said = [{ author: ME, at: '2026-10-10T10:01:00Z', body: inFlightNotice(role, '#5', 'https://github.com/o/r/pull/5') }]
    const r = await findDirected(tracker([inFlight], () => person, () => said), role, ME, holding, { failures: [] })
    expect(r.waiting).toEqual([])
    expect(r.directed).toEqual([])
  })

  it('is claimed once the pull request closes, the notice not counting as an answer', async () => {
    const said = [{ author: ME, at: '2026-10-10T10:01:00Z', body: inFlightNotice(role, '#5', 'https://github.com/o/r/pull/5') }]
    const r = await findDirected(tracker([item(1)], () => person, () => said), role, ME, holding, { failures: [] })
    expect(r.directed.map((d) => d.candidate.native)).toEqual(['1'])
  })

  it("waits for this Igor's own pull request too", async () => {
    const own = item(2, { inFlight: { ...pr, ref: '#6', author: ME, mergeable: 'conflicting' } } as Partial<Candidate>)
    const r = await findDirected(tracker([own], () => person), role, ME, holding, { failures: [] })
    expect(r.directed).toEqual([])
    expect(r.waiting.map((w) => w.reason)).toEqual(['work already in flight: #6'])
  })
})

describe('the claim a catch-up makes', () => {
  it('does not answer a hand-over, which still directs the Igor once its pull request closes', async () => {
    const said = [{ author: ME, at: '2026-10-10T10:01:00Z', body: claimMessage(role, ME, true) }]
    const r = await findDirected(tracker([item(1)], () => person, () => said), role, ME, holding, { failures: [] })
    expect(r.directed.map((d) => d.candidate.native)).toEqual(['1'])
  })
})

describe('a stop on a handed-over item while nothing runs', () => {
  const stopBy = (at: string) => ({ author: 'bob', at, body: 'stop' })

  it('is owed the label off and a receipt', async () => {
    const r = await findDirected(tracker([item(1)], () => person, () => [stopBy('2026-10-10T10:05:00Z')]), role, ME, holding, { failures: [] })
    expect(r.directed).toEqual([])
    expect(r.stopped.map((s) => [s.candidate.native, s.stop?.by])).toEqual([['1', 'bob']])
  })

  it('is not answered twice: a receipt after the stop means a run met it', async () => {
    const said = [stopBy('2026-10-10T10:05:00Z'), { author: ME, at: '2026-10-10T10:06:00Z', body: stopReceipt(role, { status: 'stopped', by: 'bob' }) }]
    const r = await findDirected(tracker([item(1)], () => person, () => said), role, ME, holding, { failures: [] })
    expect(r.stopped).toEqual([])
    expect(r.directed).toEqual([])
  })

  it('keeps the hand-over cancelled after the stop is lifted', async () => {
    const said = [
      stopBy('2026-10-10T10:05:00Z'),
      { author: ME, at: '2026-10-10T10:06:00Z', body: stopReceipt(role, { status: 'stopped', by: 'bob' }) },
      { author: 'bob', at: '2026-10-10T10:30:00Z', body: 'go ahead' },
    ]
    const r = await findDirected(tracker([item(1)], () => person, () => said), role, ME, holding, { failures: [] })
    expect(r.directed).toEqual([])
    expect(r.stopped).toEqual([])
  })
})

describe('answering a stop said while nothing ran', () => {
  it('takes the label off as a stop, then posts the receipt', async () => {
    const calls: string[] = []
    const t = {
      holderField: { holds: 'list', distinctFromAssignee: true },
      release: async (_c: Candidate, _as: string, how?: { stop?: boolean }) => { calls.push(`release stop=${how?.stop === true}`); return true },
      report: async (_c: Candidate, m: string) => { calls.push(m); return 'u' },
    } as unknown as Tracker
    await honourIdleStop(t, item(1), role, ME, { status: 'stopped', by: 'bob', at: '2026-10-10T10:05:00Z' })
    expect(calls[0]).toBe('release stop=true')
    expect(calls[1]).toContain("stopped at bob's request and released this")
    expect(calls).toHaveLength(2)
  })

  it('says the label is still there where the release did not take', async () => {
    const said: string[] = []
    const t = {
      holderField: { holds: 'list', distinctFromAssignee: true },
      release: async () => false,
      report: async (_c: Candidate, m: string) => { said.push(m); return 'u' },
    } as unknown as Tracker
    await honourIdleStop(t, item(1), role, ME, { status: 'stopped', by: 'bob' })
    expect(said.at(-1)).toContain('This still carries the `igor:frontend` label')
  })
})
