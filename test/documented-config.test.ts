import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'
import { parseOrgBudget } from '../src/budget.js'
import { resolveConfig } from '../src/config.js'
import { resolveRole, ROLES_DIR } from '../src/role.js'
import { tempDir } from './tmp.js'

/**
 * Every configuration anybody is shown, run through the parser that would read it.
 *
 * A parser that refuses a key nobody reads refuses a documented example the moment the two
 * disagree, and the example is what people copy. Nothing else here reads the docs, so a block
 * can go stale for as long as nobody types it out.
 *
 * Each fence declares the level it sits at, because guessing gets it wrong in the one direction
 * that matters: a seat list read as a whole config lands in a parser that never looks at it, and
 * the block passes without being checked at all.
 */
const root = fileURLToPath(new URL('..', import.meta.url))

const LEVELS = ['config', 'budget', 'seats', 'role', 'none'] as const
type Level = (typeof LEVELS)[number]

interface Block {
  where: string
  /** Undefined where the fence declares no level, or one that is not a level. */
  level: Level | undefined
  text: string
  /** Line numbers of the opening and closing fences, which `strayFences` reads. */
  opened: number
  closed: number
}

/**
 * Every YAML block in a markdown file, indented ones included. A fence inside a numbered step
 * carries the indentation of the step, and the blocks people copy out of a walkthrough are
 * exactly the ones that sit there — so matching only at column zero skips the examples most
 * likely to be typed, and skips them without a word.
 */
function fencedYaml(path: string, label: string): Block[] {
  const lines = readFileSync(path, 'utf8').split('\n')
  const out: Block[] = []
  for (let i = 0; i < lines.length; i++) {
    const fence = /^(\s*)(`{3,})ya?ml(.*)$/.exec(lines[i] as string)
    if (fence === null) continue
    const [, indent, ticks, rest] = fence as unknown as [string, string, string, string]
    const opened = i + 1
    const body: string[] = []
    // Markdown lets the closing fence sit anywhere up to its opener's indentation, and a YAML
    // block scalar can hold a deeper-indented ``` of its own. Closing on anything indented is
    // what truncates such an example; requiring the opener's exact indent is what runs a block
    // on past a legally outdented close and swallows the rest of the file.
    const closing = new RegExp(`^\\s{0,${indent.length}}\`{${ticks.length},}\\s*$`)
    while (++i < lines.length && !closing.test(lines[i] as string)) {
      const line = lines[i] as string
      body.push(line.startsWith(indent) ? line.slice(indent.length) : line)
    }
    const tag = /igor:(\S+)/.exec(rest)
    const level = tag === null ? undefined : (tag[1] as Level)
    out.push({
      where: `${label}:${opened}`,
      level: level !== undefined && (LEVELS as readonly string[]).includes(level) ? level : undefined,
      text: body.join('\n'),
      opened,
      closed: i < lines.length ? i + 1 : lines.length,
    })
  }
  return out
}

/**
 * Fence openers no block accounts for — the shape a narrower matcher leaves behind.
 *
 * The blocks themselves cannot prove their own coverage: one the scanner stops seeing
 * contributes no test and no complaint, so the checked set halves with the suite still green.
 * Counting openers instead would fail on a legitimate fence nested inside a block scalar; a
 * fence inside a block another fence already covers is accounted for, and only one outside
 * every block means something was dropped.
 */
function strayFences(path: string, label: string): string[] {
  const blocks = fencedYaml(path, label)
  return readFileSync(path, 'utf8')
    .split('\n')
    .flatMap((line, index) => {
      const at = index + 1
      if (!/^\s*`{3,}ya?ml/.test(line)) return []
      return blocks.some((b) => at >= b.opened && at <= b.closed) ? [] : [`${label}:${at}`]
    })
}

const scanned = [
  'README.md',
  ...readdirSync(join(root, 'docs'), { recursive: true })
    .map((f) => `docs/${f as string}`)
    .sort(),
].filter((f) => f.endsWith('.md'))

const documented: Block[] = [
  {
    where: 'igor.config.example.yaml',
    level: 'config',
    text: readFileSync(join(root, 'igor.config.example.yaml'), 'utf8'),
    opened: 1,
    closed: 1,
  },
  ...scanned.flatMap((f) => fencedYaml(join(root, f), f)),
]

/**
 * Parses a block the way the tool would. A block showing part of a file is completed with the
 * least that makes it a whole one — a `destination`, an empty parent for a role that extends one
 * — and never with anything that would relax a check: what the block itself declares is what the
 * real parser sees.
 */
const parseAt: Record<Level, (text: string) => void> = {
  config: (text) => {
    const raw = parseYaml(text) as Record<string, unknown>
    resolveConfig({ destination: '.', ...raw }, tempDir('igor-doc-config-'))
  },
  budget: (text) => {
    parseOrgBudget(parseYaml(text))
  },
  seats: (text) => {
    parseOrgBudget({ seats: parseYaml(text) })
  },
  role: (text) => {
    const dir = tempDir('igor-doc-role-')
    mkdirSync(join(dir, ROLES_DIR), { recursive: true })
    writeFileSync(join(dir, ROLES_DIR, 'documented.yaml'), text)
    const declared = (parseYaml(text) as { extends?: string | string[] }).extends
    for (const parent of typeof declared === 'string' ? [declared] : (declared ?? [])) {
      writeFileSync(join(dir, ROLES_DIR, `${parent}.yaml`), '')
    }
    resolveRole(dir, 'documented')
  },
  none: () => {},
}

describe('the scan reads the fences markdown allows', () => {
  const scan = (markdown: string): Block[] => {
    const dir = tempDir('igor-doc-fence-')
    const path = join(dir, 'probe.md')
    writeFileSync(path, markdown)
    return fencedYaml(path, 'probe.md')
  }

  it('closes on a fence outdented from its opener', () => {
    const blocks = scan(['1. A step:', '', '   ```yaml igor:config', '   destination: .', '```', '', 'Prose.', ''].join('\n'))
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.text.trim()).toBe('destination: .')
  })

  it('keeps a fence nested inside a block scalar, rather than truncating the example there', () => {
    const markdown = [
      '```yaml igor:role',
      'instructions: |',
      '  Show them a config:',
      '',
      '  ```yaml',
      '  destination: .',
      '  ```',
      '```',
      '',
    ].join('\n')
    expect(scan(markdown)).toHaveLength(1)
    expect(scan(markdown)[0]?.text).toContain('destination: .')
  })

  it('reads a four-backtick fence, which is how a block holding a fence is written', () => {
    expect(scan(['````yaml igor:config', 'destination: .', '````', ''].join('\n'))).toHaveLength(1)
  })

  it('accounts for a nested fence, and reports one no block covers', () => {
    const dir = tempDir('igor-doc-stray-')
    const nested = join(dir, 'nested.md')
    writeFileSync(nested, ['```yaml igor:role', 'instructions: |', '  ```yaml', '  a: 1', '  ```', '```', ''].join('\n'))
    expect(strayFences(nested, 'nested.md')).toEqual([])
  })
})

describe('every documented configuration parses', () => {
  it('leaves no fence unaccounted for, so a narrower matcher cannot quietly shrink the set', () => {
    for (const file of scanned) expect(strayFences(join(root, file), file), file).toEqual([])
  })

  it('has a level declared on every block, so none is checked by a parser that ignores it', () => {
    const untagged = documented.filter((b) => b.level === undefined).map((b) => b.where)
    expect(untagged, `tag each of these \`\`\`yaml fences igor:<${LEVELS.join('|')}>`).toEqual([])
  })

  for (const block of documented) {
    if (block.level === undefined) continue
    it(`${block.where} (${block.level})`, () => {
      expect(() => parseAt[block.level as Level](block.text)).not.toThrow()
    })
  }
})
