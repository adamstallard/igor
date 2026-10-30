import { createPrivateKey, createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { rememberKey, rememberSecret } from './redact.js'

/**
 * An Igor acting on GitHub as its GitHub App: the credentials, the tokens minted from them, and
 * the check that refuses to start an Igor that cannot act as its App.
 *
 * **The credentials come from the environment and nowhere else.** The variable names are the
 * `github-app` skill's, so its `check` runs against the same environment file, but nothing here
 * reads the files that skill stores under `~/.config/github-app/`. A server role whose
 * environment file is incomplete refuses to start rather than acting on credentials from a home
 * folder the unit never names.
 *
 * **A token lives in memory only.** It is handed to the one `gh` or `git` child making a call,
 * through that child's environment, and is never written to disk, to `process.env` or to a git
 * config.
 */

/** A reason the Igor cannot act as its App. Its message is written to be read by an operator. */
export class AppError extends Error {
  constructor(
    message: string,
    /** GitHub's HTTP status, where the refusal came from GitHub. */
    readonly status?: number,
  ) {
    super(message)
  }
}

export const IDENTITY_VARIABLE = 'GITHUB_APP_IDENTITY'
export const ID_VARIABLE = 'GITHUB_APP_ID'
export const KEY_VARIABLE = 'GITHUB_APP_PRIVATE_KEY'
export const KEY_FILE_VARIABLE = 'GITHUB_APP_PRIVATE_KEY_FILE'

/** The identity that `GITHUB_APP_*` credentials in an environment belong to, as the skill reads it. */
function owner(env: NodeJS.ProcessEnv): string {
  return env[IDENTITY_VARIABLE]?.trim() || 'default'
}

const set = (env: NodeJS.ProcessEnv, name: string): boolean => (env[name] ?? '').trim() !== ''

const listed = (names: readonly string[]): string =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`

/**
 * Why the environment does not hold `identity`'s credentials, or `undefined` where it does.
 * Reads no file and makes no request, so `role explain` can ask it.
 */
export function credentialProblem(identity: string, env: NodeJS.ProcessEnv): string | undefined {
  const present = [ID_VARIABLE, KEY_VARIABLE, KEY_FILE_VARIABLE].filter((name) => set(env, name))
  const belongsTo = owner(env)

  if (belongsTo !== identity) {
    if (present.length > 0) {
      const whose = set(env, IDENTITY_VARIABLE)
        ? `"${belongsTo}", which ${IDENTITY_VARIABLE} names`
        : `"default", since ${IDENTITY_VARIABLE} is unset`
      return (
        `${listed(present)} ${present.length === 1 ? 'is' : 'are'} set for ${whose}, and this Igor ` +
        `acts as "${identity}". Set ${IDENTITY_VARIABLE}=${identity} beside that App's credentials.`
      )
    }
    return (
      `this Igor acts as the GitHub App "${identity}", and its environment holds none of its ` +
      `credentials: ${IDENTITY_VARIABLE}=${identity}, ${ID_VARIABLE}, and ${KEY_FILE_VARIABLE} or ` +
      `${KEY_VARIABLE} are missing`
    )
  }

  if (set(env, KEY_VARIABLE) && set(env, KEY_FILE_VARIABLE)) {
    return `both ${KEY_FILE_VARIABLE} and ${KEY_VARIABLE} are set for "${identity}"; set one of them`
  }
  const missing = [
    ...(set(env, ID_VARIABLE) ? [] : [ID_VARIABLE]),
    ...(set(env, KEY_VARIABLE) || set(env, KEY_FILE_VARIABLE) ? [] : [`${KEY_FILE_VARIABLE} or ${KEY_VARIABLE}`]),
  ]
  if (missing.length === 0) return undefined
  return `the GitHub App "${identity}" is missing ${listed(missing)} in its environment`
}

export interface AppCredentials {
  identity: string
  appId: string
  /** The private key, PEM. */
  key: string
}

/** `identity`'s App ID and key, read from the environment, or a refusal naming what is wrong. */
export function readCredentials(identity: string, env: NodeJS.ProcessEnv): AppCredentials {
  const problem = credentialProblem(identity, env)
  if (problem !== undefined) throw new AppError(problem)
  const appId = env[ID_VARIABLE]!.trim()
  if (set(env, KEY_VARIABLE)) {
    const raw = env[KEY_VARIABLE]!.trim()
    // An environment file holds one line per variable, so a key there is usually written with
    // `\n` escapes. A key that already has line breaks is taken as it is.
    const key = raw.includes('\n') ? raw : raw.replaceAll('\\n', '\n')
    rememberKey(key)
    return { identity, appId, key }
  }
  const file = env[KEY_FILE_VARIABLE]!.trim()
  let key
  try {
    key = readFileSync(file, 'utf8')
  } catch (error) {
    throw new AppError(`the private key for "${identity}" at ${file} cannot be read: ${(error as Error).message}`)
  }
  rememberKey(key)
  return { identity, appId, key }
}

const base64url = (data: string | Buffer): string => Buffer.from(data).toString('base64url')

/**
 * A JSON web token for the App, signed RS256. Issued a minute in the past, so a host clock a
 * little ahead of GitHub's is not refused, and valid for nine minutes: GitHub refuses ten or more.
 */
export function appJwt(credentials: AppCredentials, now: number = Date.now()): string {
  let key
  try {
    key = createPrivateKey(credentials.key)
  } catch (error) {
    throw new AppError(
      `the private key for "${credentials.identity}" cannot sign: ${(error as Error).message}`,
    )
  }
  const seconds = Math.floor(now / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(JSON.stringify({ iat: seconds - 60, exp: seconds + 540, iss: credentials.appId }))
  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${claims}`)
  let jwt
  try {
    jwt = `${header}.${claims}.${base64url(signer.sign(key))}`
  } catch (error) {
    throw new AppError(
      `the private key for "${credentials.identity}" cannot sign: ${(error as Error).message}`,
    )
  }
  rememberSecret(jwt, (seconds + 540) * 1000)
  return jwt
}

/** Permission name to access level, as the installation token response reports them. */
export type Permissions = Record<string, string>

export interface MintedToken {
  token: string
  /** Epoch milliseconds. */
  expiresAt: number
  permissions: Permissions
}

export interface BotAccount {
  /** As REST spells it: `<slug>[bot]`. */
  login: string
  id: number
}

export interface Installation {
  id: number
  account: string
}

export type Fetch = (url: string, init: RequestInit) => Promise<Response>

const API = 'https://api.github.com'

/** The App's side of GitHub's REST API: everything a JWT or an installation token is needed for. */
export class GitHubApp {
  private readonly fetch: Fetch
  private readonly now: () => number

  constructor(
    readonly credentials: AppCredentials,
    options: { fetch?: Fetch; now?: () => number } = {},
  ) {
    this.fetch = options.fetch ?? ((url, init) => fetch(url, init))
    this.now = options.now ?? Date.now
  }

  private async call(
    method: string,
    path: string,
    auth: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    let response: Response
    try {
      response = await this.fetch(`${API}${path}`, {
        method,
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${auth}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'igor',
        },
      })
    } catch (error) {
      throw new AppError(`GitHub could not be reached for ${method} ${path}: ${(error as Error).message}`)
    }
    const text = await response.text()
    let body: Record<string, unknown> = {}
    try {
      const parsed: unknown = text === '' ? {} : JSON.parse(text)
      if (typeof parsed === 'object' && parsed !== null) body = parsed as Record<string, unknown>
    } catch {
      // A body that is not JSON carries no field anything below reads; the status still does.
    }
    return { status: response.status, body }
  }

  private jwt(): string {
    return appJwt(this.credentials, this.now())
  }

  private said(body: Record<string, unknown>): string {
    return typeof body['message'] === 'string' ? body['message'] : 'no message'
  }

  /** The App's slug, which names its bot account. Only a JWT is accepted here, never a token. */
  async slug(): Promise<string> {
    const { status, body } = await this.call('GET', '/app', this.jwt())
    if (status !== 200 || typeof body['slug'] !== 'string') {
      throw new AppError(
        `GitHub refused the credentials of the App "${this.credentials.identity}" ` +
          `(App ID ${this.credentials.appId}): ${status} ${this.said(body)}`,
        status,
      )
    }
    return body['slug']
  }

  /**
   * The installation that covers `repo`. Where there is none, a second question tells an App
   * that is not installed on the repository's account from one installed there without access
   * to this repository: the operator fixes the two in different places.
   */
  async installationFor(repo: string): Promise<Installation> {
    const { status, body } = await this.call('GET', `/repos/${repo}/installation`, this.jwt())
    const account = body['account'] as { login?: unknown } | undefined
    if (status === 200 && typeof body['id'] === 'number' && typeof account?.login === 'string') {
      return { id: body['id'], account: account.login }
    }
    if (status !== 404) {
      throw new AppError(
        `GitHub would not say which installation of "${this.credentials.identity}" covers ${repo}: ` +
          `${status} ${this.said(body)}`,
        status,
      )
    }
    const owner = repo.split('/')[0] ?? repo
    const onAccount = await this.call('GET', `/users/${owner}/installation`, this.jwt())
    if (onAccount.status === 200) {
      throw new AppError(
        `the App "${this.credentials.identity}" is installed on ${owner} but cannot reach ${repo}; ` +
          `add ${repo} to the installation's repositories`,
      )
    }
    throw new AppError(`the App "${this.credentials.identity}" is not installed on ${owner}, which holds ${repo}`)
  }

  async mint(installation: number): Promise<MintedToken> {
    const { status, body } = await this.call(
      'POST',
      `/app/installations/${installation}/access_tokens`,
      this.jwt(),
    )
    const expiresAt = typeof body['expires_at'] === 'string' ? Date.parse(body['expires_at']) : NaN
    if (status !== 201 || typeof body['token'] !== 'string' || Number.isNaN(expiresAt)) {
      throw new AppError(
        `GitHub would not mint a token for the App "${this.credentials.identity}": ${status} ${this.said(body)}`,
        status,
      )
    }
    const permissions = (typeof body['permissions'] === 'object' && body['permissions'] !== null
      ? body['permissions']
      : {}) as Permissions
    rememberSecret(body['token'], expiresAt)
    return { token: body['token'], expiresAt, permissions }
  }

  /** The App's bot account, which every event and comment it makes names. */
  async account(slug: string, token: string): Promise<BotAccount> {
    const login = `${slug}[bot]`
    const { status, body } = await this.call('GET', `/users/${encodeURIComponent(login)}`, token)
    if (status !== 200 || typeof body['id'] !== 'number') {
      throw new AppError(`GitHub did not resolve the App's bot account ${login}: ${status} ${this.said(body)}`, status)
    }
    return { login, id: body['id'] }
  }
}

/**
 * The installation token for the life of the process: minted on first use, and minted again
 * once half its life has passed, so a call never starts with less than that left. A paginated
 * search or a slow clone that starts on a token cannot outlive it.
 */
export class InstallationTokens {
  private current?: MintedToken & { renewAt: number }
  private minting: Promise<MintedToken & { renewAt: number }> | undefined

  constructor(
    private readonly app: GitHubApp,
    readonly installation: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** The installation's permissions, as the latest token reported them. */
  get permissions(): Permissions {
    return this.current?.permissions ?? {}
  }

  /**
   * A token minted now, whatever the current one has left. It shares a mint already under way,
   * as `token` does.
   */
  async renew(): Promise<string> {
    // Marked due rather than dropped, so `permissions` still answers while the mint is out.
    if (this.current !== undefined) this.current = { ...this.current, renewAt: -Infinity }
    return this.token()
  }

  async token(): Promise<string> {
    if (this.current !== undefined && this.now() < this.current.renewAt) return this.current.token
    // One mint at a time: several calls arriving together share it rather than each minting.
    this.minting ??= this.app
      .mint(this.installation)
      .then((minted) => {
        const at = this.now()
        return { ...minted, renewAt: at + (minted.expiresAt - at) / 2 }
      })
      .finally(() => {
        this.minting = undefined
      })
    this.current = await this.minting
    return this.current.token
  }
}

/** What the startup check refuses without: permission name to the label an operator sees. */
const REQUIRED: Record<string, string> = {
  contents: 'Contents',
  issues: 'Issues',
  pull_requests: 'Pull requests',
}

/**
 * Where an installation lacks Workflows write, the reason a publish touching
 * `.github/workflows/` is refused. Named once, so the startup report and the refusal agree.
 */
export const WORKFLOWS_MISSING =
  'the App\'s installation lacks Workflows write, so a publish that changes a file under ' +
  '.github/workflows/ fails; grant Workflows read and write if this role changes workflows'

export function canWriteWorkflows(permissions: Permissions): boolean {
  return permissions['workflows'] === 'write'
}

export interface AppSession {
  identity: string
  app: GitHubApp
  slug: string
  account: BotAccount
  installation: Installation
  tokens: InstallationTokens
  /** Reported at startup and not refused: a missing Workflows write. */
  warnings: string[]
}

/**
 * Refuses to start an Igor that cannot act as its App on every repository it touches, naming the
 * first failure, in the order an operator would fix them: credentials, key, App, installation,
 * permissions, bot account.
 *
 * Access is read from the token's `permissions`, never from a collaborator record, which reports
 * an App's bot as unable to push wherever its installation writes.
 */
export async function startApp(
  identity: string,
  repos: readonly string[],
  env: NodeJS.ProcessEnv,
  options: { fetch?: Fetch; now?: () => number } = {},
): Promise<AppSession> {
  const credentials = readCredentials(identity, env)
  // Signed once before any request, so a bad key is named as a bad key and not as GitHub
  // refusing a token it never received.
  appJwt(credentials, (options.now ?? Date.now)())
  const app = new GitHubApp(credentials, options)
  const slug = await app.slug()

  const wanted = [...new Set(repos)]
  const found = new Map<number, { installation: Installation; repos: string[] }>()
  for (const repo of wanted) {
    const installation = await app.installationFor(repo)
    const entry = found.get(installation.id) ?? { installation, repos: [] }
    entry.repos.push(repo)
    found.set(installation.id, entry)
  }
  if (found.size > 1) {
    const accounts = [...found.values()].map((f) => `${f.installation.account} (${f.repos.join(', ')})`)
    throw new AppError(
      `the App "${identity}" reaches these repositories through more than one installation, and an ` +
        `Igor uses one: ${accounts.join('; ')}. Keep a role's repositories and its lore repository ` +
        `on one account`,
    )
  }
  const only = [...found.values()][0]
  if (only === undefined) throw new AppError(`the role names no repository for the App "${identity}" to act on`)

  const tokens = new InstallationTokens(app, only.installation.id, options.now)
  const token = await tokens.token()
  const missing = Object.entries(REQUIRED)
    .filter(([name]) => tokens.permissions[name] !== 'write')
    .map(([, label]) => `${label} write`)
  if (missing.length > 0) {
    throw new AppError(
      `the App "${identity}"'s installation on ${only.installation.account} lacks ${listed(missing)}; ` +
        `grant ${missing.length === 1 ? 'it' : 'them'} in the App's settings and accept the new ` +
        `permissions on the installation`,
    )
  }
  const account = await app.account(slug, token)
  return {
    identity,
    app,
    slug,
    account,
    installation: only.installation,
    tokens,
    warnings: canWriteWorkflows(tokens.permissions) ? [] : [WORKFLOWS_MISSING],
  }
}

/**
 * Whether GitHub mints a token now, for an Igor that is already running: `true`, or why not, in
 * words that name the App. It mints every time it is asked, never answering from a held token,
 * so a credential GitHub has stopped accepting is seen at once. A mint costs one request and no
 * seat, so asking before each item is how a refused credential is found, and found to work
 * again, without spending an item to find out.
 */
export async function canMint(tokens: Pick<InstallationTokens, 'renew'>): Promise<true | string> {
  try {
    await tokens.renew()
    return true
  } catch (error) {
    return (error as Error).message
  }
}
