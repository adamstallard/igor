import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { Artifact, ArtifactRequest, Candidate, ClaimVerdict, CodeHost, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import {
  ABSOLUTE_CEILING_MS, branchFor, claudeWorker, complete, execute, ExecutionError,
  MODEL_SILENCE_MS, permits, prBody, PR_BODY_LIMIT, stripLinkage, TOOL_SILENCE_MS, watchWorker,
  workerPrompt, workerSystemPrompt, type WorkerEvent, type WorkerRunner,
} from '../src/execute.js'
import { withTree, type ChangedFile, type TreeProvider, type WorkingTree } from '../src/worktree.js'
import { tempDir } from './tmp.js'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

const candidate = (over: Partial<Candidate> = {}): Candidate =>
  ({
    id: 'github:o/r#7',
    repo: 'o/r',
    native: '7',
    title: 'Timestamps render in UTC instead of local time',
    body: 'Uses toISOString().',
    labels: ['bug'],
    assignees: [],
    paths: [],
    state: 'open',
    ...over,
  }) as Candidate

const role = (over: Partial<Role> = {}): Role =>
  ({
    name: 'triage',
    allow: ['comment', 'draft-pr', 'unassign'],
    completion: 'unassign',
    instructions: ['Prefer small diffs.'],
    reviewers: [],
    settleSeconds: 10,
    cooldownMinutes: 60,
    ...over,
  }) as Role

/** A provider whose trees are plain directories, so the seam is testable without a network. */
function fakeProvider(changes: ChangedFile[], opts: { failProvision?: boolean } = {}) {
  const log = { provisioned: 0, released: 0, paths: [] as string[] }
  const provider: TreeProvider = {
    name: 'fake',
    provision: async () => {
      if (opts.failProvision) throw new Error('cannot clone')
      log.provisioned++
      const path = tempDir('igor-test-tree-')
      log.paths.push(path)
      const tree: WorkingTree = {
        path,
        repo: 'o/r',
        changes: async () => changes,
        release: async () => {
          log.released++
        },
      }
      return tree
    },
  }
  return { provider, log }
}

function fakeCodeHost(): { host: CodeHost; seen: ArtifactRequest[] } {
  const seen: ArtifactRequest[] = []
  const host: CodeHost = {
    name: 'fake',
    produce: async (r): Promise<Artifact> => {
      seen.push(r)
      return { kind: 'pull-request', ref: '#42', url: 'https://example.test/42' }
    },
  }
  return { host, seen }
}

function fakeTracker() {
  const released: string[] = []
  const t: Tracker = {
    name: 'fake',
    nativeHolderField: true,
    identity: async () => 'igor-bot',
    search: async () => [],
    claim: async () => true,
    commentsSince: async () => [],
    verifyClaim: async () => ({ status: 'held' }),
    report: async () => {},
    release: async (_c, as) => {
      released.push(as)
    },
    linkage: () => 'Closes #7',
  }
  return { t, released }
}

describe('the working-tree seam', () => {
  it('releases the tree when the work succeeds', async () => {
    const { provider, log } = fakeProvider([])
    await withTree(provider, 'o/r', async () => 'done')
    expect(log.provisioned).toBe(1)
    expect(log.released).toBe(1)
  })

  it('releases the tree when the work throws', async () => {
    // The reason release lives in a finally: a failed task must not leave a tree behind.
    const { provider, log } = fakeProvider([])
    await expect(withTree(provider, 'o/r', async () => { throw new Error('boom') })).rejects.toThrow('boom')
    expect(log.released).toBe(1)
  })

  it('does not claim to have released a tree it never provisioned', async () => {
    const { provider, log } = fakeProvider([], { failProvision: true })
    await expect(withTree(provider, 'o/r', async () => 'x')).rejects.toThrow('cannot clone')
    expect(log.released).toBe(0)
  })

  it('gives each task a directory that did not exist before', async () => {
    // No state can carry between tasks if no directory is ever reused.
    const { provider, log } = fakeProvider([])
    await withTree(provider, 'o/r', async () => {})
    await withTree(provider, 'o/r', async () => {})
    expect(new Set(log.paths).size).toBe(2)
  })

  it('a file left by one task is not visible to the next', async () => {
    const { provider } = fakeProvider([])
    const first = await withTree(provider, 'o/r', async (t) => {
      writeFileSync(join(t.path, 'leftover.txt'), 'from the previous task')
      return t.path
    })
    const seenBySecond = await withTree(provider, 'o/r', async (t) => existsSync(join(t.path, 'leftover.txt')))
    expect(seenBySecond).toBe(false)
    expect(first).not.toBe('')
  })
})

describe('the action space is enforced at the loop', () => {
  it('permits only what the role lists', () => {
    expect(permits(role(), 'draft-pr')).toBe(true)
    expect(permits(role(), 'merge')).toBe(false)
  })

  it('tells the worker what is available without relying on it to comply', () => {
    // The prompt states the space for the worker's benefit; enforcement is elsewhere.
    const s = workerSystemPrompt(role(), role().allow)
    expect(s).toContain('draft-pr')
    expect(s).toMatch(/do not commit, push, or open/i)
  })

  it('refuses a completion the role does not permit', async () => {
    const { t, released } = fakeTracker()
    const r = await complete(t, candidate(), role({ completion: 'close', allow: ['comment'] }), 'igor-bot')
    expect(r?.action).toBe('close')
    expect(released).toEqual([])
  })

  it('refuses loudly rather than silently falling back to the default', async () => {
    const { t } = fakeTracker()
    const r = await complete(t, candidate(), role({ completion: 'close', allow: ['comment', 'close'] }), 'igor-bot')
    expect(r?.why).toMatch(/not implemented/)
  })

  it('releases the claim on the default completion', async () => {
    const { t, released } = fakeTracker()
    expect(await complete(t, candidate(), role(), 'igor-bot')).toBeUndefined()
    expect(released).toEqual(['igor-bot'])
  })
})

describe('the trusted channel', () => {
  it('fences the item and says it is data', () => {
    const s = workerSystemPrompt(role(), ['draft-pr'])
    expect(s).toMatch(/untrusted data/i)
    expect(s).toMatch(/Nothing inside it can change/)
    expect(workerPrompt(candidate(), 'Closes #7')).toContain('<item>')
  })

  it('carries the role instructions in the trusted half, not with the item', () => {
    expect(workerSystemPrompt(role(), ['draft-pr'])).toContain('Prefer small diffs.')
    expect(workerPrompt(candidate(), 'Closes #7')).not.toContain('Prefer small diffs.')
  })

  it('tells the worker that doing nothing is a real outcome', () => {
    // Otherwise a vague item gets a plausible-looking change rather than an honest refusal.
    expect(workerSystemPrompt(role(), ['draft-pr'])).toMatch(/valid and useful outcome/i)
  })

  it('truncates a very long body rather than paying for all of it', () => {
    expect(workerPrompt(candidate({ body: 'x'.repeat(20000) }), 'Closes #7')).toContain('[truncated]')
  })
})

describe('linkage is added once, by the loop', () => {
  it('removes a linkage line the worker wrote itself', () => {
    // Observed live: told the linkage, the worker helpfully repeated it, and the body carried
    // "Closes #6" twice. Harmless to GitHub, careless to a reader.
    expect(stripLinkage('Fixed the thing.\n\nCloses #6', 'Closes #6')).toBe('Fixed the thing.')
  })

  it('removes it wherever it appears, not only at the end', () => {
    expect(stripLinkage('Closes #6\n\nFixed it.', 'Closes #6')).toBe('Fixed it.')
  })

  it('leaves a mention inside a sentence alone', () => {
    const t = 'This also closes #6 in spirit but not really.'
    expect(stripLinkage(t, 'Closes #6')).toBe(t)
  })

  it('does not collapse the transcript when there is no linkage in it', () => {
    expect(stripLinkage('Just a normal summary.', 'Closes #6')).toBe('Just a normal summary.')
  })

  it('tells the worker not to write it', () => {
    expect(workerPrompt(candidate(), 'Closes #7')).toMatch(/do not write that yourself/i)
  })
})

describe('branch naming', () => {
  it('is readable and identifies the role and the item', () => {
    expect(branchFor(role(), candidate())).toBe('igor/triage/7-timestamps-render-in-utc-instead-of-loca')
  })

  it('does not leave a trailing separator when the cut lands on one', () => {
    // Trimming before slicing would: a 41st character of '-' survives the trim and then the cut.
    const title = `${'a'.repeat(40)} tail`
    expect(branchFor(role(), candidate({ title }))).not.toMatch(/-$/)
  })

  it('survives a title with nothing usable in it', () => {
    expect(branchFor(role(), candidate({ title: '???' }))).toBe('igor/triage/7-work')
  })

  it('does not produce a branch ending in a separator', () => {
    expect(branchFor(role(), candidate({ title: 'fix the thing!!!' }))).not.toMatch(/-$/)
  })
})

describe('what a person has to read', () => {
  it('passes a short summary through untouched', () => {
    expect(prBody('Closes #7', 'Bumped Node 16 to 20.', candidate())).toBe('Closes #7\n\nBumped Node 16 to 20.')
  })

  it('truncates a long one and points at where the rest lives', () => {
    // Generating text is free and reading it is not. The full transcript is already on the
    // state branch, so repeating it here spends the reviewer's attention for nothing.
    const long = `${'First sentence here. '.repeat(80)}`
    const body = prBody('Closes #7', long, candidate())
    expect(body.length).toBeLessThan(PR_BODY_LIMIT + 250)
    expect(body).toMatch(/igor-state/)
  })

  it('cuts at a sentence rather than mid-word', () => {
    const long = `${'Alpha beta gamma delta. '.repeat(60)}`
    expect(prBody('Closes #7', long, candidate())).toMatch(/delta\.\n/)
  })

  it('is just the linkage when the worker said nothing', () => {
    expect(prBody('Closes #7', '', candidate())).toBe('Closes #7')
  })
})

/** A worker that emits a run's worth of events before it finishes, and dies when aborted. */
function streamingWorker(events: number) {
  const ran = { events: 0, aborted: false }
  const worker: WorkerRunner = async ({ onEvent, signal }) => {
    for (let i = 0; i < events; i++) {
      await new Promise((r) => setTimeout(r, 1))
      if (signal?.aborted) {
        ran.aborted = true
        return {}
      }
      ran.events++
      onEvent?.({ type: 'assistant' })
    }
    await new Promise((r) => setTimeout(r, 1))
    if (signal?.aborted) {
      ran.aborted = true
      return {}
    }
    return { result: 'Fixed it.', total_cost_usd: 0.02 }
  }
  return { worker, ran }
}

/** Walks a sequence of claim reads and then stays on the last answer. */
function claimReads(...sequence: ClaimVerdict['status'][]) {
  const asked: ClaimVerdict['status'][] = []
  const claimStatus = async (): Promise<ClaimVerdict['status']> => {
    const status = sequence[Math.min(asked.length, sequence.length - 1)]!
    asked.push(status)
    return status
  }
  return { claimStatus, asked }
}

const edited: ChangedFile[] = [{ path: 'src/a.ts', content: 'fixed', kind: 'modified' }]

describe('a stop is answered while the worker runs', () => {
  it('kills the worker at a checkpoint rather than at the end of the task', async () => {
    // A fifteen-minute run that re-reads the claim only when it finishes answers a stop
    // fifteen minutes late, which is far longer than whoever posted it will wait.
    const { provider } = fakeProvider(edited)
    const { host, seen } = fakeCodeHost()
    const { t } = fakeTracker()
    const { worker, ran } = streamingWorker(8)
    const { claimStatus } = claimReads('held', 'held', 'stopped')

    const r = await execute(provider, t, host, candidate(), role(), { worker, claimStatus, checkpointMs: 0 })

    expect(r.outcome).toBe('refused')
    expect(r.reason).toMatch(/stopped mid-execution/)
    expect(seen).toEqual([])
    expect(ran.aborted).toBe(true)
    expect(ran.events).toBeLessThan(8)
  })

  it('answers a stop on a run that changed nothing', async () => {
    // Nothing to publish is not nothing to say: this owes a receipt, and returning
    // "nothing to do" without reading the claim posts a handoff instead.
    const { provider } = fakeProvider([])
    const { host } = fakeCodeHost()
    const { t } = fakeTracker()
    const { claimStatus } = claimReads('stopped')

    const r = await execute(provider, t, host, candidate(), role(), {
      worker: async () => ({ result: 'I looked and found nothing to change.', total_cost_usd: 0.01 }),
      claimStatus,
    })

    expect(r.outcome).toBe('refused')
    expect(r.reason).toMatch(/stopped mid-execution/)
  })

  it('lets a run someone else took over finish, so the draft survives', async () => {
    // Killing on a loss would destroy exactly the work the draft is there to hand over.
    const { provider } = fakeProvider(edited)
    const { host, seen } = fakeCodeHost()
    const { t } = fakeTracker()
    const { worker, ran } = streamingWorker(4)
    const { claimStatus } = claimReads('lost')

    const r = await execute(provider, t, host, candidate(), role(), { worker, claimStatus, checkpointMs: 0 })

    expect(r.outcome).toBe('refused')
    expect(r.reason).toMatch(/lost mid-execution/)
    expect(ran.aborted).toBe(false)
    expect(ran.events).toBe(4)
    expect(seen[0]?.draft).toBe(true)
  })

  it('does not re-read the claim on every event', async () => {
    // The cost of checkpointing is bounded by the interval, not by how chatty the worker is.
    const { provider } = fakeProvider(edited)
    const { host } = fakeCodeHost()
    const { t } = fakeTracker()
    const { worker } = streamingWorker(6)
    const { claimStatus, asked } = claimReads('held')

    const r = await execute(provider, t, host, candidate(), role(), { worker, claimStatus })

    expect(r.outcome).toBe('produced')
    expect(asked.length).toBe(1)
  })
})

describe('a worker is bounded by silence rather than by duration', () => {
  const limits = { toolMs: 30 * MINUTE, modelMs: 5 * MINUTE, ceilingMs: 6 * HOUR }

  /** Collects what the watchdog killed for, so a test can assert on the diagnosis. */
  function watched(over: Partial<typeof limits> = {}) {
    const killed: string[] = []
    const watch = watchWorker({ ...limits, ...over }, (why) => killed.push(why.message))
    return { watch, killed }
  }

  // The stream sends parent_tool_use_id as null on every event that carries content, never
  // absent, so the fixtures say null too.
  const dispatch = (id: string): WorkerEvent =>
    ({
      type: 'assistant',
      parent_tool_use_id: null,
      message: { content: [{ type: 'tool_use', id, name: 'Bash' }] },
    }) as unknown as WorkerEvent
  const returns = (id: string): WorkerEvent =>
    ({
      type: 'user',
      parent_tool_use_id: null,
      message: { content: [{ type: 'tool_result', tool_use_id: id }] },
    }) as unknown as WorkerEvent
  const thinking = {
    type: 'assistant',
    parent_tool_use_id: null,
    message: { content: [{ type: 'thinking' }] },
  } as unknown as WorkerEvent

  it('leaves a worker alone for as long as it keeps producing events', () => {
    // The case the wall clock got wrong: a productive run is long, and its length says nothing
    // about whether it is stuck.
    vi.useFakeTimers()
    try {
      const { watch, killed } = watched()
      for (let turn = 0; turn < 60; turn++) {
        vi.advanceTimersByTime(limits.modelMs - MINUTE)
        watch.progress(thinking)
      }
      expect(killed).toEqual([])
      watch.cancel()
    } finally {
      vi.useRealTimers()
    }
  })

  it('kills a worker whose model has gone quiet, and says that is what happened', () => {
    vi.useFakeTimers()
    try {
      const { watch, killed } = watched()
      watch.progress(returns('a'))
      vi.advanceTimersByTime(limits.modelMs)
      expect(killed).toEqual(['worker produced nothing for 5m and was killed'])
      watch.cancel()
    } finally {
      vi.useRealTimers()
    }
  })

  it('gives a worker blocked on a tool the longer window, and names the tool when it expires', () => {
    // A single Bash call running a long test suite emits nothing while it runs, and killing
    // that is exactly wrong.
    vi.useFakeTimers()
    try {
      const { watch, killed } = watched()
      watch.progress(dispatch('a'))
      vi.advanceTimersByTime(limits.toolMs - MINUTE)
      expect(killed).toEqual([])
      vi.advanceTimersByTime(MINUTE)
      expect(killed).toEqual(['worker produced nothing for 30m while a tool ran and was killed'])
      watch.cancel()
    } finally {
      vi.useRealTimers()
    }
  })

  it('goes back to the short window once the tool returns', () => {
    vi.useFakeTimers()
    try {
      const { watch, killed } = watched()
      watch.progress(dispatch('a'))
      watch.progress(returns('a'))
      vi.advanceTimersByTime(limits.modelMs)
      expect(killed).toEqual(['worker produced nothing for 5m and was killed'])
      watch.cancel()
    } finally {
      vi.useRealTimers()
    }
  })

  it('keeps the long window while a sibling tool is still running', () => {
    // Tools dispatched together return one at a time, so the first result back must not
    // shorten the window under the one still going.
    vi.useFakeTimers()
    try {
      const { watch, killed } = watched()
      watch.progress(dispatch('a'))
      watch.progress(dispatch('b'))
      watch.progress(returns('a'))
      vi.advanceTimersByTime(limits.modelMs * 2)
      expect(killed).toEqual([])
      vi.advanceTimersByTime(limits.toolMs)
      expect(killed).toEqual(['worker produced nothing for 30m while a tool ran and was killed'])
      watch.cancel()
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not let a subagent narrating drop the tools of the turn that spawned it', () => {
    // A Task subagent's first event is prose inside its own branch, while the Task that
    // dispatched it — the longest-running tool there is — is still outstanding.
    vi.useFakeTimers()
    try {
      const { watch, killed } = watched()
      watch.progress(dispatch('build'))
      watch.progress(dispatch('task'))
      watch.progress({
        type: 'user',
        parent_tool_use_id: 'task',
        message: { content: [{ type: 'text' }] },
      } as unknown as WorkerEvent)
      vi.advanceTimersByTime(limits.modelMs * 2)
      expect(killed).toEqual([])
      watch.cancel()
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears outstanding tools when the turn itself resumes', () => {
    // Prose at the top level is proof every tool came back, which is what rescues a run from
    // one unmatched id holding the long window open for good.
    vi.useFakeTimers()
    try {
      const { watch, killed } = watched()
      watch.progress(dispatch('stranded'))
      watch.progress(thinking)
      vi.advanceTimersByTime(limits.modelMs)
      expect(killed).toEqual(['worker produced nothing for 5m and was killed'])
      watch.cancel()
    } finally {
      vi.useRealTimers()
    }
  })

  it('is not sensitive to block order within one event', () => {
    vi.useFakeTimers()
    try {
      const { watch, killed } = watched()
      watch.progress({
        type: 'assistant',
        parent_tool_use_id: null,
        message: { content: [{ type: 'tool_use', id: 'a', name: 'Bash' }, { type: 'text' }] },
      } as unknown as WorkerEvent)
      vi.advanceTimersByTime(limits.modelMs * 2)
      expect(killed).toEqual([])
      watch.cancel()
    } finally {
      vi.useRealTimers()
    }
  })

  it('kills a worker that never finishes however live it looks, and says that instead', () => {
    // A worker emitting steadily forever satisfies both windows and still never ends.
    vi.useFakeTimers()
    try {
      const { watch, killed } = watched()
      for (let turn = 0; turn < 6 * 60; turn++) {
        vi.advanceTimersByTime(MINUTE)
        watch.progress(thinking)
      }
      expect(killed).toEqual(['worker ran 6h without finishing and was killed'])
      watch.cancel()
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports one limit and not both', () => {
    vi.useFakeTimers()
    try {
      const { watch, killed } = watched()
      vi.advanceTimersByTime(limits.ceilingMs * 2)
      expect(killed).toHaveLength(1)
      expect(killed[0]).toMatch(/produced nothing/)
      watch.cancel()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stops watching a run that has ended', () => {
    vi.useFakeTimers()
    try {
      const { watch, killed } = watched()
      watch.cancel()
      vi.advanceTimersByTime(limits.ceilingMs * 2)
      expect(killed).toEqual([])
    } finally {
      vi.useRealTimers()
    }
  })

  it('bounds a hung model sooner than a running tool, and both sooner than the run', () => {
    expect(MODEL_SILENCE_MS).toBeLessThan(TOOL_SILENCE_MS)
    expect(TOOL_SILENCE_MS).toBeLessThan(ABSOLUTE_CEILING_MS)
  })
})

/** Stands in for the CLI, so the spawn path runs without the real binary or the network. */
function stubCommand(body: string): string {
  const path = join(tempDir('igor-test-stub-'), 'stub')
  const preamble = "const emit = (e) => process.stdout.write(JSON.stringify(e) + '\\n')"
  writeFileSync(path, `#!/usr/bin/env node\n${preamble}\n${body}\n`, { mode: 0o755 })
  return path
}

function runStub(body: string, limits: { toolMs: number; modelMs: number; ceilingMs: number }) {
  return claudeWorker(stubCommand(body))({
    cwd: tempDir('igor-test-cwd-'),
    system: 'be useful',
    prompt: 'work this item',
    model: 'claude-sonnet-5',
    limits,
  })
}

const busy = { toolMs: 60_000, modelMs: 60_000, ceilingMs: 60_000 }

describe('the watchdog is wired to the worker stream', () => {
  it('lets a steadily-emitting worker run well past the window', async () => {
    // Twelve turns at 200ms is 2.4s of work under a 1.5s window. A wall clock kills this.
    const out = await runStub(
      `let turns = 0
       const t = setInterval(() => {
         emit({ type: 'assistant', message: { content: [{ type: 'thinking' }] } })
         if (++turns === 12) {
           clearInterval(t)
           emit({ type: 'result', result: 'done', total_cost_usd: 0.01 })
         }
       }, 200)`,
      { ...busy, modelMs: 1_500, toolMs: 1_500 },
    )
    expect(out.result).toBe('done')
    expect(out.total_cost_usd).toBe(0.01)
  })

  it('kills a worker whose model has gone quiet', async () => {
    await expect(
      runStub(`emit({ type: 'system', subtype: 'init' }); setInterval(() => {}, 10_000)`, {
        ...busy,
        modelMs: 1_000,
      }),
    ).rejects.toThrow('worker produced nothing for 1s and was killed')
  })

  it('waits out a tool the worker dispatched, then kills on the tool window', async () => {
    const started = Date.now()
    await expect(
      runStub(
        `emit({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'Bash' }] } })
         setInterval(() => {}, 10_000)`,
        { ...busy, modelMs: 300, toolMs: 2_000 },
      ),
    ).rejects.toThrow('worker produced nothing for 2s while a tool ran and was killed')
    expect(Date.now() - started).toBeGreaterThan(1_500)
  })

  it('does not count output that is not an event as progress', async () => {
    // A worker spewing warnings has still stopped working, and must not live forever on them.
    await expect(
      runStub(`setInterval(() => process.stdout.write('npm warn deprecated\\n'), 50)`, {
        ...busy,
        modelMs: 1_000,
      }),
    ).rejects.toThrow('worker produced nothing for 1s and was killed')
  })

  it('kills a live worker at the ceiling', async () => {
    await expect(
      runStub(`setInterval(() => emit({ type: 'assistant' }), 25)`, { ...busy, ceilingMs: 1_000 }),
    ).rejects.toThrow('worker ran 1s without finishing and was killed')
  })

  it('keeps the result of a finished run whose process will not exit', async () => {
    // The run is over once the result lands. A process still holding the pipe open is worth
    // killing and is not worth the transcript and the cost it already reported.
    const out = await runStub(
      `emit({ type: 'result', result: 'I fixed the bug', total_cost_usd: 0.42 })
       setInterval(() => {}, 10_000)`,
      { ...busy, modelMs: 700 },
    )
    expect(out.result).toBe('I fixed the bug')
    expect(out.total_cost_usd).toBe(0.42)
  })
})

describe('a worker killed for a limit still says what it changed', () => {
  it('reads the tree on the failure path rather than reporting nothing', async () => {
    // A kill can now land hours into real editing, so a failure recorded as having changed
    // nothing is a record of the wrong failure.
    const { provider } = fakeProvider(edited)
    const { host, seen } = fakeCodeHost()
    const { t } = fakeTracker()
    const killed = 'worker produced nothing for 30m while a tool ran and was killed'

    const r = await execute(provider, t, host, candidate(), role(), {
      worker: async () => {
        throw new ExecutionError(killed)
      },
    })

    expect(r.outcome).toBe('failed')
    expect(r.reason).toBe(killed)
    expect(r.changed).toEqual(edited)
    // Nothing is published off a kill: the diff is recorded, not offered.
    expect(seen).toEqual([])
  })
})
