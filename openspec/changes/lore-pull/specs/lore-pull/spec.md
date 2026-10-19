## ADDED Requirements

### Requirement: `igor serve` fetches its lore repository once per poll interval

The *lore checkout* is the git working tree holding the `igor.config.yaml` that `igor serve`
loads, whether `igor serve` found that file by searching up from its working directory or was
given its path. Its branch is the upstream of the branch checked out there. A
*fetch* downloads that branch's new commits; a *lore read* is a process loading its whole
configuration from one commit; a *pull* is a fetch and the lore read that follows it. The
*configuration in force* is the one a process runs under: the configuration its last passing
lore read loaded, less the seats that the requirement *A removed seat file applies as soon as a
fetch brings it* keeps out.

An `igor serve` process SHALL fetch that branch once per poll interval of its role, from a timer
apart from its cycle and from any worker. A fetch SHALL NOT delay `work-claiming`'s heartbeat
write (#179), and a fetch still running when the next fetch is due SHALL be ended and counted as
failed.
The fetch SHALL name the repository's `https://github.com/<owner>/<repo>` URL itself, SHALL act
as the role's GitHub App as `surface-adapter`'s *On GitHub, every call an Igor makes acts as its
App* requires, SHALL read no system-wide or per-user git configuration, and SHALL run no git
hook. It SHALL update only the process's own fetched ref, which *`igor serve` starts on the newest
commit that passes* defines, and SHALL change no file in any working tree.

`igor serve` SHALL refuse to start where the lore checkout has no branch checked out or its branch
has no upstream, where that upstream's remote URL is not an `https://github.com/` URL free of
credentials, or where the checkout's git configuration sets any key under `url.`, `http.`,
`credential.`, `filter.`, `include.` or `includeIf.`, or sets `core.fsmonitor`,
`core.sshCommand` or `core.gitProxy`. Each refusal names the checkout and what is wrong.

A fetch that fails, for any reason including a git lock held by another process, SHALL be tried
again when the next fetch is due. Until a fetch succeeds, each cycle's report SHALL say how long ago the
process's last successful fetch was, or "none since start". The process SHALL go on applying the
commit it has, and SHALL open no condition for the failure.

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

#### Scenario: A fetch acts as the App, runs no hook and touches only its own fetched ref

- **WHEN** the process fetches the lore repository
- **THEN** git authenticates with the App's token for that one command, reads no system-wide or
  per-user git configuration, and runs no hook
- **AND** only the process's fetched ref has moved, no git config holds a credential, and no file in
  any working tree has changed

#### Scenario: A failed fetch keeps the process on the commit it has

- **WHEN** fetches fail because GitHub does not answer, for three poll intervals
- **THEN** the process keeps applying the commit it applied before, opens no condition, and each
  cycle report until a fetch succeeds says when its last fetch succeeded, or "none since start"

#### Scenario: A checkout that would route around the App refuses the start

- **WHEN** `igor serve` starts in a lore checkout whose branch has no upstream, whose upstream's
  remote is `git@github.com:acme/lore.git`, or whose config sets `url.<base>.insteadOf` or
  `http.extraHeader`
- **THEN** it refuses to start, naming the checkout and what is wrong

### Requirement: A process applies one lore commit at a time, whole

A lore read loads the process's configuration, its role files, the seat files and, where
`destination` names the lore repository itself, the lore entries it injects. An `igor serve`
process SHALL make each lore read from one commit of the lore repository, in a working tree of its
own detached at that commit and named by its role and rank. It SHALL never read them from the
lore checkout's own working tree. The process SHALL create, repair and update that working tree
with no git hook run and no system-wide or per-user git configuration read, and before each lore
read SHALL make it match the commit exactly, discarding any change or extra file in it. A
relative path in `igor.config.yaml` SHALL resolve against the directory holding
`igor.config.yaml` in the lore checkout, as the code on the `main` branch resolves it. Where the result lies inside the lore checkout, the
process SHALL read that path in its working tree; where it lies outside, such as a `seatKey`
beside the checkout, it SHALL read the file at the resolved path. Each cycle report SHALL name the
commit applied. A `destination` naming another repository SHALL be read where the configuration
names it, and SHALL NOT be fetched.

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

#### Scenario: A destination in another repository is not fetched

- **WHEN** `destination` names a repository other than the lore repository
- **THEN** no fetch touches that repository, and the lore entries are read where the
  configuration names them

#### Scenario: Each cycle report names the commit applied

- **WHEN** a cycle report is written
- **THEN** it names the lore commit the process applied during that cycle

### Requirement: `igor serve` starts on the newest commit that passes

The *startup checks* on a lore read are every check a starting `igor serve` makes on the
configuration it reads, among them validation of the configuration files and the check that the
App can act on every repository the configuration names. Two outcomes do not fail a read. First,
a check that fails because GitHub did not answer: at a cycle start the process stays on the
commit it applied, opens no condition, and reads again at the next cycle start; at start it
exits with status 1, as `stuck-conditions`' *A process that refuses to start exits with status
78* says of a start check GitHub did not answer. Second, whether the roster declares the
process's rank is not a startup check on a lore read: a
passing read whose roster drops the rank retires it, and a start whose fetched commit drops it is
refused, both as #179's *A retired rank does not hold its items forever* says, with no fallback
to the applied commit. Each process keeps two refs of its own,
named by its role and rank: the *fetched* ref, which each fetch moves, and the *applied* ref,
which names the last commit whose lore read passed. Both survive a restart.

At start an `igor serve` process SHALL fetch, and SHALL make its first lore read from the commit
its fetched ref names. Where that fetch fails, the fetched ref still names what the process
fetched before it last stopped. A process with no fetched ref whose first fetch fails SHALL set
its fetched ref to the commit the lore checkout itself last fetched for the branch's upstream,
copying a ref with no network call.

Where the commit the fetched ref names fails the startup checks and the process has an applied
ref whose commit passes them, judged with every seat file it holds so that a removed seat cannot
make the commit that held it fail, the process SHALL start on
the commit its applied ref names, with the condition `lore:config:<role>-<rank>` open as for any
refused read. Where it has no applied ref, or the applied commit fails them too, the process
SHALL refuse to start. Whichever commit it starts on, the configuration in force SHALL then leave
out every seat *A removed seat file applies as soon as a fetch brings it* leaves out, even where
that leaves a role with no seat, as `seat-budget`'s *A removed seat file always takes effect*
(#171) allows.

The process SHALL report each uncommitted change in the lore checkout's working tree, and each
local commit that the commit its fetched ref names does not hold, naming each and saying that
`igor serve` does not apply it, and SHALL run without them.

#### Scenario: A restart whose fetch fails keeps a seat removal

- **WHEN** a process fetched a commit that removes `seats/bob.yaml` and fails the startup checks,
  and restarts while its fetch fails
- **THEN** it starts on the commit its applied ref names, without `bob`

#### Scenario: A restart that removes a role's last seat still starts

- **WHEN** a process restarts, its fetched commit removes `seats/bob.yaml`, the only seat serving
  its role, and fails the startup checks, and its applied commit passes them
- **THEN** it starts on the applied commit without `bob`, and takes no work that needs a seat

#### Scenario: A retired rank started again is refused

- **WHEN** a process starts and its fetched commit's roster does not declare its rank, while its
  applied commit's roster does
- **THEN** it refuses to start, as #179 says, and does not fall back to the applied commit

#### Scenario: A start GitHub does not answer exits 1, with no fallback

- **WHEN** a process that has an applied ref starts while GitHub does not answer the App check
- **THEN** it exits with status 1, which the supervisor restarts, and does not start on its
  applied commit

#### Scenario: A restart after a bad commit landed starts on the last good one

- **WHEN** a process that has an applied ref restarts, and the newest commit it fetches deletes
  `roles/backend.yaml`
- **THEN** it starts on the commit its applied ref names, with `lore:config:backend-1` open
- **AND** it does not exit

#### Scenario: A first start on a failing commit is refused

- **WHEN** a process with no applied ref starts, and the commit it fetches fails the startup
  checks
- **THEN** it refuses to start

#### Scenario: A restart whose applied commit no longer passes is refused

- **WHEN** a process restarts after an Igor upgrade, and both its fetched commit and its applied
  commit fail the startup checks
- **THEN** it refuses to start, naming both commits

#### Scenario: A first fetch that fails falls back to the checkout's own ref

- **WHEN** a process with no fetched ref starts and its first fetch fails
- **THEN** its fetched ref names the commit the lore checkout's remote-tracking ref names, and
  no network call made it

#### Scenario: Local edits and commits on the server are reported, not applied

- **WHEN** `igor serve` starts in a lore checkout where `roles/backend.yaml` has an uncommitted
  edit and the branch holds one commit the fetched commit does not
- **THEN** it reports both as not applied, naming the file and the commit
- **AND** it runs on the configuration the fetched commit holds

### Requirement: A lore read at each cycle start applies what passes and refuses what fails

At the start of each cycle an `igor serve` process SHALL make a lore read from the commit its
fetched ref names, whether or not that commit changed since its last read. That read is the one
at which `work-claiming` rereads the configuration (#179) and `seat-budget` decrypts seat files
(#171). A read SHALL fail the startup checks where the configuration no longer declares the role
the process runs, or that role's file is missing. Where the read passes, the process SHALL apply
that commit for the whole cycle and move its applied ref to it. Where it fails, the process SHALL
refuse it as `work-claiming`'s rule for a configuration read at the start of a cycle says (#179,
in *A retired rank does not hold its items forever*), the last configuration that passed being
the configuration held by the commit that the applied ref names, and SHALL open the condition below. A
newly fetched commit SHALL NOT change the configuration or lore entries of a cycle already
running, the workers it runs included, except under *A removed seat file applies as soon as a
fetch brings it*.

The condition a refused read opens SHALL be the read-cleared condition `lore:config:<role>-<rank>`,
of the kind `stuck-conditions`' *A read-cleared condition opens on a failing read and clears on a
passing one* defines. Its report SHALL name the commit, the file that failed and the check it
failed, and SHALL quote no value from the file. The process's next passing read SHALL clear it.

#### Scenario: GitHub not answering at a cycle start fails no read

- **WHEN** GitHub does not answer the App check during a cycle start's lore read
- **THEN** the process runs that cycle on the commit it applied, and opens no condition

#### Scenario: A passing read that drops the rank retires it

- **WHEN** a fetch brings a commit whose roster no longer declares rank 2 of `backend`, and the
  rest of the configuration passes
- **THEN** the `backend-2` process's read passes, and the rank retires as #179 says

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
  failed, and quoting no value from the file

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

- **WHEN** a fetch brings a commit that deletes `roles/backend.yaml`, or removes `backend` from
  `igor.config.yaml`, while a `backend` process runs
- **THEN** the process keeps running on its last commit that passed, and
  `lore:config:backend-1` names the file that no longer holds the role

### Requirement: A removed seat file applies as soon as a fetch brings it

When a fetch brings a commit that lacks a seat file the configuration in force holds, the process
SHALL apply #171's *A removed seat file always takes effect* at once, without waiting for the next
cycle, even while a worker runs and even where that commit fails the startup checks. Once any commit
after the applied commit, up to and including the fetched commit, deletes a seat's file, that
seat SHALL stay out of the configuration in force until a lore read that passes holds the file
again. A process with no applied ref has nothing in force to remove from, and its configuration
holds the seats its fetched commit holds.
A worker the process starts while the removal applies SHALL either never receive the seat's token
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

#### Scenario: A seat re-added in a refused commit stays out

- **WHEN** a refused commit removes `seats/bob.yaml`, and a later commit that adds it back is
  refused too
- **THEN** `bob` stays out of the configuration in force until a read that passes holds it

#### Scenario: A worker starting during the removal does not keep the seat

- **WHEN** the process starts a worker on `bob` while it applies the removal of `seats/bob.yaml`
- **THEN** that worker either never receives `bob`'s token or is killed with the others

### Requirement: Processes apply new commits independently

Each `igor serve` process SHALL apply the newest commit it has fetched at its own cycle start, with
no agreement among processes about which commit applies. Two processes of one role MAY run on
different commits until each has fetched and started a cycle.

#### Scenario: Two ranks may apply different commits for a while

- **WHEN** a commit lands while ranks 1 and 2 of `backend` run, and rank 1 starts a cycle first
- **THEN** rank 1 runs a cycle on the new commit while rank 2 is still on the old one
- **AND** rank 2 applies the new commit at its own next cycle start after its fetch

### Requirement: A pull can be forced with SIGHUP

An `igor serve` process SHALL fetch at once when it receives `SIGHUP`, and SHALL apply what that
fetch brings as it applies any fetch. It SHALL handle `SIGHUP` from its first moment, so that the
signal never ends the process, and the signal SHALL NOT interrupt a worker. The shipped systemd
unit SHALL set `ExecReload=` to send the process `SIGHUP`, so that `systemctl reload` forces a
fetch. Under the shipped compose file, `docker compose kill -s HUP <service>` SHALL reach the
process the same way.

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
reads with those of the commit its applied ref named until then, before moving the ref. For each
seat file the new commit changes and still holds at the same path, Igor SHALL post one notice
@-mentioning the seat's owner, saying that the change has landed and is the one Igor now reads.
The owner is the one the file names just before the most recent commit that changed it, in that
commit's first parent; where the commit the process applied before names another owner, Igor SHALL mention that one
too. A seat file the new commit adds, deletes or renames SHALL get no notice. A process with no
applied ref compares nothing and posts nothing.

The notice SHALL go on the merged pull request that brought the most recent commit to change that
file. Where no pull request brought that commit, it SHALL go on the commit itself, as a commit
comment. Igor SHALL NOT mention an owner who both opened that pull request and made the push that brought
that commit into it, nor an `owner` without a GitHub login's form. These are the two exclusions
of #171's *A pull request that changes a seat file mentions that seat's owner*, the first as
#171's decision 44 settles it: an owner who opened the pull request is still mentioned where
someone else made the push. That requirement's rule of one mention per pull request does not apply to Igor's
notice. Where these rules leave no one to mention, Igor SHALL post no notice.

Before posting, the process SHALL create a record on the state branch named by the seat's id and
the most recent commit that changed the file, with a call that fails where the record already
exists. A process whose call failed because the record exists SHALL NOT post. A call that failed
for any other reason SHALL be tried again at each later passing read while the process runs.
Where no process crashes between creating the record and posting, exactly one notice SHALL be
posted for each change.

#### Scenario: A workflow mention before the merge does not stop the notice

- **WHEN** #171's workflow mentioned `@bob` on a pull request's first push, and a maintainer's
  later push changes `seats/bob.yaml` again before the merge
- **THEN** Igor's notice after the merge mentions `@bob`

#### Scenario: The owner a superseded commit replaced is still told

- **WHEN** one commit changes `seats/bob.yaml`'s `owner` from `bob` to `mallory`, a second changes
  its token, and a process applies both at once
- **THEN** the notice mentions `@mallory`, the owner before the second commit, and `@bob`, the
  owner in the commit the process applied before

#### Scenario: A deleted seat file gets no notice from Igor

- **WHEN** a merged commit deletes `seats/bob.yaml`
- **THEN** Igor posts no notice for it, and the removal applies

#### Scenario: A rotated token is announced once

- **WHEN** a pull request changing `seats/bob.yaml` is merged, and three processes on two servers
  each apply the commit
- **THEN** exactly one notice @-mentioning `bob`'s owner is posted, on that pull request

#### Scenario: A changed owner is not who is told

- **WHEN** a merged commit changes `seats/bob.yaml`'s `owner` from `bob` to `mallory`
- **THEN** the notice mentions `@bob`, and not `@mallory`

#### Scenario: A maintainer's push to the lender's pull request is announced to the lender

- **WHEN** `bob` opens a pull request changing `seats/bob.yaml`, a maintainer pushes the commit
  that last changes it, and the pull request is merged
- **THEN** the notice mentions `@bob`

#### Scenario: The lender's own push to their own pull request is not announced to them

- **WHEN** `bob` opens a pull request changing `seats/bob.yaml`, pushes every commit in it
  himself, and it is merged
- **THEN** Igor posts no notice mentioning `@bob`

#### Scenario: A change pushed without a pull request is announced on its commit

- **WHEN** a commit changing `seats/bob.yaml` reaches the branch without a pull request
- **THEN** the notice goes on that commit as a commit comment

#### Scenario: A token changed back is announced again

- **WHEN** a merged commit changes `seats/bob.yaml` back to a content it held before
- **THEN** a notice for that commit is posted

#### Scenario: An added seat file is not announced

- **WHEN** a merged commit adds `seats/carol.yaml`
- **THEN** Igor posts no notice for it

#### Scenario: An owner that is not a GitHub login gets no notice

- **WHEN** a merged commit changes `seats/ops.yaml`, whose `owner` before the change is
  `Operations Team`
- **THEN** Igor posts no notice for it

#### Scenario: A record call that failed for another reason is tried again

- **WHEN** creating the record fails because GitHub does not answer
- **THEN** the process tries again at its next passing read, and posts once the record is created

#### Scenario: A refused commit is not announced

- **WHEN** a commit changing `seats/bob.yaml` fails the startup checks and is refused
- **THEN** Igor posts no notice for it until a commit holding that change is applied

#### Scenario: A process with no applied ref posts nothing

- **WHEN** a process starts for the first time and its first read passes
- **THEN** it posts no seat notice

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
