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

  it('lets a role drop an inherited command', () => {
    const dir = store({ org: `${ORG}commands: ["npm test:*", "npm run lint"]\n`, docs: 'commands: ["npm run lint"]\n' })
    expect(resolveRole(dir, 'docs').role.commands).toEqual(['npm run lint'])
  })

  it('rejects a role adding a command it does not inherit', () => {
    const dir = store({ org: `${ORG}commands: ["npm test:*"]\n`, rogue: 'commands: ["npm test:*", "npm install:*"]\n' })
    expect(() => resolveRole(dir, 'rogue')).toThrow(/widens commands with npm install:\*/)
  })

  it('rejects a pattern that only looks narrower, since subsuming one is a matcher', () => {
    const dir = store({ org: `${ORG}commands: ["npm:*"]\n`, sneaky: 'commands: ["npm test"]\n' })
    expect(() => resolveRole(dir, 'sneaky')).toThrow(/widens commands with npm test/)
  })

  it('leaves a role declaring nothing unable to run anything', () => {
    const dir = store({ org: ORG, docs: 'sources: []\n' })
    expect(resolveRole(dir, 'docs').role.commands).toEqual([])
  })

  it('rejects an entry that would close the Bash(…) it is wrapped in', () => {
    const dir = store({ org: `${ORG}commands: ["npm test:*"]\n`, sneaky: 'commands: ["npm test:*) Edit Bash(rm -rf *"]\n' })
    expect(() => resolveRole(dir, 'sneaky')).toThrow(/not a command/)
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

describe('one base per role', () => {
  const TWO = {
    org: 'allow: [comment, draft-pr, unassign]\ncompletion: unassign\nlane:\n  labels:\n    excludes: [Human]\n',
    engineering: 'allow: [comment, draft-pr, unassign]\ncommands: ["npm test:*", "npm run lint"]\n',
    backend: 'extends: engineering\nlane:\n  paths:\n    under: ["server/**"]\n',
    frontend: 'extends: engineering\nlane:\n  paths:\n    under: ["web/**"]\n',
  }

  it('refuses a role naming two bases, naming both and saying how to build a broad role', () => {
    const dir = store({ ...TWO, milton: 'extends: [backend, frontend]\n' })
    expect(() => resolveRole(dir, 'milton')).toThrow(
      'role "milton" extends backend and frontend; a role extends at most one base. For a role ' +
        'spanning several areas, give it its own lane, allow and commands, and put what the roles ' +
        'share in a base they all extend',
    )
  })

  it('builds a role spanning two areas through one shared base', () => {
    const dir = store({
      ...TWO,
      fullstack: 'extends: engineering\nlane:\n  paths:\n    under: ["server/**", "web/**"]\ncommands: ["npm test:*"]\n',
    })
    const { role } = resolveRole(dir, 'fullstack')
    expect(role.extends).toEqual(['org', 'engineering'])
    expect(role.lane.paths!.under).toEqual([['server/**', 'web/**']])
    expect(role.lane.labels!.excludes).toEqual(['Human'])
    expect(role.commands).toEqual(['npm test:*'])
  })

  it('is not widened when a sibling base changes', () => {
    const dir = store({
      ...TWO,
      frontend: 'extends: engineering\nallow: [comment, unassign]\n',
      fullstack: 'extends: engineering\nallow: [comment, draft-pr, unassign]\n',
    })
    expect(resolveRole(dir, 'fullstack').role.allow).toEqual(['comment', 'draft-pr', 'unassign'])
  })

  it('inherits commands it does not list, and replaces them with a subset where it does', () => {
    const dir = store({ ...TWO, quiet: 'extends: engineering\ncommands: ["npm run lint"]\n' })
    expect(resolveRole(dir, 'backend').role.commands).toEqual(['npm test:*', 'npm run lint'])
    expect(resolveRole(dir, 'quiet').role.commands).toEqual(['npm run lint'])
  })

  it('still narrows down a chain', () => {
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

describe('claim wording is not a role setting', () => {
  it('refuses a role that sets one, rather than loading without it', () => {
    // The message it would replace is the only place anyone is told that stopping is possible
    // and needs no permission, so it is not an org's to rewrite. Dropping the key in silence
    // leaves whoever wrote it believing the fleet says what they told it to.
    const dir = store({ org: ORG, fe: 'sources: []\nseat: igor-1\nclaim: "Taking this"\n' })
    expect(() => loadRole(config(dir), 'fe')).toThrow(/claim.*stop instruction/s)
  })

  it('refuses it on the org base too, where it would reach every role', () => {
    const dir = store({ org: `${ORG}claim: "Taking this"\n`, fe: 'sources: []\nseat: igor-1\n' })
    expect(() => loadRole(config(dir), 'fe')).toThrow(/claim/)
  })
})

describe('a role file refuses a key nobody reads', () => {
  it('names the offending key and the ones it accepts', () => {
    const dir = store({ org: ORG, fe: 'sources: []\nseat: igor-1\nreviewer: [sarah]\n' })
    expect(() => resolveRole(dir, 'fe')).toThrow(/names "reviewer", which is not a role key: extends, seat/)
  })

  it('refuses one on the org base, where it would otherwise be dropped for every role', () => {
    const dir = store({ org: `${ORG}budget_shar: 0.4\n`, fe: 'sources: []\n' })
    expect(() => resolveRole(dir, 'fe')).toThrow(/names "budget_shar"/)
  })

  it('refuses one on a parent read only for what it contributes', () => {
    const dir = store({ org: ORG, base: 'lanes:\n  labels:\n    excludes: [x]\n', fe: 'extends: [base]\n' })
    expect(() => resolveRole(dir, 'fe')).toThrow(/base\.yaml names "lanes"/)
  })

  it('refuses a lane constraint nobody reads, which is a safety rail going missing', () => {
    const dir = store({ org: ORG, fe: 'lane:\n  labels:\n    exclude: [Human]\n' })
    expect(() => resolveRole(dir, 'fe')).toThrow(
      /fe\.lane\.labels names "exclude", which is not a label constraint: includes, excludes/,
    )
    expect(() => resolveRole(store({ org: ORG, fe: 'lane:\n  label: {}\n' }), 'fe')).toThrow(
      /fe\.lane names "label"/,
    )
    expect(() => resolveRole(store({ org: ORG, fe: 'lane:\n  age:\n    maxDays: 3\n' }), 'fe')).toThrow(
      /fe\.lane\.age names "maxDays"/,
    )
  })

  it('refuses a source key nobody reads', () => {
    const dir = store({ org: ORG, fe: 'sources:\n  - {tracker: github, repo: o/r, query: q, label: ai}\n' })
    expect(() => resolveRole(dir, 'fe')).toThrow(/fe\.sources\[0\] names "label"/)
  })

  it('takes every key a role documents, timing included', () => {
    const dir = store({
      org: ORG,
      fe: [
        'extends: [org]',
        'seat: igor-1',
        'sources:',
        '  - {tracker: github, repo: o/r, query: q}',
        'lane:',
        '  labels:',
        '    includes: [ai]',
        '    excludes: [wontfix]',
        '  paths:',
        '    under: [src/]',
        '  age:',
        '    max_days: 30',
        'instructions: Link the issue.',
        'completion: unassign',
        'allow: [comment, unassign]',
        'commands: []',
        'budget_share: 0.4',
        'reviewers: [sarah]',
        'settle_seconds: 5',
        'cooldown_minutes: 30',
        'poll_minutes: 2',
        '',
      ].join('\n'),
    })
    expect(() => resolveRole(dir, 'fe')).not.toThrow()
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

describe('the GitHub App a role acts as', () => {
  it('refuses a role file naming an App, saying where the App comes from', () => {
    const dir = store({ org: 'allow: [comment, unassign]\n', reviewer: 'github_app: maintainer\n' })
    expect(() => resolveRole(dir, 'reviewer')).toThrow(
      /sets "github_app" — an Igor acts as the GitHub App named after its role, and its credentials come from its environment/,
    )
  })

  it('refuses a base naming an App, so no role inherits another Igor\'s App', () => {
    const dir = store({ org: 'allow: [comment, unassign]\ngithub_app: shared\n', reviewer: '' })
    expect(() => resolveRole(dir, 'reviewer')).toThrow(/sets "github_app"/)
  })

  it('explains the identity and whether the environment holds its credentials, without reading a key', () => {
    const dir = store({ org: 'allow: [comment, unassign]\n', reviewer: '' })
    const resolved = resolveRole(dir, 'reviewer')
    const missing = explainRole(resolved, { GITHUB_APP_IDENTITY: 'reviewer', GITHUB_APP_PRIVATE_KEY_FILE: '/nonexistent.pem' })
    expect(missing).toContain('github app:    reviewer')
    expect(missing).toContain('credentials:   the GitHub App "reviewer" is missing GITHUB_APP_ID in its environment')
    const present = explainRole(resolved, {
      GITHUB_APP_IDENTITY: 'reviewer',
      GITHUB_APP_ID: '1',
      GITHUB_APP_PRIVATE_KEY_FILE: '/nonexistent.pem',
    })
    expect(present).toContain('credentials:   in the environment')
  })
})

describe('an organization claims on one tracker', () => {
  const noSeats = { seats: [], pools: [] } as unknown as OrgBudget
  const src = (tracker: string, repo = 'o/r') => `sources:\n  - {tracker: ${tracker}, repo: ${repo}, query: "is:open"}\n`

  it('loads where every role claims on one tracker', () => {
    const dir = store({ org: ORG, a: src('github'), b: src('github', 'o/other') })
    expect(() => loadRole(config(dir, noSeats), 'a')).not.toThrow()
  })

  it('refuses roles that claim on two trackers, naming both', () => {
    const dir = store({ org: ORG, a: src('github'), b: src('linear') })
    expect(() => loadRole(config(dir, noSeats), 'a')).toThrow(
      /claim on more than one tracker: github \(a\); linear \(b\)/,
    )
  })

  it('refuses a role that claims on Discord, which directs work and holds no claims', () => {
    const dir = store({ org: ORG, chat: src('discord') })
    expect(() => loadRole(config(dir, noSeats), 'chat')).toThrow(
      /claims on discord, which directs work and cannot hold claims/,
    )
  })

  it('leaves a broken other role to its own load', () => {
    const dir = store({ org: ORG, a: src('github'), broken: 'extends: [a, org]\n' })
    expect(() => loadRole(config(dir, noSeats), 'a')).not.toThrow()
  })
})

describe('a cycle in the chain of bases', () => {
  it('is named in the order the roles extend', () => {
    const dir = store({ a: 'extends: b\n', b: 'extends: c\n', c: 'extends: b\n' })
    expect(() => resolveRole(dir, 'a')).toThrow('role inheritance cycles: a -> b -> c -> b')
  })
})
