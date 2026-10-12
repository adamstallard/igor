import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
import { poolFor, type OrgBudget } from './budget.js'
import { credentialProblem } from './app.js'
import { keyCheck } from './keys.js'
import type { Config } from './config.js'

export const ROLES_DIR = 'roles'
export const ORG_ROLE = 'org'

/** Closed set, so a typo fails validation rather than silently granting nothing. */
export const ACTIONS = [
  'comment',
  'review-comment',
  'draft-pr',
  'pr',
  'label',
  'assign',
  'unassign',
  'close',
  'merge',
  'send',
] as const
export type Action = (typeof ACTIONS)[number]

/** Starting points to tune against observation, not derived values. */
export const DEFAULTS = {
  settleSeconds: 10,
  cooldownMinutes: 60,
  pollMinutes: 10,
} as const

export interface Source {
  tracker: string
  repo: string
  query: string
}

/**
 * Inclusive constraints are a **conjunction of disjunctions**: a candidate satisfies a group by
 * matching any member, and it must satisfy every group. Each level of a role's chain adds a
 * group, which narrows. See `mergeLane`.
 *
 * Flattening the groups would break the append promise. With org declaring `includes: [ai]` and
 * a role declaring `includes: [frontend]`, one flat list read as "any of" matches an item
 * labelled only `ai` — so the role would have *widened* its own lane by narrowing it, which is
 * the exact escape appending exists to prevent. Grouped, the role's constraint is additional.
 *
 * Exclusions need no grouping: any match rejects, so a flat union already narrows.
 */
export interface Lane {
  labels?: { includes?: string[][]; excludes?: string[] }
  paths?: { under?: string[][] }
  age?: { maxDays?: number }
}

export interface Role {
  name: string
  extends: string[]
  seat?: string
  sources: Source[]
  lane: Lane
  instructions: string[]
  allow: Action[]
  /** Commands the worker may run, as `--allowed-tools` patterns without the `Bash(…)`. */
  commands: string[]
  budgetShare?: number
  reviewers: string[]
  settleSeconds: number
  cooldownMinutes: number
  pollMinutes: number
}

/** Which level a value came from, so `role explain` can say rather than guess. */
export type Provenance = Record<string, string>

export interface ResolvedRole {
  role: Role
  from: Provenance
}

export class RoleError extends Error {}

const refuseUnknownKeys = keyCheck(RoleError)

/**
 * Every key a role file may name, and every key its nested mappings may. Anything else is
 * refused by name — see `keyCheck`. Two keys stay out on purpose: `name`, because the filename is
 * the name, and `github_app`, because an Igor's App is its role's name and its credentials come
 * from its environment.
 */
const ROLE_KEYS = [
  'extends',
  'seat',
  'sources',
  'lane',
  'instructions',
  'allow',
  'commands',
  'budget_share',
  'reviewers',
  'settle_seconds',
  'cooldown_minutes',
  'poll_minutes',
]

const SOURCE_KEYS = ['tracker', 'repo', 'query']

const LANE_KEYS = ['labels', 'paths', 'age']

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function strArray(v: unknown, field: string): string[] {
  if (v === undefined) return []
  if (typeof v === 'string') return [v]
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) {
    throw new RoleError(`${field} must be a string or a list of strings`)
  }
  return v as string[]
}

export function readRoleFile(dir: string, name: string): Record<string, unknown> {
  const file = join(dir, ROLES_DIR, `${name}.yaml`)
  if (!existsSync(file)) {
    const available = listRoles(dir)
    throw new RoleError(
      `no role "${name}" at ${file}` +
        (available.length > 0 ? `\nRoles here: ${available.join(', ')}` : ''),
    )
  }
  const raw = parseYaml(readFileSync(file, 'utf8')) as unknown
  if (raw === null) return {}
  if (!isRecord(raw)) throw new RoleError(`${file} must be a mapping`)
  // Here rather than where each key is read: every path into a role file comes through this
  // function, so one check covers a role, the org base it inherits, and a parent read only for
  // what it contributes.
  refuseUnknownKeys(raw, ROLE_KEYS, file, 'a role key')
  return raw
}

export function listRoles(dir: string): string[] {
  const rolesDir = join(dir, ROLES_DIR)
  if (!existsSync(rolesDir)) return []
  return readdirSync(rolesDir)
    .filter((f) => f.endsWith('.yaml'))
    .map((f) => basename(f, '.yaml'))
    .sort()
}

/**
 * The one base a role inherits from, or none. The org base is the default, which is what keeps
 * conventions from drifting between roles that each restate them.
 *
 * **Two bases are refused.** A role with two would take whatever both allow, so a change to
 * either base would change what it may do without its own file changing, and nobody reviewing
 * that change would see the role it widened. The two would also conflict on every field where
 * the last level wins, such as `poll_minutes`.
 */
function parentOf(dir: string, name: string): string | undefined {
  const raw = readRoleFile(dir, name)
  const declared = strArray(raw['extends'], `${name}.extends`)
  if (declared.length > 1) {
    throw new RoleError(
      `role "${name}" extends ${declared.join(' and ')}; a role extends at most one base. For a ` +
        `role spanning several areas, give it its own lane, allow and commands, and put what the ` +
        `roles share in a base they all extend`,
    )
  }
  if (declared.length === 1) return declared[0]
  return name !== ORG_ROLE && existsSync(join(dir, ROLES_DIR, `${ORG_ROLE}.yaml`)) ? ORG_ROLE : undefined
}

/** The role's chain of bases, base first, so later levels override earlier ones. */
function lineage(dir: string, name: string): string[] {
  const chain = [name]
  for (let parent = parentOf(dir, name); parent !== undefined; parent = parentOf(dir, parent)) {
    if (chain.includes(parent)) {
      throw new RoleError(`role inheritance cycles: ${[...chain, parent].join(' -> ')}`)
    }
    chain.push(parent)
  }
  return chain.reverse()
}

function mergeLane(base: Lane, next: Lane): Lane {
  // Append: constraints accumulate, so an org exclusion cannot be escaped by a role adding
  // its own. Narrowing is the only direction available.
  const merged: Lane = {}
  const includes = [...(base.labels?.includes ?? []), ...(next.labels?.includes ?? [])]
  const excludes = [...(base.labels?.excludes ?? []), ...(next.labels?.excludes ?? [])]
  if (includes.length || excludes.length) {
    merged.labels = {
      ...(includes.length ? { includes } : {}),
      ...(excludes.length ? { excludes: [...new Set(excludes)] } : {}),
    }
  }
  const under = [...(base.paths?.under ?? []), ...(next.paths?.under ?? [])]
  if (under.length) merged.paths = { under }

  const maxDays = [base.age?.maxDays, next.age?.maxDays].filter((d): d is number => d !== undefined)
  if (maxDays.length) merged.age = { maxDays: Math.min(...maxDays) }
  return merged
}

function parseLane(v: unknown, where: string): Lane {
  if (v === undefined) return {}
  if (!isRecord(v)) throw new RoleError(`${where}.lane must be a mapping`)
  refuseUnknownKeys(v, LANE_KEYS, `${where}.lane`, 'a lane key')
  const lane: Lane = {}
  const labels = v['labels']
  if (labels !== undefined) {
    if (!isRecord(labels)) throw new RoleError(`${where}.lane.labels must be a mapping`)
    refuseUnknownKeys(labels, ['includes', 'excludes'], `${where}.lane.labels`, 'a label constraint')
    const includes = strArray(labels['includes'], `${where}.lane.labels.includes`)
    const excludes = strArray(labels['excludes'], `${where}.lane.labels.excludes`)
    // One level contributes one group: "any of these", which the merge then conjoins.
    lane.labels = {
      ...(includes.length ? { includes: [includes] } : {}),
      ...(excludes.length ? { excludes } : {}),
    }
  }
  const paths = v['paths']
  if (paths !== undefined) {
    if (!isRecord(paths)) throw new RoleError(`${where}.lane.paths must be a mapping`)
    refuseUnknownKeys(paths, ['under'], `${where}.lane.paths`, 'a path constraint')
    const under = strArray(paths['under'], `${where}.lane.paths.under`)
    if (under.length) lane.paths = { under: [under] }
  }
  const age = v['age']
  if (age !== undefined) {
    if (!isRecord(age)) throw new RoleError(`${where}.lane.age must be a mapping`)
    refuseUnknownKeys(age, ['max_days'], `${where}.lane.age`, 'an age constraint')
    const maxDays = age['max_days']
    if (maxDays !== undefined) {
      if (typeof maxDays !== 'number' || maxDays <= 0) {
        throw new RoleError(`${where}.lane.age.max_days must be a positive number`)
      }
      lane.age = { maxDays }
    }
  }
  return lane
}

function parseSources(v: unknown, where: string): Source[] {
  if (v === undefined) return []
  if (!Array.isArray(v)) throw new RoleError(`${where}.sources must be a list`)
  return v.map((entry, i) => {
    if (!isRecord(entry)) throw new RoleError(`${where}.sources[${i}] must be a mapping`)
    refuseUnknownKeys(entry, SOURCE_KEYS, `${where}.sources[${i}]`, 'a source key')
    for (const key of SOURCE_KEYS as (keyof Source)[]) {
      if (typeof entry[key] !== 'string' || (entry[key] as string).trim() === '') {
        throw new RoleError(`${where}.sources[${i}].${key} is required`)
      }
    }
    return { tracker: entry['tracker'], repo: entry['repo'], query: entry['query'] } as Source
  })
}

function parseAllow(v: unknown, where: string): Action[] | undefined {
  if (v === undefined) return undefined
  const list = strArray(v, `${where}.allow`)
  const unknown = list.filter((a) => !(ACTIONS as readonly string[]).includes(a))
  if (unknown.length > 0) {
    throw new RoleError(
      `${where}.allow contains unrecognized ${unknown.length === 1 ? 'action' : 'actions'}: ` +
        `${unknown.join(', ')}. Known actions: ${ACTIONS.join(', ')}`,
    )
  }
  return list as Action[]
}

interface Capabilities {
  allow?: Action[]
  commands?: string[]
  lane: Lane
  budgetShare?: number
  allowFrom: string[]
  commandsFrom: string[]
  laneFrom: string[]
  shareFrom: string[]
}

/**
 * Resolves permissions and lane down the role's chain of bases. Each level may only narrow:
 * `allow` and `commands`, where a level sets them, replace what it inherits with a subset of it,
 * and are inherited unchanged where it does not; each level's lane is conjoined with the lane
 * above it; `budget_share` may only fall.
 */
function capabilitiesOf(dir: string, name: string, seen: string[] = []): Capabilities {
  if (seen.includes(name)) {
    throw new RoleError(`role inheritance cycles: ${[...seen, name].join(' -> ')}`)
  }
  const raw = readRoleFile(dir, name)
  const base = parentOf(dir, name)
  const inherited = base === undefined ? [] : [capabilitiesOf(dir, base, [...seen, name])]

  let allow: Action[] | undefined
  let commands: string[] | undefined
  let lane: Lane | undefined
  let budgetShare: number | undefined
  const allowFrom: string[] = []
  const commandsFrom: string[] = []
  const laneFrom: string[] = []
  const shareFrom: string[] = []

  for (const parent of inherited) {
    if (parent.allow !== undefined) {
      allow = parent.allow
      allowFrom.push(...parent.allowFrom)
    }
    if (parent.commands !== undefined) {
      commands = parent.commands
      commandsFrom.push(...parent.commandsFrom)
    }
    lane = parent.lane
    laneFrom.push(...parent.laneFrom)
    if (parent.budgetShare !== undefined) {
      budgetShare = parent.budgetShare
      shareFrom.push(...parent.shareFrom)
    }
  }

  const own = parseAllow(raw['allow'], name)
  if (own !== undefined) {
    if (allow !== undefined) {
      const widened = own.filter((a) => !allow!.includes(a))
      if (widened.length > 0) {
        throw new RoleError(
          `role "${name}" widens allow with ${widened.join(', ')}, which it does not inherit. ` +
            `A role may restrict an inherited permission, never add one.`,
        )
      }
    }
    allow = own
    allowFrom.length = 0
    allowFrom.push(name)
  }

  const ownCommands = raw['commands'] === undefined ? undefined : strArray(raw['commands'], `${name}.commands`)
  if (ownCommands !== undefined) {
    for (const command of ownCommands) {
      // Each entry is wrapped in `Bash(…)`, and closing that paren early is the one way out of
      // it: `Bash(echo:*) Write` grants Write, while a comma or a newline inside the wrapper
      // stays part of the pattern.
      if (command.trim() === '' || command.includes(')')) {
        throw new RoleError(
          `${name}.commands has ${JSON.stringify(command)}, which is not a command. ` +
            `Entries are wrapped in Bash(…), so a ")" would let the rest of the entry name ` +
            `another tool entirely.`,
        )
      }
    }
    if (commands !== undefined) {
      // Verbatim membership, not pattern subsumption. Deciding whether `npm run test` is
      // narrower than an inherited `npm *` is a matcher, and a role that can argue its way to a
      // command can argue its way to every command.
      const widened = ownCommands.filter((c) => !commands!.includes(c))
      if (widened.length > 0) {
        throw new RoleError(
          `role "${name}" widens commands with ${widened.join(', ')}, which it does not inherit. ` +
            `A role may drop an inherited command, never add one, and a narrower pattern counts ` +
            `as adding: list one its parents already list.`,
        )
      }
    }
    commands = ownCommands
    commandsFrom.length = 0
    commandsFrom.push(name)
  }

  const ownLane = parseLane(raw['lane'], name)
  if (Object.keys(ownLane).length > 0) {
    lane = mergeLane(lane ?? {}, ownLane)
    laneFrom.push(name)
  }

  const share = raw['budget_share']
  if (share !== undefined) {
    if (typeof share !== 'number' || share <= 0 || share > 1) {
      throw new RoleError(`${name}.budget_share must be a number between 0 and 1`)
    }
    if (budgetShare !== undefined && share > budgetShare) {
      throw new RoleError(
        `role "${name}" raises budget_share to ${share} above the inherited ${budgetShare}`,
      )
    }
    budgetShare = share
    shareFrom.length = 0
    shareFrom.push(name)
  }

  return {
    ...(allow === undefined ? {} : { allow }),
    ...(commands === undefined ? {} : { commands }),
    lane: lane ?? {},
    ...(budgetShare === undefined ? {} : { budgetShare }),
    allowFrom: [...new Set(allowFrom)],
    commandsFrom: [...new Set(commandsFrom)],
    laneFrom: [...new Set(laneFrom)],
    shareFrom: [...new Set(shareFrom)],
  }
}

/**
 * Merges a lineage into one effective role, recording which level each value came from.
 *
 * Three semantics, because "a role may narrow but never loosen" only makes sense for
 * permissions — a different poll interval is not more or less permissive, just different.
 */
export function resolveRole(dir: string, name: string): ResolvedRole {
  const levels = lineage(dir, name)
  const from: Provenance = {}

  const caps = capabilitiesOf(dir, name)
  const allow = caps.allow
  const budgetShare = caps.budgetShare
  const lane = caps.lane
  if (caps.allowFrom.length) from['allow'] = caps.allowFrom.join(', ')
  if (caps.commandsFrom.length) from['commands'] = caps.commandsFrom.join(', ')
  if (caps.laneFrom.length) from['lane'] = caps.laneFrom.join(', ')
  if (caps.shareFrom.length) from['budget_share'] = caps.shareFrom.join(', ')

  const instructions: string[] = []
  let sources: Source[] = []
  let seat: string | undefined
  let reviewers: string[] = []
  let settleSeconds: number = DEFAULTS.settleSeconds
  let cooldownMinutes: number = DEFAULTS.cooldownMinutes
  let pollMinutes: number = DEFAULTS.pollMinutes

  for (const level of levels) {
    const raw = readRoleFile(dir, level)

    if (raw['instructions'] !== undefined) {
      if (typeof raw['instructions'] !== 'string') {
        throw new RoleError(`${level}.instructions must be a string`)
      }
      instructions.push(raw['instructions'].trim())
      from['instructions'] = from['instructions'] ? `${from['instructions']}, ${level}` : level
    }

    const levelSources = parseSources(raw['sources'], level)
    if (levelSources.length > 0) {
      sources = levelSources
      from['sources'] = level
    }

    for (const [key, assign] of [
      ['seat', (v: string) => (seat = v)],
    ] as const) {
      if (raw[key] !== undefined) {
        if (typeof raw[key] !== 'string') throw new RoleError(`${level}.${key} must be a string`)
        assign(raw[key] as string)
        from[key] = level
      }
    }

    if (raw['reviewers'] !== undefined) {
      reviewers = strArray(raw['reviewers'], `${level}.reviewers`)
      from['reviewers'] = level
    }

    for (const [key, set] of [
      ['settle_seconds', (v: number) => (settleSeconds = v)],
      ['cooldown_minutes', (v: number) => (cooldownMinutes = v)],
      ['poll_minutes', (v: number) => (pollMinutes = v)],
    ] as const) {
      if (raw[key] !== undefined) {
        if (typeof raw[key] !== 'number' || (raw[key] as number) <= 0) {
          throw new RoleError(`${level}.${key} must be a positive number`)
        }
        set(raw[key] as number)
        from[key] = level
      }
    }
  }

  const effectiveAllow = allow ?? []

  return {
    role: {
      name,
      extends: levels.slice(0, -1),
      ...(seat === undefined ? {} : { seat }),
      sources,
      lane,
      instructions,
      allow: effectiveAllow,
      commands: caps.commands ?? [],
      ...(budgetShare === undefined ? {} : { budgetShare }),
      reviewers,
      settleSeconds,
      cooldownMinutes,
      pollMinutes,
    },
    from,
  }
}

/**
 * Roles live in the destination beside the lore, for the same reason the config does: Igor is
 * the shared tool and this describes one team. Everything above takes a bare directory so it
 * stays testable; these two are what the CLI calls.
 */
export function rolesFrom(config: Config): string[] {
  return listRoles(config.destination)
}

/**
 * Refuses a role whose seat nothing declares. An unresolvable name left to run time can only
 * be substituted, and the substitute charges a role written for its own seat to whatever pool
 * is declared first — possibly a person's.
 *
 * No seats declared means budget is not enforced, the same condition `budgetGate` reads, so
 * there is no configuration where one of the two acts and the other does not.
 */
function checkSeat({ role, from }: ResolvedRole, budget: OrgBudget): void {
  if (budget.seats.length === 0) return

  const declared = [
    `seats: ${budget.seats.map((s) => s.id).join(', ') || '(none)'}`,
    `pools: ${budget.pools.map((p) => p.id).join(', ') || '(none)'}`,
  ]

  // Naming nothing reached the same place a typo did: the first pool declared, whatever that
  // happens to be. Where budget is enforced at all, which seat a role spends from is not
  // something to arrive at by omission.
  if (role.seat === undefined) {
    throw new RoleError(
      `role "${role.name}" names no seat, and one is required where seats are declared. ` +
        `Set "seat:" on the role or on a level it inherits from. Declared ${declared.join('; ')}`,
    )
  }
  if (poolFor(budget, role.seat) !== undefined) return

  const level = from['seat']
  throw new RoleError(
    `role "${role.name}" names seat "${role.seat}"` +
      (level !== undefined && level !== role.name ? `, inherited from ${level}` : '') +
      `, which is not declared. Declared ${declared.join('; ')}`,
  )
}

/** Trackers that direct work and have no holder field, so nothing can be claimed on them. */
const DIRECTING_ONLY = ['discord']

/**
 * Refuses a role that claims where no claim can be held, and an organization whose roles claim
 * on more than one tracker. Claims exist so that Igors do not work the same item, and an Igor
 * cannot see a claim held on a tracker it does not read.
 *
 * Other roles are read only for which tracker they claim on. One that fails to resolve is left
 * to its own load to report, so a broken role does not stop every other Igor.
 */
function checkClaimingTracker({ role }: ResolvedRole, dir: string): void {
  const directing = role.sources.find((s) => DIRECTING_ONLY.includes(s.tracker))
  if (directing !== undefined) {
    throw new RoleError(
      `role "${role.name}" claims on ${directing.tracker}, which directs work and cannot hold claims: ` +
        `it has no holder field. Claim on the organization's tracker; a request in ` +
        `${directing.tracker} becomes an issue there`,
    )
  }
  const claimedOn = new Map<string, string[]>()
  for (const name of listRoles(dir)) {
    let sources: Source[]
    try {
      sources = name === role.name ? role.sources : resolveRole(dir, name).role.sources
    } catch {
      continue
    }
    for (const tracker of new Set(sources.map((s) => s.tracker))) {
      claimedOn.set(tracker, [...(claimedOn.get(tracker) ?? []), name])
    }
  }
  if (claimedOn.size > 1) {
    const which = [...claimedOn].map(([tracker, roles]) => `${tracker} (${roles.join(', ')})`)
    throw new RoleError(
      `this organization's roles claim on more than one tracker: ${which.join('; ')}. An Igor ` +
        `cannot see a claim held on a tracker it does not read, so all of them claim on one`,
    )
  }
}

export function loadRole(config: Config, name: string): ResolvedRole {
  const available = listRoles(config.destination)
  if (available.length === 0) {
    throw new RoleError(
      `no roles in ${join(config.destination, ROLES_DIR)}.\n` +
        `A role describes one Igor: what it watches, what it may do, and which seat it spends.\n` +
        `Start with ${ORG_ROLE}.yaml holding what every role in the org inherits.`,
    )
  }
  const resolved = resolveRole(config.destination, name)
  checkSeat(resolved, config.budget)
  checkClaimingTracker(resolved, config.destination)
  return resolved
}

/**
 * Renders the effective role with the level each value came from — the point of `explain`.
 *
 * It also says which GitHub App the role acts as and whether `env` holds that App's
 * credentials, naming what is missing. It reads no key and mints no token.
 */
export function explainRole({ role, from }: ResolvedRole, env: NodeJS.ProcessEnv = process.env): string {
  const at = (key: string) => (from[key] ? `  [${from[key]}]` : '  [default]')
  const problem = credentialProblem(role.name, env)
  const lines = [
    `role: ${role.name}`,
    role.extends.length ? `inherits: ${role.extends.join(' -> ')}` : 'inherits: nothing',
    '',
    `github app:    ${role.name}  [the role's name]`,
    `credentials:   ${problem === undefined ? 'in the environment' : problem}`,
    `seat:          ${role.seat ?? '(none)'}${at('seat')}`,
    `allow:         ${role.allow.join(', ') || '(none)'}${at('allow')}`,
    `commands:      ${role.commands.join(', ') || '(none)'}${at('commands')}`,
    `budget_share:  ${role.budgetShare ?? '(unset)'}${at('budget_share')}`,
    `reviewers:     ${role.reviewers.join(', ') || '(none)'}${at('reviewers')}`,
    `settle:        ${role.settleSeconds}s${at('settle_seconds')}`,
    `cooldown:      ${role.cooldownMinutes}m${at('cooldown_minutes')}`,
    `poll:          ${role.pollMinutes}m${at('poll_minutes')}`,
    '',
    `sources:${at('sources')}`,
  ]
  for (const s of role.sources) lines.push(`  ${s.tracker} ${s.repo}  ${s.query}`)
  if (role.sources.length === 0) lines.push('  (none)')

  lines.push('', `lane:${at('lane')}`)
  // Groups are rendered as "and", so a reader sees that each level's constraint is additional
  // rather than pooled — the whole point of conjoining them.
  const groups = (g: string[][]) => g.map((one) => one.join(' or ')).join('  and  ')
  if (role.lane.labels?.includes) lines.push(`  labels include: ${groups(role.lane.labels.includes)}`)
  if (role.lane.labels?.excludes) lines.push(`  labels exclude: ${role.lane.labels.excludes.join(', ')}`)
  if (role.lane.paths?.under) lines.push(`  paths under:    ${groups(role.lane.paths.under)}`)
  if (role.lane.age?.maxDays) lines.push(`  max age:        ${role.lane.age.maxDays} days since created`)
  if (Object.keys(role.lane).length === 0) lines.push('  (unconstrained)')

  if (role.instructions.length > 0) {
    lines.push('', `instructions:${at('instructions')}`)
    for (const block of role.instructions) {
      for (const line of block.split('\n')) lines.push(`  ${line}`)
    }
  }
  return lines.join('\n')
}
