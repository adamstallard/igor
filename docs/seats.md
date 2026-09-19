# Lending a seat to an Igor

For the person being asked. If you are setting up the server, see
[`deployment.md`](deployment.md) — this is the page to send to whoever's allowance is paying.

## What you are being asked for

An Igor reasons by making Claude calls, and those calls have to be paid for by somebody's
subscription. That is what a **seat** is: your Claude subscription, lent to the fleet.

The intent is that you are not giving up your own use of Claude: an Igor stops at a floor you
set and leaves the rest to you. Read
[What the floor rests on](#what-the-floor-rests-on) before you decide, because the floor holds
only once somebody has measured what your window is worth.

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

```yaml igor:budget
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

### What the floor rests on

**The floor holds by counting Igor, not by watching you.** An Igor records what every run cost,
sums it, and stops at `(1 − reserve)` of the window. Nothing in that depends on knowing what you
have spent, so the number holds whatever else you do with Claude that day.

What it does depend on is knowing **how many dollars your window is worth**, and that cannot be
read through the credential you are handing over: a `setup-token` login resolves no subscription,
so the provider tells it nothing about your limits. The figure has to come from a reading taken
on your own machine, where you are signed in normally.

Until one has been taken, an Igor has a fraction and no quantity, and a fraction of an unknown
is not a floor. So:

- A seat with a `reserve` and nothing measured yet is **passed over** — no work is charged to
  it, rather than work being charged against a guess. It is not that the floor is unenforced;
  it is that the seat is unused.
- A seat with **no** reserve is spent from uncalibrated, on purpose: nobody's floor is at stake,
  and the first time the provider refuses a run, that refusal is the measurement.
- A seat left out of the configuration entirely **has no ceiling at all**. One item has been
  measured at eleven dollars' worth.

**Getting a reserved seat started** is therefore a sequence, and it is worth agreeing on before
you hand anything over: declare the seat with `reserve: 0`, let it run for a while, have a
reading taken, then add your reserve. Or declare a `capacity_estimate` in the config if somebody
knows roughly what the window is worth — it is reported as an assumption until a reading
replaces it.

Taking that reading on a schedule is still being built
([igor#30](https://github.com/adamstallard/igor/issues/30)), so today it is a thing somebody
does by hand. Lend a seat knowing that, and ask what the fleet actually spent rather than
assuming a number in a file did the work.

## Handing it over

**Not in Slack, not in email.** A long-lived token pasted into a channel is readable by
everyone who joins that channel later, by anything indexing the workspace, and by anyone who
exports the history. This is the step people get wrong, and it is the only step with a lasting
consequence.

Use whatever your team already uses for shared credentials:

- a shared vault entry your password manager gives the operator access to, or
- a one-time secret link, if your manager offers one — it expires after a single read.

The operator puts it wherever the seat's entry names — an environment file for `token_env`, or
a file or secret-store entry for `token_file` / `token_command` — and it lives nowhere else.

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
once the dedicated capacity is spent. A personal seat nobody has measured yet is not the
fallback either: the pool is treated as empty rather than overflowing into it on a guess.
