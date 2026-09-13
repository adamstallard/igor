#!/usr/bin/env node
import { Command } from 'commander'
import { loadConfig, ConfigError } from './config.js'
import { uniqueId } from './id.js'
import { scoreEntry } from './scoring.js'
import { loadAll, takenIds, writeEntry, StoreError } from './store.js'
import type { Entry, Status } from './entry.js'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const program = new Command()
program
  .name('igor-lore')
  .description('Curated team knowledge as markdown in git')
  .option('-c, --config <path>', 'path to igor.config.yaml')

program
  .command('create')
  .description('Scaffold an entry and assign its id')
  .requiredOption('--claim <text>', 'the lesson, in a sentence or two')
  .requiredOption('--prose <text>', 'when this applies, in prose')
  .requiredOption('--author <name>', 'who is asserting this')
  .option('--scope <scope>', 'global | role:<name> | project:<name>', 'global')
  .option('--path <glob...>', 'path predicate; repeatable')
  .option('--status <status>', 'provisional | active | deprecated', 'provisional')
  .option('--body <text>', 'reasoning and exceptions')
  .action((opts) => {
    const config = loadConfig(program.opts()['config'])
    const id = uniqueId(opts.claim, takenIds(config.destination))
    const entry: Entry = {
      id,
      claim: opts.claim,
      scope: opts.scope,
      status: opts.status as Status,
      conditions: {
        ...(opts.path ? { paths: opts.path as string[] } : {}),
        prose: opts.prose,
      },
      provenance: [{ author: opts.author, at: today() }],
      supersedes: [],
      body: opts.body ?? '',
    }
    const file = writeEntry(config.destination, entry)
    process.stdout.write(`${id}\n${file}\n`)
  })

program
  .command('validate')
  .description('Report every invalid entry in the store')
  .action(() => {
    const config = loadConfig(program.opts()['config'])
    const loaded = loadAll(config.destination)
    const bad = loaded.filter((l) => l.errors.length > 0)

    for (const item of bad) {
      process.stdout.write(`${item.file}\n`)
      for (const error of item.errors) {
        process.stdout.write(`  ${error.field || '(root)'}: ${error.message}\n`)
      }
    }

    if (bad.length === 0) {
      process.stdout.write(`${loaded.length} entries, all valid\n`)
      return
    }
    process.stdout.write(`\n${bad.length} of ${loaded.length} entries invalid\n`)
    process.exitCode = 1
  })

program
  .command('list')
  .description('Show entries with support and recency derived from provenance')
  .option('--scope <scope>', 'filter by scope')
  .action((opts) => {
    const config = loadConfig(program.opts()['config'])
    const loaded = loadAll(config.destination)
    const entries = loaded
      .map((l) => l.entry)
      .filter((e): e is Entry => e !== undefined)
      .filter((e) => (opts.scope ? e.scope === opts.scope : true))

    if (entries.length === 0) {
      process.stdout.write('no entries\n')
      return
    }

    for (const entry of entries) {
      const s = scoreEntry(entry, {
        halfLifeDays: config.halfLifeDays,
        experts: config.experts,
      })
      const expert = s.expertSupport > 0 ? ` expert:${s.expertSupport}` : ''
      process.stdout.write(
        `${entry.status.padEnd(11)} support:${String(s.support).padEnd(4)} recency:${s.recency.toFixed(2)}${expert}  ${entry.id}\n` +
          `            ${entry.scope}  ${entry.claim.replace(/\s+/g, ' ').trim()}\n`,
      )
    }

    const invalid = loaded.filter((l) => l.errors.length > 0).length
    if (invalid > 0) {
      process.stdout.write(`\n${invalid} invalid entries not shown — run validate\n`)
    }
  })

try {
  program.parse()
} catch (error) {
  if (error instanceof ConfigError || error instanceof StoreError) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }
  throw error
}
