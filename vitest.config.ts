import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Worktrees live inside the repo, so a branch under development would otherwise have its
    // tests collected into every run — counts from two branches at once, and a red result
    // from work nobody on this branch has done.
    exclude: ['node_modules/**', 'dist/**', '.claude/worktrees/**'],
  },
})
