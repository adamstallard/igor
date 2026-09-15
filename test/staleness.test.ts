import { mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isStale, newestUnder, staleBuildWarning } from '../src/staleness.js'
import { tempDir } from './tmp.js'

function build(distAgeMs: number, srcAgeMs: number): string {
  const root = tempDir('igor-stale-')
  mkdirSync(join(root, 'dist'))
  mkdirSync(join(root, 'src', 'nested'), { recursive: true })
  writeFileSync(join(root, 'dist', 'cli.js'), '')
  writeFileSync(join(root, 'src', 'nested', 'thing.ts'), '')
  const now = Date.now()
  const stamp = (p: string, ago: number) => utimesSync(p, new Date(now - ago), new Date(now - ago))
  stamp(join(root, 'dist', 'cli.js'), distAgeMs)
  stamp(join(root, 'src', 'nested', 'thing.ts'), srcAgeMs)
  return root
}

describe('noticing a stale build', () => {
  it('says so when the source is newer than what was built', () => {
    // Twelve hours of it went unnoticed because both outputs looked correct.
    expect(staleBuildWarning(build(3 * 3_600_000, 0))).toMatch(/older than the source.*by 3\.0h/)
  })

  it('states the fact without an age it cannot express', () => {
    // "older by 0m" reads as a contradiction; being behind at all is the message.
    const warning = staleBuildWarning(build(1_000, 0))
    expect(warning).toMatch(/older than the source it came from —/)
  })

  it('says nothing when the build is current', () => {
    expect(staleBuildWarning(build(0, 60_000))).toBeUndefined()
  })

  it('says nothing where there is no source, which is a published package', () => {
    const root = tempDir('igor-stale-')
    mkdirSync(join(root, 'dist'))
    writeFileSync(join(root, 'dist', 'cli.js'), '')
    expect(staleBuildWarning(root)).toBeUndefined()
  })

  it('looks below the top of the source tree', () => {
    // Everything but the entry point lives in subdirectories; a shallow scan would miss a
    // change to any of it.
    const root = build(3_600_000, 0)
    expect(newestUnder(join(root, 'src'))).toBeGreaterThan(0)
  })

  it('needs both sides before it claims anything', () => {
    expect(isStale(undefined, Date.now())).toBe(false)
    expect(isStale(Date.now(), undefined)).toBe(false)
  })
})
