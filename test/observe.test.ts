import { afterEach, describe, expect, it, vi } from 'vitest'
import { CAPACITY_PATH, observeSeat, seatToObserve } from '../src/capacity.js'
import { BudgetError, type AuthContext, type Seat } from '../src/budget.js'
import type { appendRecord } from '../src/state.js'

/** Exactly what `claude -p '/usage'` returns, as `test/budget.test.ts` has it. */
const REAL = `You are currently using your subscription to power your Claude Code usage

Current session: 17% used · resets Sep 13 at 8pm (America/Los_Angeles)
Current week (all models): 12% used · resets Sep 18 at 4pm (America/Los_Angeles)
Current week (Fable): 0% used · resets Sep 18 at 4pm (America/Los_Angeles)

What's contributing to your limits usage?`

/** What the same command prints to a credential that resolves no subscription. */
const COST_SUMMARY = `Total cost: $0.00\nTotal duration (API): 0ms\nTotal code changes: 0 lines`

const seat = (over: Partial<Seat> = {}): Seat => ({ id: 'adam', owner: 'adam@x.com', reserve: 0.5, ...over })

/**
 * A stand-in for `appendRecord` that keeps a log the way the real one does — the existing bytes
 * plus one line — so a write that replaced rather than appended would be visible here. A double
 * that only collected its arguments could not show that, which is the property the whole
 * capacity design rests on.
 */
function fakeWrite(): {
  write: typeof appendRecord
  rows: Record<string, unknown>[]
  paths: string[]
  log: () => string
} {
  const rows: Record<string, unknown>[] = []
  const paths: string[] = []
  let text = ''
  const write: typeof appendRecord = async (_destination, path, record) => {
    paths.push(path)
    rows.push(record)
    text = `${text}${JSON.stringify(record)}\n`
  }
  return { write, rows, paths, log: () => text }
}

/** Never consulted in a passing reading; injected so no test can reach `claude auth status`. */
const noAuth = async (): Promise<AuthContext | undefined> => undefined

const reading = (text: string) => async () => text

describe('taking one reading', () => {
  it('appends one row per window the reading reports, naming the model on a per-model one', async () => {
    const { write, rows, paths } = fakeWrite()
    const appended = await observeSeat(seat(), 'o/r', {}, reading(REAL), write, noAuth)

    expect(paths).toEqual([CAPACITY_PATH, CAPACITY_PATH, CAPACITY_PATH])
    expect(rows).toEqual(appended)
    expect(appended.map((o) => [o.window, o.model, o.percentUsed])).toEqual([
      ['session', undefined, 17],
      ['week', undefined, 12],
      ['week', 'Fable', 0],
    ])
    for (const o of appended) {
      expect(o.seat).toBe('adam')
      expect(o.source).toBe('usage')
    }
  })

  it('keeps the printed phrase and resolves it to an instant', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-13T12:00:00.000Z'))
    try {
      const { write } = fakeWrite()
      const [session] = await observeSeat(seat(), 'o/r', {}, reading(REAL), write, noAuth)
      if (session === undefined) throw new Error('expected a session observation')

      expect(session.resetsPhrase).toBe('Sep 13 at 8pm (America/Los_Angeles)')
      expect(session.resetsAt).toBe('2026-09-14T03:00:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })

  it('stamps every row of one reading with the same instant', async () => {
    const { write } = fakeWrite()
    const appended = await observeSeat(seat(), 'o/r', {}, reading(REAL), write, noAuth)
    expect(new Set(appended.map((o) => o.at)).size).toBe(1)
  })

  it('keeps a phrase it cannot resolve, and derives no instant from it', async () => {
    const { write } = fakeWrite()
    const text = 'Current session: 4% used · resets tomorrow morning'
    const [session] = await observeSeat(seat(), 'o/r', {}, reading(text), write, noAuth)
    if (session === undefined) throw new Error('expected a session observation')

    expect(session.resetsPhrase).toBe('tomorrow morning')
    expect(session.resetsAt).toBeUndefined()
  })

  it('appends rather than replaces on a second reading', async () => {
    const { write, log } = fakeWrite()
    const at = (percent: number) =>
      reading(`Current session: ${percent}% used · resets Sep 13 at 8pm (America/Los_Angeles)`)
    await observeSeat(seat(), 'o/r', {}, at(17), write, noAuth)
    await observeSeat(seat(), 'o/r', {}, at(41), write, noAuth)

    const lines = log().trimEnd().split('\n')
    expect(lines).toHaveLength(2)
    // The first reading's bytes are still there, unchanged, under the second's.
    expect(lines.map((l) => (JSON.parse(l) as { percentUsed: number }).percentUsed)).toEqual([17, 41])
  })
})

describe('when the reading was taken', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads the reset against the moment the reading was asked for, not the moment it answered', async () => {
    // The provider prints the next reset as of when it answers, and `resolveReset` takes the
    // first occurrence at or after the instant it is given. A reading that straddles the reset
    // therefore resolves a year out if it is read against the answer.
    const asked = '2026-09-18T22:59:58.000Z'
    const answered = '2026-09-18T23:00:06.000Z'
    vi.useFakeTimers()
    vi.setSystemTime(new Date(asked))

    const { write } = fakeWrite()
    const run = async () => {
      vi.setSystemTime(new Date(answered))
      return 'Current session: 100% used \u00b7 resets Sep 18 at 4pm (America/Los_Angeles)'
    }
    const [session] = await observeSeat(seat(), 'o/r', {}, run, write, noAuth)
    if (session === undefined) throw new Error('expected a session observation')

    expect(session.at).toBe(asked)
    expect(session.resetsAt).toBe('2026-09-18T23:00:00.000Z')
  })
})

describe('a reading that yields no figures', () => {
  it('writes nothing when the reading itself fails', async () => {
    const { write, rows } = fakeWrite()
    const run = async () => {
      throw new BudgetError('claude exited 1')
    }
    await expect(observeSeat(seat(), 'o/r', {}, run, write, noAuth)).rejects.toThrow(BudgetError)
    expect(rows).toEqual([])
  })

  it('writes nothing when the output holds no window figures', async () => {
    const { write, rows } = fakeWrite()
    await expect(observeSeat(seat(), 'o/r', {}, reading(COST_SUMMARY), write, noAuth)).rejects.toThrow(BudgetError)
    expect(rows).toEqual([])
  })

  it('records nothing for a window the reading never named, rather than zero for it', async () => {
    const { write, rows } = fakeWrite()
    const appended = await observeSeat(
      seat(),
      'o/r',
      {},
      reading('Current session: 17% used · resets Sep 13 at 8pm (America/Los_Angeles)'),
      write,
      noAuth,
    )

    expect(appended.map((o) => o.window)).toEqual(['session'])
    expect(rows).toHaveLength(1)
  })

  it('carries no figure forward from an earlier reading into a failed one', async () => {
    const { write, rows } = fakeWrite()
    await observeSeat(seat(), 'o/r', {}, reading(REAL), write, noAuth)
    const before = rows.length
    await expect(observeSeat(seat(), 'o/r', {}, reading(COST_SUMMARY), write, noAuth)).rejects.toThrow(BudgetError)
    expect(rows).toHaveLength(before)
  })
})

describe('which credential answers', () => {
  it('does not pass the seat’s declared token, so the reading is the ambient login’s', async () => {
    const { write } = fakeWrite()
    let childEnv: NodeJS.ProcessEnv | undefined
    const run = async (env: NodeJS.ProcessEnv) => {
      childEnv = env
      return REAL
    }
    await observeSeat(seat({ tokenEnv: 'SEAT_TOKEN' }), 'o/r', { SEAT_TOKEN: 'seat-secret' }, run, write, noAuth)

    expect(childEnv?.['CLAUDE_CODE_OAUTH_TOKEN']).toBeUndefined()
  })

  it('still attributes the reading to the named seat', async () => {
    const { write } = fakeWrite()
    const appended = await observeSeat(seat({ id: 'bea', tokenEnv: 'SEAT_TOKEN' }), 'o/r', {}, reading(REAL), write, noAuth)
    expect(new Set(appended.map((o) => o.seat))).toEqual(new Set(['bea']))
  })

  it('reads ambient even where the seat\u2019s declared token source could not be read', async () => {
    // An unset `tokenEnv` is an error on every other path. Here the source is never consulted.
    const { write, rows } = fakeWrite()
    const appended = await observeSeat(seat({ tokenEnv: 'NOT_SET' }), 'o/r', {}, reading(REAL), write, noAuth)
    expect(appended).toHaveLength(3)
    expect(rows).toHaveLength(3)
  })

  it('leaves an ambient token in place rather than stripping it', async () => {
    const { write } = fakeWrite()
    let childEnv: NodeJS.ProcessEnv | undefined
    const run = async (env: NodeJS.ProcessEnv) => {
      childEnv = env
      return REAL
    }
    await observeSeat(seat(), 'o/r', { CLAUDE_CODE_OAUTH_TOKEN: 'ambient' }, run, write, noAuth)

    expect(childEnv?.['CLAUDE_CODE_OAUTH_TOKEN']).toBe('ambient')
  })
})

describe('which seat the reading is of', () => {
  it('uses the only declared seat when none is named', () => {
    expect(seatToObserve([seat()]).id).toBe('adam')
  })

  it('names the declared seats when several are declared and none is named', () => {
    expect(() => seatToObserve([seat(), seat({ id: 'bea' })])).toThrow(/adam, bea/)
  })

  it('says the seat must be declared when none is', () => {
    expect(() => seatToObserve([])).toThrow(/budget\.seats/)
  })

  it('takes the named seat over the count', () => {
    expect(seatToObserve([seat(), seat({ id: 'bea' })], 'bea').id).toBe('bea')
  })

  it('refuses a seat that is not declared, and says which are', () => {
    expect(() => seatToObserve([seat()], 'bea')).toThrow(/Declared seats: adam/)
  })

  it('fails as a BudgetError, which the command line reports and exits non-zero on', () => {
    expect(() => seatToObserve([])).toThrow(BudgetError)
  })
})
