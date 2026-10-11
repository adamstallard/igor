## Context

The proposal says what must be true. This file covers the parts where how is a choice: how a token
reaches the server, how a seat is chosen without pools, how Igor reads whether the holder's
approval is enforced, and which paths CODEOWNERS has to cover for that approval to mean anything.

Build order is `condition-backoff` (#101), `read-seat-windows-from-the-stream` (#143), then this
change. Where this file says "line", "reading" or "headroom", it means them as #143 defines them: a
seat's line for a window rises from `1 − reserve` just after a reset to 100% at the reset, using
the larger of the seat's and the role's reserve, and a reading is the seat's most recent unreset
observation of the window.

## Decisions already made (Adam)

- **2026-09-28:** one file per seat; tokens encrypted to the server's public key and delivered as
  GitHub Actions secrets by a deploy workflow on a self-hosted runner; the runner guarded by a
  private repository or a runner group restricted to the deploy workflow on `main`; pools dropped.
- **2026-10-04:** no seat file may name `token_command` or `token_file`; this change removes the
  in-force pool requirement; seat choice is most headroom, soonest reset as tie-break (#147).
- **2026-10-11:** a holder with no GitHub account on the lore repository has the operator stand in
  as code owner, and `igor doctor` reports it. Igor warns, and does not refuse, when a seat file
  has no code owner or the code-owner review rule is not in force.
- **2026-10-11: an old `budget.seats` gets no dedicated refusal or migration message.** Nobody runs
  Igor on such a config except `adamstallard/igor-lore`, which is migrated by hand (task 9.1).
  Once seats move to `seats/`, `budget` is a key the config does not read, and the generic
  unknown-key refusal is all an old config gets. This replaces #148's earlier wording, "refused at
  load with a message saying where seats now live".

## How the token reaches the server

**Chosen: encrypt the token to the server, and deliver the ciphertext as a GitHub secret.**

1. The server has an age keypair, made with `age-keygen` as the service user. The private key
   stays on the server, `0600`, at the path `igor.config.yaml` names as `seatKey`. The public key
   is committed to the lore repository as `seats/recipient.txt`.
2. The holder runs `claude setup-token`, encrypts the token to that public key, and stores the
   ciphertext with `gh secret set IGOR_SEAT_<ID>` on the lore repository. They open a pull request
   adding `seats/<id>.yaml`, which names `token_env: IGOR_SEAT_<ID>`. `igor seat add` does all of
   it.
3. A deploy workflow on a self-hosted runner, the Igor server itself, runs on a push to `main`. It
   writes every `IGOR_SEAT_*` secret into a seat env file, updates the lore checkout, and restarts
   the Igors.
4. Igor decrypts a seat's token with the private key when it reads it.

Rotating is `igor seat add` again. Revoking is deleting the secret, or revoking the token at
Anthropic. Rotating the server key means every holder re-encrypts.

**Who can read a token: the server admin, and nobody else.** Every design gives the server admin
access, because the server must hold the token to use it. With plain repository secrets every
writer could read every token too, since a workflow on any pushed branch runs with the
repository's secrets and can send them anywhere. Here such a writer gets only ciphertext, and
nothing is in git history.

**Options rejected:**

- **Plain repository secrets:** every writer can read every token.
- **Environment secrets restricted to `main`:** safe, but only an admin can add a seat.
- **An encrypted file in git:** only the server can read tokens, but the ciphertext stays in
  history forever, readable by anyone who later holds the key.
- **A secrets manager with write-only drop paths:** needs another service.
- **A one-time drop page on the server:** needs a public endpoint, which Igor's polling design
  avoids.
- **Each holder runs their own runner:** breaks the rule that nothing runs on a seat holder's
  machine.

**This is recommended, not required.** An operator who prefers another way writes a seat file by
hand, naming `token_env`, collects the token however they like, and puts it in the server's env
file. A secret store's output goes into that file too.

### The ciphertext is one line, and says what it is

A GitHub secret, a systemd `EnvironmentFile=` line and a Compose `env_file` line all have to carry
it, and the last two do not reliably carry a multi-line value. So the secret holds the binary age
ciphertext, base64-encoded on one line with no wrapping. Igor treats a `token_env` value as
ciphertext when it begins with `YWdlLWVuY3J5cHRpb24ub3JnL3Yx`, which is `age-encryption.org/v1`,
the first line of every age file, in base64. Anything else is a plain token. A `setup-token`
begins `sk-ant-`, so the two cannot be confused.

Rejected: a seat file key such as `encrypted: true`. The value already says which it is, and a key
is one more thing a lender can get wrong, in the one place where getting it wrong means a token
nobody can read.

Rejected: ASCII-armored age (`age -a`). It is multi-line, and its parser rejects re-wrapped
lines, so the deploy workflow would have to re-encode it anyway.

### Encryption and decryption use the `age-encryption` package

Igor shells out to `git`, `gh` and `claude` rather than reimplementing them, so shelling out to
`age` would be the house style. The package is chosen instead because of who runs `igor seat
add`: a lender, on their own machine. With the package, that lender needs Node and `gh`, and no
`age` binary. The server needs `age-keygen` once, to make the keypair, and nothing after. The
package is Filippo Valsorda's TypeScript implementation of the same format.

The decrypted token lives only in the Igor process and the worker it spawns, which is where it
has to be. Nothing writes it to disk or to an argument list.

### The deploy workflow owns a file of its own

The workflow writes `/etc/igor/seats.env`, replacing it whole on every run. The unit reads it with
a second `EnvironmentFile=` after `/etc/igor/env`. The operator's own file is never touched, so a
token the operator installed by hand survives every deploy, and a secret deleted from GitHub
disappears from the server on the next deploy. Where both files name one variable, systemd takes
the later one, `seats.env`; `igor doctor` reports any name defined in both.

The workflow restarts the Igors with `sudo systemctl restart 'igor@*'`. The service user gets
that one command in sudoers and nothing else.

### `token_env` is fixed by the seat's id

A seat file's `token_env` must be `IGOR_SEAT_` plus the id, uppercased, with every character
other than a letter or digit replaced by `_`. That is the convention `deploy/env.example` already
states, made a rule.

Without it, a contributed seat file could name `GH_TOKEN`, and Igor would hand the GitHub token to
`claude` as a seat credential. Or it could name another seat's variable, and spend that seat under
its own id, with its own reserve and roles, past the holder who approved the other file. Both are
one line in a file whose review is permissive by design. A seat id holds only lowercase letters,
digits and hyphens, so no two ids map to the same name.

This is not in #148's decisions, and is listed under *Open* for Adam.

### Decryption composes with #101's credential condition

#101 keys a seat's refused credential by a digest of the credential the seat resolved. The digest
is taken of the decrypted token, not the ciphertext. age encryption is randomized, so a holder who
re-encrypts the same token produces a different ciphertext, and a digest of that would read as a
new credential and clear a condition the provider would only refuse again.

## How a seat is chosen without pools

A pool did two jobs, grouping and priority. Both move to the seats.

**Grouping.** A role's seats are every seat whose file lists it in `roles`. A role naming
`seat: <id>` draws on that seat alone, and that seat's file must list the role. A role naming a
seat that does not list it is refused at load, naming the seat file to change. Otherwise
`seat:` would be a second link the holder cannot see, which is what this change removes.

**Priority.** Among the seats that serve the role and that no rule passes over, the Igor picks
the one with the most headroom:

1. **Eligible** means every existing rule lets this role spend on the seat now: no open credential
   condition (#101), a reading below the line in both windows, or no reading where the line's
   reserve is 0 (#143), and the role under its `budget_share` ceiling on the seat.
2. **Headroom** of a window is the role's line on that seat minus the reading, in percentage
   points. A seat's headroom is the smaller of its two windows' headrooms, because the window
   with less room is the one that stops it.
3. **A seat with no reading** of a window, eligible because its reserve is 0, counts as 0% used
   there, so its headroom is its line. It is usually a new dedicated seat, and its first run gives
   it the reading that ranks it properly from then on.
4. **Ties** go to the seat whose week resets soonest, because capacity left at the reset is lost.
   The week is the window that is actually lost; a session refills within hours. A seat with no
   known week reset sorts after every seat with one. Seats still tied are taken in id order, so
   the choice is the same on every Igor.

Most headroom prefers dedicated seats at reserve 0 over lent seats with a reserve, without anyone
ordering them: a lent seat's line sits lower, so it has less headroom at the same reading. It also
spreads load, where listed order drained one seat before touching the next.

Exhausting every seat that serves the role is a handoff, as exhausting a pool was.

**Rejected: keeping pools, or an `order` key, beside the seat files.** Either brings back an
operator-controlled ordering the holder does not approve. A holder who wants their seat used last
raises its reserve, which lowers its line and so its headroom.

## How Igor reads whether the holder's approval is enforced

Two questions, read when Igor loads the seat files: does each seat file have a code owner, and is
code-owner review required on the lore repository's default branch. Either failing is a warning on
stderr, never a refusal. The answer is read once per process.

### Code owners are read from the checkout

The lore repository is checked out where Igor runs, so CODEOWNERS is read from disk, with no
network call and no permission. GitHub uses the first of `.github/CODEOWNERS`, `CODEOWNERS` and
`docs/CODEOWNERS` that exists, and Igor reads the same one. The owner of `seats/<id>.yaml` is
decided by GitHub's rule: the last matching line wins. A seat file whose last matching line names
nobody, or that no line matches, has no code owner, and Igor warns, naming the file.

### The review rule is read from GitHub, and may be unreadable

Igor's credential on GitHub is an App installation token (#156), with Contents, Issues and Pull
requests. GitHub offers two places the rule can live, and they need different permissions:

- **A ruleset.** `GET /repos/{owner}/{repo}/rules/branches/{branch}` returns every active rule on a
  branch, and needs only Metadata read, which every installation has. A `pull_request` rule with
  `require_code_owner_review: true` means the rule is in force.
- **Classic branch protection.**
  `GET /repos/{owner}/{repo}/branches/{branch}/protection/required_pull_request_reviews` needs
  Administration read, which an Igor's App does not have and should not be given.

So Igor reads the rulesets first. If one requires code-owner review, the question is answered. If
none does, Igor asks the classic endpoint:

| Classic answer | Igor's warning |
|---|---|
| `require_code_owner_reviews: true` | none |
| `false`, or 404 "Branch not protected" | the rule is not in force on `<branch>` |
| 403, or any other failure | it cannot tell whether the rule is in force: classic branch protection needs Administration read, which this credential lacks. A ruleset is readable by any credential, and `igor doctor` checks with the operator's |

"Cannot tell" is never reported as "not in force", or as in force. The operator guide recommends a
ruleset, so the check works with the credential Igor already has.

Neither check sees **bypass actors**. A ruleset's bypass list can let an admin, or the Actions
actor added for the reconcile workflow, merge a seat change without the holder's review. The rules
endpoint does not report bypass actors, and the ruleset endpoint that does needs Administration.
`igor doctor`, with the operator's credential, reports bypass actors on a ruleset covering `seats/`.

### Who owns what

A code owner on the seat file is not enough on its own. The holder's approval means something only
if nobody can route around the file:

| Path | Code owner | Why |
|---|---|---|
| `/seats/` | the operator | A new seat file's first pull request is reviewed under the base branch's CODEOWNERS, which has no line for it yet |
| `/seats/<id>.yaml` | that seat's holder | The holder approves every change to their seat. Listed after `/seats/`, so it wins |
| `/seats/recipient.txt` | the operator | Whoever replaces it receives every token encrypted afterwards |
| `/.github/` | the operator | CODEOWNERS itself, and the deploy workflow, which handles every secret |
| `/igor.config.yaml` | the operator | It names `seatKey` |

The lore repository's other paths, entries and roles among them, get no code owner from this
change. The template says so, because a `*` line would put every lore pull request behind the
operator's review.

### A holder with no GitHub account

Such a holder cannot be a code owner, so the operator's line stands in for them, and the seat
file's code owner is someone other than its `owner`. `igor doctor` reports it for that seat:
which seat, who stands in, and that the holder's approval is then given outside GitHub. Load does
not warn about it, because the seat file does have a code owner.

## Open

- **The `token_env` name is bound to the seat's id.** Not among #148's decisions. Recommended, for
  the reasons above.
- **A role naming a seat that does not list it is refused.** Recommended: otherwise `seat:` puts
  a seat to work for a role its holder never approved.
- **An eligible seat with no reading ranks as 0% used.** The alternative ranks it last, so a new
  dedicated seat would wait until every read seat had less headroom than its line. Recommended as
  written.
- **The week's reset is the tie-break.** #147 leaned that way, as the window actually lost.
- **Per-role reserves stay on the role, not in the seat file.** #148's direction mentioned
  per-role reserves in the seat file. #143 puts a role's reserve on the role, for every seat it
  draws on, and it can only raise a seat's reserve, never lower it. So the holder's floor needs no
  per-role entry in their file.
- **`igor-lore` is public and on a personal account.** A public repository can't host the runner
  safely, and runner groups exist only for organizations, so neither guard is available to it.
  `seats/adam.yaml` keeps its token in the server's env file by hand (task 9.1). The deploy
  workflow needs the repository made private, or moved to an organization.
- **Whether `write` access lets a holder run `gh secret set`.** GitHub's REST docs say
  "collaborator access"; its settings page says admin for the web form. Task 1.1 measures it, and
  the lender guide is written from the result.
- **What happens when a holder authors a change to their own seat file.** GitHub does not count an
  author's approval, and the holder is that file's only code owner, so the pull request may wait
  for a review nobody else can give. The first pull request is not affected: `/seats/` gives it the
  operator as code owner. Task 1.2 measures a later one, such as a holder raising their reserve,
  and the lender guide says what to do.
