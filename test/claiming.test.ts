import { describe, expect, it } from 'vitest'
import type { Candidate, ClaimVerdict, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import { checkpoint, claimMessage, claimWithdrawn, eligibleAfterStop, stopReceipt, takeClaim } from '../src/claiming.js'
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
  /** Every message `report` was called with, including those the call then refused. */
  reportAttempts: string[]
  released: string[]
  verifiedSince: string[]
}

function tracker(
  verdict: ClaimVerdict,
  opts: {
    claimSticks?: boolean
    /** The assignment the surface recorded before the call failed — the same shape as below. */
    claimThrows?: boolean
    native?: boolean
    /** A surface that is simply down: every call fails, the withdrawal included. */
    reportThrows?: boolean
    /** A write the surface accepted and a client that threw anyway — a timeout, a killed `gh`. */
    reportPostsThenThrows?: boolean
    /** A transient 503, up again by the next call. */
    reportFailsOnce?: boolean
    verifyThrows?: boolean
    releaseThrows?: boolean
  } = {},
) {
  const log: Log = { claimed: [], reported: [], reportAttempts: [], released: [], verifiedSince: [] }
  const t: Tracker = {
    name: 'fake',
    nativeHolderField: opts.native ?? true,
    identity: async () => 'igor-bot',
    search: async () => [],
    claim: async (_c, as) => {
      log.claimed.push(as)
      if (opts.claimThrows === true) throw new Error('503 from the tracker')
      return opts.claimSticks ?? true
    },
    commentsSince: async () => [],
    verifyClaim: async (_c, _as, since) => {
      log.verifiedSince.push(since)
      if (opts.verifyThrows === true) throw new Error('503 from the tracker')
      return verdict
    },
    report: async (_c, m) => {
      log.reportAttempts.push(m)
      if (opts.reportThrows === true) throw new Error('503 from the tracker')
      if (opts.reportFailsOnce === true && log.reportAttempts.length === 1) {
        throw new Error('503 from the tracker')
      }
      log.reported.push(m)
      if (opts.reportPostsThenThrows === true) throw new Error('503 from the tracker')
    },
    release: async (_c, as) => {
      if (opts.releaseThrows === true) throw new Error('503 from the tracker')
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

describe('a claim taken and not finished', () => {
  // The window from the assignment call to the claim being verified. A throw anywhere inside
  // it must not escape `takeClaim`: that leaves the item assigned with nothing said on it —
  // the one state a claim exists to prevent, and an ordinary tracker 503 reaches it. The
  // assignment call is inside, because a surface can apply it and fail on the way home.

  it('releases and refuses when the assignment call itself failed', async () => {
    // The surface can record the holder field and the call still fail on the way home, so a
    // throw from the assignment leaves the item held exactly as a throw after it does.
    const { t, log } = tracker({ status: 'held' }, { claimThrows: true })
    const r = await takeClaim(t, candidate(), role(), 'igor-bot', opts)

    expect(r.outcome).toBe('refused')
    expect(log.released).toEqual(['igor-bot'])
    // Nothing had been said at that point, so there is nothing on the item to withdraw.
    expect(log.reported).toEqual([])
  })

  it('releases and refuses when the claim cannot be announced', async () => {
    const { t, log } = tracker({ status: 'held' }, { reportThrows: true })
    const r = await takeClaim(t, candidate(), role(), 'igor-bot', opts)

    expect(r.outcome).toBe('refused')
    expect(log.claimed).toEqual(['igor-bot'])
    expect(log.released).toEqual(['igor-bot'])
    // The withdrawal is attempted and goes out over the same call that just failed, so a
    // surface that is down stays silent. Asserted over the attempts, because an empty
    // `reported` is what this fake produces whatever `takeClaim` does.
    expect(log.reportAttempts).toEqual([claimMessage(role(), 'igor-bot'), claimWithdrawn(role())])
    expect(log.reported).toEqual([])
    expect(r.reason).toContain('503')
  })

  it('withdraws where the claim message failed and the surface then recovered', async () => {
    // The withdrawal goes wherever the claim message *may* have landed, so a transient failure
    // leaves a withdrawal on an item nobody saw a claim on. That is the cheaper side of the
    // trade: the other side is a claim message nobody withdraws.
    const { t, log } = tracker({ status: 'held' }, { reportFailsOnce: true })
    const r = await takeClaim(t, candidate(), role(), 'igor-bot', opts)

    expect(r.outcome).toBe('refused')
    expect(log.released).toEqual(['igor-bot'])
    expect(log.reported).toEqual([claimWithdrawn(role())])
  })

  it('releases, withdraws and refuses when the claim cannot be verified', async () => {
    const { t, log } = tracker({ status: 'held' }, { verifyThrows: true })
    const r = await takeClaim(t, candidate(), role(), 'igor-bot', opts)

    expect(r.outcome).toBe('refused')
    expect(log.released).toEqual(['igor-bot'])
    // The claim comment did land, so the item carries "working on it" over an unassigned
    // issue unless the release says otherwise.
    expect(log.reported[0]).toContain('picked this up')
    expect(log.reported[1]).toBe(claimWithdrawn(role()))
  })

  it('still refuses where there is no holder field to release', async () => {
    const { t, log } = tracker({ status: 'held' }, { native: false, verifyThrows: true })
    const r = await takeClaim(t, candidate(), role(), 'igor-bot', opts)

    expect(r.outcome).toBe('refused')
    expect(log.claimed).toEqual([])
    // Released even though no holder field was ever set: the surface may express a release
    // some other way, and the adapter is the only thing that knows.
    expect(log.released).toEqual(['igor-bot'])
    expect(log.reported[1]).toBe(claimWithdrawn(role()))
  })

  it('withdraws a claim message the surface took before the call failed', async () => {
    // A write the tracker accepted and a client that threw on the way home. The comment is on
    // the item, so leaving it unwithdrawn tells everyone to stand off an item nobody holds.
    const { t, log } = tracker({ status: 'held' }, { reportPostsThenThrows: true })
    const r = await takeClaim(t, candidate(), role(), 'igor-bot', opts)

    expect(r.outcome).toBe('refused')
    expect(log.released).toEqual(['igor-bot'])
    expect(log.reported[0]).toContain('picked this up')
    expect(log.reported[1]).toBe(claimWithdrawn(role()))
  })

  it('says the claim is still held when the release itself failed', async () => {
    // The withdrawal reads "has released it". Where the release was refused too, the item is
    // still assigned, and a run record repeating the withdrawal's claim leaves nobody to
    // notice the name left on it.
    const { t, log } = tracker({ status: 'held' }, { verifyThrows: true, releaseThrows: true })
    const r = await takeClaim(t, candidate(), role(), 'igor-bot', opts)

    expect(r.outcome).toBe('refused')
    expect(log.released).toEqual([])
    expect(r.reason).toContain('still held')
    expect(r.reason).not.toMatch(/was released/)
  })

  it('releases before it withdraws, so nothing reads "released" while the item is still held', async () => {
    // Between the two calls the item is briefly assigned, and the withdrawal says it has been
    // released. Releasing first closes that window — and buys only that: where the release is
    // refused the withdrawal posts anyway and is wrong until someone reads the run's record.
    //
    // `handOffFrom` orders these the other way on purpose, because a handoff explains an item
    // that stays claimed. Aligning the two would break one of them.
    const order: string[] = []
    const { t } = tracker({ status: 'held' }, { verifyThrows: true })
    const spy: Tracker = {
      ...t,
      report: async (_c, m) => { order.push(m === claimWithdrawn(role()) ? 'withdraw' : 'announce') },
      release: async () => { order.push('release') },
    }
    await takeClaim(spy, candidate(), role(), 'igor-bot', opts)

    expect(order).toEqual(['announce', 'release', 'withdraw'])
  })

  it('leaves a claim that verified cleanly exactly as it was', async () => {
    // The negative pole: none of the above may fire on the ordinary path.
    const { t, log } = tracker({ status: 'held' })
    const r = await takeClaim(t, candidate(), role(), 'igor-bot', opts)

    expect(r.outcome).toBe('held')
    expect(log.released).toEqual([])
    expect(log.reported).toHaveLength(1)
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

describe('the withdrawal message', () => {
  it('is the approved wording, to the character', () => {
    // Pinned literally. Every other assertion on this message compares it against the
    // function that produced it, so both sides move together and a rewording is invisible.
    expect(claimWithdrawn(role())).toBe(
      '**triage** could not finish taking this and has released it. ' +
        'Nothing was done, so there is nothing to clean up.',
    )
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

  it('does not read a hyphenated word as the verb', () => {
    // A word boundary matches before a hyphen, so `stop-gap` read as a stop. Harmless while
    // this only fired inside a claim; it now gates items nobody has claimed.
    expect(isStop('Stop-gap until the real fix lands', 'igor-bot')).toBe(false)
    expect(isStop('@igor-bot stop-gap measures are fine', 'igor-bot')).toBe(false)
    expect(isStop('stop. I will take it from here', 'igor-bot')).toBe(true)
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
  const said = (...bodies: string[]) => async () => bodies.map((body) => ({ body, at: '' }))
  const base = {
    candidate: candidate(),
    stoppedAt: new Date(NOW - 30 * 60000).toISOString(),
    cooldownMinutes: 60,
    since: said(),
    identity: 'igor-bot',
    now: NOW,
  }

  it('waits out the cooldown and says how long is left', async () => {
    const e = await eligibleAfterStop(base)
    expect(e.eligible).toBe(false)
    expect(e.reason).toContain('30 minutes left')
  })

  it('becomes eligible once the cooldown elapses and nobody took it', async () => {
    expect((await eligibleAfterStop({ ...base, cooldownMinutes: 20 })).eligible).toBe(true)
  })

  it('stays out when a human assigned themselves', async () => {
    const e = await eligibleAfterStop({ ...base, candidate: candidate({ assignees: ['alice'] }), cooldownMinutes: 0 })
    expect(e.eligible).toBe(false)
    expect(e.reason).toContain('alice')
  })

  it('ignores its own name among the assignees', async () => {
    const e = await eligibleAfterStop({
      ...base,
      candidate: candidate({ assignees: ['igor-bot'] }),
      cooldownMinutes: 0,
    })
    expect(e.eligible).toBe(true)
  })

  it('short-circuits the cooldown on an explicit go-ahead', async () => {
    const e = await eligibleAfterStop({ ...base, since: said('go ahead') })
    expect(e.eligible).toBe(true)
    expect(e.reason).toMatch(/carry on/)
  })

  it('keeps waiting when people are talking but nobody said to carry on', async () => {
    // The difference from a handoff, which any reply lifts: a stop asked for silence, and a
    // conversation about the item is not permission to rejoin it.
    const e = await eligibleAfterStop({ ...base, since: said('why is this broken', 'no idea') })
    expect(e.eligible).toBe(false)
  })

  it('does not let a go-ahead override a human who took the item', async () => {
    // The person holding it outranks a passing remark; otherwise an Igor could talk its way
    // back onto work somebody else is now doing.
    const e = await eligibleAfterStop({
      ...base,
      candidate: candidate({ assignees: ['alice'] }),
      since: said('go ahead'),
    })
    expect(e.eligible).toBe(false)
  })

  it('reads the comments only inside the cooldown, which is the cost bound', async () => {
    // A go-ahead can only make an item eligible sooner, so a verdict the item's own fields
    // already settled needs no request — which is every cycle in the steady state.
    let asked = 0
    const counted = async () => {
      asked += 1
      return []
    }
    await eligibleAfterStop({ ...base, since: counted, cooldownMinutes: 20 })
    await eligibleAfterStop({ ...base, since: counted, candidate: candidate({ assignees: ['alice'] }) })
    expect(asked).toBe(0)

    await eligibleAfterStop({ ...base, since: counted })
    expect(asked).toBe(1)
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
