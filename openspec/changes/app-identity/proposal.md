## Why

**An Igor cannot act as its GitHub App, so it cannot run anywhere `one-claiming-surface` (#156)
applies.** That change decides that every Igor on GitHub is a GitHub App and claims by its
`igor:<role>` label, and defers the App's credentials to a separate change (its task 5.2). This
is that change, and it is what Adam needs to run Igor on Igor ([#157](https://github.com/adamstallard/igor/issues/157)).

Today an Igor acts as whatever credential its host already has:

- **Every `gh` call** goes through one spawn (`src/gh.ts:33`) that inherits the Igor's whole
  environment, so it acts as the ambient `GH_TOKEN` or the host's `gh` login. Discovery,
  claiming, comments, labels, the Git Data API commits that publish work
  (`createBranchWithFiles`), pull requests and the state branch all pass through it.
- **git** clones and fetches with the credential helper that `gh auth setup-git` writes into the
  service user's global git config (`src/worktree.ts:485`).
- **The Igor's own name** comes from `GET /user` (`src/github-adapter.ts:242`), a user's
  endpoint. An App's installation token has no user behind it.
- **Deployment** puts a machine user's `GH_TOKEN` in `/etc/igor/<role>.env`.

An App's installation token lasts one hour and is minted from the App ID and its private key.
Nothing in Igor mints one.

## What Changes

**An Igor acts as the GitHub App named after its role.** `igor serve reviewer` acts as the
github-app identity `reviewer`. Nothing in the lore repository names an App, a key or a key
path.

**An Igor reads its App credentials only from its environment** (Adam, 2026-10-05). On a server
that is the role's environment file, `/etc/igor/<role>.env`; a person running an Igor exports
the same variables in their shell. The variables are the `github-app` skill's names, so the
skill's `check` works against the same file, but Igor does not depend on the skill and never
reads its stored files.

**Every GitHub call `igor run` and `igor serve` make runs as that App, and nothing falls back to
an ambient credential.** Igor mints the installation token itself, keeps it in memory, renews it
at half its life, and hands it only to the one `gh` or `git` process making the call. The
token is never written to disk, to the Igor's own environment, or to any git config.

**The worker gets nothing of the App.** Its environment stays as `task-execution` already
requires: the search path, a home directory, network settings and one seat token. The tree it
works in carries no credential either.

**An Igor that cannot act as its App refuses to start, saying why.** A missing credential
variable, a key GitHub refuses, an App not installed where a repository is, a repository outside
the installation, and a missing permission each refuse with a named reason. A credential that
GitHub stops accepting while the Igor runs stops it taking new work until a token mints again.

**An Igor knows its own bot account**: its login, `<slug>[bot]`, and numeric user id, read once
at startup. #156's stop detection compares event actors against the id.

**Deployment describes the App, not a machine user.** The unit's per-instance env file holds
the App's identity, ID and key path, and `GH_TOKEN` goes. The operator steps are tasks here;
their wording is written when they are built.

Out of scope:

- **A person's own commands.** `propose`, `reconcile`, `init`, `promote`, `observe` and
  `budget` take no role and keep acting as the person who runs them.
- **An Igor reaching repositories on two accounts.** One installation covers one account, so an
  Igor whose worked repositories and lore repository sit on different accounts is refused.
  Adam accepted this for now on 2026-10-04; minting one token per installation is the fix if an
  organization needs it.
- **Linear.** Its app user's credential is the `linear-app` skill's and a Linear adapter's
  concern (#156, task 5.1).

**Built with #156.** Adam decided on 2026-10-04 that this change and `one-claiming-surface`
are built as one gate-two pull request on that change's branch, and archived together. This
change is merged into `one-claiming-surface` at that point, and #158 is closed in favour of
#156.

## Capabilities

### Modified Capabilities

- `role-config`: an Igor's GitHub App identity is its role's name, and its credentials come only
  from its environment.
- `surface-adapter`: on GitHub, every call acts as the Igor's App, through a token minted on
  demand; an Igor knows its own bot account; it refuses to start when it cannot act as the App.
- `task-execution`: the worker's environment and working tree hold nothing of the App.

## Impact

- `src/gh.ts`, `src/worktree.ts`, `src/github-adapter.ts`, `src/cli.ts`, and a new module for
  App credentials and minting.
- `deploy/igor.service`, `deploy/env.example`, `deploy/docker-compose.yml`,
  `docs/deployment.md`, `docs/machine-accounts.md`, `README.md`.
- Carries #156's task 5.4 (the machine-user steps leave the docs), because App support ships
  here.
- An operator moving from a machine user creates one App per role, installs it on the account
  holding the worked and lore repositories, and replaces `GH_TOKEN` with the App's three lines.
