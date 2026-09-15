import { spawn } from 'node:child_process'

/**
 * One wrapper around the `gh` CLI, so credentials and enterprise hosts are whatever the user
 * already set up.
 *
 * Always spawn rather than `execFile`: promisified `execFile` silently ignores an `input`
 * option — that belongs to `execFileSync` — so anything reading stdin hangs forever waiting on
 * input that never arrives.
 */
export class GhError extends Error {}

export function ghRaw(args: readonly string[], input?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('gh', args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => (stdout += chunk))
    child.stderr.on('data', (chunk) => (stderr += chunk))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new GhError(`gh ${args.slice(0, 2).join(' ')} failed: ${stderr.trim() || `exited ${code}`}`))
    })
    child.stdin.end(input ?? '')
  })
}

export async function gh<T = unknown>(args: readonly string[], input?: string): Promise<T> {
  const stdout = await ghRaw(args, input)
  if (stdout.trim() === '') return null as T
  try {
    return JSON.parse(stdout) as T
  } catch {
    throw new GhError(`gh returned unparseable output: ${stdout.slice(0, 200)}`)
  }
}

/**
 * Every page of a list endpoint, flattened.
 *
 * `gh api --paginate` concatenates each page's JSON array into one stream, which is not a
 * document `JSON.parse` accepts. `--slurp` wraps them in an outer array instead, so one parse
 * yields pages and the flatten yields records.
 *
 * Worth the extra requests wherever truncation would be silent and wrong rather than merely
 * incomplete. GitHub returns issue comments oldest-first, so a single capped page drops the
 * *newest* — which is where a stop lives.
 */
export async function ghPaginated<T>(args: readonly string[]): Promise<T[]> {
  const pages = await gh<T[][] | null>([...args, '--paginate', '--slurp'])
  return (pages ?? []).flat()
}

/**
 * GraphQL is what makes discovery cheap: one request returns issues with their labels,
 * assignees and linked pull requests at a rate-limit cost of 1, where the REST equivalent is a
 * search plus a call per issue to find out whether work is already in flight.
 *
 * Errors arrive with HTTP 200 and an `errors` array, so they have to be checked for rather
 * than caught.
 */
export async function ghGraphql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const args = ['api', 'graphql', '--input', '-']
  const body = await gh<{ data?: T; errors?: { message: string }[] }>(
    args,
    JSON.stringify({ query, variables }),
  )
  if (body?.errors?.length) {
    throw new GhError(`graphql: ${body.errors.map((e) => e.message).join('; ')}`)
  }
  if (body?.data === undefined) throw new GhError('graphql returned no data')
  return body.data
}
