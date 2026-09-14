import { describe, expect, it } from 'vitest'
import { daysSince, extractPaths } from '../src/adapter.js'
import {
  commentsFrom, GitHubTracker, normalizeIssue, verdictFrom, type RawComment, type RawIssue,
} from '../src/github-adapter.js'

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

const comment = (over: Partial<RawComment> = {}): RawComment => ({
  body: 'looks good',
  user: { login: 'alice' },
  created_at: '2026-09-12T00:00:00Z',
  ...over,
})

describe('verifying a claim', () => {
  it('holds when the Igor is the only assignee', () => {
    expect(verdictFrom('igor-bot', ['igor-bot'], [])).toEqual({ status: 'held' })
  })

  it('stands down when someone assigns themselves alongside the Igor', () => {
    // People add themselves to an assignee list rather than replacing what is there, so a
    // claim is lost while the Igor's own name is still on the item.
    expect(verdictFrom('igor-bot', ['igor-bot', 'alice'], [])).toEqual({ status: 'lost', by: 'alice' })
  })

  it('names the other party rather than the Igor, whatever the order', () => {
    expect(verdictFrom('igor-bot', ['alice', 'igor-bot'], []).by).toBe('alice')
    expect(verdictFrom('igor-bot', ['igor-bot', 'alice', 'bob'], []).by).toBe('alice')
  })

  it('stands down when the Igor was replaced outright', () => {
    expect(verdictFrom('igor-bot', ['alice'], [])).toEqual({ status: 'lost', by: 'alice' })
  })

  it('stands down with nobody to name when the Igor was simply unassigned', () => {
    expect(verdictFrom('igor-bot', [], [])).toEqual({ status: 'lost' })
  })

  it('reports a stop rather than the co-assignee, since a stop owes a receipt', () => {
    const v = verdictFrom('igor-bot', ['igor-bot', 'alice'], [comment({ body: 'stop, I have got this' })])
    expect(v.status).toBe('stopped')
    expect(v.by).toBe('alice')
    expect(v.reason).toBe('stop, I have got this')
    expect(v.at).toBe('2026-09-12T00:00:00Z')
  })

  it('ignores a comment that is not a stop', () => {
    expect(verdictFrom('igor-bot', ['igor-bot'], [comment()])).toEqual({ status: 'held' })
  })

  it('survives a comment with no body and no author', () => {
    const v = verdictFrom('igor-bot', ['igor-bot'], [comment({ body: null, user: null })])
    expect(v).toEqual({ status: 'held' })
  })

  it('truncates a very long stop, since the receipt quotes it', () => {
    const v = verdictFrom('igor-bot', ['igor-bot'], [comment({ body: `stop ${'x'.repeat(1000)}` })])
    expect(v.reason).toHaveLength(500)
  })
})

describe('reading what was said', () => {
  it('normalizes author, time and body', () => {
    expect(commentsFrom([comment()])).toEqual([
      { author: 'alice', at: '2026-09-12T00:00:00Z', body: 'looks good' },
    ])
  })

  it('names a deleted author as nobody rather than undefined', () => {
    // A caller asking "did anyone but me speak" should never have to consider undefined.
    expect(commentsFrom([comment({ user: null, body: null })])).toEqual([
      { author: '', at: '2026-09-12T00:00:00Z', body: '' },
    ])
  })

  it('reads an item with no comments as nobody having spoken', () => {
    expect(commentsFrom(null)).toEqual([])
    expect(commentsFrom([])).toEqual([])
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
