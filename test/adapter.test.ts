import { describe, expect, it } from 'vitest'
import { daysSince, extractPaths } from '../src/adapter.js'
import { GitHubTracker, isStop, normalizeIssue, type RawIssue } from '../src/github-adapter.js'

const NOW = Date.parse('2026-09-13T00:00:00Z')

function issue(over: Partial<RawIssue> = {}): RawIssue {
  return {
    number: 42,
    url: 'https://github.com/o/r/issues/42',
    title: 'Something is broken',
    body: 'It breaks.',
    state: 'OPEN',
    createdAt: '2026-08-14T00:00:00Z',
    updatedAt: '2026-09-11T00:00:00Z',
    author: { login: 'reporter' },
    labels: { nodes: [] },
    assignees: { nodes: [] },
    timelineItems: { nodes: [] },
    ...over,
  }
}

const pr = (over: Record<string, unknown> = {}) => ({
  number: 99,
  url: 'https://github.com/o/r/pull/99',
  state: 'OPEN' as const,
  isDraft: false,
  ...over,
})

describe('normalized shape', () => {
  it('produces every field whether an issue has labels and assignees or neither', () => {
    // Task 3.7: the shape is what predicates depend on, so absence must not change it.
    const bare = normalizeIssue('o/r', issue(), NOW)
    const full = normalizeIssue(
      'o/r',
      issue({ labels: { nodes: [{ name: 'bug' }] }, assignees: { nodes: [{ login: 'dev' }] } }),
      NOW,
    )
    expect(Object.keys(bare).sort()).toEqual(Object.keys(full).sort())
    expect(bare.labels).toEqual([])
    expect(bare.assignees).toEqual([])
    expect(full.labels).toEqual(['bug'])
  })

  it('gives an item a globally unique id rather than a bare number', () => {
    // Two trackers both numbering from 1 would otherwise collide in state.
    expect(normalizeIssue('o/r', issue(), NOW).id).toBe('github:o/r#42')
  })

  it('survives a missing author and a null body', () => {
    const c = normalizeIssue('o/r', issue({ author: null, body: null }), NOW)
    expect(c.author).toBe('')
    expect(c.body).toBe('')
  })

  it('carries both ages, since only observation says which one a lane wants', () => {
    const c = normalizeIssue('o/r', issue(), NOW)
    expect(c.ageDays).toBe(30)
    expect(c.idleDays).toBe(2)
  })
})

describe('work in flight', () => {
  it('reports an open pull request', () => {
    const c = normalizeIssue('o/r', issue({ timelineItems: { nodes: [{ source: pr() }] } }), NOW)
    expect(c.inFlight).toEqual({
      kind: 'pull-request',
      ref: '#99',
      url: 'https://github.com/o/r/pull/99',
      draft: false,
    })
  })

  it('ignores a merged or closed pull request', () => {
    // Otherwise an Igor skips every issue anyone ever attempted, including ones reopened since.
    for (const state of ['MERGED', 'CLOSED'] as const) {
      const c = normalizeIssue('o/r', issue({ timelineItems: { nodes: [{ source: pr({ state }) }] } }), NOW)
      expect(c.inFlight).toBeUndefined()
    }
  })

  it('reads a connected event as well as a cross-reference', () => {
    const c = normalizeIssue('o/r', issue({ timelineItems: { nodes: [{ subject: pr() }] } }), NOW)
    expect(c.inFlight?.ref).toBe('#99')
  })

  it('finds the open one among closed ones', () => {
    const c = normalizeIssue(
      'o/r',
      issue({ timelineItems: { nodes: [{ source: pr({ state: 'CLOSED' }) }, { source: pr({ number: 100 }) }] } }),
      NOW,
    )
    expect(c.inFlight?.ref).toBe('#100')
  })

  it('tolerates an empty timeline node, which search returns for pull requests', () => {
    expect(normalizeIssue('o/r', issue({ timelineItems: { nodes: [null] } }), NOW).inFlight).toBeUndefined()
  })
})

describe('path extraction', () => {
  it('reads paths out of prose, since an issue has no files', () => {
    expect(extractPaths('Crash in `src/api/client.ts` when calling lib/util/retry.js')).toEqual([
      'src/api/client.ts',
      'lib/util/retry.js',
    ])
  })

  it('does not treat a URL tail as a repository path', () => {
    expect(extractPaths('see https://example.com/docs/guide.html for context')).toEqual([])
  })

  it('does not read prose containing a slash as a path', () => {
    expect(extractPaths('the and/or case, version 1.2/3.4, see also foo/bar')).toEqual([])
  })

  it('deduplicates across title and body', () => {
    expect(extractPaths('fix src/a.ts', 'src/a.ts is wrong')).toEqual(['src/a.ts'])
  })
})

describe('stop recognition', () => {
  it('recognizes a bare stop from anyone', () => {
    // Unconditional and open to anyone: recognition cannot depend on who wrote it.
    expect(isStop('stop', 'igor-bot')).toBe(true)
    expect(isStop('Stop please, this is the wrong issue', 'igor-bot')).toBe(true)
  })

  it('recognizes a stop addressed to the Igor', () => {
    expect(isStop('@igor-bot stop', 'igor-bot')).toBe(true)
    expect(isStop('igor-bot, stop — I am taking this', 'igor-bot')).toBe(true)
  })

  it('does not fire on the word appearing in prose', () => {
    expect(isStop('This will stop working after the migration', 'igor-bot')).toBe(false)
    expect(isStop('We should stop supporting node 18', 'igor-bot')).toBe(false)
  })

  it('does not fire on a longer word starting with stop', () => {
    expect(isStop('stopwatch behaviour is wrong', 'igor-bot')).toBe(false)
  })

  it('does not fire when one person tells another to stop', () => {
    // A generic leading mention would turn a conversation between two humans on an issue an
    // Igor happens to hold into a stop. Only an address to this Igor counts.
    expect(isStop('@alice stop doing that', 'igor-bot')).toBe(false)
    expect(isStop('@alice, stop — I will take it', 'igor-bot')).toBe(false)
  })

  it('does not fire on an Igor whose name merely prefixes the mention', () => {
    expect(isStop('@igor-bot-two stop', 'igor-bot')).toBe(false)
  })
})

describe('tracker contract', () => {
  it('declares a native holder field, so a claim is visible where people look', () => {
    expect(new GitHubTracker().nativeHolderField).toBe(true)
  })

  it('supplies its own linkage convention rather than the loop hardcoding one', () => {
    expect(new GitHubTracker().linkage(normalizeIssue('o/r', issue(), NOW))).toBe('Closes #42')
  })
})

describe('daysSince', () => {
  it('floors to whole days and never goes negative', () => {
    expect(daysSince('2026-09-11T23:00:00Z', NOW)).toBe(1)
    expect(daysSince('2026-09-20T00:00:00Z', NOW)).toBe(0)
  })

  it('treats an unparseable date as no age rather than NaN', () => {
    expect(daysSince('not a date', NOW)).toBe(0)
  })
})
