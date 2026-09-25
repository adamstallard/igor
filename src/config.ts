import { execFileSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseYaml } from 'yaml'
import { parseOrgBudget, type OrgBudget } from './budget.js'
import { keyCheck } from './keys.js'

export const DEFAULT_CONFIG_FILENAME = 'igor.config.yaml'
export const EXAMPLE_CONFIG_FILENAME = 'igor.config.example.yaml'

export interface Config {
  /** Absolute path to the repository or directory entries are written to. */
  destination: string
  /** Any one of these may approve an entry; also the escalation target. */
  reviewers: string[]
  /** Authors whose provenance carries extra weight. */
  experts: string[]
  /**
   * Whether the destination repository is public. Declared so the provenance guard works
   * without a network call; looked up when absent.
   */
  publicStore?: boolean
  /** Seats and pools an Igor may spend from. Absent means budget is not being enforced. */
  budget: OrgBudget
}

export class ConfigError extends Error {}

const refuseUnknownKeys = keyCheck(ConfigError)

/** Every key this file may name. Anything else is refused by name — see `keyCheck`. */
const CONFIG_KEYS = ['destination', 'reviewers', 'experts', 'publicStore', 'budget']

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

/**
 * Variables that answer "which repository" for somewhere other than the directory asked about.
 * `-C <dir>` is the whole question, and an inherited `GIT_DIR` silently makes it a different one
 * — git exports it to `filter-branch` and `submodule foreach` — so a nested store reads as a
 * root. The ones that merely bound the search upward from `dir` are left alone: they can only
 * cause a refusal, never an acceptance.
 */
const GIT_REDIRECTS = ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']

/**
 * Where a directory sits inside its git repository: the path down from the root, with a
 * trailing slash, and empty at the root itself.
 *
 * Three questions in one `rev-parse`, which answers them in the order given, one line each.
 * `--show-prefix` alone is not enough twice over: a bare repository and anything inside a gitdir
 * both report an empty prefix, and neither is a place a store can be. A path that git cannot be
 * made to place at all is refused rather than read as a root.
 *
 * The prefix is everything after the fixed answers, with only the terminating newline taken off,
 * because git emits the path raw and a directory's name may legally begin with a space or
 * contain a newline. Take one line, or trim it, and the prefix names a directory that is not the
 * store.
 */
function storePrefix(dir: string): string {
  const env = { ...process.env }
  for (const name of GIT_REDIRECTS) delete env[name]

  let out: string
  try {
    out = execFileSync(
      'git',
      ['-C', dir, 'rev-parse', '--is-bare-repository', '--is-inside-work-tree', '--show-prefix'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env },
    )
  } catch (e) {
    const failure = e as { status?: number | null; stderr?: string; message?: string }
    // A null status is a spawn that happened and produced no exit code — git absent from PATH,
    // not executable, killed — and naming the destination there sends somebody to inspect a path
    // that is correct. An absent status is the opposite: no spawn happened, because the
    // destination is a string git cannot be handed, so the destination is exactly what is wrong.
    if (failure.status === null) {
      throw new ConfigError(
        `git could not be run, so where ${dir} sits in its repository is unknown. Igor reads the ` +
          `store from a git checkout, so git has to be on PATH.\n${failure.message ?? ''}`.trim(),
      )
    }
    // git's own line, because exit 128 is not only "not a repository": dubious ownership on a
    // bind mount or a CI container is a valid store that git declines to read, and the remedy is
    // in the sentence git prints and nowhere else.
    const said = String(failure.stderr ?? '').trim() || String(failure.message ?? '')
    throw new ConfigError(
      `destination ${dir} cannot be used as a store: git could not say where it sits. The store ` +
        `is a repository of its own, at its root, and a path whose place in one cannot be read ` +
        `must not be taken for a root.\ngit: ${said}`,
    )
  }

  const lines = out.replace(/\n$/, '').split('\n')
  if (lines.length < 3) {
    // Fail closed. An answer that cannot be parsed is an unknown place, and the one outcome that
    // must not happen is an unknown place read as the root.
    throw new ConfigError(
      `destination ${dir}: git answered three questions with ${lines.length} lines, so where it ` +
        `sits in its repository is unknown and must not be taken for its root`,
    )
  }

  if (lines[0] === 'true') {
    throw new ConfigError(
      `destination ${dir} is a bare git repository, which has no work tree — the store is files ` +
        `on disk at the root of a checkout`,
    )
  }
  if (lines[1] !== 'true') {
    throw new ConfigError(
      `destination ${dir} is inside a gitdir rather than a work tree — git ignores everything ` +
        `under one, so nothing written there could ever be committed`,
    )
  }
  return lines.slice(2).join('\n')
}

export function resolveConfig(raw: unknown, configDir: string): Config {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new ConfigError('config must be a mapping')
  }
  const data = raw as Record<string, unknown>
  // Before the required-key check, so a misspelt `destination` is reported as the typo it is
  // rather than as an absence.
  refuseUnknownKeys(data, CONFIG_KEYS, 'config', 'a config key')

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

  const publicStore = data['publicStore']
  if (publicStore !== undefined && typeof publicStore !== 'boolean') {
    throw new ConfigError('publicStore must be true or false')
  }

  return {
    destination,
    budget: parseOrgBudget(data['budget']),
    reviewers: requireStringArray(data['reviewers'], 'reviewers'),
    experts: requireStringArray(data['experts'], 'experts'),
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

  const config = resolveConfig(parseYaml(readFileSync(path, 'utf8')), dirname(path))

  // After `resolveConfig`, so the refusals it makes from the path alone — a missing destination,
  // one inside the Igor installation — are answered without shelling out, and the git question is
  // asked only of a destination that got that far.
  const prefix = storePrefix(config.destination)
  if (prefix !== '') {
    throw new ConfigError(
      `destination ${config.destination} sits at ${prefix} within its repository, not at its ` +
        `root. A nested store takes the host repository's access, visibility and lifecycle — who ` +
        `may push there becomes who may propose an entry, a public host makes the store public, ` +
        `and archiving or transferring the project takes the team's lore with it — which is why ` +
        `the root is the only place a store may be.`,
    )
  }

  return config
}
