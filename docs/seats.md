# Lending a seat to an Igor

For the person being asked. If you are setting up the server, see
[`deployment.md`](deployment.md) — this is the page to send to whoever's allowance is paying.

## What you are being asked for

An Igor reasons by making Claude calls, and those calls have to be paid for by somebody's
subscription. That is what a **seat** is: your Claude subscription, lent to the fleet.

The intent is that you are not giving up your own use of Claude: an Igor stops at a floor you
set and leaves the rest to you. Read
[What is not enforced yet](#what-is-not-enforced-yet) before you decide, because that floor is
not in place today.

## The command

Run this signed in as yourself, on your own machine:

```sh
claude setup-token
```

It opens a browser, you approve, and it prints a long-lived token. That is the whole thing.

You need a Claude subscription for this to work — an API key is not the same and will not do,
because Igor measures what is left of a *window* rather than counting dollars, and only a
subscription has one.

## What it lets an Igor do

Spend your allowance up to a limit written in the team's config, and nothing else. It is not a
login: it cannot read your conversations, your projects, or anything on your machine.

Ask to see the seat's entry before you hand anything over. It looks like this:

```yaml
seats:
  - id: adam
    owner: adam@example.com
    reserve: 0.5          # ← your floor
    token_env: IGOR_SEAT_ADAM
```

**`reserve` is the number that matters to you.** At `0.5` an Igor may spend half your window
and no more, so half is always yours on the worst day the fleet has.

If you want a bigger floor, say so before you hand the token over. It is one line and nobody
has to argue about it afterwards.

**It is worth knowing what "your window" covers.** Claude Code draws on the same allowance as
Claude on the web, your desktop app and your phone. A lent seat is not a share of some separate
coding budget; it comes out of everything you do with Claude.

### What is not enforced yet

**Nothing holds an Igor to that number today.** A seat's remaining window is reported only to
an interactive login, and the credential you are being asked for is not one — so an Igor cannot
see how much of your allowance is left.

Two consequences, and you should hear both before deciding:

- A seat declared the way it is written above is **reported unreadable and skipped**, so an
  Igor given one does no work at all.
- A seat left out of the configuration entirely **has no ceiling**. One item has been measured
  at eleven dollars' worth.

The floor is buildable and being built: an Igor measures exactly what it spends, so it can be
held to a share of a known allowance without ever seeing the rest of yours. Until it is, lend a
seat only where you would be relaxed about the whole window going, and ask what the fleet
actually spent rather than assuming it stopped. Tracking as
[igor#30](https://github.com/adamstallard/igor/issues/30).

## Handing it over

**Not in Slack, not in email.** A long-lived token pasted into a channel is readable by
everyone who joins that channel later, by anything indexing the workspace, and by anyone who
exports the history. This is the step people get wrong, and it is the only step with a lasting
consequence.

Use whatever your team already uses for shared credentials:

- a shared vault entry your password manager gives the operator access to, or
- a one-time secret link, if your manager offers one — it expires after a single read.

The operator puts it in an environment file the service reads, named by `token_env`, and it
lives nowhere else.

## Stopping

Tell whoever runs the server. Removing the variable stops it immediately — a seat whose token
is unset is reported unreadable and skipped, never quietly substituted with some other login.

Treat the token itself as a credential you can rotate: if you want it dead rather than merely
unused, revoke it from your Anthropic account and generate a fresh one for whatever still
needs it.

It will need rotating anyway. A `setup-token` credential lasts **one year** and the lifetime is
not configurable, so at some point you will be asked to run the same command again. Nothing
warns in advance; what happens is that the Igor stops and says it is not logged in.

## Several people, one fleet

Each person runs the command themselves and hands over their own token. Nobody needs anybody
else's. The operator lists the seats in a pool, and an Igor takes the first with headroom — so
listing dedicated seats before personal ones means a colleague's allowance is only ever reached
once the dedicated capacity is spent. That ordering depends on headroom being readable, so it
waits on the same issue as the floor.
