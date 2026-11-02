import { describe, expect, it, vi } from 'vitest'
import type { Candidate, Source, Tracker } from '../src/adapter.js'
import type { Gate } from '../src/budget.js'
import type { Condition } from '../src/conditions.js'
import type { Role } from '../src/role.js'

/** The state branch, in memory: the watermark and the deferrals read back, the decision record kept. */
const stored = new Map<string, unknown>()
const recorded: Record<string, unknown>[] = []
vi.mock('../src/state.js', () => ({
  readState: async (_repo: string, path: string) => stored.get(path),
  writeState: async (_repo: string, path: string, value: unknown) => {
    stored.set(path, value)
    return true
  },
  appendRecord: async (_repo: string, _path: string, record: Record<string, unknown>) => {
    recorded.push(record)
  },
}))

const { planCycle, UNTRIAGED_CONDITION } = await import('../src/loop.js')
const { triageBatch } = await import('../src/triage.js')

/** Passed to every cycle, so nothing here reads the real clock. */
const NOW = Date.UTC(2030, 0, 1, 12)
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString()

const candidate = (n: number): Candidate =>
  ({
    id: `github:o/r#${n}`, tracker: 'github', repo: 'o/r', native: String(n), url: '', title: 'A bug',
    body: '', author: 'reporter', state: 'open', labels: [], assignees: [], holders: [], paths: [],
    createdAt: ago(30), updatedAt: ago(30), ageDays: 0, idleDays: 0,
  }) as Candidate

const role = (name: string): Role =>
  ({
    name, sources: [{ tracker: 'github', repo: 'o/r', query: 'is:issue' } as Source], lane: {},
    instructions: [], reviewers: [], allow: ['comment'], settleSeconds: 0, cooldownMinutes: 60, pollMinutes: 10,
  }) as unknown as Role

function deps(items: Candidate[]) {
  const tracker = {
    name: 'github',
    holder: 'igor:x',
    holderField: { holds: 'list', distinctFromAssignee: true },
    directed: async () => [],
    search: async () => items,
    commentsSince: async () => [],
  } as unknown as Tracker
  return { tracker, codeHost: {}, trees: {}, destination: 'o/state' } as never
}

const asked: string[][] = []
const triage: typeof triageBatch = async (cs) => {
  asked.push(cs.map((c) => c.native))
  return {
    results: cs.map((c) => ({ candidate: c, verdict: { outcome: 'proceed' as const, reason: 'go', stage: 'model' as const } })),
    failures: [],
    costUsd: 0,
    costUnreported: 0,
  }
}

const commandsRefused: Condition = {
  key: 'role:web:commands',
  scope: { kind: 'role', name: 'web' },
  count: 3,
  first: ago(40),
  last: ago(10),
  state: 'open',
  probeAt: ago(-5),
}

/** A gate that hands over a seat, so the only thing that can stop a cycle is the one under test. */
const open: Gate = { exhausted: () => false, reason: 'test' }

function reset(): void {
  stored.clear()
  recorded.length = 0
  asked.length = 0
}

describe('a role stopped on a condition takes no work', () => {
  it('asks the model about nothing and claims nothing, and its items wait rather than being passed over', async () => {
    reset()
    const report = await planCycle(deps([candidate(1), candidate(2)]), role('web'), {
      now: NOW, identity: 'igor-web', triage, budget: open, stopped: async () => commandsRefused,
    })

    expect(asked).toEqual([])
    expect(report.toClaim).toEqual([])
    expect(report.condition?.key).toBe('role:web:commands')
    expect(report.untriaged.map((u) => u.reason)).toEqual([UNTRIAGED_CONDITION, UNTRIAGED_CONDITION])
    // The stopped cycle must save a watermark below its untriaged items, so they are read again
    // once the condition clears. The items are 30 minutes older than `NOW`. The second cycle runs
    // eight days later, past the seven days a source with no saved watermark looks back, so a
    // stopped cycle that saved none would lose the items and this test would fail.
    const after = await planCycle(deps([candidate(1), candidate(2)]), role('web'), {
      now: NOW + 8 * 24 * 60 * 60_000, identity: 'igor-web', triage, budget: open, stopped: async () => undefined,
    })
    expect(after.fresh).toBe(2)
    expect(asked).toEqual([['1', '2']])
  })

  it('leaves a role that shares nothing with it working', async () => {
    reset()
    const report = await planCycle(deps([candidate(1)]), role('docs'), {
      now: NOW, identity: 'igor-docs', triage, budget: open, stopped: async () => undefined,
    })

    expect(asked).toEqual([['1']])
    expect(report.toClaim).toHaveLength(1)
    expect(report.condition).toBeUndefined()
  })
})

describe('an operator tells the four idle reasons apart from the record alone', () => {
  const record = async (items: Candidate[], options: Parameters<typeof planCycle>[2]) => {
    reset()
    await planCycle(deps(items), role('web'), { now: NOW, identity: 'igor-web', triage, ...options })
    return recorded
  }

  it('a condition names its key, its cure and when the probe is due, even with nothing to do', async () => {
    const rows = await record([], { budget: open, stopped: async () => commandsRefused })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.['condition']).toMatchObject({
      key: 'role:web:commands', state: 'open', count: 3, since: ago(40), probeAt: ago(-5),
    })
    expect(String((rows[0]?.['condition'] as { cure: string }).cure)).toContain('`commands`')
    expect(rows[0]?.['heldPool']).toBeUndefined()
  })

  it('an exhausted budget is a held pool that ran out, with no condition', async () => {
    const spent: Gate = { exhausted: () => true, blocked: 'spent', reason: 'spent' }
    const rows = await record([candidate(1)], { budget: spent, stopped: async () => undefined })
    expect(rows[0]?.['heldPool']).toMatchObject({ blocked: 'spent' })
    expect(rows[0]?.['condition']).toBeUndefined()
  })

  it("pacing is a held pool at the role's own share, with no condition", async () => {
    const share: Gate = { exhausted: () => true, blocked: 'share', reason: 'share' }
    const rows = await record([candidate(1)], { budget: share, stopped: async () => undefined })
    expect(rows[0]?.['heldPool']).toMatchObject({ blocked: 'share' })
    expect(rows[0]?.['condition']).toBeUndefined()
  })

  it('an empty queue writes no record at all', async () => {
    const rows = await record([], { budget: open, stopped: async () => undefined })
    expect(rows).toEqual([])
  })
})
