/**
 * Flag combinations a command refuses before it does anything.
 *
 * Checked first, so a refusal costs no network call and no model call.
 */

/**
 * Whether `--claim` was given at all.
 *
 * An empty value is a mistyped id — a shell expanding an unset variable into
 * `igor run <role> --claim ""` — not an absent flag, and it must reach the claim path so it dies
 * there naming the item it could not find. Read through this rather than for truthiness
 * anywhere: an empty id that tests as absent falls through to the full autonomous cycle, which
 * claims and spends across the whole backlog instead of failing on one unfound item.
 */
export function claimRequested(opts: { claim?: unknown }): boolean {
  return opts.claim !== undefined
}

/**
 * Whether `run`'s flags contradict each other, and what to say if they do.
 *
 * `--plan` and `--claim` are the one pair that does. `--claim` is the supervision override: it
 * skips triage and works the item it names, so it reaches the claim without ever reading the
 * plan flag. A run given both therefore claims — which is the opposite of the only thing
 * `--plan` means.
 *
 * Refusing rather than letting `--plan` win, because `--claim` has no preview to fall back to
 * and inventing one would be a feature built to close a footgun. The asymmetry decides it: a
 * refusal costs a retype, and being wrong costs a claim, a comment on somebody's issue, and a
 * worker run that spends real money.
 *
 * The trap this closes is the preview's own suggested line — `igor run <role> --claim <id>`,
 * printed under "Nothing was claimed" — which invites exactly one cautious edit.
 */
export function contradictoryRunFlags(opts: { plan?: unknown; claim?: unknown }): string | undefined {
  if (opts.plan === true && claimRequested(opts)) {
    return (
      '--plan and --claim contradict each other: --plan stops before claiming, and --claim ' +
      'claims the item it names. To preview, drop --claim; to claim what a preview listed, ' +
      'drop --plan.'
    )
  }
  return undefined
}
