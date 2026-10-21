# Redact every write to the state branch

## Decisions

1. **This change owns credential redaction, the one redaction rule.** It is the rule
   `keep-action-log` (#188) defined, which Adam made the only redaction rule on 2026-10-13,
   extended with the `user:pass@` part of a URL. The OpenSpec changes in pull requests
   `pre-worker-breaker` (#173), `keep-action-log` (#188),
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

   Redaction on write also changes records the Igor reads back, such as `deferred.json`,
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
4. **PGP private key blocks are redacted, and a seat token is matched by value only at 8
   characters or more** (Adam, 2026-10-20). The minimum is the one variable values already
   have. *Rejected:* matching every seat token by value, because a short placeholder token such
   as `igor` would rewrite every item id that contains it.
5. **A key block is found by a bounded scan, not one pattern.** A `BEGIN` line starts a block
   only where a key's body follows within 8 lines and 1 KiB, after blank lines and the PEM and
   PGP armour header lines only. The block then runs to its `END` line within 16 KiB, or else to
   the end of the text. *Rejected:* one pattern, which backtracked for seconds on a header
   followed by padding. *Rejected:* allowing any `Name: value` line before the body, because a
   hex digest after such a line reads as a key body and the text after it is lost. *Rejected:*
   an unbounded search for `END`, which costs time in proportion to the text for every header.
   Redacting to the end of the text where `END` is not within 16 KiB loses the text after a
   long block; keeping it could keep the block's body. The reviewer approves that trade-off with
   this decision.

**Still open:**

- Whether the transcript needs more than this rule, since it holds the worker's whole closing
  summary rather than an error message (#213).
- Whether credential redaction also covers what an Igor posts: a failure handoff's comment on
  the item, and the transcript excerpt in a pull request body. This change covers the state
  branch only.
- Credentials the rule does not name: the GitHub App's signed JWT, which is in no variable
  and has no prefix the rule knows, so an error that quoted it would reach the branch; and a
  token used as a URL's user name with no password (`https://<token>@host`).
- A known gap, open for Adam to decide whether to close: key blocks quoted with a line prefix
  other than indentation or `> ` are not redacted beyond their `BEGIN` line: a diff's deleted
  lines (`-`), line-numbered output (`cat -n`), `#` or `//` comments, or a key split across
  concatenated string literals.
- Whether `src/redact.ts` should forget a seat's token once its seat is removed from the Igor's
  configuration while it runs. It keeps every
  token it has read for the life of the process.
- `lore-search` (#216) records Adam accepting, on 2026-10-20, that a refused run keeps "the
  provider's whole reply". This change replaces the credentials in that reply, so the reply is
  no longer kept whole. One of the two texts needs rewording, and which is for Adam.

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
  its action log, written to the state branch, is redacted twice: by #188's own call to
  `redact` as the log collects each of the worker's tool calls, and by `writeState` on the way
  out.
- `loop-verifies-commands` (#189) and `review-evidence` (#190) name #188 as the rule's owner;
  they cite this change instead.
- `pre-worker-breaker` (#173) masks a failure message's digit and hexadecimal runs, and
  requires redaction to run first, since masking can break up a token's shape. `appendRecord`
  redacts after the mask, too late for that, so #173's own code must call `redact` before
  masking, as #173's spec requires.
- A new seat token source, such as the encrypted seat file in `seat-files` (#171), registers
  its tokens as the requirement says. #171's tests need a fixture token of 8 characters or
  more, since a shorter one is not registered.
- `keep-action-log` (#188), `loop-verifies-commands` (#189) and `review-evidence` (#190) summarise
  the rule as matching seat tokens by value. Their summaries omit the 8-character minimum,
  which the requirement they cite now states.
