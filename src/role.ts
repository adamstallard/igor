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
  pollMinutes: 10,
} as const

export interface Source {
  tracker: string
  repo: string
  query: string
}

/**
 * Inclusive constraints are a **conjunction of disjunctions**: a candidate satisfies a group by
 * matching any member, and it must satisfy every group. Extending a role adds a group, which
 * narrows; combining two roles crosses their groups, which widens. See `mergeLane` and
 * `unionLane`.
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
 * The parents a role actually inherits from. The org base is the default parent, which is what
 * keeps conventions from drifting between roles that each restate them.
 */
function parentsOf(dir: string, name: string): string[] {
  const raw = readRoleFile(dir, name)
  const declared = strArray(raw['extends'], `${name}.extends`)
  const implicit =
    declared.length === 0 && name !== ORG_ROLE && existsSync(join(dir, ROLES_DIR, `${ORG_ROLE}.yaml`))
  return implicit ? [ORG_ROLE] : declared
}

/**
 * Resolves `extends` depth-first into a base-to-derived ordering, so later levels override
 * earlier ones. Used for the order-sensitive fields — instructions, settings, provenance.
 * Permissions and lanes are resolved over the inheritance graph instead, because a flat list
 * cannot tell a parent from a sibling. See `capabilitiesOf`.
 */
function lineage(dir: string, name: string, seen: string[] = []): string[] {
  if (seen.includes(name)) {
    throw new RoleError(`role inheritance cycles: ${[...seen, name].join(' -> ')}`)
  }
  const resolved = parentsOf(dir, name)

  const out: string[] = []
  for (const parent of resolved) {
    for (const ancestor of lineage(dir, parent, [...seen, name])) {
      if (!out.includes(ancestor)) out.push(ancestor)
    }
  }
  out.push(name)
  return out
}

/**
 * Combines two *sibling* lanes: an Igor that does two jobs works on what either job covers.
 *
 * Inclusive constraints are a conjunction of disjunctions, and a union of two of those is still
 * expressible as one — `(a and b) or c` distributes to `(a or c) and (b or c)` — so the cross
 * product of the two sides' groups is the union. An unconstrained side unions to unconstrained,
 * since "anything, or this" is anything.
 *
 * Exclusions are unioned rather than intersected. Strict set algebra would intersect them, but
 * an exclusion is a safety rail and over-excluding is the direction to be wrong in. In practice
 * siblings share their exclusions through a common ancestor, so the two rarely differ.
 */
function unionLane(a: Lane, b: Lane): Lane {
  const merged: Lane = {}

  const cross = (x?: string[][], y?: string[][]): string[][] | undefined => {
    if (x === undefined || y === undefined) return undefined // unconstrained wins
    return x.flatMap((left) => y.map((right) => [...new Set([...left, ...right])]))
  }

  const includes = cross(a.labels?.includes, b.labels?.includes)
  const excludes = [...new Set([...(a.labels?.excludes ?? []), ...(b.labels?.excludes ?? [])])]
  if (includes || excludes.length) {
    merged.labels = { ...(includes ? { includes } : {}), ...(excludes.length ? { excludes } : {}) }
  }

  const under = cross(a.paths?.under, b.paths?.under)
  if (under) merged.paths = { under }

  // The looser bound: an item old enough for either job is in the combined lane.
  const ages = [a.age?.maxDays, b.age?.maxDays]
  if (ages.every((d) => d !== undefined)) merged.age = { maxDays: Math.max(...(ages as number[])) }
  return merged
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
  const lane: Lane = {}
  const labels = v['labels']
  if (labels !== undefined) {
    if (!isRecord(labels)) throw new RoleError(`${where}.lane.labels must be a mapping`)
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
    const under = strArray(paths['under'], `${where}.lane.paths.under`)
    if (under.length) lane.paths = { under: [under] }
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

interface Capabilities {
  allow?: Action[]
  lane: Lane
  budgetShare?: number
  allowFrom: string[]
  laneFrom: string[]
  shareFrom: string[]
}

/**
 * Resolves permissions and lane over the inheritance *graph* rather than a flattened list,
 * because the two directions mean opposite things.
 *
 * **Siblings union. Levels conjoin.** An Igor listing two parents does both jobs, so its lane
 * covers what either covers; an Igor extending one parent is a narrower version of it. A flat
 * ordering cannot express that difference, and reading a sibling as a descendant produces two
 * wrong answers at once: a combined Igor whose lane is the intersection of its jobs, and thus
 * matches almost nothing, and a spurious "widens allow" error when one sibling permits
 * something another does not.
 *
 * Safety survives the union: a union of two parents is still bounded by what they share above
 * them, so combining roles can never reach past their common ancestor.
 */
function capabilitiesOf(dir: string, name: string, seen: string[] = []): Capabilities {
  if (seen.includes(name)) {
    throw new RoleError(`role inheritance cycles: ${[...seen, name].join(' -> ')}`)
  }
  const raw = readRoleFile(dir, name)
  const inherited = parentsOf(dir, name).map((p) => capabilitiesOf(dir, p, [...seen, name]))

  let allow: Action[] | undefined
  let lane: Lane | undefined
  let budgetShare: number | undefined
  const allowFrom: string[] = []
  const laneFrom: string[] = []
  const shareFrom: string[] = []

  for (const parent of inherited) {
    if (parent.allow !== undefined) {
      allow = allow === undefined ? parent.allow : [...new Set([...allow, ...parent.allow])]
      allowFrom.push(...parent.allowFrom)
    }
    lane = lane === undefined ? parent.lane : unionLane(lane, parent.lane)
    laneFrom.push(...parent.laneFrom)
    if (parent.budgetShare !== undefined) {
      // A ceiling: take the most restrictive parent, so combining roles cannot raise it.
      budgetShare = budgetShare === undefined ? parent.budgetShare : Math.min(budgetShare, parent.budgetShare)
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
    lane: lane ?? {},
    ...(budgetShare === undefined ? {} : { budgetShare }),
    allowFrom: [...new Set(allowFrom)],
    laneFrom: [...new Set(laneFrom)],
    shareFrom: [...new Set(shareFrom)],
  }
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

  const caps = capabilitiesOf(dir, name)
  const allow = caps.allow
  const budgetShare = caps.budgetShare
  const lane = caps.lane
  if (caps.allowFrom.length) from['allow'] = caps.allowFrom.join(', ')
  if (caps.laneFrom.length) from['lane'] = caps.laneFrom.join(', ')
  if (caps.shareFrom.length) from['budget_share'] = caps.shareFrom.join(', ')

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
