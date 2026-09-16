## Why

A seat declaring a reserve is refused until its capacity has been observed, and nothing takes
the observation. The calibrated case never arrives on its own.

The reading is free. Measured under an interactive login, `claude -p '/usage'` returns
`total_cost_usd: 0`, `num_turns: 0`, `modelUsage: {}`, in 485ms. It is answered client-side and
draws nothing from the window it reports on. A job running every half hour therefore costs the
lender nothing, which is what makes a schedule the right shape here rather than something to be
rationed or asked permission for.

What the reading cannot do is run as a service. `/usage` reports windows against a subscription
and a `setup-token` credential resolves none, so under the credential a seat holds the same
command returns a per-invocation cost summary and no window figures at all. The reading
therefore happens on a machine where a person is signed in — the lender's own. That constraint
is the design rather than a caveat on it: the lender's laptop is the sensor, and everything else
here follows from a sensor that belongs to somebody else and is not always switched on.

## What Changes

**`igor observe` takes one reading and appends what it finds.** One invocation, no arguments
needed, exit non-zero if it could not read. It writes the observation record
`capacity-from-observation` defines, to the log that change defines, through the append path
everything else already uses. There is nothing new to store and nothing new to parse:
`parseUsage` already reads exactly the text `/usage` prints.

**A schedule, not a ritual.** The command is installed as a recurring job on the lender's
machine — launchd on macOS, cron or a systemd user timer on Linux — and from then on nobody
touches it. A reading taken once by hand ages into a worse and worse estimate of a window that
turns over several times a day; a reading taken every half hour is never more than half an hour
stale. Since the reading is free, the interval is chosen for freshness alone.

**Observations arrive irregularly, and that is the design working.** Laptops sleep, travel and
close. A missed interval is not a failure, is not reported as one, and is not backfilled by
inventing a reading: every record carries the instant it was taken, and a consumer that cares
how fresh a figure is reads that instant. The alternative — a schedule that promises regularity
— would be a promise made on somebody else's hardware.

**The window's length is measured rather than configured.** Two readings one afternoon gave
`resets Sep 15 at 2:30pm` and then `resets Sep 15 at 7:30pm`: the session window is five hours,
and the difference between successive resets is what says so. `capacity-from-observation` needs
a cadence to bound the instance its numerator comes from, and a cadence sitting in configuration
is a number that can be wrong while nobody notices. A measured one corrects itself when the
provider changes it.

**Appending needs push access to the state branch.** The reading is free; publishing it is not,
in access terms. For a colleague on the team this is the access they already hold, because it is
the access reviewing lore requires. For a lender outside the team it is a real obstacle and the
main one this change does not remove — they can take a reading their machine is entitled to and
have nowhere to put it.

**An installation procedure somebody non-expert can follow** is part of the change, in
[`design.md`](design.md), with the plist, the crontab line and the unit files written out. The
person being asked to install this is being asked as a favour, has no stake in the fleet, and
will abandon anything that needs debugging.

What this unlocks, elsewhere: the observation-informed half of `budget-pacing`'s reserve decay.
The owner's consumption is `percentUsed − (Igor's recorded spend ÷ capacity)`, so a current
observation is the only missing term, and this is what keeps one current. The requirement stays
in `budget-pacing`, which owns the reserve.

Explicitly out of scope:

- **The observation record and its log.** `capacity-from-observation` defines both. This change
  produces rows of that shape and defines no shape of its own.
- **Resolving the reset phrase to an instant.** `resetsAt` is `resets.trim()` today — the
  literal `Sep 18 at 4pm (America/Los_Angeles)`, not a comparable instant.
  `capacity-from-observation` task 1.2 carries that, and the cadence derivation here depends on
  it rather than repeating it.
- **Choosing the interval, the staleness threshold, or the decay curve.** Half an hour is what
  the procedure installs because the reading is free and the session window is five hours, so it
  needs no justification beyond arithmetic. The thresholds that consume the resulting figures
  want fitting against the observations this produces, which is the same argument
  `capacity-from-observation` makes about its own constants.
- **Reading a seat's own window.** Still impossible, and still not needed: a subscription has one
  set of windows, and the owner's login reports the same ones the seat draws on.
- **Moving the procedure into `docs/seats.md`.** It belongs there once it is built. That page
  currently tells a lender that no floor is enforced today, which is true, and a page promising
  unbuilt behaviour to somebody deciding whether to hand over a credential is the failure it was
  just corrected for.

## Capabilities

### Modified Capabilities

- `seat-budget`: observations are produced by a recurring free reading on a machine where the
  seat's owner is signed in, rather than waited for, and the window's length is measured from
  successive resets rather than configured.

## Impact

- A reserved seat becomes usable without anybody remembering to do anything, which is the
  difference between the reserve being a real mechanism and a documented intention.
- Puts a scheduled job on a person's personal machine. That is a larger ask than a token, it has
  to be installable in one paste and removable in one line, and the procedure is judged on that.
- The estimate a seat runs against is never more than one interval stale while the lender's
  machine is awake, and arbitrarily stale while it is not. Anything reading capacity has to
  carry the observation's age rather than treat a figure as current.
- Lending a seat now needs push access to the lore repository as well as a token, which narrows
  who can lend one to people already inside the team.
