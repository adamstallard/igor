## Context

The proposal says what must be true. This file covers the parts where how is a choice: how a token
reaches the server, how a seat is chosen without pools, and what a lender's control over their
seat rests on.

Build order is `condition-backoff` (#101), `read-seat-windows-from-the-stream` (#143),
worker-user (#175), `pinned-skills` (#174) and `check-a-lore-repository` (#113), then this change.

Two terms come from #143, *line* and *reading*. A seat's *line* for a usage window is the share of the window Igor
may spend: it rises from `1 − reserve` just after a reset to 100% at the next reset, using the
larger of the seat's and the role's reserve. A *reading* is the seat's most recent observation of
the window taken since that window last reset. This file defines *headroom* itself, in *How a seat
is chosen without pools*, below. A *lore read*, a term from `lore-pull` (#208), is a process loading its
configuration, role files and seat files from one commit of its lore checkout.

The decisions, with who made them and the alternatives they turned down, open the proposal.
This file gives the reasoning behind them.

## How the token reaches the server

**The holder encrypts their token to the server's public key, and the ciphertext goes in their
seat file.** The pull request that adds `seats/<id>.yaml` carries it, as `encrypted_token`. The
server reads the seat file from its lore checkout and decrypts the token with its private key when
it reads the seat. Delivering the token needs no GitHub secret, workflow or runner, and a lender
needs no access to the lore repository beyond opening a pull request, so they can contribute from
a fork.

1. The server has an age X25519 keypair, made with `age-keygen` as the service user. The private
   key stays on the server at the path `igor.config.yaml` names as `seatKey`. The public key is
   committed as `seats/recipient.txt`.
2. The holder runs `claude setup-token`, encrypts the token to that public key, and opens a pull
   request adding `seats/<id>.yaml` with the ciphertext in it. `igor seat add` does all of it.
3. Once the pull request merges and the server's lore checkout has it, Igor decrypts the token
   with the private key on each lore read: at start, and at each cycle start (#179's reread, and
   `lore-pull`'s, #208). A worker or a probe gets the plaintext Igor holds from that read, and
   starting one decrypts nothing (Adam, 2026-10-18).

Rotating is the same pull request with new ciphertext: `igor seat add` again. A lender revokes by
revoking the token at Anthropic, through the claude.ai web interface (Adam, 2026-10-19, who named
the interface but not the page); the operator can also remove the seat file, which takes effect
when the server's lore checkout next updates. Adam decided on 2026-10-17 not to measure how soon
Anthropic refuses a revoked token, so no guide promises a speed.

### The server's private key is the whole protection

Anyone can read a seat file, and on a public lore repository that means anyone at all. What
keeps the token secret is the private key alone, so its handling is the part of this design an
operator must get right:

- **Who can read it:** the service user and root. The file is `0600`, owned by the service user.
- **Backup:** kept somewhere off the server that only the operator can read. Lost, every seat goes
  unreadable until each holder re-encrypts to a new key.
- **Rotation:** a new keypair, the new public key committed, and every holder re-encrypting with
  `igor seat add`. Old ciphertext stays readable by the old key, so a rotation after a leak also
  needs every holder to revoke their token and issue a new one.
- **A leak:** treat every seat token as leaked. Rotate the key, and every holder revokes at
  Anthropic and re-issues.
- **Who must not read it: the worker.** A worker running as the Igor's own user could read the
  key, and with it every lent token. The worker runs as the Igor's own user only under `igor run`
  (#175), and there Igor decrypts no lent seat (Adam, 2026-10-17). Lending needs #175's worker-user setup, in which each worker runs as a user of its own. `igor run` spends
  only its own token in any case (*`igor run` spends its own token*, below), so it draws on no
  seat file's seat, lent or not.
- **A token Igor cannot decrypt** (Adam, 2026-10-17). Whatever the reason (no `seatKey`, a key
  file Igor cannot read, a wrong key, or a corrupt file), the seat is ineligible: seat choice
  never picks it and #143's probe skips it, and it is under a condition on the seat. For a wrong
  key or a corrupt file the cure is the lender's, so the condition's report names the seat and
  says its lender re-lends it. It does not name the lender: a handoff may quote the report on a
  public issue, so a lender's login appears only in `igor doctor` and `igor budget`, which the
  operator reads (Adam, 2026-10-19). For a missing `seatKey` or an unreadable key file the
  cure is the operator's, and the report names the key, as task 3.4 words it.
- **That condition is tied to reading seat files** (Adam, 2026-10-17). #101 opens a seat's
  condition when handoffs keep naming it, and clears it with #143's probe. A seat that is never
  picked causes no handoff, and the probe skips it, so neither path reaches it. Instead Igor
  opens the condition when a lore read fails to decrypt the seat's file, at start and at each cycle start, and clears it when a later lore read decrypts
  the file, as when the lender re-lends. The condition stops no role: a role with no other
  usable seat hands off rather than stops. Its handoff is a condition handoff, naming the
  condition and its cure, with no return time, since no reset brings the seat back (Adam,
  2026-10-19). A condition handoff is not a budget handoff, so graceful-handoff's rule that a
  budget handoff states when capacity returns does not reach it. The `stuck-conditions` delta
  carries both rules. Its block on #101's *A condition that recurs stops the affected scope
  from taking new work* says this condition opens on its first occurrence and clears on a good
  read, not by a probe item (proposal, decision 32). Its block on *A condition's scope is its
  cure's scope* says the condition stops no role. Both cite the delta's definition of a
  read-cleared condition, the kind this is. The delta's third block, on #101's *A condition
  clears by not recurring, and a probe is what observes that*, exempts that kind from the probe
  item.

- **A process with no token for an eligible seat reads its file first** (Adam, 2026-10-19).
  A condition is shared by every Igor process, each rebuilding it from the one execution log,
  while each process holds only the plaintext of its own last read. So when one process's read
  fails and another's passes, the passing read clears the condition, and the failing process
  would find the seat eligible with no token for it. Before using a lent seat it holds no
  plaintext for, a process reads that seat's file again, from the commit it last applied, at
  most once a cycle. A pass gives it the token. A failure passes the seat over for this process
  only, and opens nothing (proposal, decision 71): another process's passing read has just shown
  that the file decrypts, so reopening the shared condition would take the seat from every
  process that holds a good token, and the two processes would reopen and clear it in turn for
  as long as they disagree. They disagree mostly while one has applied a newer lore commit than
  the other, which ends at the other's next cycle.

### Why ciphertext in history no longer rules this out

The 2026-09-28 model rejected an encrypted file in git because the ciphertext stays in history
forever, readable by anyone who later holds the key. That permanence adds little:

- A decrypted token is useful only while it is valid. A `setup-token` expires after a year (#145),
  its holder can revoke it at any time, and after a rotation the old ciphertext decrypts to a dead
  token.
- What history exposes is therefore tokens still valid when the key leaks. Every design is
  exposed to a server-key leak the same way, because the server must hold every token it uses:
  under the 2026-09-28 model, where tokens were GitHub secrets, a compromised server exposed the same live tokens through its env file.

### Options rejected

- **Plain repository secrets:** every writer can read every token, since a workflow on any pushed
  branch runs with the repository's secrets and can send them anywhere.
- **Secrets delivered by a deploy workflow on a self-hosted runner,** the 2026-09-28 model. On a
  public repository a fork's pull request can bring its own `runs-on: self-hosted` workflow and run
  code on the server, which holds every decrypted token. The only guards are a private repository
  or an organization's runner group restricted to the deploy workflow, and `igor-lore` is public
  and on a personal account, which has no runner groups. It also needs lenders to have `write`, to
  set a secret.
- **A pull model:** a GitHub-hosted workflow publishes a short-lived ciphertext artifact, and the
  server polls for it. It costs a workflow and repository secrets, and its exposure is no better
  against a determined attacker, who can read the artifact while it lives.
- **Environment secrets restricted to `main`:** safe, but only an admin can add a seat.
- **A secrets manager with write-only drop paths:** needs another service.
- **A one-time drop page on the server:** needs a public endpoint, which Igor's polling design
  avoids.
- **Each holder runs their own runner:** breaks the rule that nothing keeps running on a seat
  holder's machine: no runner, daemon or scheduled job. A one-off command, such as `igor seat
  add`, is fine.

### An operator's own seat may name `token_env` instead

A seat file carries `encrypted_token` or `token_env`, never both. `token_env` serves the seat
whose token the operator holds and puts in the server's env file by hand, such as `igor-lore`'s
`adam` seat or a fleet seat bought for the team, or a token a secret store writes there. It names
a variable and runs nothing, and it costs the operator no encryption step for a token already on
the server. Its value is a plain token. Unlike ciphertext, nothing binds the variable to a file.
Suppose an operator removes a `token_env` seat's file but leaves its `IGOR_SEAT_<ID>` variable in
the server's env file. A later pull request that adds a file of the same id, naming `token_env`,
then spends that leftover token, on whatever roles and reserve the pull request sets. So removing
a `token_env` seat removes its variable too (task 9.3).

A seat file naming neither key is refused (Adam, 2026-10-17). It would spend whatever login the
server holds, which can be a pay-per-use API key. *Rejected:* allowing such a file behind a flag
the operator sets.

Igor never uses a stored Claude login at all (Adam, 2026-10-18), and no organization is exempt
from that rule. One that declares no seats gives no role a seat, so its configuration fails
validation and `igor serve` refuses to start. An organization with no
lenders declares one seat from its own token, with `claude setup-token` and either `igor seat add`
or a `token_env` seat file, and the operator guide gives those steps. When Igor pulls its lore checkout
(`lore-pull`, #208) and the pull removes the last seat file serving a role, it leaves the role with no usable
seat. The process is already running, so it does not refuse to start: it keeps running, hands off
what its workers held and takes nothing new. The removal always applies, but the configuration
it leaves serves the role with no seat, which fails the startup checks, so the rest of that pull
is refused. The process then runs on the last configuration that passed, with the removed seat
file taken out (seat-budget's *A removed seat file always takes effect*).

"Never uses" means Igor never passes a stored login in place of a seat's token. Under `igor run`,
on a developer's machine, Claude Code may itself prefer a stored login there over the token Igor
passes. #174's task 0.3 measured that it does not on Claude Code 2.1.303: a valid token wins,
and an invalid one fails rather than reaching the login. Had it preferred the login, the call
would spend the developer's own login and quota, which Adam accepted (proposal, decision 45):
Igor neither hides the login nor refuses.

`token_env` is kept rather than requiring every seat to carry ciphertext: an operator would
otherwise encrypt their own token to their own server only to decrypt it again, and a seat whose
token lives in a secret store would need a re-encryption each time the store rotates it.

### `token_env` is fixed by the seat's id

A seat file's `token_env` must be `IGOR_SEAT_` plus the id, uppercased, with every character
other than a letter or digit replaced by `_`. That is the convention `deploy/env.example` already
states, made a rule.

Without it, a contributed seat file could name `GH_TOKEN`, and Igor would hand the GitHub token to
`claude` as a seat credential. Or it could name another seat's variable, and spend that seat under
its own id, with a reserve and roles that seat's holder never chose. Both are one line in a file
an operator may merge without much scrutiny, since lending is meant to be easy. A seat id holds only lowercase letters,
digits and hyphens, so no two ids map to the same name.

### A malformed seat file takes only its own seat out

A seat file with an unknown key, an `id` field, a role that has no file, no token, or YAML that
does not parse takes only its own seat out (Adam, 2026-10-19). Its seat is under the read-cleared
condition `seat:<id>:file`, and the configuration loads, so roles with other seats keep working.
Refusing the whole configuration instead would stop every role at start, and under `lore-pull`
(#208) refuse the whole pull, for one file.

A plain token pasted into `encrypted_token` stays a refusal of the whole configuration. That
refusal is the only place anybody tells its holder that the token is now in git history and must
be revoked; a condition on one seat is too easy to miss.

The condition's report names the file and says it is malformed, and quotes nothing else from it,
since a handoff may carry it to a public issue. The refusal's own text, which names the key or
value at fault, goes only where the operator reads: the configuration's validation, and so `igor
doctor`, and `igor budget`. A file whose name is not a seat id names no seat, so every such file
shares one condition, `seats:filename`, and its report names none of them. Its `roles` are not
read.

Where a malformed file's `roles` still reads as a list of known roles, those roles are served by
a seat that is ineligible, and hand off rather than stop. Where it cannot be read, or the file's name is not a seat id, Igor cannot
tell which roles the file serves. So while such a file is present, a role that no other seat file
lists is not refused at load for want of a seat; it hands off naming the open conditions on
malformed seat files (proposal, decision 72).

### The ciphertext is one line, and says what it is

`encrypted_token` holds the binary age ciphertext, base64-encoded on one line with no wrapping, so
it sits in YAML as a plain scalar. Igor checks that it begins with `YWdlLWVuY3J5cHRpb24ub3JnL3Yx`,
which is `age-encryption.org/v1`, the first line of every age file, in base64. A value that does
not is refused at load, and the refusal tells the holder to revoke the token: a plain token in a
seat file is a credential committed to git.

Rejected: ASCII-armored age (`age -a`). It is multi-line and its parser rejects re-wrapped lines,
which a YAML block scalar indented wrongly produces.

### The ciphertext names its seat

`igor seat add` encrypts `<id>:<token>`, not the bare token (Adam, 2026-10-18). On decrypting,
Igor splits at the first colon, which no seat id can contain, and refuses the seat unless the id
is its file's own.

The id stops one attack. Ciphertext is public, so anyone could copy `seats/bob.yaml`'s
`encrypted_token` into `seats/eve.yaml`, list other roles and set `reserve: 0`, and spend Bob's
subscription on terms Bob never set. Bob would not be told: the notice workflow, which mentions a
seat's owner on a pull request that changes their seat file, reads the owner from the default
branch, and `eve.yaml` is not there yet. With the id inside, `eve.yaml`'s plaintext says `bob`,
and Igor refuses it. The refused seat is under `seat:<id>:decrypt`, the read-cleared condition for
any seat Igor cannot decrypt, so no new rule is needed for what follows.

*Rejected:* refusing two seats whose tokens decrypt equal. That catches a copy only while the
original file is still there, and says nothing about which file is the copy.

### Encryption and decryption use the `age-encryption` package

Igor shells out to `git`, `gh` and `claude` rather than reimplementing them, so shelling out to
`age` would be the house style. The package is chosen instead because of who runs `igor seat
add`: a lender, on their own machine, through `npx igor-agent seat add`. With the package, that
lender needs only Node, and no `age` binary. Igor itself only encrypts and decrypts; the server's
keypair is made once by the operator with `age-keygen`, the standard tool (step 1 above). The
package is Filippo
Valsorda's TypeScript implementation of the same format.

The decrypted token lives only in the Igor process and the worker it spawns, which is where it
has to be. Nothing writes it to disk or to an argument list.

**Measured 2026-10-18 (task 1.1): the package and the `age` CLI read each other's output.** On
macOS (arm64, `age` 1.3.2) and Linux (`node:22-bookworm`, Debian's `age` 1.1.1), with npm
`age-encryption` 0.3.1. The release requires Node 26 (proposal, decision 19), which this did not
measure; the round-trip tests of task 3.6 run on the release's Node:
- `age-keygen -y` derives the same recipient as the package's `identityToRecipient`.
- `age -r <recipient> | base64 | tr -d '\n'` produces a value starting
  `YWdlLWVuY3J5cHRpb24ub3JnL3Yx`, and the package decrypts it after `base64 -d`.
- What the package encrypts, `age -d` decrypts.
- Ciphertext made on macOS decrypts on Linux, by the package and by the CLI.

GNU `base64` wraps at 76 columns unless `tr -d '\n'` follows, which is why the pipeline in task
1.1 has it.

### Decryption composes with #101's credential condition

#101's *A seat's refused credential is a condition on that seat* keys the condition by a full
SHA-256 hash of the credential the seat resolved. For a lent seat that is the decrypted token, as
*A seat's token travels as ciphertext in its file* requires. age encryption is randomized, so a
holder who re-encrypts the same token produces a different ciphertext, and a hash of that would
read as a new credential and clear a condition the provider would only refuse again.

### `igor run` spends its own token

`igor run` takes its token from `IGOR_RUN_TOKEN` in its own environment, as an implicit local seat
with no file (Adam, 2026-10-18). Nothing about it goes in the lore repository, and lent seats are
never used. Without the variable it refuses to start, naming it.

A developer running `igor run` on their own machine has no other seat Igor may spend. Igor decrypts
no lent seat there, because the worker runs as the developer's own user and could read the key.
The operator's `token_env` seats name variables only the server sets. A seat file of the
developer's own would show their seat, and the roles it serves, to every reader of the lore
repository.

Three details are not in Adam's words of 2026-10-18. This change inferred them, and Adam
confirmed them on 2026-10-19:
- `igor run` draws on no seat file's seat, `token_env` seats included, so one rule says what it
  spends.
- The implicit seat's id is `_run`. A seat file's id holds only lowercase letters, digits and
  hyphens, so no seat file can be `_run`. A condition is recorded under its cure key, such as
  `seat:<id>:decrypt`, so a condition on the implicit seat can never be taken for, or clear, a
  seat file's.
- Its reserve is 0, and the role's own `reserve` does not apply to it. `igor run` makes no probe,
  so a reserve would hold the seat back until a reading arrived, and no reading would arrive.

Decrypting nothing does not keep the key from a worker that can read it itself. Someone who runs
`igor run` as the service user on the server gives its worker, running as that same user, the key
and so every lent token. So `igor run` refuses to start where it can read the file `seatKey`
names (Adam, 2026-10-19).

## How a seat is chosen without pools

A pool did two jobs, grouping and priority. Both move to the seats.

**Grouping.** A role's seats are every seat whose file lists it in `roles`. A role naming
`seat: <id>` draws on that seat alone, and that seat's file must list the role. A role naming a
seat that does not list it is refused at load, naming the seat file to change. Otherwise
`seat:` would be a second link the holder cannot see, which is what this change removes.

**Priority.** Among the seats that serve the role and that no rule passes over, the Igor picks
the one with the most headroom:

1. **Eligible** means every other rule lets this role spend on the seat now. Those rules belong
   to #143 (the line; the probe made when the line rises past a seat's last reading, so a seat held at its
   line is read again before it is drawn on; extra usage;
   a missing reading), to
   `budget_share`, and to #101 (an open condition on the seat, such as a refused credential or a
   token that cannot be decrypted). Seat-budget's *A role draws on the seat with the most
   headroom* cites #143's *A role has a seat it can spend when the gate would choose one now* for
   them and restates none. A seat under
   such a condition is passed over, so a role with another eligible seat keeps working (Adam,
   2026-10-17). A role stops, as #101 says, only when every seat serving it is under a condition
   and none of those is read-cleared. In every
   other case where the role has no eligible seat, such as some seats under a condition and the
   rest at their lines, it hands off rather than stops, and the handoff names each condition
   (Adam, 2026-10-17).
2. **Headroom** of a window is the role's line on that seat minus the reading, in percentage
   points. A seat's headroom is the smaller of its two windows' headrooms, because the window
   with less room is the one that stops it.
3. **A seat with no reading** of a window counts as 0% used there, so its headroom is its line.
   Only a seat whose line uses a reserve of 0, because both the seat's reserve and the role's
   are 0, is eligible without a reading, because its line is 100% throughout the window and no reading could be above it. Such a seat is usually a new one that no person
   also uses, and its first run gives it the reading that ranks it from then on.
4. **Ties** go to the seat whose week resets soonest, because capacity left at the reset is lost.
   The week is the window that is actually lost; a session refills within hours. A seat with no
   known week reset sorts after every seat with one. Seats still tied are taken in id order, so
   the choice is the same on every Igor.

Most headroom prefers a seat at reserve 0 over a lent seat with a reserve, without anyone ordering
them: a lent seat's line sits lower, so it has less headroom at the same reading. It also spreads
load, where a pool's listed order drained one seat before touching the next.

A seat file has no `dedicated` key (Adam, 2026-10-17). In the configuration this change replaces,
`dedicated: true` marked a seat no person uses: it refused that seat a reserve and set its reserve
to 0. After #143 any seat may keep a reserve and every seat's reserve defaults to 0, so the key
would do nothing, and this ranking already spends a reserve-0 seat first.

Exhausting every seat that serves the role is a handoff, as exhausting a pool was.

**Rejected: keeping pools, or an `order` key, beside the seat files.** Either brings back an
operator-controlled ordering the lender never stated. A holder who wants their seat used last
raises its reserve, which lowers its line and so its headroom.

## What a lender's control rests on

**The lender states the terms, and revoking the token is their veto.** Their own pull request adds
`seats/<id>.yaml` with the roles their seat serves and the reserve it keeps, so the terms on which
it is used are theirs, in a file whose history shows who changed what. Afterwards the operator can
edit that file like any other in the lore repository, and nothing in Igor or GitHub asks the
lender first. What stops a use the lender did not agree to is revoking the token at Anthropic,
which ends the seat, wherever the token is and whatever any file says. A veto is only as
good as the lender's chance to use it, so a pull request changing their file mentions them
(*The lender hears about a change to their seat file* below).

**Rejected: a CODEOWNERS line per seat file, with code-owner review required.** It made the lender
approve every change to their file. It needs settings only an administrator controls and that an
administrator can turn off, warnings and checks to notice when they are off, a stand-in for a
lender without a GitHub account, and a lender who wants to rotate their own token waiting on a
review only they could give. Revoking already gives the lender a veto that needs none of it, and
that works the same for a lender with no GitHub account.

**A lender with no GitHub account lends through the operator (Adam, 2026-10-17).** Lending for
yourself needs a GitHub account, to run `igor seat add` with `gh` and to be mentioned. Someone
without one gives the operator their token, and the operator's login is the seat file's `owner`.
Decision 24 also accepts that `gh api users/<owner>` shows only that a login exists, not that it
belongs to the holder.

**Who controls `seats/recipient.txt`.** Whoever can merge to the lore repository's default branch
can replace it, and every token encrypted afterwards is readable by whoever holds the matching
private key. That is the operator, who is trusted with every token anyway, since the server
decrypts them. `igor seat add` reads it from the default branch, never from a pull request, so a
pull request cannot redirect a lender's token before it merges.

**A merged seat file reaches the server when its lore checkout does.** Igor reads seats from the
checkout on each lore read. Igor pulling its own lore checkout between cycles is specified by
`lore-pull` (#208, for [#176](https://github.com/adamstallard/igor/issues/176)).

## The lender hears about a change to their seat file

**Decided 2026-10-11 (Adam): a pull request touching `seats/<id>.yaml` @-mentions that seat's
owner on the pull request**, so their veto does not depend on watching the file's history.

**Decided 2026-10-17 (Adam): after a seat-file change lands, the only notice is Igor's, posted
when it pulls the lore change.** `lore-pull` (#208) specifies both the pull and that notice. Igor posts nothing on an open lore pull request:
the comment before merging comes from the seat-notice workflow, chosen below. That workflow has
no `push` trigger, for two reasons. A push trigger would mention a lender a second time for a
change Igor also announces. And it would miss the case it was meant for: lore setup lets GitHub
Actions push to the default branch past its pull-request rule, so the reconciliation workflow
can commit merged lore, and such a push uses the workflow's own `GITHUB_TOKEN`, for which GitHub
starts no workflow.

**Chosen: a workflow on GitHub-hosted runners, triggered by `pull_request_target` on every pull
request, and by nothing else.**
It ships as `templates/seat-notice.yml`, and `igor init` installs it beside
`reconcile-on-merge.yml`. Each time a pull request is opened, reopened, pushed to, marked ready
or edited to change its base branch, it lists the seat files the event changes, renames or
deletes, and posts one comment mentioning the owner of each. It mentions an owner again on every
later push that changes their file (Adam, 2026-10-19), and reads no earlier comment to decide. A
push that touches no seat file, or a pull request that touches none, gets no comment.

**Decided 2026-10-18 (Adam): the trigger has no `paths` filter, and the workflow finds the seat
files itself with git.** GitHub's path filter can miss a seat file on a large pull request.
Measured 2026-10-19 (task 10.7) in a scratch repository, with a `pull_request_target` workflow
filtered on `seats/**`:

| Pull request | Files | Where the seat file sits in the file list | Ran? |
|---|---|---|---|
| control | 2 | – | yes |
| control, no seat file | 2 | none | no |
| large | 351 | last of 351 | yes |
| large | 351 | first | yes |
| large, no seat file | 350 | none | no |
| very large | 3,101 | after file 3,000, which the files API omits | no: not run after 5 minutes of watching |
| very large | 3,101 | first | yes, within 10 seconds |

GitHub documents the filter as seeing only a pull request's first 300 files. That cut did not
apply at 351 files. At 3,101 files the filter missed a seat file that sorted after the first
3,000, so anyone could hide a seat-file change from its lender by padding a pull request with
3,000 files that sort before `seats/`. The exact cut was not pinned down; 3,000, the pull-request
files API's cap, is the likely value. Because of that cap, the workflow does not list files
through the API either.

Instead it fetches the pull request's commits as git data and compares trees:
`git diff --name-only --no-renames -z <base>...<head> -- seats/`. On a push it compares the head
before the push with the head after it instead, so the comment names what that push changed.
Where the earlier head cannot be fetched, as after some force-pushes, it falls back to the base,
which may mention an owner whose file that push left alone. The fetch takes trees and
commits only (`--filter=blob:none`), with no checkout, so no file of the pull request is written
to disk, and git runs no hook or filter from it. Running on every pull request costs one such
fetch per push; on a pull request with no seat file the job exits after the diff.

The 3,000-file limit does not reach this comparison. `git diff` with a pathspec walks the two
trees under `seats/` and never pages through a list of the pull request's files; the limit
belongs to GitHub's `paths:` filter and its files API. So no measurement on a padded pull
request is needed (Adam, 2026-10-19, dropping task 10.8), and the workflow's own test uses an
ordinary small pull request that changes a seat file (task 10.9).

*Rejected:* keeping the filter and documenting the gap. The notice is how a lender hears of a
change in time to revoke, and a gap anyone can open by padding a pull request makes it no notice.

`pull_request_target` is the trigger that can comment on a pull request from a fork, which is
where most lenders' and some operators' changes come from. It runs the default branch's copy of
the workflow with a token that can write to the repository, which is exactly why it is dangerous
when a workflow uses the pull request's head: a fork's code or data would run with that token.
So this workflow takes only the names of changed paths from the head, and runs nothing from it:

- **No checkout.** It runs `git`, `gh api` calls and a shell script that are all in the workflow
  file on the default branch. It fetches the head's commits and trees as data, and no file
  content.
- **Only the names of changed paths**, from git's tree comparison above, read NUL-separated,
  quoted, and matched against `^seats/[a-z0-9][a-z0-9-]*\.yaml$` before they are used at all. A
  path is never expanded by the shell, interpolated into the workflow with `${{ }}`, or passed to
  anything but that match and the `gh api` read of the default branch's copy, in the next bullet.
- **The owner comes from the default branch's copy** of each matching file, never from the pull
  request's. A seat file the pull request adds has no default-branch copy, so it mentions nobody.
  Usually its author is the lender, or an operator declaring a seat by hand. Where it is a copy
  of another seat's ciphertext, as in the `eve.yaml` attack above, the notice does not catch it:
  the seat id bound inside the ciphertext does, and Igor refuses the copy.
- **The token is scoped** to `contents: read` and `pull-requests: write`.
- **No earlier comment decides a mention.** Every workflow of the lore repository posts as
  `github-actions[bot]`, and a writer's pull request from a branch of the lore repository can
  bring its own `pull_request` workflow. So a comment shaped like the notice, even one from
  `github-actions[bot]`, proves nothing about who was told. *Rejected* (Adam, 2026-10-19):
  mentioning an owner once per pull request, which needed exactly such a check of earlier
  comments, so a forged one could keep a later change from its lender.
- **The owner's own change needs no notice; anyone else's does.** An owner is skipped only for
  an event they caused on a pull request they opened. A maintainer's push to a lender's pull
  request mentions the lender.

An owner is mentioned only when the default-branch file's `owner` has a GitHub login's form: the
workflow checks the form, not that the login exists. A seat file written by hand may name an
`owner` of that form that is no GitHub login, since only `igor seat add` and `igor doctor` check
that a login exists. The workflow then mentions a name nobody holds, or a stranger who later
registers it, and the lender hears nothing; `igor doctor` reports such an `owner` so the operator
fixes the file, and the operator guide says to tell such a lender some other way.

**Rejected alternatives:**

- **A line in the pull request template** asking the author to mention the owner. It relies on the
  author, and the author who would skip it is the one making a change the lender would object to.
- **A CODEOWNERS line per seat file without a review requirement.** GitHub would request the
  owner's review, which notifies them. But a code owner must have write access to the repository,
  so a lender contributing from a fork cannot be one, and it brings back the per-seat CODEOWNERS
  maintenance Adam removed.
- **The `pull_request` trigger.** A pull request from a fork gets a read-only token under it and
  cannot comment.
- **A self-hosted runner.** Ruled out for this repository already: a fork's pull request can bring
  its own self-hosted workflow and run code on the server.
- **Igor commenting on open lore pull requests.** Igor watches its roles' sources, not the lore
  repository's pull requests, and a notice that waits on the server being up is no notice when it
  is down. This rejects only the before-merge comment: Igor's notice after a change lands, when
  it pulls it (#208), is decided above.

**Decided 2026-10-17 (Adam): the lore repository's default branch requires a pull request before
merging.** Only a pull request's notice reaches the lender before the change lands; Igor's
notice, when it pulls the change, comes after it. `check-a-lore-repository` (#113) already reports a default branch that
accepts direct pushes.

**Decided 2026-10-17 (Adam): a plain token pasted into a pull request is an accepted risk.** It is
public once pushed, before Igor can refuse it at load, and the workflow cannot catch it because it
reads no file content from the head. The lender guide tells a lender this, and to revoke such a token.

**Decided 2026-10-11 (Adam): `igor doctor` reports a missing `seat-notice.yml`.** Without it no
lender is ever told of a change, and nothing else fails or reports it. The check reads the default
branch, as the reconciliation-workflow check in `check-a-lore-repository` does.

**Decided 2026-10-11 (Adam): a change to `seats/recipient.txt` notifies nobody.** A new public
key affects only tokens encrypted after it lands; every token already on the server stays as it
was. Each lender meets the new key when they next rotate, since `igor seat add` reads it from the
default branch.

## How `igor seat add` opens the pull request

**Decided 2026-10-17 (Adam): `igor seat add` requires `gh`, installed and signed in.** It commits
the seat file on a branch, pushes it to the lore repository where the holder may push and
otherwise to their fork, and opens the pull request with `gh`. Without `gh`, or signed out, it
refuses before reading the token. Igor never holds the lender's GitHub credentials: `gh` holds its
own login.

*Rejected:* GitHub's prefilled new-file link as a fallback without `gh`. The steps before the link
still needed `gh` or a clone, to find the lore repository, the holder's login (which becomes
`owner`) and the public key, which a private repository serves only to a signed-in client. And a
rotation could not use it, because the new-file link cannot replace a file that already exists.

**Decided 2026-10-17 (Adam): `--lore <owner/repo>` names the lore repository**, required outside
a clone and inferred inside one from the clone's `upstream` remote, or `origin` where there is
no `upstream`. Outside a clone, the command creates the
branch, commits the seat file and opens the pull request through the GitHub API with `gh`, so a
lender with only Node and `gh` clones nothing. Inside a clone it commits on a new branch and
opens the pull request with `gh`.

## Publishing to npm

**Decided 2026-10-17 (Adam): Igor is published as `igor-agent`**, with `bin` `igor`, so
`npx igor-agent seat add` is a lender's whole install. The description is the README's opening
line, verbatim, so the package and the README cannot drift into two pitches (#27).

A tag push runs a release workflow on GitHub-hosted runners. It builds the JavaScript, runs the
licence check, and publishes through **npm trusted publishing** (Adam, 2026-10-17): npm trusts
this workflow by its OIDC identity, so no npm token is stored anywhere, and each version gets
provenance linking it to the workflow run and commit that built it. *Rejected:* an npm token held
as a repository secret. Any writer can read a repository secret (*Options rejected*), so any
writer could have published `igor-agent`, which lenders run through `npx`.

**The licence check covers the package and every dependency (Adam, 2026-10-17).** The package's
own `license` field and each dependency's licence must be on an allowlist kept in the repository,
or the release fails, naming the package and its licence. The allowlist (Adam, 2026-10-17) is
MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, 0BSD, CC0-1.0, Unlicense and BlueOak-1.0.0.
Any other licence, copyleft included, fails the release until someone adds it on purpose.
