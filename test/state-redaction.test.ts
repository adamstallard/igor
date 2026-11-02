import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Candidate } from '../src/adapter.js'
import type { ExecutionResult } from '../src/execute.js'
import type { CycleReport } from '../src/loop.js'
import type { Role } from '../src/role.js'
import { rememberSecret } from '../src/redact.js'
import { githubToken } from './tokens.js'

/**
 * The state branch's Contents API, in memory, keeping every byte each write sent: file
 * contents and commit messages alike, since both are readable by anyone who can read the
 * repository.
 */
const files = new Map<string, string>()
const sent: string[] = []

class FakeGhError extends Error {}

vi.mock('../src/gh.js', () => ({
  GhError: FakeGhError,
  gh: async (args: readonly string[], input?: string) => {
    const endpoint = args[1] ?? ''
    if (endpoint.includes('/git/ref/heads/')) return { ref: 'refs/heads/igor-state' }
    const contents = /^repos\/[^/]+\/[^/]+\/contents\/(.+?)(?:\?ref=.+)?$/.exec(endpoint)
    if (contents === null) throw new FakeGhError(`unexpected endpoint: ${endpoint}`)
    const path = decodeURIComponent(contents[1] as string)
    if (args.includes('PUT')) {
      const body = JSON.parse(input ?? '{}') as { content: string; message: string }
      const content = Buffer.from(body.content, 'base64').toString('utf8')
      sent.push(body.message, content)
      files.set(path, content)
      return { content: { path } }
    }
    const content = files.get(path)
    if (content === undefined) throw new FakeGhError('404')
    return { content: Buffer.from(content, 'utf8').toString('base64'), sha: `sha-${path}` }
  },
}))

const { appendRecord, writeState } = await import('../src/state.js')
const { recordExecution } = await import('../src/execute.js')
const { defer, loadDeferrals, NO_DEFERRALS, saveDeferrals, stillDeferred } = await import('../src/deferred.js')
const { recordDecisions } = await import('../src/loop.js')
const { recordObservation } = await import('../src/capacity.js')

// Assembled at run time, so no token-shaped literal sits in the source for a scanner to flag.
const GITHUB = githubToken('ghp_')
const ANTHROPIC = `sk-ant-oat01-${'Zq9_x-Y8'.repeat(6)}`
// A secret the Igor registered, such as an installation token it minted. The text below puts it
// in a remote's URL.
const MINTED = 'hunter2secret-minted'
rememberSecret(MINTED)
const URL = `https://x-access-token:${MINTED}@github.com/o/r.git`
const failure = `git push failed: remote ${URL} rejected ${GITHUB}; provider said ${ANTHROPIC}`

/** Everything written to the state branch, as one string, so no file or message escapes. */
function written(): string {
  return sent.join('\n')
}

function expectClean(): void {
  const all = written()
  expect(all).not.toContain(GITHUB)
  expect(all).not.toContain(ANTHROPIC)
  expect(all).not.toContain(MINTED)
  expect(all).toContain('[redacted]')
}

const candidate = {
  id: 'github:o/r#7',
  tracker: 'github',
  repo: 'o/r',
  native: '7',
  url: 'https://github.com/o/r/issues/7',
  title: 'A bug',
  body: '',
  labels: [],
  assignees: [],
  holders: [],
  paths: [],
  state: 'open',
} as unknown as Candidate

const role = { name: 'triage', allow: ['comment'], commands: [], instructions: [], reviewers: [] } as unknown as Role

const result = (over: Partial<ExecutionResult> = {}): ExecutionResult => ({
  outcome: 'failed',
  changed: [],
  refusals: [],
  transcript: '',
  costUsd: undefined,
  reason: 'worker exited 1',
  ...over,
})

beforeEach(() => {
  files.clear()
  sent.length = 0
})

describe('no state-branch write carries a credential from an error message', () => {
  it("a run row's reason", async () => {
    await recordExecution('acme/lore', candidate, role, result({ reason: failure }))
    expectClean()
  })

  it('the transcript', async () => {
    await recordExecution('acme/lore', candidate, role, result({ transcript: `The push failed: ${failure}` }))
    expectClean()
  })

  it('the refusal envelope', async () => {
    await recordExecution(
      'acme/lore',
      candidate,
      role,
      result({
        outcome: 'budget',
        limitEnvelope: { is_error: true, result: `You've hit your limit · resets 3pm. ${failure}` },
      }),
    )
    expect([...files.keys()].some((p) => p.startsWith('refusals/'))).toBe(true)
    expectClean()
  })

  it("deferred.json's reason", async () => {
    await saveDeferrals('acme/lore', defer(NO_DEFERRALS, candidate, failure))
    expectClean()
  })

  it("a triage decision's failures", async () => {
    const report = {
      role: 'triage', returned: 1, fresh: 1, coldStart: false,
      skippedUniversal: 0, skippedLane: 0, skippedDeferred: 0, skippedStopped: 0, skippedUnreadable: 0,
      triaged: 0, untriaged: [], skipped: [], verdicts: [], toClaim: [], waiting: [], stopped: [],
      readAt: '2026-10-20T00:00:00.000Z', toCatchUp: [], triageCostUsd: 0, triageCostUnreported: 0,
      failures: [failure],
    } as CycleReport
    await recordDecisions('acme/lore', role, report)
    expectClean()
  })

  it("a capacity observation's reset phrase", async () => {
    await recordObservation('acme/lore', {
      at: '2026-10-20T00:00:00.000Z',
      seat: 'a',
      window: 'session',
      percentUsed: 100,
      resetsPhrase: failure,
      source: 'limit',
    })
    expectClean()
  })

  it('a document written by any caller of writeState, and its commit message', async () => {
    await writeState('acme/lore', 'any.json', { nested: [{ text: failure }] }, `Update after ${GITHUB}`)
    expectClean()
  })

  it('a record appended by any caller of appendRecord, and its commit message', async () => {
    await appendRecord('acme/lore', 'any.ndjson', { deep: { list: [failure] } }, `Record ${ANTHROPIC}`)
    expectClean()
  })
})

describe('state the Igor reads back keeps its keys', () => {
  it('a deferral for an item whose repository name holds a GitHub prefix still holds', async () => {
    const item = { ...candidate, id: 'github:acme/highs_and_lows#7', repo: 'acme/highs_and_lows' } as Candidate
    await saveDeferrals('acme/lore', defer(NO_DEFERRALS, item, 'needs a reply'))
    const loaded = await loadDeferrals('acme/lore')
    expect(stillDeferred(loaded.items[item.id], item, [], 'igor')).toBe(true)
  })
})
