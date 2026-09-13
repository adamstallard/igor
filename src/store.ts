import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import matter from 'gray-matter'
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml'
import { validateFrontmatter, type Entry, type ValidationError } from './entry.js'

/** One YAML implementation for both directions, so a write always reads back. */
const yamlEngine = {
  parse: (input: string) => parseYaml(input) as object,
  stringify: (input: object) => stringifyYaml(input),
}

/**
 * YAML parses an unquoted `2026-03-14` into a Date. Dates are strings everywhere in an
 * entry, and a person hand-authoring one will not quote them, so coerce on read rather
 * than demanding quotes.
 */
function normalizeDates(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (Array.isArray(value)) return value.map(normalizeDates)
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, normalizeDates(v)]),
    )
  }
  return value
}

export const ENTRIES_DIR = 'entries'

export interface LoadedEntry {
  entry?: Entry
  file: string
  id: string
  errors: ValidationError[]
}

export class StoreError extends Error {}

function entriesDir(destination: string): string {
  return join(destination, ENTRIES_DIR)
}

function entryPath(destination: string, id: string): string {
  return join(entriesDir(destination), `${id}.md`)
}

/** Frontmatter key order, so diffs stay stable across rewrites. */
const KEY_ORDER = [
  'id',
  'claim',
  'scope',
  'status',
  'conditions',
  'provenance',
  'supersedes',
  'reviewed',
] as const

export function serialize(entry: Entry): string {
  const { body, ...rest } = entry
  const ordered: Record<string, unknown> = {}
  for (const key of KEY_ORDER) {
    const value = (rest as Record<string, unknown>)[key]
    if (value !== undefined) ordered[key] = value
  }
  const front = stringifyYaml(ordered, { lineWidth: 88 }).trimEnd()
  const text = body.trim()
  return `---\n${front}\n---\n\n${text}${text ? '\n' : ''}`
}

function parse(file: string, raw: string): LoadedEntry {
  const id = basename(file, '.md')
  const parsed = matter(raw, { engines: { yaml: yamlEngine } })
  const data = normalizeDates(parsed.data) as Record<string, unknown>
  const errors = validateFrontmatter(data)

  const declared = data['id']
  if (typeof declared === 'string' && declared !== id) {
    errors.push({
      field: 'id',
      message: `is "${declared}" but the file is named "${id}" — an entry is located by filename`,
    })
  }

  if (errors.length > 0) return { file, id, errors }
  return {
    file,
    id,
    errors: [],
    entry: { ...(data as unknown as Omit<Entry, 'body'>), body: parsed.content.trim() },
  }
}

export function listFiles(destination: string): string[] {
  const dir = entriesDir(destination)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => join(dir, f))
}

/** Loads every entry, valid or not, so validation can report a whole store in one pass. */
export function loadAll(destination: string): LoadedEntry[] {
  return listFiles(destination).map((file) => parse(file, readFileSync(file, 'utf8')))
}

export function loadEntry(destination: string, id: string): LoadedEntry {
  const file = entryPath(destination, id)
  if (!existsSync(file)) throw new StoreError(`no entry "${id}" in ${entriesDir(destination)}`)
  return parse(file, readFileSync(file, 'utf8'))
}

export function writeEntry(destination: string, entry: Entry): string {
  const errors = validateFrontmatter({ ...entry, body: undefined })
  if (errors.length > 0) {
    const detail = errors.map((e) => `  ${e.field || '(root)'}: ${e.message}`).join('\n')
    throw new StoreError(`refusing to write an invalid entry:\n${detail}`)
  }
  const dir = entriesDir(destination)
  mkdirSync(dir, { recursive: true })
  const file = entryPath(destination, entry.id)
  writeFileSync(file, serialize(entry), 'utf8')
  return file
}

export function takenIds(destination: string): Set<string> {
  return new Set(listFiles(destination).map((f) => basename(f, '.md')))
}

/**
 * Maps a superseded id to the entry that replaced it. A fire against a superseded entry
 * should follow this rather than counting as a miss.
 */
export function supersessionIndex(entries: readonly Entry[]): Map<string, string> {
  const index = new Map<string, string>()
  for (const entry of entries) {
    for (const old of entry.supersedes) index.set(old, entry.id)
  }
  return index
}

/**
 * Follows supersession to the entry that currently stands. Returns undefined when the
 * chain leads nowhere; cycles resolve to the last id reached rather than looping.
 */
export function resolveCurrent(
  id: string,
  entries: readonly Entry[],
): Entry | undefined {
  const byId = new Map(entries.map((e) => [e.id, e]))
  const index = supersessionIndex(entries)
  const seen = new Set<string>()
  let current = id
  while (!byId.has(current)) {
    const next = index.get(current)
    if (next === undefined || seen.has(next)) return undefined
    seen.add(next)
    current = next
  }
  // The id exists, but may itself have been superseded by a later entry.
  while (index.has(current) && !seen.has(current)) {
    seen.add(current)
    const next = index.get(current)!
    if (!byId.has(next)) break
    current = next
  }
  return byId.get(current)
}
