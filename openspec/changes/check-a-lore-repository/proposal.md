## Decisions

1. **`igor doctor` is built after App support (#156's implementation, now merged), and its only
   identity check is of each role's App.** It invokes the check `igor run` and `igor serve` make
   before discovery, surface-adapter's *An Igor that cannot act as its App does not start*: the
   App is installed on every repository the role works and on the lore repository, with Contents,
   Issues and Pull requests read and write. Since #156 every role's identity on GitHub is its App,
   so an identity that is not an App is never met and is not a finding. `design.md`'s *Every Igor
   is a GitHub App* says why.
2. **A role with no seat is a finding, whether or not any seat is declared**. Where seats are
   declared the loader refuses such a role, but only the role being run. Where none are, nothing
   refuses it, and it spends through a stored login, which #171 and #175 decided Igor never does.
   When this takes effect is open (`design.md`, *Open Questions*). Task 2.6.
3. **`igor doctor` may invoke an existing check, and never re-implements one**. It invokes the
   configuration loader's validation in a mode that reads no secret, adding that mode where the
   loader has none, and reports each of its findings, naming the check that made it. Task 2.7.

Choices this change makes among alternatives, each argued where it points:

4. **The command is `doctor`**, not `check`, `verify` or `setup check` (`design.md`).
5. **It reads and never repairs: no `--fix`**, so writability is read from a permission, never
   tested by writing (`design.md`).
6. **A skipped check is not a finding**, so a run of skips exits zero and says it checked
   nothing (`design.md`).
7. **Required approvals are a finding only where too few people with write access could approve**
   to meet the rule without the author (`design.md`).
8. **`setup-check` is a new capability**, not part of `lore-store` (*Capabilities*, below).
9. **`docs/architecture.md` §5.0.3 keeps its two commands**, with one sentence on the setup
   check (*Impact*, below).
10. **Every role must name a source**, since each role naming none discovers nothing.
    *Rejected:* requiring only that at least one role names one, which lets a role with none
    pass silently.
11. **A pull-request rule that administrators can bypass is a finding**. With
    `enforce_admins` off in branch protection, an administrator can push straight to the default
    branch, so the report says so and does not call the branch protected against direct pushes.
    A ruleset whose bypass list holds the administrator role is the same case. An entry pushed
    straight to the default branch is never promoted (`design.md`). And under #171
    (`seat-files`), seat files live in the lore repository: a person who lends a seat hears of a
    change to their seat file from a notice on the pull request that makes it, which a direct
    push skips. Task 3.2.

The questions still open, several for Adam with a recommendation, are in `design.md`'s *Open
Questions*.

## Why

Every way a lore repository can be set up wrong is **silent**. Nothing refuses, nothing warns,
and the symptom arrives later as absence — lore that never fires, a promotion that never lands,
a workflow that ran and failed while the Actions tab looked green.

Four of them are repository settings. Three are a `GET` away with the credential Igor already
has; the fourth, the bypass list, needs administrative read, so it is the check most often
reported unchecked (`design.md`):

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
on a configured lore repository and changes nothing. Seven requirements: one for the command and
what it inspects, two more rules for it (it invokes Igor's existing checks and validates without
reading a secret; report text cannot start a workflow command), and one for each of the four
constraints issue #110 states.

*Setup is reported by one command, over what the configuration alone cannot show.* The command
inspects the destination and its repository:

- The destination resolves, is inside a git repository, and has an `origin` remote naming a
  GitHub repository — what `repoFromCheckout` throws on, surfaced before a run rather than
  during one.
- Every role file resolves, and every role names at least one `sources` entry. A role
  with none discovers nothing, forever, quietly: `role.ts` prints `(none)` under `sources:` and no
  path refuses it.
- Every role has a seat to spend from, whether or not any seat is declared (decision 2).
- Every role's effective `commands` list, after what it inherits from `roles/org.yaml`, permits a
  removal: a list with no `git rm` matcher is an Igor that cannot delete a file, and the refusal
  arrives after the worker has been paid.
- The four repository settings above.
- The state branch is reachable, or not yet created, and the code-host credential `doctor` runs
  with, such as a person's `gh` login or a CI token, holds the write permission pushing to it
  needs; which principal this check should read is open (`design.md`). Reachability is read; **writability is inferred from the permission, never tested by
  writing** — see `design.md`.
- Each role's App passes the start-up check `igor run` and `igor serve` make, on every repository
  the role works and on the lore repository (decision 1), whether the role claims on GitHub or on
  Linear.

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
| `role "x" names no seat` | **a check** of its own, for every role, whether or not any seat is declared (decision 2). The load-time refusal covers only the role you run, and only where seats are declared |
| the App rows, from `the GitHub App "x" is missing GITHUB_APP_ID …` to `taking no new work, GitHub would not mint a token …` | already refusals at start, or messages while serving, for the role being run. `doctor`'s App check covers every role, the ones nobody ran included |
| `the tracker did not record <account> as holding <item>` | **prose.** The label was not there when read back after a claim, which happens at runtime. The App check reads beforehand whether the App may add the label, which is the cause least visible when this bites, but it cannot rule the row out |
| nothing is ever claimed | **prose.** The remedy is already *"run `igor run <role> --plan`"* — a funnel over live candidates, not a fact about setup |
| `9 left untriaged — the budget is used up …` | **prose.** A runtime state of a correctly configured system; `igor budget` shows it |
| `9 left untriaged — no seat's usage could be read …` | **prose**, for the same reason |
| an item was claimed and nothing happened | **prose.** The row exists to say there is no such case and that finding one is a bug |

And the judgement the table leaves to a person stays with the person: whether an Igor's App
*should* hold the permissions it was granted is not a question a command answers.

## Capabilities

### Added Capabilities

- `setup-check`: one read-only command reports whether a lore repository is wired to work —
  destination, roles, the removal permission, the four repository settings, the state branch
  and each role's App — naming each finding's remedy and who performs it, skipping what it cannot
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

A capability absent from `openspec/specs/` is normal here: the open changes `lore-from-reviews`
and `directed-interaction` each add one. `setup-check` joins them.

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
  of it took. #112 rewrote that section around `igor init`, and this adds one line to the end
  of it.
- `docs/architecture.md` §5.0.3 is **not** amended to name this as a third command. Its two —
  `role explain` and `igor run --plan` — are both about a role's effective behaviour, inside a
  section titled *What a role actually looks like*. A repository-wiring check is the same
  principle applied to a different subject, so the passage gains one sentence saying the
  principle produced a setup check and where it is documented, and its list stays at two.
