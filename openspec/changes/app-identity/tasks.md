## 0. How this is built (Adam, 2026-10-04 and 2026-10-05)

- [ ] 0.1 Built with #156 on `one-claiming-surface`: gate two lands on that branch, with this
      change merged into it at that point, and #158 is closed in favour of #156. Both changes
      are archived together (`design.md`, *Sequencing with #156*)
- [ ] 0.2 Credentials come only from the Igor's environment; nothing reads the `github-app`
      skill's stored files (`design.md`, *Credentials come only from the environment*, decided
      2026-10-05)

## 1. The agreement (gate one — this pull request)

- [x] 1.1 `role-config`: an Igor's GitHub App identity is its role's name; no role file names an
      App; credentials come only from the Igor's environment, under the `github-app` skill's
      variable names
- [x] 1.2 `surface-adapter`: every GitHub call from `run` and `serve` acts as the App; tokens are
      minted on demand and used only in the first half of their life; an Igor knows its own bot
      account; it refuses to start when it cannot act as the App
- [x] 1.3 `task-execution`: nothing that yields an App token reaches the worker or its tree
- [x] 1.4 `design.md`: the call sites, the identity, credentials from the environment only,
      minting in TypeScript against the script, how each call gets the token, startup and
      mid-run failure, deployment, risks, and sequencing with #156

## 2. Credentials and minting

- [ ] 2.1 A new module, `src/app.ts`: read the identity's credentials from the environment only
      (`GITHUB_APP_ID` and exactly one of `GITHUB_APP_PRIVATE_KEY_FILE` or
      `GITHUB_APP_PRIVATE_KEY`, when `GITHUB_APP_IDENTITY` names it). A refusal names each
      missing variable, or both key variables when both are set; environment credentials for
      another identity are named as such. `GITHUB_APP_OWNER` and `GITHUB_APP_INSTALLATION_ID`
      are never read. No file under the `github-app` skill's configuration directory is read
- [ ] 2.2 Sign the RS256 JWT with `node:crypto`, issued a minute early for clock skew; read the
      slug from `GET /app`
- [ ] 2.3 Find the installation per repository with `GET /repos/{owner}/{repo}/installation`;
      refuse repositories on more than one installation, naming the accounts
- [ ] 2.4 Mint with `POST /app/installations/{id}/access_tokens`; hold the token and its
      `permissions` in memory; renew once half its life has passed
- [ ] 2.5 Read the bot account from `GET /users/<slug>[bot]`: login and numeric id
- [ ] 2.6 Tests with an injected `fetch` and a generated key: each missing variable, both key
      variables set refused naming both, stored skill files ignored when the environment is
      incomplete, `GITHUB_APP_OWNER` and `GITHUB_APP_INSTALLATION_ID` naming another account
      leaving the installation found from the repositories, each refusal,
      renewal at half life, reuse within it, and no token written to disk or `process.env`

## 3. Every call as the App

- [ ] 3.1 `ghRaw` (`src/gh.ts:33`): when an identity is set, spawn `gh` with an explicit
      environment carrying `GH_TOKEN` and without `GITHUB_TOKEN`, `GH_ENTERPRISE_TOKEN` or
      `GITHUB_ENTERPRISE_TOKEN`; with none set, spawn as today. Rewrite the module comment at
      `src/gh.ts:3-5`, which says credentials are whatever the user set up
- [ ] 3.2 `CloneProvider.provision` (`src/worktree.ts:485-486`): remove `gh auth setup-git`; give
      `git clone` the per-command `GIT_CONFIG_*` helper, numbered after any already present
- [ ] 3.3 `ClonedTree.merge` (`src/worktree.ts:445-447`): the same for both `git fetch` calls
- [ ] 3.4 `GitHubTracker.identity` (`src/github-adapter.ts:240-246`): return the App's bot login
      instead of calling `GET /user`, and expose the numeric id for #156's task 3.5
- [ ] 3.5 `staleOwnArtifact` (`src/predicate.ts:39-44`) and every other actor comparison accept
      both spellings of the bot login, or compare ids, per the measurement in 6.2
- [ ] 3.6 Tests: an ambient `GH_TOKEN` never reaches `gh`; the clone's `.git/config` and the
      global git config hold no helper afterwards; a person's command spawns `gh` unchanged

## 4. Starting and stopping

- [ ] 4.1 `run` and `serve` (`src/cli.ts:381-383`, `src/cli.ts:529-531`): run the startup check
      in `design.md` before discovery, over the role's source repositories and the lore
      repository, and refuse naming the first failure
- [ ] 4.2 Report a missing Workflows write at startup; a publish touching `.github/workflows/`
      without it fails naming the permission
- [ ] 4.3 A role file setting `github_app` is refused with the reason, in `REFUSED_KEYS`
      (`src/role.ts:117`)
- [ ] 4.4 `explainRole` (`src/role.ts:643`) reports the identity and whether the environment
      holds its credentials, naming any missing variable, without minting a token
- [ ] 4.5 A credential refused mid-run (401 or 404 on a mint) opens `app:<identity>:credential`
      in whichever record owns credential stops when this is built (#65's breaker or #101's
      condition record); the Igor takes no new item, tries a mint once per cycle, and resumes
      on success
- [ ] 4.6 Tests for each refusal message, the Workflows report, and the mid-run stop and recovery

## 5. The worker

- [ ] 5.1 Test through the real spawn path that the worker's environment holds no `GH_TOKEN`,
      `GITHUB_APP_*` or `GIT_CONFIG_*` while the Igor acts as an App (`workerEnv`,
      `src/execute.ts:781`)

## 6. Measurements owed

Record each result in this file's `design.md`, including where it contradicts what is written
there.

- [x] 6.1 Whether a Git Data API commit made with an installation token and no `author` shows
      the App's bot as author; if not, name the bot in `createBranchWithFiles`
      (`src/github.ts:91-94`), `commitOnBranch` (`src/github.ts:176-179`) and the state
      branch's commit (`src/state.ts:46-49`). Measured 2026-10-04: it does, with GitHub as
      committer and a GitHub signature, so nothing changes
- [x] 6.2 How GraphQL spells a bot's login in `author { login }` (`src/github-adapter.ts:50`)
      compared with REST's `user.login`. Measured 2026-10-04: GraphQL `igor-generalist`, REST
      `igor-generalist[bot]`, so task 3.5 must match both or compare `databaseId`
- [x] 6.3 Whether a headless worker can read a file outside its working directory, such as the
      App's key; if it can, file an issue before archiving. It can, through a test it writes and
      runs: #163

## 7. Deployment and docs

The wording of each is written when it is built.

- [ ] 7.1 `deploy/igor.service`: rewrite the comment above `EnvironmentFile=` (lines 37-43) so
      the per-instance file holds the App's identity, ID and key path, is readable only by the
      service user, and holds no `GH_TOKEN`; drop
      the `-` on line 45, because every Igor now needs that file
- [ ] 7.2 `deploy/env.example`: replace the `GH_TOKEN` section (lines 3-5, 21-26) with the three
      `GITHUB_APP_*` lines, one key variable only, and the env and key files' mode and owner;
      `GITHUB_APP_OWNER` or `GITHUB_APP_INSTALLATION_ID` may appear only as the skill's, for its
      `check` when the App is installed on more than one account, and Igor ignores them
- [ ] 7.3 `deploy/docker-compose.yml`: the same lines, and the key mounted read-only
- [ ] 7.4 `docs/deployment.md`: step 1 of *Before it can run* (lines 44-47) creates and installs
      one App per role; line 119's `GH_TOKEN` passage names the App's file; the table at line
      297 gets a row per startup refusal, including both key variables set; say not to log
      `gh` in as the service user; say that the credentials come only from the environment
      file, and name the skill's `check`, run against that file, as an optional diagnosis tool
- [ ] 7.5 Fold `docs/machine-accounts.md` into `docs/deployment.md` and delete it (Adam,
      2026-10-06). Its content becomes a subsection of *Before it can run*, e.g. *Giving an Igor its
      GitHub App*, beside *Adding a seat somebody has given you*, and step 1 points to it. Drop
      the machine-user section and the *Not built yet* paragraph (#156's task 5.4), and replace *Separately: which seat pays* with a one-line link to
      `docs/seats.md`. The subsection carries the steps that create, install and store the App
      itself, not a link to the github-app skill's README, so an operator needs nothing outside
      this repository (Adam, 2026-10-07). The steps, which may be reworded to fit the page but
      keep every field and value:

      ```markdown
      1. **Create the App.** On GitHub, under the account that owns the repositories the role
         works on and its lore repository: **Settings → Developer settings → GitHub Apps → New
         GitHub App**.

         | Field | Value |
         |---|---|
         | GitHub App name | Any free name, such as `igor-<role>`. Commits and claims show as `<name>[bot]`. |
         | Homepage URL | Any; the lore repository's URL is fine. |
         | Webhook | Untick **Active**. Igor polls; nothing receives events. |
         | Repository permissions | **Contents**, **Issues** and **Pull requests**: Read and write. **Workflows**: Read and write only if the role changes files under `.github/workflows/`. |
         | Where can this GitHub App be installed? | **Only on this account.** |

         On the App's **General** page, copy the **App ID**, and under **Private keys** click
         **Generate a private key**. GitHub downloads a `.pem` file; it is the App's password.

      2. **Install it.** In the App's settings, **Install App**, then **Install** on the account,
         choosing **Only select repositories**: every repository the role works on, and its lore
         repository. One installation must cover them all, or the Igor refuses to start.

      3. **Store it on the host.** Move the key to `/etc/igor/<role>.pem` and add the three
         variables to `/etc/igor/<role>.env`, both `0600` and owned by the service user:

             GITHUB_APP_IDENTITY=<role>
             GITHUB_APP_ID=<App ID>
             GITHUB_APP_PRIVATE_KEY_FILE=/etc/igor/<role>.pem

         Start the Igor. If anything is missing or wrong, it refuses to start and names it.
      ```

      Keep the subsection to about 80 lines. If it can't be kept that short, keep it a separate
      page named `docs/accounts.md`, titled "Giving an Igor its own accounts", and say why in the
      PR. Update the links to it: `README.md` (*Running an Igor*, step 1), `docs/deployment.md`
      and `deploy/env.example`
- [ ] 7.6 `README.md`: *Running an Igor*, step 1 (lines 177-182), describes the App, and that a
      person running an Igor exports the same `GITHUB_APP_*` variables in their shell

## 8. Outside this change

- [ ] 8.1 When this is archived, tick #156's tasks 5.2 and 5.4 with a pointer here
