#!/usr/bin/env node
import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Command } from 'commander'
import { loadConfig, igorRoot, ConfigError } from './config.js'
import { uniqueId } from './id.js'
import { scoreEntry } from './scoring.js'
import {
  loadAll,
  takenIds,
  writeEntry,
  serialize,
  createTarget,
  StoreError,
  ENTRIES_DIR,
} from './store.js'
import { propose, ProposeError } from './propose.js'
import { reconcile, promoteInPlace } from './reconcile.js'
import { GitHubError } from './github.js'
import { explainRole, loadRole, rolesFrom, RoleError } from './role.js'
import { planCycle, runItem, type CycleReport } from './loop.js'
import { serve, untilSignalled } from './serve.js'
import { GitHubTracker, GitHubCodeHost } from './github-adapter.js'
import type { Candidate } from './adapter.js'
import { laneVerdict, universalSkip } from './predicate.js'
import { CloneProvider } from './worktree.js'
import { recordExecution } from './execute.js'
import { overBudgetMessage, recordFiring, renderLore, selectEntries } from './firing.js'
import { appendRecord } from './state.js'
import { TriageError } from './triage.js'
import { BudgetError, budgetGate, loadSpend, readAllSeats, renderBudget } from './budget.js'
import { readStateRaw } from './state.js'
import { repoFromCheckout } from './github.js'
import type { Entry, Status } from './entry.js'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

const program = new Command()
program
  .name('igor')
  .description('Teammates that find their own work, claim it where people can see, and hand off cleanly')
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
  .option('--into <dir>', `write the entry to <dir>/${ENTRIES_DIR}/ as a candidate, not to the store`)
  .action((opts) => {
    const config = loadConfig(program.opts()['config'])
    const target = createTarget(config.destination, opts.into)
    const id = uniqueId(opts.claim, target.taken)
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
    const file = writeEntry(target.dir, entry)
    process.stdout.write(`${id}\n${file}\n`)
    if (entry.status === 'provisional') {
      // Only active entries fire, so a provisional entry sitting on main does nothing and
      // says nothing about why. Name the next step rather than leaving that silent, and where
      // the entry landed in the store say that propose will not take it from there.
      const next = opts.into
        ? `Run:\n  igor propose --from ${opts.into}\n`
        : `It is in the store, though, and propose only takes candidates from\n` +
          `outside it. Write candidates with --into <dir>, then:\n` +
          `  igor propose --from <dir>\n`
      process.stdout.write(`\nprovisional — it will not fire until reviewed.\n${next}`)
    }
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
      const s = scoreEntry(entry, { experts: config.experts })
      const expert = s.expertSupport > 0 ? ` expert:${s.expertSupport}` : ''
      process.stdout.write(
        `${entry.status.padEnd(11)} support:${String(s.support).padEnd(4)} newest:${s.newestAt ?? '(none)'}${expert}  ${entry.id}\n` +
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
  .requiredOption('--from <dir>', 'store-shaped directory holding candidates in <dir>/entries/')
  .action(async (opts) => {
    const config = loadConfig(program.opts()['config'])

    // Two very different mistakes both produce an empty candidate list, and the bare
    // "no candidates" they used to share says nothing about which one happened.
    const from = resolve(opts.from)
    if (!existsSync(join(from, ENTRIES_DIR))) {
      throw new ProposeError(
        `${from} has no ${ENTRIES_DIR}/ directory.\n` +
          `--from takes a store-shaped directory: candidates live in <dir>/${ENTRIES_DIR}/, ` +
          `the same layout as the destination.`,
      )
    }
    const candidates = loadAll(from)
    if (candidates.length === 0) {
      throw new ProposeError(`no entry files in ${join(from, ENTRIES_DIR)}`)
    }
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
      const owner = r.reassignedTo
        ? `${r.reassignedTo.join(', ')} (${r.author} is not a collaborator here)`
        : r.author
      process.stdout.write(
        `${r.pr.url}\n  assigned: ${owner}${r.reviewers.length ? `  also drawn from: ${r.reviewers.join(', ')}` : ''}\n  ${r.entries.join(', ')}\n`,
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

    for (const p of r.promoted) {
      const flag = p.mergerWasNotAssigned ? '  (merged by someone not assigned to review it)' : ''
      process.stdout.write(`promoted  ${p.id}  by ${p.by} on ${p.at}${flag}\n`)
    }
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

program
  .command('init-workflow')
  .description('Write the merge-triggered promotion workflow into the destination')
  .option('--force', 'overwrite an existing workflow')
  .action((opts) => {
    const config = loadConfig(program.opts()['config'])
    const source = join(igorRoot(), 'templates', 'promote-on-merge.yml')
    const target = join(config.destination, '.github', 'workflows', 'promote-on-merge.yml')
    if (existsSync(target) && !opts.force) {
      throw new StoreError(`${target} already exists — pass --force to overwrite`)
    }
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
    process.stdout.write(
      `${target}\n\nCommit and push it. If the default branch is protected, add the GitHub\n` +
        `Actions actor to the ruleset's bypass list, or this workflow's own push is blocked\n` +
        `by the same rule it exists to work around.\n`,
    )
  })

program
  .command('promote')
  .description('Set provisional entries active in place — for a merge-triggered workflow')
  .requiredOption('--by <login>', 'who approved, normally whoever merged')
  .option('--at <date>', 'ISO date of approval', new Date().toISOString().slice(0, 10))
  .option('--only <path...>', 'limit to these entry paths; without it, every provisional entry')
  .action((opts) => {
    const config = loadConfig(program.opts()['config'])
    const promoted = promoteInPlace(config, opts.by, opts.at, opts.only)
    for (const p of promoted) process.stdout.write(`promoted  ${p.id}  by ${p.by} on ${p.at}\n`)
    if (promoted.length === 0) process.stdout.write('nothing to promote\n')
  })

const role = program.command('role').description('Inspect the roles an Igor can be given')

role
  .command('list')
  .description('Show the roles defined in the destination')
  .action(() => {
    const config = loadConfig(program.opts()['config'])
    const names = rolesFrom(config)
    if (names.length === 0) {
      process.stdout.write(`no roles in ${config.destination}/roles\n`)
      return
    }
    for (const name of names) process.stdout.write(`${name}\n`)
  })

role
  .command('explain')
  .description('Show a role’s effective config and which level each value came from')
  .argument('<name>')
  .action((name: string) => {
    const config = loadConfig(program.opts()['config'])
    process.stdout.write(`${explainRole(loadRole(config, name))}\n`)
  })

function renderCycle(report: CycleReport, verbose: boolean): string {
  const out: string[] = []
  for (const f of report.failures) out.push(`  ! ${f}`)
  out.push(
    `${report.returned} returned, ${report.fresh} fresh${report.coldStart ? ' (cold start)' : ''}, ` +
      `${report.skippedUniversal} closed or busy, ${report.skippedLane} out of lane, ` +
      `${report.triaged} triaged ($${report.triageCostUsd.toFixed(4)})`,
  )
  if (verbose && report.skipped.length > 0) {
    out.push('', `skipped before any model call (${report.skipped.length}):`)
    for (const s of report.skipped.slice(0, 40)) {
      out.push(`  ${s.candidate.native.padStart(6)}  ${s.reason}  — ${s.candidate.title.slice(0, 56)}`)
    }
    if (report.skipped.length > 40) out.push(`  … and ${report.skipped.length - 40} more`)
  }
  if (report.verdicts.length > 0) {
    out.push('', 'model verdicts:')
    for (const v of report.verdicts) {
      out.push(`  ${v.outcome === 'proceed' ? 'CLAIM' : 'skip '} ${v.candidate.native.padStart(6)}  ${v.candidate.title.slice(0, 52)}`)
      out.push(`         ${v.reason}`)
    }
  }
  return out.join('\n')
}

program
  .command('run')
  .description('One cycle: discover, triage, then claim and work what qualifies')
  .argument('<role>')
  .option('--plan', 'stop after triage — claim nothing, post nothing')
  .option('--limit <n>', 'cap on model calls this cycle', '10')
  .option('--max-items <n>', 'cap on items worked this cycle')
  .option('--since <days>', 'look back this far instead of using the stored watermark')
  .option('--claim <id>', 'work only this item, which a previous run reported it would claim')
  .action(async (name: string, opts) => {
    const config = loadConfig(program.opts()['config'])
    const role = loadRole(config, name).role
    const tracker = new GitHubTracker()
    const identity = await tracker.identity()
    const destination = await repoFromCheckout(config.destination)
    const deps = { tracker, codeHost: new GitHubCodeHost(), trees: new CloneProvider(), destination }

    const gateFor = async () => {
      const [readings, spend] = await Promise.all([
        readAllSeats(config.budget.seats),
        loadSpend((path) => readStateRaw(destination, path)),
      ])
      for (const r of readings) {
        if (r.error !== undefined) process.stderr.write(`  ! seat "${r.seat.id}": ${r.error}\n`)
      }
      return budgetGate(config.budget, role, readings, spend)
    }

    // Lore is read fresh each item: the store is a repository someone may have just merged to.
    const fireLore = (item: Candidate) => {
      const entries = loadAll(config.destination)
        .map((l) => l.entry)
        .filter((e): e is Entry => e !== undefined)
      const result = selectEntries(entries, role, { experts: config.experts })
      const over = overBudgetMessage(result)
      if (over) process.stderr.write(`  ! ${over}\n`)
      else if (result.fired.length > 0) {
        process.stdout.write(`  lore: ${result.fired.length} entries, ~${result.estimatedTokens} tokens\n`)
      }
      void recordFiring(destination, item.id, role, result, appendRecord).catch(() => undefined)
      return renderLore(result.fired)
    }

    const work = async (item: Candidate) => {
      const gate = await gateFor()
      const lore = fireLore(item)
      process.stdout.write(`\nworking ${item.id}  "${item.title}"\n  seat: ${gate.seat ?? '(unenforced)'}\n`)
      const run = await runItem(deps, item, role, identity, {
        budget: gate,
        lore,
        onStep: (step) => process.stdout.write(`  ${step}…\n`),
      })
      process.stdout.write(`  ${run.outcome}: ${run.reason}\n`)
      if (run.execution) {
        await recordExecution(destination, item, role, run.execution, gate.seat)
        process.stdout.write(`  cost $${run.execution.costUsd.toFixed(4)}\n`)
        if (run.execution.artifact) process.stdout.write(`  ${run.execution.artifact.url}\n`)
      }
      if (!run.spoke && run.outcome !== 'refused' && run.outcome !== 'lost') {
        process.stdout.write('  WARNING: held a claim and left no message — that is a bug\n')
      }
      return run
    }

    if (opts.claim) {
      const repo = opts.claim.replace(/^github:/, '').split('#')[0]!
      const [item] = (
        await tracker.search({ tracker: 'github', repo, query: `is:issue ${opts.claim.split('#')[1]}` })
      ).filter((c) => c.id === opts.claim)
      if (item === undefined) throw new RoleError(`no open item ${opts.claim}`)

      // Naming an item skips triage — a person directing an Igor is exercising their own
      // judgement, and the lane exists to substitute for one. The universal skips still
      // apply: acting on a closed item, or one already being worked, is not a preference
      // anybody gets to express.
      const universal = universalSkip(item)
      if (universal) throw new RoleError(`refusing ${item.id}: ${universal.reason}`)

      const lane = laneVerdict(role.lane, item)
      if (lane.outcome === 'skip') {
        process.stdout.write(`note: outside this role's lane (${lane.reason}) — working it anyway\n`)
      }
      await work(item)
      return
    }

    const report = await planCycle(deps, role, {
      limit: Number(opts.limit),
      ...(opts.since === undefined ? {} : { sinceDays: Number(opts.since) }),
    })
    process.stdout.write(`${renderCycle(report, opts.plan === true)}\n`)

    if (opts.plan) {
      process.stdout.write(`\n${report.toClaim.length} would be claimed. Nothing was claimed or posted.\n`)
      for (const c of report.toClaim) {
        process.stdout.write(`  igor run ${name} --claim ${c.candidate.id}\n`)
      }
      return
    }

    if (report.toClaim.length === 0) {
      process.stdout.write('\nnothing to claim\n')
      return
    }
    const cap = opts.maxItems === undefined ? report.toClaim.length : Number(opts.maxItems)
    for (const c of report.toClaim.slice(0, cap)) {
      const run = await work(c.candidate)
      // A closed budget stops the cycle rather than being rediscovered per item.
      if (run.outcome === 'handed-off' && /budget/.test(run.reason)) {
        process.stdout.write('\nstopping this cycle: the budget is spent\n')
        break
      }
    }
  })

program
  .command('serve')
  .description('Run the cycle on the role\'s interval until stopped')
  .argument('<role>')
  .option('--limit <n>', 'cap on model calls per cycle', '10')
  .option('--poll <minutes>', "override the role's poll interval")
  .option('--cycles <n>', 'stop after this many cycles')
  .action(async (name: string, opts) => {
    const config = loadConfig(program.opts()['config'])
    const role = loadRole(config, name).role
    const tracker = new GitHubTracker()
    const identity = await tracker.identity()
    const destination = await repoFromCheckout(config.destination)
    const deps = { tracker, codeHost: new GitHubCodeHost(), trees: new CloneProvider(), destination }

    const stamp = () => new Date().toISOString().slice(11, 19)
    const summary = await serve(deps, role, identity, {
      limit: Number(opts.limit),
      ...(opts.poll === undefined ? {} : { pollMinutes: Number(opts.poll) }),
      ...(opts.cycles === undefined ? {} : { maxCycles: Number(opts.cycles) }),
      until: untilSignalled(),
      gate: async () => {
        const [readings, spend] = await Promise.all([
          readAllSeats(config.budget.seats),
          loadSpend((path) => readStateRaw(destination, path)),
        ])
        return budgetGate(config.budget, role, readings, spend)
      },
      onEvent: (e) => {
        const say = (line: string) => process.stdout.write(`${stamp()} ${line}\n`)
        switch (e.kind) {
          case 'planned':
            say(
              `cycle ${e.cycle}: ${e.report.fresh} fresh, ${e.report.triaged} triaged, ` +
                `${e.report.toClaim.length} to claim ($${e.report.triageCostUsd.toFixed(4)})`,
            )
            for (const f of e.report.failures) say(`  ! ${f}`)
            break
          case 'working':
            say(`  working ${e.item.native} "${e.item.title.slice(0, 50)}" on ${e.seat ?? '(unenforced)'}`)
            break
          case 'worked': {
            say(`  ${e.run.outcome}: ${e.run.reason}`)
            if (e.run.execution) {
              void recordExecution(destination, e.item, role, e.run.execution).catch(() => undefined)
            }
            break
          }
          case 'cycle-failed':
            say(`cycle ${e.cycle} failed: ${e.error.message}`)
            break
          case 'sleeping':
            say(`sleeping ${e.minutes}m`)
            break
          case 'stopping':
            say(`stopping: ${e.reason}`)
            break
          default:
            break
        }
      },
    })
    process.stdout.write(
      `\n${summary.cycles} cycles, ${summary.worked} items, ${summary.failures} failed cycles, ` +
        `$${summary.costUsd.toFixed(4)}\n`,
    )
  })

program
  .command('budget')
  .description('What each seat has left, read live from the seat itself')
  .action(async () => {
    const config = loadConfig(program.opts()['config'])
    const repo = await repoFromCheckout(config.destination)
    const [readings, spend] = await Promise.all([
      readAllSeats(config.budget.seats),
      loadSpend((path) => readStateRaw(repo, path)),
    ])
    process.stdout.write(renderBudget(readings))

    for (const pool of config.budget.pools) {
      const gate = budgetGate(config.budget, { name: '(any role)', seat: `pool:${pool.id}` }, readings, spend)
      process.stdout.write(`\npool ${pool.id}: ${gate.reason}\n`)
    }
  })

try {
  await program.parseAsync()
} catch (error) {
  if (
    error instanceof ConfigError ||
    error instanceof StoreError ||
    error instanceof ProposeError ||
    error instanceof GitHubError ||
    error instanceof RoleError ||
    error instanceof TriageError ||
    error instanceof BudgetError
  ) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }
  throw error
}
