import { execFile, execFileSync } from 'node:child_process'
import { mkdirSync, renameSync, rmSync, unlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  blobSha, carried, ClonedTree, named, quoteName, showName, statusRecords, type BaseChange,
} from '../src/worktree.js'
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

  it('offers the commit it was cut from, and still offers it once the merge is in', async () => {
    // What an artifact is laid over. Re-read from the base branch at publish time it is a
    // different sha whenever the branch moved during the run, and a removal of a path that sha
    // no longer holds is refused with `422 GitRPC::BadObjectState` — the whole tree request.
    const { clone, origin } = await conflicting()
    const tree = new ClonedTree(clone, 'o/r')
    const cutFrom = (await run('git', ['-C', origin, 'rev-parse', 'artifact'])).stdout.trim()
    expect(await tree.head()).toBe(cutFrom)

    await tree.merge('main')
    unlinkSync(join(clone, 'untouched.txt'))
    expect(await tree.head()).toBe(cutFrom)
  })

  it('reports a clean merge as no conflicts at all', async () => {
    const { clone, origin } = await conflicting()
    await run('git', ['-C', origin, 'checkout', '-q', 'main'])
    writeFileSync(join(origin, 'f.txt'), 'one\n')
    await run('git', ['-C', origin, 'commit', '-qam', 'put it back'])

    const merge = await new ClonedTree(clone, 'o/r').merge('main')
    expect(merge.conflicts).toEqual([])
  })

  it('reports what the base changed since the merge base, on all three sides', async () => {
    // The comparison a resolution is checked against needs three blobs per path, and a
    // released tree can answer for none of them — so they are read here, where the merge is.
    const { clone, origin } = await conflicting()
    const git = (...args: string[]) => run('git', ['-C', origin, ...args])
    await git('rm', '-q', 'untouched.txt')
    await git('commit', '-qm', 'the base removed a file')

    const merge = await new ClonedTree(clone, 'o/r').merge('main')
    const change = (path: string): BaseChange | undefined => merge.baseChanges.find((c) => c.path === path)

    // A path both sides rewrote: what stood before, what the base holds, what this branch holds.
    expect(change('f.txt')).toEqual({
      path: 'f.txt',
      before: blobSha('one\n'),
      after: blobSha('the base moved\n'),
      head: blobSha('the artifact\n'),
    })
    // An addition has no side before it, and this branch does not hold it either.
    expect(change('added-on-main.txt')).toEqual({ path: 'added-on-main.txt', after: blobSha('new\n') })
    // A deletion has no side after it, and head still holds what the merge base held —
    // which is the whole of what makes keeping the file a revert rather than a resolution.
    expect(change('untouched.txt')).toEqual({
      path: 'untouched.txt',
      before: blobSha('quiet\n'),
      head: blobSha('quiet\n'),
    })
    expect(merge.baseChanges).toHaveLength(3)
  })

  it('says nothing about a path only the artifact branch changed', async () => {
    // The question is what the base did. A path this branch alone touched can revert nothing.
    const { clone, origin } = await conflicting()
    await run('git', ['-C', origin, 'checkout', '-q', 'artifact'])
    writeFileSync(join(origin, 'ours-only.txt'), 'ours\n')
    await run('git', ['-C', origin, 'add', '-A'])
    await run('git', ['-C', origin, 'commit', '-qm', 'ours alone'])
    await run('git', ['-C', clone, 'fetch', '-q', 'origin', 'artifact'])
    await run('git', ['-C', clone, 'reset', '-q', '--hard', 'FETCH_HEAD'])

    const merge = await new ClonedTree(clone, 'o/r').merge('main')
    expect(merge.baseChanges.map((c) => c.path)).not.toContain('ours-only.txt')
  })

  it('reads a rename the base made as the two paths it publishes as', async () => {
    // Rename detection folds two changed paths into one record, and the old path is exactly
    // the one a resolution can restore. Off, it arrives as its own deletion.
    const { clone, origin } = await conflicting()
    const git = (...args: string[]) => run('git', ['-C', origin, ...args])
    await git('mv', 'untouched.txt', 'moved.txt')
    await git('commit', '-qm', 'the base moved a file')

    const merge = await new ClonedTree(clone, 'o/r').merge('main')
    const paths = merge.baseChanges.map((c) => c.path).sort()
    expect(paths).toContain('untouched.txt')
    expect(paths).toContain('moved.txt')
    expect(merge.baseChanges.find((c) => c.path === 'untouched.txt')?.after).toBeUndefined()
    expect(merge.baseChanges.find((c) => c.path === 'moved.txt')?.before).toBeUndefined()
  })

  it("reports a merge git refused to attempt in git's own words", async () => {
    // Anything read off the two commits has to come after the merge: `merge-base` on unrelated
    // histories exits non-zero with an empty stderr, so asking it first replaces the sentence
    // that says what is wrong with an exit code.
    const { clone, origin } = await conflicting()
    const git = (...args: string[]) => run('git', ['-C', origin, ...args])
    await git('checkout', '-q', '--orphan', 'unrelated')
    await git('rm', '-rqf', '.')
    writeFileSync(join(origin, 'elsewhere.txt'), 'a history of its own\n')
    await git('add', '-A')
    await git('commit', '-qm', 'unrelated')

    await expect(new ClonedTree(clone, 'o/r').merge('unrelated')).rejects.toThrow(/unrelated histories/)
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

    // Read with `--no-renames`, so the two paths arrive as git's own records in git's own
    // order — `A  renamed.md` before `D  tracked.md` — rather than as a pair the parser
    // unfolded deletion-first. The destination is `added` rather than `modified` because its
    // index column really is `A`; under the pairing it carried `R`, which is neither, and fell
    // to the `modified` default. Nothing downstream distinguishes the two: `carried()` asks
    // only whether a change is `deleted`.
    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed).toEqual([
      { path: 'renamed.md', content: 'before\n', kind: 'added' },
      { path: 'tracked.md', content: '', kind: 'deleted' },
    ])
  })

  it('does not invent a file out of the second record of a rename', async () => {
    const dir = await repo()
    await run('git', ['-C', dir, 'mv', 'tracked.md', 'renamed.md'])
    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed.map((c) => c.path)).not.toContain('acked.md')
  })

  it('reports the old path of a rename the index has not staged as deleted', async () => {
    // Porcelain is `XY`: the index column and the work tree one. A rename whose destination is
    // in the index as intent-to-add and whose source deletion is unstaged reads ` R`, and the
    // two-path form is the same — `git add -N -- $(git ls-files -o --exclude-standard)`, the
    // idiom for making `git diff` show new files, is what produces it.
    //
    // The old path is named `ADR-001.md` because reading the second record as a status line
    // takes its first two bytes for flags: `AD` is a deletion by shape, so the miss does not
    // merely drop the old path, it publishes a removal of `-001.md`, which no worker named and
    // no tree has.
    const dir = await repo()
    writeFileSync(join(dir, 'ADR-001.md'), 'decision\n')
    await run('git', ['-C', dir, 'add', 'ADR-001.md'])
    await run('git', ['-C', dir, 'commit', '-qm', 'adr'])
    renameSync(join(dir, 'ADR-001.md'), join(dir, 'NEW-001.md'))
    await run('git', ['-C', dir, 'add', '-N', 'NEW-001.md'])

    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed).toEqual([
      { path: 'ADR-001.md', content: '', kind: 'deleted' },
      { path: 'NEW-001.md', content: 'decision\n', kind: 'added' },
    ])
  })


  it('leaves the source of a copy in place rather than deleting it', async () => {
    // A copy is the one two-path shape whose source is still there, so the pair is read for the
    // name it came from and no removal is owed. `status.renames=copies` is what makes git look
    // for one, and it only looks at sources the same change touched.
    const dir = await repo()
    writeFileSync(join(dir, 'tracked.md'), 'aaa\nbbb\nccc\nddd\neee\n')
    await run('git', ['-C', dir, 'commit', '-qam', 'longer'])
    await run('git', ['-C', dir, 'config', 'status.renames', 'copies'])
    writeFileSync(join(dir, 'copy.md'), 'aaa\nbbb\nccc\nddd\neee\n')
    writeFileSync(join(dir, 'tracked.md'), 'aaa\nbbb\nccc\nddd\neee\nfff\n')
    await run('git', ['-C', dir, 'add', '-A'])

    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed.filter((c) => c.kind === 'deleted')).toEqual([])
    expect(changed.map((c) => c.path).sort()).toEqual(['copy.md', 'tracked.md'])
  })

  it('owes no removal for a rename source only the index ever had', async () => {
    // A work tree column rename names its source as the **index** holds it, not as HEAD does.
    // A merge brings a rename in fully staged, and a worker that moves that file again with an
    // ordinary `mv` leaves the merge's own destination as the source of the second pair — a
    // path no tree has. Removing it lays an entry with no blob over a base that never had one.
    const dir = await repo()
    await run('git', ['-C', dir, 'mv', 'tracked.md', 'staged.md'])
    renameSync(join(dir, 'staged.md'), join(dir, 'final.md'))
    await run('git', ['-C', dir, 'add', '-N', 'final.md'])

    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed.filter((c) => c.kind === 'deleted').map((c) => c.path)).toEqual(['tracked.md'])
    expect(changed.find((c) => c.path === 'final.md')?.content).toBe('before\n')
  })

  it('owes no removal for a file the worker staged and then moved', async () => {
    // The same rule through the index column's `A`: the source of the pair is a path the worker
    // created inside this change, so nothing in the base tree is owed a removal at all.
    const dir = await repo()
    writeFileSync(join(dir, 'draft.md'), 'draft\n')
    await run('git', ['-C', dir, 'add', 'draft.md'])
    renameSync(join(dir, 'draft.md'), join(dir, 'final.md'))
    await run('git', ['-C', dir, 'add', '-N', 'final.md'])

    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed.filter((c) => c.kind === 'deleted')).toEqual([])
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

describe('what of a change an artifact can carry', () => {
  it('keeps a removal whose path nothing writes back', () => {
    const { written, removed } = carried([
      { path: 'src/a.ts', content: 'edited', kind: 'modified' },
      { path: 'src/gone.ts', content: '', kind: 'deleted' },
    ])
    expect(written.map((c) => c.path)).toEqual(['src/a.ts'])
    expect(removed).toEqual(['src/gone.ts'])
  })

  it('drops a removal whose path is written again', () => {
    // A tree carries each path once. A removal sent beside its own blob either takes the file
    // out of the artifact or has the host reject the tree, and neither is what happened.
    const { written, removed } = carried([
      { path: 'src/old.ts', content: '', kind: 'deleted' },
      { path: 'src/new.ts', content: 'moved', kind: 'modified' },
      { path: 'src/old.ts', content: 'export * from "./new.js"', kind: 'added' },
    ])
    expect(written.map((c) => c.path)).toEqual(['src/new.ts', 'src/old.ts'])
    expect(removed).toEqual([])
  })
})

describe('a fold cannot lose a removal', () => {
  /**
   * Two files similar enough for rename detection to pair them, one left unmerged by a
   * modify/delete conflict. With detection on, git reports the pair as a rename of the
   * unmerged path and the worker's deletion is **absent from the output** — not misread in it,
   * gone. Nothing downstream can recover a path that was never read.
   */
  async function twoSimilarFilesOneConflicted(): Promise<string> {
    const origin = tempDir('igor-fold-origin-')
    const git = (...a: string[]): Promise<unknown> => run('git', ['-C', origin, ...a])
    await git('init', '-q', '.')
    await git('config', 'user.email', 't@example.invalid')
    await git('config', 'user.name', 'test')
    const body = Array.from({ length: 40 }, (_, n) => `line ${n} of a shared body`).join('\n')
    writeFileSync(join(origin, 'one.md'), `${body}\n`)
    writeFileSync(join(origin, 'two.md'), `${body}\n`)
    await git('add', '-A')
    await git('commit', '-qm', 'base')
    await git('checkout', '-qb', 'artifact')
    writeFileSync(join(origin, 'one.md'), `${body}\nthe artifact\n`)
    await git('commit', '-qam', 'artifact')
    await git('checkout', '-q', 'main')
    rmSync(join(origin, 'one.md'))
    await git('commit', '-qam', 'base deleted it')

    const clone = tempDir('igor-fold-clone-')
    await run('git', ['clone', '-q', '--branch', 'artifact', `file://${origin}`, clone])
    return clone
  }

  it('reports the worker deleting one of two similar files, with the other unmerged', async () => {
    const clone = await twoSimilarFilesOneConflicted()
    const tree = new ClonedTree(clone, 'o/r')
    await tree.merge('main')

    rmSync(join(clone, 'two.md'))
    const changed = await tree.changes()

    expect(changed.find((c) => c.path === 'two.md')).toEqual({
      path: 'two.md',
      content: '',
      kind: 'deleted',
    })

    // And it survives into what the publish path is handed: `carried()` is the seam between the
    // read and the tree request, so a removal that reaches `removed` is a removal the artifact
    // carries. Asserting only on `changes()` would leave the fold able to reappear one layer down.
    expect(carried(changed).removed).toContain('two.md')
  })

  it('owes no removal of the intermediate name in a chain rename', async () => {
    // `AD b.md` is a path the run's own index invented: HEAD never held it, and neither does
    // the tree the artifact is laid over. Publishing a removal of it returns 422 on the whole
    // tree request, so nothing publishes — not even the changes that were correct.
    const dir = await repo()
    await run('git', ['-C', dir, 'mv', 'tracked.md', 'b.md'])
    renameSync(join(dir, 'b.md'), join(dir, 'c.md'))
    await run('git', ['-C', dir, 'add', '-N', 'c.md'])

    const changed = await new ClonedTree(dir, 'o/r').changes()
    const paths = changed.map((c) => c.path)

    expect(changed.find((c) => c.path === 'tracked.md')?.kind).toBe('deleted')
    expect(paths).toContain('c.md')
    expect(paths).not.toContain('b.md')
  })

  it('leaves no duplicate path for a staged or an unstaged rename', async () => {
    const staged = await repo()
    await run('git', ['-C', staged, 'mv', 'tracked.md', 'moved.md'])
    const a = (await new ClonedTree(staged, 'o/r').changes()).map((c) => c.path)
    expect(a).toEqual([...new Set(a)])

    const unstaged = await repo()
    renameSync(join(unstaged, 'tracked.md'), join(unstaged, 'moved.md'))
    await run('git', ['-C', unstaged, 'add', '-N', 'moved.md'])
    const b = (await new ClonedTree(unstaged, 'o/r').changes()).map((c) => c.path)
    expect(b).toEqual([...new Set(b)])
  })

  it('leaves an ordinary mixed change exactly as it was', async () => {
    const dir = await repo()
    writeFileSync(join(dir, 'tracked.md'), 'after\n')
    writeFileSync(join(dir, 'added.md'), 'new\n')
    writeFileSync(join(dir, 'doomed.md'), 'x\n')
    await run('git', ['-C', dir, 'add', 'doomed.md'])
    await run('git', ['-C', dir, 'commit', '-qm', 'doomed'])
    rmSync(join(dir, 'doomed.md'))

    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed.find((c) => c.path === 'tracked.md')?.kind).toBe('modified')
    expect(changed.find((c) => c.path === 'added.md')?.kind).toBe('added')
    expect(changed.find((c) => c.path === 'doomed.md')).toEqual({
      path: 'doomed.md',
      content: '',
      kind: 'deleted',
    })
  })
})

describe('every removal is checked against the tree it is laid over', () => {
  /**
   * The mirror of `deleteModify`: the **artifact** branch drops the file and the base edits it,
   * so the merge leaves `DU` and the copy on disk is the base's. HEAD — the artifact branch —
   * does not hold the path at all.
   */
  async function artifactDeletedBaseModified(): Promise<string> {
    const origin = tempDir('igor-tree-du-')
    const git = (...args: string[]): Promise<unknown> => run('git', ['-C', origin, ...args])
    await git('init', '-q', '-b', 'main', '.')
    await git('config', 'user.email', 't@example.invalid')
    await git('config', 'user.name', 'test')
    writeFileSync(join(origin, 'X.ts'), 'alpha\n')
    writeFileSync(join(origin, 'kept.ts'), 'stays\n')
    await git('add', '-A')
    await git('commit', '-qm', 'base')
    await git('checkout', '-qb', 'artifact')
    await git('rm', '-q', 'X.ts')
    await git('commit', '-qm', 'the artifact drops it')
    await git('checkout', '-q', 'main')
    writeFileSync(join(origin, 'X.ts'), 'alpha, edited by the base\n')
    await git('commit', '-qam', 'the base edits it')

    const clone = tempDir('igor-tree-duc-')
    await run('git', ['clone', '-q', '--depth', '1', '--branch', 'artifact', `file://${origin}`, clone])
    return clone
  }

  it('owes no removal for a path the artifact branch had already deleted', async () => {
    // `DU` — deleted by us, modified by them. `conflictPrompt` tells the worker to "delete it to
    // accept the base's removal", and deleting the base's copy here is the same gesture, so a
    // worker following the instruction reaches this. The unmerged branch of the content read's
    // catch reported it as a deletion without asking about HEAD, and HEAD is what `base_tree`
    // is: the tree API refuses a removal of a path it does not hold with `422
    // GitRPC::BadObjectState`, refusing the whole request, so `kept.ts` would not publish either.
    const clone = await artifactDeletedBaseModified()
    const tree = new ClonedTree(clone, 'o/r')
    const merge = await tree.merge('main')
    expect(merge.conflicts).toEqual(['X.ts'])

    rmSync(join(clone, 'X.ts'))
    writeFileSync(join(clone, 'kept.ts'), 'the worker also did some work\n')
    const changed = await tree.changes()

    expect(changed.filter((c) => c.kind === 'deleted')).toEqual([])
    expect(carried(changed).removed).toEqual([])
    expect(changed.find((c) => c.path === 'kept.ts')?.content).toBe('the worker also did some work\n')
  })

  it('owes no removal for an intent-to-add path deleted before it was committed', async () => {
    // `git add -N n.ts` then deleting the file prints ` D n.ts` — an index column of *space*,
    // byte for byte the shape a tracked file's unstaged deletion has, for a path HEAD has never
    // held. No flag distinguishes the two, and `--porcelain=v2` does not either: it reports
    // `100644` and the empty blob's sha for the intent-to-add path rather than zeros.
    const dir = await repo()
    writeFileSync(join(dir, 'n.ts'), 'never committed\n')
    await run('git', ['-C', dir, 'add', '-N', 'n.ts'])
    unlinkSync(join(dir, 'n.ts'))

    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed).toEqual([])
  })

  it('checks more removals than one command line can carry', async () => {
    // The check is one process per `PATHSPEC_BUDGET` of names rather than one per run, so a
    // change big enough to overflow `ARG_MAX` has to split rather than fail with `E2BIG` — and
    // every batch's answers have to reach the same set, or the removals in the later ones are
    // dropped as paths HEAD does not hold.
    const dir = await repo()
    const many = Array.from({ length: 600 }, (_, n) => `d/${String(n).padStart(4, '0')}-${'x'.repeat(200)}.md`)
    mkdirSync(join(dir, 'd'))
    for (const name of many) writeFileSync(join(dir, name), 'body\n')
    await run('git', ['-C', dir, 'add', '-A'])
    await run('git', ['-C', dir, 'commit', '-qm', 'many'])
    for (const name of many) unlinkSync(join(dir, name))

    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed.filter((c) => c.kind === 'deleted').map((c) => c.path).sort()).toEqual([...many].sort())
  })

  /**
   * Puts `name` into HEAD with those exact bytes. `update-index` is fed from **stdin** because
   * argv is not a byte-exact channel on darwin — git precomposes it, so a decomposed name passed
   * as an argument would land in the tree composed and the fixture would test nothing.
   */
  function commitUnder(dir: string, name: Buffer): void {
    writeFileSync(join(dir, 'blob-source'), 'body\n')
    const blob = execFileSync('git', ['-C', dir, 'hash-object', '-w', 'blob-source']).toString().trim()
    unlinkSync(join(dir, 'blob-source'))
    execFileSync('git', ['-C', dir, 'update-index', '-z', '--index-info'], {
      input: Buffer.concat([Buffer.from(`100644 ${blob}\t`), name, Buffer.from([0])]),
    })
    execFileSync('git', ['-C', dir, 'commit', '-qm', 'under that name'])
  }

  it('checks a decomposed name against the bytes HEAD holds, not the ones git would compose', async () => {
    // **The pathspec is a channel, and darwin normalises it.** `core.precomposeunicode` is on by
    // default there, and git precomposes `argv` before parsing it — so `:(literal)` over a name
    // HEAD holds in decomposed form matches nothing, the check says HEAD lacks a path it has, and
    // a legitimate removal is dropped in silence. On a `UD` path that restores what the base
    // deleted the moment the artifact merges, which is what the first requirement exists against.
    //
    // git honours the setting only on darwin builds, so this is a real red there and green
    // everywhere else; it is set explicitly so the fixture does not depend on the default.
    const dir = await repo()
    await run('git', ['-C', dir, 'config', 'core.precomposeunicode', 'true'])
    const decomposed = Buffer.from('cafe\u0301.md', 'utf8')
    commitUnder(dir, decomposed)

    const changed = await new ClonedTree(dir, 'o/r').changes()
    expect(changed).toEqual([{ path: decomposed.toString('utf8'), content: '', kind: 'deleted' }])
  })

  it('publishes against the commit the tree was cut from, conflicted merge and all', async () => {
    // The check is only the right one while HEAD is what both publishing paths lay their tree
    // over: `commitOnBranch` over `parents[0]`, which is `MergeState.head`, and `produce` over
    // `WorkingTree.head()`. `merge --no-commit` is what keeps the two the same, and a conflict
    // does not move HEAD either — git writes `MERGE_HEAD` and leaves HEAD alone.
    const clone = await artifactDeletedBaseModified()
    const tree = new ClonedTree(clone, 'o/r')
    const merge = await tree.merge('main')

    expect(await tree.head()).toBe(merge.head)
  })
})
