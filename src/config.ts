import { readFileSync, existsSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'

export const DEFAULT_CONFIG_FILENAME = 'igor.config.yaml'
export const DEFAULT_HALF_LIFE_DAYS = 365

export interface Config {
  /** Absolute path to the repository or directory entries are written to. */
  destination: string
  /** Any one of these may approve an entry; also the escalation target. */
  reviewers: string[]
  /** Authors whose provenance carries extra weight. */
  experts: string[]
  halfLifeDays: number
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

  return {
    destination,
    reviewers: requireStringArray(data['reviewers'], 'reviewers'),
    experts: requireStringArray(data['experts'], 'experts'),
    halfLifeDays,
  }
}

export function loadConfig(configPath?: string): Config {
  const path = resolve(configPath ?? DEFAULT_CONFIG_FILENAME)
  if (!existsSync(path)) {
    throw new ConfigError(
      `no config at ${path} — copy ${DEFAULT_CONFIG_FILENAME}.example and set a destination`,
    )
  }
  return resolveConfig(parseYaml(readFileSync(path, 'utf8')), dirname(path))
}
