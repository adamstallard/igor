import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../src/', import.meta.url))

/** From one `spawn(` to the next: where that child's own handlers are registered. */
const spawnBlocks = (source: string): string[] => source.split('spawn(').slice(1)

const sources = (): string[] =>
  readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(SRC, name))

/**
 * The block with its comments taken out. A warning about a shape names that shape, and this file
 * asks for such warnings — read as code, the warning answers for the handler beneath it.
 */
const code = (block: string): string =>
  block.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

/** Where this pipe's `data` handler is registered, up to whatever the block registers next. */
function handler(block: string, pipe: string): string | undefined {
  const at = block.search(new RegExp(`\\.${pipe}\\s*\\.on\\(\\s*['"\`]data`))
  if (at === -1) return undefined
  const on = block.indexOf('.on(', at)
  const next = block.indexOf('.on(', on + 4)
  return block.slice(on, next === -1 ? undefined : next)
}

/**
 * What one `spawn(` block does with each pipe it reads. `perChunk` is the failure — a handler
 * that decodes each chunk as it arrives.
 *
 * Collecting counts only where the concatenation names the very array the handler filled:
 * another pipe's `Buffer.concat`, one over an array whose name merely starts the same, and a
 * `join('')` over the chunks are each a decode per chunk or a licence borrowed from a handler
 * that is not this one. A safe shape that is neither `setEncoding` nor `push` plus
 * `Buffer.concat` reads as a failure here, and belongs in this function before it belongs in
 * `src`.
 */
function pipeReads(source: string): { pipe: string; perChunk: boolean }[] {
  const block = code(source)
  const reads: { pipe: string; perChunk: boolean }[] = []
  for (const pipe of ['stdout', 'stderr']) {
    const body = handler(block, pipe)
    if (body === undefined) continue
    const decoded = block.includes(`.${pipe}.setEncoding(`)
    const held = /([\w.?[\]]+?)\s*\.push\(/.exec(body)
    const concat =
      held === null
        ? undefined
        : new RegExp(`Buffer\\.concat\\(\\s*${held[1]!.replace(/[.?[\]]/g, '\\$&')}\\s*[),.]`)
    reads.push({ pipe, perChunk: !decoded && (concat === undefined || !concat.test(block)) })
  }
  return reads
}

describe('every child this repository spawns', () => {
  it('never concatenates a decoded chunk', () => {
    // A `data` chunk is a Buffer, and `text += chunk` decodes it alone — so a multi-byte
    // character the pipe split across two chunks becomes replacement characters on both sides of
    // the boundary. Nothing throws: the text is legal JSON and legal to print, just wrong.
    //
    // Either way out counts: `setEncoding`, which decodes the stream through one stateful
    // decoder, or keeping the chunks as Buffers and decoding the concatenation once. Proved
    // through a real pipe in `gh.test.ts`, `triage.test.ts` and `worktree.test.ts`; asserted
    // here for the rest, and for the next spawn somebody adds.
    const read: string[] = []
    const perChunk: string[] = []
    for (const path of sources()) {
      spawnBlocks(readFileSync(path, 'utf8')).forEach((block, index) => {
        for (const site of pipeReads(block)) {
          const where = `${path.slice(SRC.length)} spawn #${index + 1}: ${site.pipe}`
          read.push(where)
          if (site.perChunk) perChunk.push(where)
        }
      })
    }
    expect(perChunk).toEqual([])
    // A scan that finds nothing agrees with a scan that finds nothing wrong. Every pipe read in
    // `src` today is counted here, so a drop means the scan stopped seeing them.
    expect(read.length).toBeGreaterThanOrEqual(13)
  })

  it('reads a handler whose body runs over several lines', () => {
    // The one `data` handler in `src/` that cannot be a one-liner splits its chunks into lines
    // as they arrive. Collected as Buffers it is correct, and a scan that stops at the end of a
    // line calls it a per-chunk decode and turns the suite red on good code.
    const block = [
      "cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })",
      '    const held: Buffer[] = []',
      "    child.stdout.on('data', (chunk: Buffer) => {",
      '      held.push(chunk)',
      '    })',
      "    child.on('close', () => resolve(Buffer.concat(held).toString('utf8')))",
    ].join('\n')
    expect(pipeReads(block).filter((r) => r.perChunk)).toEqual([])
  })

  it('catches chunks collected as Buffers and then decoded one at a time', () => {
    // `out.join('')` stringifies each Buffer on its own, which is the per-chunk decode wearing
    // the shape of a safe one. The other pipe's `Buffer.concat` is not a licence for this one.
    const block = [
      "cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })",
      '    const out: Buffer[] = []',
      '    const err: Buffer[] = []',
      "    child.stdout.on('data', (c: Buffer) => out.push(c))",
      "    child.stderr.on('data', (c: Buffer) => err.push(c))",
      "    child.on('close', () => resolve(Buffer.from(out.join('')), Buffer.concat(err)))",
    ].join('\n')
    expect(pipeReads(block).filter((r) => r.perChunk).map((r) => r.pipe)).toEqual(['stdout'])
  })

  it('reads the code and not the comments around it', () => {
    // A warning about the shape to avoid names that shape, and this file writes such warnings.
    // Scanned as code, the comment answers for the handler underneath it — and answers the same
    // whether that handler is right or wrong.
    const broken = [
      "cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })",
      "    // Not `child.stdout.setEncoding('utf8')`: bytes in, one decode at the end.",
      "    let out = ''",
      "    child.stdout.on('data', (c) => (out += c))",
    ].join('\n')
    expect(pipeReads(broken).filter((r) => r.perChunk).map((r) => r.pipe)).toEqual(['stdout'])

    const sound = [
      "cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })",
      "    // Never `child.stdout.on('data', (c) => (out += c))`: that decodes each chunk alone.",
      '    const out: Buffer[] = []',
      "    child.stdout.on('data', (c: Buffer) => out.push(c))",
      "    child.on('close', () => resolve(Buffer.concat(out)))",
    ].join('\n')
    expect(pipeReads(sound).filter((r) => r.perChunk)).toEqual([])
  })

  it('follows chunks into an array held somewhere other than a local', () => {
    const block = [
      "cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })",
      "    child.stdout.on('data', (c: Buffer) => this.out.push(c))",
      "    child.on('close', () => resolve(Buffer.concat(this.out)))",
    ].join('\n')
    expect(pipeReads(block).filter((r) => r.perChunk)).toEqual([])
  })

  it('does not take a concatenation of another array whose name starts the same', () => {
    const block = [
      "cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })",
      '    const out: Buffer[] = []',
      '    const outErr: Buffer[] = []',
      "    child.stdout.on('data', (c: Buffer) => out.push(c))",
      "    child.stderr.on('data', (c: Buffer) => outErr.push(c))",
      "    child.on('close', () => resolve(Buffer.from(out.join('')), Buffer.concat(outErr)))",
    ].join('\n')
    expect(pipeReads(block).filter((r) => r.perChunk).map((r) => r.pipe)).toEqual(['stdout'])
  })

  it('catches one pipe concatenating beside another that collects', () => {
    // The two handlers sit on adjacent lines and share one `Buffer.concat`, so a scan that reads
    // the block rather than the line finds everything it is looking for in the wrong handler.
    const block = [
      "cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })",
      "    let out = ''",
      '    const err: Buffer[] = []',
      "    child.stdout.on('data', (c) => (out += c))",
      "    child.stderr.on('data', (c: Buffer) => err.push(c))",
      "    child.on('close', () => resolve(Buffer.concat(err)))",
    ].join('\n')
    expect(pipeReads(block).filter((r) => r.perChunk).map((r) => r.pipe)).toEqual(['stdout'])
  })
})
