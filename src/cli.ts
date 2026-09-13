#!/usr/bin/env node
import { Command } from 'commander'
import { loadConfig, ConfigError } from './config.js'
import { uniqueId } from './id.js'
import { scoreEntry } from './scoring.js'
import { loadAll, takenIds, writeEntry, serialize, StoreError } from './store.js'
import { propose, ProposeError } from './propose.js'
import { reconcile } from './reconcile.js'
import { GitHubError } from './github.js'
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

program
  .command('propose')
  .description('Open a pull request per dominant author proposing candidate entries')
  .requiredOption('--from <dir>', 'directory of candidate entry files')
  .action(async (opts) => {
    const config = loadConfig(program.opts()['config'])
    const candidates = loadAll(opts.from)
    const bad = candidates.filter((c) => c.errors.length > 0)
    if (bad.length > 0) {
      for (const item of bad) {
        process.stderr.write(`${item.file}\n`)
        for (const e of item.errors) process.stderr.write(`  ${e.field || '(root)'}: ${e.message}\n`)
      }
      throw new ProposeError(`${bad.length} candidate(s) invalid — refusing to propose`)
    }
    const entries = candidates.map((c) => c.entry!).filter((e) => !takenIds(config.destination).has(e.id))
    if (entries.length !== candidates.length) {
      process.stdout.write(
        `skipping ${candidates.length - entries.length} candidate(s) already in the store\n`,
      )
    }

    for (const r of await propose(config, entries, serialize)) {
      process.stdout.write(
        `${r.pr.url}\n  assigned: ${r.author}${r.reviewers.length ? `  reviewers: ${r.reviewers.join(', ')}` : ''}\n  ${r.entries.join(', ')}\n`,
      )
    }
  })

program
  .command('reconcile')
  .description('Promote merged entries, report declines, and flag stale pull requests')
  .option('--stale-after <days>', 'days without activity before a pull request is stale', '7')
  .action(async (opts) => {
    const config = loadConfig(program.opts()['config'])
    const r = await reconcile(config, { staleAfterDays: Number(opts.staleAfter) })

    for (const p of r.promoted) process.stdout.write(`promoted  ${p.id}  by ${p.by} on ${p.at}\n`)
    for (const d of r.declined) process.stdout.write(`declined  ${d.id}  (pr #${d.pr})\n`)
    for (const s of r.stale) {
      process.stdout.write(
        `stale     #${s.pr} last active ${s.lastActivity}, assigned ${s.assignees.join(', ') || '(nobody)'} — escalate to ${config.reviewers.join(', ') || '(no store reviewers configured)'}\n  ${s.url}\n`,
      )
    }
    if (r.deferred.length > 0) {
      process.stdout.write(`deferred  ${r.deferred.map((n) => `#${n}`).join(', ')} (closed unmerged)\n`)
    }
    if (r.promoted.length === 0 && r.declined.length === 0 && r.stale.length === 0) {
      process.stdout.write('nothing to reconcile\n')
    }
    if (r.declined.length > 0) {
      process.stdout.write(
        '\nDeclines assume the checkout is current. Pull the destination before trusting them.\n',
      )
    }
    if (r.promoted.length > 0) {
      process.stdout.write('\nPromotions edited files locally — commit and push them.\n')
    }
  })

try {
  await program.parseAsync()
} catch (error) {
  if (
    error instanceof ConfigError ||
    error instanceof StoreError ||
    error instanceof ProposeError ||
    error instanceof GitHubError
  ) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }
  throw error
}
