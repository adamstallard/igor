import type { Candidate, CodeHost, Tracker } from './adapter.js'
import { checkpoint, stopReceipt, takeClaim, type ClaimOptions } from './claiming.js'
import { complete, execute, type ExecuteOptions, type ExecutionResult } from './execute.js'
import { handOffFrom, type HandoffReason } from './handoff.js'
import type { Role } from './role.js'
import type { TreeProvider } from './worktree.js'

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
}

export interface RunOptions extends ExecuteOptions {
  claim?: ClaimOptions
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

  const claim = await takeClaim(tracker, candidate, role, identity, options.claim ?? {})
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
    return { outcome: 'handed-off', candidate, reason: 'budget exhausted before starting', costUsd: 0, spoke: out.posted }
  }

  const execution = await execute(trees, tracker, codeHost, candidate, role, {
    ...options,
    stillHeld: async () => (await checkpoint(tracker, claim, identity)).status === 'held',
  })

  switch (execution.outcome) {
    case 'produced': {
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
      if (verdict.status === 'stopped') {
        const artifact = execution.artifact ? execution.artifact.url : undefined
        await tracker.report(candidate, stopReceipt(role, verdict, artifact)).catch(() => undefined)
        return { outcome: 'stopped', candidate, reason: execution.reason, execution, costUsd: execution.costUsd, spoke: true }
      }
      if (verdict.status === 'lost') {
        return { outcome: 'lost', candidate, reason: execution.reason, execution, costUsd: execution.costUsd, spoke: false }
      }
      // Still held, so the refusal was the action space rather than the claim: that is a
      // dead end the Igor cannot get past, which is what a handoff is for.
      const out = await handOffFrom(
        tracker, candidate, role, identity, claim.claimedAt,
        { kind: 'failure', detail: execution.reason }, execution,
      )
      return { outcome: 'handed-off', candidate, reason: execution.reason, execution, costUsd: execution.costUsd, spoke: out.posted }
    }

    case 'failed':
    case 'nothing-to-do': {
      // "Nothing to do" still owes an explanation. The Igor claimed the item, so releasing it
      // unchanged and unremarked leaves it looking handled when nobody has handled it. It is
      // not a failure in the sense of something breaking, so it should not read as one.
      const detail =
        execution.outcome === 'nothing-to-do'
          ? 'it looked at this and found nothing it could usefully change'
          : execution.reason
      const out = await handOffFrom(
        tracker, candidate, role, identity, claim.claimedAt,
        { kind: 'failure', detail }, execution,
      )
      return { outcome: 'handed-off', candidate, reason: execution.reason, execution, costUsd: execution.costUsd, spoke: out.posted }
    }
  }
}
