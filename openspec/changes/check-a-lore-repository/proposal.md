## Why

Every way a lore repository can be set up wrong is **silent**. Nothing refuses, nothing warns,
and the symptom arrives later as absence — lore that never fires, a promotion that never lands,
a workflow that ran and failed while the Actions tab looked green.

Four of them are repository settings, each a `GET` away with the credential Igor already has:

1. **Branch protection off.** Promotion works by reconciling pull requests, so an entry
   committed straight to the default branch **has nothing to promote it**. It stays
   `provisional`, only `active` entries fire, and nothing reports it. The README's own words:
   *"You find out when lore you wrote never shows up in a prompt."*
2. **"Require approvals" on.** GitHub refuses to let anyone approve their own pull request, so
   this hard-blocks a solo maintainer with no workaround — while sounding like the responsible
   setting to enable. The README already says *do not enable it*, as prose the reader has to
   absorb and act on correctly.
3. **The reconcile workflow missing.** `templates/reconcile-on-merge.yml` says what its absence
   costs: *"reconciliation depends on someone having igor installed and remembering to run
   `igor-lore reconcile` — so a teammate could merge lore that then silently never fires."*
4. **The Actions actor not on the ruleset bypass list.** The same template: *"If the default
   branch is protected, add the GitHub Actions actor to the ruleset's bypass list, or this
   workflow's own push is blocked by the same rule it exists to work around."* It runs, it
   fails, and nobody is watching.

Settings 1 and 4 are exactly the two manual GitHub steps the README carries emphatic warnings
about, and they are written that emphatically because getting them wrong is silent. A command
that reads them removes the need to remember.

**The strongest argument is already in the repository.** `docs/deployment.md` has a *"When
something is wrong"* section: a symptom-and-cause table whose every row is a condition somebody
evaluates by hand. That table is a doctor written as prose for a person to execute. This makes
the executable half executable, and says which half is not — see *What this does not check*.

## What Changes

**One new command, `igor doctor`, and one new capability, `setup-check`.** The command reports
on a configured lore repository and changes nothing. Five requirements, one for the surface and
one for each of the four constraints the issue states.

*Setup is reported by one command, over what the configuration alone cannot show.* The command
inspects the destination and its repository:

- The destination resolves, is inside a git repository, and has an `origin` remote naming a
  GitHub repository — what `repoFromCheckout` throws on, surfaced before a run rather than
  during one.
- Every role file resolves, and at least one role names at least one `sources` entry. A role
  with none discovers nothing, forever, quietly: `role.ts` prints `sources: (none)` and no
  path refuses it.
- `roles/org.yaml` permits a removal, once removals can be published: a `commands` list with
  no `git rm` matcher is an Igor that cannot delete a file, and the refusal arrives after the
  worker has been paid. Stated as a condition rather than a reference to a pull request, the
  way [#112](https://github.com/adamstallard/igor/pull/112) states the same dependency.
- The four repository settings above.
- The state branch is reachable, and the credential holds the write permission pushing to it
  needs. Reachability is read; **writability is inferred from the permission, never tested by
  writing** — see `design.md`.
- The machine account has write access to the destination. `claiming.ts` reports *"the tracker
  did not record `<account>` as holding `<item>`"* because GitHub accepts an assignment from an
  account without write access and silently drops it; the permission is readable in advance.

*The check reports and never repairs.* Changing branch protection is exactly the outward-facing
mutation a diagnostic must not make, and a doctor that mutates is one people are afraid to run.

*Every finding names its remedy and who performs it.* Several remedies are GitHub UI actions no
command can take, and a report that names a problem without naming who can act on it leaves the
operator where the prose left them.

*A check that cannot be made is skipped and said, not failed.* No credential, or a token that
cannot read rulesets, skips those checks and reports them as unchecked. A check that only works
when everything is already fine is useless.

*The exit status distinguishes a finding from a clean run.* Non-zero when something is wrong, so
the command can be a CI step or a post-setup smoke test — and a skip is not a finding, so an
all-skips run exits zero while saying plainly that it checked nothing.

## What this does not check, and why

**A nested store.** The issue asks for it; [#111](https://github.com/adamstallard/igor/pull/111)
dissolves it. A `destination` resolving below its repository's root becomes a **config-load
refusal**, so by the time `doctor` runs the loader has already refused. Saying so is worth as
much as a check would have been: one item leaves this change's scope because a companion change
made it impossible rather than because it stopped mattering.

**Rows of the `docs/deployment.md` table that are already loud, or already somebody's job:**

| row | disposition |
|---|---|
| `seat "x" reads its token from Y, which is not set` | already `igor budget`, which reports a credential that will not resolve. The report names that command rather than reading tokens itself |
| `role "x" names seat "y", which is not declared` | already a load-time refusal (`role.ts` `checkSeat`), for the role you run. `doctor` resolves **every** role, so the roles you did not run are covered by the resolution check rather than by a check of their own |
| `role "x" names no seat` | the same refusal, the same coverage |
| `the tracker did not record <account> as holding <item>` | **a check.** The permission is readable before anything is claimed, and this is the row whose cause is invisible at the moment it bites |
| nothing is ever claimed | **prose.** The remedy is already *"run `igor run <role> --plan`"* — a funnel over live candidates, not a fact about setup |
| `9 left untriaged — the budget is used up …` | **prose.** A runtime state of a correctly configured system; `igor budget` shows it |
| `9 left untriaged — no seat's usage could be read …` | **prose**, for the same reason |
| an item was claimed and nothing happened | **prose.** The row exists to say there is no such case and that finding one is a bug |

And the judgement the table leaves to a person stays with the person: whether a machine account
*should* have write access is not a question a command answers.

## Capabilities

### Added Capabilities

- `setup-check`: one read-only command reports whether a lore repository is wired to work —
  destination, roles, the removal permission, the four repository settings, the state branch
  and write access — naming each finding's remedy and who performs it, skipping what it cannot
  read, and exiting non-zero only when something is wrong.

**A new capability rather than an addition to `lore-store`.**

[#112](https://github.com/adamstallard/igor/pull/112) chose `lore-store` for `init` on the test
*whose in-force requirements would have to be reworded because this exists*. Applied here the
test returns **nothing**: a command that mutates nothing changes no obligation anywhere. No
requirement in `lore-store`, `lore-review`, `role-config` or `work-discovery` reads differently
because a reporter exists.

What the checks do span is all four of those capabilities — the destination and its
configuration (`lore-store`), promotion by pull request and the reconcile workflow
(`lore-review`), roles and their `sources` and `commands` (`role-config`), the state branch
(`work-discovery`). Splitting one command's requirements across four spec files is worse than
either alternative: no file would then hold the constraint that the command as a whole is
read-only, and the constraint is the point.

A capability absent from `openspec/specs/` is normal here — `condition-backoff` adds
`stuck-conditions`, `lore-from-reviews` adds `lore-consolidation`, `directed-interaction` adds
its own. `setup-check` joins them.

## Relationship to `igor init`

[#112](https://github.com/adamstallard/igor/pull/112) and this are companions, and neither
duplicates the other. `init` **writes** the files a lore repository needs and, by its second
requirement, deliberately does not touch branch protection or a bypass list — it prints what
remains. This **reads** what remains, including the part `init` cannot write. It is the natural
last step of the setup `init` scaffolds: *run this and confirm it took.* No requirement here
restates one of theirs, and the two added requirements in #112 are in a different capability.

## Impact

- The two manual GitHub steps stop depending on being remembered correctly.
- A setup can be verified in CI, which is where the settings drift back.
- `docs/deployment.md`'s table names the command for the rows it evaluates, and keeps the rows
  that need human judgement as prose.
- The README's setup section gains a final step, so the operator has a way to know whether any
  of it took. If #112 lands first that section is already being rewritten around `igor init` and
  this adds one line to the end of it; either order works.
- `docs/architecture.md` §5.0.3 is **not** amended to name this as a third command. Its two —
  `role explain` and `role dry-run` — are both about a role's effective behaviour, inside a
  section titled *What a role actually looks like*. A repository-wiring check is the same
  principle applied to a different subject, so the passage gains one sentence saying the
  principle produced a setup check and where it is documented, and its list stays at two.
