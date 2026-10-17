## Context

The proposal says what must be true. This file covers the parts where how is a choice: how a token
reaches the server, how a seat is chosen without pools, and what a lender's control over their
seat rests on.

Build order is `condition-backoff` (#101), `read-seat-windows-from-the-stream` (#143) and
worker-user (#175), then this change. Where this file says "line", "reading" or "headroom", it means
them as #143 defines them: a seat's line for a window rises from `1 − reserve` just after a reset to
100% at the next reset, using the larger of the seat's and the role's reserve, and a reading is the
seat's most recent observation of the window taken since that window last reset.

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
   with the private key whenever it reads the seat.

Rotating is the same pull request with new ciphertext: `igor seat add` again. A lender revokes by
revoking the token at Anthropic; the operator can also remove the seat file, which takes effect
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

### Why ciphertext in history no longer rules this out

The 2026-09-28 model rejected an encrypted file in git because the ciphertext stays in history
forever, readable by anyone who later holds the key. That permanence adds little:

- A decrypted token is useful only while it is valid. A `setup-token` expires after a year (#145),
  its holder can revoke it at any time, and after a rotation the old ciphertext decrypts to a dead
  token.
- What history exposes is therefore tokens still valid when the key leaks. Every design is
  exposed to a server-key leak the same way, because the server must hold every token it uses:
  under the secret model the same leak exposed the same live tokens through the env file.

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
a variable and runs nothing, so it is as safe in a contributed file as ciphertext is, and it costs
the operator no encryption step for a token already on the server. Its value is a plain token.

A seat file naming neither key is refused (Adam, 2026-10-17). It would spend whatever login the
server holds, which can be a pay-per-use API key. *Rejected:* allowing such a file behind a flag
the operator sets.

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

### The ciphertext is one line, and says what it is

`encrypted_token` holds the binary age ciphertext, base64-encoded on one line with no wrapping, so
it sits in YAML as a plain scalar. Igor checks that it begins with `YWdlLWVuY3J5cHRpb24ub3JnL3Yx`,
which is `age-encryption.org/v1`, the first line of every age file, in base64. A value that does
not is refused at load, and the refusal tells the holder to revoke the token: a plain token in a
seat file is a credential committed to git.

Rejected: ASCII-armored age (`age -a`). It is multi-line and its parser rejects re-wrapped lines,
which a YAML block scalar indented wrongly produces.

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

### Decryption composes with #101's credential condition

#101's *A seat's refused credential is a condition on that seat* keys the condition by a full
SHA-256 hash of the credential the seat resolved. For a lent seat that is the decrypted token, as
*A seat's token travels as ciphertext in its file* requires. age encryption is randomized, so a
holder who re-encrypts the same token produces a different ciphertext, and a hash of that would
read as a new credential and clear a condition the provider would only refuse again.

## How a seat is chosen without pools

A pool did two jobs, grouping and priority. Both move to the seats.

**Grouping.** A role's seats are every seat whose file lists it in `roles`. A role naming
`seat: <id>` draws on that seat alone, and that seat's file must list the role. A role naming a
seat that does not list it is refused at load, naming the seat file to change. Otherwise
`seat:` would be a second link the holder cannot see, which is what this change removes.

**Priority.** Among the seats that serve the role and that no rule passes over, the Igor picks
the one with the most headroom:

1. **Eligible** means every other rule lets this role spend on the seat now. Those rules belong
   to #143 (the line; the probe made when the line rises past a seat's last reading; extra usage;
   a missing reading), to
   `budget_share`, and to #101 (an open condition on the seat, such as a refused credential or a
   token that cannot be decrypted). Seat-budget's *A role draws on the seat with the most
   headroom* names them and restates none. A seat under
   such a condition is passed over, so a role with another eligible seat keeps working (Adam,
   2026-10-17). A role whose seats are all under open conditions stops, as #101 says. Whether a
   role with no eligible seat, where some seats are under a condition and the rest are ineligible
   for other reasons, should hand off or stop is open in the proposal.
2. **Headroom** of a window is the role's line on that seat minus the reading, in percentage
   points. A seat's headroom is the smaller of its two windows' headrooms, because the window
   with less room is the one that stops it.
3. **A seat with no reading** of a window counts as 0% used there, so its headroom is its line.
   Only a seat at reserve 0 is eligible without a reading, because its line is 100% throughout
   the window and no reading could be above it. Such a seat is usually a new one that no person
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

**Who controls `seats/recipient.txt`.** Whoever can merge to the lore repository's default branch
can replace it, and every token encrypted afterwards is readable by whoever holds the matching
private key. That is the operator, who is trusted with every token anyway, since the server
decrypts them. `igor seat add` reads it from the default branch, never from a pull request, so a
pull request cannot redirect a lender's token before it merges.

**A merged seat file reaches the server when its lore checkout does.** Igor reads seats from the
checkout when it loads. Igor pulling its own lore checkout between cycles is tracked separately,
as [#176](https://github.com/adamstallard/igor/issues/176).

## The lender hears about a change to their seat file

**Decided 2026-10-11 (Adam): a pull request touching `seats/<id>.yaml` @-mentions that seat's
owner on the pull request**, so their veto does not depend on watching the file's history.

**Chosen: a workflow on GitHub-hosted runners, triggered by `pull_request_target` on `seats/**`.**
It ships as `templates/seat-notice.yml`, and `igor init` installs it beside
`reconcile-on-merge.yml`. On each push to a pull request that touches `seats/`, it posts one
comment mentioning the owner of each seat file the pull request changes, renames or deletes, and
whom no earlier notice on that pull request already mentioned.

`pull_request_target` is the trigger that can comment on a pull request from a fork, which is
where most lenders' and some operators' changes come from. It runs the default branch's copy of
the workflow with a token that can write to the repository, which is exactly why it is dangerous
when a workflow reads the pull request's head: a fork's code or data would run with that token.
So this workflow reads nothing from the head:

- **No checkout.** It runs `gh api` calls and a shell script that are all in the workflow file on
  the default branch.
- **Only the list of changed paths**, from the pull-requests API, each read line by line, quoted,
  and matched against `^seats/[a-z0-9][a-z0-9-]*\.yaml$` before it is used at all. A path is never
  expanded by the shell, interpolated into the workflow with `${{ }}`, or passed to anything but
  that match and the contents call below.
- **The owner comes from the default branch's copy** of each matching file, never from the pull
  request's. A seat file the pull request adds has no default-branch copy, so it mentions nobody:
  its author is the lender, or an operator declaring a seat by hand.
- **The token is scoped** to `contents: read` and `pull-requests: write`.

An owner is mentioned only when the default-branch file's `owner` is a GitHub login and is not the
pull request's author. A lender whose `owner` is not a GitHub login cannot be mentioned; the
operator guide says to tell them some other way.

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
- **Igor commenting from the server.** Igor watches its roles' sources, not the lore repository's
  pull requests, and a notice that waits on the server being up is no notice when it is down.

**Decided 2026-10-17 (Adam): the lore repository's default branch requires a pull request before
merging.** A direct push changes a seat file with no pull request for the workflow to run on, so
no lender hears of it. `check-a-lore-repository` (#113) already reports a default branch that
accepts direct pushes.

**Decided 2026-10-17 (Adam): a plain token pasted into a pull request is an accepted risk.** It is
public once pushed, before Igor can refuse it at load, and the workflow cannot catch it because it
reads nothing from the head. The lender guide tells a lender this, and to revoke such a token.

**Decided 2026-10-11 (Adam): `igor doctor` reports a missing `seat-notice.yml`.** Without it no
lender is ever told of a change, and nothing else fails or reports it. The check reads the default
branch, as the reconciliation-workflow check in `check-a-lore-repository` does.

**Decided 2026-10-11 (Adam): a change to `seats/recipient.txt` notifies nobody.** A new public
key affects only tokens encrypted after it lands; every token already on the server stays as it
was. Each lender meets the new key when they next rotate, since `igor seat add` reads it from the
default branch.

## How `igor seat add` opens the pull request

**Decided 2026-10-17 (Adam).** Where `gh` is installed and signed in, `igor seat add` commits the
seat file on a branch, pushes it to the lore repository where the holder may push and otherwise to
their fork, and opens the pull request with `gh`. Otherwise it opens GitHub's prefilled new-file
link in the browser, or prints it where no browser can be opened:

```
https://github.com/<org>/<repo>/new/<default-branch>?filename=seats/<id>.yaml&value=<url-encoded file>
```

GitHub forks the repository for a lender without write access, and the lender clicks "Propose new
file" to open the pull request. That the prefilled value survives the fork, and that the link
holds a whole seat file with its ciphertext, is not measured yet (task 1.0); if either fails, the
choice goes back to Adam. Either way Igor never holds the lender's GitHub credentials: `gh`
holds its own login, and the browser holds the lender's own GitHub session.

Without `gh`, the steps that come before the link are open in the proposal: finding the lore
repository, the holder's login (which becomes `owner`) and the public key. So is a rotation without
`gh`, because GitHub's new-file link cannot replace a file that already exists.

## Publishing to npm

**Decided 2026-10-17 (Adam): Igor is published as `igor-agent`**, with `bin` `igor`, so
`npx igor-agent seat add` is a lender's whole install. The description is the README's opening
line, verbatim, so the package and the README cannot drift into two pitches (#27).

A tag push runs a release workflow on GitHub-hosted runners. It builds the JavaScript, checks the
package, and runs `npm publish --provenance` with an npm token held as a repository secret.
Provenance links each published version to the workflow run and commit that built it.

The npm token as a repository secret is Adam's decision. It conflicts with this file's reason for
rejecting plain repository secrets (*Options rejected*): any writer can read a repository secret,
so any writer could publish `igor-agent`, which lenders run through `npx`. That conflict is an
open question in the proposal.
