## Deriving it rather than storing it

The alternative was a breaker store beside `capacity.ndjson`: a row per seat holding a count, a
fingerprint and an hour. It was rejected because every fact it would hold is already on the
execution log. `executions.ndjson` records the seat, the cure keys the run minted, and now the
credential it used; grouping by seat and walking back from the newest row answers the whole
question. A store would add a write path that can fail independently of the row it summarises,
and a summary that can disagree with the log it came from is a bug nobody can diagnose from
either side.

The cost is a scan of rows the gate already loads — `loadSpend` reads the same file to attribute
spend, so nothing new is read.

## Trailing, not total

The count is consecutive-from-the-newest and nothing else will do. A total over the log never
falls, so the run let through after the cooldown could succeed and leave the seat held forever.
Any row that is not a refusal of the current credential ends the sequence, which makes "a
successful run closes it" true by construction rather than by a rule written on top.

A rejection whose timestamp cannot be parsed ends the sequence too. A cooldown measured from an
unplaceable moment never expires, and a seat that never comes back is worse than one that burns
an item.

## Why the fingerprint is a full hash

`executions.ndjson` is committed to the destination, so anything derived from the credential is
published. A prefix or a suffix of a token is credential material — a few characters an attacker
no longer has to guess — while a full SHA-256 of a high-entropy secret is not invertible. It is
also not truncated for display: a short digest is cheap to collide, and a collision reads here as
"the same credential resolved", which is the one thing the breaker clears on.

It is computed in `workerEnv`, where `resolveToken` hands over the value, and the value travels
no further. `readAllSeats` resolves once per seat for the same reason and keeps the digest rather
than the token — a second resolution would be a second `token_command`, which is a vault round
trip or an interactive prompt, per seat per cycle.

## What the 401 is asked alongside, and why the two paths differ

A run only mints the key where the provider refused it *and* the run did not finish. The two
paths into that question carry different evidence and are asked differently: a non-zero exit has
already said the run did not finish, so an envelope silent about erroring is still a failure
there; exit zero says the opposite, and a run that published a pull request has to state that it
errored before it can hold its own seat.

The tempting version — one uniform test, copied from `usageLimit`'s `is_error === false` guard —
was tried and rejected. That guard belongs to a decision about what to *write down*, where being
permissive costs a spurious capture. This is a decision to stop using a seat, where being
permissive costs a working seat for up to six hours, and costs it repeatedly: a mis-minted row
extends the trailing run rather than ending it, so every successful half-open probe re-trips the
breaker instead of closing it. Permissive-on-silence is the wrong default on the side of the
asymmetry where the cost is a seat.

The lesson stops at that boundary. Recording decisions here — the refusal capture, the limit
envelope — are right to stay permissive; it is the holding decision that is not.

## Naming the ambient credential

A seat declaring no token source is not outside this. `workerEnv` forwards `CLAUDE_CODE_OAUTH_TOKEN`
and `ANTHROPIC_API_KEY` for such a seat, so its runs are attributable, and `ambientFingerprint`
names them — over the whole set rather than whichever one the provider turns out to prefer, so
replacing either reads as a new credential. Minting the key for a seat whose credential nothing
could name was the alternative: it writes rows the breaker can never count and leaves the loop
this change exists to break standing for that whole configuration.

A login the environment does not carry at all — a signed-in `~/.claude` under the forwarded
`HOME` — is still not named, because nothing local names it. Such a seat can be told that its
credential was refused and cannot be held on it.

## Why no reset command

`stillDeferred` takes the reversal signal to be the natural act rather than a claim about it, and
the same argument applies exactly. Fixing a revoked credential means presenting a different
string, so the next run's fingerprint says it happened. A command that cleared the hold on being
asked would clear it for an operator who believed they had fixed it and had not, and the seat
would go straight back to burning items.

`igor budget --credentials` therefore reports and does not reset. What it is for is the operator
who has just replaced a token and wants to know whether it took.

## Per seat, not per seat and role

The provider refuses a credential, not a role's use of one. Counting per seat-and-role would let
three roles each burn the trip count discovering the same dead credential, which is three times
the cost for no additional information.

## Not a window state

`WindowState` invited this as a member and it does not belong there. A refused credential is true
of the seat — of both windows at once, and of a seat with no window figures at all — so writing
it into each window row would state it twice and imply a per-window answer that does not exist.
An unreadable credential already gets a line of the seat's own; this takes the same shape, under
the seat's rows rather than in place of them, because the headroom above it is real and merely
unspendable.

`SeatVerdict` is the opposite case. It answers "what became of this seat", which is exactly the
question, and `credential` could not be reused: it makes the handoff say the usage could not be
read, which is false here — the usage read perfectly well.

## Provisional constants

Stated the way `token_command`'s timeout is, because no breaker has tripped and anything fitted
now is fitted to nothing.

`BREAKER_TRIP_AFTER = 3`. The unit of cost is a burned item. One refusal trips on a blip, two can
be coincidence, three items is a tolerable one-off against the alternative failure — a working
seat held out of rotation.

Backoff 15m → 30m → 1h → 2h → 4h, capped at 6h, rather than a fixed cooldown. The state being
detected can persist for days. A fixed hour burns twenty-four items a day for as long as it
lasts; doubling burns about six in total, and a fifteen-minute first wait still recovers a
transient provider outage within the cycle a person would notice it in.
