import { describe, expect, it } from 'vitest'
import { checkSync, type Diagnostics } from 'recheck'
import { bareName, grammarPatterns, isGoAhead, isStop, namesToResolve } from '../src/signals.js'
import { escapeRegExp } from '../src/text.js'

const IDENTITY = 'igor-bot[bot]'

// recheck falls back to fuzzing for a pattern with lookaround, and a fuzzer finds an attack under
// one seed and misses it under another: seed 1 misses one on `mentionOf` that seeds 0, 2 and 3
// find. So each pattern is fuzzed under several fixed seeds, and the first attack found counts.
const SEEDS = [0, 1, 2, 3]

const check = (pattern: RegExp): Diagnostics => {
  let last: Diagnostics | undefined
  for (const randomSeed of SEEDS) {
    last = checkSync(pattern.source, pattern.flags, { randomSeed, timeout: 60_000 })
    if (last.status !== 'safe') return last
  }
  return last!
}

const linear = (d: Diagnostics): boolean => d.status === 'safe'

/**
 * Two patterns recheck rates 2nd-degree polynomial, kept as listed exceptions (Adam,
 * 2026-10-13). recheck blames their lookbehind over a run of `_`, yet in V8 they are fast: each of
 * recheck's attack strings, about 77,000 characters, runs in a few milliseconds, and strings of the
 * same shape took no longer at 60,000 characters than at 10,000 (Node 26, 2026-10-13). Why V8
 * escapes is not established; it appears to look for `@` or the name before it tries the
 * lookbehind, so a change to either pattern needs the checks below to pass again. Each is checked
 * three ways: recheck must still rate it non-linear, so this list fails rather than going stale
 * once recheck no longer does; the pattern without its lookbehind must be linear; and recheck's
 * attack string must run fast.
 */
const EXCEPTIONS: Record<string, (source: string) => string> = {
  // The lookbehind alternation before the name becomes a plain optional `@`.
  mentionOf: (source) => `@?${source.slice(source.indexOf(escapeRegExp(bareName(IDENTITY))))}`,
  // The lookbehind alternation before `@` goes.
  MENTION: (source) => source.slice(source.indexOf('@(')),
}

describe('every pattern signals.ts matches with runs in linear time', () => {
  const patterns = grammarPatterns(IDENTITY)

  it('the check flags a catastrophic pattern, behind a lookbehind and under the flags these use', () => {
    expect(linear(check(/^(a+)+$/))).toBe(false)
    expect(linear(check(/(?<=x)(a+)+$/gi))).toBe(false)
    expect(linear(check(/(a|a)*$/iy))).toBe(false)
    expect(linear(check(/(?<![\w@./-])@?abc/gi))).toBe(true)
  })

  it('lists every pattern the module runs', () => {
    // Every pattern executed while reading the sample comment bodies below must be one
    // `grammarPatterns` returns, or `escapeRegExp`'s, a single character class that lives in
    // text.ts. A pattern added later fails this until it is listed, provided a sample reaches it.
    const key = (r: RegExp): string => `${r.source}/${r.flags}`
    const known = new Set(Object.values(patterns).map(key))
    const ran = new Set<string>()
    const exec = RegExp.prototype.exec
    RegExp.prototype.exec = function (this: RegExp, s: string) {
      ran.add(key(this))
      return exec.call(this, s)
    }
    try {
      escapeRegExp('x')
      ran.forEach((k) => known.add(k))
      ran.clear()
      for (const body of [
        'stop @a, @b and @c please',
        'go ahead @x’s **@y** work, @z approved',
        'Thanks. @igor-bot stop',
        '> @igor-bot stop\nno',
        '`stop` @a',
        'carry on, @a approved it for @b',
        'Stop — @alice is taking over',
      ]) {
        isStop(body, IDENTITY, {})
        isGoAhead(body, IDENTITY, {})
        namesToResolve(body)
      }
    } finally {
      RegExp.prototype.exec = exec
    }
    expect([...ran].filter((k) => !known.has(k))).toEqual([])
  })

  for (const [name, pattern] of Object.entries(patterns)) {
    if (name in EXCEPTIONS) continue
    it(`${name} is linear`, () => {
      const d = check(pattern)
      expect(linear(d), `${d.status} ${d.status === 'vulnerable' ? d.attack.pattern : ''}`).toBe(true)
    })
  }

  for (const [name, withoutLookbehind] of Object.entries(EXCEPTIONS)) {
    describe(`${name}, a listed exception`, () => {
      const pattern = patterns[name]!

      it('is still rated non-linear by recheck, so the exception is still needed', () => {
        expect(check(pattern).status).toBe('vulnerable')
      })

      it('is linear without its lookbehind', () => {
        const rest = withoutLookbehind(pattern.source)
        expect(rest).not.toContain('(?<')
        expect(linear(check(new RegExp(rest, pattern.flags)))).toBe(true)
      })

      it("runs recheck's attack string fast", () => {
        const d = check(pattern)
        if (d.status !== 'vulnerable') throw new Error(`${name} is no longer rated non-linear`)
        const attack = d.attack.string
        // A generous bound: V8 takes a few milliseconds, and a polynomial blow-up on a string
        // this long would take seconds.
        const started = performance.now()
        ;[...attack.matchAll(new RegExp(pattern.source, pattern.flags))]
        isStop(attack, IDENTITY, {})
        isGoAhead(attack, IDENTITY, {})
        namesToResolve(attack)
        expect(performance.now() - started).toBeLessThan(1000)
      })
    })
  }

  // recheck checks one pattern at a time, so it cannot see `addressed()` looking back for the
  // start of the line at each place it finds the name. With no line break before it, that
  // look-back runs to the start of the comment each time, so a comment naming the Igor many times
  // costs time quadratic in its length: about 60 ms for each of `isStop` and `isGoAhead` at
  // GitHub's 65,536-character limit. The two take about 120 ms against a bound of a second, which
  // leaves room for a loaded machine and still fails if the cost per name grows about eightfold.
  it('a comment naming the Igor many times on one line, at the length limit, reads in under a second', () => {
    const body = `${bareName(IDENTITY)} `.repeat(65_536).slice(0, 65_536)
    const started = performance.now()
    isStop(body, IDENTITY, {})
    isGoAhead(body, IDENTITY, {})
    expect(performance.now() - started).toBeLessThan(1000)
  })
}, 300_000)
