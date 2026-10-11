## Context

The proposal says what must be true. This file covers the parts where how is a choice: how a token
reaches the server, how a seat is chosen without pools, and what a lender's control over their
seat rests on.

Build order is `condition-backoff` (#101), `read-seat-windows-from-the-stream` (#143), then this
change. Where this file says "line", "reading" or "headroom", it means them as #143 defines them: a
seat's line for a window rises from `1 − reserve` just after a reset to 100% at the reset, using
the larger of the seat's and the role's reserve, and a reading is the seat's most recent unreset
observation of the window.

## Decisions (Adam)

- **2026-09-28:** one file per seat; pools dropped.
- **2026-10-04:** no seat file may name `token_command` or `token_file`; this change removes the
  in-force pool requirement; seat choice is most headroom, soonest reset as tie-break (#147).
- **2026-10-11: nothing is specified whose only job is handling an older setup.** Igor has no
  users yet. `adamstallard/igor-lore`'s one seat is moved by hand (task 6.1).
- **2026-10-11: the token travels as ciphertext in the seat file**, replacing the GitHub-secret
  and deploy-workflow model chosen on 2026-09-28. The section below has the reasons.
- **2026-10-11, accepted as this design proposed:** `token_env` is fixed to `IGOR_SEAT_<ID>`; a
  role naming a seat its file does not list is refused; the seat-choice details below; per-role
  reserves stay on the role (#143); base64 age through the `age-encryption` package; the
  seat-id format; `roles` required and possibly empty; an unknown role refused; the config key
  `seatKey`. The `work-triage` requirements that say "pool" are reworded here.
- **2026-10-11: the lender's control is their token, not a review rule.** Adam: "vetoing or
  revoking should be done by revoking their token, not through some other process." This
  supersedes three answers given earlier the same day: a CODEOWNERS line per seat file with
  code-owner review required, Igor warning at load when either is missing, and `igor doctor`
  reporting the operator standing in as code owner for a holder with no GitHub account. None of
  them is specified. *What a lender's control rests on* below has the reasoning.

## How the token reaches the server

**The holder encrypts their token to the server's public key, and the ciphertext goes in their
seat file.** The pull request that adds `seats/<id>.yaml` carries it, as `encrypted_token`. The
server reads the seat file from its lore checkout and decrypts the token with its private key when
it reads the seat. No GitHub secret, no workflow and no runner are involved, and a lender needs no
access to the lore repository beyond opening a pull request, so they can contribute from a fork.

1. The server has an age keypair, made with `age-keygen` as the service user. The private key
   stays on the server at the path `igor.config.yaml` names as `seatKey`. The public key is
   committed as `seats/recipient.txt`.
2. The holder runs `claude setup-token`, encrypts the token to that public key, and opens a pull
   request adding `seats/<id>.yaml` with the ciphertext in it. `igor seat add` does all of it.
3. Once the pull request merges and the server's lore checkout has it, Igor decrypts the token
   with the private key whenever it reads the seat.

Rotating is the same pull request with new ciphertext: `igor seat add` again. Revoking is
revoking the token at Anthropic, which takes effect at once, or removing the seat file.

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
- **Each holder runs their own runner:** breaks the rule that nothing runs on a seat holder's
  machine.

### An operator's own seat may name `token_env` instead

A seat file carries `encrypted_token` or `token_env`, never both. `token_env` serves the seat
whose token the operator holds and puts in the server's env file by hand, such as `igor-lore`'s
`adam` seat or a fleet seat bought for the team, or a token a secret store writes there. It names
a variable and runs nothing, so it is as safe in a contributed file as ciphertext is, and it costs
the operator no encryption step for a token already on the server. Its value is a plain token.

Kept rather than requiring every seat to carry ciphertext: an operator would otherwise encrypt
their own token to their own server only to decrypt it again, and a seat whose token lives in a
secret store would need a re-encryption each time the store rotates it.

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
add`: a lender, on their own machine. With the package, that lender needs Node and `gh`, and no
`age` binary. The server needs `age-keygen` once, to make the keypair. The package is Filippo
Valsorda's TypeScript implementation of the same format.

The decrypted token lives only in the Igor process and the worker it spawns, which is where it
has to be. Nothing writes it to disk or to an argument list.

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
operator-controlled ordering the lender never stated. A holder who wants their seat used last
raises its reserve, which lowers its line and so its headroom.

## What a lender's control rests on

**The lender states the terms, and revoking the token is their veto.** Their own pull request adds
`seats/<id>.yaml` with the roles their seat serves and the reserve it keeps, so the terms on which
it is used are theirs, in a file whose history shows who changed what. Afterwards the operator can
edit that file like any other in the lore repository, and nothing in Igor or GitHub asks the
lender first. What stops a use the lender did not agree to is revoking the token at Anthropic,
which ends the seat at once, wherever the token is and whatever any file says.

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

