## Finding: the seat's own credential can read its windows

Recorded 2026-09-27. The rest of this document is unchanged and was written before it; read it
with this section in mind. **Whether to withdraw this change, cut it down, or keep a remnant is
the reviewer's decision** — this section records what the finding does to each part, and decides
none of it.

**What was found.** A worker run — `claude -p … --output-format stream-json --verbose`, which is
how every worker is already spawned — under a seat's `setup-token` credential emits a
`rate_limit_event` carrying both windows' utilization and reset, the provider's warning status,
and whether extra usage is being spent. `/usage` under the same credential returns a cost
summary, and `GET /api/oauth/usage` refuses it for want of `user:profile`; the stream is not
gated that way. Full detail, and the capture, in
[`docs/architecture.md` §6.3.3](../../../docs/architecture.md#633-a-seat-token-is-measured-from-the-workers-own-stream).
Reading it is specified in `read-seat-windows-from-the-stream`; Igor discards the event unless
that change has been built.

**What that overtakes here.**

- *Context* above: "the reading only answers to a credential the provider can resolve a
  subscription for, and the fleet holds none. So the one component that measures a seat has to
  be installed on the machine of the person lending it." The fleet holds a credential that reads
  the seat on every run. The sensor does not have to be the lender's laptop.
- The proposal's case for a shared seat: that its refusal divides Igor's spend by a window the
  owner also drew on, so it "needs a reading taken where the whole window is visible". A stream
  reading is of the whole seat, owner's use included — the same seat-wide figure a laptop's
  `/usage` reading would give, arriving once per worker run instead of once per half hour.
- *The reading runs as a signed-in person, not as a service.* True of `/usage`, which is what it
  was written about; no longer the only reading there is, so no longer the constraint "the whole
  arrangement is built around".
- *Appending an observation requires write access to the state branch*, as an obstacle to lending.
  A stream reading is written by the fleet with the access it already has; a lender outside the
  team no longer needs push access for their seat to be measured. It remains true of `igor
  observe`.
- *Roads not taken: reading on demand* — "impossible … the fleet cannot take a reading." The fleet
  takes one on every run it makes.

**What the finding does not reach.**

- **A reserved seat with no figure is never run, so never read.** The in-force rule passes over a
  seat with a reserve and neither an observation nor a declared capacity. A stream reading needs a
  run, so it cannot start such a seat. Today's ways to start one — a declared `capacity_estimate`,
  running at `reserve: 0` first, or `igor observe` on the owner's machine — are still needed, and a
  scheduled reading is one of them. So is a deliberate small probe run under the seat's own token,
  which is not free and is not specified anywhere.
- **A seat the fleet is not using goes unread.** Readings arrive when runs happen. A scheduled
  reading keeps a figure fresh through a quiet day; a stream reading does not. Since a stream
  reading is a lower bound until its window resets, and a seat is read again the moment it is next
  run, this matters for reporting more than for safety.
- **A seat below every threshold** may not report numbers on the stream at all. Unverified; a fresh
  seat's first run settles it. If it does not, the lender's reading stays the only one until the
  seat crosses a threshold.
- **Measuring a window's length from successive resets** stands, and is better served: a stream
  reading's reset is epoch seconds, needing no phrase resolution, and arrives on every run.
- **Irregular arrival** stands: stream readings are as irregular as the work.
- **`igor observe` itself** is shipped (tasks 1.x) and correct for what it reads.

**Unverified: "answered client-side".** The proposal and the first requirement say `/usage` "is
answered client-side" and "does not consume any part of the window it reports". What was measured
is an envelope reporting `total_cost_usd: 0`, `num_turns: 0` and empty `modelUsage` in 485ms. That
supports "spends no model tokens"; it does not establish where the answer comes from, and a figure
of two windows' utilization has to come from the provider somehow. Treat the claim as unverified,
not as false. It does not change that the reading is free.

## Context

Everything else in this repository runs where the fleet runs. This does not, and cannot: the
reading only answers to a credential the provider can resolve a subscription for, and the fleet
holds none. So the one component that measures a seat has to be installed on the machine of the
person lending it, by that person, as a favour, and stay working without their attention.

That is an unusual constraint for a scheduler decision, and it decides most of what follows. The
audience for the procedure below is somebody who agreed to help, has no stake in the fleet, will
not read a second page, and will uninstall anything that starts producing notifications.

## Decisions

### A timer, not a hook or a daemon

The reading has to happen whether or not the lender is using Claude, so nothing about their
activity can be the trigger. A long-running process of our own would be a second thing to keep
alive on somebody else's laptop, and would have to be restarted after every reboot by the same
mechanism a timer would have used anyway. Each platform already has a supervised timer that
survives reboot, logs somewhere standard, and can be removed in one line. Use it.

### Every thirty minutes

The session window is five hours, so a half-hourly reading is never more than a sixtieth of a
window stale. The reading costs nothing, so there is no pressure the other way, and the only
real limit is that each run spawns a process on somebody's laptop.

Thirty minutes is arithmetic against a five-hour window rather than a tuned constant, which is
why it is here and not in the list of things to fit later.

### Run it as the user, in their login session

The credential is in the lender's own home directory and keychain. On macOS that means a
LaunchAgent in `~/Library/LaunchAgents`, never a LaunchDaemon: a daemon runs as root outside any
login session and would not find the credential, and asking for one would be asking a favour at
root. On Linux it means the user's own crontab, or a `systemd --user` unit, not a system unit.

### Derive the window length here rather than configure it anywhere

A recurring reading produces successive reset times for free, and their difference is the window
length. Putting the same number in configuration would create a second source for a fact that
already arrives twice an hour, and the configured one would be the one that silently went wrong.

### Write through the existing append path

`appendRecord` day-partitions any `.ndjson` and the observation log is already specified as one.
The scheduled job therefore adds no storage mechanism, and a reading taken by hand and a reading
taken by the timer are indistinguishable once written, which is what makes the schedule optional
rather than load-bearing.

### Fail quietly to a log, loudly to the operator

A failed reading on a laptop is usually a closed lid or a lapsed login, and neither deserves a
notification on somebody's personal machine. The job writes to a log file and exits non-zero;
what surfaces the problem is the age of the newest observation, which the budget report already
has to show. The person who needs to know is the operator, not the lender.

## Installing it

**On the machine of somebody whose seat an Igor shares, and nowhere else.** A seat only Igors
use derives its capacity from its own first refusal, needs no reading, and has no interactive
login to take one under — installing this against a dedicated seat is not merely unnecessary,
it cannot work. See the proposal for why the two cases differ.

Every block below is a single paste. Replace `/opt/igor` with wherever `igor` is installed and
`you` with the account name.

Confirm the reading works before scheduling anything:

```sh
igor observe
```

It should exit 0 and print the observation it appended. If it reports that the credential
resolves no subscription, the shell has a seat token set — usually `ANTHROPIC_API_KEY` or an
`IGOR_SEAT_*` variable exported from a shell profile — and the job must not inherit it.

### macOS: a LaunchAgent

Write `~/Library/LaunchAgents/ai.igor.observe.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>              <string>ai.igor.observe</string>
  <key>ProgramArguments</key>
  <array>
    <string>/opt/igor/bin/igor</string>
    <string>observe</string>
  </array>
  <key>StartInterval</key>      <integer>1800</integer>
  <key>RunAtLoad</key>          <true/>
  <key>StandardOutPath</key>    <string>/Users/you/Library/Logs/igor-observe.log</string>
  <key>StandardErrorPath</key>  <string>/Users/you/Library/Logs/igor-observe.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>             <string>/usr/local/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
```

Load it:

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/ai.igor.observe.plist
launchctl kickstart -p gui/$(id -u)/ai.igor.observe
```

Absolute paths are required throughout. launchd does not read a shell profile, so `igor` and
`claude` must both be found without one — if `claude` is not in the `PATH` above, add its
directory.

`StartInterval` counts wall-clock time and does not run while the machine is asleep. launchd
fires once shortly after waking if intervals were missed, and does not fire once per missed
interval, which is the behaviour wanted.

To remove it:

```sh
launchctl bootout gui/$(id -u)/ai.igor.observe
rm ~/Library/LaunchAgents/ai.igor.observe.plist
```

### Linux: cron

`crontab -e`, then:

```cron
PATH=/usr/local/bin:/usr/bin:/bin
*/30 * * * * /opt/igor/bin/igor observe >> $HOME/.igor/observe.log 2>&1
```

The `PATH` line is not optional: cron's default is `/usr/bin:/bin` and `claude` is usually not
in it. Redirecting output is likewise not optional — without it every run that prints anything
becomes a local mail message.

This must be the user's own crontab, entered as the lender, not `/etc/crontab`.

To remove it, delete the line with `crontab -e`.

### Linux: a systemd user timer

Preferable to cron where systemd is present: it catches up after a suspend, and
`systemctl --user status` answers what happened rather than sending mail.

`~/.config/systemd/user/igor-observe.service`:

```ini
[Unit]
Description=Take a usage reading for the Igor fleet

[Service]
Type=oneshot
ExecStart=/opt/igor/bin/igor observe
Environment=PATH=/usr/local/bin:/usr/bin:/bin
```

`~/.config/systemd/user/igor-observe.timer`:

```ini
[Unit]
Description=Take a usage reading every half hour

[Timer]
OnBootSec=2min
OnUnitActiveSec=30min
Persistent=true

[Install]
WantedBy=timers.target
```

```sh
systemctl --user daemon-reload
systemctl --user enable --now igor-observe.timer
loginctl enable-linger "$USER"
```

`Persistent=true` makes one catch-up run after a suspend rather than none.
`enable-linger` keeps the timer running when the lender is not logged in graphically, which is
what makes a desktop machine useful overnight; omit it on a laptop that is closed anyway.

To remove it:

```sh
systemctl --user disable --now igor-observe.timer
rm ~/.config/systemd/user/igor-observe.{timer,service}
```

### Checking it is working

The lender's check is the log: a line every half hour while the machine is awake.

The operator's check is the budget report, which shows each capacity figure with the time of the
observation it came from. A seat whose newest observation keeps getting older has a job that has
stopped, a login that has lapsed, or a laptop on holiday — and those look the same from here,
which is why the remedy is to ask rather than to alert.

## Roads not taken

**A daemon on the fleet's own host, holding the lender's login.** It is the arrangement that
needs no favour, and it means taking a credential that reads a person's conversations and
projects in order to read a percentage. The seat token exists precisely so that lending capacity
does not mean lending access; this would undo that for the sake of a scheduler.

**Reading on demand, when a seat is about to be used.** Tempting because it is always fresh, and
impossible for the same reason as everything else: the process that wants the figure is the
fleet, and the fleet cannot take a reading. The freshest reading obtainable is the most recent
one the lender's machine happened to take.

**Prompting the lender when a figure goes stale.** Puts the fleet's problem on somebody's
personal machine, where it is at best ignored and at worst the reason they uninstall it. An aged
observation is the operator's signal, and the operator is who acts on it.

**Configuring the window length instead of measuring it.** It would work today and be wrong
silently on the day the provider changes a window, in the direction that widens the instance a
numerator is summed over and so overstates capacity.

**A shorter interval.** The reading is free, so nothing forbids it; nothing recommends it
either, against a five-hour window. Half-hourly is already a sixtieth.

## Open

**Whether a lender outside the team can be given a write path that is not push access to the
lore repository.** Today lending a seat requires both a token and the ability to push
observations, and only the second excludes people. A narrower deposit endpoint would fix it and
is a larger design than this change.

**How old an observation may be before a reserved seat stops being spent from.** The threshold
belongs with the other constants waiting on a week of data, but unlike the others its absence
has a direction: with no threshold at all, an arbitrarily old figure is treated as current.
