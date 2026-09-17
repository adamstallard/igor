import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'

/**
 * The workflow is the one part of Igor that runs where no test can reach it. Asserting its
 * shape here is what catches a template that parses as YAML and then fails on the destination:
 * a token the job never exports, a rejection record the commit step never stages.
 */
const path = fileURLToPath(new URL('../templates/reconcile-on-merge.yml', import.meta.url))
const source = readFileSync(path, 'utf8')
const workflow = parse(source) as {
  name: string
  on: { push?: Record<string, unknown> }
  permissions: Record<string, string>
  concurrency: { group: string; 'cancel-in-progress': boolean }
  jobs: Record<
    string,
    { if?: string; steps: { name?: string; env?: Record<string, string>; run?: string }[] }
  >
}

const steps = Object.values(workflow.jobs).flatMap((j) => j.steps)
const runSteps = steps.filter((s) => s.run !== undefined)
const reconcileStep = steps.find((s) => s.run?.includes('cli.ts reconcile'))
const commitStep = steps.find((s) => s.run?.includes('git commit'))

describe('the merge-triggered workflow', () => {
  it('runs reconcile, and nothing in it promotes', () => {
    expect(reconcileStep).toBeDefined()
    expect(source).not.toContain('cli.ts promote')
  })

  it('is triggered by the merge itself', () => {
    expect(workflow.on.push?.['branches']).toContain('main')
  })

  it('reconciles on every push, with no gate on which files changed', () => {
    // A merge whose only content is a reviewer's deletion changes no entry file. Any gate on
    // changed files skips exactly the merge that has a rejection to record — and the gate has
    // four places to hide: the trigger, the job, a step, and a diff inside a step.
    expect(workflow.on.push?.['paths']).toBeUndefined()
    expect(workflow.on.push?.['paths-ignore']).toBeUndefined()
    expect(Object.values(workflow.jobs).every((j) => !('if' in j))).toBe(true)
    expect(steps.every((s) => !('if' in s))).toBe(true)
    expect(runSteps.some((s) => s.run?.includes('git diff --name-only'))).toBe(false)
  })

  it('scopes the automatic token and exports it to the step that shells gh', () => {
    expect(workflow.permissions).toEqual({ contents: 'write', 'pull-requests': 'read' })
    expect(reconcileStep?.env?.['GH_TOKEN']).toBe('${{ secrets.GITHUB_TOKEN }}')
  })

  it('stages rejected/ alongside entries/, and stages before it tests', () => {
    // `writeRejection` writes a new file, which `git diff` cannot see until it is staged. Ask
    // the index first and the step reports "nothing to reconcile" over real promotions.
    const run = commitStep?.run ?? ''
    expect(run).toContain('rejected')
    expect(run).toContain('entries')
    expect(run.indexOf('git add -A')).toBeGreaterThan(-1)
    expect(run.indexOf('git add -A')).toBeLessThan(run.indexOf('git diff --cached --quiet'))
  })

  it('serializes, so two merges close together cannot race on the push', () => {
    expect(workflow.concurrency.group).toBeTruthy()
    expect(workflow.concurrency['cancel-in-progress']).toBe(false)
  })

  it('is named for what it does', () => {
    expect(workflow.name).toBe('Reconcile merged lore')
  })
})
