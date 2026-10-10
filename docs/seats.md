# Lending a seat to an Igor

For the person being asked. If you are setting up the server, see
[`deployment.md`](deployment.md) — this is the page to send to whoever's allowance is paying.

## What you are being asked for

An Igor reasons by making Claude calls, and those calls have to be paid for by somebody's
subscription. That is what a **seat** is: your Claude subscription, lent to the fleet.

The intent is that you are not giving up your own use of Claude: an Igor stops at a floor you
set and leaves the rest to you. Read
[What the floor rests on](#what-the-floor-rests-on) before you decide, because the floor is
checked against the provider's reading of your seat, and holds only as well as that reading.

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

**`reserve` is the number that matters to you.**

**At any moment, an Igor leaves `reserve` × the part of your window still to come.** At `0.5` it
leaves half of what remains: half the window just after it resets, a quarter halfway through, and
nothing at the reset itself, when anything unused would be lost anyway. Put the other way, an
Igor starts no new work once your seat, counting everything you have used, is as full as this:

| reserve | just after a reset | a day into a week | halfway | 10% left | at the reset |
|---|---|---|---|---|---|
| 0.3 | 70% | 74% | 85% | 97% | 100% |
| 0.5 | 50% | 57% | 75% | 95% | 100% |
| 1 | 0% | 14% | 50% | 90% | 100% |

At `1` nothing is left for the Igor at the start and the line rises evenly with the clock, so it
spends the window at an even pace. The same line applies to the five-hour window and to the week.

This assumes your own use is spread across the window: the reserve is a share of the time still to
come, not a fixed slice set aside at the start. **If an Igor is taking too much for you, or you tend
to use Claude late in the window, raise your reserve.** That is the adjustment, and there is no
separate setting.

It is measured from a reading of your whole seat, so it adapts to how much you actually use. Use
less and the Igor fills the gap; use more and it stops sooner. Nobody has to know which.

If you want a bigger reserve, say so before you hand the token over. It is one line and nobody
has to argue about it afterwards.

**It is worth knowing what "your window" covers.** Claude Code draws on the same allowance as
Claude on the web, your desktop app and your phone. A lent seat is not a share of some separate
coding budget; it comes out of everything you do with Claude.

### What the floor rests on

**The provider's own reading of your seat.** The provider reports how full your seat is,
everything you use Claude for included, in the output of every run an Igor makes with the
credential you hand over. The line above is checked against that reading. So:

- A seat with a `reserve` that nothing has read yet is **passed over**, and the server that runs
  the Igors reads it with one small call on your token. No figure is guessed.
- Between readings an Igor does not see its own spend, so it can pass the line by about one run's
  worth before the next reading stops it. Every run carries a fresh reading.
- If the provider ever stops sending that reading, a seat with a reserve goes idle rather than
  being spent blind.
- A seat with **no** reserve, used by roles that declare none either, is spent from with no
  reading, on purpose: its line is the whole window, so nobody's floor is at stake, and the
  provider's refusal is what stops it.
- A seat left out of the configuration entirely **has no ceiling at all**. One item has been
  measured at eleven dollars' worth.

Nothing is installed on your machine, and nothing reads your seat through your own login: the
reading comes with the token you hand over, on the server that runs the Igors.

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
else's. The operator lists which seats each role may use, in order, and an Igor takes the first with
headroom — so
listing dedicated seats before personal ones means a colleague's allowance is only ever reached
once the dedicated capacity is spent. A personal seat with a reserve that nothing has read yet
is not the fallback either: it is left alone rather than used on a guess.

**Roles can hold back more than your reserve, never less.** A role
may declare a `reserve` of its own, and on every seat it draws on the larger of yours and the
role's applies, so nothing a role says lowers what you are left. Teams use it to give one role
priority over another on the same seat. Say `frontend` and `generalist` may both use your seat,
`roles/frontend.yaml` has `reserve: 0.3`, and `roles/generalist.yaml` has none.

On a seat with no reserve of its own, `frontend` stops starting work once the seat reaches its
line, 70% just after a reset and rising to 100% at the reset, while `generalist` carries on to the
whole window. That is a priority, not a guaranteed share: a `generalist` that always has work can
keep `frontend` near its line for most of a window. Where that matters, keep a seat that only
`frontend` may use, or add seats.
