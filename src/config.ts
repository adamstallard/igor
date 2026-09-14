import { readFileSync, existsSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { parseOrgBudget, type OrgBudget } from './budget.js'

export const DEFAULT_CONFIG_FILENAME = 'igor.config.yaml'
export const EXAMPLE_CONFIG_FILENAME = 'igor.config.example.yaml'
export const DEFAULT_HALF_LIFE_DAYS = 365

export interface Config {
  /** Absolute path to the repository or directory entries are written to. */
  destination: string
  /** Any one of these may approve an entry; also the escalation target. */
  reviewers: string[]
  /** Authors whose provenance carries extra weight. */
  experts: string[]
  halfLifeDays: number
  /**
   * Whether the destination repository is public. Declared so the provenance guard works
   * without a network call; looked up when absent.
   */
  publicStore?: boolean
  /** Seats and pools an Igor may spend from. Absent means budget is not being enforced. */
  budget: OrgBudget
}

export class ConfigError extends Error {}

/** The root of the Igor installation — lore must never be written inside it. */
export function igorRoot(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '..')
}

function isInside(child: string, parent: string): boolean {
  const rel = relative(parent, child)
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
}

function requireStringArray(value: unknown, field: string): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new ConfigError(`${field} must be a list of names`)
  }
  return value as string[]
}

export function resolveConfig(raw: unknown, configDir: string): Config {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError('config must be a mapping')
  }
  const data = raw as Record<string, unknown>

  const destinationRaw = data['destination']
  if (typeof destinationRaw !== 'string' || destinationRaw.trim() === '') {
    throw new ConfigError(
      'destination is required — lore belongs to the operating team, so there is no sensible default',
    )
  }
  const destination = resolve(configDir, destinationRaw)

  // The enforcement half of keeping private material out of a repo that may go public.
  if (isInside(destination, igorRoot())) {
    throw new ConfigError(
      `destination ${destination} resolves inside the Igor installation — lore belongs to the operating team, not to Igor`,
    )
  }

  const scoring = data['scoring']
  let halfLifeDays = DEFAULT_HALF_LIFE_DAYS
  if (scoring !== undefined) {
    if (typeof scoring !== 'object' || scoring === null || Array.isArray(scoring)) {
      throw new ConfigError('scoring must be a mapping')
    }
    const value = (scoring as Record<string, unknown>)['halfLifeDays']
    if (value !== undefined) {
      if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new ConfigError('scoring.halfLifeDays must be a positive number of days')
      }
      halfLifeDays = value
    }
  }

  const publicStore = data['publicStore']
  if (publicStore !== undefined && typeof publicStore !== 'boolean') {
    throw new ConfigError('publicStore must be true or false')
  }

  return {
    destination,
    budget: parseOrgBudget(data['budget']),
    reviewers: requireStringArray(data['reviewers'], 'reviewers'),
    experts: requireStringArray(data['experts'], 'experts'),
    halfLifeDays,
    ...(publicStore === undefined ? {} : { publicStore }),
  }
}

/**
 * Walks up from a starting directory looking for the config, the way git and eslint do.
 * Running the tool anywhere inside the destination repository then just works.
 */
export function findConfig(startDir: string = process.cwd()): string | undefined {
  let dir = resolve(startDir)
  for (;;) {
    const candidate = resolve(dir, DEFAULT_CONFIG_FILENAME)
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

export function loadConfig(configPath?: string): Config {
  const explicit = configPath ?? process.env['IGOR_CONFIG']
  const path = explicit === undefined ? findConfig() : resolve(explicit)

  if (path === undefined) {
    throw new ConfigError(
      `no ${DEFAULT_CONFIG_FILENAME} found here or in any parent directory.\n` +
        `It belongs in the repository holding your lore, committed, so the whole team shares\n` +
        `one set of values. Copy ${EXAMPLE_CONFIG_FILENAME} there and set destination: .`,
    )
  }

  // Checked before the file even has to exist: pointing at a path inside Igor is a
  // misunderstanding of where config lives, and saying so beats "no config at ...".
  // Igor is a public tool everyone shares; this file describes one team.
  if (isInside(path, igorRoot())) {
    throw new ConfigError(
      `${path} is inside the Igor installation.\n` +
        `Igor is the tool and is shared; this config describes your team, so it belongs in the\n` +
        `repository holding your lore — committed, with destination: . — not in a clone of Igor.`,
    )
  }

  if (!existsSync(path)) {
    throw new ConfigError(`no config at ${path}`)
  }

  return resolveConfig(parseYaml(readFileSync(path, 'utf8')), dirname(path))
}
