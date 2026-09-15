import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { igorRoot } from './config.js'

/**
 * Whether the built CLI predates the source it was built from.
 *
 * `bin.igor` points at `dist/cli.js` and nothing rebuilds it, so after a pull `igor` runs
 * whatever was last compiled. Measured once at twelve hours stale, and the only reason it was
 * noticed is that `role explain` printed a setting removed that morning — stale output is not
 * wrong-looking output, which is what makes it worth saying out loud.
 *
 * Only a checkout can have this problem: a published package ships `dist` with no `src` beside
 * it, so the check finds nothing and says nothing. That is why this warns rather than running
 * from source, which would cost every invocation in production to fix a development problem.
 */

/** Newest modification time under a directory, or undefined where there is nothing to read. */
export function newestUnder(dir: string): number | undefined {
  let newest: number | undefined
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return undefined
  }
  for (const entry of entries) {
    const path = join(dir, entry.name)
    const at = entry.isDirectory() ? newestUnder(path) : safeMtime(path)
    if (at !== undefined && (newest === undefined || at > newest)) newest = at
  }
  return newest
}

function safeMtime(path: string): number | undefined {
  try {
    return statSync(path).mtimeMs
  } catch {
    return undefined
  }
}

/** Pure, so the rule is testable without a build. Absent either side means nothing to say. */
export function isStale(builtMs: number | undefined, sourceMs: number | undefined): boolean {
  return builtMs !== undefined && sourceMs !== undefined && sourceMs > builtMs
}

export function staleBuildWarning(root: string = igorRoot()): string | undefined {
  const built = safeMtime(join(root, 'dist', 'cli.js'))
  const source = newestUnder(join(root, 'src'))
  if (!isStale(built, source)) return undefined
  const minutes = ((source as number) - (built as number)) / 60_000
  // Silent about an age it cannot state usefully: "built 0m before the source" reads as a
  // contradiction, and the fact that it is behind is the whole message.
  const age = minutes < 1 ? '' : minutes < 60 ? ` by ${Math.round(minutes)}m` : ` by ${(minutes / 60).toFixed(1)}h`
  return `this igor is older than the source it came from${age} — run \`npm run build\``
}
