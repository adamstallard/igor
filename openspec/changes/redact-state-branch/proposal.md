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
   which is keyed by item. No item id or seat name is expected to hold a secret's exact value;
   one that did would be read back as `[redacted]`, and its deferral would no longer match its
   item.

   Only new writes are redacted. Records already on the branch, and its history, are not
   rewritten.
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
   too** (Adam, 2026-10-21). A removed seat's token may still be live, so text quoting it is
   still a leak. *Rejected:* forgetting a token when its seat leaves the configuration. An
   installation token or JWT the App mints is dropped once it expires, since GitHub no longer
   accepts it and the Igor mints a new one every hour.
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
    proxy; and the value of every credential-named variable. Each is matched as written,
    JSON-escaped and URL-encoded, longest first, by a plain loop over the values; there are
    few enough that no multi-pattern matcher is needed. The registry lives only in memory and
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
    gitleaks' `github-fine-grained-pat` rule matches.
13. **An acceptance test runs `redact` over real text and expects no change**: this
    repository's commit messages, docs and specs, and state-branch records taken from
    `adamstallard/igor-throwaway-lore`. The patterns decision 12 removes changed three of those texts.

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
- A credential-named variable can hold a value that is no secret: `GITHUB_APP_PRIVATE_KEY_FILE`
  holds a path, which is then redacted from every record and post that names it, including the
  error saying which key file failed to read. `KEY` also matches inside a word such as
  `MONKEY`. Nobody has measured which such variables a deployed Igor has.
- A proxy URL with a user name and no password, as a Kerberos or NTLM proxy takes
  (`http://adamstallard@proxy:3128`), registers that user name, since decision 11 registers a
  proxy URL's whole user info. A user name is usually no secret and often equals a GitHub
  owner, so it is then redacted from item ids, state-branch keys and posted links. Exempting a
  user name with no password would let a token used as the user name (`http://<token>@proxy`)
  through. Whether to exempt it is for Adam.
- `seat-files` (#171) gives the Igor the `age` private key that decrypts seat files. #171
  registers the decrypted tokens; it must register that key too, since no pattern for it
  remains.
- Claude Code sets `CLAUDE_CODE_MESSAGING_TOKEN` inside the worker, and the Igor never sees
  its value, so the registry cannot hold it, and a worker that prints it reaches the
  transcript unredacted. Whether `worker-user` (#175) closes that is for Adam.
- `lore-search` (#216) records Adam accepting, on 2026-10-20, that a refused run keeps "the
  provider's whole reply". This change replaces the credentials in that reply, so the reply is
  no longer kept whole. One of the two texts needs rewording, and which is for Adam.

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
- `loop-verifies-commands` (#189) and `review-evidence` (#190) name #188 as the rule's owner;
  they cite this change instead.
- `pre-worker-breaker` (#173) masks a failure message's digit and hexadecimal runs, and
  requires redaction to run first, since masking can break up a secret. `appendRecord`
  redacts after the mask, too late for that, so #173's own code must call `redact` before
  masking, as #173's spec requires.
- A new seat token source, such as the encrypted seat file in `seat-files` (#171), registers
  its tokens as the requirement says. #171's tests need a fixture token of 8 characters or
  more, since a shorter one is not registered.
