# Design

The requirements state what must be true; the sections below state how, where each was a
choice rather than the only way.

## The command is `doctor`, not `check` or `verify`

`igor validate` already exists and means *the entries in the store are well-formed*. `check` and
`verify` are near-synonyms of `validate`, and the cost of a near-synonym is not aesthetic: an
operator who runs `igor validate` after setup and reads *"0 invalid entries"* has been told
nothing about their setup and has no reason to suspect it. A second command whose name sounds
like the first is a command people will conflate at the prompt and in documentation.

`doctor` shares none of that surface. It is the ecosystem's word for a read-only diagnostic —
`brew doctor`, `flutter doctor` — so the read-only contract is carried by the name before
anybody reads the help text, which is worth something for a command whose whole value is that
people are willing to run it. And issue #110, which asks for this command, already uses the
word twice: it calls `docs/deployment.md`'s table *"a doctor, written as prose for a person to
execute"*, and sets the command the constraint that *"a doctor that mutates is one people are
afraid to run"*. Naming the command after what the issue calls it costs no explanation.

Rejected: `igor setup check`, as a subcommand of a `setup` group. It reads well and it makes
room for `setup init` later, but there is no `setup` group today and inventing one to hold a
single command buys nothing; `init` is a sibling in
[#112](https://github.com/adamstallard/igor/pull/112) and neither wants a prefix.

## Read-only, with no `--fix`, and writability read from a permission

The obvious next feature is `--fix`: several findings have a remedy a command *could* perform —
writing the workflow, for one. It is refused at the requirement level rather than deferred,
because the value of this command is that running it is free of consequence. A command that may
change branch protection is one an operator reads the flags of before running on a repository
that matters, and a diagnostic nobody runs casually is a diagnostic that reports nothing. The
remedy a command can perform is named in the finding and typed by the operator, which costs one
line and keeps the blast radius at zero.

That constraint has a consequence worth stating, because it is where a read-only diagnostic gets
quietly broken: **the state branch's writability cannot be tested by writing.** The honest test
of "can this push" is a push, and a push is a mutation. So the check reads the credential's
permission on the repository and reports *that*, and the report says which it established — the
permission, not the push. A permission that says write while a ruleset still refuses the push is
a false pass, and calling the check *writability* would hide that; calling it what it is does
not.

The same reasoning covers whether each role's identity can claim. What a role's App may do on
the repository it claims on is readable in advance, and is the whole of what can be read
without claiming something.

## Three outcomes, and a skip is not a finding

"Non-zero when something is wrong" and "degrade rather than fail" collide, and the collision
lands exactly on the exit status. A check skipped because the credential cannot read a ruleset
is not evidence that anything is wrong — but if a skip exits zero, a repository whose settings
were never read looks the same to CI as one whose settings are correct.

Three alternatives, one chosen:

- **A skip is a finding.** Exits non-zero. Then the first CI run on a repository whose token
  cannot read rulesets is red for a reason that is not a problem with the repository, and the
  usual fix is to stop running the command. Rejected: a diagnostic that cries wolf is uninstalled.
- **A third exit status** — zero clean, one for findings, two for "ran but could not check
  everything". Tempting, and rejected: it makes the common case (some checks need a credential
  this environment does not have) require CI configuration to tolerate, and nothing else in the
  CLI carries a three-valued exit for a caller to have learned from.
- **Chosen: zero unless there is a finding, and the report carries the skips.** A skipped check
  is printed as unchecked with its reason, distinguished in the output from a pass, and a run in
  which everything was skipped says so in place of a clean bill. The exit status answers *is
  something wrong*; the report answers *what did you actually look at*. The one failure mode
  this leaves — a green exit over a run that checked little — is closed by the report refusing
  to render an all-skipped run as clean, which is a requirement rather than a courtesy.

**"Require approvals" is graded rather than absolute** for the same reason. It hard-blocks a
solo maintainer and is unremarkable for a team of four, so reporting it as a finding
unconditionally would train a team to ignore the output. The discriminator is whether enough
people other than the one who opened the pull request could approve: for a rule requiring N
approvals, at least N + 1 people with write access, counting the author. Where there are fewer,
the setting blocks promotion outright, and it is a finding. A rule requiring code owners' review
is graded the same way per path: where one person is the only code owner with write access for a
path, that person's own pull requests touching it can never merge. Lore reaches the default branch only by
pull request (lore-review's *Lore reaches the default branch by pull request*), GitHub lets
nobody approve their own pull request, and an Igor's approval never counts as a person's
(task-execution's *A person approves every Igor pull request*). Where enough people other than
the author could approve, the check passes and the report states that requiring approvals blocks
self-merge. That keeps the report
at three states — pass, finding, unchecked — and the exit status answering one question. Who
could approve is read from the list of people with write access, which leaves Apps out (see
*Every Igor is a GitHub App*, below). Reading that list needs a credential, so where it cannot
be read the degrade rule applies: the check is reported as unchecked, naming the question it
could not answer, whether anyone else could approve.

## Protection is read from whichever surface answers, and the bypass list is the one most likely to skip

"Is the default branch protected" has two answers on GitHub — classic branch protection and
repository rulesets — and they are different endpoints with different permissions. Two facts
shape the design, and both are to be confirmed against the live API in implementation rather
than taken from here:

- The **effective rules** for a branch are readable with ordinary repository access, which is
  what makes checks 1 and 2 cheap and what makes them work for a collaborator rather than only
  for an owner.
- A ruleset's **bypass actor list** is part of the ruleset's own definition, which is
  administrative. So check 4 — the Actions actor on the bypass list — is the check most likely
  to be skipped in practice, on exactly the credential a CI step would use.

That is not a defect to engineer around; it is the case the degrade requirement exists for. The
command reads whichever surface answers, reports the protection state it established and from
where, and where the bypass list is unreadable says so and names the permission it would need,
rather than reporting a bypass list it could not see as correct — which is the one outcome that
would be worse than not checking.

A consequence for implementation order: the protection and bypass checks share a credential and
a set of endpoints, and the cheap local checks (destination, roles, `commands`, workflow file)
share none of it. They are separable, and the local half is worth having on its own where no
credential exists at all.

A pull-request rule administrators can bypass is a finding because an entry pushed straight to
the default branch is never promoted, as lore-review's *Lore reaches the default branch by pull
request* says. The report then does not call the branch protected against direct pushes. Check
4, whether the Actions actor may bypass the protection, still treats the branch as protected:
the bypass is administrators' alone, so the rule still blocks the workflow's actor.

## A role's seat is the one `igor serve` spends, and every role is checked

In `seat-budget`, a role references a seat, or a pool of seats in order. The seat check resolves
that reference, and a role has a seat when it yields at least one declared seat, with budget left
or not. A seat is a subscription a role's model calls are charged to, and what `igor serve` spends.

Where seats are declared, a role with no seat also fails the check that each role resolves. The
report names that role once, not under both the seat check and the resolution check.

Each per-role check covers every role, because `igor run` and `igor serve` check only the role
they run.

## Every Igor is a GitHub App

[#156](https://github.com/adamstallard/igor/pull/156) settles that on GitHub every Igor is a
GitHub App, one per role, which claims an issue with its `igor:<role>` label. Machine users are
not supported. Two checks change.

**The identity check is a check of each role's App.** It is the start-up check `igor run` and
`igor serve` make: the App is installed on every repository the role works and on the lore
repository, with Contents, Issues and Pull requests read and write. A role that claims on Linear
still acts on GitHub as its App, for its pull requests, clones and the state branch, so its App is
checked the same way. Where that check refuses only because the App's credential variables are
missing from `doctor`'s environment, the role's App check is unchecked, naming them; every other
refusal is a finding.

**"Another account could approve" means another person.** An Igor's approval never counts for a
person's (#156), and every Igor pull request needs a person's. An App's bot also reads
`push: false` on the collaborator-permission endpoint (measured 2026-10-04, for
`dependabot[bot]` and `github-actions[bot]`), so a list of collaborators with write access
already leaves the Apps out.

**An identity that is not an App is not reported.** `doctor` does not report a configuration
from before App support, such as a machine user. Only Igor's developers run Igor yet, so such a
check would be code that supports no user.

## A state branch not yet created

`entries/` and the state branch are created when first needed, so right after `igor init` there
is no state branch. That is reported as not yet created, not as a finding, or `doctor` would fail
the setup it is meant to confirm. A state branch that exists and cannot be read is a finding.

## Open Questions

For Adam, each with a recommendation:

- **When the proposal's decision 2 takes effect** (a role with no seat is a finding). The
  in-force `seat-budget` spec lets a deployment that declares no seats run with no budget, and
  calls that a decision. Every role in such a deployment has no seat, so each is a finding and
  `doctor` exits non-zero on every such deployment until #171, built after this change, removes
  the exemption. Such a deployment spends through a stored login, the credentials `claude`
  keeps in a home directory. *Recommended:* let decision 2 stand from the day `doctor` ships,
  since #171 and #175 already decided that Igor never runs on a stored login.
- **How `doctor` reads every role's App.** A role's App key is read only from the environment of
  the process running that role, such as its environment file `/etc/igor/<role>.env`, so one
  `doctor` process holds at most one role's key. Whether any other
  credential, such as an organization owner's token, can read every installation's permissions
  is unmeasured (task 3.7). *Recommended, if only the App's own key can:* on the host where
  `igor serve` runs, run `doctor` once per role with that role's environment file
  (`/etc/igor/<role>.env`); elsewhere each App check is unchecked, naming the missing key.
- **App keys in CI.** Running the App check in CI would put every role's private key in the lore
  repository's Actions secrets, where repository code can reach them. *Recommended:* place no
  App key in CI; there the App checks are reported unchecked.
- **Which principal the state-branch check reads.** An Igor pushes to the state branch as its App
  (surface-adapter), so the permission of a person's `gh` login or a CI token, which the spec
  calls the credential, says little; in CI, `GITHUB_TOKEN` reads as having no push permission, so
  the check would always fail there. A person's permission matters only to `igor observe`, the
  one command that writes the state branch as the person. Until this is decided, the spec reads
  the credential. *Recommended:* the state-branch check reads each role's App's permission instead, with the App
  check.
- **A lore repository used only through `igor run`.** Under #171, `igor run` spends a token from
  the developer's own environment and needs no seat file, but this change reports every role with
  no seat, so `doctor` always exits non-zero there. *Recommended:* keep the finding; such a
  repository can skip `doctor` in CI.
- **Required approvals against lore-review.** Decision 7 passes a branch that requires approvals
  wherever enough people could approve, while lore-review says *"Require approvals" SHALL NOT be
  recommended* and the README says not to enable it. *Recommended:* keep the pass, since the
  report still says requiring approvals blocks self-merge, and `doctor` recommends nothing.
- **Repository names in public CI logs.** App-check findings name the repositories a role works,
  which may be private. In CI on a public lore repository, the log is public, so the name leaks.
  *Recommended:* when the run is in CI and the lore repository is public, refer to a private
  repository by its position in the role's list, not by its name.

For other changes' authors:

- **Which identity `doctor` acts as.** surface-adapter lists the commands that take no role and
  act as a person, and the list does not include `doctor`; #171's `surface-adapter` delta adds it. #171 builds after
  this change, so until it lands no requirement names `doctor`'s identity. Whether this change
  adds `doctor` to that list, or #171 alone does, is for this change's authors and #171's.
- **#150's task 2.5** relies on `doctor` reporting a role whose identity is not an App, which
  the proposal's decision 1 rules out. #150 is to drop or replace it.

Facts not yet measured, each with a task:

- Which endpoints answer with which permission (task 3.1).
- Where an installation's permissions can be read, and with which credential (task 3.7).
- Which report lines the Actions runner parses as workflow commands, with leading whitespace and
  in the `##[` form (task 2.9).
