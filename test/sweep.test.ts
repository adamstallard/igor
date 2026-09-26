import {
  chmodSync, mkdtempSync, mkdirSync, rmSync, symlinkSync, utimesSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { ABSOLUTE_CEILING_MS } from '../src/execute.js'
import { TREE_PREFIX } from '../src/worktree.js'
import { SWEEP_AFTER_MS, isTreeName, nameRuleFor, sweepAbandonedTrees, sweepable } from '../src/sweep.js'
import { wire } from '../src/wiring.js'
import type { Config } from '../src/config.js'
import type { Role } from '../src/role.js'

const HOUR = 60 * 60 * 1000

/** Every root a test made, so nothing is left behind by the suite that exists to stop leaks. */
const roots: string[] = []

function root(): string {
  const dir = mkdtempSync(join(tmpdir(), 'igor-sweep-test-'))
  roots.push(dir)
  return dir
}

function tree(inRoot: string, name: string): string {
  const path = join(inRoot, name)
  mkdirSync(path, { recursive: true })
  writeFileSync(join(path, 'README.md'), 'a checkout lived here')
  return path
}

function recorder() {
  const said: string[] = []
  const warned: string[] = []
  return { out: { say: (l: string) => said.push(l), warn: (l: string) => warned.push(l) }, said, warned }
}

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true })
})

describe('which names a sweep may touch', () => {
  it('accepts a name mkdtemp actually produced', () => {
    const made = mkdtempSync(join(tmpdir(), TREE_PREFIX))
    try {
      expect(isTreeName(basename(made))).toBe(true)
    } finally {
      rmSync(made, { recursive: true, force: true })
    }
  })

  it('accepts the outbox a run leaves beside its tree', () => {
    // Its sibling, and the only directory a crash strands that nothing else reclaims: the
    // clone carries the work, the outbox carries the run's declaration.
    expect(isTreeName('igor-tree-AbCdEf-outbox')).toBe(true)
  })

  it('rejects everything that is not the prefix plus a random suffix', () => {
    const hostile = [
      '',
      '.',
      '..',
      'igor-tree',
      'igor-tree-',
      'igor-tree--outbox',
      'igor-tree-a/b-outbox',
      'igor-tree-abc-outbox-outbox',
      'igor-tree-abc-outboxes',
      'igor-tree-../../x',
      'igor-tree-..',
      'igor-tree-a/b',
      'igor-tree-a\\b',
      'igor-tree-abc.123',
      'igor-tree-abc 123',
      'igor-tree-abc\n',
      '/igor-tree-abc123',
      '.igor-tree-abc123',
      'x-igor-tree-abc123',
      'IGOR-TREE-abc123',
      // The test suite's own fake provider makes these, and they are not ours to delete.
      // The outboxes among them matter as much as the trees now that the rule reaches a
      // suffix: a sweep that took them would delete a directory a running suite is using.
      'igor-test-tree-AbCdEf',
      'igor-test-outbox-AbCdEf',
      'igor-loop-outbox-AbCdEf',
      'igor-serve-outbox-AbCdEf',
      'igor-lore-AbCdEf',
    ]
    for (const name of hostile) expect([name, isTreeName(name)]).toEqual([name, false])
  })
})

describe('the age rule', () => {
  const now = 1_000 * HOUR

  it('keeps a tree younger than the threshold', () => {
    expect(sweepable('igor-tree-abc123', now - (SWEEP_AFTER_MS - 1), now, SWEEP_AFTER_MS)).toBe(false)
  })

  it('sweeps one exactly at the threshold and beyond', () => {
    expect(sweepable('igor-tree-abc123', now - SWEEP_AFTER_MS, now, SWEEP_AFTER_MS)).toBe(true)
    expect(sweepable('igor-tree-abc123', now - 10 * HOUR, now, SWEEP_AFTER_MS)).toBe(true)
  })

  it('keeps an ancient directory that is not ours', () => {
    expect(sweepable('igor-test-tree-abc123', 0, now, SWEEP_AFTER_MS)).toBe(false)
  })

  it('leaves room for a worker that ran to the ceiling', () => {
    expect(SWEEP_AFTER_MS).toBeGreaterThan(ABSOLUTE_CEILING_MS)
  })
})

describe('sweeping a directory', () => {
  it('removes trees older than the threshold and reports the count', async () => {
    const dir = root()
    const old = [tree(dir, 'igor-tree-aaaaaa'), tree(dir, 'igor-tree-bbbbbb')]
    const { out, said } = recorder()

    const result = await sweepAbandonedTrees(out, { root: dir, now: Date.now() + SWEEP_AFTER_MS + HOUR })

    expect(result).toMatchObject({ removed: 2, failed: 0 })
    for (const path of old) expect(existsSync(path)).toBe(false)
    expect(said).toHaveLength(1)
    expect(said[0]).toContain('swept 2 abandoned trees')
  })

  it('reclaims the outbox a crashed run left beside its tree', async () => {
    // A run strands two directories, not one. `release()` removes both and SIGKILL runs
    // neither, so a rule that matches only the clone leaves one directory per crash forever —
    // and the one it leaves is the one holding the dead run's declaration.
    const dir = root()
    const clone = tree(dir, 'igor-tree-eeeeee')
    const outbox = tree(dir, 'igor-tree-eeeeee-outbox')
    const { out } = recorder()

    const result = await sweepAbandonedTrees(out, { root: dir, now: Date.now() + SWEEP_AFTER_MS + HOUR })

    expect(result).toMatchObject({ removed: 2, failed: 0 })
    expect(existsSync(clone)).toBe(false)
    expect(existsSync(outbox)).toBe(false)
  })

  it('leaves an outbox young enough to belong to a live process', async () => {
    // Age is the only safe signal for the outbox too, and it is the more dangerous of the
    // two to get wrong: deleting a live sibling's outbox throws away a declaration its
    // worker already wrote, and the run then refuses a revert somebody did declare.
    const dir = root()
    const live = tree(dir, 'igor-tree-cccccc-outbox')
    const { out } = recorder()

    const result = await sweepAbandonedTrees(out, { root: dir })

    expect(result.removed).toBe(0)
    expect(existsSync(live)).toBe(true)
  })

  it('leaves a tree young enough to belong to a live process, ours or a sibling\'s', async () => {
    const dir = root()
    const live = tree(dir, 'igor-tree-cccccc')
    const { out, said } = recorder()

    const result = await sweepAbandonedTrees(out, { root: dir })

    expect(result.removed).toBe(0)
    expect(existsSync(live)).toBe(true)
    expect(said).toEqual([])
  })

  it('touches nothing whose name is not ours, however old', async () => {
    const dir = root()
    const keep = [
      tree(dir, 'igor-test-tree-abcdef'),
      tree(dir, 'igor-tree'),
      tree(dir, 'igor-lore-abcdef'),
      tree(dir, 'important'),
    ]
    writeFileSync(join(dir, 'igor-tree-ffffff'), 'a file, not a tree')
    const { out } = recorder()

    const result = await sweepAbandonedTrees(out, { root: dir, now: Date.now() + SWEEP_AFTER_MS + HOUR })

    expect(result.removed).toBe(0)
    for (const path of keep) expect(existsSync(path)).toBe(true)
    expect(existsSync(join(dir, 'igor-tree-ffffff'))).toBe(true)
  })

  it('does not follow a symlink wearing our name', async () => {
    const dir = root()
    const elsewhere = root()
    const precious = tree(elsewhere, 'do-not-delete')
    const link = join(dir, 'igor-tree-dddddd')
    symlinkSync(elsewhere, link)
    const { out } = recorder()

    const result = await sweepAbandonedTrees(out, { root: dir, now: Date.now() + SWEEP_AFTER_MS + HOUR })

    expect(result).toMatchObject({ removed: 0, failed: 0 })
    expect(existsSync(precious)).toBe(true)
    expect(existsSync(link)).toBe(true)
  })

  it('keeps a tree whose age only one timestamp calls old', async () => {
    const dir = root()
    const live = tree(dir, 'igor-tree-999999')
    // A live clone's own mtime is set once, when the clone lands, and never advances for edits
    // nested inside it. Reading the oldest timestamp would condemn a tree still in use.
    const longAgo = new Date(Date.now() - 100 * HOUR)
    utimesSync(live, longAgo, longAgo)
    const { out } = recorder()

    const result = await sweepAbandonedTrees(out, { root: dir })

    expect(result.removed).toBe(0)
    expect(existsSync(live)).toBe(true)
  })

  it('finishes the sweep when one tree cannot be deleted', async () => {
    const dir = root()
    const stuck = tree(dir, 'igor-tree-777777')
    const ordinary = tree(dir, 'igor-tree-888888')
    const locked = join(stuck, 'locked')
    mkdirSync(locked)
    writeFileSync(join(locked, 'held'), 'x')
    chmodSync(locked, 0o500)
    const { out, warned } = recorder()

    try {
      const result = await sweepAbandonedTrees(out, { root: dir, now: Date.now() + SWEEP_AFTER_MS + HOUR })

      expect(result).toMatchObject({ removed: 1, failed: 1 })
      expect(existsSync(ordinary)).toBe(false)
      expect(warned[0]).toContain('cannot remove abandoned tree')
    } finally {
      chmodSync(locked, 0o700)
    }
  })

  it('warns rather than throwing when the directory cannot be read', async () => {
    const { out, warned } = recorder()

    const result = await sweepAbandonedTrees(out, { root: join(root(), 'gone') })

    expect(result).toMatchObject({ removed: 0, failed: 0 })
    expect(warned).toHaveLength(1)
    expect(warned[0]).toContain('cannot sweep')
  })
})

describe('the wiring both commands build from', () => {
  const config = { destination: '/nowhere', experts: [], budget: { seats: [], pools: [] } } as unknown as Config
  const role = { name: 'triage' } as unknown as Role

  it('sweeps before it hands back anything to run a cycle with', async () => {
    const dir = root()
    const abandoned = tree(dir, 'igor-tree-eeeeee')
    const { out, said } = recorder()

    const wiring = await wire(config, role, 'o/r', out, { root: dir, now: Date.now() + SWEEP_AFTER_MS + HOUR })

    expect(existsSync(abandoned)).toBe(false)
    expect(said.some((l) => l.includes('swept 1 abandoned tree'))).toBe(true)
    expect(typeof wiring.gate).toBe('function')
  })
})

describe('the name rule is built, not hardcoded', () => {
  it('matches what mkdtemp produces for the real prefix', () => {
    expect(nameRuleFor('igor-tree-').test('igor-tree-AbC123')).toBe(true)
    expect(nameRuleFor('igor-tree-').test('igor-tree-a/b')).toBe(false)
  })

  it('escapes the prefix, so a later one cannot silently widen what is deleted', () => {
    // This rule decides what gets rm -rf'd. Interpolated raw, a dot in the prefix becomes
    // "any character" and the sweep starts matching directories nobody named.
    const rule = nameRuleFor('igor.tree-')
    expect(rule.test('igor.tree-abc')).toBe(true)
    expect(rule.test('igorXtree-abc')).toBe(false)
  })
})
