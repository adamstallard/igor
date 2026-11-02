## Purpose

Keep each running `igor serve` process on its organization's current lore repository with no
person pulling or restarting on the server. Each process fetches the lore repository on a timer
of its own, as its role's GitHub App, and at each cycle start reads its whole configuration from
one fetched commit. A commit that passes the startup checks applies for that cycle; one that fails
them is refused, and the process keeps the last commit that passed. A removed seat file applies at
once, and when Igor applies a change to a seat's file it tells the seat's owner, except in the
cases its notice requirement excludes.

Terms used throughout: the *lore checkout* is the server's shared git working tree holding the
`igor.config.yaml` that `igor serve` loads, whether found by searching up from its working
directory or given as a path, and its branch is the upstream of the branch checked out there. A
*fetch* downloads that branch's new commits. A *lore read* is a process loading, from one commit,
its configuration, role files, seat files and, where `destination` names the lore repository, the
lore entries, and a *pull* is a fetch and the lore read that follows it. The *configuration in
force* is the one the process's last passing lore read loaded, less the seats *A removed seat file
applies as soon as a fetch brings it* keeps out. The *startup checks* are every check a starting
`igor serve` makes on the configuration it reads, among them validation of the configuration files
and `surface-adapter`'s check that the App can act on every repository the role works and on the
lore repository.

## ADDED Requirements

### Requirement: `igor serve` fetches its lore repository once per poll interval

An `igor serve` process SHALL fetch once per its role's poll interval in the configuration in
force, on a timer of its own, apart from its cycle, its workers and its heartbeat.

#### Scenario: A merged change is fetched without a person

- **WHEN** a person merges a change to the lore repository while `igor serve` runs
- **THEN** within one poll interval the process has fetched the commit, with no pull or restart
  on the server

#### Scenario: A fetch runs while a worker does

- **WHEN** a worker has been running for longer than a poll interval
- **THEN** the process has fetched at least once while the worker ran

#### Scenario: A slow fetch does not delay the heartbeat

- **WHEN** a fetch is still running when the heartbeat is due
- **THEN** the heartbeat is written on time
- **AND** a fetch still running when the next fetch is due is ended and reported as failed

#### Scenario: A lengthened poll interval spaces the fetches out

- **WHEN** a process started on the 10-minute poll interval applies a commit that sets 30 minutes
- **THEN** it fetches once every 30 minutes from then on, whatever the pace of its heartbeat timer

### Requirement: Each process keeps a fetched ref and an applied ref

Each process keeps two refs of its own, named by its role and rank, that survive a restart: the
*fetched* ref, which each fetch moves, and the *applied* ref, naming the last commit whose lore
read passed. A process with no fetched ref whose first fetch fails SHALL set its fetched ref to the
commit the lore checkout itself last fetched for its branch's upstream, with no network call.

#### Scenario: A first fetch that fails falls back to the checkout's own ref

- **WHEN** a process with no fetched ref starts and its first fetch fails
- **THEN** its fetched ref names the commit the lore checkout's remote-tracking ref names, and
  no network call made it

### Requirement: A fetch acts as the App and moves only the process's fetched ref

A fetch SHALL name the repository's `https://github.com/<owner>/<repo>` URL, act as the role's
GitHub App, read no system-wide or per-user git configuration, run no git hook, recurse into no
submodule, move only the process's own fetched ref, which *Each process keeps a fetched ref and an
applied ref* defines, and change no file in any working tree.

#### Scenario: A fetch acts as the App, runs no hook and touches only its own fetched ref

- **WHEN** the process fetches the lore repository
- **THEN** git authenticates with the App's token for that one command, reads no system-wide or
  per-user git configuration, and runs no hook
- **AND** only the process's fetched ref has moved, no git config holds a credential, and no file in
  any working tree has changed

#### Scenario: A fetch does not recurse into submodules

- **WHEN** the lore repository's branch adds a submodule
- **THEN** the fetch brings no commit of the submodule's repository

### Requirement: A failed fetch opens no condition

A fetch still running when the next is due SHALL be ended and count as failed. A fetch that fails,
for any reason, SHALL open no condition; the process SHALL keep applying the commit it has and
SHALL fetch again when the next fetch is due. Each cycle report made after a failed fetch, until a
fetch succeeds, SHALL say how long ago the process's last successful fetch was, or "none since
start" where none has.

#### Scenario: A failed fetch keeps the process on the commit it has

- **WHEN** fetches fail because GitHub does not answer, for three poll intervals
- **THEN** the process keeps applying the commit it applied before, opens no condition, and each
  cycle report until a fetch succeeds says when its last fetch succeeded, or "none since start"

### Requirement: `igor serve` refuses a lore checkout whose upstream is not GitHub over HTTPS

`igor serve` SHALL refuse to start where the lore checkout has no branch checked out, its branch
has no upstream, or that upstream's remote URL is not an `https://github.com/` URL free of
credentials. Each refusal names the checkout and what is wrong.

#### Scenario: A checkout whose upstream is not GitHub over HTTPS refuses the start

- **WHEN** `igor serve` starts in a lore checkout whose branch has no upstream, or whose upstream's
  remote is `git@github.com:acme/lore.git`
- **THEN** it refuses to start, naming the checkout and what is wrong

### Requirement: The lore checkout's git configuration cannot route git around the App

`igor serve` SHALL refuse to start where the lore checkout's git configuration sets a *routing
key*: any key under `url.`, `http.`, `credential.`, `filter.`, `include.`, `includeIf.` or
`submodule.`, or `core.fsmonitor`, `core.sshCommand`, `core.gitProxy`, `core.askPass`,
`core.alternateRefsCommand` or `extensions.worktreeConfig`. Each refusal names the checkout and the
key, by its section and last part only.

#### Scenario: A checkout that would route around the App refuses the start

- **WHEN** `igor serve` starts in a lore checkout whose config sets `url.<base>.insteadOf` or
  `http.extraHeader`
- **THEN** it refuses to start, naming the checkout and the key
- **AND** it names a `url.<base>.insteadOf` key as `url.*.insteadOf`

### Requirement: A routing key that appears while the process runs stops its git commands in the checkout

The process SHALL check the lore checkout's git configuration again before each git command it runs
in the checkout, and while a routing key is set there it SHALL run none in it: a fetch due then
counts as failed, a lore read fails for a local reason, as *A lore read that fails for a local
reason is not a refused commit* says, and each cycle report names the key by its section and last
part only.

#### Scenario: A key added to the checkout's config while the process runs is not used

- **WHEN** someone adds `http.extraHeader` to the lore checkout's `.git/config` while `igor serve`
  runs
- **THEN** the process runs no further fetch or checkout there, and each cycle report names the
  key

### Requirement: A process applies one lore commit at a time, whole

An `igor serve` process SHALL make each lore read from one commit, in a working tree of its own
named by its role and rank and detached at that commit, never in the lore checkout's own working
tree, and SHALL create, repair and update that working tree with no git hook run and no system-wide
or per-user git configuration read. Each cycle report SHALL name the commit applied.

#### Scenario: A seat file being rewritten in the shared checkout is not read as removed

- **WHEN** a person checks out a commit in the lore checkout that rewrites `seats/bob.yaml`, while
  a process makes a lore read
- **THEN** the process reads `seats/bob.yaml` whole, from the commit it applies
- **AND** no worker using `bob` is killed

#### Scenario: A hook in the checkout does not run when the working tree is updated

- **WHEN** the lore checkout's `.git/hooks/post-checkout` exists and is executable, and the
  process creates its working tree and checks out a new commit in it
- **THEN** the hook does not run

#### Scenario: Each cycle report names the commit applied

- **WHEN** a cycle report is written
- **THEN** it names the lore commit the process applied during that cycle

### Requirement: A process's working tree holds the commit it reads

Before each cycle start's read the process SHALL make its working tree match the commit exactly,
and where that read is refused or fails for a local reason SHALL make it match the applied commit
again before the cycle runs. Except as *A working tree that cannot be put back leaves the rank on
its last passing read* says, between cycle starts the working tree SHALL hold the commit the cycle
applies, and a read of one file during the cycle SHALL read it there, without moving the working
tree.

#### Scenario: A refused commit does not reach the cycle's lore entries

- **WHEN** a cycle start's read of a fetched commit is refused, and the cycle then works an item
- **THEN** the lore entries injected for that item, and any seat file the cycle reads again, are
  read from the commit the applied ref names

#### Scenario: A change written into a process's working tree is discarded

- **WHEN** something writes a wider `commands` list into `roles/backend.yaml` in the `backend-1`
  process's working tree, or adds a file there
- **THEN** the next lore read discards the change and removes the added file, and reads the role
  file as the commit holds it

### Requirement: A path in the configuration resolves as it does in the lore checkout

A relative path in `igor.config.yaml` SHALL resolve against the directory holding
`igor.config.yaml` in the lore checkout. A result inside the lore checkout SHALL be read in the
process's working tree, and one outside it at the resolved path. A `destination` naming another
repository SHALL be read at the location the configuration gives for it, and SHALL NOT be fetched.

#### Scenario: A key file beside the checkout is still found

- **WHEN** `igor.config.yaml` names `seatKey: ../seat.key`
- **THEN** the process reads the key from beside the lore checkout, not beside its own working
  tree

#### Scenario: A destination in another repository is not fetched

- **WHEN** `destination` names a repository other than the lore repository
- **THEN** no fetch touches that repository, and the lore entries are read where the
  configuration names them

### Requirement: A working tree that cannot be put back leaves the rank on its last passing read

The process SHALL keep in memory the configuration and lore entries of its last passing read. Where
its working tree cannot be made to match the applied commit, the cycle SHALL run on what memory
holds, taking each file it reads, a seat file's re-read included, from memory and not from the
working tree, and the process SHALL try the repair again at the next cycle start. Such a cycle
start is a local fault, as *Three local faults in a row open `lore:read:<role>-<rank>`* says.

#### Scenario: A working tree that cannot be put back keeps the rank working

- **WHEN** the `backend-2` process's read is refused, and making its working tree match the applied
  commit then fails
- **THEN** the cycle runs on the configuration and lore entries of the last passing read, held in
  memory, and reads nothing from the working tree
- **AND** the next cycle start tries the repair again

#### Scenario: Three cycles with a stuck working tree open a condition

- **WHEN** the `backend-2` process's working tree cannot be put back at three cycle starts in a row
- **THEN** `lore:read:backend-2` opens
- **AND** the process keeps working from memory

### Requirement: `igor serve` starts on the newest commit that passes

At start the process SHALL fetch, then make its first lore read from the commit its fetched ref
names, the newest it has, falling back as *A start whose fetched commit fails falls back to the
applied commit* says. A check that fails because GitHub did not answer, or refused the App's
credential, fails no read: at a cycle start the process stays on the commit it applied, opens no
condition for the read and reads again at the next cycle start, and at start it SHALL exit with
status 1.

#### Scenario: A start GitHub does not answer exits 1, with no fallback

- **WHEN** a process that has an applied ref starts while GitHub does not answer the App check
- **THEN** it exits with status 1, which the supervisor restarts, and does not start on its
  applied commit

### Requirement: A start whose fetched commit fails falls back to the applied commit

Where the fetched commit fails the startup checks at start and the applied commit passes them,
judged with every seat file it holds, a seat a later commit removed included, so that the removal
cannot make it fail, the process SHALL start on the applied commit, opening `lore:config:<role>`
where it is not open. Where it has no applied ref, or the applied commit fails too, it SHALL refuse
to start.

#### Scenario: A restart after a bad commit landed starts on the last good one

- **WHEN** a process that has an applied ref restarts, and the newest commit it fetches deletes
  `roles/backend.yaml`
- **THEN** it starts on the commit its applied ref names, with `lore:config:backend` open
- **AND** it does not exit

#### Scenario: A first start on a failing commit is refused

- **WHEN** a process with no applied ref starts, and the commit it fetches fails the startup
  checks, as when one of its configuration files fails validation
- **THEN** it refuses to start

#### Scenario: A restart whose applied commit no longer passes is refused

- **WHEN** a process restarts after an Igor upgrade, and both its fetched commit and its applied
  commit fail the startup checks
- **THEN** it refuses to start, naming both commits

### Requirement: A seat removal holds across a restart

Whichever commit a starting process starts on, every seat *A removed seat file applies as soon as a
fetch brings it* leaves out SHALL stay out of the configuration in force.

#### Scenario: A restart whose fetch fails keeps a seat removal

- **WHEN** a process fetched a commit that removes `seats/bob.yaml` and fails the startup checks,
  and restarts while its fetch fails
- **THEN** it starts on the commit its applied ref names, without `bob`

#### Scenario: A restart that removes a role's last seat still starts

- **WHEN** a process restarts, its fetched commit removes `seats/bob.yaml`, the only seat serving
  its role, and fails the startup checks, and its applied commit passes them
- **THEN** it starts on the applied commit without `bob`, and takes no work that needs a seat

### Requirement: The startup checks require the process's role but not its rank

A configuration that no longer declares the process's role, or lacks that role's file, SHALL fail
the startup checks. They leave out the check that the roster declares the rank. A passing read
whose roster drops the rank retires it, as `work-claiming`'s *A process reads the roster and its
configuration at each cycle start* says, and a start whose fetched commit drops it is refused, as
`work-claiming`'s *A rank removed from the roster exits cleanly* says, with no fallback to the
applied commit.

#### Scenario: Removing the role a process runs is refused

- **WHEN** a fetch brings a commit that deletes `roles/backend.yaml`, or removes `backend` from
  `igor.config.yaml`, while a `backend` process runs
- **THEN** that commit fails the startup checks, and the process keeps running on its last commit
  that passed, and does not exit
- **AND** `lore:config:backend` names the file that no longer holds the role

#### Scenario: A passing read that drops the rank retires it

- **WHEN** a fetch brings a commit whose roster no longer declares rank 2 of `backend`, and the
  rest of the configuration passes
- **THEN** the `backend-2` process's cycle-start read, at which `work-claiming` rereads the
  configuration, passes, and the rank retires as #179 says

#### Scenario: A retired rank started again is refused

- **WHEN** a process starts and its fetched commit's roster does not declare its rank, while its
  applied commit's roster does
- **THEN** it refuses to start, as #179 says, and does not fall back to the applied commit

### Requirement: `igor serve` runs without the lore checkout's local edits and commits

The process SHALL run without any uncommitted change in the lore checkout's working tree and any
local commit its fetched commit does not hold, and at start SHALL report each, naming it and saying
that `igor serve` does not apply it.

#### Scenario: Local edits and commits on the server are reported, not applied

- **WHEN** `igor serve` starts in a lore checkout where `roles/backend.yaml` has an uncommitted
  edit and the branch holds one commit the fetched commit does not
- **THEN** it reports both as not applied, naming the file and the commit
- **AND** it runs on the configuration the fetched commit holds

### Requirement: A lore read at each cycle start applies what passes and refuses what fails

At each cycle start the process SHALL make a lore read from the commit its fetched ref names. A
passing read SHALL apply its commit for the whole cycle and move the applied ref to it. A failing
read SHALL be refused as `work-claiming`'s *A process reads the roster and its configuration at
each cycle start* says, keeping the applied commit's configuration as the last that passed, and
SHALL open `lore:config:<role>` where the requirements whose names begin with it say, and those say
how it clears.

#### Scenario: GitHub not answering at a cycle start fails no read

- **WHEN** GitHub does not answer the App check during a cycle start's lore read
- **THEN** the process runs that cycle on the commit it applied, and opens no condition

#### Scenario: A refused credential at a cycle start fails no read

- **WHEN** GitHub refuses the App's credential during a cycle start's lore read
- **THEN** the process runs on the commit it applied, opens no `lore:config:<role>`, and takes no
  new item until a token mints again

#### Scenario: A passing commit is applied at the next cycle start

- **WHEN** a fetch brings a commit that changes `roles/backend.yaml`, and the configuration at
  that commit passes the startup checks
- **THEN** the `backend` process's next cycle runs on the changed role file
- **AND** its cycle report names that commit

#### Scenario: A failing commit is refused, and the process keeps working

- **WHEN** a fetch brings a commit in which `igor.config.yaml` has a key the configuration does not
  accept, which validation refuses
- **THEN** the process's next cycle runs on the last commit that passed, and the process does not
  exit
- **AND** `lore:config:backend` opens, naming the commit, `igor.config.yaml` and the check it
  failed, and quoting no value from the file

#### Scenario: An App that lost access refuses the read

- **WHEN** the App is uninstalled from a repository the role works, at a commit that passed
  before, while GitHub still accepts the App's credential
- **THEN** the next cycle start's read is refused, and `lore:config:backend` opens
- **AND** once the App is installed on the repository again, the next read of that commit passes
  and clears the condition

#### Scenario: A fix on the server is picked up with no new commit

- **WHEN** #171's condition `seat:<id>:decrypt` is open because the key file named by `seatKey`
  was wrong, and the operator replaces the key file while the process runs
- **THEN** the next cycle start's lore read reads the same commit, decrypts the seat file, since
  that read is where `seat-budget` decrypts seat files, and `seat:<id>:decrypt` clears, with no
  new commit fetched

### Requirement: A running cycle keeps the commit it started on

The cycle-start lore read is the one at which `work-claiming` rereads the configuration and
`seat-budget` decrypts seat files. A newly fetched commit SHALL NOT change the configuration or
lore entries of a running cycle or its workers, except under *A removed seat file applies as soon
as a fetch brings it*.

#### Scenario: A running worker finishes on its cycle's commit

- **WHEN** a fetch brings a commit removing a command from `roles/backend.yaml`'s `commands`
  while a `backend` worker runs
- **THEN** that worker may still run the command until its item is published or handed off
- **AND** the next cycle runs under the narrowed list

### Requirement: `lore:config:<role>` opens on a refused read

`lore:config:<role>` is a read-cleared condition, of the kind `stuck-conditions` defines. A refused
read by any rank of the role SHALL open it where it is not open, naming the refused commit, which a
refusal of another commit while it is open SHALL NOT change. Its report SHALL name the commit, the
file that failed and the check it failed, except as *A lore read writes nothing of a private
repository to a public state branch* forbids, and SHALL quote no value from the file.

#### Scenario: One bad commit is one condition for the role

- **WHEN** ranks 1, 2 and 3 of `backend` each refuse the same commit
- **THEN** one condition, `lore:config:backend`, is open, and no condition names a rank

#### Scenario: A second refused commit does not change the one the condition names

- **WHEN** `lore:config:backend` is open on commit R, and a rank refuses another commit S
- **THEN** the condition still names R

### Requirement: `lore:config:<role>` clears on a passing read of the refused commit or a descendant

A passing read by any rank of the role SHALL clear `lore:config:<role>` where the commit read is
the refused commit or descends from it. A passing read of any other commit SHALL NOT clear it,
except as *`lore:config:<role>` also clears on a rank's passing read of its fetched head* says. The
execution-log row that clears it names the commit whose read cleared it, the *clearing commit*.

#### Scenario: A later passing commit clears the condition

- **WHEN** `lore:config:backend` is open and a fetch brings a commit that descends from the
  refused one and whose configuration passes
- **THEN** the next cycle runs on that commit, and the condition clears with no probe item taken

#### Scenario: A sibling rank's passing read clears it

- **WHEN** `lore:config:backend` is open, rank 1 of `backend` reads a commit that passes and
  descends from the refused one, and rank 2 has not yet fetched it
- **THEN** `lore:config:backend` clears
- **AND** rank 2 applies that commit at its own next cycle start after its fetch

#### Scenario: A rank behind the refused commit does not clear it

- **WHEN** rank 1 of `backend` refuses a commit, opening `lore:config:backend`, and rank 2, which
  has not yet fetched that commit, reads the commit before it, which passes
- **THEN** `lore:config:backend` stays open

#### Scenario: Another role's passing read does not clear it

- **WHEN** `lore:config:backend` is open and the `frontend-1` process's read passes
- **THEN** `lore:config:backend` stays open

### Requirement: `lore:config:<role>` also clears on a rank's passing read of its fetched head

A rank's passing read of its fetched head, the commit its own fetch last brought, SHALL also clear
`lore:config:<role>` where all three hold: the refused commit is not in that head's history; that
fetch started after the rank first knew the condition was open, from its own refusal or from the
condition's rows in the execution log at a cycle start; and the rank's object store holds the
refused commit. A rank that restarts learns again that the condition is open at its first cycle
start.

#### Scenario: A force-push that drops the refused commit clears it

- **WHEN** rank 1 of `backend` refuses a commit, opening `lore:config:backend`, and the lore
  branch is then force-pushed to a commit that does not descend from the refused one and passes
- **AND** rank 1's fetch brings that commit
- **THEN** rank 1's read of it passes, and `lore:config:backend` clears

#### Scenario: A force-push back to the refused commit's parent clears it

- **WHEN** `lore:config:backend` is open on commit R, and the lore branch is force-pushed back to
  R's parent, which passes
- **AND** a rank that holds R, and that knew the condition was open before its fetch started,
  fetches that commit
- **THEN** the rank's read of it passes, and `lore:config:backend` clears

#### Scenario: A head fetched before the refusal clears nothing

- **WHEN** `lore:config:backend` is open on commit R, still the branch's tip, and rank 2, on the
  server where rank 1 refused R, holds R's object through the shared object store
- **AND** rank 2's fetches have failed since before R landed, and it reads its own older head,
  which passes
- **THEN** `lore:config:backend` stays open

#### Scenario: A rank without the refused commit's object clears nothing by its head

- **WHEN** `lore:config:backend` is open on commit R, the branch is force-pushed to a commit that
  drops R and passes, and a rank on another server, whose object store lacks R, reads it
- **THEN** that rank's read passes, and `lore:config:backend` stays open

#### Scenario: A restarted rank learns again that the condition is open

- **WHEN** `lore:config:backend` is open on commit R, and rank 2, which holds R, restarts
- **THEN** rank 2 knows the condition is open from its first cycle start, by reading the
  condition's rows in the execution log
- **AND** a passing read of a head whose fetch started after that, which drops R, clears it

### Requirement: `lore:config:<role>` does not reopen on the refused commit or the clearing commit's history

A refused read SHALL NOT reopen a cleared `lore:config:<role>` where the commit read is the refused
commit, or the clearing commit or one of its ancestors; the rank still refuses it and runs that
cycle on its applied commit. This exception SHALL NOT cover a refusal by the App check, nor a read
at process start.

#### Scenario: A rank that rereads the refused commit does not reopen it

- **WHEN** rank 1 of `backend` passes on a fix that descends from the refused commit, clearing
  `lore:config:backend`
- **AND** rank 2's next cycle start comes before its fetch brings the fix, so it reads the
  refused commit again and refuses it
- **THEN** `lore:config:backend` stays clear
- **AND** rank 2 runs that cycle on the commit its applied ref names, and applies the fix at its
  next cycle start after its fetch brings it

#### Scenario: A commit before the fix does not reopen it

- **WHEN** `lore:config:backend` refused commit R, a later commit F descends from R and passes,
  clearing it, and commit B between R and F also fails the startup checks
- **AND** a rank whose fetch brought B but not yet F reads B
- **THEN** the rank refuses B, and `lore:config:backend` stays clear

#### Scenario: A restart on a stricter Igor reopens it

- **WHEN** `lore:config:backend` cleared on a read of commit F, and a process whose applied
  commit is E, older than F, restarts on an Igor whose startup checks refuse F but pass E
- **THEN** `lore:config:backend` opens, naming F, and the process starts on E

#### Scenario: A new bad commit after the fix reopens it

- **WHEN** `lore:config:backend` has cleared on a passing read, and a later commit that
  descends from that one fails the startup checks
- **THEN** a rank's refused read of the later commit opens `lore:config:backend`, naming it

### Requirement: A lore read that fails for a local reason is not a refused commit

A lore read *fails for a local reason* where a git or filesystem operation that puts the commit in
the process's working tree, or reads a file from it, fails, rather than a check on what the commit
holds; such a read neither passes nor is refused. It SHALL NOT open or clear `lore:config:<role>`:
the process SHALL run that cycle on its applied commit and read again at its next cycle start. At
start it SHALL end the start with status 1, with no fallback to the applied commit.

#### Scenario: A git lock fails one read and opens no condition

- **WHEN** the `backend-2` process's cycle-start read fails because `packed-refs.lock` is held, and
  its next cycle start's read passes
- **THEN** it runs the first cycle on the commit its applied ref names, and opens no condition
- **AND** `lore:config:backend` is neither opened nor cleared by the failed read

#### Scenario: A local fault at start exits 1

- **WHEN** a process starts and its first lore read fails because the disk is full
- **THEN** it exits with status 1, which the supervisor restarts, and does not exit 78
- **AND** it does not start on its applied commit

### Requirement: Three local faults in a row open `lore:read:<role>-<rank>`

A cycle start is a *local fault* where its read fails for a local reason, or where its working tree
cannot then be put back. After three in a row the process SHALL open the read-cleared condition
`lore:read:<role>-<rank>`, whose report SHALL name the operation that failed and the kind of fault,
and SHALL quote no path outside the lore checkout, no file's content and no text of git's error.
The process's next cycle start that is not a local fault SHALL clear it.

#### Scenario: Three local faults in a row open a condition for the process

- **WHEN** the `backend-2` process's read fails at three cycle starts in a row because the disk is
  full
- **THEN** `lore:read:backend-2` opens, naming the failed operation and a full disk, and
  `lore:config:backend` is not opened
- **AND** it clears at the process's next cycle start that is not a local fault, whether its read
  passes or is refused
- **AND** its report quotes no path outside the lore checkout

### Requirement: A removed seat file applies as soon as a fetch brings it

When a fetch brings a commit that lacks a seat file the configuration in force holds, the process
SHALL apply `seat-budget`'s *A removed seat file always takes effect* at once. Once any commit
after the applied one, up to and including the fetched one, deletes a seat's file, that seat SHALL
stay out of the configuration in force until a passing lore read holds it. A worker started while
the removal applies SHALL either never receive the seat's token or be among the workers killed.

#### Scenario: A removal reaches a running worker within one poll interval

- **WHEN** a person merges a commit removing `seats/bob.yaml` while a worker has been using `bob`
  for an hour
- **THEN** within one poll interval, mid-cycle, the process applies the removal, as #171
  specifies, and keeps running

#### Scenario: A removal in a refused commit still applies, and stays

- **WHEN** a fetch brings a commit that removes `seats/bob.yaml` and whose `igor.config.yaml`
  fails validation, and the next cycle's read is refused
- **THEN** the removal of `bob` applies as soon as the fetch brings it, and the configuration the
  process keeps does not hold `bob`

#### Scenario: A seat re-added in a refused commit stays out

- **WHEN** a refused commit removes `seats/bob.yaml`, and a later commit that adds it back is
  refused too
- **THEN** `bob` stays out of the configuration in force until a read that passes holds it

#### Scenario: A force-pushed branch that drops a seat file still removes it

- **WHEN** the lore branch is force-pushed to a commit that does not descend from the applied
  commit and lacks `seats/bob.yaml`
- **THEN** the removal of `bob` applies after the fetch

#### Scenario: A worker starting during the removal does not keep the seat

- **WHEN** the process starts a worker on `bob` while it applies the removal of `seats/bob.yaml`
- **THEN** that worker either never receives `bob`'s token or is killed with the others

#### Scenario: A process with no applied ref removes nothing

- **WHEN** a process with no applied ref starts, and its fetched commit holds `seats/bob.yaml`,
  which an earlier commit of the branch deleted and a later one added back
- **THEN** its configuration in force holds `bob`, since it has nothing in force to remove from

### Requirement: Processes apply new commits independently

Each `igor serve` process SHALL apply the newest commit it has fetched at its own cycle start, with
no agreement among processes about which commit applies. Two processes of one role MAY run on
different commits until each has fetched and started a cycle.

#### Scenario: Two ranks may apply different commits for a while

- **WHEN** a commit lands while ranks 1 and 2 of `backend` run, and rank 1 starts a cycle first
- **THEN** rank 1 runs a cycle on the new commit while rank 2 is still on the old one
- **AND** rank 2 applies the new commit at its own next cycle start after its fetch

### Requirement: A pull can be forced with SIGHUP

An `igor serve` process SHALL handle `SIGHUP` from its first moment by fetching at once, and SHALL
apply what that fetch brings as it applies any fetch. The signal SHALL NOT end the process or
interrupt a worker. The shipped systemd unit SHALL set `ExecReload=` to send the process `SIGHUP`,
and under the shipped compose file `docker compose kill -s HUP <service>` SHALL reach it the same
way.

#### Scenario: A SIGHUP during start does not end the process

- **WHEN** `igor serve` receives `SIGHUP` before its first cycle
- **THEN** it keeps starting, and makes the fetch its start makes

#### Scenario: A reload forces a fetch

- **WHEN** an operator runs `systemctl reload igor@backend-1` right after a merge
- **THEN** the process fetches at once, and applies the commit at its next cycle start
- **AND** the process keeps running and its worker is not interrupted by the signal

#### Scenario: Compose forces a fetch the same way

- **WHEN** an operator runs `docker compose kill -s HUP backend` under the shipped compose file
- **THEN** the process fetches at once and keeps running

### Requirement: Igor posts at most one notice for each seat-file change it applies

When an `igor serve` process's lore read passes, it SHALL compare the seat files of the commit it
reads with those of its applied commit, before moving the applied ref. For each seat file the new
commit changes and still holds at the same path, and each it adds, Igor SHALL post one notice
@-mentioning the seat's owner, except as the five seat-notice requirements after this one say.

#### Scenario: A workflow mention before the merge does not stop the notice

- **WHEN** #171's workflow mentioned `@bob` on a pull request's first push, and a maintainer's
  later push changes `seats/bob.yaml` again before the merge
- **THEN** Igor's notice after the merge mentions `@bob`

#### Scenario: A token changed back is announced again

- **WHEN** a merged commit changes `seats/bob.yaml` back to a content it held before
- **THEN** a notice for that commit is posted

#### Scenario: An added seat file is announced to its owner

- **WHEN** a merged commit adds `seats/carol.yaml`, whose `owner` is `carol`, and `carol` did not
  both open the pull request and push that commit
- **THEN** Igor's notice after the merge mentions `@carol`

#### Scenario: A refused commit is not announced

- **WHEN** a commit changing `seats/bob.yaml` fails the startup checks and is refused
- **THEN** Igor posts no notice for it until a commit holding that change is applied

#### Scenario: A change made while no process runs is announced at the restart

- **WHEN** a seat-file change lands while no `igor serve` process runs, and a process with an
  applied ref then starts and applies that commit
- **THEN** Igor posts the notice for it

### Requirement: Only a seat id's file, changed or added, gets a seat notice

Only a file named `seats/<id>.yaml` with a seat id's form SHALL get a notice. A seat file is
*added* where the most recent commit that changed it created it, that commit's first parent holding
no file at that path, whatever the applied commit held there. A deleted file, or a renamed one that
git's rename detection pairs with a deleted one, SHALL get none, and a process with no applied ref
compares and posts nothing.

#### Scenario: A deleted seat file gets no notice from Igor

- **WHEN** a merged commit deletes `seats/bob.yaml`
- **THEN** Igor posts no notice for it, and the removal applies

#### Scenario: A file under `seats/` whose name is not a seat id gets no notice

- **WHEN** a merged commit adds `seats/Bob_1.yaml`, whose name is not a seat id's form (lowercase
  letters, digits and hyphens)
- **THEN** Igor posts no notice for it

#### Scenario: A renamed seat file gets no notice

- **WHEN** a merged commit renames `seats/bob.yaml` to `seats/robert.yaml` with its content
  unchanged, which git's rename detection pairs
- **THEN** Igor posts no notice for either path

#### Scenario: A process with no applied ref posts nothing

- **WHEN** a process with no applied ref makes a lore read that passes, as at its first
  start
- **THEN** it compares no seat files, and posts no seat notice

### Requirement: A seat notice mentions the owner from before the change

For a changed file the owner is the one the file names in the first parent of the most recent
commit that changed it, and Igor SHALL also mention the owner the applied commit names where it
differs; for an added file it is the owner the file names.

#### Scenario: The owner a superseded commit replaced is still told

- **WHEN** one commit changes `seats/bob.yaml`'s `owner` from `bob` to `mallory`, a second changes
  its token, and a process applies both at once
- **THEN** the notice mentions `@mallory`, the owner before the second commit, and `@bob`, the
  owner in the commit the process applied before

#### Scenario: A changed owner is not who is told

- **WHEN** a merged commit changes `seats/bob.yaml`'s `owner` from `bob` to `mallory`
- **THEN** the notice mentions `@bob`, and not `@mallory`

#### Scenario: A seat file added back from history is announced

- **WHEN** `seats/bob.yaml` was deleted, and someone other than `bob` opens and pushes a pull
  request that adds it again with the ciphertext it held before, which is merged
- **THEN** Igor's notice after the merge mentions `@bob`, the owner the added file names

### Requirement: A seat notice says the change landed, on the pull request or commit that brought it

Each notice SHALL say that the change has landed and is the one Igor now reads. It SHALL go on the
merged pull request that brought the most recent commit to change the file, or, where no pull
request brought that commit, on the commit as a commit comment.

#### Scenario: A change pushed without a pull request is announced on its commit

- **WHEN** a commit changing `seats/bob.yaml` reaches the branch without a pull request
- **THEN** the notice goes on that commit as a commit comment

### Requirement: A seat notice does not mention an owner who pushed the change themselves

Igor SHALL NOT mention an owner who both opened the pull request a notice goes on and made the push
that brought into it the most recent commit to change the file, nor an `owner` without a GitHub
login's form. Where a squash or rebase merge made that commit, the push judged is the one that
brought the pull request's own last commit changing the file. Where these rules leave no one to
mention, Igor SHALL post no notice.

#### Scenario: A maintainer's push to the lender's pull request is announced to the lender

- **WHEN** `bob` opens a pull request changing `seats/bob.yaml`, a maintainer pushes the commit
  that last changes it, and the pull request is merged
- **THEN** the notice mentions `@bob`

#### Scenario: A squash merge of the lender's own pushes is not announced to them

- **WHEN** `bob` opens a pull request changing `seats/bob.yaml`, pushes every commit in it
  himself, and it is squash-merged
- **THEN** Igor posts no notice mentioning `@bob`

#### Scenario: The lender's own push to their own pull request is not announced to them

- **WHEN** `bob` opens a pull request changing `seats/bob.yaml`, pushes every commit in it
  himself, and it is merged
- **THEN** Igor posts no notice mentioning `@bob`

#### Scenario: An owner that is not a GitHub login gets no notice

- **WHEN** a merged commit changes `seats/ops.yaml`, whose `owner` before the change is
  `Operations Team`
- **THEN** Igor posts no notice for it

### Requirement: A record on the state branch keeps a seat notice from being posted twice

Before posting, the process SHALL create a record on the state branch named by the seat's id and
the most recent commit that changed the file, with a call that fails if it exists, and SHALL NOT
post where it already existed. A call that failed otherwise SHALL be tried again at each later
passing read while the process runs. Where no process crashes between creating the record and
posting, exactly one notice SHALL be posted for each applied change that leaves someone to mention.

#### Scenario: A rotated token is announced once

- **WHEN** a pull request a maintainer opened and pushed, changing `seats/bob.yaml`, is merged,
  and three processes on two servers each apply the commit
- **THEN** exactly one notice @-mentioning `bob`'s owner is posted, on that pull request

#### Scenario: A record call that failed for another reason is tried again

- **WHEN** creating the record fails because GitHub does not answer
- **THEN** the process tries again at each later passing read while it runs, and posts once the
  record is created

#### Scenario: A post that failed after its record was created is tried again

- **WHEN** the process has created a notice's record, and posting the notice fails because GitHub
  does not answer
- **THEN** the process tries the post again at each later passing read while it runs, until the
  notice is posted once

### Requirement: `igor run` reads the checkout as it finds it

`igor run` SHALL NOT fetch the lore repository, and SHALL read its configuration from the lore
checkout's working tree as it finds it, uncommitted edits included.

#### Scenario: A developer's edit applies to a run by hand

- **WHEN** a developer edits `roles/backend.yaml` without committing and runs `igor run backend`
- **THEN** the run uses the edited file, and nothing is fetched

### Requirement: Igor reads the lore repository's and the store's visibility as `visibility-guard` does

The *store* is the repository `igor.config.yaml` names as `destination`, whose state branch holds
Igor's records. Igor SHALL read the lore repository's and the store's visibility as
`visibility-guard`'s *A private repository is never worked through a public lore store* reads a
worked repository's and the store's. An `internal` repository counts as private. Where GitHub does
not answer one or both visibility reads, Igor SHALL write its records as for a private lore
repository.

#### Scenario: An internal lore repository counts as private

- **WHEN** the lore repository is `internal`, the store is public, and a commit fails the startup
  checks on `seats/bob.yaml`
- **THEN** the condition's report on the state branch does not name `seats/bob.yaml`

#### Scenario: A visibility read GitHub does not answer writes as for a private lore repository

- **WHEN** a commit fails the startup checks on `seats/bob.yaml`, and GitHub does not answer the
  lore repository's visibility read
- **THEN** the condition's report on the state branch does not name `seats/bob.yaml`

#### Scenario: A store visibility read GitHub does not answer writes as for a private lore repository

- **WHEN** a commit fails the startup checks on `seats/bob.yaml`, and GitHub does not answer the
  store's visibility read
- **THEN** the condition's report on the state branch does not name `seats/bob.yaml`

### Requirement: A lore read writes nothing of a private repository to a public state branch

Where the lore repository is private and the store public, every record this capability writes to
the state branch SHALL name a commit only by its id, a seat only by its id and a failed check only
by its name, and SHALL hold no path, file content, commit message or text of git's error. This
requirement SHALL take precedence over every other requirement of this capability that names a
file, a path or git's error in a record.

#### Scenario: A refused commit in a private lore repository opens a condition with no path

- **WHEN** the lore repository is private, the store is public, and a commit fails the startup
  checks on `seats/bob.yaml`
- **THEN** `lore:config:<role>` opens, and its report on the state branch names the commit's id
  and the check that failed, but neither `seats/bob.yaml` nor the commit's message

#### Scenario: A seat notice's record from a private lore repository holds only ids

- **WHEN** the lore repository is private, the store is public, and Igor applies a change to
  `seats/bob.yaml`
- **THEN** the notice's record on the state branch names the seat by its id, `bob`, which is its
  file's name under `seats/`, and the commit by its id, and holds no path and no commit message

#### Scenario: A public lore repository's reports keep their paths

- **WHEN** the lore repository and the store are both public, and a commit fails the startup
  checks on `seats/bob.yaml`
- **THEN** the condition's report names `seats/bob.yaml`, the commit and the check
