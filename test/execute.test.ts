import { mkdtempSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { Artifact, ArtifactRequest, Candidate, ClaimVerdict, CodeHost, Tracker } from '../src/adapter.js'
import type { Role } from '../src/role.js'
import {
  branchFor, complete, execute, permits, prBody, PR_BODY_LIMIT, stripLinkage, workerPrompt,
  workerSystemPrompt, type WorkerRunner,
} from '../src/execute.js'
import { withTree, type ChangedFile, type TreeProvider, type WorkingTree } from '../src/worktree.js'

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
      const path = mkdtempSync(join(tmpdir(), 'igor-test-tree-'))
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
