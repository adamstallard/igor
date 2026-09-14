import type { Candidate, CodeHost, Tracker } from './adapter.js'
import { checkpoint, stopReceipt, takeClaim, type ClaimOptions } from './claiming.js'
import { complete, execute, type ExecuteOptions, type ExecutionResult } from './execute.js'
import { handOffFrom, type HandoffReason } from './handoff.js'
import type { Role } from './role.js'
import type { TreeProvider } from './worktree.js'
import { appendRecord } from './state.js'
import {
  advance, discover, EMPTY_STATE, freshCandidates, loadDiscoveryState, saveDiscoveryState,
} from './discovery.js'
import { countStages, screen } from './predicate.js'
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
  costUsd: number
  /** Whether a message was left on the item. False here is a bug, not a state. */
  spoke: boolean
  /** Why it was handed back, where it was — a budget handoff says nothing about the item. */
  handoff?: HandoffReason['kind']
}

export type Step = 'claiming' | 'settling' | 'working' | 'publishing' | 'completing'

export interface RunOptions extends ExecuteOptions {
  claim?: ClaimOptions
  /** Called as each stage begins. A worker can run for minutes; silence is not a status. */
  onStep?: (step: Step) => void
  /** Supplied by the budget layer once it exists; absent means budget is not being enforced. */
  budget?: { exhausted: () => boolean; seat?: string; resetAt?: string }
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
      return { outcome: 'stopped', candidate, reason: claim.reason, costUsd: 0, spoke: true }
    }
    return {
      outcome: claim.outcome === 'lost' ? 'lost' : 'refused',
      candidate,
      reason: claim.reason,
      costUsd: 0,
      spoke: false,
    }
  }

  // Budget is checked after claiming and before spending, so an Igor that cannot afford the
  // work says so on the item rather than claiming and going quiet.
  if (options.budget?.exhausted()) {
    const reason: HandoffReason = {
      kind: 'budget',
      ...(options.budget.seat === undefined ? {} : { seat: options.budget.seat }),
      ...(options.budget.resetAt === undefined ? {} : { resetAt: options.budget.resetAt }),
    }
    const out = await handOffFrom(tracker, candidate, role, identity, claim.claimedAt, reason)
    return {
      outcome: 'handed-off', candidate, reason: 'budget exhausted before starting',
      costUsd: 0, spoke: out.posted, handoff: 'budget',
    }
  }

  step('working')
  const execution = await execute(trees, tracker, codeHost, candidate, role, {
    ...options,
    ...(options.lore === undefined ? {} : { lore: options.lore }),
    onPublish: () => step('publishing'),
    stillHeld: async () => (await checkpoint(tracker, claim, identity)).status === 'held',
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
        return { outcome: 'stopped', candidate, reason: execution.reason, execution, costUsd: execution.costUsd, spoke: true }
      }
      if (verdict.status === 'lost') {
        // Silent on purpose: whoever took it is visibly on it, and a message would only tell
        // them what they just did.
        return { outcome: 'lost', candidate, reason: execution.reason, execution, costUsd: execution.costUsd, spoke: false }
      }
      // Still held, so the refusal was the action space rather than the claim: that is a
      // dead end the Igor cannot get past, which is what a handoff is for.
      const out = await handOffFrom(
        tracker, candidate, role, identity, claim.claimedAt,
        { kind: 'failure', detail: execution.reason }, execution,
      )
      return {
        outcome: 'handed-off', candidate, reason: execution.reason, execution,
        costUsd: execution.costUsd, spoke: out.posted, handoff: 'failure',
      }
    }

    case 'failed':
    case 'nothing-to-do': {
      // "Nothing to do" still owes an explanation. The Igor claimed the item, so releasing it
      // unchanged and unremarked leaves it looking handled when nobody has handled it. It is
      // not a failure in the sense of something breaking, so it should not read as one.
      // The worker's own account of why it declined is the most useful sentence available,
      // and it is otherwise only in the transcript, which nobody reading the item will open.
      const reason: HandoffReason =
        execution.outcome === 'nothing-to-do'
          ? { kind: 'nothing-to-do', detail: declineReason(execution.transcript) }
          : { kind: 'failure', detail: execution.reason }
      const out = await handOffFrom(tracker, candidate, role, identity, claim.claimedAt, reason, execution)
      return {
        outcome: 'handed-off', candidate, reason: execution.reason, execution,
        costUsd: execution.costUsd, spoke: out.posted, handoff: reason.kind,
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
  triaged: number
  /** Everything dropped before a model call, with the reason, so a lane can be tuned. */
  skipped: { candidate: Candidate; reason: string; stage: string }[]
  /** Model verdicts, both ways — a skip with a reason is as useful as a claim. */
  verdicts: { candidate: Candidate; outcome: 'proceed' | 'skip'; reason: string }[]
  toClaim: CycleCandidate[]
  triageCostUsd: number
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
   * Who the Igor is on the tracker. Absent means every holder reads as somebody else, which
   * is what a preview that does not know who would run should assume.
   */
  identity?: string
}

/**
 * Discovery, triage, and the decision — everything up to but not including a claim.
 *
 * Separated from acting so a supervised run can show what it would do and stop. The watermark
 * advances here regardless, because deciding not to act on an item is still having considered
 * it, and reconsidering it every cycle would cost the model call again for the same answer.
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
    triaged: 0,
    skipped: [],
    verdicts: [],
    toClaim: [],
    triageCostUsd: 0,
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
  const deferrals = await loadDeferrals(deps.destination)
  // Filtered before the limit is applied, so an item nobody has answered does not consume a
  // triage slot — and told the limit, so it stops looking once the cycle has enough work.
  const considered = await dropDeferred(deps.tracker, survivors, deferrals, options.identity ?? '', report, limit)
  if (considered.length > 0) {
    const batch = await (options.triage ?? triageBatch)(
      considered,
      systemPrompt(role.name, role.instructions),
      options.triageModel ?? TRIAGE_MODEL,
    )
    report.triaged = batch.results.length
    report.triageCostUsd = batch.costUsd
    for (const { candidate, verdict } of batch.results) {
      report.verdicts.push({ candidate, outcome: verdict.outcome, reason: verdict.reason })
      if (verdict.outcome === 'proceed') report.toClaim.push({ candidate, reason: verdict.reason })
    }
    for (const { candidate, error } of batch.failures) {
      report.failures.push(`${candidate.native}: ${error.message.slice(0, 80)}`)
    }
  }

  if (options.sinceDays === undefined && results.length > 0) {
    await saveDiscoveryState(deps.destination, advance(stored, results))
  }
  await recordDecisions(deps.destination, role, report).catch(() => undefined)
  return report
}

/**
 * Drops survivors handed back earlier that nothing has answered since.
 *
 * The tracker is asked only about items that already have a record and still match their
 * fingerprint, so the extra request is paid for the few items in that state rather than per
 * candidate — and not at all once the cycle has the `wanted` items it can act on, since
 * everything past that is dropped by the caller regardless.
 *
 * A tracker that will not answer means the item is reconsidered: the record is a cache, and
 * failing toward the work is the right direction for one.
 */
export async function dropDeferred(
  tracker: Tracker,
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
      triaged: report.triaged,
      claimed: report.toClaim.length,
      triageCostUsd: Number(report.triageCostUsd.toFixed(4)),
      decisions: [
        ...report.skipped.map((s) => ({ item: s.candidate.id, stage: s.stage, outcome: 'skip', reason: s.reason })),
        ...report.verdicts.map((v) => ({ item: v.candidate.id, stage: 'model', outcome: v.outcome, reason: v.reason })),
      ],
      ...(report.failures.length > 0 ? { failures: report.failures } : {}),
    },
    `Triage decisions for ${role.name}`,
  )
}
