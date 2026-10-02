# Design

Four decisions with live alternatives. The requirements state what must be true; these state
how, and each was a choice rather than the only way.

## The command is `doctor`, not `check` or `verify`

`igor validate` already exists and means *the entries in the store are well-formed*. `check` and
`verify` are near-synonyms of `validate`, and the cost of a near-synonym is not aesthetic: an
operator who runs `igor validate` after setup and reads *"0 invalid entries"* has been told
nothing about their setup and has no reason to suspect it. A second command whose name sounds
like the first is a command people will conflate at the prompt and in documentation.

`doctor` shares none of that surface. It is the ecosystem's word for a read-only diagnostic —
`brew doctor`, `flutter doctor` — so the read-only contract is carried by the name before
anybody reads the help text, which is worth something for a command whose whole value is that
people are willing to run it. And the repository already uses the word for this idea in prose:
`docs/deployment.md`'s table is *"a doctor, written as prose for a person to execute"*, and the
constraint is *"a doctor that mutates is one people are afraid to run"*. Naming the command
after the thing the docs already call it costs no explanation.

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

The same reasoning covers the machine account's write access, which is the row of the
deployment table whose cause is invisible at the moment it bites: the code host accepts the
assignment and drops it. The permission is readable in advance and is the whole of what can be
read without claiming something.

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
unconditionally would train a team to ignore the output. The discriminator is whether any
account other than the one that proposes could approve: where there is none, the setting blocks
promotion outright and it is a finding; where there is one, the check passes and the report
states the consequence, which keeps the report at three states — pass, finding, unchecked — and
the exit status answering one question. Where that cannot be determined — the account list is itself a
credentialled read — the degrade rule applies and it is reported as unchecked, naming what it
would have decided.

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
