import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach } from 'vitest'

/**
 * A temp directory that is actually removed afterwards.
 *
 * Every helper here used to `mkdtempSync` and leave it, so a suite run stranded a directory per
 * test. Measured on a development machine before this existed: 5,485 of them, the oldest months
 * old. Nothing swept them — `sweepAbandonedTrees` only reclaims what the clone provider makes,
 * and correctly refuses to touch anything else.
 */

const made: string[] = []

export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  made.push(dir)
  return dir
}

afterEach(() => {
  while (made.length > 0) {
    const dir = made.pop()
    if (dir !== undefined) rmSync(dir, { recursive: true, force: true })
  }
})
