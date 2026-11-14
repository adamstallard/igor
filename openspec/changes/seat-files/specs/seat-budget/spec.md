## ADDED Requirements

### Requirement: A seat is a file under `seats/`, and its filename is its id

Every seat SHALL be a YAML file at `seats/<id>.yaml` in the lore repository, the repository at the
configuration's `destination`, and nowhere else. Its id SHALL be the filename without extension, of
lowercase letters, digits and hyphens, starting with a letter or digit. A seat file SHALL NOT carry
an `id` field. Files in `seats/` other than `*.yaml` are not seats. With no seat file no role can
spend, so an organization with no lenders SHALL declare a seat from its own token.

#### Scenario: A seat file declares a seat

- **WHEN** `seats/bob.yaml` declares an owner, a reserve of 0.5, `roles: [generalist]` and an
  `encrypted_token`
- **THEN** a seat `bob` is declared with that owner, reserve, role and token

#### Scenario: An id outside the format is refused

- **WHEN** `seats/Bob_1.yaml` declares a seat
- **THEN** it is refused, naming the file and saying a seat's id is lowercase letters, digits and
  hyphens, starting with a letter or digit

#### Scenario: A redundant id is refused

- **WHEN** a seat file declares an `id` field
- **THEN** it is refused, naming the file and saying the filename is the seat's id

#### Scenario: No seat files means no role can spend

- **WHEN** the lore repository has no `seats/` directory, or one holding no seat file, and `igor
  serve` starts
- **THEN** each role is refused at load, saying a seat file must list it, and `igor serve`
  refuses to start
- **AND** nothing runs on a stored Claude login in a seat's place

#### Scenario: An organization with no lenders declares a seat from its own token

- **WHEN** nobody lends a seat, and the operator adds a seat file listing every role, by `igor
  seat add` or as a `token_env` seat file
- **THEN** `igor serve` starts, and its roles spend from that seat

#### Scenario: The public key is not a seat

- **WHEN** `seats/` holds `recipient.txt` beside the seat files
- **THEN** it is not read as a seat

### Requirement: A seat file names its token only by ciphertext or its own variable

A seat file SHALL name its token with exactly one of `encrypted_token` and `token_env`, so every seat names a token source and none runs on a stored Claude login (*A spend with no seat behind it
is not made*). A seat file naming neither, or both, SHALL be refused, naming the file and both keys.
A seat file naming `token_command` or `token_file` SHALL be refused, naming the file and the key,
and saying a seat file names its token only with `encrypted_token` or `token_env`.

#### Scenario: A command is refused, naming the key

- **WHEN** a seat file declares `token_command`
- **THEN** it is refused, naming the file and `token_command`
- **AND** the refusal says a seat file names its token only with `encrypted_token` or `token_env`

#### Scenario: A file path is refused, naming the key

- **WHEN** a seat file declares `token_file`
- **THEN** it is refused, naming the file and `token_file`

#### Scenario: Both forms are refused

- **WHEN** a seat file declares both `encrypted_token` and `token_env`
- **THEN** it is refused, naming the file and both keys

#### Scenario: A seat naming no token is refused

- **WHEN** a seat file names neither `encrypted_token` nor `token_env`
- **THEN** it is refused, naming the file and both keys, and its seat is taken out
- **AND** nothing is spent on a stored Claude login in its place

### Requirement: A malformed seat file takes only its own seat out

A seat file is *malformed* where it does not parse as YAML, or a rule on its id, keys, roles or
token refuses it. Save a plain token, which fails the configuration, it SHALL NOT; its seat SHALL be ineligible: seat choice
SHALL NOT pick it, #143's probe SHALL skip it, and no token SHALL be read from it. A lore read
finding it malformed opens a read-cleared condition (as `stuck-conditions` defines it) on the seat its filename names,
`seat:<id>:file`.

#### Scenario: A malformed seat file takes only its seat out

- **WHEN** `seats/bob.yaml` declares `reserv: 0.5`, and `seats/adam.yaml` is well formed
- **THEN** the configuration loads, and roles served by `adam` keep working
- **AND** `bob` is never chosen or probed, and `seat:bob:file` opens, its report naming
  `seats/bob.yaml` and saying it is malformed
- **AND** `igor doctor` shows the refusal naming the key `reserv`

#### Scenario: A fixed seat file clears its condition

- **WHEN** `seat:bob:file` is open and a later lore read finds `seats/bob.yaml` well formed
- **THEN** the condition clears, and `bob` is eligible again

#### Scenario: A plain token still fails the configuration

- **WHEN** a seat file's `encrypted_token` is a plain token
- **THEN** the configuration is refused at load, and the refusal tells the holder to revoke the
  token

### Requirement: A seat's token travels as ciphertext in its file

A seat file's `encrypted_token` SHALL be an age ciphertext, encrypted to the public key committed as
`seats/recipient.txt` and base64-encoded on one line. Its plaintext SHALL be `<id>:<token>`: Igor
SHALL split it at the first colon and use the rest as the seat's token. A plaintext with no colon,
or whose part before the first colon is not its file's own seat id, SHALL fail decryption. A seat's
credential, wherever a rule compares or hashes it, SHALL be that token, never the ciphertext.

#### Scenario: Ciphertext is decrypted

- **WHEN** `seats/bob.yaml`'s `encrypted_token` is `bob:<token>` encrypted to the server's public
  key, and `seatKey` names the matching private key
- **THEN** the seat's token is `<token>`

#### Scenario: Ciphertext copied into another seat file is refused

- **WHEN** `seats/eve.yaml` carries the `encrypted_token` copied from `seats/bob.yaml`, which
  decrypts to `bob:<token>`
- **THEN** seat choice never picks `eve`, and #143's probe does not probe it
- **AND** the condition `seat:eve:decrypt` opens, and its report names `eve` and the id `bob`
  that the plaintext holds, and not `eve`'s owner
- **AND** `bob` itself is unaffected

#### Scenario: A plaintext with no seat id is refused

- **WHEN** a seat file's `encrypted_token` decrypts to a token with no `<id>:` before it
- **THEN** the seat is under the condition `seat:<id>:decrypt`, and no part of the plaintext is
  used as a token

#### Scenario: Re-encrypting a token is the same credential

- **WHEN** a holder encrypts the same token a second time and the new ciphertext merges
- **THEN** the seat's credential is unchanged, so its hash is unchanged and an open credential
  condition stays open

### Requirement: A role's seats are the seats whose files list it

A role SHALL draw on the seats whose files list it, and no other. A role MAY name one seat with
`seat:`, and then SHALL draw on it alone. A role SHALL be refused at load where it names a seat with
no seat file, naming it and the seats declared; a seat whose file does not list it, naming the file
and saying its holder adds the role; or none when no seat file lists it. No refusal applies under `igor run`, nor where *A role a malformed seat file may serve hands off* exempts a role.

#### Scenario: A role draws on every seat that lists it

- **WHEN** `seats/fleet-1.yaml` and `seats/adam.yaml` both list `generalist`, and
  `seats/sarah.yaml` does not
- **THEN** `generalist` may draw on `fleet-1` and `adam`, and not on `sarah`

#### Scenario: A role naming one seat draws on it alone

- **WHEN** `frontend` names `seat: fleet-1`, and `fleet-1` and `adam` both list `frontend`
- **THEN** `frontend` draws on `fleet-1` only

#### Scenario: A named seat that does not list the role is refused

- **WHEN** `frontend` names `seat: adam` and `seats/adam.yaml` does not list `frontend`
- **THEN** the role is refused at load, naming `seats/adam.yaml`

#### Scenario: A role no seat serves is refused

- **WHEN** no seat file lists `docs`, and `docs` names no seat
- **THEN** the role is refused at load, saying a seat file must list it

#### Scenario: Taking a role off a seat takes effect on the next load

- **WHEN** a merged change removes `generalist` from a seat file's `roles`
- **THEN** `generalist` no longer draws on that seat once the configuration is next loaded

#### Scenario: A role named in no seat file is not refused under `igor run`

- **WHEN** no seat file lists `docs`, and a developer runs `igor run docs` with `IGOR_RUN_TOKEN`
  set
- **THEN** `docs` is not refused at load

### Requirement: A role draws on the seat with the most headroom

Among the seats that serve a role and on which every other rule lets it spend now, the gate SHALL
choose the one with the most headroom: the smaller, over the seat's two windows, of the role's line
on it minus its reading, in percentage points. A window with no unreset reading, on a seat eligible
without one, SHALL count as 0% used. Ties SHALL go to the seat whose week window resets soonest, a
seat with no known week reset coming after every seat with one, and then to id order.

#### Scenario: A seat at reserve 0 is drawn on before a reserved one

- **WHEN** a role that declares no reserve is served by a seat at reserve 0 and a seat at
  reserve 0.5, both read at 40% in both windows, early in their weeks
- **THEN** the seat at reserve 0 is chosen, because its line is higher

#### Scenario: Load spreads across seats at reserve 0

- **WHEN** two seats at reserve 0 serve a role, one read at 70% and one at 30%
- **THEN** the seat at 30% is chosen

#### Scenario: The tighter window decides a seat's headroom

- **WHEN** a seat has 60 points of headroom in its week and 10 in its session
- **THEN** its headroom is 10

#### Scenario: The sooner reset breaks a tie

- **WHEN** two seats have equal headroom and one's week resets tomorrow and the other's in five
  days
- **THEN** the seat whose week resets tomorrow is chosen

#### Scenario: A seat with no known week reset comes last in a tie

- **WHEN** two seats have equal headroom, and only one has a known week reset
- **THEN** the seat with the known reset is chosen

#### Scenario: Seats still tied go in id order

- **WHEN** seats `alpha` and `beta` have equal headroom and the same week reset
- **THEN** `alpha` is chosen

#### Scenario: An unread seat at reserve 0 is drawn on

- **WHEN** a new seat at reserve 0 has no reading, another seat serving the role is read
  at 50%, and the role declares no reserve
- **THEN** the new seat is chosen, with its headroom counted from 0% used

#### Scenario: A reserved seat nothing has read is not drawn on

- **WHEN** every seat at reserve 0 serving a role is at its line, and the only other seat declares
  a reserve and has no unreset reading of a window
- **THEN** no seat is chosen, and the reserved seat is not spent from on a guess

### Requirement: A pull request that changes a seat file mentions that seat's owner

The lore repository SHALL carry a workflow, shipped as `templates/seat-notice.yml` and installed by
`igor init`, that comments on each pull request changing, renaming or deleting `seats/<id>.yaml`,
@-mentioning the `owner` in the default branch's copy of that file. It SHALL NOT read earlier
comments to decide whom to mention. It SHALL NOT mention an owner for an event they caused on a pull
request they opened.

#### Scenario: An operator's change mentions the lender

- **WHEN** an operator opens a pull request adding a role to `seats/bob.yaml`, whose `owner` on the
  default branch is `bob`
- **THEN** a comment on the pull request mentions `@bob`

#### Scenario: A pull request from a fork is noticed too

- **WHEN** a pull request from a fork changes `seats/bob.yaml`
- **THEN** `@bob` is mentioned on it

#### Scenario: The owner is taken from the default branch

- **WHEN** a pull request changes `seats/bob.yaml`'s `owner` from `bob` to `mallory`
- **THEN** `@bob` is mentioned, and `@mallory` is not

#### Scenario: A renamed seat file mentions its owner

- **WHEN** a pull request renames `seats/bob.yaml` to `seats/robert.yaml`
- **THEN** `@bob` is mentioned

#### Scenario: A deleted seat file mentions its owner

- **WHEN** a pull request deletes `seats/bob.yaml`
- **THEN** `@bob` is mentioned

#### Scenario: A new seat file mentions nobody

- **WHEN** a pull request adds `seats/carol.yaml`, which the default branch does not have
- **THEN** no one is mentioned for it

#### Scenario: The lender's own pull request does not mention them

- **WHEN** `bob` opens a pull request rotating the token in `seats/bob.yaml`
- **THEN** no one is mentioned for it

#### Scenario: Someone else's push to the lender's pull request mentions them

- **WHEN** `bob` opens a pull request changing `seats/bob.yaml`, and a maintainer then pushes a
  commit to it that changes the file's roles
- **THEN** `@bob` is mentioned

#### Scenario: No comment can silence a mention

- **WHEN** a comment posted as `github-actions[bot]`, by a workflow another pull request brought,
  is shaped like the workflow's notice and mentions `@bob`, and a later push changes
  `seats/bob.yaml`
- **THEN** the workflow still mentions `@bob`

### Requirement: `igor seat add` lends a seat in one step

`igor seat add <id>`, run by a holder (as `npx igor-agent seat add <id>` where Igor is not
installed), SHALL encrypt `<id>:<token>`, as *A seat's token travels as ciphertext in its file*
requires, to the key in `seats/recipient.txt` on the lore repository's default branch on GitHub,
and open a pull request against that branch with `gh`, adding `seats/<id>.yaml` or changing only
its `encrypted_token`. The token SHALL reach no disk, argument list or process environment.

#### Scenario: A first seat is lent

- **WHEN** a holder runs `igor seat add bob --reserve 0.5 --roles generalist` in a clone of the
  lore repository, which they may push to, and `seats/bob.yaml` does not exist on the default
  branch
- **THEN** a new branch pushed to the lore repository opens a pull request against its default
  branch that adds `seats/bob.yaml`
- **AND** that file's `owner` is the holder's GitHub login as `gh` reports it, its `reserve` is
  `0.5` and its `roles` list `generalist`
- **AND** its `encrypted_token` is ciphertext only the server's key decrypts, of `bob:` followed by
  the token, base64-encoded on one line

#### Scenario: A left-out reserve and roles are asked for

- **WHEN** a holder runs `igor seat add bob` without `--reserve` or `--roles`, and
  `seats/bob.yaml` does not exist
- **THEN** before reading the token, the command asks for the reserve, saying it is the share of
  each usage window Igors leave for the holder, from 0 to 1, and asks again until it gets one
- **AND** it asks for the roles, listing those the default branch defines and saying the seat
  serves only the roles named
- **AND** the seat file it writes carries the answers

#### Scenario: An empty roles answer is a seat that serves nothing yet

- **WHEN** a holder lending a new seat gives an empty answer to the roles prompt
- **THEN** the seat file it writes lists no roles

#### Scenario: A rotation asks for neither

- **WHEN** a holder runs `igor seat add bob` without `--reserve` or `--roles`, and
  `seats/bob.yaml` exists on the default branch
- **THEN** the command asks for neither, and the pull request changes only `encrypted_token`

#### Scenario: A holder without write access lends from a fork

- **WHEN** `gh` is signed in and the holder cannot push to the lore repository
- **THEN** the branch is pushed to their fork and the pull request opened from there

#### Scenario: Outside a clone, a holder without write access commits in their fork

- **WHEN** a holder who cannot push to `acme/igor-lore` runs `igor seat add bob --lore
  acme/igor-lore` in a directory that is no clone
- **THEN** the commit is made on a new branch of their fork through the GitHub API, and the pull
  request opened from there

#### Scenario: A seat is lent from outside a clone

- **WHEN** a holder who may push to `acme/igor-lore` runs `npx igor-agent seat add bob --lore
  acme/igor-lore --reserve 0.5 --roles generalist` in a directory that is no clone
- **THEN** a pull request against `acme/igor-lore` adds `seats/bob.yaml`, committed on a new branch
  of `acme/igor-lore` through the GitHub API
- **AND** nothing is cloned to the holder's disk
- **AND** before the token is read, the command prints `acme/igor-lore` as the repository the
  token is encrypted for and the pull request opened against

#### Scenario: Outside a clone, --lore is required

- **WHEN** a holder runs `igor seat add bob` in a directory that is no clone, without `--lore`
- **THEN** the command refuses before asking for the token, saying it needs `--lore <owner/repo>`

#### Scenario: Inside a clone, the lore repository is inferred

- **WHEN** a holder runs `igor seat add bob` without `--lore` in a clone whose `origin` is
  `acme/igor-lore` and which has no `upstream` remote
- **THEN** the pull request is opened against `acme/igor-lore`
- **AND** before the token is read, the command prints `acme/igor-lore` and that it came from the
  `origin` remote

#### Scenario: Inside a clone, `--lore` decides the lore repository

- **WHEN** a holder runs `igor seat add bob --lore acme/igor-lore` in a clone whose `origin` is
  `bob/other-lore`
- **THEN** the pull request is opened against `acme/igor-lore`, not the clone's remote

#### Scenario: Inside a fork's clone, `upstream` is the lore repository

- **WHEN** a holder runs `igor seat add bob` without `--lore` in a clone whose `origin` is
  `bob/igor-lore` and whose `upstream` is `acme/igor-lore`
- **THEN** the pull request is opened against `acme/igor-lore`
- **AND** before the token is read, the command prints `acme/igor-lore` and that it came from the
  `upstream` remote

#### Scenario: A holder without `gh` is refused

- **WHEN** `gh` is not installed, or not signed in
- **THEN** the command refuses before asking for the token, saying it needs `gh` signed in
- **AND** it writes and pushes nothing

#### Scenario: `igor seat add` acts as the holder's own `gh` login

- **WHEN** `igor seat add` makes a GitHub call
- **THEN** the call acts as the holder's own `gh` login, as a command that takes no role does, and
  not as an App
- **AND** Igor holds none of the holder's GitHub credentials; `gh` keeps its own login

#### Scenario: The holder is told how to create the token

- **WHEN** `igor seat add` reaches the point of reading the token
- **THEN** it first prints the steps for creating one: run `claude setup-token` in another
  terminal, signed in to the subscription being lent, and paste the token it prints
- **AND** only then reads the token, without echoing it

#### Scenario: Running it again rotates the token

- **WHEN** a holder runs `igor seat add bob` and `seats/bob.yaml` exists on the default branch
- **THEN** the pull request changes only that file's `encrypted_token`

#### Scenario: The key comes from the default branch

- **WHEN** the holder's working tree has a `seats/recipient.txt` different from the default
  branch's
- **THEN** the token is encrypted to the default branch's key

#### Scenario: The token is not echoed or kept

- **WHEN** the holder pastes the token
- **THEN** it is not shown on the terminal, and it is in no file, argument list or process's
  environment

#### Scenario: An operator's seat is not rotated this way

- **WHEN** a holder runs `igor seat add adam` and the default branch's `seats/adam.yaml` names
  `token_env`
- **THEN** the command refuses before asking for the token, saying that seat's token is set on the
  server by its operator

#### Scenario: An empty token or an invalid id is refused

- **WHEN** the holder enters an empty token, or runs `igor seat add Bob_1`
- **THEN** the command refuses, and opens no pull request
- **AND** it refuses an invalid id before asking for the token

#### Scenario: No public key, no token read

- **WHEN** the default branch has no `seats/recipient.txt`
- **THEN** the command refuses before asking for the token, saying the operator commits the
  server's public key there

### Requirement: A lent seat is decrypted only where the worker has a user of its own

No worker of a process decrypting `encrypted_token` SHALL be able to read the key `seatKey`
names. A local host meets it with a worker user per worker (#175's `task-execution`). Igor SHALL
decrypt none under `igor run`, whose worker runs as the Igor's own user, or under an `igor serve`
without worker users, where a lent seat SHALL serve no role. An undecrypted lent seat SHALL raise
no condition. Where `igor run` can read the key, it SHALL refuse to start before any model call,
naming the path.

#### Scenario: `igor run` refuses where it can read the server's key

- **WHEN** `igor run` starts as a user who can read the file `seatKey` names
- **THEN** it refuses before any model call, naming that path
- **AND** no worker starts

#### Scenario: `igor serve` without worker users decrypts no lent seat

- **WHEN** `igor serve` runs its workers as its own user, because its code has no worker users,
  and the seats serving a role are one naming `encrypted_token` and one naming `token_env`
- **THEN** the `encrypted_token` is not decrypted, and that seat is neither drawn on nor probed,
  and no condition is raised for it
- **AND** the role draws on the `token_env` seat

#### Scenario: A role whose only seat is lent is refused without worker users

- **WHEN** `igor serve` runs its workers as its own user, because its code has no worker users,
  and the only seat serving a role names `encrypted_token`
- **THEN** the role is refused at load, as a role with no seat is, and the refusal says that
  this `serve` has no worker users, so it uses no lent seat

#### Scenario: igor budget shows a lent seat unused without worker users

- **WHEN** `igor budget` runs from code that has no worker users, and a seat names
  `encrypted_token`
- **THEN** it shows that seat as not used, saying that this version of Igor has no worker users

#### Scenario: `igor run` decrypts no lent seat

- **WHEN** `igor run` starts, and the seats serving its role are one naming `encrypted_token` and
  one naming `token_env`
- **THEN** no seat's `encrypted_token` is decrypted
- **AND** neither seat is drawn on or probed, and no condition is raised for either

### Requirement: `igor run` spends its own token as an implicit local seat

Under `igor run`, Igor SHALL spend only from an implicit local seat, `_run`, with no file and
nothing in the lore repository, whose token is `IGOR_RUN_TOKEN` in the environment `igor run`
started in, and from no seat file's seat. No seat file need list the run's role. `_run`'s reserve
SHALL be 0, and wherever a rule uses the larger of a seat's reserve and a role's, it SHALL use 0;
every other rule of the gate applies. Where the variable is unset or empty, `igor run` SHALL
refuse to start.

#### Scenario: A run spends its own token

- **WHEN** a developer runs `igor run generalist` with `IGOR_RUN_TOKEN` set, and seat files list
  `generalist`
- **THEN** every model call the run makes uses that token, and is charged to the seat `_run`
- **AND** no seat file's seat is drawn on
- **AND** Igor says, when the run starts, that it spends the token in `IGOR_RUN_TOKEN`

#### Scenario: A run needs no seat file

- **WHEN** no seat file lists `docs`, and a developer runs `igor run docs` with `IGOR_RUN_TOKEN`
  set
- **THEN** the role is not refused for want of a seat, and the run spends `IGOR_RUN_TOKEN`

#### Scenario: Without the variable, the run refuses

- **WHEN** a developer runs `igor run generalist` with `IGOR_RUN_TOKEN` unset or empty
- **THEN** `igor run` refuses before any model call, naming `IGOR_RUN_TOKEN` and printing the
  steps for creating a token with `claude setup-token`
- **AND** no stored Claude login and no seat file's seat is used in its place

#### Scenario: A role's reserve does not hold back the run's seat

- **WHEN** `generalist` declares `reserve: 0.3`, and a developer runs `igor run generalist` with no
  reading yet of `_run`
- **THEN** the run draws on `_run`

### Requirement: A spend with no seat behind it is not made

Every model call Igor makes on its own behalf, under `igor serve` and `igor run`, SHALL be made
with the token of the seat the gate chose for the role, and charged to it; where the gate names no
seat, the call SHALL NOT be made. A seat probe and #143's live `/usage` read are instead made with,
and charged to, the seat they read. Igor SHALL NOT make a model call on a stored Claude login or any
other credential no seat names, in place of a seat or beside one.

#### Scenario: No seat, no spend

- **WHEN** the gate names no seat for a role, because every seat that serves it is spent or none
  can be used
- **THEN** no model call is made on that role's behalf
- **AND** no credential is substituted for the seat's

#### Scenario: A spend nothing can attribute is refused rather than recorded as a stored login

- **WHEN** a call could only be made on a credential no seat names
- **THEN** it is refused
- **AND** it is not made and recorded against a stored login instead

#### Scenario: Igor never chooses a stored login

- **WHEN** the host running Igor holds a stored Claude login, under `igor serve` or `igor run`
- **THEN** Igor passes every model call a seat's token, and never a stored login in its place

#### Scenario: A deployment that declares no seats spends nothing

- **WHEN** `igor serve` runs on a host holding a stored Claude login, and the lore repository has
  no seat files
- **THEN** Igor makes no model call on that login

#### Scenario: Claude Code's own preference under `igor run` is accepted

- **WHEN** under `igor run` Claude Code authenticates a call with the developer's stored login in
  preference to the token Igor passed
- **THEN** the call runs on the developer's own login and quota, and Igor neither works around it
  nor refuses it

#### Scenario: The startup skills check goes through the gate

- **WHEN** Igor makes #174's startup skills check, and the check is no seat's probe, as under
  `igor run`
- **THEN** the call is charged to the seat the gate chose and made with that seat's token

#### Scenario: A startup skills check that is a seat's first probe is charged as one

- **WHEN** under `igor serve` a seat is due a probe at start, as #174's *The startup check spends a
  seat it may probe, or else the gate's* has it
- **THEN** #174's startup skills check is that seat's first probe, made with that seat's own token
  and charged to it, without the gate choosing

#### Scenario: A live `/usage` read is made only where the endpoint reports windows

- **WHEN** a seat's credential is one the `/usage` endpoint reports no windows for, such as a
  `setup-token`
- **THEN** Igor makes no live `/usage` read for that seat

#### Scenario: A call that runs names the seat that paid

- **WHEN** the gate names a seat and the call is made
- **THEN** the call uses that seat's credential
- **AND** the record names that seat as having paid

### Requirement: A decrypted seat token never touches the server's disk

A seat's decrypted token SHALL be held only in the Igor process's memory, and reach a worker only
through its environment, as #175's `task-execution` requires. Igor SHALL NOT write it to a file,
an argument list, a log, the state branch, a condition's report or record, an error message, or
crash output such as a stack trace or an uncaught error's message. A report names the seat, never
the token. This covers what Igor writes, not what a worker does with the token.

#### Scenario: A run leaves the token in nothing Igor wrote

- **WHEN** a run has used a seat whose decrypted token is a known test value
- **THEN** that value appears in no log, transcript, handoff, condition report or file on the
  state branch, and in no argument list of a process Igor started
- **AND** the worker's environment held it

#### Scenario: A failure that names a seat does not print its token

- **WHEN** a worker spawn or a seat probe fails, or Igor crashes, while a seat's token is decrypted
- **THEN** the error message and any crash output name the seat and not the token

### Requirement: A removed seat file always takes effect

When a pull of the lore checkout (#208) removes a seat file, the removal SHALL apply
at the next cycle start's lore read, even where the startup checks refuse the rest of the pull.
Igor SHALL drop its token from memory, give the seat to no new worker, end every worker
using it and all it started, but no other, hand off their items, and keep running. A local host meets this by killing the `claude -p` child and its #175 worker user's processes, or without such users, the
child's process group.

#### Scenario: Removing a seat file stops Igor's use of the seat

- **WHEN** a pull removes `seats/bob.yaml` while a worker is using `bob`
- **THEN** Igor kills that worker and every process its worker user owns, and hands off its item
- **AND** no new worker is given `bob`, and the Igor process keeps running

#### Scenario: Without worker users, a removal kills the worker's process group

- **WHEN** `igor serve` runs its workers as its own user, because its code has no worker users,
  and a pull removes `seats/adam.yaml`, naming `token_env`, while a worker is using `adam`
- **THEN** Igor kills that worker's `claude -p` child and its process group, and hands off its item

#### Scenario: A removal reaches no other worker

- **WHEN** a pull removes `seats/bob.yaml` while one worker is using `bob` and another `carol`
- **THEN** the worker using `carol`, and every process it started, keeps running

#### Scenario: Under `igor run`, a removal kills nothing

- **WHEN** a pull removes a seat file while `igor run` is running
- **THEN** no worker is killed, since none uses a seat file's seat

#### Scenario: Removing the last seat file leaves the role with no seat, not on a login

- **WHEN** a pull removes `seats/bob.yaml`, the only seat file listing `generalist`, while a
  worker is using `bob`
- **THEN** Igor kills that worker and hands off its item
- **AND** the process takes no new item, keeps running, and makes no model call on a stored login

#### Scenario: A removal that leaves a role no seat keeps the last configuration that passed

- **WHEN** a pull removes `seats/bob.yaml`, the only seat file listing `generalist`, and also
  changes `roles/docs.md`
- **THEN** the rest of the pull is refused, since `generalist`, left with no seat serving it, fails the checks a starting process makes
- **AND** the process runs on the last configuration that passed with `seats/bob.yaml` taken out,
  and without the change to `roles/docs.md`
- **AND** the next pull is checked as usual

#### Scenario: A removal applies even when the rest of the pull is refused

- **WHEN** a pull removes `seats/bob.yaml` and also brings a role file that fails validation
- **THEN** the role file is refused and the last configuration that passed is kept
- **AND** the removal of `bob` still takes effect

### Requirement: A seat file accepts only `owner`, `reserve`, `roles` and a token key

A seat file SHALL refuse any key but these, naming the file, the key and the accepted ones: `owner`,
optional, the holder, the person whose subscription it is, as their GitHub login where they have
one; `reserve`, optional, 0 when absent, as *Seats are named configuration entities with an owner
and a reserve* defines it; `roles`, required; and `encrypted_token` or `token_env`. A *lent seat* is
one whose file names `encrypted_token`: a person's subscription, lent to the team's Igors.

#### Scenario: A key nobody reads is refused

- **WHEN** a seat file declares `reserv: 0.5`
- **THEN** it is refused, naming the file, the key `reserv` and the accepted keys

#### Scenario: A `dedicated` key is refused

- **WHEN** a seat file declares `dedicated: true`
- **THEN** it is refused, naming the file, the key `dedicated` and the accepted keys

#### Scenario: A seat file with no reserve has reserve 0

- **WHEN** `seats/bob.yaml` names no `reserve`
- **THEN** the seat `bob` is declared with a reserve of 0

### Requirement: A seat file's `roles` lists role files other than the org base

`roles` SHALL be a list of strings, each naming a role file under `roles/` other than the org base, the role others extend.
A name with no role file SHALL be refused, naming the seat file, the name and the roles that exist.
The list MAY be empty: a seat that serves nothing, which a holder may want while they decide.

#### Scenario: A seat file without roles is refused

- **WHEN** a seat file omits `roles`
- **THEN** it is refused, naming the file and the missing key

#### Scenario: Roles that are not a list are refused

- **WHEN** a seat file declares `roles: generalist`
- **THEN** it is refused, naming the file and saying `roles` is a list of role names

#### Scenario: A role nobody defined is refused

- **WHEN** a seat file lists a role that has no file under `roles/`
- **THEN** it is refused, naming the seat file, the role, and the roles that exist

#### Scenario: The org base is not a role a seat can serve

- **WHEN** a seat file lists the org base among its `roles`
- **THEN** it is refused, naming the seat file and the org base, and saying a seat serves only
  role files other than the org base

#### Scenario: A seat file may list no roles

- **WHEN** `seats/bob.yaml` declares `roles: []`
- **THEN** the seat `bob` is declared, and no role draws on it

### Requirement: A seat's `token_env` is fixed by its id

A seat file's `token_env` SHALL be `IGOR_SEAT_` followed by the seat's id uppercased, with every
character other than a letter or digit replaced by `_`. A seat file whose `token_env` is any other
name SHALL be refused, naming the file, the name it gave and the name it must give. The variable
holds a plain token the operator put in the server's environment.

#### Scenario: Another variable is refused

- **WHEN** `seats/bob.yaml` declares `token_env: GH_TOKEN`, or `token_env: IGOR_SEAT_ADAM`
- **THEN** it is refused, naming the name it gave and `IGOR_SEAT_BOB`

#### Scenario: The name follows the id

- **WHEN** `seats/fleet-1.yaml` declares `token_env: IGOR_SEAT_FLEET_1`
- **THEN** it is accepted

### Requirement: A malformed seat file's condition quotes nothing from it

The report of `seat:<id>:file` SHALL name the file and say it is malformed, quoting nothing else
from it. A file whose name is not a seat id names no seat, and its `roles` are not read: all such
files share one read-cleared condition, `seats:filename`, whose report SHALL say only that a file
under `seats/` has a name that is not a seat id. The refusal's own text, naming the offending key or
value, SHALL be shown by the configuration's validation, and so by `igor doctor`, and by `igor
budget`.

#### Scenario: A file whose name is not a seat id names no seat

- **WHEN** `seats/Bob_1.yaml` is present beside well-formed seat files
- **THEN** the configuration loads, and `seats:filename` opens, its report saying a file under
  `seats/` has a name that is not a seat id, without the name
- **AND** `igor doctor` names `seats/Bob_1.yaml`

#### Scenario: `igor budget` shows a malformed file's refusal

- **WHEN** `seats/bob.yaml` declares `reserv: 0.5`, and an operator runs `igor budget`
- **THEN** `igor budget` shows the refusal naming the key `reserv`
- **AND** the report of `seat:bob:file` does not contain `reserv`

### Requirement: A role a malformed seat file may serve hands off

Where a malformed file's `roles` reads as a list of known roles, its ineligible seat serves them, so
they hand off rather than stop. While a malformed file whose `roles` cannot be read, or whose name
is not a seat id, is present, a role no other seat file lists SHALL NOT be refused at load for want
of a seat, and hands off each item, naming each open condition on a malformed seat file. A role
whose `seat:` names a malformed file's seat SHALL NOT be refused either, and draws on it alone.

#### Scenario: A role whose only seat file is malformed hands off

- **WHEN** the only seat file listing `generalist` is malformed, and its `roles` still reads as
  `[generalist]`
- **THEN** `generalist` is not refused at load, does not stop, and hands off each item naming
  `seat:<id>:file`

#### Scenario: A seat file that does not parse leaves unlisted roles handing off

- **WHEN** `seats/bob.yaml` is not valid YAML, and no other seat file lists `generalist`
- **THEN** `generalist` is not refused at load, and hands off each item naming `seat:bob:file`

#### Scenario: A role naming a malformed file's seat is not refused

- **WHEN** `frontend` names `seat: bob`, and `seats/bob.yaml` is malformed
- **THEN** `frontend` is not refused at load, draws only on `bob`, which is ineligible, and hands
  off naming `seat:bob:file`

### Requirement: A plain token in a seat file fails the configuration

An `encrypted_token` that does not begin with `YWdlLWVuY3J5cHRpb24ub3JnL3Yx`, the base64 of
`age-encryption.org/v1`, SHALL be refused at load, naming the file, and saying that a plain token
committed to the repository is to be revoked at Anthropic and replaced with ciphertext. Unlike every
other refusal of a seat file, this one fails the configuration.

#### Scenario: A plain token in a seat file is refused

- **WHEN** a seat file's `encrypted_token` is a `setup-token` beginning `sk-ant-`
- **THEN** it is refused at load, naming the file
- **AND** the refusal says to revoke that token at Anthropic and replace it with ciphertext

### Requirement: A seat's private key lives at `seatKey`, outside the lore checkout

Igor SHALL decrypt `encrypted_token` with the age identity at the path `igor.config.yaml` names as
`seatKey`, resolved against the config file's directory. A `seatKey` that resolves inside the lore
checkout SHALL be refused at load, naming the path and saying the private key must live outside the
repository. `seatKey` is optional: a configuration with no `encrypted_token` needs none.

#### Scenario: A key path outside the lore checkout is read

- **WHEN** `igor.config.yaml` in `/srv/lore` names `seatKey: /etc/igor/seat.key`
- **THEN** Igor reads the private key from `/etc/igor/seat.key`

#### Scenario: A key path inside the lore checkout is refused

- **WHEN** `igor.config.yaml` in `/srv/lore` names `seatKey: keys/seat.key`
- **THEN** the configuration is refused at load, naming `/srv/lore/keys/seat.key` and saying the
  private key must live outside the repository

#### Scenario: A configuration without ciphertext needs no key

- **WHEN** every seat file names `token_env`, and `igor.config.yaml` declares no `seatKey`
- **THEN** the configuration loads, and nothing reports a missing key

### Requirement: Ciphertext with no `seatKey` is a validation finding, not a failure

Where no `seatKey` is declared, the configuration's validation, which reads no secret, SHALL report
each seat file that carries `encrypted_token`, naming the file. The finding SHALL NOT fail the
configuration: Igor starts, and the seat is under `seat:<id>:decrypt`, whose report names the missing `seatKey`. `igor
doctor` shows that finding by invoking the validation (#113's `check-a-lore-repository`), and checks nothing
itself.

#### Scenario: Validation reports ciphertext with no key

- **WHEN** `seats/bob.yaml` carries `encrypted_token` and `igor.config.yaml` declares no `seatKey`
- **THEN** the configuration's validation reports it, naming `seats/bob.yaml`, without reading any
  key or token
- **AND** the configuration does not fail for it, and `igor serve` starts

### Requirement: A seat's token is decrypted only on a lore read

`igor serve` SHALL decrypt a seat's token only on a lore read: `lore-pull`'s (#208) term for an Igor
process loading its configuration, role files and seat files from one commit, at start and at each
cycle start where #208 makes one. `igor run` decrypts nothing, and neither does an `igor serve`
without worker users (*A lent seat is decrypted only where the worker has a user of its own*).
Starting a worker or a probe SHALL decrypt nothing: each gets the plaintext Igor holds from its last
read.

#### Scenario: A worker gets the token Igor already holds

- **WHEN** Igor starts a worker on a seat whose file it decrypted when it last read the seat files
- **THEN** the worker's token is the plaintext Igor holds from that read
- **AND** Igor decrypts nothing when it starts the worker

### Requirement: A lent seat a process holds no token for is read again before use

Where the gate would choose a lent seat the process holds no plaintext for, as when another
process's passing read cleared a condition this one's failing read opened, the process SHALL first
read that one seat file again, from the commit it last applied, at most once a cycle; that read is not a
lore read. If it decrypts, the process may use the seat. Where it fails, the process
SHALL pass the seat over for itself only, and SHALL NOT reopen the condition or append a condition
row.

#### Scenario: A process with no token for an eligible seat reads its file first

- **WHEN** one Igor process failed to decrypt `seats/bob.yaml` and holds no token for `bob`, and
  another process's passing read has since cleared `seat:bob:decrypt`
- **AND** the gate would choose `bob` for the first process
- **THEN** that process reads `seats/bob.yaml` again before using `bob`
- **AND** it uses `bob` only where that read decrypts the file; otherwise it passes `bob` over
  for itself, and `seat:bob:decrypt` stays clear for the other processes

### Requirement: A seat Igor cannot decrypt is unreadable and passed over

Decryption fails where no `seatKey` is declared, the key file cannot be read, the key does not
match, the ciphertext does not decrypt, or the plaintext does not name the file's own seat id. The
seat SHALL then be reported unreadable, with the reason, in its condition and in `igor budget`; no other credential SHALL be used in its
place, and it SHALL be ineligible: seat choice SHALL NOT pick it, and #143's probe SHALL skip it.

#### Scenario: Ciphertext with no key is unreadable, not substituted

- **WHEN** a seat file carries `encrypted_token` and the configuration declares no `seatKey`
- **THEN** the seat is reported unreadable, saying its token is encrypted and no `seatKey` is
  declared
- **AND** no other credential is used in its place

#### Scenario: A key that does not match is unreadable

- **WHEN** a seat's ciphertext was encrypted to a different public key from the one `seatKey`
  holds
- **THEN** the seat is reported unreadable, saying its token could not be decrypted with the key
  at that path

#### Scenario: A key file that cannot be read is unreadable, not substituted

- **WHEN** `seatKey` names a file the Igor cannot read
- **THEN** the seat is reported unreadable, naming the path and the reason
- **AND** no other credential is used in its place

### Requirement: A failed decryption opens `seat:<id>:decrypt` on the seat

A seat whose token Igor cannot decrypt SHALL be under a read-cleared condition (`stuck-conditions`'
*A read-cleared condition opens on a failing read and clears on a passing one*): what is read is the
seat's file, on a lore read; failing is any decryption failure, and the first such read opens the
condition; the condition is on the seat, with cure key `seat:<id>:decrypt`.

#### Scenario: A failed decryption opens the condition, and a good read clears it

- **WHEN** Igor starts and cannot decrypt `seats/bob.yaml`
- **AND** a later read of the seat files, such as a restart after `bob` is re-lent, decrypts it
- **THEN** the condition on `bob` opens at start, and clears on that later read
- **AND** neither depends on a handoff or on #143's probe
- **AND** each of the two reads appends a condition row, and a read between them that still
  fails to decrypt `bob` appends none

### Requirement: A decryption condition's report names the cure, not the lender

Where the key is read but a seat's ciphertext does not decrypt with it, or decrypts to a plaintext
naming another seat's id or none, the report of `seat:<id>:decrypt` SHALL name the seat and say its
lender re-lends it; where the file names no `owner`, the report SHALL say so, and that the operator
re-lends the seat or removes its file. The report SHALL NOT name the `owner`. Where no `seatKey` is
declared or the key file cannot be read, the report SHALL name the key.

#### Scenario: A report says when a seat names no owner

- **WHEN** a seat whose file names no `owner` carries ciphertext encrypted to another key
- **THEN** the condition's report says the file names no owner, and that the operator re-lends
  the seat or removes its file

#### Scenario: A lent seat that does not decrypt is skipped, and its lender named only to the operator

- **WHEN** `seats/bob.yaml`, whose `owner` is `bobsmith`, carries ciphertext that is corrupt or
  was encrypted to another key, and `seatKey` names a key Igor can read
- **THEN** seat choice never picks `bob`, and #143's probe does not probe it
- **AND** the seat's condition report names the seat `bob`, says its lender re-lends it, and does
  not contain `bobsmith`, so no handoff quoting it names the lender
- **AND** `igor budget` names `bobsmith` as the seat's owner

#### Scenario: An unreadable key's report names the key

- **WHEN** a seat file carries `encrypted_token`, `seatKey` names `/etc/igor/seat.key`, and Igor
  cannot read that file
- **THEN** the report of the seat's `seat:<id>:decrypt` names `/etc/igor/seat.key`

### Requirement: A decryption report shows a found id only in a seat id's form

Where a seat's plaintext names another seat's id, or none, the report of `seat:<id>:decrypt` SHALL
say so. It SHALL name the id it found only where that id has a seat id's form, and then in a code
span; any other text before the colon SHALL NOT be shown, since anyone can encrypt any text to the
public key.

#### Scenario: Text before the colon that is not a seat id is not shown

- **WHEN** a seat file's `encrypted_token` decrypts to `@everyone [x](https://example.com):<token>`
- **THEN** the condition's report says the plaintext names another seat or none, and shows none
  of the text before the colon

### Requirement: A lender's login appears only where the operator reads

Besides the notices that mention a seat's owner on a change to the file, a lender's login SHALL
appear only in `igor doctor` and `igor budget`, which the operator reads.
Where `igor budget` shows a seat it cannot decrypt, or one under `seat:<id>:decrypt`, it SHALL name
the seat's `owner`, showing it only where it has a GitHub login's form, letters, digits and single
hyphens, and otherwise saying the `owner` is not a GitHub login, with none of its text shown.

#### Scenario: `igor budget` shows an owner only in a login's form

- **WHEN** a seat whose file names `owner: "x\n\n@everyone"` cannot be decrypted, and an operator
  runs `igor budget`
- **THEN** the seat's line says its `owner` is not a GitHub login, and shows none of its text

### Requirement: A command a person runs checks seat files without a lore read

A command a person runs, such as `igor budget`, makes no lore read: it opens or clears no condition
and appends no condition row. It MAY decrypt seat files itself if it can read the key.
Where it cannot, it SHALL show a lent seat as not checked, naming the path, not as unreadable for
that failure.
Where it cannot decrypt a seat, it SHALL say its credential hash was not computed. Where the
execution log holds an open `seat:<id>:decrypt`, the seat's line SHALL also name it, as #82
specifies.

#### Scenario: A person's command that cannot read the key shows the seat not checked

- **WHEN** an operator who cannot read the file `seatKey` names runs `igor budget`, and no
  `seat:bob:decrypt` condition is open in the execution log
- **THEN** the lent seat `bob` is shown as not checked, naming the key's path, and its credential
  hash as not computed
- **AND** no condition opens and no condition row is appended

#### Scenario: A person's command names an open decryption condition

- **WHEN** an operator who cannot read the file `seatKey` names runs `igor budget`, and the
  execution log holds an open `seat:bob:decrypt`
- **THEN** the lent seat `bob` is shown as not checked, and its line names `seat:bob:decrypt`

### Requirement: A role with no eligible seat stops only on conditions no read clears

Eligibility is decided by #143's *A role has a seat it can spend when the gate would choose one now*
and by `stuck-conditions`' seat-scoped conditions. A seat under an open condition SHALL be passed
over, and the role SHALL keep working on its other eligible seats. Where none is eligible, the role
SHALL stop where at least one seat serves it, every one is under an open condition, and none of
those is read-cleared; otherwise the Igor SHALL hand off any item it holds, and the role SHALL NOT stop.

#### Scenario: A seat without headroom is passed over, not waited on

- **WHEN** the seat with the most headroom yesterday has reached its line
- **THEN** another eligible seat is chosen
- **AND** the Igor does not stop while any seat serving the role is eligible

#### Scenario: An undecryptable seat is passed over, not stopped on

- **WHEN** a role is served by two seats, and one has an open condition because its token cannot
  be decrypted
- **THEN** the role draws on the other seat
- **AND** the role does not stop for the first seat's condition

#### Scenario: Seats under a condition and seats at their lines are a handoff

- **WHEN** a role is served by two seats, one with an open condition because its token cannot be
  decrypted and the other at its line
- **THEN** the Igor hands off, and does not stop
- **AND** the handoff names the first seat's condition

#### Scenario: Exhausting every seat that serves a role is a handoff

- **WHEN** no seat that serves a role is eligible, and not every one is under an open condition
- **THEN** the Igor hands off rather than stopping silently

#### Scenario: A role whose every seat is refused its credential stops

- **WHEN** every seat serving a role is under an open condition for a refused credential
- **THEN** the role stops, as `stuck-conditions`' *A condition that recurs stops the affected
  scope from taking new work* says

### Requirement: A handoff with every seat under a condition is a condition handoff

A handoff for want of an eligible seat SHALL name each open condition on the role's seats, and SHALL
state no line crossing or reset for a seat under a read-cleared condition. Where every seat serving the role is under an open condition, it SHALL be a *condition handoff*, naming each condition and its cure,
stating no return time, with the condition as its reason, not a budget handoff. Where
a seat serving the role is at its line, it is a budget handoff, which states when capacity returns.

#### Scenario: A role whose only seat is undecryptable hands off rather than stops

- **WHEN** the only seat serving a role has an open condition because its token cannot be
  decrypted
- **THEN** the role does not stop, and hands off each item with a condition handoff
- **AND** the handoff names the condition and its cure, re-lending the seat or fixing the
  server's key, and states no return time
- **AND** the reason recorded is the condition, not holding back at the line

#### Scenario: A handoff beside a seat at its line is a budget handoff

- **WHEN** a role is served by two seats, one with an open condition because its token cannot be
  decrypted and the other at its line
- **THEN** the handoff states when the second seat's capacity returns, and names the first seat's
  condition, stating no line crossing or reset for that seat

### Requirement: A seat-file notice is posted on each event that changes the file

An owner SHALL be mentioned on every push that changes their seat file, and on every opening,
reopening, marking ready for review and change of base branch of a pull request that changes it. On
a push, the seat files changed SHALL be those differing between the head before and after it, or,
where the earlier head cannot be fetched, between the base and the new head; on any other event,
between the base and the head. An edit that leaves the base branch unchanged SHALL mention nobody.

#### Scenario: Marking a draft ready mentions the owner again

- **WHEN** a draft pull request that changes `seats/bob.yaml`, opened by someone other than
  `bob`, mentioned `@bob` when it was opened, and is then marked ready for review
- **THEN** `@bob` is mentioned

#### Scenario: A retargeted pull request is checked again

- **WHEN** a pull request that changes `seats/bob.yaml`, opened against a branch other than the
  default branch, is edited to target the default branch
- **THEN** the workflow runs, and `@bob` is mentioned

#### Scenario: Each push that changes a seat file mentions its owner again

- **WHEN** a pull request already mentioned `@bob`, and a later push to it changes
  `seats/bob.yaml` again and also changes `seats/dana.yaml`
- **THEN** a new comment mentions `@bob` and `@dana`

#### Scenario: A push that leaves the seat files alone mentions nobody

- **WHEN** a pull request already mentioned `@bob`, and a later push to it changes only
  `roles/triage.yaml`
- **THEN** no one is mentioned for that push

#### Scenario: A new title mentions nobody

- **WHEN** a pull request that changes `seats/bob.yaml` is edited to change only its title
- **THEN** the workflow mentions no one

#### Scenario: A push whose earlier head cannot be fetched compares against the base

- **WHEN** a force-push to a pull request that changes `seats/bob.yaml` leaves the earlier head
  unfetchable, and the push itself changes only `roles/triage.yaml`
- **THEN** `@bob` is mentioned, since `seats/bob.yaml` differs between the base and the new head

### Requirement: The seat-notice workflow runs on every pull request, from `pull_request_target` alone

The workflow SHALL run on GitHub-hosted runners, triggered by `pull_request_target` and by no other
event, when a pull request is opened, reopened, pushed to, marked ready for review, or edited, which
includes a change of base branch. The trigger SHALL have no `paths` filter, so that it runs on every
pull request: GitHub's path filter misses seat files on large pull requests (`design.md`, *The
lender hears about a change to their seat file*).

#### Scenario: A seat file in a very large pull request is still noticed

- **WHEN** a pull request changes 3,101 files, and `seats/bob.yaml` sorts after the first 3,000
- **THEN** the workflow runs, and `@bob` is mentioned

#### Scenario: A pull request with no seat file gets no comment

- **WHEN** a pull request changes only `roles/triage.yaml`
- **THEN** the workflow runs, and posts nothing

#### Scenario: A push runs no notice workflow

- **WHEN** a commit that changes `seats/bob.yaml` is pushed to the default branch with no pull
  request
- **THEN** the notice workflow does not run, so the workflow posts no comment

### Requirement: The seat-notice workflow takes only path names from a pull request's head

The workflow SHALL find the seat files a pull request changes by fetching its commits as git data,
with no checkout and no file contents, and comparing under `seats/` the trees of the two commits the
event calls for. It SHALL take nothing from the head but those paths' names, SHALL match each
against `^seats/[a-z0-9][a-z0-9-]*\.yaml$` before use, and SHALL run nothing from the head. Its
token SHALL be limited to reading contents and writing pull requests.

#### Scenario: The workflow holds no more than it needs

- **WHEN** the shipped workflow is read
- **THEN** it runs on a GitHub-hosted runner, checks nothing out, and its token can only read
  contents and write pull requests

#### Scenario: A path that is not a seat file is ignored

- **WHEN** a pull request changes `seats/recipient.txt`, or a file whose name does not match the
  seat-file pattern
- **THEN** no one is mentioned for it, and its contents are not read

### Requirement: Igor's own seat-file notice comes only after the change lands

Igor SHALL NOT comment on an open lore pull request about a seat file; its own notice comes only
after a seat-file change lands and Igor pulls it (`lore-pull`, #208).

#### Scenario: Igor itself does not comment on an open seat-file pull request

- **WHEN** a pull request changing `seats/bob.yaml` is open
- **THEN** no Igor comments on it; the only comment is the workflow's

### Requirement: The lore repository's default branch requires a pull request before merging

The lore repository's default branch SHALL require a pull request before merging, because only a
pull request's notice reaches the lender before the change lands. As `check-a-lore-repository`
(#113) requires, `igor doctor` reports a default branch that does not require one, or whose rule
administrators can bypass, through its check that direct pushes are prevented. The GitHub Actions
bypass that lore setup grants is expected, and is not reported.

#### Scenario: A branch that accepts direct pushes is reported

- **WHEN** the lore repository has seat files and its default branch does not require a pull
  request before merging
- **THEN** `igor doctor` reports it, by `check-a-lore-repository`'s check of direct pushes

### Requirement: The seat-notice workflow mentions only an owner in a GitHub login's form

The workflow SHALL NOT mention an `owner` that lacks a GitHub login's form, letters, digits and
single hyphens. It checks the form only, not that the login exists; `igor doctor` checks that.

#### Scenario: An owner that is not a GitHub login is not mentioned

- **WHEN** a pull request changes `seats/ops.yaml`, whose `owner` on the default branch is
  `Operations Team`, which does not have a GitHub login's form
- **THEN** no one is mentioned for it

## MODIFIED Requirements

### Requirement: Seats are named configuration entities with an owner and a reserve

Seats SHALL be declared by seat files, each with an identifier, an `owner` (the holder, who can read its usage), and a `reserve` (a fraction from 0 to 1, both included, of the remaining window held back from Igors), as *The reserve is untouchable* defines it; it is 0 where the file names
none. A seat's file SHALL list the roles it serves. A role SHALL spend only from seats that list
it, and MAY hold back more of one than the seat does, never less.

#### Scenario: Seat declared and referenced

- **WHEN** a seat file declares an owner and a reserve and lists a role
- **THEN** that role's spend is accounted against that seat
- **AND** the seat's owner is identifiable from the seat file alone

#### Scenario: Sharing made legible

- **WHEN** a seat file lists several roles
- **THEN** it is determinable from that file alone that they share a budget

#### Scenario: Role referencing an undeclared seat rejected

- **WHEN** a role names a seat that has no seat file
- **THEN** validation fails

#### Scenario: A seat nobody works on may declare a reserve

- **WHEN** a seat that nobody works on declares a reserve of 0.5
- **THEN** configuration is valid
- **AND** the seat is held to its line as any other seat is

#### Scenario: A reserve of 1 is accepted

- **WHEN** a seat declares a reserve of 1
- **THEN** configuration is valid

### Requirement: A role may hold back more of a seat than the seat does

A role MAY declare a `reserve`, a fraction from 0 to 1, both included, applying to every seat it
draws on but `igor run`'s implicit seat, and not set per seat. The line its Igor checks on a seat
SHALL use the larger of the seat's reserve and the role's (*The reserve is untouchable*), so a
role can hold back more than a seat does and never less; on a seat declaring 0, the role's alone
sets it. A role reserve is valid whatever seats the role draws on, a seat at reserve 0 included.

#### Scenario: A higher-reserve role yields to a lower one

- **WHEN** `frontend` declares a reserve of 0.3 and `generalist` declares none, both draw on one
  seat declaring reserve 0, half its week remains, and its week reading is 88%
- **THEN** `frontend`'s Igor takes no item on that seat, because its line is 85%
- **AND** `generalist`'s Igor may, because its line is 100%

#### Scenario: A role cannot lower a lender's reserve

- **WHEN** a seat declares a reserve of 0.5 and a role drawing on it declares 0.2
- **THEN** the role's line on that seat uses 0.5

#### Scenario: One reserve for every seat the role draws on

- **WHEN** a role declares a reserve of 0.3 and may draw on three seats
- **THEN** each of the three is judged against a line using at least 0.3

#### Scenario: A role reserve out of range is refused

- **WHEN** a role declares a reserve below 0 or above 1
- **THEN** validation fails

#### Scenario: A role reserve with a dedicated seat is valid

- **WHEN** a role naming a seat that no person uses, at reserve 0, declares a reserve of 0.4
- **THEN** configuration is valid

### Requirement: `budget_share` is a ceiling, not a reservation

A role's `budget_share` SHALL bound what it may consume of each seat it draws on. It MUST NOT
reserve capacity, and shares MUST NOT be required to sum to one. Its consumption of a seat SHALL
be its share of Igor's recorded spend on the seat times the fraction of the window the seat's
latest unreset reading reports used, not spend over a capacity figure. Without an unreset reading of a window, #143's *A seat with no reading is drawn on only where its line is the whole window* decides.

#### Scenario: Ceilings need not sum to one

- **WHEN** three roles that one seat serves each declare a share of 0.4
- **THEN** configuration is valid
- **AND** each is capped at 0.4 of that seat rather than allotted a third of it

#### Scenario: Unused capacity is available to another role

- **WHEN** one role is idle and another is working
- **THEN** the working role may consume up to its own ceiling
- **AND** it is not limited to a fraction reserved for it

#### Scenario: A busy role cannot starve the seat's owner

- **WHEN** a role reaches its ceiling on a person's seat
- **THEN** that seat's reserve is still untouched
- **AND** the reserve is enforced independently of any role's ceiling

#### Scenario: A share is measured against the reading

- **WHEN** a role accounts for half of Igor's recorded spend on a seat whose latest unreset week
  reading is 60%, and the role declares a `budget_share` of 0.3
- **THEN** the role is at its ceiling for the week on that seat
- **AND** no capacity figure enters the decision

### Requirement: A seat nothing has read is probed on the Igor server with its own token

The server running the Igors, and no other machine, SHALL probe each seat that has no unexpired
`usage` or `stream` reading of a window. Where a reading expired at a reset with a post-reset probe
due, that probe serves, and no other is made; where none is due, or an exclusion keeps it from running, the
seat SHALL be probed as soon as no exclusion applies, not at the next reset. `igor run` SHALL make
no seat probe.

#### Scenario: A reserved seat with no reading is probed

- **WHEN** a seat declares a reserve, and has no reading of any window
- **THEN** the server running the Igors makes one seat probe with that seat's token
- **AND** the probe's `rate_limit_event`, if there is one, is recorded as a `stream` reading of
  that seat

#### Scenario: An idle seat is read again once its reading expires

- **WHEN** a seat's newest reading of its session window has passed its reset and no run has been
  made on the seat since
- **THEN** the seat is probed

#### Scenario: A seat with an unexpired reading of every window is not probed

- **WHEN** a seat has an unexpired reading of both its windows
- **THEN** no probe is made on it to read it, though #143's probe at a line's crossing, or a check of its credential, may still probe it

#### Scenario: An excluded post-reset probe does not leave the seat unread

- **WHEN** a seat's session reading expires at a known reset, its post-reset probe is excluded by
  the hourly limit, and no run is made on the seat
- **THEN** the seat is probed once the hourly limit allows, without waiting for another reset

#### Scenario: An expiry at a known reset waits for the post-reset probe

- **WHEN** a seat's session reading expires at its reset and no run is made on the seat
- **THEN** the seat is probed ten minutes after that reset, once, and that probe also measures the
  window

#### Scenario: `igor run` probes no seat

- **WHEN** `igor run` runs, and a seat serving its role has no reading of any window
- **THEN** no seat probe is made, of that seat or of the run's own

#### Scenario: A probe never runs on a person's machine

- **WHEN** a seat is probed
- **THEN** the call is made by the server running the Igors, with the seat's token as the server
  holds it
- **AND** nothing is installed anywhere else for it

### Requirement: A seat probe is one minimal call on the seat's own token alone

A seat probe SHALL be one minimal `claude -p` call with the seat's own token, run from the
directories *A seat probe runs where only the Igor can write* places. Its environment SHALL be set
explicitly, as task-execution requires of a worker's, holding the host's network settings and no
credential but the seat's token and any user info in the host's proxy URL. Its `rate_limit_event`
SHALL be recorded as a `stream` reading of the seat, exactly as a worker run's is.

#### Scenario: A probe loads no project's settings

- **WHEN** a seat is probed
- **THEN** the call runs from an empty directory, with `HOME` set to a second empty directory
- **AND** no directory above the first holds a `.claude` directory or a `CLAUDE.md`, as *A seat
  probe runs where only the Igor can write* checks

#### Scenario: A probe is minimal

- **WHEN** a seat is probed
- **THEN** the call uses the cheapest model, a trivial prompt and no tools

#### Scenario: A probe reads the stream

- **WHEN** a seat is probed
- **THEN** the call runs with `--output-format stream-json --verbose`, with no credential but the
  seat's token and any user info in the host's proxy URL

#### Scenario: A probe's environment holds no credential but the seat's token and the host's proxy

- **WHEN** a seat is probed
- **THEN** the call's environment holds that seat's token and no other credential but the user
  info of the host's proxy URL, where the host's proxy URL holds user info

### Requirement: A seat is probed at most once an hour, and not for five hours after a probe got no event

A seat SHALL NOT be probed more than once an hour, counting any Igor's most recent recorded probe of it, nor while a probe this process started on it is still running; two Igors starting at
once may both probe. A probe that receives no readable `rate_limit_event` SHALL record no
observation, and the seat SHALL NOT be probed again for five hours, unless answered with an authentication failure, which the credential rules govern. A failed probe SHALL wait for those limits.

#### Scenario: No event, no observation, no loop

- **WHEN** a seat probe's stream carries no `rate_limit_event`
- **THEN** no observation is recorded
- **AND** that seat is not probed again for five hours

#### Scenario: Probes are rate-limited

- **WHEN** a seat was probed less than an hour ago
- **THEN** it is not probed again, whatever its readings

#### Scenario: A probe still running is not doubled

- **WHEN** a probe this process started on a seat has not yet returned
- **THEN** this process starts no other probe of that seat

#### Scenario: Another Igor's probe counts toward the hour

- **WHEN** another Igor recorded a probe of a seat less than an hour ago
- **THEN** this Igor does not probe it

#### Scenario: A failed probe is not retried at once

- **WHEN** a seat probe ends in an error exit with no `rate_limit_event`, other than an
  authentication failure
- **THEN** no other probe of that seat is made at once
- **AND** the next waits for the hourly limit and the five-hour back-off

#### Scenario: A probe that exits with an error is not retried at once

- **WHEN** a seat probe exits with an error other than an authentication failure
- **THEN** its spend is still recorded, on a spend row against the seat, with a cost of 0
- **AND** no `rate_limit_event` arrived, so the seat is probed again only once both the hourly
  limit and the five-hour back-off allow

### Requirement: A seat that could not be used is not probed

No seat probe SHALL be made on a seat while an unexpired refusal holds it, while its unexpired
reading reports extra usage, or, the crossing probe excepted, while its most recent unreset reading
of any window is at or past that window's line computed with the seat's own reserve; nor on a seat
whose token Igor could not decrypt or whose file is malformed, while its condition
`seat:<id>:decrypt` or `seat:<id>:file` is open.

#### Scenario: A refused seat is not probed

- **WHEN** a seat has an unexpired observation at 100% of a window
- **THEN** it is not probed until that observation's reset has passed

#### Scenario: A seat spending extra usage is not probed

- **WHEN** a seat's unexpired reading reports extra usage being spent
- **THEN** it is not probed until the window the reading's `rateLimitType` names resets

#### Scenario: A seat past its line is not probed

- **WHEN** a seat's session reading has expired, and its most recent unreset week reading is at or
  past the week's line
- **THEN** it is not probed while that remains so

#### Scenario: An undecryptable seat is not probed

- **WHEN** Igor could not decrypt a seat's file, and the seat has no reading of any window
- **THEN** the seat is not probed while its condition `seat:<id>:decrypt` is open

## REMOVED Requirements

### Requirement: A pool is an ordered list of seats, and order is the allocation mechanism

**Reason**: Pools are dropped (#148). A pool grouped seats for a role and
ordered them, and both jobs move to the seats. A seat's own file lists the roles it serves, so its
lender states which roles draw on it, and the gate orders eligible seats by headroom rather than
by a list an operator edits without the lender seeing.

**Migration**: Grouping is *A role's seats are the seats whose files list it*; ordering is *A role
draws on the seat with the most headroom*, which carries the rules this requirement stated that do
not depend on pools: a seat without headroom is passed over, a reserved seat nothing has read is
not the fallback, and exhausting every seat is a handoff.

### Requirement: A seat names its token through exactly one mechanism

**Reason**: Every seat is a seat file, and a seat file may not name `token_command` or
`token_file`. `token_command` runs on the Igor server with every other seat's
token in its environment, and `token_file` reads a path the seat file chooses, so neither may
appear in a file a lender contributes. The scenarios about files and commands are false.

**Migration**: *A seat file names its token only by ciphertext or its own variable*, and *A
seat's token travels as ciphertext in its file*.

### Requirement: A budget refuses a key nobody reads, and a list that is not a list

**Reason**: The `budget` mapping, its `seats` and `pools` lists, and each seat and pool entry
no longer exist. Seats are files under `seats/`, and pools are dropped.

**Migration**: A seat file refuses a key nobody reads (*A seat file accepts only `owner`, `reserve`,
`roles` and a token key*).

### Requirement: A spend with no seat behind it does not happen

**Reason**: Its scenario *A seat naming no token is still a seat* is false: a seat file naming no
token is refused. openspec will not apply a `MODIFIED` block that drops an
in-force scenario, so the requirement is removed and re-added under a new name.

**Migration**: *A spend with no seat behind it is not made* keeps the rule that the seat the gate
chose pays with its own token, and that no call is made where the gate names none. It drops the
exemption for an organization that declares no seats, with its scenario *An unenforced budget is
untouched*, because Igor never uses a stored Claude login (proposal, decision 36), and drops *A
seat naming no token is still a seat*. *A spend nothing can attribute is refused rather than
recorded as ambient* becomes *…recorded as a stored login*.
