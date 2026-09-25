import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import {
  igorRoot,
  loadConfig,
  DEFAULT_CONFIG_FILENAME,
  EXAMPLE_CONFIG_FILENAME,
} from '../src/config.js'
import {
  initialize,
  renderInit,
  scaffoldConfig,
  InitError,
  INIT_TARGETS,
  STUB_ROLE,
  WORKFLOW_FILE,
} from '../src/init.js'
import { loadRole, ORG_ROLE, ROLES_DIR } from '../src/role.js'
import { tempDir } from './tmp.js'

/**
 * A repository with nothing in it, which is what `init` is pointed at.
 *
 * `realpathSync` because git answers `--show-toplevel` with the resolved path, and the temp
 * directory on a mac is reached through a symlink — compared unresolved, every assertion about
 * where a file landed fails for a reason that has nothing to do with `init`.
 */
function repo(prefix = 'igor-init-'): string {
  const dir = realpathSync(tempDir(prefix))
  execFileSync('git', ['-C', dir, 'init', '-q'], { stdio: 'ignore' })
  return dir
}

const paths = (root: string) => ({
  config: join(root, DEFAULT_CONFIG_FILENAME),
  org: join(root, ROLES_DIR, `${ORG_ROLE}.yaml`),
  stub: join(root, ROLES_DIR, `${STUB_ROLE}.yaml`),
  workflow: join(root, '.github', 'workflows', WORKFLOW_FILE),
})

describe('what init writes', () => {
  it('writes the configuration, the org role, a role stub and the workflow', () => {
    const root = repo()

    const result = initialize(root)

    expect(result.outcomes.map((o) => o.target)).toEqual([...INIT_TARGETS])
    expect(result.outcomes.every((o) => o.wrote)).toBe(true)
    for (const path of Object.values(paths(root))) expect(existsSync(path), path).toBe(true)
  })

  it('sets destination to the repository it wrote into', () => {
    const root = repo()
    initialize(root)

    const config = loadConfig(paths(root).config)

    expect(readFileSync(paths(root).config, 'utf8')).toContain('\ndestination: .\n')
    expect(config.destination).toBe(root)
  })

  it('writes the configuration at the repository root rather than the working directory', () => {
    // `destination: .` resolves against the config's own directory, and a destination below its
    // repository's root is refused at load — so a config written where the command was run is
    // one the loader would reject the moment anybody used it.
    const root = repo()
    const inside = join(root, 'some', 'where')
    mkdirSync(inside, { recursive: true })

    initialize(inside)

    expect(existsSync(paths(root).config)).toBe(true)
    expect(existsSync(join(inside, DEFAULT_CONFIG_FILENAME))).toBe(false)
    expect(loadConfig(paths(root).config).destination).toBe(root)
  })

  it('leaves a store whose role stub resolves through the org base it wrote beside it', () => {
    const root = repo()
    initialize(root)

    const { role } = loadRole(loadConfig(paths(root).config), STUB_ROLE)

    expect(role.extends).toEqual([ORG_ROLE])
    expect(role.allow).toContain(role.completion)
  })
})

describe('the action space the shipped org role gives a worker', () => {
  const shipped = () => {
    const root = repo('igor-init-commands-')
    initialize(root)
    return loadRole(loadConfig(paths(root).config), STUB_ROLE).role
  }

  it('may remove and rename tracked files, and may read history', () => {
    expect(shipped().commands).toEqual(
      expect.arrayContaining(['git rm:*', 'git mv:*', 'git log:*', 'git show:*', 'git blame:*']),
    )
  })

  it('may not commit, push, remove unscoped, or run an interpreter or a fetcher', () => {
    // By name, so widening the default has to be deliberate: each of these was excluded for its
    // own reason, and a list that merely "looks about right" is how one comes back.
    const { commands } = shipped()
    for (const excluded of [
      'rm:*',
      'git commit:*',
      'git push:*',
      'node:*',
      'npx:*',
      'curl',
      'sh',
      'bash',
      'cat',
      'grep',
      'find',
    ]) {
      expect(commands, `${excluded} is in the shipped commands`).not.toContain(excluded)
    }
    // And by shape, since an entry is a prefix pattern: `git commit -m:*` would pass the check
    // above while granting exactly what it excludes.
    for (const command of commands) {
      expect(command).toMatch(/^git (rm|mv|log|show|blame)\b/)
    }
  })
})

describe('the values init leaves for the operator', () => {
  it('writes reviewers and experts commented, with no name anybody would inherit', () => {
    const root = repo()
    initialize(root)
    const written = readFileSync(paths(root).config, 'utf8')

    expect(written).toContain('# reviewers:')
    expect(written).toContain('# experts:')
    expect(written).not.toMatch(/^reviewers:/m)
    expect(written).not.toMatch(/^experts:/m)
    expect(written).not.toContain('alice')
    const config = loadConfig(paths(root).config)
    expect(config.reviewers).toEqual([])
    expect(config.experts).toEqual([])
  })

  it('declares no seat, so no role is refused for naming a seat nobody chose', () => {
    const root = repo()
    initialize(root)

    const config = loadConfig(paths(root).config)

    expect(config.budget.seats).toEqual([])
    expect(readFileSync(paths(root).config, 'utf8')).not.toMatch(/^budget:/m)
  })

  it('comments the role stub’s sources, since no tracker query is guessable', () => {
    const root = repo()
    initialize(root)

    expect(readFileSync(paths(root).stub, 'utf8')).toContain('# sources:')
    expect(loadRole(loadConfig(paths(root).config), STUB_ROLE).role.sources).toEqual([])
  })

  it('leaves destination the only key that loads, so a value added to the example is not copied', () => {
    // The scaffold blanks the blocks it knows about. A key added to the example with a value in
    // it would otherwise arrive live in every repository initialized afterwards, chosen by
    // nobody and reported by nothing.
    const example = readFileSync(join(igorRoot(), EXAMPLE_CONFIG_FILENAME), 'utf8')

    expect(Object.keys(parseYaml(scaffoldConfig(example)) as object)).toEqual(['destination'])
  })

  it('refuses rather than copying the example when a block it must blank is gone', () => {
    // The scaffold is derived from the example, so the example moving on is the way a config
    // with somebody else's reviewers live in it would reach a repository.
    expect(() => scaffoldConfig('destination: .\n')).toThrow(InitError)
    expect(() => scaffoldConfig('destination: .\n')).toThrow(/reviewers or experts or budget/)
  })
})

describe('what init says it has not done', () => {
  it('names the operator’s values, the settings that are not files, and no runnable Igor', () => {
    const root = repo()

    const said = renderInit(initialize(root))

    expect(said).toContain('reviewers, experts')
    expect(said).toContain('budget.seats')
    expect(said).toContain('token_env, token_file or token_command')
    expect(said).toContain('sources')
    expect(said).toContain('seat')
    expect(said).toContain('Branch protection')
    expect(said).toContain('bypass list')
    expect(said).toContain('not a runnable Igor')
  })

  it('names every file it skipped', () => {
    const root = repo()
    initialize(root)

    const said = renderInit(initialize(root))

    for (const path of Object.values(paths(root))) expect(said).toContain(`skipped  ${path}`)
  })
})

describe('a second run', () => {
  it('writes what is missing and leaves what is there, rather than refusing at the first file', () => {
    const root = repo()
    initialize(root)
    const edited = `${readFileSync(paths(root).config, 'utf8')}\nreviewers: [dana]\n`
    writeFileSync(paths(root).config, edited)
    writeFileSync(paths(root).org, `${readFileSync(paths(root).org, 'utf8')}\n# ours\n`)
    rmSync(paths(root).workflow)

    const result = initialize(root)

    expect(result.outcomes.filter((o) => o.wrote).map((o) => o.target)).toEqual(['workflow'])
    expect(existsSync(paths(root).workflow)).toBe(true)
    expect(readFileSync(paths(root).config, 'utf8')).toBe(edited)
    expect(readFileSync(paths(root).org, 'utf8')).toContain('# ours')
    expect(loadConfig(paths(root).config).reviewers).toEqual(['dana'])
  })
})

describe('overwriting', () => {
  it('replaces exactly the target named and leaves the others as they are', () => {
    const root = repo()
    initialize(root)
    for (const path of Object.values(paths(root))) {
      writeFileSync(path, `${readFileSync(path, 'utf8')}\n# mine\n`)
    }

    const result = initialize(root, { force: ['workflow'] })

    expect(result.outcomes).toEqual([
      { target: 'workflow', path: paths(root).workflow, wrote: true },
    ])
    expect(readFileSync(paths(root).workflow, 'utf8')).toBe(
      readFileSync(join(igorRoot(), 'templates', WORKFLOW_FILE), 'utf8'),
    )
    for (const path of [paths(root).config, paths(root).org, paths(root).stub]) {
      expect(readFileSync(path, 'utf8'), path).toContain('# mine')
    }
  })

  it('touches no target it did not name, whether that target is there or not', () => {
    const root = repo()
    initialize(root)
    rmSync(paths(root).stub)

    initialize(root, { force: ['workflow'] })

    expect(existsSync(paths(root).stub)).toBe(false)
  })

  it('writes a named target that is absent', () => {
    const root = repo()
    initialize(root)
    rmSync(paths(root).workflow)

    initialize(root, { force: ['workflow'] })

    expect(existsSync(paths(root).workflow)).toBe(true)
  })

  it('overwrites every target when every target is named', () => {
    const root = repo()
    initialize(root)
    for (const path of Object.values(paths(root))) writeFileSync(path, '# mine\n')

    initialize(root, { force: [...INIT_TARGETS] })

    for (const path of Object.values(paths(root))) {
      expect(readFileSync(path, 'utf8'), path).not.toBe('# mine\n')
    }
  })

  it('refuses when no target is named, and says which can be', () => {
    const root = repo()

    expect(() => initialize(root, { force: true })).toThrow(/config, org-role, role-stub, workflow/)
    expect(() => initialize(root, { force: [] })).toThrow(InitError)
    expect(existsSync(paths(root).config)).toBe(false)
  })

  it('refuses a name that is not a target', () => {
    const root = repo()

    expect(() => initialize(root, { force: ['workflows'] })).toThrow(/not a target/)
    expect(existsSync(paths(root).config)).toBe(false)
  })
})

describe('where init refuses to write at all', () => {
  it('refuses outside a repository, and says creating one is not its job', () => {
    const outside = realpathSync(tempDir('igor-init-bare-'))

    expect(() => initialize(outside)).toThrow(InitError)
    expect(() => initialize(outside)).toThrow(/not inside a git repository/)
    expect(() => initialize(outside)).toThrow(/not init's job/)
    expect(existsSync(join(outside, DEFAULT_CONFIG_FILENAME))).toBe(false)
  })

  it('refuses inside Igor’s own installation, where the config would be one the loader rejects', () => {
    expect(() => initialize(igorRoot())).toThrow(/Igor's own installation/)
    expect(() => initialize(join(igorRoot(), 'src'))).toThrow(InitError)
    // Nothing is written before the refusal, and the installation is a repository like any
    // other: a scaffolder that got this far would leave a team's files in the shared tool.
    expect(existsSync(join(igorRoot(), ROLES_DIR))).toBe(false)
    expect(existsSync(join(igorRoot(), DEFAULT_CONFIG_FILENAME))).toBe(false)
  })

  it('refuses a config path it cannot honour rather than writing somewhere else', () => {
    // `--config` points every other command at a store it is not standing in. init has no
    // config to read — it writes one, at the root of the repository it is in — so honouring the
    // flag is impossible and ignoring it writes four files somewhere the caller did not name.
    const root = repo()

    expect(() => initialize(root, { config: join(root, DEFAULT_CONFIG_FILENAME) })).toThrow(
      InitError,
    )
    expect(existsSync(paths(root).config)).toBe(false)
  })

  it('refuses a bare repository, which has no work tree to write into', () => {
    const dir = realpathSync(tempDir('igor-init-bare-repo-'))
    execFileSync('git', ['-C', dir, 'init', '-q', '--bare'], { stdio: 'ignore' })

    expect(() => initialize(dir)).toThrow(/bare git repository/)
  })
})
