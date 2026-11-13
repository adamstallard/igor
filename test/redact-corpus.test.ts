import { execFileSync } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { redact } from '../src/redact.js'

/**
 * Credential redaction changes nothing in real text that holds no secret. The corpus is this
 * repository's commit messages and docs, and state-branch records taken from
 * `adamstallard/igor-throwaway-lore` (`test/fixtures/igor-state.json`: each file as its
 * `igor-state` branch holds it, and the branch's commit messages), which hold transcripts,
 * triage decisions and execution rows as an Igor wrote them.
 *
 * This file registers no secret and passes an empty environment, so only the exact-shape token
 * patterns can change a text, and none of this text holds a real token. A change here is text
 * the rule would have destroyed.
 */
const ROOT = join(import.meta.dirname, '..')

function filesUnder(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) out.push(...filesUnder(path, keep))
    else if (keep(path)) out.push(path)
  }
  return out
}

function corpus(): [string, string][] {
  const markdown = (path: string) => path.endsWith('.md')
  const files = [
    join(ROOT, 'README.md'),
    join(ROOT, 'AGENTS.md'),
    ...filesUnder(join(ROOT, 'docs'), markdown),
    ...filesUnder(join(ROOT, 'openspec'), markdown),
  ]
  const texts: [string, string][] = files.map((path) => [relative(ROOT, path), readFileSync(path, 'utf8')])
  const state = JSON.parse(readFileSync(join(ROOT, 'test', 'fixtures', 'igor-state.json'), 'utf8')) as Record<string, string>
  for (const [path, text] of Object.entries(state)) texts.push([`igor-state:${path}`, text])
  const log = execFileSync('git', ['log', '--format=%H%n%B%x00'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  for (const entry of log.split('\0')) {
    const [sha, ...message] = entry.trim().split('\n')
    if (sha !== undefined && sha !== '') texts.push([`commit ${sha}`, message.join('\n')])
  }
  return texts
}

describe('credential redaction of text that holds no secret', () => {
  it('changes nothing in commit messages, docs, specs and state-branch records', () => {
    const texts = corpus()
    expect(texts.length).toBeGreaterThan(100)
    const changed = texts.filter(([, text]) => redact(text, {}) !== text).map(([where]) => where)
    expect(changed).toEqual([])
  })
})
