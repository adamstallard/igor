## Why

`claim` is a role setting that overrides the claim message. The example in the architecture
document is `claim: "Taking this — {{igor}}"`, and it demonstrates the problem: the message it
replaces is

> **backend** picked this up and is working on it.
>
> Reply **stop** to hand it back — that works for anyone, immediately, no permission needed.

The second sentence is the only place anyone is told how to stop an Igor, or that they are
allowed to. `work-claiming` requires that stop "MUST NOT be gated by identity, permission, or
configuration", and fails validation where configuration "attempts to restrict who may stop an
Igor". A setting that replaces that sentence with `Taking this` does not restrict who may
stop — it removes the only notice that stopping is possible, which is the same outcome reached
by a route the requirement did not anticipate.

Nothing reads the setting today. It is parsed, stored, merged by override semantics, and
printed by `role explain` with the file it came from — so `explain`, whose whole job is
reporting what is in force, reports a setting that governs nothing. Wiring it up is what would
introduce the hazard.

## What Changes

**`claim` is removed** from the role file, the merge semantics, and `role explain`.

**The claim message stays fixed.** It names the role and the account, so a reader can tell
which Igor holds the item where a surface shows one shared identity, and it carries the stop
instruction. Both jobs are why it is posted on every claim rather than only where a tracker
lacks a holder field.

Explicitly out of scope:

- **Letting an org customize the opening line while the stop instruction is always appended.**
  That would be safe, and it is a reasonable thing to want for tone. It is also a feature
  nobody has asked for, and adding it now would mean keeping a setting alive on speculation.

## Capabilities

### Modified Capabilities

- `role-config`: `claim` is no longer a field a role may set, and no longer among the settings
  merged by override.

## Impact

- Removes a configuration surface whose only possible use is to make stopping undiscoverable.
- `role explain` stops reporting a setting that does nothing, which is the whole point of it.
