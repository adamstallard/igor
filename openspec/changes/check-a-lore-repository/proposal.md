## Decisions

1. **`igor doctor` is built after App support (#156's implementation, now merged)** (Adam,
   2026-10-04). Its only identity check is that each role's App is installed on the repository
   where it claims issues, with the permissions its `igor:<role>` label and claim comment need.
   Under decision 4 that check is the one `igor run` and `igor serve` make before discovery,
   invoked rather than re-implemented. *Rejected:* an interim check of the claiming account's
   write access.
2. **An identity that is not an App is not a finding** (Adam, 2026-10-11). Since #156 every
   role's identity on GitHub is its App, so `doctor` never meets another kind and has nothing to
   report for one. Igor reports no old configuration, since nobody runs Igor yet.
3. **A role with no seat is a finding, whether or not any seat is declared** (Adam,
   2026-10-18). Where seats are declared the loader refuses such a role, but only the role being
   run; where none are, nothing refuses it. When this takes effect is open (*Still open*).
   Task 2.6.
4. **`igor doctor` may invoke an existing check, and never re-implements one** (Adam,
   2026-10-18). It invokes the configuration loader's validation in a mode that reads no secret
   and reports each of its findings, named with its source. One of them will be a seat file
   carrying an encrypted token where no key is declared: #171 (`seat-files`), an open pull
   request built after this change, adds that finding to the validation, and `doctor` shows it
   once #171 lands. Task 2.7.

Choices this change makes, which Adam approves with it:

5. **The command is `doctor`**, not `check`, `verify` or `setup check` (`design.md`).
6. **It reads and never repairs: no `--fix`**, so writability is read from a permission, never
   tested by writing (`design.md`).
7. **A skipped check is not a finding**, so a run of skips exits zero and says it checked
   nothing (`design.md`). *Rejected:* a third exit status.
8. **Required approvals are a finding only where fewer than two people with write access could
   approve** (`design.md`).
9. **`setup-check` is a new capability**, not part of `lore-store` (*Capabilities*, below).
10. **`docs/architecture.md` §5.0.3 keeps its two commands**, with one sentence on the setup
    check (*Impact*, below).
11. **Every role must name a source**, since each role naming none discovers nothing.
    *Rejected:* requiring only that at least one role names one, which lets a role with none
    pass silently.

Adam's decision of 2026-10-21:

12. **A pull-request rule that administrators can bypass is a finding** (Adam, 2026-10-21). With
    `enforce_admins` off in branch protection, an administrator can push straight to the default
    branch, so the report says so and does not call the branch protected against direct pushes.
    A ruleset whose bypass list holds the administrator role is the same case. Under #171 (`seat-files`), seat files live in the lore repository, and a lender hears of a
    change to theirs from a notice on its pull request, which a direct push skips. Task 3.2.

**Still open, for Adam, each with a recommendation:**

- **When decision 3 takes effect.** The in-force `seat-budget` spec lets a deployment that
  declares no seats run with no budget, and calls that a decision. #171 removes that exemption,
  but #171 is built after this change, so the exemption is still in force when `doctor` ships,
  and `doctor` would exit non-zero on every such deployment until #171 lands. Such a
  deployment spends through a stored login, the credentials `claude` keeps in a home directory,
  since no seat names a token for it. *Recommended:* let decision 3 stand from the day `doctor`
  ships, since #171 and #175 already decided that Igor never runs on a stored login.
- **How `doctor` reads every role's App.** A role's App key is read only from its own
  environment, so one `doctor` process holds at most one role's key. Whether any other
  credential, such as an organization owner's token, can read every installation's permissions
  is unmeasured (task 3.7). *Recommended, if only the App's own key can:* on the host where
  `igor serve` runs, run `doctor` once per role with that role's environment file
  (`/etc/igor/<role>.env`); elsewhere each App check is unchecked, naming the missing key.
- **App keys in CI.** Running the App check in CI would put every role's private key in the lore
  repository's Actions secrets, where repository code can reach them. *Recommended:* place no
  App key in CI; there the App checks are reported unchecked.
- **Which principal the state-branch check reads.** An Igor pushes to the state branch with its
  App's installation token, so the permission of the person's own `gh` login, which the spec
  calls the credential, says little. *Recommended:* the state-branch check (spec, and task 3.6)
  reads each role's App's permission on the repository instead, with the App check.
- **A lore repository used only through `igor run`.** Under #171, `igor run` spends a token from
  the developer's own environment, `IGOR_RUN_TOKEN`, and needs no seat file. This change still
  reports every role with no seat, because a seat is what `igor serve` spends. On such a
  repository `doctor` always exits non-zero, so a CI step there is always red. *Recommended:*
  keep the finding; such a repository can skip `doctor` in CI.

**Found by the 2026-10-21 consistency read, for the next revision.** A consistency read is a
fresh agent's check of this change against every other spec, change and open pull request. None
of its findings is fixed here, and none concerns decision 12.

- To fix, by whoever next revises this change:
  - *What Changes* still says at least one role must name a source, against decision 11.
  - Decision 1 describes one claiming repository and two permissions, while the start-up check
    it invokes covers every repository the role works, and the lore repository.
  - A role that claims on Linear still acts on GitHub as its App, so its App check is not "not
    applicable".
  - A fresh repository has no state branch until an Igor first runs, which the state-branch check
    needs to tell apart from one it cannot read.
  - The approvals rule assumes one required approval, and leaves out code owners.
  - The seat check defines a role's seat by "resolving its seats", which only #171 defines.
  - The removal check reads the org-level `commands` list, though a role may narrow it.
  - The rule that no report line begins with `::` misses an indented line, and GitHub's other
    workflow-command form, `##[`.
  - Several requirements carry their rationale in the requirement text.
  - *What Changes* quotes `role.ts` as printing `sources: (none)`; it prints `(none)` on a line of
    its own.
  - #171's scenario on ciphertext with no key repeats this change's validation scenario, whose
    seat-file example cannot be tested before #171 is built.
- For Adam, next round:
  - Decision 8 passes a branch that requires approvals wherever two or more people with write
    access could approve, while lore-review says "Require approvals" SHALL NOT be recommended.
  - Under the open question on the state-branch principal: in CI, `GITHUB_TOKEN` reads as having
    no push permission, so that check would always fail there.
  - The endpoint permissions `design.md` assumes are unmeasured (task 3.1).
  - Which identity `doctor` acts as is stated only in #171's `surface-adapter` delta.

**Conflict, recorded and not resolved:** #150's task 2.5 relies on `igor doctor` reporting a role
whose identity is not an App, which decision 2 rules out; #150 is to drop or replace it.

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
- Every role has a seat to spend from, whether or not any seat is declared (decision 3).
- `roles/org.yaml` permits a removal: a `commands` list with no `git rm` matcher is an Igor that
  cannot delete a file, and the refusal arrives after the worker has been paid.
- The four repository settings above.
- The state branch is reachable, and the credential holds the write permission pushing to it
  needs. Reachability is read; **writability is inferred from the permission, never tested by
  writing** — see `design.md`.
- Each role's GitHub identity is an App installed on the repository it claims on, with the
  permissions its `igor:<role>` label and claim comment need. On GitHub every Igor is a GitHub
  App (#156); see `design.md`.

**App support (#156) has merged**, so `doctor` checks Apps only. It has no check of a claiming
account's write access.

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
| `role "x" names no seat` | **a check** of its own, for every role, whether or not any seat is declared (decision 3). The load-time refusal covers only the role you run, and only where seats are declared |
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
  of it took. #112 rewrote that section around `igor init`, and this adds one line to the end
  of it.
- `docs/architecture.md` §5.0.3 is **not** amended to name this as a third command. Its two —
  `role explain` and `igor run --plan` — are both about a role's effective behaviour, inside a
  section titled *What a role actually looks like*. A repository-wiring check is the same
  principle applied to a different subject, so the passage gains one sentence saying the
  principle produced a setup check and where it is documented, and its list stays at two.
