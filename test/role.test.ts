import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveRole, explainRole, listRoles, RoleError, DEFAULTS } from '../src/role.js'

function store(roles: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'igor-roles-'))
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
    expect(listRoles(mkdtempSync(join(tmpdir(), 'empty-')))).toEqual([])
  })

  it('reports a missing role by path rather than throwing something opaque', () => {
    expect(() => resolveRole(store({ org: ORG }), 'nope')).toThrow(RoleError)
  })
})
