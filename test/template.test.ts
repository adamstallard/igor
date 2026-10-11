import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { resolveRole, ORG_ROLE, ROLES_DIR } from '../src/role.js'
import { tempDir } from './tmp.js'

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

/**
 * The org role Igor ships is the action space every worker in a new store starts with, and it
 * reaches an operator by being copied rather than by being called — so nothing else here would
 * notice it becoming a file that no longer parses, or a list that quietly grew.
 */
const orgTemplate = fileURLToPath(new URL('../templates/org.yaml', import.meta.url))

function storeWithOrgBase(): string {
  const dir = tempDir('igor-org-template-')
  mkdirSync(join(dir, ROLES_DIR), { recursive: true })
  copyFileSync(orgTemplate, join(dir, ROLES_DIR, `${ORG_ROLE}.yaml`))
  return dir
}

describe('the shipped org role', () => {
  it('loads as a role of its own', () => {
    const { role } = resolveRole(storeWithOrgBase(), ORG_ROLE)

    expect(role.allow).toContain(role.completion)
    expect(role.instructions.join('\n')).not.toBe('')
    expect(role.lane.labels?.excludes?.length).toBeGreaterThan(0)
  })

  it('merges as the base a role inherits without saying so', () => {
    const dir = storeWithOrgBase()
    writeFileSync(join(dir, ROLES_DIR, 'derived.yaml'), 'allow: [comment, unassign]\n')

    const { role, from } = resolveRole(dir, 'derived')

    expect(role.extends).toEqual([ORG_ROLE])
    expect(from['commands']).toBe(ORG_ROLE)
    expect(role.commands).toEqual(resolveRole(dir, ORG_ROLE).role.commands)
  })

  it('is a ceiling: a role may drop one of its commands and may not add one', () => {
    const dir = storeWithOrgBase()
    writeFileSync(join(dir, ROLES_DIR, 'narrower.yaml'), 'commands: ["git log:*"]\n')
    writeFileSync(join(dir, ROLES_DIR, 'wider.yaml'), 'commands: ["npm test:*"]\n')

    expect(resolveRole(dir, 'narrower').role.commands).toEqual(['git log:*'])
    expect(() => resolveRole(dir, 'wider')).toThrow(/widens commands/)
  })

  it('carries what a worker cannot otherwise reach', () => {
    expect(resolveRole(storeWithOrgBase(), ORG_ROLE).role.commands).toEqual([
      'git rm:*',
      'git mv:*',
      'git log:*',
      'git show:*',
      'git blame:*',
    ])
  })

  it('excludes, by name, everything the requirement excludes by name', () => {
    // Each of these was left out for its own reason, and the list is the one thing in the
    // template an operator inherits without reading. Widening it has to be deliberate.
    const { commands } = resolveRole(storeWithOrgBase(), ORG_ROLE).role
    for (const excluded of ['rm:*', 'git commit:*', 'git push:*', 'node:*', 'npx:*', 'curl', 'sh', 'bash', 'cat', 'grep', 'find']) {
      expect(commands, `${excluded} is in the shipped commands`).not.toContain(excluded)
    }
  })

  it('opens the commands block with the model rather than with a prohibition', () => {
    // The wording is the deliverable: the last clause is what stops an operator reaching for
    // `git commit`, and it is the reason the requirement does not give.
    expect(readFileSync(orgTemplate, 'utf8')).toContain(
      [
        '# Igor reads this working directory and publishes what it finds, so nothing below needs',
        '# to stage or commit. A file the worker writes is read as untracked; `git rm` and',
        '# `git mv` stage themselves; and a committed change is one `git status` no longer',
        '# reports, so committing hides the worker\'s own work rather than finishing it.',
        'commands:',
      ].join('\n'),
    )
  })
})
