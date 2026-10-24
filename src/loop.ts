import type { Artifact, Candidate, ClaimVerdict, CodeHost, Comment, ReleaseHow, Tracker } from './adapter.js'
import type { Gate, SeatVerdict } from './budget.js'
import { cureFor, describeCondition, type Condition } from './conditions.js'
import {
  checkpoint, CLAIM_MARKER, eligibleAfterStop, inFlightNotice, RECEIPT_MARKER, standDown, stillHeld, stopReceipt, STOPPED_MARKER, takeClaim,
  waitingMarker, waitingNotice,
  type ClaimOptions, type ClaimResult,
} from './claiming.js'
import {
  complete, denialsFrom, execute, headlessClaude, workerEnv, type ExecuteOptions, type ExecutionResult, type WorkerOutput,
} from './execute.js'
import { handOffFrom, type HandoffReason } from './handoff.js'
import type { Role } from './role.js'
import type { ChangedFile, TreeProvider } from './worktree.js'
import { appendRecord } from './state.js'
import {
  advance, discover, EMPTY_STATE, freshCandidates, heldBelow, loadDiscoveryState, saveDiscoveryState,
} from './discovery.js'
import { countStages, screen, staleOwnArtifact, universalSkip, type Holding } from './predicate.js'
import { isStop } from './signals.js'
import { fingerprint, loadDeferrals, stillDeferred, type DeferralState } from './deferred.js'
import { systemPrompt, triageBatch, TRIAGE_MODEL } from './triage.js'

/**
 * How `runItem`, below, works one claimed item from start to finish.
 *
 * The rule this exists to enforce: **an Igor never goes silent on something it claimed.** The
 * claim told other people to stand off, so every exit from a claimed run does one of three
 * things: it produces an artifact, posts a handoff (a comment saying what was done and what is
 * left, followed by the release), or posts a receipt (the one-line answer to a stop). None
 * releases quietly.
 *
 * A failure is never retried in silence. Everyone else stands off a claimed item, so a quiet
 * retry loop would leave it with nothing happening and nothing said. Where a retry is cheap, the
 * run is reported as refused and the item is tried again next cycle, with a handoff saying so.
 * Where it is not, the item is handed off and waits until someone other than the Igor replies on
 * it or edits it.
 */

/**
 * The explanation, for the handoff, from the report of a worker that found nothing to do. The
 * report opens with a heading or a bare statement and then elaborates, so the first paragraph of
 * more than 40 characters is taken as the answer; the rest is detail the transcript keeps.
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
 * The note for an item this Igor lost to someone else while working it, pointing them at the
 * draft it left behind. The note tells them the draft has no review requested: an Igor that lost
 * an item should not then appear in someone's review queue over it.
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
  /** The Igor's own pull request brought up to date with its base by the code host alone: no
   *  claim, no worker, no model call, and nothing posted on the item. */
  | 'caught-up'
  | 'handed-off'
  | 'stopped'
  | 'lost'
  | 'refused'

export interface ItemRun {
  outcome: ItemOutcome
  candidate: Candidate
  reason: string
  execution?: ExecutionResult
  /** What the worker reported spending. Undefined where it reported nothing, as a run killed
   *  before its last event does; zero would read as a run that was free. */
  costUsd: number | undefined
  /**
   * Whether a message was left on the item. False is a bug on any outcome that took a claim,
   * because the claim told other people to stand off. A clean catch-up takes none and says
   * nothing on purpose, so there it is a state.
   */
  spoke: boolean
  /** The kind of handoff posted, where there was one. A `budget` handoff says nothing about the
   *  item, so the item is not deferred over it: not kept out of later cycles until someone
   *  replies, as a handed-off item otherwise is. */
  handoff?: HandoffReason['kind']
  /**
   * Every cure key the run met, in the order it met them. A cure key names a setting of the
   * Igor's own that the run proved wrong, such as `role:<name>:commands`. A handoff carrying any
   * is taken as the Igor's doing rather than the item's, so the item is not deferred over it.
   * Keep all of them: a run can be refused an action and denied a command at once, and each is a
   * separate thing to fix.
   */
  cures: string[]
  /**
   * Set where the tracker or code host may have failed rather than the item: on every throw out
   * of a claim or a claimed run, which cannot tell the two apart. `serve` ends the cycle on the
   * second such run in a row. Without that, a tracker outage would make it claim, refuse and
   * post on every remaining item, the claim comment and a handoff on each, every poll, for as
   * long as the outage lasted. An outage is often the tracker's rate limit, and that volume of
   * comments would keep tripping it.
   */
  surfaceFailed?: true
  /** Set on a `refused` run whose claim got no answer from the tracker, such as a 5xx or a rate
   *  limit, so a later cycle may succeed; see `ClaimResult.unanswered`. */
  unanswered?: true
}

/**
 * Whether the discovery watermark may move past the item this run was for.
 *
 * The watermark is one timestamp per source, and discovery reconsiders only items updated after
 * it. It may move past this item unless the run was refused with nothing posted and the tracker
 * gave no answer (`unanswered`). Any other run either moved the item's `updatedAt`, so the next
 * cycle sees it anyway, or met a refusal the tracker answered, with a 4xx or by not recording the
 * claim. Every retry of that would meet the same refusal until the item or a permission changed,
 * and holding the mark below the item would triage every item updated after it again each cycle.
 *
 * A run `stoppedBy` refuses for a condition would pass too, so neither caller hands `runItem` a
 * gate carrying a condition: `serve` stops on `gate.exhausted()` and `igor run` on
 * `gate.condition` first, and the items left keep the mark below them as untaken.
 */
export const passesMark = (run: Pick<ItemRun, 'outcome' | 'spoke' | 'unanswered'>): boolean =>
  run.outcome !== 'refused' || run.spoke || run.unanswered !== true

export type Step = 'claiming' | 'settling' | 'working' | 'publishing' | 'completing'

export interface RunOptions extends ExecuteOptions {
  claim?: ClaimOptions
  /** Called as each stage begins, so the caller can show progress: a worker can run for minutes. */
  onStep?: (step: Step) => void
  /** What the budget gate decided for this run: the seat, its token, and whether the budget is
   *  spent. Absent, no budget is enforced. */
  budget?: {
    exhausted: () => boolean
    seat?: string
    token?: { tokenEnv?: string; tokenFile?: string; tokenCommand?: string }
    resetAt?: string
    resetApproximate?: boolean
    blocked?: SeatVerdict
    passedOver?: readonly { seat: string; verdict: SeatVerdict }[]
    /** Set where a condition stops this role: runs kept meeting the same cure key until they
     *  reached the threshold. `runItem` then refuses the item before any claim or host request. */
    condition?: Condition
  }
}

/**
 * Refuses the item before any claim or host request where a condition stops the role. Each
 * caller checks first as well, but this check must stay: `exhausted()` is true under a
 * condition, so a run that got as far as claiming would hand the item back with a handoff
 * blaming the budget, on an item that had nothing to do with it.
 */
function stoppedBy(candidate: Candidate, budget: RunOptions['budget']): ItemRun | undefined {
  if (budget?.condition === undefined) return undefined
  return {
    outcome: 'refused', candidate, reason: `stopped: ${describeCondition(budget.condition)}`,
    costUsd: 0, spoke: false, cures: [],
  }
}

export async function runItem(
  deps: ItemDeps,
  candidate: Candidate,
  role: Role,
  identity: string,
  options: RunOptions = {},
): Promise<ItemRun> {
  const { tracker } = deps
  const stopped = stoppedBy(candidate, options.budget)
  if (stopped !== undefined) return stopped

  const step = options.onStep ?? (() => {})
  step('claiming')
  const claim = await takeClaim(tracker, candidate, role, identity, {
    ...(options.claim ?? {}),
    ...(options.catchUp === undefined ? {} : { catchUp: true }),
    onSettle: () => step('settling'),
  })
  if (claim.outcome !== 'held') {
    // Nothing was claimed, someone else holds it, or the claim could not be finished. None owes
    // a handoff: on a lost claim somebody else is now visibly on it, and a stop gets a receipt
    // instead, because whoever issued it is presumably taking the work and composing a handoff
    // would only delay the release.
    //
    // **A refused claim is not necessarily a silent one.** `takeClaim` refuses where its claim
    // window threw. That path has already released the claim and, where the claim message may
    // have landed, withdrawn it on the item, so `spoke` carries what it said rather than false.
    //
    // The one reader of `spoke`, the run summary in `src/cli.ts`, skips `refused` and `lost`
    // runs, because both have released the claim. So any new `refused` path must release the
    // claim itself: one that ended still holding it would be silent, and nothing would report it.
    if (claim.outcome === 'stopped' && claim.verdict) {
      await tracker.report(candidate, stopReceipt(role, claim.verdict)).catch(() => undefined)
      // After the receipt, never before it. The receipt is what claims the release, and a
      // clause correcting it that stands above it answers nothing.
      if (claim.releaseStuck === true) {
        await tracker.report(candidate, stillHeld(role)).catch(() => undefined)
      }
      return { outcome: 'stopped', candidate, reason: claim.reason, costUsd: 0, spoke: true, cures: [] }
    }
    return {
      outcome: claim.outcome === 'lost' ? 'lost' : 'refused',
      candidate,
      reason: claim.reason,
      costUsd: 0,
      spoke: claim.spoke ?? false,
      cures: [],
      ...(claim.surfaceFailed === true ? { surfaceFailed: true as const } : {}),
      ...(claim.unanswered === true ? { unanswered: true as const } : {}),
    }
  }

  // **Everything from here runs with the claim held**, so this handler guards all of it.
  // Without it, a throw from provisioning a tree, from a checkpoint or from the release that ends
  // a finished run would leave the item claimed and announced, with only a cycle-level error
  // logged.
  //
  // The handler gives the claim back by a handoff, which posts and then releases, as any other
  // failure does. Whether the run is then reported as refused or handed off depends on what a
  // retry would cost: see the handler.
  //
  // **`reached` records how far the run got, for the handler to read.** A throw here does not
  // always come before the work. The last call of a successful run is the release of its claim, and
  // a tracker that fails it lands here with the pull request already open. A handoff composed
  // without `reached` would say "the work never started" beside that pull request, and link it
  // nowhere.
  //
  // **`reached` says how far the run got, never whose fault the throw was.** `codeHost.produce`
  // runs inside `execute`, so an item's own `422` leaves `reached.result` empty, while a tracker
  // 503 on that final release finds it full. Taking an empty `reached.result` as the surface's
  // fault and a full one as the item's would get both of those cases backwards.
  const reached: Reached = {}
  try {
    return await runClaimedItem(deps, candidate, role, identity, claim, options, reached)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    const ran = reached.result ?? standIn(reached, role, detail)
    // **Every return below spreads `ended`**, so no exit can drop what the run spent. The ledger
    // records a run only where `execution` is present, and an exit that left it off would lose a
    // paid worker from the budget.
    const ended = {
      candidate,
      // The result's own cost, even when it is undefined: a killed worker reports no cost, and
      // a zero would read as a run that was free.
      costUsd: ran === undefined ? 0 : ran.costUsd,
      ...(ran === undefined ? {} : { execution: ran }),
      cures: ran?.cures ?? [],
      surfaceFailed: true as const,
      reason: `${candidate.id} was claimed and the run could not finish: ${detail}`,
    }

    // **A stop or a loss the run already saw gets no failure handoff.** A stop gets its receipt
    // instead, since the graceful-handoff spec exempts a stop from a handoff. A loss gets no
    // message, since the item is now somebody else's, unless a draft is left to point them at.
    // Both key on the verdict the run last read, never on the wording of the error.
    const verdict = reached.verdict
    if (verdict?.status === 'stopped' || verdict?.status === 'lost') {
      const clear = await standDown(tracker, candidate, identity, verdict)
      const artifact = reached.published?.artifact.url
      if (verdict.status === 'stopped') {
        await tracker.report(candidate, stopReceipt(role, verdict, artifact)).catch(() => undefined)
      } else if (artifact !== undefined) {
        await tracker.report(candidate, handOverNote(role, verdict.by, artifact)).catch(() => undefined)
      }
      // If the release did not take, say so in either case. A needless comment costs one
      // comment, but silence leaves the item held by this Igor with nobody told.
      if (!clear) await tracker.report(candidate, stillHeld(role)).catch(() => undefined)
      return {
        ...ended, outcome: verdict.status,
        spoke: verdict.status === 'stopped' || artifact !== undefined || !clear,
      }
    }

    // **What a retry would cost decides what happens next, not whose fault the throw was**,
    // which nothing here can tell. A retry is *dear* where it would pay for the whole worker
    // again to reach the same failure: the worker ran and nothing was published. Then the item is
    // handed off, and the deferral record keeps it out of later cycles until someone other than
    // the Igor replies to it or the item is edited.
    //
    // Otherwise the item is refused and tried again next cycle. A retry is cheap in two cases:
    // - Before the worker ran, nothing has been spent.
    // - Once something is published, the item is not claimed again while its pull request is
    //   open (the in-flight rule), so no worker is paid again. Deferring it then would only stop
    //   a later cycle bringing that pull request up to date with its base (a catch-up).
    //
    // A run whose `execute` returned `refused` reaches this handler only when something after
    // `execute` threw, such as the release, and `retryIsDear` never counts such a run as dear. A
    // stop or a loss is handled by the block above in this handler, and the only other refusal is
    // a role whose `allow` permits no pull request. That refusal carries
    // the cure key `role:<name>:allow`, so the handoff names the setting to change and the item
    // is not deferred.
    //
    // Decided before the handoff is composed, because the handoff says which way it went.
    const spent = reached.output !== undefined
    const published = reached.published !== undefined
    const retryIsDear = spent && !published && ran?.outcome !== 'refused'
    // `next` makes the handoff say how the item comes back: tried next cycle, or kept up to date
    // through what it published. A directed claim, one a person handed to this Igor by label,
    // gets a sentence on how to hand it over again instead, because the release removes that
    // label. `handOffFrom` reads whether the claim was directed from `claim` itself.
    const next = retryIsDear ? {} : { next: published ? ('published' as const) : ('retry' as const) }
    const out = await handOffFrom(
      tracker, candidate, role, identity, claim, { kind: 'failure', detail, ...next }, ran,
    ).catch(() => ({ posted: false }))
    return {
      ...ended,
      outcome: retryIsDear ? 'handed-off' : 'refused',
      spoke: out.posted,
      ...(retryIsDear ? { handoff: 'failure' as const } : {}),
    }
  }
}

/**
 * A result for a run that threw before `execute` returned, built from what it can still be
 * shown to have done: the worker's own report, what it left in the tree, and whatever the host
 * accepted. Undefined where neither the worker nor the host was reached, so the handoff for a
 * run that never started still says so. Its outcome is always `failed`, never `refused`, so the
 * handler weighs the retry by whether the worker ran.
 *
 * Carries the worker's denials, for the run record and the "sandbox denied" warning printed
 * when it is recorded, and **no cures**. A cure cannot clear the failure that brought the run
 * here, and a handoff carrying one is never deferred, so the worker would be paid again every
 * cycle to meet the same failure. Each denial carries its own cure key, and the run's denials
 * count toward those keys' conditions even with no `cures` (`keysOf` in `conditions.ts`).
 */
function standIn(reached: Reached, role: Role, detail: string): ExecutionResult | undefined {
  const { output, published, changed } = reached
  if (output === undefined && published === undefined) return undefined
  const cost = output?.total_cost_usd
  const denials = denialsFrom(output?.permission_denials, role.name)
  return {
    outcome: 'failed',
    changed: changed ?? [],
    refusals: [],
    transcript: typeof output?.result === 'string' ? output.result : '',
    costUsd: typeof cost === 'number' && Number.isFinite(cost) ? cost : undefined,
    ...(typeof output?.session_id === 'string' && output.session_id !== '' ? { session: output.session_id } : {}),
    ...(denials.length === 0 ? {} : { denials }),
    ...(published === undefined ? {} : { artifact: published.artifact, caughtUp: published.caughtUp }),
    // With no worker output, as where the host reported a conflict on a catch-up but the merge in
    // the clone came out clean, no worker ran, so the result is marked `workerless` as `execute`
    // marks such a run: it counts toward a condition it met, and is never evidence that one
    // cleared.
    ...(output === undefined ? { workerless: true as const } : {}),
    reason: detail,
  }
}

/**
 * How far a claimed run got, for the handler that meets a throw from it. Each field is recorded
 * where it happens rather than read off the result afterwards, because a throw from inside
 * `execute` — a publish, the check that a resolution took — escapes with no result at all.
 */
interface Reached {
  result?: ExecutionResult
  /** What the worker returned. Present means the worker was paid for. */
  output?: WorkerOutput
  /** What the worker left in the tree, read before anything was published. */
  changed?: ChangedFile[]
  /** What the code host accepted, a pull request or a resolution onto one. */
  published?: { artifact: Artifact; caughtUp: boolean }
  /** The last claim verdict the run read. */
  verdict?: ClaimVerdict
}


async function runClaimedItem(
  deps: ItemDeps,
  candidate: Candidate,
  role: Role,
  identity: string,
  claim: ClaimResult,
  options: RunOptions,
  /** Filled in as the run passes each point, so the handler still knows how far it got after a
   *  throw. */
  reached: Reached,
): Promise<ItemRun> {
  const { tracker, codeHost, trees } = deps
  const step = options.onStep ?? (() => {})

  // Budget is checked after the claim and before any spending, so an Igor that cannot afford
  // the work hands the item back saying so, rather than holding the claim and going quiet.
  if (options.budget?.exhausted()) {
    const reason: HandoffReason = {
      kind: 'budget',
      ...(options.budget.seat === undefined ? {} : { seat: options.budget.seat }),
      ...(options.budget.resetAt === undefined ? {} : { resetAt: options.budget.resetAt }),
      ...(options.budget.resetApproximate === true ? { resetApproximate: true } : {}),
      // Why no seat in the pool could be used (`blocked`), so the handoff can say so. Without it,
      // every route to "no seat" would read as a spent budget, including the one where no seat's
      // usage could be read at all (#49).
      ...(options.budget.blocked === undefined ? {} : { blocked: options.budget.blocked }),
      ...(options.budget.passedOver === undefined ? {} : { passedOver: options.budget.passedOver }),
    }
    const out = await handOffFrom(tracker, candidate, role, identity, claim, reason)
    return {
      outcome: 'handed-off', candidate, reason: 'budget exhausted before starting',
      costUsd: 0, spoke: out.posted, handoff: 'budget', cures: [],
    }
  }

  step('working')
  // Sets `reached.published` when the host accepts, not when `execute` returns: a throw after a
  // publish, such as from checking that a pushed conflict resolution landed, escapes `execute`
  // with the artifact already on the branch.
  const recording: CodeHost = {
    name: codeHost.name,
    produce: async (request) => {
      const artifact = await codeHost.produce(request)
      reached.published = { artifact, caughtUp: false }
      return artifact
    },
    resolve: async (request) => {
      const sha = await codeHost.resolve(request)
      // Only a catch-up resolves, and the resolution goes onto the pull request it catches up.
      const onto = options.catchUp
      if (onto !== undefined) {
        reached.published = { artifact: { kind: 'pull-request', ref: onto.ref, url: onto.url }, caughtUp: true }
      }
      return sha
    },
    catchUp: (request) => codeHost.catchUp(request),
  }
  const execution = await execute(trees, tracker, recording, candidate, role, {
    ...options,
    ...(options.lore === undefined ? {} : { lore: options.lore }),
    // The worker must authenticate as the seat the gate chose, so that seat's token source is
    // set here explicitly rather than trusted to arrive through the spread above.
    ...(options.budget?.token === undefined ? {} : { seatToken: options.budget.token }),
    // Passed with the token source: where the token cannot be read, the run records the cure key
    // `seat:<id>:token`, which needs the seat's id.
    ...(options.budget?.seat === undefined ? {} : { seat: options.budget.seat }),
    // A pull request links its transcript only where the store reaches `execute`.
    ...(options.store === undefined ? {} : { store: options.store }),
    onPublish: () => step('publishing'),
    onChanges: (changed) => {
      reached.changed = changed
    },
    // Keeps the whole verdict, not just the status `execute` asks for: after a throw, the
    // handler's stop receipt names who stopped the run, and its hand-over note who took the item.
    claimStatus: async () => {
      reached.verdict = await checkpoint(tracker, claim, identity)
      return reached.verdict.status
    },
    // Recorded the moment the worker returns, not when `execute` does: a publish that throws,
    // such as the 422 from a branch a closed pull request left behind, escapes `execute` with
    // the worker already paid and no result to show for it.
    worker: async (input) => {
      const out = await (options.worker ?? headlessClaude)(input)
      reached.output = out
      return out
    },
  })
  reached.result = execution

  switch (execution.outcome) {
    case 'produced': {
      step('completing')
      await complete(tracker, candidate, role, identity)
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
      // `execute` refuses when the claim went away mid-run or when the role's `allow` permits no
      // pull request. The checkpoint tells them apart: a stop gets a receipt, a loss at most a
      // hand-over note, and a claim still held a failure handoff.
      const verdict = await checkpoint(tracker, claim, identity)
      let stoodDown = true
      if (verdict.status === 'stopped' || verdict.status === 'lost') {
        // Released before anything is said, so the receipt's closing "and released this" is true
        // by the time anyone reads it. Posted before the release, it would sit beside the Igor's
        // name on an item it had just announced it released. `takeClaim` does the same for a stop
        // it finds while verifying a fresh claim.
        //
        // The answer is kept, not discarded: where the holder field did not clear, that closing
        // sentence is false on an item somebody is reading, and a correction must follow it.
        stoodDown = await standDown(tracker, candidate, identity, verdict)
      }
      if (verdict.status === 'stopped') {
        const artifact = execution.artifact ? execution.artifact.url : undefined
        await tracker.report(candidate, stopReceipt(role, verdict, artifact)).catch(() => undefined)
        // After the receipt, never before it: a correction posted first corrects nothing and
        // leaves the false clause as the last word.
        if (!stoodDown) await tracker.report(candidate, stillHeld(role)).catch(() => undefined)
        return {
          outcome: 'stopped', candidate, reason: execution.reason, execution,
          costUsd: execution.costUsd, spoke: true, cures: execution.cures ?? [],
        }
      }
      if (verdict.status === 'lost') {
        // A loss with nothing left behind gets no message: whoever took the item is visibly on
        // it, and a message would only tell them what they just did. A draft left behind gets a
        // hand-over note, because unannounced it is work nobody knows exists.
        //
        // A release that did not take always gets a correction: this Igor's name is still on the
        // item beside whoever took it, and nothing else on the item explains the second name.
        const artifact = execution.artifact
        if (artifact !== undefined) {
          await tracker.report(candidate, handOverNote(role, verdict.by, artifact.url)).catch(() => undefined)
        }
        // A correction, never the standalone: a loss does not cut a run short — only a stop
        // does — so reaching here means the run finished and published, and there is always a
        // hand-over note above this to correct. `takeClaim` owns the standalone, for a loss
        // found in the settle window where nothing has been said.
        if (!stoodDown) await tracker.report(candidate, stillHeld(role)).catch(() => undefined)
        return {
          outcome: 'lost', candidate, reason: execution.reason, execution,
          costUsd: execution.costUsd, spoke: artifact !== undefined || !stoodDown, cures: execution.cures ?? [],
        }
      }
      // Still held, so `execute` refused because the role's `allow` permits no pull request,
      // not because of the claim. The Igor cannot get past that, which is what a handoff is for.
      // The refusal carries the cure key `role:<name>:allow`, and the handoff names it along
      // with any other key the run met.
      const cures = execution.cures ?? []
      const out = await handOffFrom(
        tracker, candidate, role, identity, claim,
        { kind: 'failure', detail: execution.reason, ...(cures.length === 0 ? {} : { cures }) }, execution,
      )
      return {
        outcome: 'handed-off', candidate, reason: execution.reason, execution,
        costUsd: execution.costUsd, spoke: out.posted, handoff: 'failure', cures,
      }
    }

    case 'budget': {
      // A budget spent mid-run gets the same handoff as one found spent before starting, of the
      // same kind, `budget`. That kind keeps the item out of the deferral record: nothing about
      // the item caused this, so it comes back when capacity does.
      const reason: HandoffReason = {
        kind: 'budget',
        ...(options.budget?.seat === undefined ? {} : { seat: options.budget.seat }),
        ...(execution.resetsAt === undefined ? {} : { resetAt: execution.resetsAt }),
      }
      const out = await handOffFrom(tracker, candidate, role, identity, claim, reason, execution)
      return {
        outcome: 'handed-off', candidate, reason: execution.reason, execution,
        costUsd: execution.costUsd, spoke: out.posted, handoff: 'budget', cures: execution.cures ?? [],
      }
    }

    case 'failed':
    case 'nothing-to-do': {
      // "Nothing to do" still owes an explanation. The Igor claimed the item, so releasing it
      // unchanged and unremarked would leave it looking handled when nobody had handled it. The
      // handoff has a kind of its own, so it does not read as something breaking, and it quotes
      // the worker's own account of why it declined, which is otherwise only in the transcript
      // that nobody reading the item will open.
      //
      // A failure hands back every cure key the run earned, not one of them. Runs of both kinds
      // arrive here: a worker that could not start because a seat token was unset, and a worker
      // the allowlist stopped. One run can carry more than one key. Handing back only one would
      // get only that setting fixed, and the item would fail again on the next.
      const cures = execution.cures ?? []
      const reason: HandoffReason =
        execution.outcome === 'nothing-to-do'
          ? { kind: 'nothing-to-do', detail: declineReason(execution.transcript) }
          : { kind: 'failure', detail: execution.reason, ...(cures.length === 0 ? {} : { cures }) }
      const out = await handOffFrom(tracker, candidate, role, identity, claim, reason, execution)
      return {
        outcome: 'handed-off', candidate, reason: execution.reason, execution,
        costUsd: execution.costUsd, spoke: out.posted, handoff: reason.kind, cures,
      }
    }
  }
}

/**
 * Brings this Igor's own pull request up to date with its base, where it no longer merges (a
 * catch-up).
 *
 * The code host is asked first to merge the base in. That one request settles the usual case
 * with no clone, no worker and no model call, and says nothing on the item: a merge nobody had to
 * think about is not news. Only a conflict the host reports back escalates, into an ordinary
 * claimed run through `runItem`: the item is claimed, a worker is given files with conflict
 * markers in them, and that run already produces every message the claim protocol owes.
 *
 * The host merge claims nothing. A claim tells other people to stand off work they might
 * otherwise duplicate, and nobody races a merge like this one, so assigning and unassigning on
 * every catch-up would put noise on the item's timeline for nothing.
 */
export async function catchUpItem(
  deps: ItemDeps,
  candidate: Candidate,
  role: Role,
  identity: string,
  options: RunOptions = {},
): Promise<ItemRun> {
  const stopped = stoppedBy(candidate, options.budget)
  if (stopped !== undefined) return stopped
  const artifact = candidate.inFlight
  if (artifact === undefined) {
    return {
      outcome: 'refused', candidate, reason: 'nothing in flight to catch up', costUsd: 0,
      spoke: false, cures: [],
    }
  }

  let caught
  try {
    caught = await deps.codeHost.catchUp({
      repo: candidate.repo,
      branch: artifact.branch,
      base: artifact.base,
    })
  } catch (error) {
    // Nothing was claimed and nobody was told to stand off, so no receipt or handoff is owed.
    // The pull request still does not merge, so the next cycle finds it and asks again; waiting a
    // cycle is also what a rate limit needs.
    return {
      outcome: 'refused',
      candidate,
      reason: `could not ask ${deps.codeHost.name} to catch up ${artifact.ref}: ${
        error instanceof Error ? error.message : String(error)
      }`,
      costUsd: 0,
      spoke: false,
      cures: [],
    }
  }

  if (caught.outcome !== 'conflict') {
    return {
      outcome: 'caught-up',
      candidate,
      reason:
        caught.outcome === 'merged'
          ? `merged ${artifact.base} into ${artifact.ref}`
          : `${artifact.ref} was already current`,
      costUsd: 0,
      spoke: false,
      cures: [],
    }
  }

  // A person may have put this Igor's label on the item to hand it over, and a catch-up does not
  // answer that hand-over. So on every exit the run gives back its claim through `keepingLabel`,
  // which leaves such a label where it is.
  // `floor` is the earliest a stop aimed at this run can have been written: the run's start less
  // the settle interval, because the claim's settle window comes before the run and a stop
  // written during it is aimed at this run.
  const floor = new Date((options.claim?.now ?? Date.now)() - role.settleSeconds * 1000).toISOString()
  const run = await runItem(
    { ...deps, tracker: keepingLabel(deps.tracker, floor) }, candidate, role, identity, { ...options, catchUp: artifact },
  )
  // The claim comment said the Igor picked the item up; nothing else would say what it then
  // did. An ordinary run ends in a pull request that announces itself, and a catch-up ends on
  // a branch that already exists — so without this the item goes quiet mid-sentence.
  //
  // Both branches speak, because by here a claim has been taken and the claim comment is
  // already on the item — silence after it is the very failure this exists to prevent, not
  // the quiet path's exemption, which claims nothing.
  //
  // What they say turns on whether a worker was handed a conflict, not on whether files
  // changed. A merge that came out clean in the clone changes plenty of files and resolved
  // nothing, and saying otherwise claims work nobody did.
  if (run.outcome === 'produced') {
    await deps.tracker
      .report(
        candidate,
        (run.execution?.conflictResolved === true
          ? resolvedNote(role, artifact.ref, artifact.url, artifact.base)
          : broughtCurrentNote(role, artifact.ref, artifact.url, artifact.base)) +
          undoneNote(run.execution?.reverts),
      )
      .catch(() => undefined)
  }
  return run
}

/**
 * The tracker a catch-up's claimed run uses. Its release removes this Igor's label only where
 * this Igor put it there or a person stopped this run. Otherwise it leaves the label, which a
 * person put there to hand the item over, and answers that the claim is given back, which it is.
 *
 * Who set the label is read at the release, never taken from the cycle's candidate. A person can
 * add or remove the label between the cycle reading the item and the release, and the claim
 * itself puts back a label a person removed, which makes that label this Igor's to remove.
 *
 * A stop of this run removes the label even where the run never saw it: one written after the
 * run's last checkpoint, while the resolution is being pushed, is still a stop. A stop counts as
 * this run's when it was created at or after the latest of: the hand-over; `floor`, the run's
 * start less the settle interval; and, where the claim's check found a stop that a go-ahead
 * lifted, that go-ahead. An earlier stop belongs to something else, such as a stop a go-ahead or
 * the cooldown already lifted, and a catch-up that ends any other way keeps the label. Creation
 * time decides, never the read's `since`, which some surfaces apply to when a comment was last
 * edited. A comment with no readable time counts. Where the comments cannot be read, the label
 * stays.
 *
 * Where the tracker names no setter at all, the label is released as the claim's. Where the read of
 * who set the label fails, the cycle's candidate decides. A candidate without the label means the
 * claim put it there, so it is released as any claim is, and a release that does not take is
 * reported. A candidate with the label may be showing a person's hand-over, so the label stays:
 * removing it would be a mistake nothing on the item explains, and reporting it as still there
 * would tell that person to take back what they handed over.
 */
function keepingLabel(tracker: Tracker, floor: string): Tracker {
  // Where the claim's check found a stop that a go-ahead had lifted: that go-ahead's time, from
  // the check's held verdict. Checkpoints also call `verifyClaim`, but only the claim's own check
  // returns `liftedAt`, so only that call sets it.
  let liftedAt: string | undefined
  return Object.assign(Object.create(tracker) as Tracker, {
    verifyClaim: async (...args: Parameters<Tracker['verifyClaim']>): Promise<ClaimVerdict> => {
      const verdict = await tracker.verifyClaim(...args)
      if (verdict.status === 'held' && verdict.liftedAt !== undefined) liftedAt = verdict.liftedAt
      return verdict
    },
    release: async (candidate: Candidate, as: string, how?: ReleaseHow): Promise<boolean> => {
      // A stop removes the label whoever put it there, as any stop removes this Igor from the
      // holder field: the person who stopped it hands it over again by adding the label anew.
      if (how?.stop === true) return tracker.release(candidate, as)
      const set = await tracker.holderSetBy(candidate).then(
        (setting) => setting,
        () => null,
      )
      // Who set the label could not be read. A label the cycle saw stays, even if a stop has
      // since cancelled the hand-over; one the cycle did not see is the claim's, and is released.
      if (set === null) return candidate.holders.includes(tracker.holder) ? true : tracker.release(candidate, as)
      if (set?.self !== false) return tracker.release(candidate, as)
      const from = [set.at, liftedAt].reduce<string>(
        (a, b) => (b !== undefined && Date.parse(b) > Date.parse(a) ? b : a),
        floor,
      )
      const stopped = await tracker.commentsSince(candidate, from).then(
        (spoken) => notBefore(spoken, from).some((c) => isStop(c.body, as, c.accounts)),
        () => false,
      )
      return stopped ? tracker.release(candidate, as) : true
    },
  })
}

/**
 * The clause added to a catch-up's note naming the base changes the resolution undid on
 * purpose, as the worker declared them. Empty where it undid none.
 *
 * A declaration lets an undo be published instead of failing the run, but not unannounced: an
 * undone base change is invisible in the diff either way, so the item is told what was dropped,
 * in the same words the failure would have used.
 */
export const undoneNote = (reverts: readonly string[] = []): string =>
  reverts.length === 0 ? '' : ` It drops what the base did to ${reverts.join(', ')}, as declared.`

/** Short on purpose: the diff is on the artifact, and this is a pointer rather than a report. */
export function resolvedNote(role: Role, ref: string, url: string, base: string): string {
  return `**${role.name}** resolved a merge conflict on [${ref}](${url}) and brought it up to date with \`${base}\`.`
}

/**
 * What to say where no conflict was resolved: the base went in cleanly, or was already there.
 * Still owed a sentence, because the claim comment has gone out by the time this is known.
 */
export function broughtCurrentNote(role: Role, ref: string, url: string, base: string): string {
  return `**${role.name}** brought [${ref}](${url}) up to date with \`${base}\`. There was nothing to resolve.`
}

export interface CycleDeps extends ItemDeps {
  /** Repository holding the state branch — the lore destination, not the worked repository. */
  destination: string
}

export interface CycleCandidate {
  candidate: Candidate
  reason: string
  /** A person put this Igor in the holder field: claim it without the settle interval. */
  directed?: true
  /** For a waiting notice: the holders that keep this Igor off the item. */
  holders?: string[]
  /** For a waiting item: the notice to post on it, once, saying what this Igor waits for. */
  notice?: string
  /** For a handed-over item: when it was handed over. Its claim scans for stops from then. */
  handedOverAt?: string
  /** For a handed-over item stopped while nothing was running: the stop to answer. */
  stop?: ClaimVerdict
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
  /** Left unread because the tracker stopped answering this cycle; not a stop, and they wait. */
  skippedUnreadable: number
  triaged: number
  /**
   * Candidates that reached the model stage and were never asked about: no seat could pay, the
   * chosen seat's credential could not be read, the cycle's cap was reached first, or a condition
   * stopped the role. `reason` says which. Not skips: nothing about the items caused this or will
   * lift it, so the watermark waits for them and they are read again in a later cycle.
   */
  untriaged: CycleCandidate[]
  /**
   * Why no seat could be found, where that is what stopped the model stage. Verdict words, not
   * prose: only `spent` and `share` mean the budget ran out, and a reader sent to look at spend
   * for a pool that could not be used at all looks in the wrong place (#49).
   */
  heldPool?: {
    blocked?: SeatVerdict
    resetAt?: string
    /** The reset hour is an estimate the provider did not state, so it reads "around", not "at". */
    resetApproximate?: boolean
    passedOver?: readonly { seat: string; verdict: SeatVerdict }[]
  }
  /**
   * The condition that stopped this role before triage, where one did. A condition is a failure
   * that kept recurring on one cure key, the setting that would fix it, so the role is stuck on
   * its own configuration. It is a fourth reason for an idle cycle, beside a held pool, pacing and
   * an empty queue.
   */
  condition?: Condition
  /**
   * Saves the discovery watermark, held below the `updatedAt` of each `toClaim` item whose id is
   * in `untaken`: the ones the caller never took. Present only where `markAfterWork` asked for it
   * and the cycle is not a preview. Until it is called the mark stays where the cycle found it, so
   * a cycle that fails first drops no item; it only pays again next cycle for its triage calls.
   */
  settle?: (untaken: readonly string[]) => Promise<void>
  /**
   * Every candidate dropped before a model call, with the reason, so a lane can be tuned. `held`
   * marks the ones only time will bring back, such as a stop's cooldown or a tracker outage; the
   * watermark stays below them.
   */
  skipped: { candidate: Candidate; reason: string; stage: string; held?: boolean }[]
  /** Model verdicts, both ways — a skip with a reason is as useful as a claim. */
  verdicts: { candidate: Candidate; outcome: 'proceed' | 'skip'; reason: string }[]
  toClaim: CycleCandidate[]
  /**
   * Items a person handed to this Igor while another Igor holds them, or while work is in flight
   * on them, owed one notice each (`notice`). Not claimed: removing the holding Igor's label, or
   * the work closing, is what hands the item over.
   */
  waiting: CycleCandidate[]
  /**
   * Handed-over items somebody stopped while no run of this Igor was active on them. Each loses
   * the label and gets a receipt, so a label on an item always means it is handed over.
   */
  stopped: CycleCandidate[]
  /**
   * When the cycle began reading its items. A claim the cycle makes later scans for stops from
   * here, so a stop said while the cycle worked other items is seen; a stop said earlier was the
   * cycle's to read, and its reading decided whether the item came this far.
   */
  readAt: string
  /**
   * This Igor's own pull requests that no longer merge into their base. Kept apart from `toClaim`
   * because deciding on them costs no model call, and acting on them claims nothing unless the
   * host reports a conflict; see `catchUpItem`.
   */
  toCatchUp: CycleCandidate[]
  triageCostUsd: number
  /** Triage calls whose output reported no usable cost, so `triageCostUsd` is a lower bound. */
  triageCostUnreported: number
  /** The seat triage drew on. Undefined where budget is off, no seat had room, or no triage ran. */
  triageSeat?: string
  failures: string[]
  coldStart: boolean
}

export interface CycleOptions extends RunOptions {
  /** Most triage calls per cycle, one per candidate, so a broad lane can't spend a day's budget. */
  limit?: number
  /** Look back this many days instead of from the stored watermark, and save no watermark. */
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
   * This Igor's identity on the tracker. Absent in a preview that does not know which Igor would
   * run: then every holder counts as somebody else, and no handed-over items are looked for.
   */
  identity?: string
  /**
   * Leave the discovery watermark unsaved and hand back `settle` instead, for a caller that works
   * the items it is told to claim and may stop before taking them all.
   */
  markAfterWork?: boolean
  /**
   * The condition that keeps this role from taking any item, asked once before triage. A stopped
   * role spends no model call and claims nothing. The items it would have asked about are left
   * untriaged, so they hold the discovery watermark and are read again next cycle.
   */
  stopped?: () => Promise<Condition | undefined>
  /**
   * Show what a cycle would decide and persist none of it — no watermark, no cycle record.
   * A preview that moved the mark would leave every candidate it triaged marked seen, and no
   * later cycle would rediscover them.
   */
  preview?: boolean
}

/**
 * The reason recorded against each candidate whose triage call no seat could pay for. Exported
 * so the CLI can recognise it and say more than the phrase: why there was no seat, and when
 * capacity comes back.
 */
export const UNTRIAGED_NO_SEAT = 'no seat could pay for the triage call'

/** The untriaged reason where the gate named a seat whose credential could not be resolved. */
const NO_CREDENTIAL = "the chosen seat's credential could not be read"

/** The untriaged reason where the cycle's cap on triage calls (`limit`) cut the candidate off. */
const OVER_LIMIT = "this cycle's triage limit was reached first"

/** Where a condition stopped the role: the key that stopped it is in the cycle's `condition`. */
export const UNTRIAGED_CONDITION = 'a condition on this role stopped it before triage'

/**
 * One cycle up to, but not including, the claims: discovery, the filters, triage, and the lists
 * of items to act on. Kept apart from acting so a supervised run can show what it would do and
 * stop there.
 *
 * Outside a preview the watermark moves past what the cycle skipped as well as what it chose:
 * deciding not to act on an item is still a decision, and reconsidering it every cycle would pay
 * for the same model answer again. Three kinds of item still hold the mark back: items nothing
 * examined, skips only the clock brings back (`held`), and, under `markAfterWork`, chosen items
 * the caller did not take. The save at the end of this function says how. A preview saves
 * nothing.
 */
export async function planCycle(
  deps: CycleDeps,
  role: Role,
  options: CycleOptions = {},
): Promise<CycleReport> {
  const now = options.now ?? Date.now()
  const report: CycleReport = {
    readAt: new Date(now).toISOString(),
    role: role.name,
    returned: 0,
    fresh: 0,
    skippedUniversal: 0,
    skippedLane: 0,
    skippedDeferred: 0,
    skippedStopped: 0,
    skippedUnreadable: 0,
    triaged: 0,
    untriaged: [],
    skipped: [],
    verdicts: [],
    toClaim: [],
    waiting: [],
    stopped: [],
    toCatchUp: [],
    triageCostUsd: 0,
    triageCostUnreported: 0,
    failures: [],
    coldStart: false,
  }

  // Who this Igor is in the tracker's holder field. Unknown in a preview that names no identity,
  // where every holder reads as somebody else.
  const holding: Holding | undefined =
    options.identity === undefined
      ? undefined
      : { holder: deps.tracker.holder, distinctFromAssignee: deps.tracker.holderField.distinctFromAssignee }

  const stored = options.sinceDays === undefined ? await loadDiscoveryState(deps.destination) : EMPTY_STATE
  const { results, failures } = await discover({ [deps.tracker.name]: deps.tracker }, role.sources, stored, now)

  for (const failure of failures) {
    report.failures.push(`${failure.source.repo}: ${failure.error.message}`)
  }

  const survivors: Candidate[] = []
  // Stale pull requests are looked for in everything the query returned, not only in what the
  // watermark let through. A base moving does not update the item the pull request came from
  // (`main` advanced eight commits under #21 and the issue's `updatedAt` never moved), so that
  // item usually sits below the mark and would never be looked at again. The mark exists to avoid
  // paying for a model call twice, and this check costs none: it reads the page discovery fetched.
  const catchingUp = new Set<string>()
  for (const result of results) {
    for (const candidate of result.candidates) {
      const artifact = staleOwnArtifact(candidate, options.identity)
      if (artifact === undefined || universalSkip(candidate, options.identity, holding) !== undefined) continue
      if (catchingUp.has(candidate.id)) continue
      catchingUp.add(candidate.id)
      report.toCatchUp.push({ candidate, reason: `${artifact.ref} no longer merges into ${artifact.base}` })
    }

    const fresh =
      options.sinceDays === undefined
        ? result.fresh
        : freshCandidates(result.candidates, undefined, now, options.sinceDays)

    const screened = screen(role.lane, fresh, options.identity, holding)
    const counts = countStages(screened)
    report.returned += result.returned
    report.fresh += fresh.length
    report.skippedUniversal += counts.universal
    report.skippedLane += counts.predicate
    report.coldStart ||= result.coldStart
    for (const t of screened) {
      if (t.verdict.outcome === 'skip') {
        report.skipped.push({ candidate: t.candidate, reason: t.verdict.reason, stage: t.verdict.stage })
      } else if (!catchingUp.has(t.candidate.id)) {
        survivors.push(t.candidate)
      }
    }
  }

  // Items a person handed to this Igor go into `toClaim` with no lane and no triage, ahead of
  // anything the model decides: the person made the judgement those stages stand in for. They
  // are looked for in each source repository, not only where the role's query looks.
  if (holding !== undefined && options.identity !== undefined) {
    const { directed, waiting, stopped } = await findDirected(deps.tracker, role, options.identity, holding, report)
    const taken = new Set(directed.map((d) => d.candidate.id))
    // An item being caught up is this Igor's own work in flight: it is neither claimed nor owed a
    // notice.
    const notCaughtUp = (c: CycleCandidate): boolean => !catchingUp.has(c.candidate.id)
    report.toClaim.push(...directed.filter(notCaughtUp))
    report.waiting.push(...waiting.filter(notCaughtUp))
    report.stopped.push(...stopped)
    for (let i = survivors.length - 1; i >= 0; i -= 1) {
      if (taken.has(survivors[i]!.id)) survivors.splice(i, 1)
    }
  }

  // Oldest first, because the cap below cuts the list and every candidate past it holds the
  // watermark back. In any other order the cut would leave undecided items older than decided
  // ones, the mark would fall below the decided ones, and they would be triaged again next cycle,
  // every cycle: measured as a full cap of calls each cycle on a backlog that never drained. In
  // age order everything decided is older than everything cut.
  survivors.sort(byAge)

  const limit = options.limit ?? 10
  const quiet = await loadDeferrals(deps.destination)
  const window = stopWindow(now, role.cooldownMinutes)
  // Both gates, stops and then deferrals, read an item's comments through one fetch, reaching back
  // as far as either asks about for that item. Where the tracker will not answer for an item, the
  // stop gate's rule wins over the deferral gate's. The stop gate reads first and holds that item
  // and every item after it for this cycle, so the item never reaches the deferral gate, which
  // keeps an item it cannot read and would have let it be worked. The cost is one cycle of delay
  // on those items.
  const comments = oneFetchPerItem(deps.tracker, (c) => {
    const entry = quiet.items[c.id]
    // A deferral record reaches back to when the item was handed back. One whose fingerprint no
    // longer matches (the item has changed since) is void, so only the stop window is read.
    return entry !== undefined && entry.fingerprint === fingerprint(c) ? earliest(entry.at, window) : window
  })
  // Both filters run before the cap, so neither an item still waiting on a reply nor one somebody
  // stopped uses a triage slot. Both are told the cap too, so they stop reading once the cycle has
  // enough work. The stop gate goes first because its answer is the one a person is owed: an item
  // both stopped and unanswered is reported as stopped.
  //
  // Catch-ups pass through both gates as ordinary work does. Somebody who said stop meant the
  // pull request too, and the deferral record keeps a conflict the worker could not resolve from
  // being retried at full worker cost every cycle.
  //
  // Catch-ups are gated into a report of their own, `asked`, so that **nothing here can hold the
  // watermark**. An ordinary item the tracker would not answer for sits above the mark, so
  // `heldBelow` keeps the mark below it for as long as the outage lasts. A catch-up's item is
  // usually far below the mark (#21's issue had not moved in months), so the same rule would reset
  // the mark to the age of the oldest stale pull request and re-read every item newer than it next
  // cycle. Holding the mark gains nothing for them either: stale pull requests are found by
  // scanning everything the query returned, which the mark does not limit.
  const asked: Pick<CycleReport, 'skipped' | 'skippedStopped' | 'skippedDeferred' | 'skippedUnreadable'> = {
    skipped: [], skippedStopped: 0, skippedDeferred: 0, skippedUnreadable: 0,
  }
  // A person who hands an item to this Igor after stopping it gives a go-ahead, so the stop gate is
  // told when each catch-up's item was handed over. Only catch-ups carrying this Igor's label are
  // read, which are few; where the read fails, the item is gated without it.
  const handedOver = new Map<string, string>()
  if (holding !== undefined) {
    for (const { candidate } of report.toCatchUp) {
      if (!candidate.holders.includes(holding.holder)) continue
      const set = await deps.tracker.holderSetBy(candidate).catch(() => undefined)
      if (set !== undefined && !set.self) handedOver.set(candidate.id, set.at)
    }
  }
  const catchUps = await dropDeferred(
    comments,
    await dropStopped(
      comments,
      report.toCatchUp.map((c) => c.candidate),
      role.cooldownMinutes,
      options.identity ?? '',
      asked,
      now,
      Infinity,
      holding,
      handedOver,
    ),
    quiet,
    options.identity ?? '',
    asked,
  )
  for (const { held: _held, ...entry } of asked.skipped) report.skipped.push(entry)
  report.skippedStopped += asked.skippedStopped
  report.skippedDeferred += asked.skippedDeferred
  report.skippedUnreadable += asked.skippedUnreadable
  const catchingUpStill = new Set(catchUps.map((c) => c.id))
  report.toCatchUp = report.toCatchUp.filter((c) => catchingUpStill.has(c.candidate.id))

  const awake = await dropStopped(
    comments, survivors, role.cooldownMinutes, options.identity ?? '', report, now, limit, holding,
  )
  const considered = await dropDeferred(comments, awake, quiet, options.identity ?? '', report, limit)
  // Survivors the cap cut off before either gate read them. Nothing decided anything about them,
  // so they go into `untriaged`, as a held pool's candidates do, and hold the watermark instead of
  // being passed for good.
  const examined = new Set([
    ...considered.map((c) => c.id),
    ...report.skipped.map((s) => s.candidate.id),
  ])
  for (const candidate of survivors) {
    if (!examined.has(candidate.id)) report.untriaged.push({ candidate, reason: OVER_LIMIT })
  }
  // Asked once before triage, not per item: a role stuck on its own configuration would meet the
  // same cure key on every item, so it triages none and claims none. Its candidates go into
  // `untriaged`, which holds the watermark below them, and directed items and catch-ups are found
  // again next cycle, so dropping them here loses nothing. A read that fails is reported, and the
  // cycle goes on as though no condition stopped the role.
  const condition = await options.stopped?.().catch((error: unknown) => {
    report.failures.push(`could not read conditions: ${error instanceof Error ? error.message : String(error)}`)
    return undefined
  })
  if (condition !== undefined) {
    report.condition = condition
    for (const candidate of considered) report.untriaged.push({ candidate, reason: UNTRIAGED_CONDITION })
    report.toClaim = []
    report.toCatchUp = []
  } else if (considered.length > 0) {
    // The gate is asked only now, so a cycle with nothing to triage never reads a seat's usage.
    // Triage spends from the seat a worker would draw on, within what that seat allows. Where the
    // gate is exhausted no call is made, because a triage call spends like any other model call.
    // With no gate at all, the budget is off and the call is made.
    const gate = options.budget ?? (options.gate === undefined ? undefined : await options.gate())
    if (gate?.exhausted() === true) {
      // No seat means no call: don't fall through to `workerEnv` without one. It would spend
      // whatever login is ambient on the machine, which no seat names, no ceiling bounds and
      // nothing in the record can attribute. On a host with no such login it would fail saying
      // the machine is not logged in, when the real problem is that every seat is held.
      report.heldPool = {
        ...(gate.blocked === undefined ? {} : { blocked: gate.blocked }),
        ...(gate.resetAt === undefined ? {} : { resetAt: gate.resetAt }),
        ...(gate.resetApproximate === true ? { resetApproximate: true } : {}),
        ...(gate.passedOver === undefined ? {} : { passedOver: gate.passedOver }),
      }
      for (const candidate of considered) report.untriaged.push({ candidate, reason: UNTRIAGED_NO_SEAT })
    } else {
      let env: NodeJS.ProcessEnv | undefined
      try {
        env = await workerEnv(gate?.token, process.env, gate?.seat)
      } catch (error) {
        report.failures.push(`triage: ${error instanceof Error ? error.message : String(error)}`)
      }
      if (env === undefined) {
        // A seat was named and its credential did not resolve, so no call is made here either.
        // These candidates are in the position a held pool's are: nothing about them caused it,
        // nothing about them will lift it, and a mark let past them drops them for good.
        for (const candidate of considered) report.untriaged.push({ candidate, reason: NO_CREDENTIAL })
      } else {
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
  }

  if (report.skippedUnreadable > 0) {
    report.failures.push(
      `${deps.tracker.name}: could not read comments, so ${report.skippedUnreadable} item(s) wait for the next cycle`,
    )
  }

  // The watermark and the decision record are the cycle's only writes, and a preview makes
  // neither: somebody looking at the backlog decided nothing, and a mark or a record saying
  // otherwise would cost those items the real cycle that would have worked them.
  if (options.preview !== true) {
    // The watermark is a timestamp per source: discovery reconsiders only items whose `updatedAt`
    // is after it. Saving it decides which items the next cycle sees again. A look-back
    // (`sinceDays`) reads behind the stored mark on purpose, so it saves no mark.
    //
    // The mark is held below the `updatedAt` of three kinds of item. A mark that passed one of
    // them would drop it from the pool for good:
    //
    // - An item dropped before anything examined it (`skipped` with `held` set): a stop still
    //   cooling down, or a tracker that did not answer. A cooldown ends with the clock and an
    //   outage with the tracker's recovery, and neither edits the item, so nothing would bring it
    //   back above the mark. Every other skip was a decision, and the edit or reply that would
    //   reverse that decision moves the item's `updatedAt` by itself.
    // - An item triage never asked about (`untriaged`). It was never dropped, so nothing in
    //   `skipped` holds it. Triage takes items oldest first and stops at its cap, so these are the
    //   newest items read, and one holds the mark only where it is newer than every item this
    //   source decided. An untriaged item whose `updatedAt` equals a decided item's is passed.
    //   Such ties happen where tracker timestamps are coarse enough for one bulk edit to stamp a
    //   page of items, and holding the mark below the tie would triage the decided item again
    //   every cycle the tie lasted.
    // - An item the model said to proceed with that the caller never took (`untaken`): a cap, the
    //   budget or a condition stopped the caller first, or the tracker did not answer its claim.
    //   A caller that may stop early saves the mark itself, through `settle` (`markAfterWork`),
    //   and names the items it never took.
    //
    // `decided` is per source, because each source's mark moves on its own: an item decided in
    // another source is nothing this source's mark has to clear.
    const saveMark = async (untaken: readonly string[] = []): Promise<void> => {
      if (options.sinceDays !== undefined || results.length === 0) return
      const held = [...report.skipped.filter((s) => s.held === true).map((s) => s.candidate.id), ...untaken]
      const marks = results.flatMap((result) => {
        const here = new Set(result.candidates.map((c) => c.id))
        const decided = report.verdicts.reduce(
          (newest, v) =>
            here.has(v.candidate.id) ? Math.max(newest, instant(v.candidate.updatedAt)) : newest,
          -Infinity,
        )
        const unexamined = new Set([
          ...held,
          ...report.untriaged
            .filter((u) => instant(u.candidate.updatedAt) > decided)
            .map((u) => u.candidate.id),
        ])
        return heldBelow([result], unexamined)
      })
      // Onto the file as it stands now, not as the cycle read it. It holds every role's sources,
      // and a cycle settled hours after it read the file would otherwise put back the older marks
      // of every source other roles saved meanwhile.
      const current = await loadDiscoveryState(deps.destination)
      await saveDiscoveryState(deps.destination, advance(current, marks))
    }
    if (options.markAfterWork === true) report.settle = saveMark
    else await saveMark()
    // A failed record does not fail the cycle, but it is reported like any other cycle failure:
    // a write that vanished silently would leave nobody able to say afterwards what this cycle
    // decided.
    await recordDecisions(deps.destination, role, report).catch((error: unknown) => {
      report.failures.push(
        `could not record decisions: ${error instanceof Error ? error.message : String(error)}`,
      )
    })
  }
  return report
}

/**
 * The one tracker call the stop and deferral gates read comments with. A cycle passes
 * `oneFetchPerItem`, so each item's comments are fetched once; a caller asking one question can
 * pass the tracker itself.
 */
export type CommentSource = Pick<Tracker, 'commentsSince'>

/** The earlier of two timestamps. One that does not parse is never picked over one that does. */
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
 * Drops the comments from before `since`, so a gate served from a fetch that reached further
 * back gets only what it asked for.
 *
 * A comment whose time does not parse stays in. A stop nobody can date holds its item, so
 * dropping that stop here would let the item be taken again.
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
 * `lookback` gives the earliest moment any gate will ask about for *that* item: the stop
 * window, or the item's deferral when that is older. It is per item because the two differ
 * widely: a deferral reaches back thirty days where a stop window is an hour, and
 * `commentsSince` is paginated. One width for the whole cycle would spend several requests on
 * every item to serve the few that have a deferral.
 *
 * Each gate gets back only the comments from its own `since`, so a comment older than what it
 * asked about cannot answer its question. A request reaching back further than what was
 * fetched is fetched again rather than served short: a truncated list can miss the reply that
 * lifts a deferral, and the deferral then outlives that reply.
 *
 * A failed read is kept as the failure, so a second gate asking about the item gets the same
 * error rather than retrying against a tracker that is most likely rate-limiting.
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
 * Drops survivors this Igor handed back that nobody has answered since: the item still matches
 * the fingerprint its deferral recorded, and nobody but this Igor has commented since.
 *
 * Comments are read only for items that have a deferral and still match its fingerprint, and
 * not at all once the cycle has the `wanted` items it can act on, since the caller drops
 * everything past that regardless. In `planCycle` this makes no request of its own: the read
 * the stop gate took already reaches back to the item's deferral (`oneFetchPerItem`).
 *
 * Where the tracker will not answer, the item is kept and reconsidered. Keeping it costs at
 * worst one repeated handoff; dropping it could leave an item somebody had answered waiting
 * for a reply that never comes.
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

/** Oldest first. Two undatable candidates tie rather than comparing as `NaN`. */
function byAge(a: Candidate, b: Candidate): number {
  const x = instant(a.updatedAt)
  const y = instant(b.updatedAt)
  return x === y ? 0 : x < y ? -1 : 1
}

/** Unparseable sorts oldest, which holds a stop rather than lifting it. */
function instant(iso: string): number {
  const t = Date.parse(iso)
  return Number.isNaN(t) ? -Infinity : t
}

/**
 * The latest stop addressed to this Igor, because the cooldown runs from the last stop anybody
 * issued. Latest means last in `spoken`, which is in creation order, so two stops in the same
 * second, or one with no readable time, are ordered as they were said.
 *
 * A stop made by removing this Igor's label leaves no comment of its own, so this Igor's receipt
 * for it (carrying `STOPPED_MARKER`) counts as the stop, at the receipt's time. Only this Igor's
 * own receipt counts: anyone can copy the marker into a comment.
 */
function latestStop(spoken: readonly Comment[], identity: string): Comment | undefined {
  let latest: Comment | undefined
  for (const comment of spoken) {
    const receipt = comment.author === identity && comment.body.includes(STOPPED_MARKER)
    if (!receipt && !isStop(comment.body, identity, comment.accounts)) continue
    latest = comment
  }
  return latest
}

/**
 * Drops survivors somebody stopped, until the stop's cooldown runs out, somebody says to carry
 * on, or a person hands the item to this Igor again.
 *
 * Without this a stop would last one cycle. A stop moves the item's `updatedAt`, the lane still
 * admits it and triage gives the same verdict on the same text, so the Igor would re-claim what
 * it was just told to put down, and the claim message promises anyone reading it that a stop
 * works immediately.
 *
 * The stop is read off the item every cycle rather than remembered, so nothing an Igor can lose
 * sits between a person writing **stop** and the Igor honouring it. Each item examined costs one
 * comment read, reaching back over the cooldown window only: a stop older than that lets the
 * item back regardless. The scan ends once the cycle has the `wanted` items it can triage.
 *
 * `eligibleAfterStop` holds the rule for what may follow a stop; this supplies the stop and what
 * was said after it. A tracker that will not answer cannot tell "no stop" from "cannot say", so
 * the item waits a cycle, and so does every item after it: one cycle of latency costs less than
 * claiming something a person put down. `dropDeferred` keeps such an item instead, for the
 * reason its own comment gives.
 */
export async function dropStopped(
  tracker: CommentSource,
  survivors: readonly Candidate[],
  cooldownMinutes: number,
  identity: string,
  report: Pick<CycleReport, 'skipped' | 'skippedStopped' | 'skippedUnreadable'>,
  now: number,
  wanted = Infinity,
  /** How the tracker's holder field shows this Igor, to tell whether somebody else took an item. */
  holding?: Holding,
  /**
   * When a person last put this Igor in an item's holder field, by item id. A hand-over newer
   * than the stop is a go-ahead, as a go-ahead comment is.
   */
  handedOver: ReadonlyMap<string, string> = new Map(),
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
      // This item and every one after it are skipped unasked, each `held` so the watermark
      // waits for it. A tracker that will not answer cannot be claimed on either, so a request
      // apiece would buy nothing, and the likeliest reason it stopped answering is a rate limit
      // that more requests would feed.
      for (const rest of survivors.slice(i)) {
        report.skipped.push({
          candidate: rest, reason: 'the tracker stopped answering', stage: 'unreadable', held: true,
        })
        report.skippedUnreadable += 1
      }
      return kept
    }
    const stop = latestStop(spoken, identity)
    const handOver = handedOver.get(candidate.id)
    if (stop === undefined || (handOver !== undefined && instant(handOver) > instant(stop.at))) {
      kept.push(candidate)
      continue
    }
    const verdict = await eligibleAfterStop({
      candidate,
      stoppedAt: stop.at,
      cooldownMinutes,
      identity,
      ...(holding === undefined ? {} : { holding }),
      now,
      since: async () =>
        spoken.filter(
          (c) =>
            // Only comments said after the stop, by position in `spoken`, which is in creation
            // order. `spoken` covers the whole cooldown window, so without this a go-ahead said
            // before the stop would lift it. Position orders two comments stamped the same
            // second, where their times cannot.
            spoken.indexOf(c) > spoken.indexOf(stop) &&
            // Nothing this Igor says is permission for it to resume, even where its own receipt
            // or notice happens to read as a go-ahead.
            c.author !== identity &&
            // One comment can match both: "stop @igor — continue once I've looked" is a stop
            // by `^stop` and a go-ahead by what follows the address. A stop outranks, here as
            // in `verdictFrom`, so it can never be the permission to undo itself.
            !isStop(c.body, identity, c.accounts),
        ),
    })
    if (verdict.eligible) {
      kept.push(candidate)
    } else {
      // Held, so the watermark waits for it, only where the stop has a date: its cooldown ends
      // with the clock, which edits nothing. A stop nobody can date has no cooldown to run out,
      // so only a go-ahead lifts it, and that comment moves the item above the mark by itself.
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

/**
 * Items whose holder field a person set to this Igor, read from the tracker each cycle in every
 * repository the role's sources name, whatever their queries match. An item counts only where a
 * person, not this Igor, last set the field, so an Igor's own leftover label is not mistaken for
 * a hand-over. Each such open item goes in at most one list:
 *
 * - `directed`: what this Igor should claim now, without the settle interval or triage. This
 *   Igor has not claimed it since the hand-over, so a hand-over is answered once. A hand-over
 *   after a stop is a go-ahead that skips the cooldown.
 * - `stopped`: somebody said stop after the hand-over, and this Igor has not answered that stop
 *   with a receipt. The stop cancels the hand-over; the caller removes the label and posts the
 *   receipt (`honourIdleStop`).
 * - `waiting`: another Igor holds the item, or work is already in flight on it, and this Igor
 *   has not posted the notice saying so since the hand-over.
 *
 * A read that fails leaves its item to the next cycle and is reported; it never ends the cycle.
 */
export async function findDirected(
  tracker: Tracker,
  role: Role,
  identity: string,
  holding: Holding,
  report: Pick<CycleReport, 'failures'>,
): Promise<{ directed: CycleCandidate[]; waiting: CycleCandidate[]; stopped: CycleCandidate[] }> {
  const directed: CycleCandidate[] = []
  const waiting: CycleCandidate[] = []
  const stopped: CycleCandidate[] = []
  const seen = new Set<string>()
  for (const repo of new Set(role.sources.map((s) => s.repo))) {
    let found: Candidate[]
    try {
      found = await tracker.directed(repo)
    } catch (error) {
      report.failures.push(`${repo}: could not look for items handed to ${holding.holder}: ${why(error)}`)
      continue
    }
    for (const candidate of found) {
      if (seen.has(candidate.id) || candidate.state === 'closed') continue
      seen.add(candidate.id)
      try {
        const setting = await tracker.holderSetBy(candidate)
        if (setting === undefined || setting.self) continue
        // Comments created since the hand-over. On a surface whose `since` filters by edit time,
        // `commentsSince` also returns older comments edited since, and an old stop edited later
        // would cancel the hand-over it predates.
        const spoken = notBefore(await tracker.commentsSince(candidate, setting.at), setting.at)
        // A stop since the hand-over cancels it. A label on an item always means it is handed
        // over, so a stop no run of this Igor has answered goes to `stopped`, which takes the
        // label off. Only this Igor's receipt, at or after the stop, answers it: a notice or a
        // claim after a stop does not.
        const stop = latestStop(spoken, identity)
        const receipted =
          stop !== undefined &&
          spoken.some((c) => c.author === identity && c.body.includes(RECEIPT_MARKER) && instant(c.at) >= instant(stop.at))
        if (stop !== undefined && !receipted) {
          stopped.push({
            candidate,
            reason: `stopped by ${stop.author || 'somebody'} while nothing was running`,
            stop: { status: 'stopped', ...(stop.author === '' ? {} : { by: stop.author }), at: stop.at, reason: stop.body.trim().slice(0, 500) },
          })
          continue
        }
        const others = candidate.holders.filter((h) => h !== holding.holder)
        if (others.length > 0) {
          const marker = waitingMarker(others)
          if (!spoken.some((c) => c.author === identity && c.body.includes(marker))) {
            waiting.push({
              candidate, reason: `held by ${others.join(', ')}`, holders: others, notice: waitingNotice(role, others),
            })
          }
          continue
        }
        // Only a claim answers a hand-over: not a waiting notice, and not the claim a catch-up
        // of the Igor's own pull request makes.
        const answered = spoken.some((c) => c.author === identity && c.body.includes(CLAIM_MARKER))
        // A stop answered with a receipt still cancels the hand-over, lifted later or not: only a
        // new hand-over, the label removed and added again, restores it.
        const cancelled = stop !== undefined
        if (answered || cancelled) continue
        // Work already in flight, even this Igor's own: the hand-over waits for it to close,
        // and says so once. The marker keeps the notice from answering the hand-over.
        const work = candidate.inFlight
        if (work !== undefined) {
          if (!spoken.some((c) => c.author === identity && c.body.includes(waitingMarker([work.ref])))) {
            waiting.push({
              candidate, reason: `work already in flight: ${work.ref}`, notice: inFlightNotice(role, work.ref, work.url),
            })
          }
          continue
        }
        if (universalSkip(candidate, identity, holding) !== undefined) continue
        directed.push({
          candidate, reason: `${setting.by} handed it to ${holding.holder}`, directed: true, handedOverAt: setting.at,
        })
      } catch (error) {
        report.failures.push(`${candidate.id}: could not read who handed it to ${holding.holder}: ${why(error)}`)
      }
    }
  }
  return { directed, waiting, stopped }
}

/**
 * Answers a stop said on a handed-over item while no run of this Igor was active on it: the
 * label comes off, as on any stop, and the stop gets its receipt. Where the release does not
 * take, a second comment says so after the receipt, as on every stop path.
 */
export async function honourIdleStop(
  tracker: Tracker,
  candidate: Candidate,
  role: Role,
  identity: string,
  verdict: ClaimVerdict,
): Promise<void> {
  const clear = await standDown(tracker, candidate, identity, verdict)
  const own = candidate.inFlight !== undefined && candidate.inFlight.author === identity ? candidate.inFlight.url : undefined
  await tracker.report(candidate, stopReceipt(role, verdict, own)).catch(() => undefined)
  if (!clear) await tracker.report(candidate, stillHeld(role)).catch(() => undefined)
}

const why = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export const DECISIONS_PATH = 'decisions.ndjson'

/**
 * Appends one line per cycle to `decisions.ndjson`: the count at each stage, and every item's
 * decision with its reason, skips included.
 *
 * A skip is the more useful record of the two. Whether a lane is doing its job, and whether
 * the model is earning what it costs, are questions about what was *rejected*. Printed only to
 * a terminal nobody kept, the share of items rejected at each stage could only ever be estimated
 * afterwards.
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
  // A cycle with nothing fresh and no failure writes no line, unless it made one of these
  // decisions:
  // - A catch-up. A cycle whose only decision was a catch-up is the cycle most worth a record.
  // - A condition that stopped the role, recorded whatever the cycle found: the record is where
  //   an operator tells a role stuck on its configuration from one with nothing to do.
  // - A directed item, which is claimed whether or not anything was fresh.
  if (
    report.fresh === 0 &&
    report.failures.length === 0 &&
    report.toCatchUp.length === 0 &&
    report.condition === undefined &&
    !report.toClaim.some((c) => c.directed === true)
  ) return
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
      ...(report.untriaged.length === 0 ? {} : { untriaged: report.untriaged.length }),
      ...(report.heldPool === undefined ? {} : { heldPool: report.heldPool }),
      ...(report.condition === undefined
        ? {}
        : {
            condition: {
              key: report.condition.key,
              state: report.condition.state,
              count: report.condition.count,
              since: report.condition.first,
              ...(report.condition.probeAt === undefined ? {} : { probeAt: report.condition.probeAt }),
              cure: cureFor(report.condition.key),
            },
          }),
      claimed: report.toClaim.length,
      triageCostUsd: Number(report.triageCostUsd.toFixed(4)),
      ...(report.triageCostUnreported > 0 ? { triageCostUnreported: report.triageCostUnreported } : {}),
      ...(report.triageSeat === undefined ? {} : { seat: report.triageSeat }),
      decisions: [
        ...report.skipped.map((s) => ({ item: s.candidate.id, stage: s.stage, outcome: 'skip', reason: s.reason })),
        // A catch-up passes the universal stage and never reaches `skipped` or `verdicts`. Without
        // this entry it would be the one decision a cycle makes and never records, and the skip
        // ratio this record exists to measure would be off by it.
        ...report.toCatchUp.map((c) => ({
          item: c.candidate.id, stage: 'catch-up', outcome: 'proceed', reason: c.reason,
        })),
        ...report.verdicts.map((v) => ({ item: v.candidate.id, stage: 'model', outcome: v.outcome, reason: v.reason })),
        // A directed item reaches no stage that records it, so it is named here.
        ...report.toClaim
          .filter((c) => c.directed === true)
          .map((c) => ({ item: c.candidate.id, stage: 'directed', outcome: 'proceed', reason: c.reason })),
        // Recorded so the items are named rather than only counted, and as their own outcome:
        // reading one of these back as a skip would say triage decided something about it.
        ...report.untriaged.map((u) => ({ item: u.candidate.id, stage: 'model', outcome: 'untriaged', reason: u.reason })),
      ],
      ...(report.failures.length > 0 ? { failures: report.failures } : {}),
    },
    `Triage decisions for ${role.name}`,
  )
}
