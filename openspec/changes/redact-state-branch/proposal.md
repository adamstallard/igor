# Redact every write to the state branch

## Decisions

1. **This change owns credential redaction, the one redaction rule.** It is the rule
   `keep-action-log` (#188) defined, which Adam made the only one on 2026-10-13, extended with
   the `user:pass@` part of a URL. `pre-worker-breaker` (#173), `keep-action-log` (#188),
   `loop-verifies-commands` (#189), `review-evidence` (#190) and every other change that
   redacts text cite this change's requirement and call its function, `redact` in `src/redact.ts`,
   rather than state a rule of their own. Decided by Adam, 2026-10-19.

   The rule matches the credentials the Igor knows by exact value as well as by pattern.
   *Rejected:* patterns alone, which miss a token whose shape no pattern names. *Rejected:*
   matching variables by name alone, which misses a seat whose `token_env` names a variable
   such as `SEAT_A`.
2. **Redaction happens in the two functions that write to the state branch, `writeState` and
   `appendRecord`, not at each caller.** Every record goes through them: the run row in
   `executions.ndjson`, the transcript, the refusal envelope, `deferred.json`, triage's
   `decisions.ndjson`, `capacity.ndjson`, `firings.ndjson`, and the discovery and
   reconciliation watermarks. A record added later, such as #173's `pre-worker` and `outage`
   rows, is redacted on its way to the branch with no code of its own. The commit message is
   redacted too, since anyone who can read the file can read it. *Rejected:* redacting at each
   caller, because a caller that forgets publishes the token.

   Redaction by value also applies to records the Igor reads back, such as `deferred.json`,
   which is keyed by item. No item id or seat name is expected to hold a credential's exact
   value; one that did would be read back as `[redacted]`, and its deferral would no longer
   match its item.

   Only new writes are redacted. Records already on the branch, and its history, are not
   rewritten.
3. **The refusal envelope is redacted like every other record.** It is kept so the patterns
   that detect a usage limit and read its reset time can be checked later against what the
   provider said. The reset phrase, the provider's words for when the limit resets, is expected
   to hold no credential. Wherever redaction does replace text, the envelope shows `[redacted]`
   in its place, so a damaged capture is recognisable.

**Still open:**

- Whether the transcript needs more than this rule, since it holds the worker's whole closing
  summary rather than an error message (#213).
- Whether the rule also covers what the Igor posts: a failure handoff's comment on the item,
  and the transcript excerpt in a pull request body. This change covers the state branch only.
- Credentials the rule does not name: the GitHub App's signed JWT, held only in memory, and a
  token used as a URL's user name with no password (`https://<token>@host`).
- `lore-search` (#216) records Adam accepting, on 2026-10-20, that a refused run keeps "the
  provider's whole reply". This change redacts that reply's credentials. One of the two needs
  rewording, and which is for Adam.

## Why

The state branch is as visible as its repository, so on a public repository anyone can read
it. An error message can quote a token, or a URL with credentials in it: a git command echoing
its remote, or a provider's response. Until this change, every record on the branch carried
such text as it came (#213).

## What Changes

- A requirement defining credential redaction, and one applying it to every state-branch write.
- `src/redact.ts` holds the rule. `resolveToken` (`src/budget.ts`) remembers every seat token
  it reads, so the rule knows it by value.
- `writeState` and `appendRecord` (`src/state.ts`) redact every string they write, object keys
  included, and the commit message.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `task-execution`: credential redaction is defined, and applied to every write to the state
  branch.

## Impact

- `src/redact.ts`, `src/state.ts`, `src/budget.ts`, and `docs/deployment.md`, which says what
  the branch holds.
- `keep-action-log` (#188) cites this change's requirement instead of defining the rule, and
  its action log, written to the state branch, is redacted twice: as the log collects each of
  the worker's tool calls, and on the way out.
- `loop-verifies-commands` (#189) and `review-evidence` (#190) name #188 as the rule's owner;
  they cite this change instead.
- `pre-worker-breaker` (#173) masks a failure message's digit and hexadecimal runs, and
  requires redaction to run first, since masking can break up a token's shape. `appendRecord`
  redacts after the mask, too late for that, so #173 still calls `redact` before masking.
- A seat token is known by value only where it passes through `resolveToken`. A new token
  source, such as the encrypted seat file in `seat-files` (#171), calls `rememberSecret` or
  goes through `resolveToken`.
