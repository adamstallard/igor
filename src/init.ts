import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  askGit,
  igorRoot,
  isInside,
  DEFAULT_CONFIG_FILENAME,
  EXAMPLE_CONFIG_FILENAME,
  type GitSilence,
} from './config.js'
import { ORG_ROLE, ROLES_DIR } from './role.js'

export class InitError extends Error {}

/** The destination's single on-push job, named for what it runs. */
export const WORKFLOW_FILE = 'reconcile-on-merge.yml'

/** The org-level base every role inherits, shipped so the action space is not guessed at. */
export const ORG_TEMPLATE = 'org.yaml'

/** The one role `init` writes. Named for the work an Igor is usually given first. */
export const STUB_ROLE = 'maintenance'

/**
 * What `init` writes, each nameable so that one can be replaced by itself. Only the workflow
 * goes stale — Igor owns it and it changes when Igor does — but a name per file is what keeps
 * `--force` from meaning "all of them".
 */
export const INIT_TARGETS = ['config', 'org-role', 'role-stub', 'workflow'] as const
export type InitTarget = (typeof INIT_TARGETS)[number]

export interface InitOutcome {
  target: InitTarget
  path: string
  /** False where the file was already there and was left exactly as it was. */
  wrote: boolean
}

export interface InitResult {
  /** The root of the enclosing repository — where the store is, and so where the config goes. */
  root: string
  outcomes: InitOutcome[]
}

const ROLE_STUB = `# One Igor: where it looks for work, and how it narrows what roles/${ORG_ROLE}.yaml grants.
# The filename is the name, so this role is \`igor run ${STUB_ROLE}\`. Copy it per Igor.
#
# It inherits ${ORG_ROLE}.yaml without saying so. Everything it may do and every command it
# may run is declared there; what it adds is where to look.

# Where this Igor finds work. Nothing can guess the query, and a role with no sources
# discovers nothing, so this is the one value that has to be filled in before it runs.
# sources:
#   - tracker: github
#     repo: <owner>/<repo>
#     query: "is:issue is:open label:ai"

# Which declared seat pays for the reasoning. Required once budget.seats is declared in
# ${DEFAULT_CONFIG_FILENAME}; until then this Igor runs unmetered.
# seat: <seat id, or pool:<pool id>>

# Narrow what ${ORG_ROLE}.yaml grants. A role may drop an action or a command it inherits
# and may never add one, and a lane it declares is AND-ed with the one above.
# allow: [comment, unassign]
# lane:
#   paths:
#     under: [src/]
`

/** An answer git declined to give, said in init's terms rather than the config loader's. */
function silent(from: string, silence: GitSilence): InitError {
  if (!silence.ran) {
    return new InitError(
      `git could not be run, so whether ${from} is inside a repository is unknown. Igor keeps ` +
        `the store in a git checkout, so git has to be on PATH.\n${silence.said}`.trim(),
    )
  }
  // Not "there is no repository": exit 128 is also a checkout git declines to read — dubious
  // ownership on a bind mount or in a CI container — where saying there is none sends somebody to
  // create a repository they already have, one line above git's own remedy for what is wrong.
  return new InitError(
    `init wrote nothing: git could not say what repository ${from} is in.\n` +
      `If there is none, that is the answer — init writes into a repository that already exists ` +
      `and does not create one, which is \`gh repo create\` and a clone, and a scaffolder that ` +
      `makes repositories is a different and more dangerous tool. If there is one, git declined ` +
      `to read it, and the remedy is in its line below and nowhere else.\n` +
      `git: ${silence.said}`,
  )
}

/**
 * Where a directory's repository begins.
 *
 * Asked in two steps because `--show-toplevel` is itself an error in a bare repository, and a
 * combined `rev-parse` then fails whole — reporting a bare repository as no repository at all.
 * Where a checkout is is a separate question from whether there is one to write into.
 */
function repositoryRoot(from: string): string {
  const placement = askGit(from, ['--is-bare-repository', '--is-inside-work-tree'])
  if (!Array.isArray(placement)) throw silent(from, placement)
  if (placement.length < 2) {
    // Fail closed: an answer that cannot be parsed is an unknown place, and writing a team's
    // configuration into an unknown place is the one outcome that must not happen.
    throw new InitError(
      `git answered two questions about ${from} with ${placement.length} lines, so whether it ` +
        `is in a checkout is unknown and must not be guessed at`,
    )
  }
  if (placement[0] === 'true') {
    throw new InitError(
      `${from} is in a bare git repository, which has no work tree — a lore repository is files ` +
        `on disk at the root of a checkout`,
    )
  }
  if (placement[1] !== 'true') {
    throw new InitError(
      `${from} is inside a gitdir rather than a work tree — git ignores everything under one, so ` +
        `nothing written there could ever be committed`,
    )
  }

  const top = askGit(from, ['--show-toplevel'])
  if (!Array.isArray(top)) throw silent(from, top)
  // The root is every line of the answer: a directory's name may legally contain a newline, and
  // taking the first line would name a directory that is not the repository.
  const root = top.join('\n')
  if (root === '') {
    throw new InitError(
      `git named no root for ${from}, so where the repository begins is unknown and must not be ` +
        `guessed at`,
    )
  }
  return root
}

/**
 * Blocks the example fills in with values, which a repository being set up must not inherit from
 * it. A name nobody chose is worse than a blank somebody has to fill: `reviewers` and `experts`
 * would load as though the team had picked them, and a declared seat makes every role that names
 * none refuse to load — so what arrives is a config that fails on a name the operator never typed.
 */
const UNCHOSEN = ['reviewers', 'experts', 'budget'] as const

/** What replaces a block's values, so the shape is there and the value is plainly missing. */
const PLACEHOLDERS: Partial<Record<(typeof UNCHOSEN)[number], string[]>> = {
  reviewers: ['  - <a github login>'],
  experts: ['  - <a github login>'],
}

/**
 * The shipped example, with every value the operator has to choose commented out.
 *
 * Derived from the example rather than kept as a second template: the example is the documented
 * config, it is parsed by the test suite, and a copy of it would drift the first time either is
 * improved. A block this does not find is that drift arriving, so it refuses rather than
 * writing a config with somebody else's reviewers live in it.
 */
export function scaffoldConfig(example: string): string {
  const lines = example.split('\n')
  const out: string[] = []
  const found: string[] = []

  for (let i = 0; i < lines.length; i++) {
    const key = /^([A-Za-z_][\w]*):/.exec(lines[i] as string)?.[1]
    if (key === undefined || !(UNCHOSEN as readonly string[]).includes(key)) {
      out.push(lines[i] as string)
      continue
    }
    found.push(key)

    // The block is the key line and everything indented under it. A blank line inside it is
    // part of it; the blank lines that trail it belong to the file, which is why they are given
    // back rather than commented.
    const block: string[] = [lines[i] as string]
    let end = i + 1
    for (; end < lines.length && (lines[end] === '' || /^\s/.test(lines[end] as string)); end++) {
      block.push(lines[end] as string)
    }
    while (block.length > 1 && block[block.length - 1] === '') {
      block.pop()
      end--
    }

    const placeholder = PLACEHOLDERS[key as (typeof UNCHOSEN)[number]]
    const body = placeholder === undefined ? block : [`${key}:`, ...placeholder]
    out.push(...body.map((line) => (line === '' ? '#' : `# ${line}`)))
    i = end - 1
  }

  const missing = UNCHOSEN.filter((key) => !found.includes(key))
  if (missing.length > 0) {
    throw new InitError(
      `${EXAMPLE_CONFIG_FILENAME} no longer has a top-level ${missing.join(' or ')} block, so ` +
        `init cannot tell what to leave for the operator to choose. Update src/init.ts to match ` +
        `the example rather than shipping a config with values nobody picked.`,
    )
  }
  return out.join('\n')
}

interface Writeable {
  target: InitTarget
  path: string
  write: () => void
}

function shipped(name: string): string {
  return join(igorRoot(), 'templates', name)
}

function plan(root: string): Writeable[] {
  const copy = (from: string, to: string) => () => {
    mkdirSync(dirname(to), { recursive: true })
    copyFileSync(from, to)
  }
  const put = (contents: () => string, to: string) => () => {
    mkdirSync(dirname(to), { recursive: true })
    writeFileSync(to, contents())
  }
  const config = join(root, DEFAULT_CONFIG_FILENAME)
  const orgRole = join(root, ROLES_DIR, `${ORG_ROLE}.yaml`)
  const stub = join(root, ROLES_DIR, `${STUB_ROLE}.yaml`)
  const workflow = join(root, '.github', 'workflows', WORKFLOW_FILE)
  return [
    {
      target: 'config',
      path: config,
      write: put(
        () => scaffoldConfig(readFileSync(join(igorRoot(), EXAMPLE_CONFIG_FILENAME), 'utf8')),
        config,
      ),
    },
    { target: 'org-role', path: orgRole, write: copy(shipped(ORG_TEMPLATE), orgRole) },
    { target: 'role-stub', path: stub, write: put(() => ROLE_STUB, stub) },
    { target: 'workflow', path: workflow, write: copy(shipped(WORKFLOW_FILE), workflow) },
  ]
}

/** The targets a force option names, refusing anything that is not one — and refusing none. */
function forced(force: readonly string[] | boolean | undefined): InitTarget[] {
  if (force === undefined || force === false) return []
  const named = force === true ? [] : [...force]
  if (named.length === 0) {
    throw new InitError(
      `--force overwrites the targets you name, and names none.\n` +
        `Name one or more of: ${INIT_TARGETS.join(', ')}.\n` +
        `Overwriting all four at once is starting over, which is a deletion and a plain run; ` +
        `filling in what is missing is what a plain run already does.`,
    )
  }
  const unknown = named.filter((n) => !(INIT_TARGETS as readonly string[]).includes(n))
  if (unknown.length > 0) {
    throw new InitError(
      `--force ${unknown.join(', ')}: not ${unknown.length === 1 ? 'a target' : 'targets'}. ` +
        `The targets are: ${INIT_TARGETS.join(', ')}.`,
    )
  }
  return named as InitTarget[]
}

/**
 * Writes what a lore repository needs into the repository `from` is inside.
 *
 * Each target is decided on its own: written where it is absent, named where it is present, and
 * the run succeeds either way — so a second run after a role has been added adds only what is
 * missing. Refusing at the first file that was already there would mean a repository holding a
 * config and nothing else could never be initialized without overwriting the config.
 */
export function initialize(
  from: string,
  opts: { force?: readonly string[] | boolean; config?: string } = {},
): InitResult {
  // Every other command takes `--config` to work a store it is not standing in. init has none to
  // read — it writes one, at the root of the repository it is in — so the flag cannot be
  // honoured, and ignoring it puts four files somewhere the caller did not name. An ambient
  // IGOR_CONFIG is left alone: it is the environment, not an instruction about this run.
  if (opts.config !== undefined) {
    throw new InitError(
      `init writes a configuration rather than reading one, so it has nowhere to take ` +
        `--config ${opts.config} into account. It writes at the root of the repository you are ` +
        `standing in — run it from inside the repository you mean.`,
    )
  }
  const overwrite = forced(opts.force)
  const root = repositoryRoot(from)

  // The config this would write is one the loader is already obliged to refuse, so the
  // repository it scaffolds could never load its own configuration — and it would leave one
  // team's files in the tool every team shares.
  if (isInside(from, igorRoot()) || isInside(root, igorRoot())) {
    throw new InitError(
      `${root} is Igor's own installation, and init writes a team's files.\n` +
        `Igor is the shared tool; the config describes one team, so a config inside a clone of ` +
        `Igor is refused whether or not init is what wrote it. Run this inside the repository ` +
        `that holds your lore.`,
    )
  }

  // Naming targets narrows the run to them. There is no unforced way to name a subset, because
  // a narrowing that could not overwrite would either do nothing or duplicate the plain run —
  // so the scoping lives on the destructive word, and a target it does not name is not touched
  // whether it is there or not.
  const scoped = plan(root).filter((item) => overwrite.length === 0 || overwrite.includes(item.target))

  const outcomes: InitOutcome[] = []
  for (const item of scoped) {
    const write = overwrite.length > 0 || !existsSync(item.path)
    if (write) item.write()
    outcomes.push({ target: item.target, path: item.path, wrote: write })
  }
  return { root, outcomes }
}

/**
 * What was done, and then what a person still has to do. A setup command that reports success
 * without saying it produced something not yet runnable is how an operator finds out by watching
 * nothing happen.
 */
export function renderInit(result: InitResult): string {
  const lines = result.outcomes.map(
    (o) => `${o.wrote ? 'wrote  ' : 'skipped'}  ${o.path}${o.wrote ? '' : '  — already there, left as it is'}`,
  )
  const config = join(result.root, DEFAULT_CONFIG_FILENAME)
  const stub = join(result.root, ROLES_DIR, `${STUB_ROLE}.yaml`)

  lines.push(
    '',
    'Four values are nobody\'s to guess but yours, and this is not a runnable Igor until',
    'each of them is filled in:',
    `  reviewers, experts   ${config}`,
    '                       who may approve an entry, and whose provenance outweighs a drive-by',
    `  budget.seats         ${config}`,
    '                       the seat that pays for the reasoning, and where its token is read',
    '                       from — token_env, token_file or token_command, exactly one',
    `  sources              ${stub}`,
    '                       the tracker query this Igor looks for work with',
    `  seat                 ${stub}`,
    '                       which declared seat this Igor spends, once seats are declared',
    '',
    'Two steps are not files, and init does not touch repository settings:',
    '  - Branch protection on the default branch: require a pull request before merging, and',
    '    do not require approvals — GitHub will not let anyone approve their own pull request,',
    '    which hard-blocks a solo maintainer. An entry pushed straight to main has nothing to',
    '    promote it and stays provisional.',
    '  - The ruleset\'s bypass list: add the GitHub Actions actor, or the reconciliation',
    '    workflow\'s own push is blocked by the rule it exists to work around.',
    '',
    'Commit what is here — this configuration is shared, and uncommitted it drifts between',
    'whoever runs the tool.',
  )
  return `${lines.join('\n')}\n`
}
