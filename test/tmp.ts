import { cpSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach } from 'vitest'

/**
 * A temp directory that is removed after the test that made it.
 *
 * Make test directories with this, never with a bare `mkdtempSync`, which leaves one directory
 * behind per test. A development machine whose test helpers did that held 5,485 of them, the
 * oldest months old. Nothing else removes them: `sweepAbandonedTrees` reclaims only what the
 * clone provider makes, and correctly refuses to touch anything else.
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

/**
 * `templated(build)` returns a function that hands out fresh copies of one directory. `build`
 * fills that directory the first time a copy is asked for, once per test file. Use it in a file
 * that needs the same repository many times: each `git` a fixture spawns is a process the suite
 * waits on, and a copy spawns none. Each copy is a `tempDir`, removed after its test; the
 * original is removed after the file.
 *
 * Only for a fixture whose contents do not depend on where it lives: a repository that
 * records its own path, such as a clone of a sibling directory, still points at the original.
 */
export function templated(build: (dir: string) => void): (prefix: string) => string {
  let template: string | undefined
  afterAll(() => {
    if (template !== undefined) rmSync(template, { recursive: true, force: true })
  })
  return (prefix) => {
    if (template === undefined) {
      const built = mkdtempSync(join(tmpdir(), 'igor-template-'))
      try {
        build(built)
      } catch (error) {
        rmSync(built, { recursive: true, force: true })
        throw error
      }
      template = built
    }
    const dir = tempDir(prefix)
    cpSync(template, dir, { recursive: true })
    return dir
  }
}
