import { basename } from 'node:path'
import type { Config } from './config.js'
import type { Entry } from './entry.js'
import {
  ENTRIES_DIR,
  loadEntry,
  parseEntry,
  type LoadedEntry,
  rejectedIds,
  writeEntry,
  writeRejection,
  takenIds,
  StoreError,
} from './store.js'
import {
  fileAtRef,
  landedFiles,
  listPullRequests,
  pullRequest,
  proposedFiles,
  proposingCommitFiles,
  repoFromCheckout,
  storePrefix,
  type PrState,
} from './github.js'
import { readState, writeState } from './state.js'

/** Where the closed-pull-request floor lives on the destination's state branch. */
export const STATE_PATH = 'reconcile.json'

/**
 * How many unfinished pull requests are carried. Each costs a handful of requests per run, so
 * the cap is what keeps the bound a bound; a destination with more than this many standing
 * conditions has something wrong with it that re-reading them will not fix.
 */
const MAX_PENDING = 100

interface ReconcileState {
  /**
   * Every closed pull request whose activity is at or before this instant has been examined.
   * Losing it costs one full re-examination and nothing else, which is the state branch's
   * standing bargain.
   */
  closedSeen: string
  /**
   * Pull requests the last run left something to do on, carried by number so that the floor can
   * keep moving without abandoning them. A floor held behind them instead would re-read
   * everything newer on every run forever: one entry retired after it was promoted, or one file
   * with frontmatter nobody fixes, and the bound is gone.
   */
  pending?: number[]
}

export interface Promoted {
  id: string
  by: string
  at: string
  pr: number
  /**
   * Set when whoever merged was not among the assignees. Their name is still recorded —
   * they did approve it — but attributing the judgment silently would misstate who vouched.
   */
  mergerWasNotAssigned?: boolean
}

export interface Declined {
  id: string
  pr: number
  by: string
  at: string
  /** The rejection record written for it, which is also how a person undoes the rejection. */
  record: string
}

export interface Stale {
  pr: number
  url: string
  assignees: string[]
  lastActivity: string
}

/** An entry file that is there and cannot be read — broken frontmatter, or unreadable on disk. */
export interface Unreadable {
  id: string
  reason: string
}

/**
 * A pull request held over for the next run that nothing else in this report names. A read
 * failed and something is still owed on it: the promotion is not lost, but it has not happened,
 * and a run that says nothing about it looks exactly like a run that had nothing to do.
 */
export interface Carried {
  pr: number
  /** Which read failed — the pull request itself, or who merged it. */
  reason: 'pull-request' | 'merger'
}

export interface Reconciliation {
  promoted: Promoted[]
  declined: Declined[]
  stale: Stale[]
  deferred: number[]
  /** Held over for the next run and reported nowhere else in here. */
  carried: Carried[]
  /**
   * Carried work the cap cut that the floor has already passed, so neither half of a later run
   * goes looking for it. Reported rather than cut quietly: the carry is what a promotion below
   * the floor is waiting on, and nothing else announces the list getting shorter.
   */
  evicted: number[]
  /** Entries a merged pull request added that are not in the local checkout yet. */
  missingLocally: string[]
  unreadable: Unreadable[]
  /**
   * The floor the closed half of the sweep stopped at, absent where it read the whole history.
   * Reported rather than inferred: what was not looked at is the one thing a reader of this
   * cannot work out from the rest of it.
   */
  scannedSince?: string
}

function daysBetween(iso: string, now: Date): number {
  return (now.getTime() - Date.parse(iso)) / 86_400_000
}

/**
 * An entry file, by where it lives. A markdown file elsewhere shares no namespace with it.
 *
 * `prefix` is the store's path within the repository. These paths come back from the API and so
 * are relative to the repository root, which is not where the store is unless it happens to sit
 * there.
 */
function isEntryFile(path: string, prefix: string): boolean {
  return path.startsWith(`${prefix}${ENTRIES_DIR}/`) && path.endsWith('.md')
}

function idsFrom(paths: readonly string[], prefix: string): string[] {
  return paths.filter((p) => isEntryFile(p, prefix)).map((p) => basename(p, '.md'))
}

/**
 * Entry text that a person wrote and nothing validated. Unparseable frontmatter is ordinary —
 * an unquoted colon in a claim is enough — and it must not be fatal: reconciliation sweeps
 * every pull request it has not already settled, and a throw leaves the watermark unwritten —
 * so one bad candidate in one old proposal would otherwise abort every run forever, including
 * the merge-triggered one, and never get past the pull request that wedged it.
 *
 * Says why rather than only that it failed, because the two callers report it to a person who
 * has to go and fix the file.
 */
function readEntry(read: () => LoadedEntry): { entry?: Entry; reason: string } {
  let loaded: LoadedEntry
  try {
    loaded = read()
  } catch (error) {
    return { reason: error instanceof Error ? error.message : String(error) }
  }
  if (loaded.entry === undefined) {
    const why = loaded.errors.map((e) => `${e.field} ${e.message}`).join('; ')
    return { reason: why === '' ? 'could not be read' : why }
  }
  return { entry: loaded.entry, reason: '' }
}

/**
 * Whether a pull request proposes lore — a question about the entry files it adds, not its
 * branch name, because anyone may open one by hand.
 *
 * The diff answers it in one request for every shape but one, so it is asked first. The
 * exception is a proposal whose every candidate the reviewer deleted: its diff is empty and it
 * is still a proposal, which only the proposing commit can say, at two requests more.
 *
 * Costs requests either way, so the loop calls it only where it has no files in hand already
 * and the answer changes what gets reported.
 */
async function isProposal(repo: string, number: number, prefix: string): Promise<boolean> {
  if (idsFrom(await landedFiles(repo, number), prefix).length > 0) return true
  return idsFrom((await proposingCommitFiles(repo, number)).files, prefix).length > 0
}

/**
 * How far the floor may move: to the newest closed pull request the scan actually read.
 *
 * Nothing is held back here, because a floor is a prefix and holding it behind one pull request
 * abandons nothing while re-reading everything newer than it, run after run. Unfinished work is
 * carried by number in `pending` instead, which costs a few requests each and clears itself.
 *
 * A scan that cannot be vouched for moves nothing. Everything below the floor is abandoned by
 * definition, so a scan that may have hidden a row behind a page boundary must not set one.
 */
function nextMark(
  examined: readonly PrState[],
  previous: string | undefined,
  complete: boolean,
): string | undefined {
  if (!complete || examined.length === 0) return undefined
  const instant = (pr: PrState): number => Date.parse(pr.updatedAtInstant)
  const newest = examined.reduce((a, b) => (instant(a) >= instant(b) ? a : b))
  if (previous !== undefined && instant(newest) <= Date.parse(previous)) return undefined
  return newest.updatedAtInstant
}

/**
 * The order the cap cuts from: newest activity first, so what falls off is the oldest standing
 * condition rather than the pull request somebody merged a minute ago.
 *
 * What falls off may be gone for good: where the floor moved over it, a number the cap cut is
 * found by neither half of the next run. That is why the order has to be the one worth keeping,
 * and why the report names what fell off rather than losing it quietly.
 *
 * A number whose own read failed has no date, and it ranks last rather than first. Do not move
 * it to the front to protect it: the carry holds at most a hundred numbers, so a hundred that
 * nothing can read — a transfer, a rename, a burst of single-pull-request reads that tripped
 * the secondary rate limit — would then crowd out the merge that just landed, which is the one
 * thing the cap exists to keep. Ranked last, an unreadable number drains out of the carry a few
 * at a time and a live merge always has a slot.
 */
function retentionOrder(
  unfinished: readonly number[],
  unread: readonly number[],
  activity: ReadonlyMap<number, number>,
): number[] {
  const at = (n: number): number => activity.get(n) ?? 0
  const dated = [...unfinished].sort((a, b) => at(b) - at(a) || b - a)
  return [...new Set([...dated, ...unread])]
}

/**
 * Runs at the start of every invocation rather than on a timer: there is no daemon, so a
 * merged pull request stays unpromoted until someone next uses the tool.
 */
export async function reconcile(
  config: Config,
  options: { now?: Date; staleAfterDays?: number } = {},
): Promise<Reconciliation> {
  const now = options.now ?? new Date()
  const staleAfterDays = options.staleAfterDays ?? 7
  const repo = await repoFromCheckout(config.destination)
  const prefix = await storePrefix(config.destination)
  const stored = await readState<ReconcileState>(repo, STATE_PATH)
  const since = typeof stored?.closedSeen === 'string' ? stored.closedSeen : undefined
  const scan = await listPullRequests(repo, since)
  // Carried from the last run because the floor has already passed them. Each costs one request
  // to read back, and a read that fails keeps the number rather than failing the run — see the
  // write below for why it is kept rather than dropped.
  const carried = Array.isArray(stored?.pending) ? stored.pending : []
  const scanned = new Set(scan.prs.map((p) => p.number))
  const extra: PrState[] = []
  /** Carried numbers this run could not read back, which is not the same as no longer there. */
  const unread: number[] = []
  for (const number of carried) {
    if (typeof number !== 'number' || scanned.has(number)) continue
    const pr = await pullRequest(repo, number)
    if (pr === undefined) unread.push(number)
    else extra.push(pr)
  }
  const prs = [...scan.prs, ...extra]
  /** Read by number already, so their `mergedBy` is settled and re-reading one buys nothing. */
  const readByNumber = new Set(extra.map((p) => p.number))

  const result: Reconciliation = {
    promoted: [],
    declined: [],
    stale: [],
    deferred: [],
    carried: unread.map((pr) => ({ pr, reason: 'pull-request' as const })),
    evicted: [],
    missingLocally: [],
    unreadable: [],
    ...(since === undefined ? {} : { scannedSince: since }),
  }
  const present = takenIds(config.destination)
  const rejected = rejectedIds(config.destination)
  /** Closed pull requests the scan itself covered, which is what the floor may move over. */
  const examined = scan.prs.filter((p) => p.state !== 'open')
  /** Pull requests this run left something to do on, whichever half they came from. */
  const unfinished: number[] = []

  for (const pr of prs) {
    if (pr.state === 'open') {
      // The window is tested before the files are: a quiet pull request is the only open one
      // this reports on, so a backlog of active ones costs no request at all.
      if (daysBetween(pr.updatedAt, now) < staleAfterDays) continue
      if (!(await isProposal(repo, pr.number, prefix))) continue
      result.stale.push({
        pr: pr.number,
        url: pr.url,
        assignees: pr.assignees,
        lastActivity: pr.updatedAt,
      })
      continue
    }
    if (!pr.merged) {
      if (!(await isProposal(repo, pr.number, prefix))) continue
      // Closed without merging means deferred. Declining is permanent, so it must be the
      // deliberate act of deleting a file, never the passive one of closing a tab.
      result.deferred.push(pr.number)
      continue
    }

    const proposal = await proposedFiles(repo, pr.number)
    // Free on this path: these are the files the loop was fetching anyway.
    const proposedIds = idsFrom(proposal.files, prefix)
    if (proposedIds.length === 0) continue
    /**
     * Who merged, which the list endpoint does not carry: it omits `merged_by` outright, so a
     * pull request the scan found has to be read back by number to answer for it. Asked here
     * rather than up with the scan because only a merged proposal needs the answer — one
     * request each, against the two or three the file reads above already spent on it.
     *
     * A read that fails leaves the pull request for the next run rather than promoting under
     * the assignee: `reviewed.by` is written into the entry permanently, and a run that could
     * not ask who merged does not get to guess.
     */
    const detail = readByNumber.has(pr.number) ? pr : await pullRequest(repo, pr.number)
    if (detail === undefined) {
      unfinished.push(pr.number)
      result.carried.push({ pr: pr.number, reason: 'merger' })
      continue
    }
    const by = detail.mergedBy ?? detail.assignees[0] ?? 'unknown'
    const at = detail.mergedAt ?? now.toISOString().slice(0, 10)
    const landed = new Set(idsFrom(proposal.landed, prefix))
    /**
     * What this pull request had produced before its entries were walked. Anything it adds is
     * something a later run still has to see: a promotion or a rejection because the write into
     * the checkout is committed by somebody else and may never be, and a missing or unreadable
     * entry because the promotion it is owed is still owed once the checkout or the file is
     * fixed.
     */
    const produced = (): number =>
      result.promoted.length +
      result.declined.length +
      result.missingLocally.length +
      result.unreadable.length
    const before = produced()

    for (const id of proposedIds) {
      const path = `${prefix}${ENTRIES_DIR}/${id}.md`
      if (!present.has(id)) {
        // A local absence means the reviewer deleted it, or this checkout is behind. Rejection
        // is permanent, so the pull request's own diff settles it. Asking the destination's
        // current state instead would read an entry retired long afterwards as a rejection.
        //
        // A draft the author added and deleted themselves lands here too, and accepting that is
        // deliberate. It is `added` in the proposing commit and absent at head, which is exactly
        // the file list a reviewer's deletion produces; separating them needs a signal the file
        // list does not carry. Recording nothing instead would lose reviewer deletions, which
        // are the gesture this exists for, and a stray record and its id are deletable by hand.
        if (landed.has(id)) {
          result.missingLocally.push(id)
          continue
        }
        if (rejected.has(id)) continue
        const text =
          proposal.commit === undefined ? undefined : await fileAtRef(repo, path, proposal.commit)
        const entry =
          text === undefined ? undefined : readEntry(() => parseEntry(path, text)).entry
        const record = writeRejection(config.destination, {
          id,
          by,
          at,
          pr: pr.number,
          ...(entry === undefined ? {} : { entry }),
        })
        rejected.add(id)
        result.declined.push({ id, pr: pr.number, by, at, record })
        continue
      }
      // Reached only when the id is present, so a failure here is a file that is there and
      // broken. Reporting it as behind would send someone to pull a checkout that is current.
      const loaded = readEntry(() => loadEntry(config.destination, id))
      if (loaded.entry === undefined) {
        result.unreadable.push({ id, reason: loaded.reason })
        continue
      }
      if (loaded.entry.status !== 'provisional') continue
      writeEntry(config.destination, {
        ...loaded.entry,
        status: 'active',
        reviewed: { by, at },
      })
      const unexpected =
        detail.mergedBy !== undefined && !detail.assignees.includes(detail.mergedBy)
      result.promoted.push({
        id,
        by,
        at,
        pr: pr.number,
        ...(unexpected ? { mergerWasNotAssigned: true } : {}),
      })
    }
    if (produced() > before) unfinished.push(pr.number)
  }

  const closedSeen = nextMark(examined, since, scan.complete) ?? since
  if (closedSeen !== undefined) {
    // A read that failed stays carried. `pullRequest` cannot tell a pull request that is gone
    // from one the API would not hand over just now, and dropping it on a rate limit would
    // abandon the promotion it is owed with nothing above the floor to find it again.
    const activity = new Map(prs.map((p) => [p.number, Date.parse(p.updatedAtInstant)]))
    const ordered = retentionOrder(unfinished, unread, activity)
    const pending = ordered.slice(0, MAX_PENDING)
    // Swallowed: a destination that refuses the write reconciles unbounded, which is slow
    // rather than wrong, and nothing in this run reads it back.
    const wrote = await writeState(
      repo,
      STATE_PATH,
      { closedSeen, ...(pending.length === 0 ? {} : { pending }) } satisfies ReconcileState,
      'Update reconciliation watermark',
    ).catch(() => undefined)
    // Only a write that landed cut anything. A refused one leaves the previous document whole,
    // so the carry is still its old length and the next run re-derives this same list.
    if (wrote !== undefined) {
      // The cap cutting a number is not what loses it — the floor moving past it is. A scan
      // this run could not vouch for moves no floor, so everything it found is still above the
      // old one and the next scan hands it straight back. Only what the floor has reached is
      // gone; a number with no date came from below it and is gone either way.
      const floor = Date.parse(closedSeen)
      result.evicted = ordered
        .slice(MAX_PENDING)
        .filter((n) => (activity.get(n) ?? floor) <= floor)
      const lost = new Set(result.evicted)
      // A number the cap cut and the floor passed is waiting for nothing. Naming it as carried
      // as well puts two lines in the report that contradict each other.
      result.carried = result.carried.filter((c) => !lost.has(c.pr))
    }
  }
  return result
}

/**
 * The reconcile report as a person reads it, kept beside what produces it so that an outcome
 * and the line announcing it are one change rather than two.
 *
 * Emptiness is "nothing was written", never a list of the outcomes that count. Do not go back
 * to a list: it is stale the moment an outcome is added to it, and a run whose only outcome the
 * list forgot prints `nothing to reconcile` under the line announcing it.
 */
export function renderReconciliation(r: Reconciliation, reviewers: readonly string[]): string {
  let out = ''
  for (const p of r.promoted) {
    const flag = p.mergerWasNotAssigned ? '  (merged by someone not assigned to review it)' : ''
    out += `promoted  ${p.id}  by ${p.by} on ${p.at}${flag}\n`
  }
  for (const d of r.declined) {
    out += `declined  ${d.id}  by ${d.by} (pr #${d.pr}) — recorded in ${d.record}\n`
  }
  for (const s of r.stale) {
    const assigned = s.assignees.join(', ') || '(nobody)'
    const escalate = reviewers.join(', ') || '(no store reviewers configured)'
    out += `stale     #${s.pr} last active ${s.lastActivity}, assigned ${assigned} — escalate to ${escalate}\n  ${s.url}\n`
  }
  if (r.deferred.length > 0) {
    out += `deferred  ${r.deferred.map((n) => `#${n}`).join(', ')} (closed unmerged)\n`
  }
  for (const c of r.carried) {
    out +=
      c.reason === 'merger'
        ? `carried   #${c.pr} — merged, but who merged could not be read; the promotion waits for the next run\n`
        : `carried   #${c.pr} — could not be read this run; the next run asks again\n`
  }
  if (r.evicted.length > 0) {
    out +=
      `dropped   ${r.evicted.map((n) => `#${n}`).join(', ')} — cut from the carry at the ` +
      `${MAX_PENDING}-pull-request cap; check them by hand\n`
  }
  if (r.missingLocally.length > 0) {
    out += `behind    ${r.missingLocally.join(', ')} — merged upstream but not here; pull the destination\n`
  }
  for (const u of r.unreadable) {
    out += `unreadable ${u.id} — ${u.reason}\n`
  }
  if (out === '') out = 'nothing to reconcile\n'
  if (r.promoted.length > 0 || r.declined.length > 0) {
    out += '\nPromotions and rejection records edited files locally — commit and push them.\n'
  }
  return out
}

/**
 * Promotes provisional entries in place, recording whoever ran it as the approver.
 *
 * A manual repair, not an event's mechanism: reconciliation is what promotes, and it sweeps
 * pull requests. An entry that reached the default branch without one has nothing to sweep,
 * and this is how a person puts it in force and says so.
 */
export function promoteInPlace(
  config: Config,
  by: string,
  at: string,
  only?: readonly string[],
): Promoted[] {
  const wanted = only === undefined ? undefined : new Set(only.map((p) => basename(p, '.md')))
  const promoted: Promoted[] = []
  for (const id of takenIds(config.destination)) {
    if (wanted !== undefined && !wanted.has(id)) continue
    const loaded = loadEntry(config.destination, id)
    if (loaded.entry === undefined || loaded.entry.status !== 'provisional') continue
    writeEntry(config.destination, { ...loaded.entry, status: 'active', reviewed: { by, at } })
    promoted.push({ id, by, at, pr: 0 })
  }
  return promoted
}

export { StoreError }
export type { PrState }
