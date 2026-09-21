import type { Candidate, CodeHost, Comment, Tracker } from './adapter.js'
import type { Gate, SeatVerdict } from './budget.js'
import { checkpoint, eligibleAfterStop, stopReceipt, takeClaim, type ClaimOptions } from './claiming.js'
import { complete, execute, workerEnv, type ExecuteOptions, type ExecutionResult } from './execute.js'
import { handOffFrom, type HandoffReason } from './handoff.js'
import type { Role } from './role.js'
import type { TreeProvider } from './worktree.js'
import { appendRecord } from './state.js'
import {
  advance, discover, EMPTY_STATE, freshCandidates, heldBelow, loadDiscoveryState, saveDiscoveryState,
} from './discovery.js'
import { countStages, screen } from './predicate.js'
import { isStop } from './signals.js'
import { fingerprint, loadDeferrals, stillDeferred, type DeferralState } from './deferred.js'
import { systemPrompt, triageBatch, TRIAGE_MODEL } from './triage.js'

/**
 * One claimed item, start to finish.
 *
 * The rule this exists to enforce: **an Igor never goes silent on something it claimed.** The
 * claim told other people to stand off, so every exit from here either produces an artifact,
 * posts a handoff, or posts a receipt. Releasing quietly is not among the outcomes.
 *
 * Failure hands off rather than retrying. A silent retry loop on a claimed item is precisely
 * the failure the claim protocol makes worst — everyone has backed off, and nothing is
 * happening or being said.
 */

/**
 * Pulls the explanation out of a worker's report, which opens with a heading or a bare
 * statement and then elaborates. The first substantial paragraph is the answer; the rest is
 * detail the transcript keeps.
 */
export function declineReason(transcript: string, limit = 400): string {
  const cleaned = transcript
    .split('\n')
    .filter((l) => !/^\s*(#|\*\*Why:\*\*\s*$)/.test(l))
    .join('\n')
    .replace(/\*\*Why:\*\*\s*/i, '')
    .trim()
  if (cleaned === '') return 'it read this and found nothing it could usefully change'
  const paragraphs = cleaned.split(/\n\s*\n/).filter((p) => p.trim().length > 40)
  const first = (paragraphs[0] ?? cleaned).replace(/\s+/g, ' ').trim()
  if (first.length <= limit) return first
  const cut = first.slice(0, limit)
  const at = cut.lastIndexOf('. ')
  return at > limit / 2 ? cut.slice(0, at + 1) : `${cut.trimEnd()}…`
}

/**
 * What was left behind, for whoever took the item over. Deliberately makes no request: an Igor
 * that lost an item should not then appear in someone's review queue over it.
 */
export function handOverNote(role: Role, by: string | undefined, url: string): string {
  const who = by === undefined ? '' : ` ${by} has it now, and`
  return (
    `**${role.name}** was working this and has released it.${who} what exists so far is ${url}, ` +
    `left as a draft with no review requested. It is yours to keep, continue, or discard.`
  )
}

export interface ItemDeps {
  tracker: Tracker
  codeHost: CodeHost
  trees: TreeProvider
}

export type ItemOutcome =
  | 'produced'
  | 'handed-off'
  | 'stopped'
  | 'lost'
  | 'refused'

export interface ItemRun {
  outcome: ItemOutcome
  candidate: Candidate
  reason: string
  execution?: ExecutionResult
  /** Undefined where the worker never reported one, which a killed run never does. */
  costUsd: number | undefined
  /** Whether a message was left on the item. False here is a bug, not a state. */
  spoke: boolean
  /** Why it was handed back, where it was — a budget handoff says nothing about the item. */
  handoff?: HandoffReason['kind']
  /**
   * Every configuration of the Igor's own this run proved wrong, in the order the run met
   * them. A handoff carrying any is taken as the Igor's doing rather than the item's, so the
   * item is not suppressed over it — and all of them are kept, because a run can be refused
   * an action and denied a command at once, and each is a separate thing to fix.
   */
  cures: string[]
}

export type Step = 'claiming' | 'settling' | 'working' | 'publishing' | 'completing'

export interface RunOptions extends ExecuteOptions {
  claim?: ClaimOptions
  /** Called as each stage begins. A worker can run for minutes; silence is not a status. */
  onStep?: (step: Step) => void
  /** Supplied by the budget layer once it exists; absent means budget is not being enforced. */
  budget?: {
    exhausted: () => boolean
    seat?: string
    token?: { tokenEnv?: string; tokenFile?: string; tokenCommand?: string }
    resetAt?: string
    resetApproximate?: boolean
    blocked?: SeatVerdict
    passedOver?: readonly { seat: string; verdict: SeatVerdict }[]
  }
}

export async function runItem(
  deps: ItemDeps,
  candidate: Candidate,
  role: Role,
  identity: string,
  options: RunOptions = {},
): Promise<ItemRun> {
  const { tracker, codeHost, trees } = deps

  const step = options.onStep ?? (() => {})
  step('claiming')
  const claim = await takeClaim(tracker, candidate, role, identity, {
    ...(options.claim ?? {}),
    onSettle: () => step('settling'),
  })
  if (claim.outcome !== 'held') {
    // Nothing was claimed, or someone else holds it. Neither owes a handoff: a refused claim
    // means the Igor never told anyone to stand off, and a lost one means somebody else is
    // now visibly on it. A stop gets a receipt rather than a handoff, because whoever issued
    // it is presumably taking the work and composing a handoff would only delay the release.
    if (claim.outcome === 'stopped' && claim.verdict) {
      await tracker.report(candidate, stopReceipt(role, claim.verdict)).catch(() => undefined)
      return { outcome: 'stopped', candidate, reason: claim.reason, costUsd: 0, spoke: true, cures: [] }
    }
    return {
      outcome: claim.outcome === 'lost' ? 'lost' : 'refused',
      candidate,
      reason: claim.reason,
      costUsd: 0,
      spoke: false,
      cures: [],
    }
  }

  // Budget is checked after claiming and before spending, so an Igor that cannot afford the
  // work says so on the item rather than claiming and going quiet.
  if (options.budget?.exhausted()) {
    const reason: HandoffReason = {
      kind: 'budget',
      ...(options.budget.seat === undefined ? {} : { seat: options.budget.seat }),
      ...(options.budget.resetAt === undefined ? {} : { resetAt: options.budget.resetAt }),
      ...(options.budget.resetApproximate === true ? { resetApproximate: true } : {}),
      // Carried so the handoff can say which way there was no seat. Without it every route to
      // "no seat" reads as a spent budget, including the one where no seat's usage could be
      // read at all — #49.
      ...(options.budget.blocked === undefined ? {} : { blocked: options.budget.blocked }),
      ...(options.budget.passedOver === undefined ? {} : { passedOver: options.budget.passedOver }),
    }
    const out = await handOffFrom(tracker, candidate, role, identity, claim.claimedAt, reason)
    return {
      outcome: 'handed-off', candidate, reason: 'budget exhausted before starting',
      costUsd: 0, spoke: out.posted, handoff: 'budget', cures: [],
    }
  }

  step('working')
  const execution = await execute(trees, tracker, codeHost, candidate, role, {
    ...options,
    ...(options.lore === undefined ? {} : { lore: options.lore }),
    // Named rather than left to the spread, which is a field nobody keeps correct. The worker
    // authenticating as the seat the gate chose is the whole point, and a pull request points
    // at its transcript only where the store arrives.
    ...(options.budget?.token === undefined ? {} : { seatToken: options.budget.token }),
    // Named alongside the token it goes with: a token source that cannot be read is the seat's
    // own misconfiguration, and the key that says so needs the seat's name.
    ...(options.budget?.seat === undefined ? {} : { seat: options.budget.seat }),
    ...(options.store === undefined ? {} : { store: options.store }),
    onPublish: () => step('publishing'),
    claimStatus: async () => (await checkpoint(tracker, claim, identity)).status,
  })

  switch (execution.outcome) {
    case 'produced': {
      step('completing')
      const refusal = await complete(tracker, candidate, role, identity)
      if (refusal) {
        await tracker
          .report(candidate, `**${role.name}** finished but could not ${refusal.action}: ${refusal.why}`)
          .catch(() => undefined)
      }
      return {
        outcome: 'produced',
        candidate,
        reason: execution.reason,
        execution,
        costUsd: execution.costUsd,
        spoke: true,
        cures: execution.cures ?? [],
      }
    }

    case 'refused': {
      // The claim went away mid-execution. A stop, most likely — so a receipt, not a handoff.
      const verdict = await checkpoint(tracker, claim, identity)
      if (verdict.status === 'stopped' || verdict.status === 'lost') {
        // Released before anything is said, so the receipt is true by the time it can be read.
        // `takeClaim` does this for a stand-down inside the settle window; standing down later
        // is the same obligation, and skipping it left the Igor's name on an item it had just
        // announced it was releasing.
        await tracker.release(candidate, identity).catch(() => undefined)
      }
      if (verdict.status === 'stopped') {
        const artifact = execution.artifact ? execution.artifact.url : undefined
        await tracker.report(candidate, stopReceipt(role, verdict, artifact)).catch(() => undefined)
        return {
          outcome: 'stopped', candidate, reason: execution.reason, execution,
          costUsd: execution.costUsd, spoke: true, cures: execution.cures ?? [],
        }
      }
      if (verdict.status === 'lost') {
        // Silent where there is nothing to hand over: whoever took it is visibly on it, and a
        // message would only tell them what they just did. A draft left behind is different —
        // unannounced, it is work nobody knows exists.
        const artifact = execution.artifact
        if (artifact !== undefined) {
          await tracker.report(candidate, handOverNote(role, verdict.by, artifact.url)).catch(() => undefined)
        }
        return {
          outcome: 'lost', candidate, reason: execution.reason, execution,
          costUsd: execution.costUsd, spoke: artifact !== undefined, cures: execution.cures ?? [],
        }
      }
      // Still held, so the refusal was the action space rather than the claim: that is a
      // dead end the Igor cannot get past, which is what a handoff is for. An action space
      // with nothing in it names a cure of its own, and the run carries any it met on the way.
      const cures = execution.cures ?? []
      const out = await handOffFrom(
        tracker, candidate, role, identity, claim.claimedAt,
        { kind: 'failure', detail: execution.reason, ...(cures.length === 0 ? {} : { cures }) }, execution,
      )
      return {
        outcome: 'handed-off', candidate, reason: execution.reason, execution,
        costUsd: execution.costUsd, spoke: out.posted, handoff: 'failure', cures,
      }
    }

    case 'budget': {
      // Exhaustion found mid-run and exhaustion found before starting are one condition seen
      // at two moments, so they converge on one handoff — and on one kind, which is what keeps
      // the item out of the deferral record: nothing about it caused this, so it comes back
      // when capacity does.
      const reason: HandoffReason = {
        kind: 'budget',
        ...(options.budget?.seat === undefined ? {} : { seat: options.budget.seat }),
        ...(execution.resetsAt === undefined ? {} : { resetAt: execution.resetsAt }),
      }
      const out = await handOffFrom(tracker, candidate, role, identity, claim.claimedAt, reason, execution)
      return {
        outcome: 'handed-off', candidate, reason: execution.reason, execution,
        costUsd: execution.costUsd, spoke: out.posted, handoff: 'budget', cures: execution.cures ?? [],
      }
    }

    case 'failed':
    case 'nothing-to-do': {
      // "Nothing to do" still owes an explanation. The Igor claimed the item, so releasing it
      // unchanged and unremarked leaves it looking handled when nobody has handled it. It is
      // not a failure in the sense of something breaking, so it should not read as one.
      // The worker's own account of why it declined is the most useful sentence available,
      // and it is otherwise only in the transcript, which nobody reading the item will open.
      //
      // Whatever the run earned, in full: a worker that could not start for an unset seat
      // token and one the allowlist stopped both hand back here, and a run can carry more
      // than one key. Taking any single one of them parks the item behind the others.
      const cures = execution.cures ?? []
      const reason: HandoffReason =
        execution.outcome === 'nothing-to-do'
          ? { kind: 'nothing-to-do', detail: declineReason(execution.transcript) }
          : { kind: 'failure', detail: execution.reason, ...(cures.length === 0 ? {} : { cures }) }
      const out = await handOffFrom(tracker, candidate, role, identity, claim.claimedAt, reason, execution)
      return {
        outcome: 'handed-off', candidate, reason: execution.reason, execution,
        costUsd: execution.costUsd, spoke: out.posted, handoff: reason.kind, cures,
      }
    }
  }
}

export interface CycleDeps extends ItemDeps {
  /** Repository holding the state branch — the lore destination, not the worked repository. */
  destination: string
}

export interface CycleCandidate {
  candidate: Candidate
  reason: string
}

export interface CycleReport {
  role: string
  returned: number
  fresh: number
  skippedUniversal: number
  skippedLane: number
  /** Handed back earlier and nothing has answered, so not reconsidered. */
  skippedDeferred: number
  /** Carrying a stop the cooldown has not run out on. */
  skippedStopped: number
  /** Dropped unasked because the tracker stopped answering, which is not a stop. */
  skippedUnreadable: number
  triaged: number
  /**
   * Everything dropped before a model call, with the reason, so a lane can be tuned. `held`
   * marks the ones only the clock will bring back, which the watermark has to wait for.
   */
  skipped: { candidate: Candidate; reason: string; stage: string; held?: boolean }[]
  /** Model verdicts, both ways — a skip with a reason is as useful as a claim. */
  verdicts: { candidate: Candidate; outcome: 'proceed' | 'skip'; reason: string }[]
  toClaim: CycleCandidate[]
  triageCostUsd: number
  /** Triage calls whose envelope stated no usable cost, making the figure above a floor. */
  triageCostUnreported: number
  /** The seat the cost above was drawn from. Undefined where budget is unenforced or exhausted. */
  triageSeat?: string
  failures: string[]
  coldStart: boolean
}

export interface CycleOptions extends RunOptions {
  /** Cap on model calls per cycle, so one loose lane cannot spend a day's budget. */
  limit?: number
  /** Look back this far instead of reading the stored watermark. */
  sinceDays?: number
  triageModel?: string
  now?: number
  /** Injected in tests so a cycle can be exercised without a model call. */
  triage?: typeof triageBatch
  /**
   * The seat a worker would draw from, read lazily: a cycle with nothing to triage never pays
   * for a seat's usage reading. `serve` passes its own per-item gate here unchanged, so triage
   * spends and is recorded against the same seat a worker would have chosen.
   */
  gate?: () => Promise<Gate>
  /**
   * Who the Igor is on the tracker. Absent means every holder reads as somebody else, which
   * is what a preview that does not know who would run should assume.
   */
  identity?: string
  /**
   * Show what a cycle would decide and persist none of it — no watermark, no cycle record.
   * A preview that moved the mark would leave every candidate it triaged marked seen, and no
   * later cycle would rediscover them.
   */
  preview?: boolean
}

/**
 * Discovery, triage, and the decision — everything up to but not including a claim.
 *
 * Separated from acting so a supervised run can show what it would do and stop. A cycle that
 * acts advances the watermark over what it skipped as well as what it claimed, because deciding
 * not to act on an item is still having considered it, and reconsidering it every cycle would
 * cost the model call again for the same answer. A `preview` cycle decided nothing, so it
 * writes nothing.
 */
export async function planCycle(
  deps: CycleDeps,
  role: Role,
  options: CycleOptions = {},
): Promise<CycleReport> {
  const now = options.now ?? Date.now()
  const report: CycleReport = {
    role: role.name,
    returned: 0,
    fresh: 0,
    skippedUniversal: 0,
    skippedLane: 0,
    skippedDeferred: 0,
    skippedStopped: 0,
    skippedUnreadable: 0,
    triaged: 0,
    skipped: [],
    verdicts: [],
    toClaim: [],
    triageCostUsd: 0,
    triageCostUnreported: 0,
    failures: [],
    coldStart: false,
  }

  const stored = options.sinceDays === undefined ? await loadDiscoveryState(deps.destination) : EMPTY_STATE
  const { results, failures } = await discover({ [deps.tracker.name]: deps.tracker }, role.sources, stored, now)

  for (const failure of failures) {
    report.failures.push(`${failure.source.repo}: ${failure.error.message}`)
  }

  const survivors: Candidate[] = []
  for (const result of results) {
    const fresh =
      options.sinceDays === undefined
        ? result.fresh
        : freshCandidates(result.candidates, undefined, now, options.sinceDays)

    const screened = screen(role.lane, fresh, options.identity)
    const counts = countStages(screened)
    report.returned += result.returned
    report.fresh += fresh.length
    report.skippedUniversal += counts.universal
    report.skippedLane += counts.predicate
    report.coldStart ||= result.coldStart
    for (const t of screened) {
      if (t.verdict.outcome === 'skip') {
        report.skipped.push({ candidate: t.candidate, reason: t.verdict.reason, stage: t.verdict.stage })
      } else {
        survivors.push(t.candidate)
      }
    }
  }

  const limit = options.limit ?? 10
  const quiet = await loadDeferrals(deps.destination)
  const window = stopWindow(now, role.cooldownMinutes)
  // Both gates read an item through one fetch, reaching back as far as either of them asks
  // about for that item. Where they disagree about an item the tracker will not answer for —
  // the stop gate ends the cycle, the deferral gate works the item — the stop gate wins,
  // because it reads first and an item it could not read never reaches the other. What that
  // costs is a cycle of latency on a read that would have failed only the second time.
  const comments = oneFetchPerItem(deps.tracker, (c) => {
    const entry = quiet.items[c.id]
    // A record whose fingerprint no longer matches is void, and a void record is not a window.
    return entry !== undefined && entry.fingerprint === fingerprint(c) ? earliest(entry.at, window) : window
  })
  // Both filters run before the limit is applied, so an item nobody has answered and an item
  // somebody stopped do not consume triage slots — and both are told the limit, so they stop
  // looking once the cycle has enough work. The stop gate goes first because its answer is the
  // one a person is owed: an item that is both stopped and unanswered reports the stop.
  const awake = await dropStopped(
    comments, survivors, role.cooldownMinutes, options.identity ?? '', report, now, limit,
  )
  const considered = await dropDeferred(comments, awake, quiet, options.identity ?? '', report, limit)
  if (considered.length > 0) {
    // Resolved only now — a cycle with nothing to triage never reads a seat's usage for it.
    // The same seat a worker would draw from, written out the same way — never whatever login
    // happens to be ambient, and never a superset of what the chosen seat allows.
    const gate = options.budget ?? (options.gate === undefined ? undefined : await options.gate())
    let env: NodeJS.ProcessEnv | undefined
    try {
      env = await workerEnv(gate?.token, process.env, gate?.seat)
    } catch (error) {
      report.failures.push(`triage: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (env !== undefined) {
      const batch = await (options.triage ?? triageBatch)(
        considered,
        systemPrompt(role.name, role.instructions),
        options.triageModel ?? TRIAGE_MODEL,
        env,
      )
      report.triaged = batch.results.length
      report.triageCostUsd = batch.costUsd
      report.triageCostUnreported = batch.costUnreported
      if (gate?.seat !== undefined) report.triageSeat = gate.seat
      for (const { candidate, verdict } of batch.results) {
        report.verdicts.push({ candidate, outcome: verdict.outcome, reason: verdict.reason })
        if (verdict.outcome === 'proceed') report.toClaim.push({ candidate, reason: verdict.reason })
      }
      for (const { candidate, error } of batch.failures) {
        report.failures.push(`${candidate.native}: ${error.message.slice(0, 80)}`)
      }
    }
  }

  if (report.skippedUnreadable > 0) {
    report.failures.push(
      `${deps.tracker.name}: could not read comments, so ${report.skippedUnreadable} item(s) wait for the next cycle`,
    )
  }

  // The cycle's only two writes, and a preview makes neither: somebody looking at the backlog
  // decided nothing, and a mark or a record saying otherwise costs those items the real cycle
  // that would have worked them.
  if (options.preview !== true) {
    // A look-back reaches deliberately behind the mark, so it must not carry the mark over what
    // it finds there. Separately: an item dropped before anything examined it holds the mark
    // back. A cooldown ends with the clock and an outage with the tracker's recovery, so neither
    // touches the item to lift it above a mark that passed it. Every other skip was a decision,
    // and the edit or the reply that reverses one lifts the item by itself.
    if (options.sinceDays === undefined && results.length > 0) {
      const unexamined = new Set(
        report.skipped.filter((s) => s.held === true).map((s) => s.candidate.id),
      )
      await saveDiscoveryState(deps.destination, advance(stored, heldBelow(results, unexamined)))
    }
    // Not worth failing a cycle over, but a write that vanishes silently leaves nobody able to
    // say afterwards what this cycle decided — so it is reported like any other cycle failure.
    await recordDecisions(deps.destination, role, report).catch((error: unknown) => {
      report.failures.push(
        `could not record decisions: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  }
  return report
}

/**
 * The seam the whole cycle reads comments through. A cycle passes one that fetches per item
 * once; a caller with a single question can pass the tracker itself.
 */
export type CommentSource = Pick<Tracker, 'commentsSince'>

/** The older of two moments. An undatable one loses, since it cannot be shown to be older. */
function earliest(a: string, b: string): string {
  const x = Date.parse(a)
  const y = Date.parse(b)
  if (Number.isNaN(x)) return b
  if (Number.isNaN(y)) return a
  return x <= y ? a : b
}

/** Whether what was fetched from `cached` can answer a request reaching back to `since`. */
function covers(cached: string, since: string): boolean {
  if (cached === since) return true
  const from = Date.parse(cached)
  const asked = Date.parse(since)
  return !Number.isNaN(from) && !Number.isNaN(asked) && from <= asked
}

/**
 * Trims a wider payload to the window a consumer asked for.
 *
 * An undatable comment stays in: a stop nobody can date holds its item, so dropping it here
 * would lift a stop by arithmetic.
 */
function notBefore(comments: readonly Comment[], since: string): Comment[] {
  const floor = Date.parse(since)
  if (Number.isNaN(floor)) return [...comments]
  return comments.filter((c) => {
    const at = Date.parse(c.at)
    return Number.isNaN(at) || at >= floor
  })
}

/**
 * One comment fetch per item, shared by every gate that asks about it.
 *
 * `lookback` gives the earliest moment any of them will ask about for *that* item: the stop
 * window, or its deferral when that is older. Per item and not one width for the cycle — a
 * deferral reaches back thirty days where a stop window is an hour, and `commentsSince` is
 * paginated, so the widest window any one item needs is several requests on every other item.
 *
 * Each consumer gets its own window back out of the shared payload, so a comment older than
 * what it asked about cannot answer its question. A request reaching back further than what
 * was fetched is fetched again rather than served short: handing back a truncated list is how
 * a deferral outlives the reply that lifted it.
 *
 * A failed read is kept as the failure, so a second consumer sees the same error rather than
 * retrying against a tracker that is most likely rate-limiting.
 */
export function oneFetchPerItem(tracker: CommentSource, lookback: (c: Candidate) => string): CommentSource {
  const held = new Map<string, { since: string; payload: Promise<Comment[]> }>()
  return {
    commentsSince: async (candidate, since) => {
      const have = held.get(candidate.id)
      if (have !== undefined && covers(have.since, since)) return notBefore(await have.payload, since)
      const from = earliest(lookback(candidate), since)
      const payload = tracker.commentsSince(candidate, from)
      held.set(candidate.id, { since: from, payload })
      return notBefore(await payload, since)
    },
  }
}

/**
 * Drops survivors handed back earlier that nothing has answered since.
 *
 * Comments are read only for items that already have a record and still match their
 * fingerprint, and not at all once the cycle has the `wanted` items it can act on, since
 * everything past that is dropped by the caller regardless. In a cycle the answer is already
 * in hand, because the read the stop gate took reaches back to this item's deferral.
 *
 * A source that will not answer means the item is reconsidered: the record is a cache, and
 * failing toward the work is the right direction for one.
 */
export async function dropDeferred(
  tracker: CommentSource,
  survivors: readonly Candidate[],
  deferrals: DeferralState,
  identity: string,
  report: Pick<CycleReport, 'skipped' | 'skippedDeferred'>,
  wanted = Infinity,
): Promise<Candidate[]> {
  const kept: Candidate[] = []
  for (const candidate of survivors) {
    if (kept.length >= wanted) break
    const entry = deferrals.items[candidate.id]
    if (entry === undefined || entry.fingerprint !== fingerprint(candidate)) {
      kept.push(candidate)
      continue
    }
    let spoken
    try {
      spoken = await tracker.commentsSince(candidate, entry.at)
    } catch {
      kept.push(candidate)
      continue
    }
    if (stillDeferred(entry, candidate, spoken, identity)) {
      report.skipped.push({ candidate, reason: `handed back, unanswered: ${entry.reason}`, stage: 'deferred' })
      report.skippedDeferred += 1
    } else {
      kept.push(candidate)
    }
  }
  return kept
}

/** How far back a stop is worth looking for: a stop older than the cooldown lifts by itself. */
function stopWindow(now: number, cooldownMinutes: number): string {
  return new Date(now - cooldownMinutes * 60000).toISOString()
}

/** Unparseable sorts oldest, which holds a stop rather than lifting it. */
function instant(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? -Infinity : t
}

/** The most recent stop, because the cooldown runs from the last one anybody issued. */
function latestStop(spoken: readonly Comment[], identity: string): Comment | undefined {
  let latest: Comment | undefined
  for (const comment of spoken) {
    if (!isStop(comment.body, identity)) continue
    if (latest === undefined || instant(comment.at) >= instant(latest.at)) latest = comment
  }
  return latest
}

/**
 * Drops survivors somebody stopped, until the tracker says they may come back.
 *
 * Without this the stop lasts one cycle. A stop moves the item's `updatedAt`, the lane still
 * admits it and triage gives the same verdict on the same text, so the Igor re-claims what it
 * was just told to put down — and the claim message promises anyone reading it that a stop
 * works immediately.
 *
 * The stop is read off the item every cycle rather than remembered, so nothing an Igor can
 * lose sits between a person writing **stop** and the Igor honouring it. One comment read per
 * item examined, over the cooldown window alone — a stop older than that lets the item back
 * regardless — and the `wanted` break ends the scan once the cycle has as much work as it can
 * triage.
 *
 * `eligibleAfterStop` holds the rule for what may follow a stop; this supplies the stop and
 * what was said after it. A tracker that will not answer cannot tell "no stop" from "cannot
 * say", so the item waits a cycle, and so does everything behind it. That is the opposite of
 * how `dropDeferred` fails, and deliberately: one cycle of latency costs less than claiming
 * something a person put down.
 */
export async function dropStopped(
  tracker: CommentSource,
  survivors: readonly Candidate[],
  cooldownMinutes: number,
  identity: string,
  report: Pick<CycleReport, 'skipped' | 'skippedStopped' | 'skippedUnreadable'>,
  now: number,
  wanted = Infinity,
): Promise<Candidate[]> {
  const window = stopWindow(now, cooldownMinutes)
  const kept: Candidate[] = []
  for (let i = 0; i < survivors.length; i += 1) {
    const candidate = survivors[i]!
    if (kept.length >= wanted) break
    let spoken: Comment[]
    try {
      spoken = await tracker.commentsSince(candidate, window)
    } catch {
      // The rest of the cycle goes down with this item, unasked. A tracker that will not
      // answer cannot be claimed on either, so a request apiece would buy nothing — and the
      // likeliest reason it stopped answering is a rate limit these requests are feeding.
      for (const rest of survivors.slice(i)) {
        report.skipped.push({
          candidate: rest, reason: 'the tracker stopped answering', stage: 'unreadable', held: true,
        })
        report.skippedUnreadable += 1
      }
      return kept
    }
    const stop = latestStop(spoken, identity)
    if (stop === undefined) {
      kept.push(candidate)
      continue
    }
    const verdict = await eligibleAfterStop({
      candidate,
      stoppedAt: stop.at,
      cooldownMinutes,
      identity,
      now,
      since: async () =>
        spoken.filter(
          (c) =>
            // Only what followed the stop. The window is wider than the stop, so an earlier
            // go-ahead is in hand here and would otherwise lift a stop issued after it.
            instant(c.at) >= instant(stop.at) &&
            // Nothing the Igor says to itself is permission to resume, and a stop is the
            // wrong place to rely on its own receipt never matching a go-ahead.
            c.author !== identity &&
            // One comment can match both: "stop @igor — continue once I've looked" is a stop
            // by `^stop` and a go-ahead by what follows the address. A stop outranks, here as
            // in `verdictFrom`, so it can never be the permission to undo itself.
            !isStop(c.body, identity),
        ),
    })
    if (verdict.eligible) {
      kept.push(candidate)
    } else {
      // A stop nobody can date has no cooldown to run out, so only a go-ahead lifts it — and
      // that comment moves the item above the mark by itself. The mark waits on the clock.
      report.skipped.push({
        candidate,
        reason: `stopped: ${verdict.reason}`,
        stage: 'stopped',
        held: Number.isFinite(instant(stop.at)),
      })
      report.skippedStopped += 1
    }
  }
  return kept
}

export const DECISIONS_PATH = 'decisions.ndjson'

/**
 * Writes what triage decided, skips included.
 *
 * A skip is the more useful record of the two. Whether a lane is doing its job, and whether
 * the model is earning what it costs, are questions about what was *rejected* — and printing
 * that to a terminal nobody kept means the ratio can only ever be estimated afterwards.
 *
 * One line per cycle rather than one per candidate: the interesting quantity is the shape of
 * the funnel, and a line per candidate would bury it in a repository people read with `git`.
 */
export async function recordDecisions(
  destination: string,
  role: Role,
  report: CycleReport,
  write: typeof appendRecord = appendRecord,
): Promise<void> {
  if (report.fresh === 0 && report.failures.length === 0) return
  await write(
    destination,
    DECISIONS_PATH,
    {
      role: role.name,
      returned: report.returned,
      fresh: report.fresh,
      coldStart: report.coldStart,
      skippedUniversal: report.skippedUniversal,
      skippedLane: report.skippedLane,
      skippedDeferred: report.skippedDeferred,
      skippedStopped: report.skippedStopped,
      skippedUnreadable: report.skippedUnreadable,
      triaged: report.triaged,
      claimed: report.toClaim.length,
      triageCostUsd: Number(report.triageCostUsd.toFixed(4)),
      ...(report.triageCostUnreported > 0 ? { triageCostUnreported: report.triageCostUnreported } : {}),
      ...(report.triageSeat === undefined ? {} : { seat: report.triageSeat }),
      decisions: [
        ...report.skipped.map((s) => ({ item: s.candidate.id, stage: s.stage, outcome: 'skip', reason: s.reason })),
        ...report.verdicts.map((v) => ({ item: v.candidate.id, stage: 'model', outcome: v.outcome, reason: v.reason })),
      ],
      ...(report.failures.length > 0 ? { failures: report.failures } : {}),
    },
    `Triage decisions for ${role.name}`,
  )
}
