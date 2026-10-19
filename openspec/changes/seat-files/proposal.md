## Decisions

1. **One file per seat, `seats/<id>.yaml`, and pools are dropped** (Adam, 2026-09-28). The
   lender's own pull request adds the file, naming the roles the seat serves and its reserve.
2. **A lent token travels as age ciphertext in the seat file**, encrypted to
   `seats/recipient.txt` and decrypted with the private key `seatKey` names (Adam, 2026-10-11).
   *Rejected:* GitHub secrets delivered by a deploy workflow on a self-hosted runner, the
   2026-09-28 model: on a public repository a fork's pull request can run its own self-hosted
   workflow on the server. `design.md` lists the other options and why each was rejected.
3. **The lender's control is their token** (Adam, 2026-10-11). Revoking it at Anthropic stops the
   seat, and that is their veto over anything the operator does with it. *Rejected:* a
   CODEOWNERS line per seat file with code-owner review required, which needs administrator
   settings, checks that they stay on, and a stand-in for a lender with no GitHub account.
4. **An operator's own seat may name `token_env`, fixed to `IGOR_SEAT_<ID>`; `token_command` and
   `token_file` are refused in a seat file** (Adam, 2026-10-04 and 2026-10-11). A free variable
   name could hand `claude` the GitHub token, or spend another seat under this one's id.
5. **A role draws on the seat with the most headroom**; ties go to the soonest week reset, then
   the seat id (Adam, 2026-10-04, #147). A role naming `seat: x` is refused unless `seats/x.yaml`
   lists it. *Rejected:* keeping pools or an `order` key, which brings back an ordering the
   lender never stated.
6. **A pull request changing a seat file @-mentions its owner**, through
   `templates/seat-notice.yml`, which `igor init` installs (Adam, 2026-10-11). It runs only on
   `pull_request_target` (decision 26), on every pull request (decision 46), on GitHub-hosted
   runners, and takes nothing from the pull request's head but the names of the paths it changes.
   *Rejected:* a pull request template line, CODEOWNERS
   without review, the `pull_request` trigger, a self-hosted runner, and Igor commenting on open
   lore pull requests (`design.md`). The before-merge comment is the workflow's; Igor posts its
   own notice only after a seat-file change lands and Igor pulls it (`lore-pull`, #208, for #176).
7. **`igor doctor` reports a missing `seat-notice.yml`, and a server private key (`seatKey`) whose
   public half does not match `seats/recipient.txt`** (Adam, 2026-10-11). A change to
   `recipient.txt` notifies no lender, because it changes no token already on the server; each
   lender meets the new key when they next rotate.
8. **Smaller choices, which Adam accepted as `design.md` proposed them** (2026-10-11): the
   ciphertext is base64 on one line, made with the `age-encryption` package, so a lender needs no
   `age` binary; a seat id is lowercase letters, digits and hyphens; `roles` is required and may be
   empty; a role name with no role file is refused; the config key is `seatKey`; a role's own
   `reserve` key, which #143 adds, stays on the role; `work-triage` says "the seats serving a role"
   in place of "pool".
9. **No code handles a configuration written before seat files** (Adam, 2026-10-11): no migration,
   and no message for a leftover `budget` or `pools`, since Igor has no users yet. `igor-lore`'s
   one seat is moved by hand (task 6.1).

10. **A seat file must name its token** (Adam, 2026-10-17). One naming neither `encrypted_token`
    nor `token_env` is refused; since decision 67 that takes its seat out rather than failing the
    configuration. *Rejected:* allowing it behind a flag the operator sets.
    Such a file would spend whatever login the server holds, which can be a pay-per-use API key.
11. **Worker-user (#175) is built before this change** (Adam, 2026-10-17). A worker running as
    the server's own user could read `seatKey` and decrypt every lender's token. #175's start-up
    probe checks, as the worker user, that the worker cannot read the Igor's credentials; this
    change adds the file `seatKey` names to what it checks (task 8.4).
12. **`igor seat add` and `igor doctor` check that `owner` is a GitHub login**, with
    `gh api users/<owner>` (Adam, 2026-10-17), because the notice workflow can mention only a
    GitHub login.
13. **A plain token pasted into a pull request is public before Igor can refuse it, and that is
    accepted** (Adam, 2026-10-17). The notice workflow must not read the pull request's head, so
    nothing can catch it there. The lender guide says so (task 9.5).
14. **The lore repository's default branch requires a pull request before merging** (Adam,
    2026-10-17), so the lender is told of a change to their seat file made through a pull
    request before it lands. `check-a-lore-repository` (#113) reports a default branch that does
    not require one. GitHub Actions may still push past the rule, so that the reconciliation
    workflow can commit merged lore. A seat-file change can arrive that way only if a workflow
    with that bypass writes one. A seat file changed that way reaches the lender only
    through Igor's notice, the comment Igor posts mentioning the owner once it pulls the change
    into its lore checkout (decision 26; `lore-pull`, #208); one added, deleted or renamed
    that way reaches them through nothing, since #208 gives those no notice.
15. **An undecryptable seat is passed over where the role has another usable seat** (Adam,
    2026-10-17). Under #101 it would otherwise stop every role its file lists. This decision states
    the whole rule for a role with no eligible seat, as it and decisions 25, 31 and 33 settle it: the
    role stops, as #101 says (task 11.3), only when every seat serving it is under an open
    condition and none of those is a read-cleared condition, such as a seat whose file Igor could
    not decrypt. In every other case it hands off each item, naming each condition. A stopped
    role's process keeps running (decision 33).
16. **The `dedicated` seat key is dropped** (Adam, 2026-10-17). After #143 any seat may keep a
    reserve, and choice by most headroom already spends a reserve-0 seat first. This change
    restates #143's *A role may hold back more of a seat than the seat does* to say "a seat at
    reserve 0" where #143 says "a dedicated seat". Its scenario keeps the title *A role reserve
    with a dedicated seat is valid*, because openspec will not rename an in-force scenario, and
    reads "dedicated" as plain English for a seat no person uses.
17. **Nothing keeps running on a seat holder's machine** (Adam, 2026-10-17): no runner, daemon or
    scheduled job. This rules out a runner per lender, which `design.md` rejects for delivering
    the token, and allows `igor seat add`, a one-off command the lender chooses to run.
18. **Revocation speed is not measured** (Adam, 2026-10-17). The lender guide says revoking the
    token is how a lender withdraws, and promises no speed.
19. **Igor is published to npm in this change** (Adam, 2026-10-17): package `igor-agent`, `bin`
    `igor`, its description the README's opening line verbatim (#27). `package.json` declares
    `files` and `engines: node >= 26`. Publishing is a tag-triggered workflow on GitHub-hosted
    runners using **npm trusted publishing (OIDC)**, so no npm token is stored anywhere and
    provenance is built in (Adam, 2026-10-17). *Rejected:* an npm token held as a repository
    secret, which any writer could read and use to publish `igor-agent`, which lenders run
    through `npx`. Before publishing, a **licence check covers both the package's own licence
    field and every dependency's licence**, against an allowlist, and fails the release otherwise
    (Adam, 2026-10-17). Section 12 of `tasks.md` holds the work.
20. **The keys are X25519 keys in age's format** (Adam, 2026-10-17).
21. **The lender guide documents one path, `npx igor-agent seat add`**, with Node and a
    signed-in `gh` as the prerequisites (Adam, 2026-10-17; the `gh` prerequisite is decision 22). It has no manual `age` section and no route through a clone.
22. **`igor seat add` requires `gh`, installed and signed in, and opens the pull request
    through it** (Adam, 2026-10-17). Without `gh` it refuses. Igor never holds the lender's GitHub
    credentials: `gh` keeps its own login. *Rejected:* opening GitHub's prefilled new-file link
    where `gh` is missing, which still needed `gh` or a clone to find the lore repository, the
    holder's login and the public key, and could not replace an existing file for a rotation.
23. **Igor refuses to decrypt a lent seat where the worker runs as the Igor's own user** (Adam,
    2026-10-17). Under `igor run`, the one command where #175 runs the worker as the Igor's own user, a worker could read
    `seatKey` and so every lent token. Lending requires the worker-user setup of #175. Decision
    39 has `igor run` spend only its own token, so today no lent seat reaches `igor run` anyway;
    this decision stays as the rule for any future command where the worker runs as the Igor's
    own user: Igor decrypts no lent seat there.
24. **A lender needs a GitHub account to lend for themselves, and that is accepted** (Adam,
    2026-10-17). Someone without one lends through the operator, whose login is then the seat
    file's `owner`. That `gh api users/<owner>` proves a login exists, not that it is the
    holder's, is accepted too.
25. **A role with no eligible seat, where some seats are under an open condition and the rest are
    at their reserve lines, hands off, naming the condition in the handoff** (Adam, 2026-10-17).
    Decision 15 states the whole rule.
26. **The notice workflow has no `push` trigger; `seat-notice.yml` runs on `pull_request_target`
    only** (Adam, 2026-10-17). The only notice after a
    change lands comes from Igor, when it pulls the lore change (`lore-pull`, #208). *Rejected:* a push trigger
    as well, which would mention a lender twice for one change, and which GitHub does not start
    for a push made with a workflow's own `GITHUB_TOKEN`, the commit it was meant to catch.
27. **`igor doctor` (#113, `check-a-lore-repository`) is built before this change** (Adam,
    2026-10-17). Decisions 12 and 14 and section 8 of `tasks.md` add to the command #113 builds.
28. **`igor seat add` takes `--lore <owner/repo>`, required outside a clone and inferred inside
    one** (Adam, 2026-10-17). Outside a clone it commits the seat file and opens the pull request
    through the GitHub API with `gh`, with no local clone. Inside a clone it commits on a new
    branch and opens the pull request with `gh`. Either way `gh` is required (decision 22).
29. **A lent seat whose file the server cannot decrypt is ineligible** (Adam, 2026-10-17): seat
    choice never picks it, and #143's probe skips it. It is under a condition on the seat, as
    every seat whose token cannot be read is. For a wrong key or a corrupt file, that
    condition names the seat and says its lender re-lends it, and `igor budget` names the lender
    (decision 58); for a missing `seatKey` or
    an unreadable key file it names the key, whose cure is the operator's. Decision 31 says how
    the condition opens and clears. A lent seat left undecrypted because the worker runs as the Igor's own user (decision
    23) is ineligible and skipped by the probe the same way; there is no fault in its file, so it
    raises no condition. Since decision 39, `igor run` spends no seat file's seat, so no role
    under `igor run` hands off for want of one.
30. **The licence allowlist of decision 19 is MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0,
    0BSD, CC0-1.0, Unlicense and BlueOak-1.0.0** (Adam, 2026-10-17). Any other licence, copyleft
    included, fails the release until someone adds it to the list on purpose.
31. **An undecryptable seat's condition is tied to reading seat files** (Adam, 2026-10-17). Igor
    opens the condition when it fails to decrypt a seat file, at start and at each cycle start, where #179
    rereads the configuration and #208 makes its lore read, and clears it when a later read decrypts the file.
    A role with no other usable seat hands off rather than stops, and the handoff names the
    condition. It states no moment when the seat's reserve line will cross its usage reading,
    since the seat may have no reading (decision 63). Being read-cleared, such a condition never
    stops a role; decision 15 states the resulting rule.
    *Rejected:* #101's way of opening and clearing a seat condition, from recurring handoffs and
    from #143's probe, which never reach a seat that is never picked or probed.

32. **This change amends #101 (`condition-backoff`) through its own delta** (Adam, 2026-10-17).
    #101 merges as it is, and this change archives after it, in the order issue #204 holds,
    the one place the archive order across the open changes is stated. This change's `stuck-conditions` delta therefore carries a `MODIFIED` block on
    #101's *A condition that recurs stops the affected scope from taking new work*, written from
    that requirement's text on #101's branch. #101 lets one condition open on its first
    occurrence, a refused GitHub App credential. The block adds decision 31's condition as a
    second, which clears on a good read of the seat file rather than on a probe item.
    *Rejected:* editing #101's own branch, which already carries #101's implementation and is
    to merge as it is.
33. **`igor serve` never exits at runtime because of a condition** (Adam, 2026-10-18), whether it
    is on a seat, on the role (such as a command the role's `commands` refused, under #101), or
    on the Igor's GitHub App credential. #82 (`stopped-scope-visible`) specifies this. A role
    whose seats are all under open conditions takes no work; decisions 15 and 25 and #101 call
    this stopping. Its process keeps polling, probes on #101's cooldown and reports what is
    stopped. A role whose only seats are undecryptable keeps polling and hands off each item
    (decisions 31 and 63).

34. **A removed seat file always takes effect** (Adam, 2026-10-18). When a lore pull removes a
    seat file, the removal applies even if the rest of the pull is refused for failing the
    startup checks, a refusal Adam decided the same day and #176's body records. Igor drops the
    seat's decrypted token from memory, gives the seat to no new worker, and kills any worker
    using it, the `claude -p` child and every process its worker user owns, handing off each
    item. The Igor process keeps running. Igor cannot recall copies: a worker that held the
    token could have saved or sent it, and the encrypted file stays in git history. So the
    lender guide says that revoking the token is the only real withdrawal. The removal applies at
    the next cycle start's read. Until `lore-pull` (#208) pulls the checkout, a seat file leaves
    the checkout only when someone updates it by hand. Decision 36 covers removing the last seat file.
35. **A decrypted seat token never touches the server's disk** (Adam, 2026-10-18). It is held in
    Igor's memory only, and reaches a worker only through that worker's environment; no log,
    state-branch file, condition report, error message or crash output carries it.

36. **Every seat has a Claude token, and Igor never uses a stored Claude login** (Adam,
    2026-10-18), under `igor serve` and `igor run` alike. A stored login is the credentials
    `claude` keeps in a home directory. Adam's words: "Creating a token is trivial and clear
    steps should be in the docs. The agent can also prompt the user through the steps." So the
    guides give the steps for creating a token with `claude setup-token` (tasks 9.3 and 9.5),
    `igor seat add` prints those steps before it reads the token (task 7.2), and an
    organization with no lenders declares one seat from its own token (task 9.3). A
    configuration with no seat files gives no role a seat, so each role is refused at load and
    `igor serve` refuses to start. Before this decision such a configuration ran on the server's
    login with no seat budget enforced. When a pull removes the last seat
    file serving a role, the role has no usable seat: its process hands off the items its
    workers held, takes no new item and keeps running, and never falls back to a login. The
    reset of a worker's home that #174 (`pinned-skills`) specifies replaces `~/.claude` and
    `~/.claude.json` whole, so no worker's home keeps a stored login; #174 and #175
    (`worker-user`) carry that on their own branches.
    *Rejected:* exempting an organization that declares no seats, which ran on whatever login
    the server held.
37. **Seat files are decrypted only when Igor reads its lore checkout** (Adam, 2026-10-18): at
    start, and at each cycle start (#179's reread, and #208's lore read). Starting a worker or a probe decrypts
    nothing; it is given the plaintext Igor holds from its last read, so no decryption can fail
    when a worker is spawned.
38. **Decision 31's condition is the first of a kind, the read-cleared condition** (Adam,
    2026-10-18): opened by a read that fails, cleared by a later read that passes, never by a
    probe item, and stopping nothing by itself. The `stuck-conditions` delta defines the kind
    once, in *A read-cleared condition opens on a failing read and clears on a passing one*.
    `lore-pull` (#208) cites it for a configuration that fails the startup checks on a running
    process's lore read, and #82 (`stopped-scope-visible`) lists a passing read among the ways a
    condition clears. This change's block on #101's *A condition clears by not recurring, and a
    probe is what observes that* exempts the kind from the probe item. Decision 31's condition,
    on a seat, has the cure key `seat:<id>:decrypt`. *Rejected:* each change restating how its condition opens and clears.
39. **`igor run` spends a token from its own environment, `IGOR_RUN_TOKEN`, as an implicit local
    seat** (Adam, 2026-10-18). Nothing about it goes in the lore repository, no seat file needs
    to list the role, and lent seats are never used. Without the variable, `igor run` refuses to
    start, naming it. Requirement *`igor run` spends its own token as an implicit
    local seat*; task 3.8.
    Three details are not in Adam's words of 2026-10-18; this change inferred them, and Adam
    confirmed them on 2026-10-19: `igor run` draws on
    no `token_env` seat either; the implicit seat's id is `_run`, which no seat file can have;
    and its reserve is 0, with no role's `reserve` applied under `igor run`.
    *Rejected:* a `token_env` seat file of the developer's own, either in the shared lore
    repository, where every reader sees it, or in a lore repository of the developer's own, which
    the developer would have to keep in step with the team's.
40. **A lent ciphertext is bound to its seat** (Adam, 2026-10-18). `igor seat add` encrypts
    `<seat-id>:<token>`. On decrypting, Igor refuses a seat whose plaintext names an id other
    than its file's, or none, and raises the read-cleared condition `seat:<id>:decrypt`, as for
    any seat it cannot decrypt. Ciphertext copied into another seat file, with other roles and
    `reserve: 0`, then spends nothing. *A seat's token travels as ciphertext in its file* and
    *`igor seat add` lends a seat in one step*; tasks 3.3 and 7.2. *Rejected:* refusing two seats
    whose tokens decrypt equal, which catches a copy only while the original file still exists.
41. **This change carries #143's probe exclusions** (Adam, 2026-10-18), as a `MODIFIED` block on
    #143's *A seat nothing has read is probed on the Igor server with its own token*, copied
    from #143's latest text (b387034) with its scenarios kept. It also adds two scenarios that
    #143 chose to leave to this block rather than add itself: a probe's environment holds only the seat's token, and a probe that exits
    with an error is not retried at once. The probe skips a seat Igor could not decrypt,
    and `igor run` makes no probe. This change archives after #143 (decision 32), so the block
    applies to #143's requirement once it is in force. Task 3.11.
42. **#174's startup skills check spends a seat through the gate, as an ordinary call** (Adam,
    2026-10-18). The gate is the budget check that chooses which seat a model call is charged to.
    The seat probe and #143's live `/usage` read stay the only calls the gate does not choose a seat
    for, each charged to the seat it reads, until the `/usage` read is removed (decision 64). *A spend
    with no seat behind it is not made*; task 3.10. *Rejected:* a second exception for the
    startup check.
43. **`igor doctor` invokes the configuration's validation, which reads no secret, and reports
    its findings, each named with its source** (Adam, 2026-10-18). Among them is a seat file
    carrying `encrypted_token` where no `seatKey` is declared, which the validation reports and
    `doctor` no longer checks itself. #113 records that `doctor` may invoke an existing check and
    never re-implements one. *A seat's token travels as ciphertext in its file*; the
    `setup-check` delta; task 8.3.
44. **Two rules confirmed** (Adam, 2026-10-18): the notice workflow does not mention a lender on
    a seat-file pull request they opened themselves, for their own opening or push, since they
    know of their own change; and an `encrypted_token` that is not age
    ciphertext, such as a plain token pasted there, is refused at load, telling the holder to
    revoke it. *A pull request that changes a seat file mentions that seat's owner* and *A seat's
    token travels as ciphertext in its file*.
45. **Under `igor run`, Claude Code's own preference for a stored login is accepted** (Adam,
    2026-10-18): had Claude Code preferred a stored login on the developer's machine over the
    token Igor passes, the call would spend the developer's own login and quota, and Igor would
    neither hide the login with `HOME` nor refuse. #174's task 0.3 measured it on Claude Code
    2.1.303 (#174's `design.md`, *Measured before building, 2026-10-18 (task 0.3)*): a valid token
    beside a stored login spends the token's seat, and an invalid one fails rather than reaching
    the login, so the case does not arise. Under `igor serve` the operator guide signs no `claude`
    in as the service user, so no stored login exists there; task 3.12 confirms it before gate two
    (decision 68). *A spend with no seat
    behind it is not made*; tasks 3.10 and 3.12.
46. **The notice workflow runs on every pull request, with no `paths` filter** (Adam,
    2026-10-18). It lists the seat files a pull request changes with `git diff --name-only`
    between the pull request's base and head, after fetching the pull request's commits as git
    data, and runs nothing from them, so `pull_request_target` stays safe. Task 10.7 measured
    that GitHub's path filter misses a seat file sorting after a pull request's first 3,000
    files, which would let a padded pull request hide a change from its lender (`design.md`,
    *The lender hears about a change to their seat file*). *Rejected:* keeping the filter and
    documenting the gap.

Smaller choices this change makes, which Adam approves with it:

47. **A seat's headroom is the smaller of its two windows' headroom.** Where a seat may be drawn
    on with no reading, because its line's reserve is 0, a window with no unreset reading counts
    as 0% used. A seat with no known week
    reset sorts after every seat with one in a tie, and seats still tied go in id order.
48. **A report shows only inert text from a seat file.** `igor budget` shows an `owner` only
    where it has a GitHub login's form; any other `owner` is reported as not a GitHub login, with
    none of its text. A condition report names no `owner` at all (decision 58). Anyone can encrypt
    any text to the public key, so the id a mismatched plaintext names appears only where it has
    a seat id's form.
49. **A read appends a condition row only when it opens or clears a read-cleared condition**,
    not on every read. The `stuck-conditions` definition states it for every such condition.
50. **Inside a clone, `igor seat add` takes the lore repository from the `upstream` remote, or
    `origin` where there is none**, so a holder working in a fork's clone opens the pull request
    against the team's repository.
51. **A command a person runs that cannot read the server's key shows a lent seat as not
    checked**, never as unreadable because of its own failed read, such as `igor budget` run by an operator
    other than the service user. Where the execution log holds an open `seat:<id>:decrypt`, the
    seat's line also names that condition, as #82 says. Where the command can read the key, it
    may decrypt the seat files in its own process to report them, opening and clearing nothing.
52. **The validation's finding of ciphertext with no `seatKey` does not fail the
    configuration.** Igor starts, and the seat is under a condition naming the key (decision 29),
    so a role with another seat keeps working.
53. **`owner` is optional in a seat file.** A file without one is accepted; no change to it
    mentions anyone, and its condition report says the operator re-lends the seat or removes the
    file.
54. **A `seatKey` inside the lore checkout is refused at load.** A key there is either committed,
    and so public, or discarded when `lore-pull` (#208) resets the checkout to a commit.
55. **`igor seat add` prints the lore repository it will use before reading the token**, and
    which remote it came from where it inferred it, so a clone whose `upstream` points elsewhere
    does not receive the token unnoticed.
56. **`igor doctor` reports an `owner` that is an organization**, whose mention notifies nobody,
    and a notice workflow whose most recent run failed.

Adam's answers of 2026-10-19 to the questions this change left open:

57. **A lore read at every cycle start is approved, through #208's rule.** Decision 37 limits
    decryption to lore reads, and #208 makes one at every cycle start, even with no new commit,
    so a repaired key file clears its condition within a cycle. This change keeps citing #208
    for it.
58. **A lender's login appears only in `igor doctor` and `igor budget`.** Handoffs and condition
    reports on items name only the seat id, even where the lore repository is private, since a
    handoff may sit on a public issue. *A seat's token travels as ciphertext in its file*.
59. **If npm trusted publishing cannot make the first publish of `igor-agent`, Adam makes that
    one publish by hand.** Task 12.3.
60. **A process holding no token for a seat reads that seat's file, a lore read, before using
    it.** A condition is shared by every Igor process, but a decrypted token is not, so a
    condition another process's passing read cleared could otherwise have this process use a seat
    it cannot decrypt. *A seat's token travels as ciphertext in its file*; task 3.9a.
61. **A lender revokes a `setup-token` through the claude.ai web interface.** Adam named the
    interface, not the exact page. The lender guide says so (tasks 1.2, 9.4 and 9.7).
62. **Task 10.8 is dropped.** `git diff --name-only` with a `seats/` pathspec filters by path
    itself and never pages through the pull request's other files; the 3,000-file limit task 10.7
    found belongs only to GitHub's `paths:` filter and its files API. The test made when the
    workflow is built uses an ordinary small pull request that changes a seat file (task 10.9).
63. **A role whose only seats are undecryptable makes a condition handoff:** it names the
    condition and its cure, re-lending the seat or fixing the key, with no return time. It hands
    off rather than stops. A condition handoff is not a budget handoff, so graceful-handoff's *A
    budget handoff states when capacity returns* needs no `MODIFIED` block. *A role draws on the
    seat with the most headroom*.
64. **#143's live `/usage` read is removed in the first change built after this one's code**
    (Adam, on #143). Until then this change's spend requirement keeps listing it, beside the
    probe, as the second call the gate does not choose a seat for.
65. **`igor run` refuses to start where it can read the file `seatKey` names**, since its worker
    runs as the same user and could read every lent token without Igor. *A lent seat is decrypted
    only where the worker has a user of its own*; task 3.8a.
66. **The notice workflow mentions an owner on every push that changes their seat file.** The
    once-per-pull-request rule goes, and with it the check of earlier comments for the workflow's
    marker, which a writer's own `pull_request` workflow, posting as `github-actions[bot]` from a
    branch of the lore repository, could forge. *A pull request that changes a seat file mentions
    that seat's owner*; task 10.1.
67. **A malformed seat file takes only its own seat out**, under a read-cleared condition naming
    the file, and fails nothing else. A plain token pasted into `encrypted_token` stays a refusal
    of the whole configuration, the one place its holder is told to revoke it. *A malformed seat
    file takes only its own seat out*; task 2.2a.
68. **Task 3.12 is confirmed before gate two**, the review of the implementation: on a server set up by the operator guide, the
    service user's home holds no stored Claude login.
69. **`igor seat add` prompts for `--reserve` and `--roles` when they are left out**, explaining
    each. *`igor seat add` lends a seat in one step*; task 7.1b.

More smaller choices, which Adam approves with the change:

70. **What counts as a push changing a seat file** (decision 66). On a push, the workflow compares
    the pull request's head before and after it. Where the earlier head cannot be fetched, as
    after some force-pushes, it compares the base and the new head, which may mention an owner
    whose file that push left alone. On every other event it compares base and head. An edit that
    leaves the base branch unchanged, such as a new title, mentions nobody.
71. **A re-read under decision 60 that fails opens nothing**, unlike any other failing read: the
    process passes the seat over for itself only, and re-reads at most once a cycle. Another
    process's passing read has just shown the file decrypts, so reopening the shared condition
    would take the seat from every process holding a good token, and the two would reopen and
    clear it in turn while they disagree. They disagree mostly while one has applied a newer lore
    commit than the other, which lasts until the other's next cycle.
72. **How a malformed seat file is keyed and reported** (decision 67). Its condition is
    `seat:<id>:file`; every file whose name is not a seat id shares one condition,
    `seats:filename`. A condition report names the file and says it is malformed, with no other
    text from it. The refusal's own text, naming the key or value at fault, is shown by the
    validation, so by `igor doctor`, and by `igor budget`. Where a malformed file's `roles` cannot
    be read, Igor cannot tell which roles it serves, so while one is present a role that no other
    seat file lists hands off rather than being refused at load.
73. **Every role whose seats are all under conditions, and that does not stop, makes a
    condition handoff** (decision 63). Adam's answer named a role whose only seats are
    undecryptable. The same handoff serves any mix in which every seat is under a condition and
    at least one is read-cleared, since no reset brings any of them back.

**Still open,** besides the smaller choices 47 to 56 and 70 to 73, which Adam approves or
rejects with the change:

- **Old ciphertext can bring a deleted seat back, for Adam.** A lender who withdraws by having
  their seat file deleted, without revoking the token, leaves its ciphertext in git history.
  Anyone can add `seats/<id>.yaml` again under the same id with that ciphertext and new `roles`
  and `reserve`; the notice workflow mentions nobody, since the default branch has no copy, and
  Igor decrypts and spends the token. Binding the ciphertext to its id (decision 40) does not
  stop it, and task 9.7's line that removing the file "only stops Igor's own use" overstates
  even that. *Recommendation:* task 9.7's line says instead that a removed file can be added
  back from history, so only revoking stops Igor's use; and the operator guide tells an
  operator to check that a new seat file's ciphertext is not one already in history.
- **Administrators can push past the pull-request rule, for Adam.** Decision 14 names only the
  Actions bypass, but under GitHub's default branch protection an administrator may also push
  to the default branch directly, so a seat-file change lands with no notice before it, and
  #113's check still reports the branch as protected. *Recommendation:* #113's check also
  reports a rule administrators may bypass.
- **Whether revoking at claude.ai stops the token is unmeasured.** Adam named where a lender
  revokes (decision 61), not whether a revoked `setup-token` is then refused; the lender's veto
  (decision 3) rests on both. *Recommendation:* measure it before gate two (task 1.3): revoke a
  test token at claude.ai and confirm a call with it is refused.

Pulling the lore checkout is specified by the open change `lore-pull` (#208, for #176), which
archives after this one. It defines a *lore read*: a process loading its configuration, role
files and seat files from one commit. #179's reread at each cycle start is one too. Until #208
pulls the checkout, the seat files change only when someone updates the checkout by hand.

## Why

A seat is someone's Claude subscription. Whether lending one to a team's Igors fits Anthropic's
terms turns on whether usage on the seat stays its owner's, directed by them, or is someone else
driving it (`code.claude.com/docs/en/legal-and-compliance`). Directing your seat is like directing
your own agent to work on what your teammates file: the use is still yours, set by standing
instructions.

Two things make that true here, and neither depends on a review rule:

- **The lender states the terms themselves, in a pull request of their own.** It adds
  `seats/<id>.yaml`, which names the roles their seat serves and the `reserve` it keeps. The
  operator merges it. Today every seat lives in the one `igor.config.yaml`, which the operator
  writes, and which roles draw on a seat follows from pool membership the lender never sees.
- **The lender can revoke their token at any time, and that stops the seat.** It is their
  veto over anything the operator does with the seat afterwards, including an edit to their file
  they did not want. Withdrawing and objecting are the same act: revoking the token at Anthropic.

The token has to reach the server too. Today a holder sends their `setup-token` to the operator
over a trusted channel, which every team improvises. This change makes lending one pull request:
the holder encrypts the token to the server's public key and puts the ciphertext in their seat
file, so only the server can read it, and they can open the pull request from a fork.

Tracked in [#148](https://github.com/adamstallard/igor/issues/148), with the seat-choice rule
from [#147](https://github.com/adamstallard/igor/issues/147).

## What Changes

- **Every seat is a file, `seats/<id>.yaml`, in the lore repository**, the way a role is
  `roles/<name>.yaml`. The filename is the seat's id. It declares the holder (`owner`), the
  `reserve`, the `roles` it serves, and its token, which every seat file must name.
- **Every model call is paid by a seat's token.** Igor never uses a stored Claude login. An
  organization with no lenders declares one seat from its own token, and under `igor serve` a
  configuration with no seat files refuses each role at load. `igor run` spends the token in
  `IGOR_RUN_TOKEN` instead, as an implicit local seat. Removing the last seat file serving a role leaves the
  role with no usable seat, and the role hands off; nothing falls back to a login.
- **A lent token is decrypted only when Igor reads its lore checkout**, at start and on a pull,
  never when it starts a worker.
- **`budget` leaves `igor.config.yaml`.** Seats are read from `seats/`, and pools are gone, so the
  mapping has nothing left in it.
- **A lent seat's token travels as ciphertext in its file**, as `encrypted_token`, encrypted with
  age to the public key committed as `seats/recipient.txt`. Igor decrypts it with the private key
  whose path `igor.config.yaml` names as `seatKey`. Delivering the token needs no GitHub secret,
  workflow or runner. The private key is the whole protection, and the operator guide treats it
  so.
- **An operator's own seat may name `token_env` instead**, which must be `IGOR_SEAT_` plus the
  seat's id, for a token the operator puts in the server's env file. `token_command` and
  `token_file` are refused in a seat file, naming the key. Neither remaining form runs or reads
  anything else, so Igor never needs to know who wrote a seat file.
- **Pools are removed.** A role's seats are every seat whose file lists it. Among those it can
  use, the Igor picks the one with the most headroom under its line, and the soonest weekly reset
  breaks a tie. A role may still name a single seat, which must list it.
- **A pull request that changes a seat file mentions its owner**, through a workflow `igor init`
  installs, so the lender hears of a change in time to revoke. It runs on `pull_request_target`
  for every pull request, on GitHub-hosted runners, and takes only the names of changed paths
  from the pull request's head. Igor's own notice after a change lands comes with pulling the
  lore checkout (#208, for #176), which this change does not build.
- **`igor seat add`** lends a seat in one step: it reads the token without echoing it, encrypts
  it, writes the seat file, and opens the pull request through `gh`, which it requires. Run
  again, it rotates the token.
- **Igor is published to npm as `igor-agent`**, so a lender runs `npx igor-agent seat add` with
  nothing installed but Node and a signed-in `gh`.
- **The `work-triage` requirements stop saying "pool"**, and speak of the seats serving a role.
- **Docs for both sides.** The operator guide in `docs/deployment.md`; the lender guide in
  `docs/seats.md`, which says what a lender trusts the operator with and that revoking the token
  is how they withdraw or object. The lender guide documents one path, `npx igor-agent seat add`.

## Capabilities

### New Capabilities

None. `setup-check` gains requirements here. `check-a-lore-repository` (#113) creates it, since
it archives first.

### Modified Capabilities

- `seat-budget`: seats come from seat files, the token from ciphertext in the file or the seat's
  own variable. Pools and the budget mapping's key checks are removed. Seat choice is by headroom.
  #143's role-reserve requirement is restated without the `dedicated` key, and #143's probe
  requirement skips an undecryptable seat and makes no probe under `igor run`. `igor run` spends
  only `IGOR_RUN_TOKEN`, as an implicit local seat, and a lent ciphertext is bound to its seat. The spend requirement
  is removed and re-added under a new name, without its scenario of a seat naming no token or
  its exemption for an organization with no seats, because openspec will not apply a `MODIFIED`
  block that drops a scenario. A lent token is decrypted only when the seat files are read. A
  malformed seat file takes only its own seat out, and `igor run` refuses where it can read the
  server's key.
- `work-triage`: the model-stage and untriaged-reporting requirements are worded for the seats
  serving a role instead of a pool. Two are re-added under new names, because their scenario names
  said "pool".
- `setup-check`: `igor doctor` reports whether the committed public key matches the server's
  private key, whether a seat carries ciphertext while no `seatKey` is declared, and whether the
  seat-notice workflow is on the default branch.
- `task-execution`: the worker-environment requirement says a seat's token comes from its
  variable or is decrypted from its file; a token file and a token command are gone. It is removed
  and re-added under its full name, "…but its seat's token" (the in-force name stops at "its
  seat's"), because openspec will not apply a `MODIFIED` block that drops an in-force scenario,
  and the file-and-command scenario must go.
- `lore-store`: `igor init` also writes the seat-notice workflow, and its force option counts
  five targets.
- `surface-adapter`: `doctor` and `seat` join the commands that take no role and keep the person's own `gh`
  login, in *On GitHub, every call an Igor makes acts as its App*. The block is written over
  #143's, which drops `observe` from the same list.
- `stuck-conditions` (#101's, in force first): a new requirement defines the read-cleared
  condition, opened by a failing read and cleared by a passing one (decision 38); a seat file Igor
  fails to decrypt opens such a condition on its first occurrence, beside #101's refused GitHub App credential, and the
  condition clears on a good read and stops no role (decisions 31 and 32); an unreadable seat
  is passed over by a role with another eligible seat; a lent seat's credential is its decrypted token, and no credential is a stored login; the report's remedy
  names the seat's `IGOR_SEAT_<ID>` variable or the private key file that `seatKey` names.

## Impact

- `src/budget.ts`: `parseOrgBudget`, `Pool`, `poolFor` and pool order in `chooseSeat` give way to
  reading `seats/` and ranking by headroom. `resolveToken` loses the file and command branches and
  gains decryption.
- `src/config.ts`: `budget` leaves `CONFIG_KEYS`; `seatKey` joins it.
- `src/role.ts`: a role's seats come from the seat files; `checkSeat` checks that the named
  seat lists the role.
- `src/cli.ts`: `igor seat add`, and `igor run` reading `IGOR_RUN_TOKEN`. `src/init.ts` and `templates/seat-notice.yml`: the notice
  workflow.
- A new dependency on the `age-encryption` package.
- `package.json` (renamed `igor-agent`, its description replaced) and a release workflow under
  `.github/workflows/`.
- `docs/deployment.md`, `docs/seats.md`, `docs/architecture.md` §6.5.1, `README.md`,
  `igor.config.example.yaml`, `deploy/`.
- `adamstallard/igor-lore`: `seats/adam.yaml`.
- Build order: `condition-backoff` (#101), `read-seat-windows-from-the-stream` (#143),
  worker-user (#175), `pinned-skills` (#174) and `check-a-lore-repository` (#113), then this. The archive order is the
  one issue #204 holds (decision 32). This change and #143 archive in one commit (Adam,
  2026-10-17), so the changes #204 places between them, #175, #174 and #113, archive in that commit too. No commit then
  leaves one of the two archived without the other, so no in-force requirement text names
  `capacity_estimate`, which #143 removes, or `dedicated`, which this change removes. The word
  "dedicated" survives only as plain English in two in-force scenario titles, which openspec
  will not rename: *A role reserve with a dedicated seat is valid* (decision 16) and #143's *A
  dedicated seat runs uncalibrated*. #143 also withdraws the open changes
  `scheduled-observation` and `budget-pacing`, which keep a job on a lender's machine and pool
  order; this change depends on that. The `MODIFIED` blocks here are
  written against #143's text where #143 modifies the same requirement.
- worker-user (#175) modifies the same worker-environment requirement, to let `GIT_INDEX_FILE`
  reach the worker. #175 is built first, so this change's block is written over #175's text and
  keeps that rule.
