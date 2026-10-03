# A claim that cannot be kept is given back, out loud

## Why

`work-claiming` has requirements for taking a claim, verifying it, standing down from it and
stopping. It has none for the run that takes one and then cannot continue — and that silence is
where three defects have now been found, each in a different place:

- [#128](https://github.com/adamstallard/igor/issues/128) — a throw out of `execute`
- [#129](https://github.com/adamstallard/igor/issues/129) — the claim's own window in `takeClaim`
- a third, driven end to end while fixing #129: `runItem` has no handler at all, so a tree that
  cannot be provisioned leaves the item assigned and announced with only a cycle-level error

Three sites, one rule, and nothing in force states the rule. `graceful-handoff` says an Igor never
goes silent on a claimed item, which is the *outcome*; nothing says what the claiming capability
must do to produce it, so each site was fixed on its own and the next one was found afterwards.

## What must be true

A run that holds a claim and cannot go on releases it and says so. Where the release does not take
either, what is said names the item as still held rather than as released — a message asserting a
release that did not happen is worse than none, because somebody reads it.

And a failure of the *surface* is distinguished from a refusal about the *item*. Converting the
throws into per-item refusals removed the abandonment a throw used to cause, so a tracker outage
walked the whole pool doing the same thing to each. Measured over four cycles: 24 comments where
the previous behaviour produced 6.

## Also here

**A write answers what the surface recorded.** `claim` has done this since it was written —
*"Returns what the surface actually recorded, which may not be what was asked"* — and it is why a
GitHub assignment silently dropped for a non-collaborator is handled correctly. `report` and
`release` were held to a weaker contract for no stated reason, and that weakness is the shared
root of two of the three defects: a thrown error cannot separate *did not happen* from *happened,
answer lost*, so every caller reconstructed remote state from a local boolean.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
