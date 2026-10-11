import { describe, expect, it } from 'vitest'
import { daysSince, extractPaths } from '../src/adapter.js'
import {
  commentsFrom, GitHubCodeHost, GitHubTracker, labelVerdictFrom, latestLabelEvent, loginOf, normalizeIssue,
  refuseWorkflows, type RawComment, type RawEvent, type RawIssue,
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
  mergeable: 'MERGEABLE' as const,
  headRefName: 'igor/fixer/42-a-bug',
  baseRefName: 'main',
  author: { login: 'igor-bot' },
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
      author: 'igor-bot',
      mergeable: 'clean',
      branch: 'igor/fixer/42-a-bug',
      base: 'main',
    })
  })

  it('reports an unmergeable artifact as conflicting, and anything unstated as unknown', () => {
    // `unknown` is not a pessimistic `conflicting`. GitHub computes mergeability
    // asynchronously, so every freshly opened artifact answers nothing on the first ask —
    // and reading that as a conflict would send a worker at each one on the cycle it was born.
    const of = (over: Record<string, unknown>) =>
      normalizeIssue('o/r', issue({ timelineItems: { nodes: [{ source: pr(over) }] } }), NOW).inFlight
        ?.mergeable
    expect(of({ mergeable: 'CONFLICTING' })).toBe('conflicting')
    expect(of({ mergeable: 'UNKNOWN' })).toBe('unknown')
    expect(of({ mergeable: null })).toBe('unknown')
    expect(of({ mergeable: undefined })).toBe('unknown')
  })

  it('reports an artifact with no branch or base as unknown, whatever it said about merging', () => {
    // Acting on one means asking the host to merge into a branch named by nothing.
    const of = (over: Record<string, unknown>) =>
      normalizeIssue('o/r', issue({ timelineItems: { nodes: [{ source: pr(over) }] } }), NOW).inFlight
    expect(of({ mergeable: 'CONFLICTING', headRefName: undefined })?.mergeable).toBe('unknown')
    expect(of({ mergeable: 'CONFLICTING', baseRefName: undefined })?.mergeable).toBe('unknown')
  })

  it('carries who opened the artifact, and survives a deleted author', () => {
    const of = (over: Record<string, unknown>) =>
      normalizeIssue('o/r', issue({ timelineItems: { nodes: [{ source: pr(over) }] } }), NOW).inFlight?.author
    expect(of({})).toBe('igor-bot')
    expect(of({ author: null })).toBe('')
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

/** A `since` before every fixture, so it leaves what a verdict reads unchanged. */
const EVER = '1970-01-01T00:00:00Z'
const SELF = { login: 'acme-reviewer[bot]', accountId: 99, holder: 'igor:reviewer' }
let nextId = 1
const event = (kind: 'labeled' | 'unlabeled', label: string, actor: { login: string; id: number; type: string }, id = nextId++): RawEvent => ({
  id, event: kind, actor, label: { name: label }, created_at: '2026-10-04T00:00:00Z',
})
const ME = { login: 'acme-reviewer[bot]', id: 99, type: 'Bot' }
const ADAM = { login: 'adamstallard', id: 205792, type: 'User' }
const OTHER_IGOR = { login: 'acme-backend[bot]', id: 77, type: 'Bot' }

describe('verifying a label claim', () => {
  it('holds while the Igor carries its label', () => {
    expect(labelVerdictFrom(SELF, ['bug', 'igor:reviewer'], undefined, [], EVER)).toEqual({ status: 'held' })
  })

  it("keeps the claim when a person added another Igor's label, even in the settle interval", () => {
    const events = [event('labeled', 'igor:reviewer', ME), event('labeled', 'igor:backend', ADAM)]
    expect(labelVerdictFrom(SELF, ['igor:reviewer', 'igor:backend'], events, [], EVER)).toEqual({ status: 'held' })
  })

  it('loses the claim to another Igor that added its own label', () => {
    const events = [event('labeled', 'igor:reviewer', ME), event('labeled', 'igor:backend', OTHER_IGOR)]
    expect(labelVerdictFrom(SELF, ['igor:reviewer', 'igor:backend'], events, [], EVER)).toEqual({
      status: 'lost', by: 'acme-backend[bot]',
    })
  })

  it('reads a person removing the label as a stop that names them', () => {
    const events = [event('labeled', 'igor:reviewer', ME), event('unlabeled', 'igor:reviewer', ADAM)]
    expect(labelVerdictFrom(SELF, ['bug'], events, [], EVER)).toEqual({
      status: 'stopped', by: 'adamstallard', at: '2026-10-04T00:00:00Z', reason: 'removed the igor:reviewer label', fromHolder: true,
    })
  })

  it("reads its own removal as its release, matched by the bot's id", () => {
    const events = [event('unlabeled', 'igor:reviewer', ADAM, 10), event('labeled', 'igor:reviewer', ADAM, 11), event('unlabeled', 'igor:reviewer', ME, 12)]
    expect(labelVerdictFrom(SELF, [], events, [], EVER)).toEqual({ status: 'lost' })
  })

  it('orders events by id, never by time, so the latest removal decides', () => {
    // Two events in one second: only the ids say which came last (measured 2026-10-04).
    const events = [event('unlabeled', 'igor:reviewer', ME, 21), event('unlabeled', 'igor:reviewer', ADAM, 20)]
    expect(labelVerdictFrom(SELF, [], events, [], EVER).status).toBe('lost')
    const reversed = [event('unlabeled', 'igor:reviewer', ME, 20), event('unlabeled', 'igor:reviewer', ADAM, 21)]
    expect(labelVerdictFrom(SELF, [], reversed, [], EVER).status).toBe('stopped')
  })

  it('does not take a person who shares the bot id number for the bot', () => {
    const events = [event('unlabeled', 'igor:reviewer', { login: 'someone', id: 99, type: 'User' })]
    expect(labelVerdictFrom(SELF, [], events, [], EVER).status).toBe('stopped')
  })

  it('reports a stop comment ahead of everything, since a stop owes a receipt', () => {
    const events = [event('labeled', 'igor:backend', OTHER_IGOR)]
    const v = labelVerdictFrom(SELF, ['igor:reviewer', 'igor:backend'], events, [comment({ body: 'stop, I have got this' })], EVER)
    expect(v.status).toBe('stopped')
    expect(v.by).toBe('alice')
    expect(v.reason).toBe('stop, I have got this')
  })

  it('ignores a comment that is not a stop, and one with no body or author', () => {
    expect(labelVerdictFrom(SELF, ['igor:reviewer'], undefined, [comment(), comment({ body: null, user: null })], EVER)).toEqual({ status: 'held' })
  })

  it('truncates a very long stop, since the receipt quotes it', () => {
    const v = labelVerdictFrom(SELF, ['igor:reviewer'], undefined, [comment({ body: `stop ${'x'.repeat(1000)}` })], EVER)
    expect(v.reason).toHaveLength(500)
  })

  it('reads a stop created before `since` as no stop, though GitHub returns it because it was edited since', () => {
    const edited = comment({ body: 'stop, waiting on the design (edit: design done)', created_at: '2026-10-09T00:00:00Z' })
    expect(labelVerdictFrom(SELF, ['igor:reviewer'], undefined, [edited], '2026-10-11T00:00:00Z')).toEqual({ status: 'held' })
  })

  it('reads a stop created at or after `since` as a stop', () => {
    const at = comment({ body: 'stop', created_at: '2026-10-11T00:00:00Z' })
    const after = comment({ body: 'stop', created_at: '2026-10-11T00:00:01Z' })
    expect(labelVerdictFrom(SELF, ['igor:reviewer'], undefined, [at], '2026-10-11T00:00:00Z').status).toBe('stopped')
    expect(labelVerdictFrom(SELF, ['igor:reviewer'], undefined, [after], '2026-10-11T00:00:00Z').status).toBe('stopped')
  })

  it('reads a stop whose creation time cannot be parsed as a stop', () => {
    const undated = comment({ body: 'stop', created_at: 'not a time' })
    expect(labelVerdictFrom(SELF, ['igor:reviewer'], undefined, [undated], '2026-10-11T00:00:00Z').status).toBe('stopped')
  })

  it('finds the latest event of a kind for one label', () => {
    const events = [event('labeled', 'igor:reviewer', ME, 5), event('labeled', 'igor:other', ADAM, 9), event('labeled', 'igor:reviewer', ADAM, 7)]
    expect(latestLabelEvent(events, 'labeled', 'igor:reviewer')?.id).toBe(7)
    expect(latestLabelEvent(events, 'unlabeled', 'igor:reviewer')).toBeUndefined()
  })
})

describe('igor labels on a discovered issue', () => {
  it('reads the holder field off the labels', () => {
    const c = normalizeIssue('o/r', issue({ labels: { nodes: [{ name: 'bug' }, { name: 'igor:reviewer' }, { name: 'igor:backend' }] } }), NOW)
    expect(c.holders).toEqual(['igor:reviewer', 'igor:backend'])
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
    // A list of labels, separate from the assignee, which stays a person's.
    expect(new GitHubTracker({ role: 'reviewer' }).holderField).toEqual({ holds: 'list', distinctFromAssignee: true })
    expect(new GitHubTracker({ role: 'reviewer' }).holder).toBe('igor:reviewer')
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

describe('the App as author', () => {
  it("spells a bot author as REST does, so the Igor's own pull request reads as its own", () => {
    // Measured 2026-10-04: GraphQL `igor-generalist`, REST `igor-generalist[bot]`.
    const c = normalizeIssue(
      'o/r',
      issue({
        author: { login: 'igor-generalist', __typename: 'Bot' },
        timelineItems: { nodes: [{ source: pr({ author: { login: 'igor-generalist', __typename: 'Bot' } }) }] },
      }),
      NOW,
    )
    expect(c.author).toBe('igor-generalist[bot]')
    expect(c.inFlight?.author).toBe('igor-generalist[bot]')
  })

  it("leaves a person's login as it is", () => {
    expect(loginOf({ login: 'adam', __typename: 'User' })).toBe('adam')
    expect(loginOf({ login: 'x[bot]', __typename: 'Bot' })).toBe('x[bot]')
    expect(loginOf(null)).toBe('')
  })

  it("is the App's bot account, never GET /user", async () => {
    const tracker = new GitHubTracker({ account: { login: 'acme-reviewer[bot]', id: 99 } })
    expect(await tracker.identity()).toBe('acme-reviewer[bot]')
    expect(tracker.accountId).toBe(99)
    await expect(new GitHubTracker().identity()).rejects.toThrow(/without the App bot account/)
  })
})

describe('a publish that changes a workflow', () => {
  it('fails naming the Workflows permission where the installation lacks it', () => {
    expect(() => refuseWorkflows(['src/a.ts', '.github/workflows/ci.yml'], false)).toThrow(
      /\.github\/workflows\/ci\.yml, which needs the App's Workflows write permission/,
    )
    expect(() => refuseWorkflows(['.github/workflows/ci.yml'], true)).not.toThrow()
    expect(() => refuseWorkflows(['.github/CODEOWNERS'], false)).not.toThrow()
  })

  it('is refused before anything is written', async () => {
    const host = new GitHubCodeHost({ canWriteWorkflows: false })
    await expect(
      host.produce({
        repo: 'o/r', branch: 'b', base: 'main', baseSha: 'abc', title: 't', body: 'b', draft: true,
        files: [{ path: '.github/workflows/ci.yml', content: 'x' }], deletions: [],
      }),
    ).rejects.toThrow(/Workflows write/)
  })
})
