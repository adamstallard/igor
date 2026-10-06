## Where the credential is used today

Every GitHub call `igor run` and `igor serve` make reaches one of three places:

| call site | what goes through it | credential today |
|---|---|---|
| `ghRaw`, `src/gh.ts:33` | every `gh` call: discovery's GraphQL search, claim reads and writes, comments, labels, issue events, `createBranchWithFiles` and `commitOnBranch`, pull requests, merges, the state branch | the inherited environment: `GH_TOKEN`, `GITHUB_TOKEN`, or the host's `gh` login |
| `CloneProvider.provision`, `src/worktree.ts:485-486` | `git clone` of a working tree | `gh auth setup-git`, which writes `gh` into the service user's global git config as the credential helper |
| `ClonedTree.merge`, `src/worktree.ts:445-447` | `git fetch` before a catch-up merge | the same global helper |

The local git calls (`src/config.ts:94`, `src/github.ts:13`, the `rev-parse` and `status` calls in
`src/worktree.ts`) touch no network and need no credential.

So one seam carries every `gh` call, and two carry git. Making those three act as the App
covers the whole of an Igor's traffic.

## The identity is the role's name

**Decided by Adam, 2026-10-04: an Igor acts as the github-app identity named after its role, and
no file in the lore repository names an App.** `igor serve reviewer` acts as `reviewer`. Under
the systemd template the instance is the role, so `/etc/igor/reviewer.env` holds that App's
lines, and a person running `igor serve reviewer` exports the same lines in their shell.

The reasons:

- **One role per Igor (#156) already makes the role the identity.** A second name for the same
  thing is a second place to get it wrong.
- **It matches #148's rule for seats.** A seat file names its token only by `token_env`, so a
  committed file never points the server at a secret. Here no committed file names an App at
  all. With a role key, a pull request changing `github_app: reviewer` to
  `github_app: maintainer` would make the reviewer Igor act as another Igor's App, if that
  identity's credentials were on the same server. With the role's name, only the operator
  decides which App an instance is, through its env file, as `GH_TOKEN` decides it today.
- **Two Igors cannot share an App by accident.** Role names are unique in a lore repository, so
  identities are too. #156's stop detection depends on that, because it compares the actor of
  an `unlabeled` event with the Igor's own account.

**Rejected: a role key `github_app: <identity>`.** It would be visible in the role file and in
`role explain`, and would let a role and its App have different names. It would have to be set
only in a role's own file, refused on a base (or every role extending it shares one App), and
refused where two roles name the same identity. It allows the redirect described above, and
`role explain` reports the identity without it.

**Rejected: an org-level key.** One key gives every Igor the same App, which #156 rules out.

**Where the name collides.** Two lore repositories served from one machine, each with a
`reviewer` role, both act as the identity `reviewer`. Each instance reads only its own
environment, so each acts as whichever App that environment holds, and they don't collide.

## Credentials come only from the environment

**Decided by Adam, 2026-10-05: an Igor reads its App credentials only from its environment.**
`GITHUB_APP_IDENTITY` names the identity the variables belong to, and must be the role's name.
With it come `GITHUB_APP_ID` and exactly one of `GITHUB_APP_PRIVATE_KEY_FILE` or
`GITHUB_APP_PRIVATE_KEY`. On a server they come from the role's environment file, `/etc/igor/<role>.env`. A person running an Igor
exports the same variables in their shell.

The reasons:

- **One place per role.** The systemd unit already reads `/etc/igor/<role>.env`, and that file,
  with the key it points to, can be readable only by that role's service user.
- **Nothing else to install on a server.** No Python and no installed skill.
- **No silent fallback.** A server role whose environment file is incomplete refuses to start,
  naming each missing variable, rather than picking up credentials from a home folder.

With `GITHUB_APP_IDENTITY` unset the variables belong to `default`, as in the skill, so the
refusal says so: `GITHUB_APP_ID` is set for "default" and this Igor acts as "reviewer".

The variable names are the `github-app` skill's environment contract. The skill reads
credentials from the environment when `GITHUB_APP_IDENTITY` names the identity, so its `check`
runs against the same `/etc/igor/<role>.env`. Igor does not depend on the skill.

**Decided by Adam, 2026-10-05: Igor ignores `GITHUB_APP_OWNER` and `GITHUB_APP_INSTALLATION_ID`.**
Igor finds its installation by asking GitHub which one covers its repositories, so it never reads
them. They are the skill's. The skill mints without knowing a repository, so when the App is
installed on more than one account its `check` needs one of them to choose. The role's
environment file may carry them for that reason only.

**Decided by Adam, 2026-10-05: both key variables set is a refusal to start.** With both
`GITHUB_APP_PRIVATE_KEY_FILE` and `GITHUB_APP_PRIVATE_KEY` set, the Igor refuses to start,
naming both, as the skill does, rather than choosing one.

**Rejected: falling back to the skill's stored files**, `~/.config/github-app/<identity>.json`
and `<identity>.pem`, after the environment. A server role with an incomplete environment file
would then silently act on credentials from the service user's home folder, a second place per
role that the unit does not name.

## Mint in TypeScript

**Recommended: Igor mints tokens itself.** The mint is small: sign a JWT with RS256 using
`node:crypto`, ask `GET /repos/{owner}/{repo}/installation` which installation covers the
repository, and `POST /app/installations/{id}/access_tokens` for a token. It needs no
dependency, and every step can be tested with an injected `fetch`.

**Alternative: call the skill's script.** `github_app.py gh …` per `gh` call, and the `env`
command's credential helper for git. Rejected, for four reasons:

- **A runtime dependency on an installed skill and Python 3.8+ and openssl**, at a path Igor
  would have to be told, on every server. Igor's stated dependencies are `git`, `gh`, `claude`
  and `node`.
- **A Python start for every `gh` call.** Discovery and a claim each make several.
- **The script caches tokens on disk**, in `~/.local/state/github-app/<identity>.json`. A
  worker runs as the same user with the same `HOME`, so a live token would sit in a file the
  worker can name. Igor holds tokens in memory only.
- **The `env` command's variables would put a credential helper into every git the service
  runs.** Igor builds the worker's environment explicitly, so they would not reach the worker
  today. They are still a credential source in the parent's environment that nothing needs:
  Igor makes no local commits, because it publishes through the Git Data API, and its one local
  merge stops before committing.

The cost of reimplementing is two readers of one set of variables, which could drift. The
variables are documented in the skill's README, and Igor's tests pin the ones it reads.

The skill stays an optional operator tool. Its `check` confirms an App, its installation and its
permissions, and the docs say so.

## How each call gets the token

**`gh`:** `ghRaw` passes an explicit environment to `spawn`: the Igor's own, with `GH_TOKEN` set
to the current token and `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN` and `GITHUB_ENTERPRISE_TOKEN`
removed. `gh` prefers `GH_TOKEN` over its stored login, so the host's `gh` login is never used.
Commands that take no role leave the seam without an identity, and it spawns `gh` as today.

**git:** the two network calls get, in their child's environment only, `GIT_CONFIG_COUNT`
entries that clear every configured helper for `https://github.com` and add one that prints
`x-access-token` and the token from a variable set for that child. This is the skill's own
mechanism, numbered after any `GIT_CONFIG_*` already present. `gh auth setup-git` goes, which
also stops Igor writing to the service user's global git config. The token is not in an argument
list, where `ps` would show it.

**When it is minted:** the token is renewed once half its life has passed, which is what the
skill does too. A call never starts on a token with less than half an hour left, so a paginated
search or a slow clone cannot outlive it. Each process mints its own. With
`concurrent-instances`, twenty processes mint about forty tokens an hour, far inside GitHub's
limits.

## Knowing its own account

`GET /user` describes a user, so the adapter stops calling it. At startup the Igor reads its
slug from `GET /app`, authenticated by the JWT, and its bot account from
`GET /users/<slug>[bot]`, which gives the numeric id. #156 measured that the App's own label
events carry that id with `type == "Bot"` (`one-claiming-surface/design.md`, 2026-10-04), and
its task 3.5 matches on it.

**Measured 2026-10-04: GraphQL spells a bot's login without `[bot]`, and REST with it.** On a
draft pull request the App `igor-generalist` opened in `adamstallard/igor-throwaway-tests`:

| read | login | type and id |
|---|---|---|
| REST `POST /pulls` and `GET /pulls/{n}`, `.user` | `igor-generalist[bot]` | `Bot`, 337663049 |
| GraphQL `pullRequest { author { login } }` | `igor-generalist` | `__typename: Bot`, `databaseId: 337663049`, `id: BOT_kgDOFCBUSQ` |
| REST `GET /users/igor-generalist[bot]` | `igor-generalist[bot]` | `Bot`, 337663049 |

Discovery reads pull request authors through GraphQL (`src/github-adapter.ts:50` and `:72`,
mapped at `:117`), and `staleOwnArtifact` (`src/predicate.ts:39-44`) compares that author with
`as` by string equality. With `as` set to `igor-generalist[bot]` from `GET /users/<slug>[bot]`,
the Igor's own pull request reads as `igor-generalist`, never matches, and a conflicting artifact
of its own is treated as somebody else's work in review. The requirement *An Igor knows its own
bot account* already covers this: its scenario *A read that spells the login differently still
matches* names both spellings. GraphQL can also return the id, through
`author { login ... on Bot { databaseId } }`, which the same requirement prefers where a read
reports one.

`GET /app` answers only to the JWT. Asked with an installation token it returns 401, *A JSON web
token could not be decoded*, so the slug is read before any token is minted, as step 3 of the
startup check already does.

**Measured 2026-10-04: a Git Data API commit made with an installation token and no `author` or
`committer` is authored by the App's bot, committed by GitHub, and signed.** The App made blob,
tree and commit with the same fields `createBranchWithFiles` sends (`message`, `tree`,
`parents`), then the ref. `POST /git/commits` returned commit
`5fa4b564f94db52569799823e57c13f9e203b79d` with:

| field | name | email | date |
|---|---|---|---|
| `author` | `igor-generalist[bot]` | `337663049+igor-generalist[bot]@users.noreply.github.com` | `2026-10-05T03:53:45Z` |
| `committer` | `GitHub` | `noreply@github.com` | `2026-10-05T03:53:45Z` |

`verification` was `verified: true`, `reason: valid`, a PGP signature by GitHub. REST
`GET /commits/{sha}` gives `.author.login` `igor-generalist[bot]` (`type: Bot`, id 337663049)
and `.committer.login` `web-flow` (`type: User`). So no explicit author is needed in
`createBranchWithFiles`, `commitOnBranch` or the state branch's commit. Whether GitHub still
signs a commit that names an author was not measured, so adding one risks the signature. An actor comparison over
commits must read the author, because the committer is never the Igor.

## Access comes from the installation

GitHub reports an App's bot account as having no write access (`permissions.push` false), even
where its installation writes. Igor reads its
access from the installation's `permissions` in the token response, never from a collaborator
record. Nothing in `src/` reads a collaborator permission today, so this is a rule for what gets
written, not a fix.

## Refusing to start

The startup check does what the skill's `check` does, against the repositories this role
touches, and refuses on the first failure:

1. the environment holds the identity's credentials, or the refusal names each missing
   variable, or both key variables when both are set;
2. the key signs a JWT;
3. `GET /app` accepts the JWT, giving the slug;
4. each worked repository, and the lore repository, has an installation;
5. all of them have the same installation, because one token covers one account;
6. a token mints, and its `permissions` include `contents`, `issues` and `pull_requests` at
   `write`;
7. the bot account resolves to a numeric id.

Workflows write is reported, not required. Most roles never touch `.github/workflows/`, and a
role that does fails at publish naming the permission, which is the moment the operator can act
on it.

This is the same shape as the configuration refusals Igor already makes before any work, such
as a role naming a seat that isn't declared: the cause is the host's configuration, and every
item would fail the same way.

## One installation per Igor

**Decided by Adam, 2026-10-04: an Igor uses one App installation, accepted for now.** One
installation covers one account, so an Igor's worked repositories and its lore repository must
sit on one account, or it refuses to start (step 5 above). If an organization needs an Igor to
reach two accounts, the fix is to mint one token per installation and pick the token by the
repository each call touches.

## A credential refused while running

A key deleted on the App's page, or an uninstalled App, makes the next mint fail with 401 or
404. That is a fact about the Igor, not about the item, and it would recur on every item. It
belongs in whichever record owns credential stops when this is built: #65's breaker on `main`,
or #101's condition record if that has landed. The cure is Igor-scoped, as #101 classifies an
Igor's own credential, under the key `app:<identity>:credential`.

Clearing follows #101's rule for credentials: a change to the credential is observable without
spending an item. The Igor tries to mint once per cycle and resumes when one succeeds. A mint
costs one request and no seat.

## What the worker gets

Nothing new. `workerEnv` (`src/execute.ts:781`) already builds the environment from an
allowlist, so the App's variables and the `GIT_CONFIG_*` entries set for git's children never
reach it. The tree it works in was cloned with a per-command helper, so its `.git/config` names
none.

No task needs the App's token in the worker. The worker edits files, and Igor publishes them
through the Git Data API afterwards. A future task that needs it is a change to
`task-execution`, not a configuration setting.

## Deployment

The per-instance env file, `/etc/igor/<role>.env`, holds the App:

```ini
GITHUB_APP_IDENTITY=<role>
GITHUB_APP_ID=<App ID>
GITHUB_APP_PRIVATE_KEY_FILE=/etc/igor/<role>.pem
```

The env file and the key file are `0600` and owned by the service user. `GH_TOKEN` goes. These
are the skill's environment variables, so the skill's `check` runs against this file as the
service user. The skill's `env` command is not used, for the reasons under *Mint in TypeScript*.

The shared `/etc/igor/env` keeps the seat tokens. #148's deploy workflow writes seat tokens and
nothing of the App, which the operator installs once per role.

## Risks

- **The key sits on disk as the service user, and so does the worker.** A worker that can read
  files outside its tree could read `/etc/igor/<role>.pem`. That is the exposure
  `/etc/igor/<role>.env` already has with `GH_TOKEN` in it, so this change does not widen it.
  `LoadCredential=` does not close it either, because `$CREDENTIALS_DIRECTORY` is readable by the
  unit's processes. Whether a headless worker can read a path outside its working directory is
  not measured. Task 6.3 measures it and files an issue if it can.
- **A host `gh` login is reachable through `HOME`.** The worker gets `HOME`, and `gh` reads a
  stored login from it. With `gh auth setup-git` gone nothing in Igor uses that login, but a
  worker permitted to run `gh` could. The deployment docs tell the operator not to log `gh` in
  as the service user.

## Sequencing with #156

#156 decides that today's assignee claim is removed in the same change that adds the label
claim and App credentials, so no build is left unable to claim (its task 3.6). An App cannot be
assigned, so this change alone leaves an Igor that cannot claim. #156's claim tasks alone leave
an Igor that claims by label as a machine user.

**Decided by Adam, 2026-10-04: this change and #156 are built together, as one gate-two pull
request, and archived together.** Gate two lands on #156's branch, `one-claiming-surface`. This
change's branch, `app-identity`, is merged into it at that point, and #158 is then closed in
favour of #156.
