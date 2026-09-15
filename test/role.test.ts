import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveRole, loadRole, explainRole, listRoles, RoleError, DEFAULTS } from '../src/role.js'
import type { OrgBudget } from '../src/budget.js'
import type { Config } from '../src/config.js'
import { tempDir } from './tmp.js'

function store(roles: Record<string, string>): string {
  const dir = tempDir('igor-roles-')
  mkdirSync(join(dir, 'roles'), { recursive: true })
  for (const [name, body] of Object.entries(roles)) {
    writeFileSync(join(dir, 'roles', `${name}.yaml`), body)
  }
  return dir
}

const ORG = `
allow: [comment, draft-pr, unassign]
budget_share: 0.8
completion: unassign
lane:
  labels:
    excludes: [Human]
instructions: |
  Link the issue in the pull request body.
reviewers: [alice]
`

describe('lineage', () => {
  it('inherits from org by default without declaring it', () => {
    const dir = store({ org: ORG, frontend: 'sources: []\n' })
    expect(resolveRole(dir, 'frontend').role.extends).toEqual(['org'])
  })

  it('does not make org inherit from itself', () => {
    const dir = store({ org: ORG })
    expect(resolveRole(dir, 'org').role.extends).toEqual([])
  })

  it('rejects a cycle rather than recursing forever', () => {
    const dir = store({ a: 'extends: [b]\nallow: [unassign]\n', b: 'extends: [a]\nallow: [unassign]\n' })
    expect(() => resolveRole(dir, 'a')).toThrow(/cycles/)
  })

  it('rejects a role that names itself, since the filename is the name', () => {
    const dir = store({ org: ORG, frontend: 'name: frontend\n' })
    expect(() => resolveRole(dir, 'frontend')).toThrow(/filename is the name/)
  })
})

describe('monotonic — permissions may only be restricted', () => {
  it('lets a role drop an inherited permission', () => {
    const dir = store({ org: ORG, docs: 'allow: [comment, unassign]\n' })
    expect(resolveRole(dir, 'docs').role.allow).toEqual(['comment', 'unassign'])
  })

  it('rejects a role adding a permission it does not inherit', () => {
    const dir = store({ org: ORG, rogue: 'allow: [comment, unassign, merge]\n' })
    expect(() => resolveRole(dir, 'rogue')).toThrow(/widens allow with merge/)
  })

  it('rejects raising the budget share', () => {
    const dir = store({ org: ORG, greedy: 'allow: [unassign]\nbudget_share: 0.9\n' })
    expect(() => resolveRole(dir, 'greedy')).toThrow(/raises budget_share/)
  })

  it('allows lowering the budget share', () => {
    const dir = store({ org: ORG, modest: 'allow: [unassign]\nbudget_share: 0.2\n' })
    expect(resolveRole(dir, 'modest').role.budgetShare).toBe(0.2)
  })

  it('rejects an action outside the closed vocabulary', () => {
    const dir = store({ org: 'allow: [comment, unassign, deploy]\n' })
    expect(() => resolveRole(dir, 'org')).toThrow(/unrecognized action: deploy/)
  })
})

describe('override — the most specific level wins', () => {
  it('replaces a setting rather than merging it', () => {
    const dir = store({
      org: 'allow: [comment, unassign, close]\ncompletion: unassign\n',
      closer: 'completion: close\n',
    })
    expect(resolveRole(dir, 'closer').role.completion).toBe('close')
  })

  it('replaces sources wholesale', () => {
    const dir = store({
      org: `${ORG}\nsources:\n  - {tracker: github, repo: org/a, query: "is:issue"}\n`,
      fe: 'sources:\n  - {tracker: github, repo: org/b, query: "label:ai"}\n',
    })
    const s = resolveRole(dir, 'fe').role.sources
    expect(s).toHaveLength(1)
    expect(s[0]!.repo).toBe('org/b')
  })

  it('falls back to defaults for unset intervals', () => {
    const dir = store({ org: ORG })
    expect(resolveRole(dir, 'org').role.settleSeconds).toBe(DEFAULTS.settleSeconds)
  })
})

describe('append — levels accumulate', () => {
  it('keeps an org lane exclusion no matter what a role declares', () => {
    // The point of appending: an org-wide exclusion is structurally inescapable, so it needs
    // no separate monotonic rule to protect it.
    const dir = store({
      org: ORG,
      fe: 'lane:\n  labels:\n    includes: [ai]\n    excludes: [wontfix]\n',
    })
    const lane = resolveRole(dir, 'fe').role.lane
    expect(lane.labels!.excludes).toEqual(['Human', 'wontfix'])
    expect(lane.labels!.includes).toEqual([['ai']])
  })

  it('conjoins inclusive constraints rather than pooling them into one "any of"', () => {
    // Flattening would let a role widen its own lane by narrowing it: org requiring `ai` and a
    // role requiring `frontend`, read as one "any of" list, matches an item labelled only `ai`.
    const dir = store({
      org: 'allow: [unassign]\nlane:\n  labels:\n    includes: [ai, bot]\n',
      fe: 'lane:\n  labels:\n    includes: [frontend]\n',
    })
    expect(resolveRole(dir, 'fe').role.lane.labels!.includes).toEqual([['ai', 'bot'], ['frontend']])
  })

  it('conjoins path groups the same way', () => {
    const dir = store({
      org: 'allow: [unassign]\nlane:\n  paths:\n    under: ["src/**"]\n',
      fe: 'lane:\n  paths:\n    under: ["**/*.tsx"]\n',
    })
    expect(resolveRole(dir, 'fe').role.lane.paths!.under).toEqual([['src/**'], ['**/*.tsx']])
  })

  it('cannot escape an inherited exclusion by redeclaring the field', () => {
    const dir = store({ org: ORG, sneaky: 'lane:\n  labels:\n    excludes: []\n' })
    expect(resolveRole(dir, 'sneaky').role.lane.labels!.excludes).toContain('Human')
  })

  it('takes the stricter age limit when both levels set one', () => {
    const dir = store({
      org: 'allow: [unassign]\nlane:\n  age:\n    max_days: 90\n',
      fe: 'lane:\n  age:\n    max_days: 30\n',
    })
    expect(resolveRole(dir, 'fe').role.lane.age!.maxDays).toBe(30)
  })

  it('accumulates instructions from every level', () => {
    const dir = store({ org: ORG, fe: 'instructions: |\n  Prefer the shared query hook.\n' })
    const i = resolveRole(dir, 'fe').role.instructions
    expect(i).toHaveLength(2)
    expect(i[0]).toContain('Link the issue')
    expect(i[1]).toContain('query hook')
  })
})

describe('siblings union — an Igor that does two jobs', () => {
  const TWO = {
    org: 'allow: [comment, draft-pr, unassign]\ncompletion: unassign\nlane:\n  labels:\n    excludes: [Human]\n',
    backend: 'lane:\n  paths:\n    under: ["server/**"]\n',
    frontend: 'lane:\n  paths:\n    under: ["web/**"]\n',
  }

  it('covers what either parent covers, rather than only their overlap', () => {
    // Conjoining siblings would give Milton items under server/** AND web/**, so he would find
    // nothing at all — the failure that motivated resolving over the graph.
    const dir = store({ ...TWO, milton: 'extends: [backend, frontend]\n' })
    expect(resolveRole(dir, 'milton').role.lane.paths!.under).toEqual([['server/**', 'web/**']])
  })

  it('still cannot escape a constraint the parents share', () => {
    const dir = store({ ...TWO, milton: 'extends: [backend, frontend]\n' })
    expect(resolveRole(dir, 'milton').role.lane.labels!.excludes).toEqual(['Human'])
  })

  it('unions permissions between siblings without either one widening', () => {
    // backend may draft-pr and frontend may not; Milton does both jobs, so he may.
    const dir = store({
      ...TWO,
      backend: 'allow: [comment, draft-pr, unassign]\n',
      frontend: 'allow: [comment, unassign]\n',
      milton: 'extends: [backend, frontend]\n',
    })
    expect(resolveRole(dir, 'milton').role.allow.sort()).toEqual(['comment', 'draft-pr', 'unassign'])
  })

  it('cannot reach past what the parents share above them', () => {
    // The safety property that makes unioning siblings acceptable at all.
    const dir = store({
      ...TWO,
      backend: 'allow: [comment, unassign]\n',
      frontend: 'allow: [comment, unassign]\n',
      milton: 'extends: [backend, frontend]\nallow: [comment, unassign, merge]\n',
    })
    expect(() => resolveRole(dir, 'milton')).toThrow(/widens allow with merge/)
  })

  it('does not treat one sibling permitting more as the other widening', () => {
    // Read as a flat chain, frontend would look like it widened backend's allow.
    const dir = store({
      ...TWO,
      backend: 'allow: [comment, unassign]\n',
      frontend: 'allow: [comment, draft-pr, unassign]\n',
      milton: 'extends: [backend, frontend]\n',
    })
    expect(() => resolveRole(dir, 'milton')).not.toThrow()
  })

  it('takes the most restrictive parent ceiling, so combining cannot raise it', () => {
    const dir = store({
      ...TWO,
      backend: 'budget_share: 0.5\n',
      frontend: 'budget_share: 0.2\n',
      milton: 'extends: [backend, frontend]\n',
    })
    expect(resolveRole(dir, 'milton').role.budgetShare).toBe(0.2)
  })

  it('leaves the lane unconstrained when one job is unconstrained', () => {
    // "Anything, or this" is anything — a constrained sibling must not narrow a free one.
    const dir = store({ ...TWO, anything: 'sources: []\n', milton: 'extends: [backend, anything]\n' })
    expect(resolveRole(dir, 'milton').role.lane.paths).toBeUndefined()
  })

  it('takes the looser age bound across siblings', () => {
    const dir = store({
      ...TWO,
      backend: 'lane:\n  age:\n    max_days: 30\n',
      frontend: 'lane:\n  age:\n    max_days: 90\n',
      milton: 'extends: [backend, frontend]\n',
    })
    expect(resolveRole(dir, 'milton').role.lane.age!.maxDays).toBe(90)
  })

  it('still narrows down a chain, so extending one parent is unaffected', () => {
    const dir = store({ ...TWO, deep: 'extends: [backend]\nlane:\n  paths:\n    under: ["server/api/**"]\n' })
    expect(resolveRole(dir, 'deep').role.lane.paths!.under).toEqual([['server/**'], ['server/api/**']])
  })
})

describe('completion must be permitted', () => {
  it('rejects completing with an action outside allow', () => {
    const dir = store({ org: 'allow: [comment]\ncompletion: close\n' })
    // Otherwise a role forbidden from closing could close by naming it as its completion.
    expect(() => resolveRole(dir, 'org')).toThrow(/Completion must be permitted/)
  })

  it('requires unassign to be permitted even when defaulted', () => {
    const dir = store({ org: 'allow: [comment]\n' })
    expect(() => resolveRole(dir, 'org')).toThrow(/completes with "unassign"/)
  })
})

const BUDGET: OrgBudget = {
  seats: [
    { id: 'igor-1', dedicated: true, reserve: 0 },
    { id: 'adam', owner: 'adam@example.com', reserve: 0.5 },
  ],
  pools: [{ id: 'eng', seats: ['igor-1', 'adam'] }],
}

function config(dir: string, budget: OrgBudget = BUDGET): Config {
  return { destination: dir, reviewers: [], experts: [], budget }
}

describe('a seat a role names must be declared', () => {
  it('rejects a seat no organization configuration declares', () => {
    const dir = store({ org: ORG, fe: 'seat: igor-2\n' })
    expect(() => loadRole(config(dir), 'fe')).toThrow(/role "fe" names seat "igor-2", which is not declared/)
  })

  it('says what is declared, so the typo is visible against it', () => {
    const dir = store({ org: ORG, fe: 'seat: igor-2\n' })
    expect(() => loadRole(config(dir), 'fe')).toThrow(/Declared seats: igor-1, adam; pools: eng/)
  })

  it('rejects an undeclared pool the same way', () => {
    const dir = store({ org: ORG, fe: 'seat: pool:backend\n' })
    expect(() => loadRole(config(dir), 'fe')).toThrow(/names seat "pool:backend", which is not declared/)
  })

  it('names the level an inherited seat came from, since that is the file to fix', () => {
    const dir = store({ org: `${ORG}seat: igor-2\n`, fe: 'sources: []\n' })
    expect(() => loadRole(config(dir), 'fe')).toThrow(/inherited from org/)
  })

  it('accepts a declared seat', () => {
    const dir = store({ org: ORG, fe: 'seat: adam\n' })
    expect(loadRole(config(dir), 'fe').role.seat).toBe('adam')
  })

  it('accepts a declared pool', () => {
    const dir = store({ org: ORG, fe: 'seat: pool:eng\n' })
    expect(loadRole(config(dir), 'fe').role.seat).toBe('pool:eng')
  })

  it('checks nothing when no seats are declared, since budget is then not enforced', () => {
    const dir = store({ org: ORG, fe: 'seat: igor-2\n' })
    expect(loadRole(config(dir, { seats: [], pools: [] }), 'fe').role.seat).toBe('igor-2')
  })

  it('rejects a role that names no seat, since omission reached the same default a typo did', () => {
    // Falling through to the first pool declared is not a decision anybody made about this
    // role, and it may be a person's seat.
    const dir = store({ org: ORG, fe: 'sources: []\n' })
    expect(() => loadRole(config(dir), 'fe')).toThrow(/names no seat/)
  })

  it('says where to put the seat, since it may belong on a level the role inherits', () => {
    const dir = store({ org: ORG, fe: 'sources: []\n' })
    expect(() => loadRole(config(dir), 'fe')).toThrow(/on the role or on a level it inherits/)
  })

  it('leaves a role without a seat alone where no seats are declared', () => {
    // No seats means budget is not enforced, which is a legitimate way to run.
    const dir = store({ org: ORG, fe: 'sources: []\n' })
    expect(loadRole(config(dir, { seats: [], pools: [] }), 'fe').role.seat).toBeUndefined()
  })
})

describe('explain', () => {
  const dir = store({ org: ORG, fe: 'completion: unassign\nlane:\n  labels:\n    includes: [ai]\n' })
  const text = explainRole(resolveRole(dir, 'fe'))

  it('names the level each value came from', () => {
    expect(text).toMatch(/allow:.*\[org\]/)
    expect(text).toMatch(/completion:.*\[fe\]/)
  })

  it('marks unset values as defaults rather than inventing a source', () => {
    expect(text).toMatch(/settle:.*\[default\]/)
  })

  it('shows an appended lane as coming from several levels', () => {
    expect(text).toMatch(/lane:.*org, fe/)
  })

  it('renders conjoined groups as "and", so a reader sees each level adds a constraint', () => {
    const two = store({
      org: 'allow: [unassign]\nlane:\n  labels:\n    includes: [ai, bot]\n',
      fe: 'lane:\n  labels:\n    includes: [frontend]\n',
    })
    expect(explainRole(resolveRole(two, 'fe'))).toContain('ai or bot  and  frontend')
  })
})

describe('listing', () => {
  it('finds roles by filename and returns none when absent', () => {
    expect(listRoles(store({ org: ORG, fe: 'sources: []\n' }))).toEqual(['fe', 'org'])
    expect(listRoles(tempDir('igor-empty-'))).toEqual([])
  })

  it('reports a missing role by path rather than throwing something opaque', () => {
    expect(() => resolveRole(store({ org: ORG }), 'nope')).toThrow(RoleError)
  })
})
