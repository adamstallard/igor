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

describe('every child this repository spawns', () => {
  it('decodes each pipe it reads, rather than concatenating raw chunks', () => {
    // A `data` chunk is a Buffer, and `text += chunk` decodes it alone — so a multi-byte
    // character the pipe split across two chunks becomes replacement characters on both sides of
    // the boundary. Nothing throws: the text is legal JSON and legal to print, just wrong. Proved
    // through a real pipe in `gh.test.ts` and `triage.test.ts`; asserted here for the rest, and
    // for the next spawn somebody adds.
    const read: string[] = []
    const undecoded: string[] = []
    for (const path of sources()) {
      spawnBlocks(readFileSync(path, 'utf8')).forEach((block, index) => {
        for (const pipe of ['stdout', 'stderr']) {
          const site = `${path.slice(SRC.length)} spawn #${index + 1}: ${pipe}`
          if (!new RegExp(`\\.${pipe}\\s*\\.on\\(\\s*['"\`]data`).test(block)) continue
          read.push(site)
          if (!block.includes(`.${pipe}.setEncoding(`)) undecoded.push(site)
        }
      })
    }
    expect(undecoded).toEqual([])
    // A scan that finds nothing agrees with a scan that finds nothing wrong. Every pipe read in
    // `src` today is counted here, so a drop means the scan stopped seeing them.
    expect(read.length).toBeGreaterThanOrEqual(13)
  })
})
