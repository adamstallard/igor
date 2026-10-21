# Redact every write to the state branch

## Decisions

1. **This change owns credential redaction, the one redaction rule.** The OpenSpec changes in
   pull requests `pre-worker-breaker` (#173), `keep-action-log` (#188),
   `loop-verifies-commands` (#189), `review-evidence` (#190) and every other change that
   redacts text cite this change's requirement and call its function, `redact` in
   `src/redact.ts`, rather than state a rule of their own. Decided by Adam, 2026-10-19. The
   rule's shape is decisions 11 and 12, from Adam on 2026-10-21.
2. **Redaction happens in the two functions that write to the state branch, `writeState` and
   `appendRecord`, not at each caller.** Every record goes through them: the run row in
   `executions.ndjson`, the transcript, the refusal envelope, `deferred.json`, triage's
   `decisions.ndjson`, `capacity.ndjson`, `firings.ndjson`, and the discovery and
   reconciliation watermarks. A record added later, such as #173's `pre-worker` and `outage`
   rows, is redacted on its way to the branch with no code of its own. The commit message is
   redacted too, since anyone who can read the file can read it. *Rejected:* redacting at each
   caller, because a caller that forgets publishes the token.

   Redaction on write also changes records the Igor reads back, such as `deferred.json`,
   which is keyed by item. An item id holding a registered value is read back as
   `[redacted]`, so its deferral no longer matches its item, and the item is worked again each
   poll. A seat token or a variable's secret is random, so no item id is expected to hold one.
   A proxy login that decision 14's rule takes for a token can equal a GitHub owner, and so
   appear in item ids; that case is under Still open.

   A file the Igor rewrites whole, such as `deferred.json`, is redacted whole. An appended
   file, such as `executions.ndjson`, keeps the lines it already had as they were, and the
   branch's history is not rewritten.
3. **The refusal envelope is redacted like every other record.** It is kept so the patterns
   that detect a usage limit and read its reset time can be checked later against what the
   provider said. The reset phrase, the provider's words for when the limit resets, is expected
   to hold no credential. Wherever redaction does replace text, the envelope shows `[redacted]`
   in its place, so a damaged capture is recognisable.
4. **A value is matched only at 8 characters or more** (Adam, 2026-10-20), every registered
   value and every variable's value alike. *Rejected:* matching a seat token of any length by value, because a short
   placeholder token such as `igor` would rewrite every item id that contains it.
5. *Superseded by decision 12 (Adam, 2026-10-21):* finding private key blocks by a bounded
   scan, and redacting a block with no `END` line to the end of the text.
6. *Superseded by decision 12 (Adam, 2026-10-21):* finding a key block's body under the prefix
   its lines carry, such as a diff's `-` or a `cat -n` line number.
7. **A seat's token is remembered for the life of the process, after its seat is removed
   too; a minted installation token or JWT leaves the registry when it expires** (Adam,
   2026-10-21). A removed seat's token may still be live, so text quoting it is still a leak.
   *Rejected:* forgetting a token when its seat leaves the configuration. An installation
   token or JWT the App mints is dropped once it expires, since GitHub no longer accepts it,
   and the Igor mints a replacement before each expires, so a long-running Igor would
   otherwise keep a new one every half hour.
8. **Credential redaction covers what an Igor posts, as well as what it writes to the state
   branch** (Adam, 2026-10-21). Every comment, issue, pull request title and body, and commit
   message it sends to a tracker or a code host passes through `redact`. It is applied in the
   functions every post goes through: the tracker's `report` and `createIssue`
   (`src/github-adapter.ts`), and `openPullRequest`, `createBranchWithFiles`, `commitOnBranch`
   and `mergeIntoBranch` (`src/github.ts`), which both the code host and `igor propose` call;
   `igor propose` opens pull requests that add lore entries. The
   files a commit carries are the work itself and are sent as written. *Rejected:* redacting
   at each caller, for the reason decision 2 gives.
9. *Superseded by decision 12 (Adam, 2026-10-21):* redacting JWTs by pattern, and a URL's user
   name or `user:pass@` part.
10. **The transcript gets credential redaction and nothing more** (Adam, 2026-10-21). What
    else it reveals is the question of `keep-action-log` (#188).
11. **Secrets are matched by value, from a registry** (Adam, 2026-10-21). Every secret the Igor
    holds or gives a worker is registered as the Igor obtains it: each seat's token
    (`resolveToken`); the App's private key, whole and line by line (`readCredentials`); the
    App's JWT and each installation token it mints (`appJwt`, `mint`); every credential
    `workerEnv` hands a worker, including the user info, password and whole URL of a forwarded
    proxy, within decision 14's limit on a user name with no password; and the value of every
    credential-named variable. Each is matched as written, JSON-escaped and URL-encoded,
    longest first, by a plain loop over the values; there are few enough that no
    multi-pattern matcher is needed. The registry lives only in memory and
    is never written or logged. A variable is credential-named where its name holds `TOKEN`,
    `KEY`, `SECRET`, `PASSWORD` or `CREDENTIAL`, case-sensitively and anywhere in the name, the
    list `keep-action-log` (#188) defined.
12. **Patterns are a backstop for exact token shapes only** (Adam, 2026-10-21): a GitHub
    `gh[pousr]_` token whose CRC32 checksum is right; a fine-grained `github_pat_` token of its
    full length; and an Anthropic `sk-ant-` key with its type and version. Removed: private key
    blocks, URL credentials, JWTs, and the AWS, Slack and `age` patterns. By value covers every
    secret the Igor holds before it can leak. A secret the Igor never held usually reaches its
    text from the repository it works on or the item it reads, where anyone who can read the
    state branch or the post can already read it; the exceptions are under Still open. The
    removed patterns over-redacted ordinary text, and they kept growing: three bug-hunter
    passes each found another way of writing a key that the scan of decisions 5 and 6 missed.
    GitHub documents only the fine-grained token's prefix; its 82-character body is the length
    gitleaks' `github-fine-grained-pat` rule matches, and no real token has been measured
    (task 3.8).
13. **An acceptance test runs `redact` over real text and expects no change**: this
    repository's commit messages, docs and specs, and state-branch records taken from
    `adamstallard/igor-throwaway-lore`. The patterns decision 12 removes changed three of those texts.
14. **A proxy URL's user name with no password is registered only where it looks like a
    token** (Adam, 2026-10-21): once percent-decoded, 20
    characters or more and not a plain name. A Kerberos or NTLM proxy takes a user name with no
    password (`http://adamstallard@proxy:3128`), or with an empty one (`adamstallard:`, as curl
    writes it for Negotiate), and the rule treats the two alike. The 20 is the shortest token
    GitHub, Anthropic and most other providers issue; a shorter token used as a user name is
    missed. Such a name is usually a person's login, often equal to a GitHub owner, and registering it would redact that owner from item ids,
    state-branch keys and posted links. A token used as the user name (`http://<token>@proxy`)
    is still registered.

    A plain name is words joined by `.`, `-`, `_`, `@` or `\`, with at least one letter. Each
    word holds at least one character: optional digits, then optionally one run of letters in a single case pattern
    (`doe`, `DOE` or `Doe`, in any script that has case), then optional digits. So
    `ci-runner-2024`, `jdoe-3rd-party` and `CORP\jane.doe` are plain names. A token's random
    characters almost always break the shape: letters resume after digits inside a word
    (`a3f9…`), or a run of letters changes case midway (`eIdz…`). Measured on random
    20-character tokens: no base62 token in 200,000 is taken for a name, 2 base64url tokens are,
    and so are 0.3% of lowercase base36 or hex tokens and 2.6% of uppercase base32 tokens, where
    case gives no signal in either of those last two alphabets. Each alphabet was sampled
    200,000 times. *Rejected:* registering every such user name, which redacts the owner;
    and exempting every one, which lets a token used as the user name through.

**Still open:**

- `signed-publishing` (#153) requires the code to publish exactly the text that the `prose` skill
  verified.
  Redacting in `report` or `openPullRequest` after that check changes a signed text that holds
  a secret, and breaks its footer. Which change gives way is for Adam.
- What an Igor posts to a chat surface (`ChatSurface.reply`, such as Discord) is neither a
  tracker nor a code host, so it is not redacted; no chat surface is built yet. A later tracker
  adapter must also call `redact` itself, since redaction sits in the GitHub functions.
- Files a commit carries are sent as written, but a lore proposal's entry files are built from
  people's review comments, not a worker's work, so a token quoted in a review reaches the
  committed file while the pull request body is redacted. Whether to redact those files is for
  Adam.
- Secrets the Igor never held and no repository holds: the worker runs as the Igor's own user
  under `igor run` (#163, until `worker-user` #175), so it can print host files such as
  `~/.ssh` keys, `~/.aws/credentials` or `~/.netrc` into its transcript. A secret under a name
  outside the credential words, such as `DATABASE_URL` holding `postgres://u:pw@…` or a
  lower-case `_authToken`, is not matched either. No pattern catches these since decision 12.
  Whether to accept that exposure, or how to close it, is for Adam.
- Decision 14's shape rule errs both ways. It takes some logins for tokens, which are then
  redacted wherever they appear, where they are 20 characters or more: camelCase
  (`JaneDoeContractor2024`), letters after digits inside a word (`team-infra-k8s-runners`), an
  apostrophe (`patrick.o'brien.contractor`), and a script without case
  (`li.wei@公司.example.com`). It also takes some single-case tokens for names, as measured
  under decision 14. A rule with neither of those errors would register such a user name only
  together with its host: the whole URL, `<user>@<host>` and `<user>@<host>:<port>`, never
  the bare name. No item id or link holds `<user>@<host>`, and a tool that echoes a proxy's
  credential echoes its host too. It would miss a bare token quoted without its host. Whether
  to replace decision 14's rule with that is for Adam. A login the rule takes for a token is
  also redacted from item ids, so a deferral keyed by such an id no longer matches its item
  (decision 2).
- Branch names and state-branch file paths are not redacted. A branch whose name holds a
  token is pushed under that name, while only its merge commit's message is redacted, and a
  transcript path holding a registered value is written as it is while the pull request's link
  to it is redacted, which breaks the link. Whether to redact names and paths is for Adam.
- The state branch lives in the lore destination, which can be public while the repository
  the worker works on is private. A secret read from the private repository, such as a `.env`
  value the worker quotes in its closing summary, is in no registry and has no token's shape,
  so it reaches the public branch. Whether to accept that, or how to close it, is for Adam.
- The in-force task-execution requirement on what a worker's environment holds says the
  network settings it forwards are not credentials ("None of those is a credential"), while
  this change registers a forwarded proxy URL's credentials. `seat-files` (#171) replaces that
  requirement, so the sentence is #171's to change; reported to #171, not modified here.
- A credential-named variable can hold a value that is no secret: `GITHUB_APP_PRIVATE_KEY_FILE`
  holds a path, which is then redacted from every record and post that names it, including the
  error saying which key file failed to read. `KEY` also matches inside a word such as
  `MONKEY`. Nobody has measured which such variables a deployed Igor has.

## Why

The state branch is as visible as its repository, so on a public repository anyone can read
it. An error message can quote a token, or a URL with credentials in it: a git command echoing
its remote, or a provider's response. Until this change, every record on the branch carried
such text as it came (#213).

## What Changes

- A requirement defining credential redaction, and one applying it to every state-branch write
  and every text the Igor posts.
- `src/redact.ts` holds the rule and its registry. `resolveToken` (`src/budget.ts`),
  `readCredentials`, `appJwt` and `mint` (`src/app.ts`) and `workerEnv` (`src/execute.ts`)
  register each secret as they obtain it.
- `writeState` and `appendRecord` (`src/state.ts`) redact every string they write, object keys
  included, and the commit message.
- The tracker's `report` and `createIssue`, and `openPullRequest`, `createBranchWithFiles`,
  `commitOnBranch` and `mergeIntoBranch`, redact the text they post.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-execution`: credential redaction is defined, and applied to every write to the state
  branch and every text the Igor posts.

## Impact

- `src/redact.ts`, `src/state.ts`, `src/budget.ts`, `src/app.ts`, `src/execute.ts`,
  `src/github.ts`, `src/github-adapter.ts`, and `docs/deployment.md`, which says what the branch
  holds.
- `keep-action-log` (#188) cites this change's requirement instead of defining the rule, and
  its action log, written to the state branch, is redacted twice: by #188's own call to
  `redact` as the log collects each of the worker's tool calls, and by `writeState` on the way
  out.
- `pre-worker-breaker` (#173), `loop-verifies-commands` (#189) and `review-evidence` (#190)
  cite this change's requirement rather than restate the rule.
- `lore-search` (#216) keeps a refused run's whole reply, redacted by this rule (its decision
  96, Adam, 2026-10-21).
- `worker-user` (#175) registers each secret it hands a worker by calling `rememberSecret`.
- `pre-worker-breaker` (#173) masks a failure message's digit and hexadecimal runs, and
  requires redaction to run first, since masking can break up a secret. `appendRecord`
  redacts after the mask, too late for that, so #173's own code must call `redact` before
  masking, as #173's spec requires.
- A new seat token source, such as the encrypted seat file in `seat-files` (#171), registers
  its tokens as the requirement says. #171 also registers the `age` private key that decrypts
  seat files, as a task in its `tasks.md`, since no pattern for that key remains. #171's tests
  need a fixture token of 8 characters or more, since a shorter one is not registered.
- Claude Code sets `CLAUDE_CODE_MESSAGING_TOKEN` inside the worker, and the Igor never sees
  its value, so the registry cannot hold it. `worker-user` (#175) gives it no rule of its
  own either (Adam, 2026-10-21).
