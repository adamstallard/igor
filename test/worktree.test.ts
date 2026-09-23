import { execFile } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import { ClonedTree, named, quoteName, showName, statusRecords } from '../src/worktree.js'
import { tempDir } from './tmp.js'

const run = promisify(execFile)

/** A real repository, because what is under test is how git reports its own status. */
async function repo(): Promise<string> {
  const dir = tempDir('igor-tree-test-')
  await run('git', ['-C', dir, 'init', '-q', '.'])
  await run('git', ['-C', dir, 'config', 'user.email', 't@example.invalid'])
  await run('git', ['-C', dir, 'config', 'user.name', 'test'])
  writeFileSync(join(dir, 'tracked.md'), 'before\n')
  await run('git', ['-C', dir, 'add', 'tracked.md'])
  await run('git', ['-C', dir, 'commit', '-qm', 'base'])
  return dir
}

describe('what a working tree reports as changed', () => {
  it('lists every file in a directory the worker created', async () => {
    // Porcelain collapses an untracked directory to one entry — `?? openspec/`, not the files
    // under it. Reading that path throws, the binary-file catch skips it, and everything the
    // worker wrote in a new directory is lost from the artifact silently. Spec deltas are
    // always new files in new directories.
    const dir = await repo()
    mkdirSync(join(dir, 'openspec/changes/new/specs/thing'), { recursive: true })
    writeFileSync(join(dir, 'openspec/changes/new/proposal.md'), 'a\n')
    writeFileSync(join(dir, 'openspec/changes/new/specs/thing/spec.md'), 'b\n')

    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed.map((c) => c.path).sort()).toEqual([
      'openspec/changes/new/proposal.md',
      'openspec/changes/new/specs/thing/spec.md',
    ])
    expect(changed.every((c) => c.kind === 'added')).toBe(true)
    expect(changed.find((c) => c.path.endsWith('proposal.md'))?.content).toBe('a\n')
  })

  it('still reports a modified tracked file', async () => {
    const dir = await repo()
    writeFileSync(join(dir, 'tracked.md'), 'after\n')
    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed).toEqual([{ path: 'tracked.md', content: 'after\n', kind: 'modified' }])
  })

  it('reports a deletion without trying to read the file', async () => {
    const dir = await repo()
    await run('git', ['-C', dir, 'rm', '-q', 'tracked.md'])
    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed).toEqual([{ path: 'tracked.md', content: '', kind: 'deleted' }])
  })
})

describe('what a name that is not text survives', () => {
  /** The bytes `git status -z` writes for one record, name and all. */
  const record = (flags: string, name: Buffer): Buffer =>
    Buffer.concat([Buffer.from(`${flags} `), name, Buffer.from([0])])

  it('carries a name that is not valid UTF-8 through as the bytes git wrote', () => {
    // ext4 takes any byte in a name but `/` and NUL, and Igor runs as a service on Linux.
    // Decoded to a string the undecodable bytes become U+FFFD, `readFile` is handed a name no
    // file has, the read throws, and the entry is skipped — the run succeeds, the handoff reads
    // normally, and the file is simply not in the change. Unreachable on APFS, which refuses
    // the name outright, so the parse is the seam this can honestly be proved at.
    const name = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x2e, 0x6d, 0x64])
    const records = statusRecords(record('??', name))
    expect(records).toHaveLength(1)
    expect(records[0]!.path.equals(name)).toBe(true)
  })

  it('splits on the NUL byte rather than on a decoded one', () => {
    const first = Buffer.from([0xff, 0xfe, 0x2e, 0x74, 0x78, 0x74])
    const second = Buffer.from('ordinary.md')
    const records = statusRecords(Buffer.concat([record(' M', first), record('??', second)]))
    expect(records.map((r) => r.flags)).toEqual([' M', '??'])
    expect(records[0]!.path.equals(first)).toBe(true)
    expect(records[1]!.path.equals(second)).toBe(true)
  })

  it('keeps a rename\'s two records paired when neither name is text', () => {
    const to = Buffer.from([0x6e, 0x65, 0x77, 0xc3, 0x28, 0x2e, 0x6d, 0x64])
    const from = Buffer.from([0x6f, 0x6c, 0x64, 0xc3, 0x28, 0x2e, 0x6d, 0x64])
    const records = statusRecords(
      Buffer.concat([record('R ', to), Buffer.concat([from, Buffer.from([0])])]),
    )
    expect(records).toHaveLength(1)
    expect(records[0]!.path.equals(to)).toBe(true)
    expect(records[0]!.from?.equals(from)).toBe(true)
  })

  it('reads a file whose name is not ASCII off disk', async () => {
    // The parse above proves the bytes survive; this proves the tree still opens what they
    // name, through a `Buffer` path rather than a joined string. A name that is valid UTF-8 is
    // the most this filesystem will hold, so the invalid case is reasoned from here, not shown.
    const dir = await repo()
    writeFileSync(join(dir, 'ま—.md'), 'kept\n')
    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed).toEqual([{ path: 'ま—.md', content: 'kept\n', kind: 'added' }])
  })

  it('decodes a status listing the pipe split across chunks', async () => {
    // The bug `649692e` fixed, at this seam: a three-byte character straddling a chunk boundary
    // decodes to replacement characters on both sides, so git's own listing names files that
    // are not there. The listing runs to a few hundred kilobytes, well past the pipe buffer, so
    // it arrives in several chunks and the boundaries fall inside these names.
    const dir = await repo()
    const names = Array.from({ length: 1200 }, (_, i) => `${'—'.repeat(80)}-${i}.md`)
    for (const name of names) writeFileSync(join(dir, name), 'x\n')

    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed.filter((c) => c.path.includes('\uFFFD'))).toEqual([])
    expect(changed.map((c) => c.path).sort()).toEqual(names.sort())
  })
})

describe('telling a name that survived the decode from one that did not', () => {
  it('keeps the bytes beside a name that is not valid UTF-8', () => {
    const name = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x2e, 0x6d, 0x64])
    expect(named(name).path).toBe('caf\uFFFD.md')
    expect(named(name).rawName?.equals(name)).toBe(true)
  })

  it('keeps no bytes beside a name that is text', () => {
    expect(named(Buffer.from('ordinary.md'))).toEqual({ path: 'ordinary.md' })
    expect(named(Buffer.from('\u307E\u2014.md'))).toEqual({ path: '\u307E\u2014.md' })
  })

  it('leaves a name really spelled with U+FFFD alone', () => {
    // The test available before the bytes were \u2014 does the decoded name contain U+FFFD \u2014 is
    // what ruled detect-and-refuse out: U+FFFD is a character a file may legitimately carry,
    // and that test calls such a name unpublishable when it publishes perfectly well. The
    // round trip re-encodes and compares, so this name goes through untouched.
    expect(named(Buffer.from([0xef, 0xbf, 0xbd, 0x2e, 0x6d, 0x64]))).toEqual({ path: '\uFFFD.md' })
  })

  it('catches a multi-byte sequence git wrote only part of', () => {
    const cut = Buffer.from([0xe3, 0x81])
    expect(named(cut).rawName?.equals(cut)).toBe(true)
  })

  it('flags the name a rename came from, which the record after it carries', () => {
    const to = Buffer.from([0x6e, 0x65, 0x77, 0x2e, 0x6d, 0x64])
    const from = Buffer.from([0x6f, 0x6c, 0x64, 0xc3, 0x28, 0x2e, 0x6d, 0x64])
    const [record] = statusRecords(
      Buffer.concat([Buffer.from('R  '), to, Buffer.from([0]), from, Buffer.from([0])]),
    )
    expect(named(record!.path).rawName).toBeUndefined()
    expect(named(record!.from!).rawName?.equals(from)).toBe(true)
  })

  it('publishes a file that really is named with U+FFFD', async () => {
    // End to end, because this name is one APFS will hold: the round trip is what keeps the
    // refusal off a file nothing is wrong with.
    const dir = await repo()
    writeFileSync(join(dir, '\uFFFD.md'), 'kept\n')
    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed).toEqual([{ path: '\uFFFD.md', content: 'kept\n', kind: 'added' }])
  })
})

describe('naming a file whose name is not text', () => {
  it('writes the bytes git wrote rather than the spelling that lost them', () => {
    const name = Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x2e, 0x6d, 0x64])
    expect(quoteName(name)).toBe('caf\\xe9.md')
    expect(quoteName(name)).not.toContain('\uFFFD')
  })

  it('gives two names that decode alike two different renderings', () => {
    // The collision the refusal exists to stop, reproduced inside the message reporting it: a
    // sentence built from the decoded path names one file twice and the other never.
    const one = Buffer.from([0x78, 0xe9, 0x2e, 0x6d, 0x64])
    const two = Buffer.from([0x78, 0xea, 0x2e, 0x6d, 0x64])
    expect(one.toString('utf8')).toBe(two.toString('utf8'))
    expect(quoteName(one)).not.toBe(quoteName(two))
  })

  it('escapes the backslash, so no ordinary name can spell an escape', () => {
    expect(quoteName(Buffer.from('a\\xe9.md'))).toBe('a\\\\xe9.md')
  })

  it('escapes the space, which a code span strips from its own edges', () => {
    // CommonMark drops one space from each end of a code span's content, so a name whose bytes
    // begin and end with 0x20 loses them where the refusal names it — and what is left may be
    // another file in the same run.
    const strip = (s: string): string => (s.startsWith(' ') && s.endsWith(' ') ? s.slice(1, -1) : s)
    expect(quoteName(Buffer.from([0x20]))).toBe('\\x20')
    expect(strip(quoteName(Buffer.from([0x20, 0xe9, 0x20])))).not.toBe(strip(quoteName(Buffer.from([0xe9]))))
  })

  it('escapes the backtick, which the handoff puts the name inside', () => {
    // The refusal wraps the name in a code span so markdown leaves its backslashes alone. A
    // backtick in the name closes that span early, and the rest of the name lands in body
    // text — where `\\` collapses to `\`, which is the collapse the doubling exists to stop.
    expect(quoteName(Buffer.from([0x61, 0x60, 0x62]))).toBe('a\\x60b')
  })

  it('doubles the backslash on the ordinary side too, where the names actually meet', () => {
    // `quoteName` only ever sees a name that is not text, so doubling there alone proves
    // nothing: the two names that collide are one of each kind, and they are told apart only
    // if the ordinary one is doubled as well.
    const escaped = Buffer.from([0x61, 0xe9, 0x2e, 0x6d, 0x64])
    expect(showName({ path: 'a\\xe9.md' })).toBe('a\\\\xe9.md')
    expect(showName({ path: escaped.toString('utf8'), rawName: escaped })).toBe('a\\xe9.md')
  })

  it('leaves an ordinary name alone, which is what the record is mostly made of', () => {
    expect(showName({ path: 'src/a.ts' })).toBe('src/a.ts')
    expect(showName({ path: 'ま—.md' })).toBe('ま—.md')
  })
})

/**
 * An origin with a branch that conflicts with its own base, cloned the way `CloneProvider`
 * clones — shallow — because the depth is exactly what makes the merge non-trivial.
 */
async function conflicting(): Promise<{ clone: string; origin: string }> {
  const origin = tempDir('igor-tree-origin-')
  const git = (...args: string[]) => run('git', ['-C', origin, ...args])
  await git('init', '-q', '-b', 'main', '.')
  await git('config', 'user.email', 't@example.invalid')
  await git('config', 'user.name', 'test')
  writeFileSync(join(origin, 'f.txt'), 'one\n')
  writeFileSync(join(origin, 'untouched.txt'), 'quiet\n')
  await git('add', '-A')
  await git('commit', '-qm', 'base')
  await git('checkout', '-qb', 'artifact')
  writeFileSync(join(origin, 'f.txt'), 'the artifact\n')
  await git('commit', '-qam', 'artifact')
  await git('checkout', '-q', 'main')
  writeFileSync(join(origin, 'f.txt'), 'the base moved\n')
  writeFileSync(join(origin, 'added-on-main.txt'), 'new\n')
  await git('add', '-A')
  await git('commit', '-qm', 'base moved')

  const clone = tempDir('igor-tree-clone-')
  await run('git', ['clone', '-q', '--depth', '1', '--branch', 'artifact', `file://${origin}`, clone])
  return { clone, origin }
}

describe('bringing a base into an artifact tree', () => {
  it('deepens a shallow clone rather than refusing the merge for want of an ancestor', async () => {
    // A depth-1 clone shares no ancestor with anything, so git declines the merge outright
    // instead of conflicting on it — and the worker would be handed an error rather than the
    // files it is there for.
    const { clone } = await conflicting()
    expect((await run('git', ['-C', clone, 'rev-parse', '--is-shallow-repository'])).stdout.trim()).toBe('true')

    const merge = await new ClonedTree(clone, 'o/r').merge('main')
    expect(merge.conflicts).toEqual(['f.txt'])
    expect(merge.head).not.toBe(merge.broughtIn)
  })

  it('leaves the conflict in the tree, and everything the merge brought in beside it', async () => {
    // What escalates is files with markers in them. The worker is handed that and nothing
    // else — no branch, no remote, no commit to make.
    const { clone } = await conflicting()
    const tree = new ClonedTree(clone, 'o/r')
    await tree.merge('main')

    const changed = await tree.changes()
    const conflicted = changed.find((c) => c.path === 'f.txt')
    expect(conflicted?.content).toContain('<<<<<<<')
    expect(conflicted?.content).toContain('the base moved')
    // The merge stages what it brought in cleanly too, and the resolution has to carry it:
    // publishing only the conflicted file would drop the rest of the base's commit.
    expect(changed.map((c) => c.path).sort()).toEqual(['added-on-main.txt', 'f.txt'])
    expect(changed.find((c) => c.path === 'untouched.txt')).toBeUndefined()
  })

  it('does not commit, so the tree holds the merge and nothing else does', async () => {
    // The loop publishes. A local commit would need an identity nobody configured, and would
    // put a second copy of the resolution somewhere only this disposable clone can see.
    const { clone } = await conflicting()
    await new ClonedTree(clone, 'o/r').merge('main')
    const head = await run('git', ['-C', clone, 'rev-parse', 'HEAD'])
    const artifact = await run('git', ['-C', clone, 'rev-parse', 'artifact'])
    expect(head.stdout.trim()).toBe(artifact.stdout.trim())
  })

  it('reports a clean merge as no conflicts at all', async () => {
    const { clone, origin } = await conflicting()
    await run('git', ['-C', origin, 'checkout', '-q', 'main'])
    writeFileSync(join(origin, 'f.txt'), 'one\n')
    await run('git', ['-C', origin, 'commit', '-qam', 'put it back'])

    const merge = await new ClonedTree(clone, 'o/r').merge('main')
    expect(merge.conflicts).toEqual([])
  })

  it('throws when the merge failed for a reason that is not a conflict', async () => {
    // Only unmerged paths make a non-zero exit a conflict. A caller that read every failure
    // as one would hand a worker a tree with nothing wrong in it.
    const { clone } = await conflicting()
    await expect(new ClonedTree(clone, 'o/r').merge('no-such-branch')).rejects.toThrow()
  })
})

describe('what a rename and a file mode survive', () => {
  it('reports the path a rename came from as deleted', async () => {
    // Porcelain reports a rename as *two* NUL-separated records — the new path, then the
    // original alone. Read as a status line the second is a path sliced out of the middle of
    // a filename, so the original is reported as neither changed nor deleted. A resolution
    // lays its files over the tree the branch already has, so the branch then carries the
    // file at both paths — and with the base recorded as a parent, git never asks again.
    const dir = await repo()
    await run('git', ['-C', dir, 'mv', 'tracked.md', 'renamed.md'])

    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed).toEqual([
      { path: 'tracked.md', content: '', kind: 'deleted' },
      { path: 'renamed.md', content: 'before\n', kind: 'modified' },
    ])
  })

  it('does not invent a file out of the second record of a rename', async () => {
    const dir = await repo()
    await run('git', ['-C', dir, 'mv', 'tracked.md', 'renamed.md'])
    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed.map((c) => c.path)).not.toContain('acked.md')
  })

  it('reports an executable file as executable', async () => {
    // Only a resolution reads this, and only because it lays blobs over a tree the branch
    // already has: every entry written `100644` takes the bit off a script that had one.
    const dir = await repo()
    writeFileSync(join(dir, 'run.sh'), '#!/bin/sh\necho hi\n', { mode: 0o755 })
    writeFileSync(join(dir, 'plain.md'), 'text\n')

    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed.find((c) => c.path === 'run.sh')?.executable).toBe(true)
    expect(changed.find((c) => c.path === 'plain.md')?.executable).toBeUndefined()
  })
})

describe('a conflict where one side deleted the file', () => {
  /** The base removes a file the artifact's branch edited — an ordinary delete/modify merge. */
  async function deleteModify(): Promise<string> {
    const origin = tempDir('igor-tree-dm-')
    const git = (...args: string[]) => run('git', ['-C', origin, ...args])
    await git('init', '-q', '-b', 'main', '.')
    await git('config', 'user.email', 't@example.invalid')
    await git('config', 'user.name', 'test')
    writeFileSync(join(origin, 'doomed.ts'), 'alpha\n')
    await git('add', '-A')
    await git('commit', '-qm', 'base')
    await git('checkout', '-qb', 'artifact')
    writeFileSync(join(origin, 'doomed.ts'), 'alpha changed\n')
    await git('commit', '-qam', 'edit it')
    await git('checkout', '-q', 'main')
    await git('rm', '-q', 'doomed.ts')
    await git('commit', '-qm', 'delete it')

    const clone = tempDir('igor-tree-dmc-')
    await run('git', ['clone', '-q', '--depth', '1', '--branch', 'artifact', `file://${origin}`, clone])
    return clone
  }

  it('lets the worker accept the deletion by deleting the file', async () => {
    // A delete/modify conflict carries no markers, so the only way a worker can say "honour
    // the deletion" is to remove the file — and an unmerged path whose file is gone was
    // reported as nothing at all, so the resolution kept the artifact's copy and the base's
    // deletion came back the moment the artifact merged.
    const clone = await deleteModify()
    const tree = new ClonedTree(clone, 'o/r')
    const merge = await tree.merge('main')
    expect(merge.conflicts).toContain('doomed.ts')

    rmSync(join(clone, 'doomed.ts'))
    const changed = await tree.changes()
    expect(changed).toEqual([{ path: 'doomed.ts', content: '', kind: 'deleted' }])
  })

  it('still offers the artifact\'s copy where the worker kept it', async () => {
    // Keeping the file is a legitimate resolution of delete/modify, so the other choice has
    // to keep working: the path comes back as content, not as a deletion.
    const clone = await deleteModify()
    const tree = new ClonedTree(clone, 'o/r')
    await tree.merge('main')

    const changed = await tree.changes()
    expect(changed).toEqual([{ path: 'doomed.ts', content: 'alpha changed\n', kind: 'modified' }])
  })
})

describe('what the worker deletes on top of a merge', () => {
  /**
   * A merge that conflicts on one file and stages the base's change to another cleanly —
   * which is the ordinary shape, and the one where the worker has a second file to decide on.
   */
  async function conflictPlusCleanEdit(): Promise<string> {
    const origin = tempDir('igor-tree-md-')
    const git = (...args: string[]) => run('git', ['-C', origin, ...args])
    await git('init', '-q', '-b', 'main', '.')
    await git('config', 'user.email', 't@example.invalid')
    await git('config', 'user.name', 'test')
    writeFileSync(join(origin, 'f.txt'), 'one\n')
    writeFileSync(join(origin, 'also.txt'), 'the base had this\n')
    await git('add', '-A')
    await git('commit', '-qm', 'base')
    await git('checkout', '-qb', 'artifact')
    writeFileSync(join(origin, 'f.txt'), 'the artifact\n')
    await git('commit', '-qam', 'artifact')
    await git('checkout', '-q', 'main')
    writeFileSync(join(origin, 'f.txt'), 'the base moved\n')
    writeFileSync(join(origin, 'also.txt'), 'the base rewrote this\n')
    await git('commit', '-qam', 'base moved')

    const clone = tempDir('igor-tree-mdc-')
    await run('git', ['clone', '-q', '--depth', '1', '--branch', 'artifact', `file://${origin}`, clone])
    return clone
  }

  it('reports a file the merge staged and the worker then removed as deleted', async () => {
    // Porcelain reads `MD`: the index holds the merge's version, the work tree holds nothing.
    // Named in neither the deleted statuses nor the unmerged ones, the read throws and the
    // record is dropped — so the path is in neither `files` nor `deletions`, the resolution
    // leaves the artifact's own older copy in the tree, and with the base recorded as a
    // parent the base's rewrite of that file is reverted the moment the artifact merges.
    const clone = await conflictPlusCleanEdit()
    const tree = new ClonedTree(clone, 'o/r')
    const merge = await tree.merge('main')
    expect(merge.conflicts).toEqual(['f.txt'])

    rmSync(join(clone, 'also.txt'))
    const changed = await tree.changes()
    expect(changed.find((c) => c.path === 'also.txt')).toEqual({
      path: 'also.txt',
      content: '',
      kind: 'deleted',
    })
  })
})
