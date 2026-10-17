## ADDED Requirements

### Requirement: A process the open conditions leave no work for exits rather than staying up

Where the conditions open against this process leave it no item it could take, the service SHALL
terminate with a non-zero exit status, having first stated the cure keys that leave it nothing to
do, what changing them would take, and that it is exiting for that reason. Where they leave it any
work it could still do, the exit status SHALL be unaffected and the loop SHALL go on running,
reporting the stop as the requirements below specify.

Whether anything is left SHALL be determined rather than assumed from the cure's scope: a
condition whose cure is the Igor's own leaves nothing; a condition stopping the role this process
serves leaves nothing; a stopped seat leaves nothing where every seat that role could spend from
is stopped, and leaves the process working where one is not.

A long-running service has exactly one state nothing watches for: up and doing nothing. It passes
every liveness check, its logs are quiet in the way a quiet week is quiet, and the only thing that
distinguishes it from an Igor with an empty queue is a record nobody is reading. A service that
exits is a crash-looping service instead, which is a shape that already means something to whoever
is on call. What makes that worth an exit is not which cure was named but that nothing this
process can be handed would help — so that is the thing to establish, from the cure keys and the
seats the role can spend from, and not from the derivation of the scope.

**Only open conditions count toward it.** A seat with no headroom, a window that has not reset, a
role held back by pacing or by its own ceiling SHALL NOT count as leaving the process nothing to
do. The discriminator is who ends the wait: a budget window reopens on its own clock, and a
stopped scope waits for a person who has not been told. Folding the first into this check turns an
ordinary session limit into an exit, and an exit into a crash loop on a state every Igor reaches
in normal use — which would spend the signal exactly where it means nothing. A credential the
provider refused waits for a person too and is arguably the same case, but it is a different
mechanism with its own hold and cooldown; it is out of scope here and stays out until something
decides to merge the two.

#### Scenario: A condition whose cure is the Igor's own ends the process

- **WHEN** a condition naming the Igor's own credential is open
- **THEN** the service exits with a non-zero status
- **AND** it says which cure key stopped it and what would cure it before exiting

#### Scenario: A stopped role leaves the process serving it with nothing

- **WHEN** a condition stops the role this process serves
- **THEN** the service exits with a non-zero status, naming that cure key

#### Scenario: A condition on a role this process does not serve is not its exit

- **WHEN** a condition stops some other role
- **THEN** this process's exit status is unaffected and its loop goes on running
- **AND** the stop is still listed where every open condition is listed

#### Scenario: A stopped seat with another seat behind it is not an exit

- **WHEN** a condition stops one seat and the role can still spend from another
- **THEN** the exit status is unaffected, and the stop is reported rather than exited on

#### Scenario: Every seat the role can spend from stopped is an exit

- **WHEN** a condition has stopped each seat the role this process serves could spend from
- **THEN** the service exits with a non-zero status, naming those cure keys

#### Scenario: An exhausted budget is not a reason to exit

- **WHEN** no seat has headroom until a window resets, and no condition is open
- **THEN** nothing exits, because that wait ends without anybody acting

#### Scenario: A window that has not reset does not complete a stop

- **WHEN** one of a role's seats is stopped by a condition and the rest merely have no headroom
- **THEN** the process does not exit, because the seats without headroom come back on their own

#### Scenario: A clean shutdown is still a clean exit

- **WHEN** the service is asked to stop and nothing open leaves it without work
- **THEN** it exits zero, as it does today

### Requirement: A restart does not defeat the probe

A process that starts with open conditions leaving it no work SHALL take the probe where the
cooldown of a condition that would free it has passed, and SHALL exit non-zero without claiming
anything where none has — saying, in that case, when the probe is due. Exiting SHALL NOT clear a
condition, reset its count, or shorten its cooldown.

A condition clears by not recurring, and the only observation available from inside a stop is the
one probe item a cooldown buys. A process that exits the moment it reads an open condition never
reaches its own cooldown, so under a supervisor that restarts it the probe would never run at all
and the condition would be permanent — a cure made an hour after the stop would go unnoticed until
somebody restarted something by hand. The cooldown is a wall-clock fact about the condition rather
than about any process, which is what makes it survive the restart the exit causes.

Deciding to exit therefore comes after the probe, not before it: a start is exactly the moment the
probe would have run anyway.

#### Scenario: A start inside the cooldown exits again

- **WHEN** a process starts with nothing it can take and no cooldown passed
- **THEN** it claims nothing and exits non-zero
- **AND** it says when the probe is due

#### Scenario: A start after the cooldown probes first

- **WHEN** a process starts after the cooldown has passed with the condition still open
- **THEN** it takes exactly one item, as the probe

#### Scenario: A probe that does not meet the condition resumes the service

- **WHEN** the probe completes without meeting the condition
- **THEN** the condition is closed and the service goes on serving rather than exiting

#### Scenario: A probe that meets it again exits

- **WHEN** the probe meets the same condition
- **THEN** the service exits non-zero and the next cooldown is longer

#### Scenario: Exiting is not a way out of the count

- **WHEN** a process exits on an open condition
- **THEN** the condition's count and cooldown are what they were, and the next process reads them

### Requirement: Exiting is a signal only where the supervisor escalates and retries

Because an exit is inert unless something acts on it, the deployment documentation SHALL state
which supervision shapes an exit on an open condition assumes, and what an operator running any
other shape must add for a stopped Igor to reach them. The supervision recipes this repository
ships SHALL either escalate a repeatedly failing Igor or say in the file itself what to add so that it does,
and SHALL NOT retry faster than the loop would have polled.

An exit that nobody escalates reproduces the failure it was meant to end, one level out: a service
restarting forever in silence looks exactly like a service running quietly. The unit shipped here
is that case — `Restart=always` with `RestartSec=30` puts restarts far enough apart that systemd's
start rate limit is never reached, so the unit never enters `failed` and nothing downstream of
`failed` ever fires. Kubernetes reports the same loop as `CrashLoopBackOff`, which is alertable;
`docker compose`'s `unless-stopped` backs off but escalates to nobody; a bare `while true` wrapper
does neither.

The retry cadence is the second half of it. A restart is not free — a process start reads the
configuration and the state branch — and at `RestartSec=30` against a ten-minute poll a stopped
Igor would do that twenty times more often than the working Igor it replaced. The floor is what
the loop would have cost anyway, which is also the honest reading of what the exit is claiming:
this Igor is not merely idle, and the cost of finding out should not exceed the cost of idling.

#### Scenario: The deployment documentation states what the exit assumes

- **WHEN** an operator reads how to run an Igor
- **THEN** it says which supervision shapes escalate a repeatedly failing Igor
- **AND** what to add where theirs does not

#### Scenario: A shipped recipe does not retry faster than it polled

- **WHEN** a supervision recipe in this repository restarts an exited Igor
- **THEN** the interval between attempts is no shorter than the role's poll interval

#### Scenario: A shape that escalates nothing is named, not assumed

- **WHEN** the documentation covers a supervisor that restarts without escalating
- **THEN** it says the exit reaches nobody there and what makes it reach somebody

### Requirement: Every open condition is readable without naming a role

Every open condition SHALL be readable from a command that takes no argument and names no role,
stating for each one: the cure key, the scope it stops, how many times it has recurred, what would
cure it, and when its probe is due. A condition met by several Igors SHALL appear once, as the one
condition it is. Reading SHALL change nothing — no condition cleared, no count reset, no cooldown
shortened.

An operator asking whether anything is stuck does not know which role to ask about; that is the
question. A surface that takes a role answers only for somebody who already suspects the right
one, and the fleet-wide reading — several Igors stopped on one cure key — is the strongest signal
available here and the one a per-role surface cannot produce at all.

It states the probe time because the operator's next question, having read a stop, is whether
their cure took. A stop with no time on it cannot be told from a stop nothing is going to do
anything about.

Reading cannot clear, for the reason a breaker cannot be reset by being asked: an operator who
believes they have fixed a credential and has not would clear the stop and pay for the belief on
the next items. The probe is the only thing that closes a condition, and it closes it on an
observation rather than on a claim.

#### Scenario: A role-scoped stop is visible to somebody who did not know which role

- **WHEN** a condition stops one role of several
- **THEN** it is listed by a command that was given no role
- **AND** the listing names the cure key, the role it stops, and what would cure it

#### Scenario: One cure met by several Igors reads as one condition

- **WHEN** five Igors have met the same cure key
- **THEN** the listing shows one condition, with one count

#### Scenario: The listing says when the probe is due

- **WHEN** an open condition is listed
- **THEN** the instant its next probe is due is shown

#### Scenario: Reading changes nothing

- **WHEN** an operator reads the listing
- **THEN** every condition is in the state it was in, with the same count and the same cooldown

#### Scenario: Nothing open reads as nothing open

- **WHEN** no condition is open
- **THEN** the listing says so
- **AND** that is distinct from a listing that could not be read
