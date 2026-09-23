import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
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

/**
 * Where a rejected candidate's record goes, beside the entries rather than on the state
 * branch: it records a person's decision, so it must survive anything a machine can lose.
 */
export const REJECTED_DIR = 'rejected'

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

function rejectedDir(destination: string): string {
  return join(destination, REJECTED_DIR)
}

function markdownIn(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => join(dir, f))
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

/** Parses entry text that never reached disk — a candidate read back out of a pull request. */
export function parseEntry(file: string, raw: string): LoadedEntry {
  return parse(file, raw)
}

export function listFiles(destination: string): string[] {
  return markdownIn(entriesDir(destination))
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
 * A candidate a reviewer deleted from a proposal, rather than an entry.
 *
 * It is kept so the id is never proposed again, and so a later reader can see what was turned
 * down: the candidate's own file is gone by the time this is written.
 */
export interface Rejection {
  id: string
  /** Whoever merged the proposal the deletion came in. */
  by: string
  /** ISO date of that merge. */
  at: string
  pr: number
  /** The candidate as proposed, where its text could still be read back. */
  entry?: Entry
}

export function serializeRejection(rejection: Rejection): string {
  const { id, by, at, pr, entry } = rejection
  const front: Record<string, unknown> = { id, rejected: { by, at, pr } }
  if (entry !== undefined) {
    front['claim'] = entry.claim
    front['scope'] = entry.scope
    front['conditions'] = entry.conditions
    front['provenance'] = entry.provenance
  }
  const yaml = stringifyYaml(front, { lineWidth: 88 }).trimEnd()
  // The reversal is written into the record itself: a person holding one file needs no docs.
  const lead = `Delete this file to un-reject \`${id}\`, which makes it proposable again.`
  const body = entry?.body.trim() ?? ''
  return `---\n${yaml}\n---\n\n${lead}\n${body ? `\n${body}\n` : ''}`
}

export function writeRejection(destination: string, rejection: Rejection): string {
  const dir = rejectedDir(destination)
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${rejection.id}.md`)
  writeFileSync(file, serializeRejection(rejection), 'utf8')
  return file
}

/** Ids a person has rejected. Removing the file is how a rejection is undone. */
export function rejectedIds(destination: string): Set<string> {
  return new Set(markdownIn(rejectedDir(destination)).map((f) => basename(f, '.md')))
}

export interface CreateTarget {
  dir: string
  taken: Set<string>
  /**
   * What the destination checkout itself holds, kept apart by kind so a caller can tell a
   * collision the person can already see from one only the branch knows about.
   */
  checkout: { taken: Set<string>; rejected: Set<string> }
}

/**
 * Where `create` writes, and the ids it may not reuse there.
 *
 * `into` names a candidate directory outside the store, laid out the same way so that
 * `propose --from` reads back what was written.
 *
 * Ids are taken against the store as well as the target, because `propose` drops a candidate
 * whose id is already in the store — a collision left to be found there costs the work of
 * writing an entry under an id that was never free. Rejected ids count as taken for the same
 * reason, and because a rule raised again on new evidence deserves its own id rather than a
 * dead one's.
 *
 * `upstream` carries the ids the store holds on the branch a proposal lands on, which this
 * checkout may be behind: an id free here and taken there is one `propose` cannot take. The
 * caller reads it, because this module reaches no further than the filesystem.
 *
 * The directory itself must be there already. `entries/` beneath it is layout the tool owns,
 * but a mistyped path would otherwise be created in full and look like it worked.
 */
export function createTarget(
  destination: string,
  into?: string,
  upstream: ReadonlySet<string> = new Set(),
): CreateTarget {
  const checkout = { taken: takenIds(destination), rejected: rejectedIds(destination) }
  const inStore = new Set([...checkout.taken, ...checkout.rejected, ...upstream])
  if (into === undefined) return { dir: destination, taken: inStore, checkout }
  const dir = resolve(into)
  if (!existsSync(dir) || !statSync(dir).isDirectory()) {
    throw new StoreError(`${dir} is not a directory — create it before writing into it`)
  }
  return { dir, taken: new Set([...inStore, ...takenIds(dir)]), checkout }
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
