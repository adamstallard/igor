import { describe, expect, it, vi } from 'vitest'

const posted = vi.hoisted(() => [] as string[])
const plan = vi.hoisted(() => ({ toClaim: [] as unknown[] }))

vi.mock('../src/config.js', async (a) => ({ ...(await a<object>()), loadConfig: () => ({ destination: '.' }) }))
vi.mock('../src/role.js', async (a) => ({
  ...(await a<object>()),
  loadRole: () => ({ role: { name: 'frontend', sources: [{ tracker: 'github', repo: 'o/r', query: '' }], lane: {} } }),
}))
vi.mock('../src/github.js', async (a) => ({ ...(await a<object>()), repoFromCheckout: async () => 'o/state' }))
vi.mock('../src/app.js', async (a) => ({
  ...(await a<object>()),
  startApp: async () => ({ warnings: [], account: { login: 'igor-frontend[bot]', id: 7 }, tokens: { token: async () => 't', permissions: {} } }),
  canWriteWorkflows: () => true,
}))
vi.mock('../src/wiring.js', async () => ({ wire: async () => ({ gate: async () => ({}), loreFor: () => [], record: async () => {}, store: {} }) }))
vi.mock('../src/loop.js', async (a) => ({
  ...(await a<object>()),
  planCycle: async () => {
    const candidate = { id: 'github:o/r#5', native: '5', repo: 'o/r', title: 't' }
    return {
      returned: 0, fresh: 0, skippedUniversal: 0, skippedLane: 0, skippedStopped: 0, skippedDeferred: 0,
      skippedUnreadable: 0, triaged: 0, failures: [], skipped: [], verdicts: [], toClaim: plan.toClaim,
      waiting: [{ candidate, reason: 'held by igor:backend', holders: ['igor:backend'] }], stopped: [],
      toCatchUp: [], triageCostUsd: 0, triageCostUnreported: 0, untriaged: [], coldStart: false,
    }
  },
}))
vi.mock('../src/github-adapter.js', async (a) => {
  const actual = await a<typeof import('../src/github-adapter.js')>()
  class T extends actual.GitHubTracker {
    override async report(_c: unknown, m: string) { posted.push(m); return 'u' }
  }
  return { ...actual, GitHubTracker: T }
})

describe('igor run, a cycle whose only finding is a waiting item', () => {
  it('posts the waiting notice', async () => {
    process.argv = ['node', 'igor', 'run', 'frontend']
    const out = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    await import('../src/cli.js')
    await new Promise((r) => setTimeout(r, 200))
    out.mockRestore()
    expect(posted.some((m) => m.includes('igor:waiting'))).toBe(true)
  })
})
