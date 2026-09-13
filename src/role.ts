import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { parse as parseYaml } from 'yaml'
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

export const COMPLETIONS = ['unassign', 'close', 'assign'] as const
export type Completion = (typeof COMPLETIONS)[number]

/** Starting points to tune against observation, not derived values. */
export const DEFAULTS = {
  settleSeconds: 10,
  cooldownMinutes: 60,
  calibrationStaleDays: 30,
  pollMinutes: 10,
} as const

export interface Source {
  tracker: string
  repo: string
  query: string
}

export interface Lane {
  labels?: { includes?: string[]; excludes?: string[] }
  paths?: { under?: string[] }
  age?: { maxDays?: number }
}

export interface Role {
  name: string
  extends: string[]
  seat?: string
  sources: Source[]
  lane: Lane
  instructions: string[]
  completion: Completion
  claim?: string
  allow: Action[]
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
  if ('name' in raw) {
    throw new RoleError(`${file} sets "name" — the filename is the name, as with lore entry ids`)
  }
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
 * Resolves `extends` depth-first into a base-to-derived ordering, so later levels override
 * earlier ones. The org base is the default parent, which is what keeps conventions from
 * drifting between roles that each restate them.
 */
function lineage(dir: string, name: string, seen: string[] = []): string[] {
  if (seen.includes(name)) {
    throw new RoleError(`role inheritance cycles: ${[...seen, name].join(' -> ')}`)
  }
  const raw = readRoleFile(dir, name)
  const parents = strArray(raw['extends'], `${name}.extends`)
  const implicit = parents.length === 0 && name !== ORG_ROLE && existsSync(join(dir, ROLES_DIR, `${ORG_ROLE}.yaml`))
  const resolved = implicit ? [ORG_ROLE] : parents

  const out: string[] = []
  for (const parent of resolved) {
    for (const ancestor of lineage(dir, parent, [...seen, name])) {
      if (!out.includes(ancestor)) out.push(ancestor)
    }
  }
  out.push(name)
  return out
}

function mergeLane(base: Lane, next: Lane): Lane {
  // Append: constraints accumulate, so an org exclusion cannot be escaped by a role adding
  // its own. Narrowing is the only direction available.
  const merged: Lane = {}
  const labels = {
    includes: [...(base.labels?.includes ?? []), ...(next.labels?.includes ?? [])],
    excludes: [...(base.labels?.excludes ?? []), ...(next.labels?.excludes ?? [])],
  }
  if (labels.includes.length || labels.excludes.length) {
    merged.labels = {
      ...(labels.includes.length ? { includes: [...new Set(labels.includes)] } : {}),
      ...(labels.excludes.length ? { excludes: [...new Set(labels.excludes)] } : {}),
    }
  }
  const under = [...(base.paths?.under ?? []), ...(next.paths?.under ?? [])]
  if (under.length) merged.paths = { under: [...new Set(under)] }

  const maxDays = [base.age?.maxDays, next.age?.maxDays].filter((d): d is number => d !== undefined)
  if (maxDays.length) merged.age = { maxDays: Math.min(...maxDays) }
  return merged
}

function parseLane(v: unknown, where: string): Lane {
  if (v === undefined) return {}
  if (!isRecord(v)) throw new RoleError(`${where}.lane must be a mapping`)
  const lane: Lane = {}
  const labels = v['labels']
  if (labels !== undefined) {
    if (!isRecord(labels)) throw new RoleError(`${where}.lane.labels must be a mapping`)
    const includes = strArray(labels['includes'], `${where}.lane.labels.includes`)
    const excludes = strArray(labels['excludes'], `${where}.lane.labels.excludes`)
    lane.labels = {
      ...(includes.length ? { includes } : {}),
      ...(excludes.length ? { excludes } : {}),
    }
  }
  const paths = v['paths']
  if (paths !== undefined) {
    if (!isRecord(paths)) throw new RoleError(`${where}.lane.paths must be a mapping`)
    const under = strArray(paths['under'], `${where}.lane.paths.under`)
    if (under.length) lane.paths = { under }
  }
  const age = v['age']
  if (age !== undefined) {
    if (!isRecord(age)) throw new RoleError(`${where}.lane.age must be a mapping`)
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
    for (const key of ['tracker', 'repo', 'query'] as const) {
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

/**
 * Merges a lineage into one effective role, recording which level each value came from.
 *
 * Three semantics, because "a role may narrow but never loosen" only makes sense for
 * permissions — a different completion action is not more or less permissive, just different.
 */
export function resolveRole(dir: string, name: string): ResolvedRole {
  const levels = lineage(dir, name)
  const from: Provenance = {}

  let allow: Action[] | undefined
  let budgetShare: number | undefined
  let lane: Lane = {}
  const instructions: string[] = []
  let sources: Source[] = []
  let completion: Completion | undefined
  let claim: string | undefined
  let seat: string | undefined
  let reviewers: string[] = []
  let settleSeconds: number = DEFAULTS.settleSeconds
  let cooldownMinutes: number = DEFAULTS.cooldownMinutes
  let pollMinutes: number = DEFAULTS.pollMinutes

  for (const level of levels) {
    const raw = readRoleFile(dir, level)

    const levelAllow = parseAllow(raw['allow'], level)
    if (levelAllow !== undefined) {
      if (allow !== undefined) {
        // Monotonic: a role may restrict what it inherits and never widen it, or it could
        // escalate its own permissions simply by declaring more.
        const widened = levelAllow.filter((a) => !allow!.includes(a))
        if (widened.length > 0) {
          throw new RoleError(
            `role "${level}" widens allow with ${widened.join(', ')}, which it does not inherit. ` +
              `A role may restrict an inherited permission, never add one.`,
          )
        }
      }
      allow = levelAllow
      from['allow'] = level
    }

    const share = raw['budget_share']
    if (share !== undefined) {
      if (typeof share !== 'number' || share <= 0 || share > 1) {
        throw new RoleError(`${level}.budget_share must be a number between 0 and 1`)
      }
      if (budgetShare !== undefined && share > budgetShare) {
        throw new RoleError(
          `role "${level}" raises budget_share to ${share} above the inherited ${budgetShare}`,
        )
      }
      budgetShare = share
      from['budget_share'] = level
    }

    const levelLane = parseLane(raw['lane'], level)
    if (Object.keys(levelLane).length > 0) {
      lane = mergeLane(lane, levelLane)
      from['lane'] = from['lane'] ? `${from['lane']}, ${level}` : level
    }

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

    if (raw['completion'] !== undefined) {
      const value = raw['completion']
      if (typeof value !== 'string' || !(COMPLETIONS as readonly string[]).includes(value)) {
        throw new RoleError(`${level}.completion must be one of ${COMPLETIONS.join(', ')}`)
      }
      completion = value as Completion
      from['completion'] = level
    }

    for (const [key, assign] of [
      ['claim', (v: string) => (claim = v)],
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
  const effectiveCompletion = completion ?? 'unassign'

  // A role forbidden from closing could otherwise close by naming it as its completion.
  if (!effectiveAllow.includes(effectiveCompletion)) {
    throw new RoleError(
      `role "${name}" completes with "${effectiveCompletion}" but that action is not in its ` +
        `effective allow (${effectiveAllow.join(', ') || 'empty'}). Completion must be permitted.`,
    )
  }

  return {
    role: {
      name,
      extends: levels.slice(0, -1),
      ...(seat === undefined ? {} : { seat }),
      sources,
      lane,
      instructions,
      completion: effectiveCompletion,
      ...(claim === undefined ? {} : { claim }),
      allow: effectiveAllow,
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

export function loadRole(config: Config, name: string): ResolvedRole {
  const available = listRoles(config.destination)
  if (available.length === 0) {
    throw new RoleError(
      `no roles in ${join(config.destination, ROLES_DIR)}.\n` +
        `A role describes one Igor: what it watches, what it may do, and which seat it spends.\n` +
        `Start with ${ORG_ROLE}.yaml holding what every role in the org inherits.`,
    )
  }
  return resolveRole(config.destination, name)
}

/** Renders the effective role with the level each value came from — the point of `explain`. */
export function explainRole({ role, from }: ResolvedRole): string {
  const at = (key: string) => (from[key] ? `  [${from[key]}]` : '  [default]')
  const lines = [
    `role: ${role.name}`,
    role.extends.length ? `inherits: ${role.extends.join(' -> ')}` : 'inherits: nothing',
    '',
    `seat:          ${role.seat ?? '(none)'}${at('seat')}`,
    `completion:    ${role.completion}${at('completion')}`,
    `allow:         ${role.allow.join(', ') || '(none)'}${at('allow')}`,
    `budget_share:  ${role.budgetShare ?? '(unset)'}${at('budget_share')}`,
    `claim:         ${role.claim ?? '(default)'}${at('claim')}`,
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
  if (role.lane.labels?.includes) lines.push(`  labels include: ${role.lane.labels.includes.join(', ')}`)
  if (role.lane.labels?.excludes) lines.push(`  labels exclude: ${role.lane.labels.excludes.join(', ')}`)
  if (role.lane.paths?.under) lines.push(`  paths under:    ${role.lane.paths.under.join(', ')}`)
  if (role.lane.age?.maxDays) lines.push(`  max age:        ${role.lane.age.maxDays} days`)
  if (Object.keys(role.lane).length === 0) lines.push('  (unconstrained)')

  if (role.instructions.length > 0) {
    lines.push('', `instructions:${at('instructions')}`)
    for (const block of role.instructions) {
      for (const line of block.split('\n')) lines.push(`  ${line}`)
    }
  }
  return lines.join('\n')
}
