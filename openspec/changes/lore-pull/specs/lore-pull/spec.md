## ADDED Requirements

### Requirement: `igor serve` fetches its lore repository once per poll interval

The *lore checkout* is the clone of the lore repository, the repository holding
`igor.config.yaml`, in which `igor serve` starts. Its branch is the upstream of the branch checked
out there.

An `igor serve` process SHALL fetch that branch once per poll interval of its role, from a timer
apart from its cycle and from any worker, so that a fetch also runs while a worker does. The fetch
SHALL name the repository's `https://github.com/<owner>/<repo>` URL itself, SHALL act as the
role's GitHub App as `surface-adapter`'s *On GitHub, every call an Igor makes acts as its App*
requires, and SHALL run no git hook. It SHALL update only the process's own fetched ref, which *`igor
serve` starts on the newest commit that passes* defines, and SHALL change no file in any working
tree.

`igor serve` SHALL refuse to start where the lore checkout's branch has no upstream, where that
upstream's remote URL is not an `https://github.com/` URL free of credentials, or where the
checkout's git config rewrites URLs with `url.<base>.insteadOf`. Each refusal names the checkout
and what is wrong.

A fetch that fails, for any reason including a git lock held by another process, SHALL be
reported in the next cycle's report, with how long ago the process's last successful fetch was,
or "none since start", and tried again at the next firing. The process SHALL go on applying the
commit it has, and SHALL open no condition for the failure.

#### Scenario: A merged change is fetched without a person

- **WHEN** a person merges a change to the lore repository while `igor serve` runs
- **THEN** within one poll interval the process has fetched the commit, with no pull or restart
  on the server

#### Scenario: A fetch runs while a worker does

- **WHEN** a worker has been running for longer than a poll interval
- **THEN** the process has fetched at least once while the worker ran

#### Scenario: A fetch acts as the App, runs no hook and touches only its own fetched ref

- **WHEN** the process fetches the lore repository
- **THEN** git authenticates with the App's token for that one command, and runs no hook
- **AND** only the process's fetched ref has moved, no git config holds a credential, and no file in
  any working tree has changed

#### Scenario: A failed fetch keeps the process on the commit it has

- **WHEN** a fetch fails because GitHub does not answer
- **THEN** the process keeps applying the commit it applied before, opens no condition, and its
  next cycle report says when its last fetch succeeded, or "none since start"

#### Scenario: A checkout that would route around the App refuses the start

- **WHEN** `igor serve` starts in a lore checkout whose branch has no upstream, whose upstream's
  remote is `git@github.com:acme/lore.git`, or whose config sets `url.<base>.insteadOf`
- **THEN** it refuses to start, naming the checkout and what is wrong

### Requirement: A process applies one lore commit at a time, whole

A *lore read* is a process loading its configuration, its role files, the seat files and, where
`destination` names the lore repository itself, the lore entries it injects. An `igor serve`
process SHALL make each lore read from one commit of the lore repository, in a working tree of its
own detached at that commit and named by its role and rank. It SHALL never read them from the
lore checkout's own working tree. Before each lore read the process SHALL make its working tree
match the commit exactly, discarding any change or extra file in it, with no git hook run. A
relative path in `igor.config.yaml` that resolves inside the lore repository SHALL be read from
that working tree. One that resolves outside it, such as a `seatKey` beside the checkout, SHALL
resolve against the lore checkout's directory, as it does today. Each cycle report SHALL name the
commit applied. A `destination` naming another repository is read as it is today, and is not
fetched.

#### Scenario: A seat file being rewritten in the shared checkout is not read as removed

- **WHEN** a person checks out a commit in the lore checkout that rewrites `seats/bob.yaml`, while
  a process makes a lore read
- **THEN** the process reads `seats/bob.yaml` whole, from the commit it applies
- **AND** no worker using `bob` is killed

#### Scenario: A change written into a process's working tree is discarded

- **WHEN** something writes a wider `commands` list into `roles/backend.yaml` in the `backend-1`
  process's working tree
- **THEN** the next lore read discards it and reads the role file as the commit holds it

#### Scenario: A key file beside the checkout is still found

- **WHEN** `igor.config.yaml` names `seatKey: ../seat.key`
- **THEN** the process reads the key from beside the lore checkout, not beside its own working
  tree

#### Scenario: Each cycle report names the commit applied

- **WHEN** a cycle report is written
- **THEN** it names the lore commit the process applied during that cycle

### Requirement: `igor serve` starts on the newest commit that passes

The *startup checks* are the checks `igor serve` makes before its first cycle; of these, only the
validation of the configuration files is one a lore commit can fail. Each process keeps two refs
of its own, named by its role and rank: the *fetched* ref, which each fetch moves, and the
*applied* ref, which names the last commit whose lore read passed. Both survive a restart.

At start an `igor serve` process SHALL fetch, and SHALL make its first lore read from the commit
its fetched ref names. Where that fetch fails, the fetched ref still names what the process
fetched before it last stopped. A process with no fetched ref whose first fetch fails SHALL set
its fetched ref to the commit the lore checkout itself last fetched for the branch's upstream,
copying a ref with no network call.

Where the commit the fetched ref names fails the startup checks and the process has an applied
ref, the process SHALL start on the commit its applied ref names, with the condition
`lore:config:<role>-<rank>` open as for any refused read. The process SHALL refuse to start only
where it has no applied ref and the fetched commit fails. Either way, the configuration in force
SHALL lack every seat file the fetched commit lacks, as *A removed seat file applies as soon as a
fetch brings it* says.

The process SHALL report each uncommitted change in the lore checkout's working tree, and each
local commit the branch's upstream does not hold, naming each and saying that `igor serve` does
not apply it, and SHALL run without them.

#### Scenario: A restart while GitHub is down keeps a seat removal

- **WHEN** a process fetched a commit that removes `seats/bob.yaml` and fails the startup checks,
  and restarts while GitHub does not answer
- **THEN** it starts on the commit its applied ref names, without `bob`

#### Scenario: A restart after a bad commit landed starts on the last good one

- **WHEN** a process that has an applied ref restarts, and the newest commit it fetches deletes
  `roles/backend.yaml`
- **THEN** it starts on the commit its applied ref names, with `lore:config:backend-1` open
- **AND** it does not exit

#### Scenario: A first start on a failing commit is refused

- **WHEN** a process with no applied ref starts, and the commit it fetches fails the startup
  checks
- **THEN** it refuses to start

#### Scenario: Local edits and commits on the server are reported, not applied

- **WHEN** `igor serve` starts in a lore checkout where `roles/backend.yaml` has an uncommitted
  edit and the branch holds one commit its upstream does not
- **THEN** it reports both as not applied, naming the file and the commit
- **AND** it runs on the configuration as the upstream holds it

### Requirement: A lore read at each cycle start applies what passes and refuses what fails

At the start of each cycle an `igor serve` process SHALL make a lore read from the commit its
fetched ref names, whether or not that commit changed since its last read. This is the read that
#179's `work-claiming` delta makes at each cycle and refuses when it fails the startup checks. It
is also the read on which #171 decrypts seat files. Where the read passes, the process SHALL apply
that commit for the whole cycle and move its applied ref to it. Where it is refused, the process
SHALL go on under the commit its applied ref names and SHALL NOT exit. A newly fetched commit SHALL NOT change the configuration or lore
entries of a cycle already running, the workers it runs included, except under *A removed seat
file applies as soon as a fetch brings it*.

The condition a refused read opens SHALL be the read-cleared condition `lore:config:<role>-<rank>`,
as `stuck-conditions`' *A read-cleared condition opens on a failing read and clears on a passing
one* defines, so one process's passing read does not clear another's. Its report SHALL name the
commit, the file that failed and the check it failed. The process's next passing read SHALL clear
it.

A pull that removes the role file of the role a process runs fails the startup checks like any
other.

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
- **AND** `lore:config:backend-1` opens, naming the commit, `igor.config.yaml` and the check it
  failed

#### Scenario: A later passing commit clears the condition

- **WHEN** `lore:config:backend-1` is open and a fetch brings a commit whose configuration passes
- **THEN** the next cycle runs on that commit, and the condition clears with no probe item taken

#### Scenario: Another process's passing read does not clear it

- **WHEN** `lore:config:backend-1` is open and the `frontend-1` process's read passes
- **THEN** `lore:config:backend-1` stays open

#### Scenario: A fix on the server is picked up with no new commit

- **WHEN** a seat's file could not be decrypted because the key file named by `seatKey` was
  wrong, and the operator replaces the key file while the process runs
- **THEN** the next cycle's lore read decrypts the seat file, and #171's condition on that seat,
  `seat:<id>:decrypt`, clears, with no new commit fetched

#### Scenario: A running worker finishes on its cycle's commit

- **WHEN** a fetch brings a commit removing a command from `roles/backend.yaml`'s `commands`
  while a `backend` worker runs
- **THEN** that worker may still run the command until its item is published or handed off
- **AND** the next cycle runs under the narrowed list

#### Scenario: Removing the role a process runs is refused

- **WHEN** a fetch brings a commit that deletes `roles/backend.yaml` while a `backend` process
  runs
- **THEN** the process keeps running on its last commit that passed, and
  `lore:config:backend-1` names `roles/backend.yaml`

### Requirement: A removed seat file applies as soon as a fetch brings it

When a fetch brings a commit that lacks a seat file the configuration in force holds, the process
SHALL apply #171's *A removed seat file always takes effect* at once, without waiting for the next
cycle, even while a worker runs and even where that commit fails the startup checks. The
configuration in force SHALL always lack every seat file that the commit the fetched ref names
lacks, including when it is the configuration of the applied commit after a refused read. A
worker the process starts while the removal applies SHALL either never receive the seat's token
or be among the workers killed.

#### Scenario: A removal reaches a running worker within one poll interval

- **WHEN** a person merges a commit removing `seats/bob.yaml` while a worker has been using `bob`
  for an hour
- **THEN** within one poll interval the process applies the removal, as #171 specifies, and keeps
  running

#### Scenario: A removal in a refused commit still applies, and stays

- **WHEN** a fetch brings a commit that removes `seats/bob.yaml` and whose `igor.config.yaml`
  fails validation, and the next cycle's read is refused
- **THEN** the removal of `bob` applies, and the configuration the process keeps does not hold
  `bob`

#### Scenario: A worker starting during the removal does not keep the seat

- **WHEN** the process starts a worker on `bob` while it applies the removal of `seats/bob.yaml`
- **THEN** that worker either never receives `bob`'s token or is killed with the others

### Requirement: Processes apply new commits independently

Each `igor serve` process SHALL apply the newest commit it has fetched at its own cycle start, with
no agreement among processes about which commit applies. Two processes of one role MAY run on
different commits until each has fetched and started a cycle. #179 says whether its rules for
keeping two processes off one item hold while they do.

#### Scenario: Two ranks may apply different commits for a while

- **WHEN** a commit lands while ranks 1 and 2 of `backend` run, and rank 1 starts a cycle first
- **THEN** rank 1 runs a cycle on the new commit while rank 2 is still on the old one
- **AND** rank 2 applies the new commit at its own next cycle start after its fetch

### Requirement: A pull can be forced with SIGHUP

An `igor serve` process SHALL fetch at once when it receives `SIGHUP`, and SHALL apply what that
fetch brings as it applies any fetch. The signal itself SHALL NOT end the process or interrupt a
worker. The shipped systemd unit SHALL set `ExecReload=` to send the process `SIGHUP`, so that
`systemctl reload` forces a fetch.

#### Scenario: A reload forces a fetch

- **WHEN** an operator runs `systemctl reload igor@backend-1` right after a merge
- **THEN** the process fetches at once, and applies the commit at its next cycle start
- **AND** the process keeps running and its worker is not interrupted by the signal

### Requirement: Igor posts one notice for each seat-file change it applies

When an `igor serve` process's lore read passes, it SHALL compare the seat files of the commit it
reads with those of the commit its applied ref named until then, before moving the ref. For each
seat file the new commit adds or changes, Igor SHALL post one notice @-mentioning the seat's
owner, saying that the change has landed and is the one Igor now reads. For a changed file the
owner is the one the file named before the change, the lender whose token it held; for an added
file it is the owner the file names. A process with no applied ref compares nothing and posts
nothing.

The notice SHALL go on the merged pull request that brought the most recent commit to change that
file. Where no pull request brought that commit, it SHALL go on the commit itself, as a commit
comment. Igor SHALL NOT mention an owner on a pull request that owner opened, nor where `owner`
is not a GitHub login, as #171's seat-notice workflow does not, and where nobody is left to
mention no notice is posted.

Before posting, the process SHALL create a record on the state branch named by the seat's id and
the file's git blob id. That creation fails where the record already exists, and a process whose
creation failed SHALL NOT post.

#### Scenario: A rotated token is announced once

- **WHEN** a pull request changing `seats/bob.yaml` is merged, and three processes on two servers
  each apply the commit
- **THEN** exactly one notice @-mentioning `bob`'s owner is posted, on that pull request

#### Scenario: A changed owner is not who is told

- **WHEN** a merged commit changes `seats/bob.yaml`'s `owner` from `bob` to `mallory`
- **THEN** the notice mentions `@bob`, and not `@mallory`

#### Scenario: A change pushed without a pull request is announced on its commit

- **WHEN** a commit adding `seats/carol.yaml` reaches the branch without a pull request
- **THEN** the notice goes on that commit as a commit comment

#### Scenario: A refused commit is not announced

- **WHEN** a commit changing `seats/bob.yaml` fails the startup checks and is refused
- **THEN** Igor posts no notice for it until a commit holding that change is applied

#### Scenario: A change made while no process runs is announced at the restart

- **WHEN** a seat-file change lands while no `igor serve` process runs, and a process with an
  applied ref then starts and applies that commit
- **THEN** Igor posts the notice for it

### Requirement: `igor run` reads the checkout as it finds it

`igor run` SHALL NOT fetch the lore repository, and SHALL read its configuration from the lore
checkout's working tree as it finds it, uncommitted edits included.

#### Scenario: A developer's edit applies to a run by hand

- **WHEN** a developer edits `roles/backend.yaml` without committing and runs `igor run backend`
- **THEN** the run uses the edited file, and nothing is fetched
