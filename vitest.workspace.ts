import { defineWorkspace } from 'vitest/config'

/**
 * Files whose tests spawn real processes: `git`, a stub `gh` or worker, a shell. On a loaded
 * machine each spawn waits for a core, so these run apart from the rest, one file at a time,
 * under a timeout far above their healthy duration. The timeout is still there so a process
 * that hangs fails only its own test, rather than leaving the whole run waiting.
 *
 * One file at a time because Vitest 2 sizes its pool for the whole run: `singleFork` is the
 * only limit a project can set for itself. Vitest runs `singleFork` files after the files that
 * run in parallel, so these start once the unit project is done.
 *
 * A new test file that spawns a process belongs here.
 */
const SPAWNING = [
  'test/act-as-app.test.ts',
  'test/as-an-app.test.ts',
  'test/budget.test.ts',
  'test/create-over-gh.test.ts',
  'test/execute.test.ts',
  'test/gh.test.ts',
  'test/init.test.ts',
  'test/propose-over-gh.test.ts',
  'test/reconcile-over-gh.test.ts',
  'test/store.test.ts',
  'test/triage.test.ts',
  'test/without-gh.test.ts',
  'test/worktree.test.ts',
]

/** Measured healthy: no test in these files takes more than about 3s. */
const SPAWNING_TIMEOUT_MS = 120_000

export default defineWorkspace([
  {
    extends: './vitest.config.ts',
    // Adds to the `exclude` in vitest.config.ts, which keeps worktrees out of every project.
    test: { name: 'unit', exclude: SPAWNING },
  },
  {
    extends: './vitest.config.ts',
    test: {
      name: 'spawning',
      include: SPAWNING,
      testTimeout: SPAWNING_TIMEOUT_MS,
      hookTimeout: SPAWNING_TIMEOUT_MS,
      pool: 'forks',
      poolOptions: { forks: { singleFork: true } },
    },
  },
])
