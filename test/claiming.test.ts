import { describe, expect, it } from 'vitest'
import type { Candidate, ClaimVerdict, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { checkpoint, claimMessage, eligibleAfterStop, stopReceipt, takeClaim } from '../src/claiming.js'
import { isGoAhead, isStop } from '../src/signals.js'

const NOW = Date.parse('2026-09-13T12:00:00Z')

const candidate = (over: Partial<Candidate> = {}): Candidate =>
  ({
    id: 'github:o/r#7',
    repo: 'o/r',
    native: '7',
    title: 'A bug',
    assignees: [],
    labels: [],
    paths: [],
    state: 'open',
    ...over,
  }) as Candidate

const role = (over: Partial<Role> = {}): Role =>
  ({
    name: 'triage',
    settleSeconds: 10,
    cooldownMinutes: 60,
    allow: ['comment', 'unassign'],
    ...over,
  }) as Role

interface Log {
  claimed: string[]
  reported: string[]
  released: string[]
  verifiedSince: string[]
}

function tracker(verdict: ClaimVerdict, opts: { claimSticks?: boolean; native?: boolean } = {}) {
  const log: Log = { claimed: [], reported: [], released: [], verifiedSince: [] }
  const t: Tracker = {
    name: 'fake',
    nativeHolderField: opts.native ?? true,
    identity: async () => 'igor-bot',
    search: async () => [],
    claim: async (_c, as) => {
      log.claimed.push(as)
      return opts.claimSticks ?? true
    },
    commentsSince: async () => [],
    verifyClaim: async (_c, _as, since) => {
      log.verifiedSince.push(since)
      return verdict
    },
    report: async (_c, m) => {
      log.reported.push(m)
    },
    release: async (_c, as) => {
      log.released.push(as)
    },
    linkage: () => 'Closes #7',
  }
  return { t, log }
}

const opts = { wait: async () => {}, now: () => NOW }

describe('taking a claim', () => {
  it('sets the holder field and announces, then confirms', async () => {
    const { t, log } = tracker({ status: 'held' })
    const r = await takeClaim(t, candidate(), role(), 'igor-bot', opts)
    expect(r.outcome).toBe('held')
    expect(log.claimed).toEqual(['igor-bot'])
    expect(log.reported).toHaveLength(1)
    expect(log.released).toEqual([])
  })

  it('refuses the work when the tracker did not record the claim', async () => {
    // GitHub accepts an assignment naming a non-collaborator and silently drops it. Proceeding
    // would mean working an item nobody can see is held.
    const { t, log } = tracker({ status: 'held' }, { claimSticks: false })
    const r = await takeClaim(t, candidate(), role(), 'igor-bot', opts)
    expect(r.outcome).toBe('refused')
    expect(r.reason).toMatch(/write access/)
    expect(log.reported).toEqual([])
  })

  it('stands down and releases when someone claimed first', async () => {
    const { t, log } = tracker({ status: 'lost', by: 'alice' })
    const r = await takeClaim(t, candidate(), role(), 'igor-bot', opts)
    expect(r.outcome).toBe('lost')
    expect(r.reason).toContain('alice')
    expect(log.released).toEqual(['igor-bot'])
  })

  it('releases on a stop too, so nothing is left behind', async () => {
    const { t, log } = tracker({ status: 'stopped', by: 'bob' })
    const r = await takeClaim(t, candidate(), role(), 'igor-bot', opts)
    expect(r.outcome).toBe('stopped')
    expect(log.released).toEqual(['igor-bot'])
  })

  it('scans for a stop from before the claim, not from the claim instant', async () => {
    // A stop posted in the same second as the claim is the likeliest one of all — someone
    // reacting to the announcement they just saw — and second-granularity filters would drop it.
    const { t, log } = tracker({ status: 'held' })
    await takeClaim(t, candidate(), role({ settleSeconds: 10 }), 'igor-bot', opts)
    expect(Date.parse(log.verifiedSince[0]!)).toBe(NOW - 10_000)
  })

  it('posts no claim message on a surface where the caller announces itself', async () => {
    const { t, log } = tracker({ status: 'held' })
    await takeClaim(t, candidate(), role(), 'igor-bot', { ...opts, announce: false })
    expect(log.reported).toEqual([])
  })

  it('claims by message alone where there is no holder field', async () => {
    const { t, log } = tracker({ status: 'held' }, { native: false })
    const r = await takeClaim(t, candidate(), role(), 'igor-bot', opts)
    expect(log.claimed).toEqual([])
    expect(log.reported).toHaveLength(1)
    expect(r.outcome).toBe('held')
  })
})

describe('the claim message', () => {
  it('names the Igor and tells anyone how to stop it', () => {
    const m = claimMessage(role(), 'igor-bot')
    expect(m).toContain('triage')
    expect(m).toMatch(/stop/i)
    expect(m).toMatch(/anyone/i)
  })

  it('names the account too when it differs, since one account may serve several Igors', () => {
    expect(claimMessage(role(), 'acme-igor')).toContain('acme-igor')
  })
})

describe('checkpoints during long execution', () => {
  it('always re-scans from the original claim, never from the last check', async () => {
    // Scanning forward from the previous checkpoint leaves a gap a stop can fall into.
    const { t, log } = tracker({ status: 'held' })
    const claim = await takeClaim(t, candidate(), role(), 'igor-bot', opts)
    await checkpoint(t, claim, 'igor-bot')
    await checkpoint(t, claim, 'igor-bot')
    const [, first, second] = log.verifiedSince
    expect(first).toBe(second)
    expect(Date.parse(first!)).toBeLessThan(Date.parse(claim.claimedAt))
  })

  it('surfaces a stop found mid-execution', async () => {
    const { t } = tracker({ status: 'stopped', by: 'carol', reason: 'stop — wrong issue' })
    const claim = { candidate: candidate(), claimedAt: new Date(NOW).toISOString() } as never
    expect((await checkpoint(t, claim, 'igor-bot')).status).toBe('stopped')
  })
})

describe('stop is unconditional', () => {
  it('is honoured from someone who has never touched the repository', () => {
    // No permission check exists to fail: recognition is textual and takes no identity of the
    // speaker into account beyond who is being addressed.
    expect(isStop('stop', 'igor-bot')).toBe(true)
    expect(isStop('@igor-bot stop', 'igor-bot')).toBe(true)
  })

  it('takes no configuration, so nothing can disable it', () => {
    // The signature is the guarantee: there is no options parameter to pass a policy through.
    expect(isStop.length).toBe(2)
  })

  it('still does not fire on two people talking to each other', () => {
    expect(isStop('@alice stop doing that', 'igor-bot')).toBe(false)
    expect(isStop('this will stop working soon', 'igor-bot')).toBe(false)
  })
})

describe('the stop receipt', () => {
  it('names who stopped it and what exists', () => {
    const r = stopReceipt(role(), { status: 'stopped', by: 'dana' }, 'draft PR #12')
    expect(r).toContain('dana')
    expect(r).toContain('#12')
  })

  it('says plainly when nothing was produced', () => {
    expect(stopReceipt(role(), { status: 'stopped' })).toMatch(/nothing to clean up/i)
  })
})

describe('what may follow a stop', () => {
  const base = {
    candidate: candidate(),
    stoppedAt: new Date(NOW - 30 * 60000).toISOString(),
    cooldownMinutes: 60,
    since: [],
    identity: 'igor-bot',
    now: NOW,
  }

  it('waits out the cooldown and says how long is left', () => {
    const e = eligibleAfterStop(base)
    expect(e.eligible).toBe(false)
    expect(e.reason).toContain('30 minutes left')
  })

  it('becomes eligible once the cooldown elapses and nobody took it', () => {
    expect(eligibleAfterStop({ ...base, cooldownMinutes: 20 }).eligible).toBe(true)
  })

  it('stays out when a human assigned themselves', () => {
    const e = eligibleAfterStop({ ...base, candidate: candidate({ assignees: ['alice'] }), cooldownMinutes: 0 })
    expect(e.eligible).toBe(false)
    expect(e.reason).toContain('alice')
  })

  it('ignores its own name among the assignees', () => {
    const e = eligibleAfterStop({
      ...base,
      candidate: candidate({ assignees: ['igor-bot'] }),
      cooldownMinutes: 0,
    })
    expect(e.eligible).toBe(true)
  })

  it('short-circuits the cooldown on an explicit go-ahead', () => {
    const e = eligibleAfterStop({ ...base, since: [{ body: 'go ahead', at: '' }] })
    expect(e.eligible).toBe(true)
    expect(e.reason).toMatch(/carry on/)
  })

  it('does not let a go-ahead override a human who took the item', () => {
    // The person holding it outranks a passing remark; otherwise an Igor could talk its way
    // back onto work somebody else is now doing.
    const e = eligibleAfterStop({
      ...base,
      candidate: candidate({ assignees: ['alice'] }),
      since: [{ body: 'go ahead', at: '' }],
    })
    expect(e.eligible).toBe(false)
  })
})

describe('go-ahead recognition', () => {
  it('accepts the ordinary ways of saying it', () => {
    for (const s of ['go ahead', 'resume', 'carry on', 'continue', 'all yours', '@igor-bot go ahead']) {
      expect(isGoAhead(s, 'igor-bot')).toBe(true)
    }
  })

  it('does not fire on a remark about the work itself', () => {
    expect(isGoAhead('we should go ahead with the redesign', 'igor-bot')).toBe(false)
    expect(isGoAhead('I will continue this tomorrow', 'igor-bot')).toBe(false)
  })
})
