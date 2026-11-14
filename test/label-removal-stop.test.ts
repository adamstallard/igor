import { describe, expect, it } from 'vitest'
import type { Candidate, Comment } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { dropStopped } from '../src/loop.js'
import { stopReceipt } from '../src/claiming.js'
import { labelVerdictFrom } from '../src/github-adapter.js'
import { IGORS } from './igors.js'

const ME = 'igor-frontend[bot]'
const role = { name: 'frontend' } as Role
const NOW = Date.parse('2026-10-10T12:00:00Z')
const item = { id: 'github:o/r#1', native: '1', repo: 'o/r', state: 'open', labels: [], assignees: [], holders: [], updatedAt: '2026-10-10T11:59:00Z' } as unknown as Candidate

describe('a stop made by removing the label', () => {
  it('holds the item for the cooldown, as a stop comment does', async () => {
    // What the run saw: its label removed by alice.
    const verdict = labelVerdictFrom(
      { login: ME, accountId: 7, holder: 'igor:frontend' },
      [],
      [{ id: 1, event: 'labeled', actor: { login: ME, id: 7, type: 'Bot' }, label: { name: 'igor:frontend' }, created_at: '2026-10-10T11:50:00Z' },
       { id: 2, event: 'unlabeled', actor: { login: 'alice', id: 9, type: 'User' }, label: { name: 'igor:frontend' }, created_at: '2026-10-10T11:58:00Z' }],
      [],
      '1970-01-01T00:00:00Z',
      IGORS,
    )
    // What is then on the item: the claim message and the Igor's own stop receipt.
    const spoken: Comment[] = [
      { author: ME, at: '2026-10-10T11:50:00Z', body: '**frontend** picked this up and is working on it.\n\nReply **stop** to hand it back', accounts: {} },
      { author: ME, at: '2026-10-10T11:59:00Z', body: stopReceipt(role, verdict), accounts: {} },
    ]
    const report = { skipped: [] as unknown[], skippedStopped: 0, skippedUnreadable: 0 }
    const kept = await dropStopped({ commentsSince: async () => spoken } as never, [item], 60, ME, report as never, NOW, Infinity,
      { holder: 'igor:frontend', distinctFromAssignee: true })
    expect(kept).toEqual([])
  })

  it("is not read as a stop of the Igor's next claim", () => {
    const receipt = stopReceipt(role, { status: 'stopped', by: 'alice', fromHolder: true })
    const verdict = labelVerdictFrom(
      { login: ME, accountId: 7, holder: 'igor:frontend' },
      ['igor:frontend'],
      undefined,
      [{ body: receipt, user: { login: ME }, created_at: '2026-10-10T11:59:00Z' }],
      '1970-01-01T00:00:00Z',
      IGORS,
    )
    expect(verdict.status).toBe('held')
  })

  it('leaves another author copying the mark without effect', async () => {
    const spoken: Comment[] = [{ author: 'mallory', at: '2026-10-10T11:59:00Z', body: stopReceipt(role, { status: 'stopped', fromHolder: true }), accounts: {} }]
    const report = { skipped: [] as unknown[], skippedStopped: 0, skippedUnreadable: 0 }
    const kept = await dropStopped({ commentsSince: async () => spoken } as never, [item], 60, ME, report as never, NOW)
    expect(kept.map((c) => c.id)).toEqual(['github:o/r#1'])
  })
})
