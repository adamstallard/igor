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

**`reserve` is the number that matters to you.** It is decided and specified in
[#143](https://github.com/adamstallard/igor/pull/143) as follows, and is not built yet; *What the
floor rests on* below says what the shipped gate does until it is.

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

**What is specified: the provider's own reading of your seat.** The provider reports how full
your seat is, everything you use Claude for included, in the output of every run an Igor makes
with the credential you hand over. The line above is checked against that reading. So:

- A seat with a `reserve` that nothing has read yet is **passed over**, and the server that runs
  the Igors reads it with one small call on your token. No figure is guessed.
- Between readings an Igor does not see its own spend, so it can pass the line by about one run's
  worth before the next reading stops it. Every run carries a fresh reading.
- If the provider ever stops sending that reading, a seat with a reserve goes idle rather than
  being spent blind.

**What is shipped today counts Igor, not you, and holds a fixed share back.** Until #143 is built,
an Igor records what every run cost, sums it, and stops at `(1 − reserve)` of what your window is
worth in dollars, whatever the time. Nothing in that depends on knowing what you have spent.

What it does depend on is knowing **how many dollars your window is worth**, and that takes a
reading of how full your window is. The provider does report that to the credential you are
handing over — in the output of every run an Igor makes with it, covering everything you use
Claude for as well — but Igor does not read it there unless
[`read-seat-windows-from-the-stream`](../openspec/changes/read-seat-windows-from-the-stream/proposal.md)
has been built, and the `/usage` command Igor does read answers that credential with no window at
all. Until then the figure has to come from a reading taken on your own machine, where you are
signed in normally, with `igor observe`. That command is being withdrawn by the same change,
which reads your seat on the server instead, so do not plan around it.

Until one has been taken, the shipped gate has a fraction and no quantity, and a fraction of an
unknown is not a floor. So, today:

- A seat with a `reserve` and nothing measured yet is **passed over** — no work is charged to
  it, rather than work being charged against a guess. It is not that the floor is unenforced;
  it is that the seat is unused.
- A seat with **no** reserve is spent from uncalibrated, on purpose: nobody's floor is at stake,
  and the first time the provider refuses a run, that refusal is the measurement.
- A seat left out of the configuration entirely **has no ceiling at all**. One item has been
  measured at eleven dollars' worth.

**Getting a reserved seat started** is therefore, today, a sequence, and it is worth agreeing on
before you hand anything over: declare the seat with `reserve: 0`, let it run for a while, have a
reading taken, then add your reserve. Or declare a `capacity_estimate` in the config if somebody
knows roughly what the window is worth — it is reported as an assumption until a reading
replaces it. Under the line neither is needed: a reading below the line is all a reserved seat
wants. `capacity_estimate` is being removed by #143: delete it from your config when you upgrade,
or the config will be refused at load with a message saying so.

Nothing takes that reading on a schedule, and nothing will be installed on your machine to take
one: a job on a lender's machine was proposed and withdrawn. Reading your seat on the server that
runs the Igors, with the token you handed over, is specified in
[`read-seat-windows-from-the-stream`](../openspec/changes/read-seat-windows-from-the-stream/proposal.md),
along with the line above. None of it has been built, so for now it is a thing somebody does by
hand. Lend a seat knowing that, and ask what the fleet actually spent rather than
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
once the dedicated capacity is spent. A personal seat nobody has read yet is not the
fallback either: the pool is treated as empty rather than overflowing into it on a guess.

**Roles can hold back more than your reserve, never less** (specified in #143, not built). A role
may declare a `reserve` of its own, and on every seat it draws on the larger of yours and the
role's applies, so nothing a role says lowers what you are left. Teams use it to give one role
priority over another on the same seat. Say `roles/frontend.yaml` has `seat: pool:engineering` and
`reserve: 0.3`, and `roles/generalist.yaml` has the same `seat` and no `reserve`.

On a seat with no reserve of its own, `frontend` stops starting work once the seat reaches its
line, 70% just after a reset and rising to 100% at the reset, while `generalist` carries on to the
whole window. That is a priority, not a guaranteed share: a `generalist` that always has work can
keep `frontend` near its line for most of a window. Where that matters, leave a seat out of
`generalist`'s pool, or add seats.
