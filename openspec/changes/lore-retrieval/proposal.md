## Why

Lore exists and nothing reads it. Six entries are curated, reviewed and active in a store no
agent consults, so every claim this project makes about institutional memory is so far
unrealized.

This change fires lore into a worker's context. It is deliberately separate from
`core-igor-loop`, because an Igor without lore is not broken — it has its role, the work item,
and the codebase. Lore is additive, so making the first Igor wait on it would have been a
false dependency.

**Depends on `lore-store`** for the entries and `core-igor-loop` for something to fire into.

## What Changes

**Entries fire unbidden.** Matching entries are injected before the worker runs. The worker
never issues a query and never elects to search — that distinction is the whole point, because
lore exists for what a worker would not know to ask for. Anything it would think to look up is
already covered by reading the codebase.

**The whole in-scope store is injected.** Six entries are 1,600 tokens including bodies; their
claims and conditions alone are 308. There is nothing to select from, so nothing selects. Each
entry carries its `conditions.prose` — "when throwing from code reachable by a request handler"
— which is a relevance statement addressed to a reader, and the worker is a reader.

Selection is a real problem at a size this store is nowhere near, and every mechanism for it
is deferred rather than guessed at: no index, no ranking, no cap that bites, no conflict
resolution. Building them now means authoring thresholds against no data.

**Only `active` entries fire, and only those in scope.** Status and scope are exact filters,
always applied. Neither is a relevance judgment — they are review state and visibility, and
letting a guess decide who may see what is a different class of error from getting relevance
wrong.

**A token budget bounds what is injected, and exceeding it is reported, not resolved.**
Whichever entries a rule discarded, nobody chose that rule, and the resulting miss is
invisible: the worker proceeds confidently without the lesson and nothing looks wrong. So the
run says "47 in-scope entries, 12k tokens, over the 4k budget" and hands the problem to a
person. That message is also the trigger for building the relevance filter.

**Support ships as payload, not as a ranking.** How many people independently asserted a lesson
tells a worker how firmly to hold it — "five independent citations" reads differently from
"single occurrence, kept because it is architectural". But whether an entry is trustworthy at
all was settled at review, when a human saw its provenance and approved it. Re-litigating that
at retrieval would be doing review's job again, automatically and worse.

**Recency is dropped.** It ranked nothing and misled: every entry in the real store scores
between 0.03 and 0.34 on a 365-day half-life, because lore is mined from historical review
comments and is old by construction. The most architectural lesson in the store scored lowest.
A date is a fact; a decayed score is a judgment wearing the costume of one. Entries report the
date of their newest evidence, and `scoring.halfLifeDays` goes away.

**What fired is recorded on the state branch.** Machine output goes where machine output goes,
beside discovery watermarks and execution transcripts. Writing counts into the entry files
would mean a commit to human-reviewed material on every fire, merge conflicts against human
edits, and `git blame` on a curated corpus buried under churn.

Explicitly out of scope:

- **The model-judged relevance filter.** One call receives every in-scope condition and the
  item, and answers which apply. Needed when the store outgrows the token budget, and not
  before. It is also how condition vectors eventually get their training data, so it precedes
  them rather than competing with them (§4.2.1).
- **Learned condition vectors and the vector index.** A small open-weight recognizer is the
  design (§4.1) and it is buildable; what is missing is the contrastive examples to derive
  vectors from, which the filter produces.
- **The promote/prune feedback loop.** Fire counts are recorded here; acting on them waits
  until there is history to act on. Reasoning in §3.4.1, tracked as adamstallard/igor#4.
- **Conflict resolution at retrieval.** Two contradictory active entries are a store defect,
  and recognising the contradiction requires understanding both — which only the worker has.
  Inject both and let it say so.

## Capabilities

### New Capabilities

- `lore-firing`: Selecting active, in-scope entries; injecting them into the worker's trusted
  channel with their conditions, bodies and support; holding the result to a token budget and
  reporting rather than truncating when it does not fit; recording what fired.

### Modified Capabilities

- `lore-store`: `scoring.halfLifeDays` and the derived recency score are removed; entries
  report the date of their newest provenance instead. The entry files themselves are
  unchanged — firing records live on the state branch.

## Impact

- Reads the lore store and writes nothing back to it.
- Changes what a worker sees, so a bad entry now affects output rather than sitting inert.
  That is the point, and it is why only reviewed entries fire.
- Injected lore is trusted content in the worker's system channel, unlike the item body. The
  gate for that trust is review, which is what makes `provisional` mean something.
- Establishes the injection path a relevance filter, and later condition vectors, slot into
  without changing anything above them.
