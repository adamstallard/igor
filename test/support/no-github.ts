import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Keeps every test away from GitHub. vitest.config.ts registers this file in `setupFiles`, so it
 * runs before each test file; renaming or moving it without updating that entry turns it off.
 *
 * gh.ts runs the `gh` CLI. Without this file, a test whose code calls gh.ts without stubbing it
 * or PATH runs the real `gh`, which acts on GitHub as whoever is logged in. The line below puts
 * gh-shim/ at the front of PATH instead. The `gh` there prints the call to stderr and exits 1, so
 * the calling code gets an error; a test whose code ignores that error still passes. A developer
 * can set GH_SHIM_LOG to a file path before running the suite, and the shim then appends each
 * refused call's arguments to that file, one line per call, to show which tests reach `gh`.
 *
 * The shim goes on PATH once, before any test runs, so a test that later puts its own fake `gh`
 * in front of PATH still runs its fake.
 *
 * The token variables are deleted too, so no code under test can read one and call GitHub
 * without going through `gh`.
 */

const shim = join(dirname(fileURLToPath(import.meta.url)), 'gh-shim')
process.env.PATH = `${shim}${delimiter}${process.env.PATH ?? ''}`

for (const name of ['GH_TOKEN', 'GITHUB_TOKEN', 'GH_ENTERPRISE_TOKEN', 'GITHUB_ENTERPRISE_TOKEN']) delete process.env[name]
