## ADDED Requirements

### Requirement: A seat is a file under `seats/`, and its filename is its id

Every seat SHALL be a YAML file at `seats/<id>.yaml` in the lore repository, the repository at
the configuration's `destination`. Its id SHALL be the filename without extension, and SHALL
consist of lowercase letters, digits and hyphens, starting with a letter or digit. A seat file
SHALL NOT carry an `id` field, because the filename already carries identity.

A seat file SHALL accept these keys and refuse any other, naming the file, the offending key and
the accepted ones:

| Key | Required | Meaning |
|---|---|---|
| `owner` | no | the holder: the person whose subscription it is, as their GitHub login where they have one |
| `reserve` | no | as *Seats are named configuration entities with an owner and a reserve* defines it; 0 when absent |
| `roles` | yes | a list of the role names this seat serves; it MAY be empty |
| `encrypted_token` | one of these two | the seat's token, encrypted to the server's public key, as *A seat's token travels as ciphertext in its file* defines it |
| `token_env` | one of these two | the environment variable holding the seat's token, as *A seat file names its token only by ciphertext or its own variable* constrains it |

`roles` SHALL be a list of strings, each naming a role file under `roles/` other than the org
base. A name with no role file SHALL be refused, naming the seat file, the name, and the roles
that exist. An empty list is a seat that serves nothing, which a holder may want while they decide.

Seats SHALL be read from `seats/` and from nowhere else. Where `seats/` is absent or holds no seat
file, no seats are declared and budget is not enforced. Files in `seats/` other than `*.yaml`,
such as `recipient.txt`, are not seats.

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

#### Scenario: A key nobody reads is refused

- **WHEN** a seat file declares `reserv: 0.5`
- **THEN** it is refused, naming the file, the key `reserv` and the accepted keys

#### Scenario: A `dedicated` key is refused

- **WHEN** a seat file declares `dedicated: true`
- **THEN** it is refused, naming the file, the key `dedicated` and the accepted keys

#### Scenario: A seat file without roles is refused

- **WHEN** a seat file omits `roles`
- **THEN** it is refused, naming the file and the missing key

#### Scenario: A role nobody defined is refused

- **WHEN** a seat file lists a role that has no file under `roles/`
- **THEN** it is refused, naming the seat file, the role, and the roles that exist

#### Scenario: No seat files means budget is not enforced

- **WHEN** the lore repository has no `seats/` directory, or one holding no seat file
- **THEN** the configuration loads and budget is not enforced

#### Scenario: The public key is not a seat

- **WHEN** `seats/` holds `recipient.txt` beside the seat files
- **THEN** it is not read as a seat

### Requirement: A seat file names its token only by ciphertext or its own variable

A seat file SHALL name its token with exactly one of `encrypted_token` and `token_env`. These two
are the token mechanisms, and a seat *names a token source* where its file names one of them.
#143's *A seat nothing has read is probed on the Igor server with its own token* uses the term
*names a token source*: it probes only a seat that names one, which every seat file does.

A seat file naming neither SHALL be refused, naming the file and both keys. A seat file naming both
SHALL be refused, naming the file and both keys. A seat file naming `token_command` or `token_file`
SHALL be refused, naming the file and the key, and saying a seat file names its token only with
`encrypted_token` or `token_env`.

`token_env` SHALL be `IGOR_SEAT_` followed by the seat's id uppercased, with every character other
than a letter or digit replaced by `_`. A seat file whose `token_env` is any other name SHALL be
refused, naming the file, the name it gave and the name it must give. An id holds only lowercase
letters, digits and hyphens, so no two ids yield the same variable. The variable holds a plain
token the operator put in the server's environment.

Neither form runs or reads anything on the server beyond the seat's own token, so nothing depends
on telling an operator's seat file from a lender's. The variable's name is fixed so that a seat
file cannot name `GH_TOKEN`, or another seat's variable.

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

#### Scenario: Another variable is refused

- **WHEN** `seats/bob.yaml` declares `token_env: GH_TOKEN`, or `token_env: IGOR_SEAT_ADAM`
- **THEN** it is refused, naming the name it gave and `IGOR_SEAT_BOB`

#### Scenario: The name follows the id

- **WHEN** `seats/fleet-1.yaml` declares `token_env: IGOR_SEAT_FLEET_1`
- **THEN** it is accepted

#### Scenario: A seat naming no token is refused

- **WHEN** a seat file names neither `encrypted_token` nor `token_env`
- **THEN** it is refused at load, naming the file and both keys
- **AND** nothing is spent on whatever login is ambient on the server

### Requirement: A seat's token travels as ciphertext in its file

A seat file's `encrypted_token` SHALL be an age ciphertext, encrypted to the public key committed
as `seats/recipient.txt` and base64-encoded on one line. Igor SHALL decrypt it with the age
identity at the path `igor.config.yaml` names as `seatKey`, resolved against the config file's
directory, and use the plaintext as the seat's token.

A value that does not begin with `YWdlLWVuY3J5cHRpb24ub3JnL3Yx`, the base64 of
`age-encryption.org/v1`, SHALL be refused at load, naming the file, and saying that a plain token
committed to the repository is to be revoked at Anthropic and replaced with ciphertext. A plain
token in a seat file is a credential in git history, and the refusal is the only place anybody is
told.

Decryption SHALL happen where the token is read, whenever it is read, and the plaintext SHALL NOT
be written to disk, to an argument list, or to any record. Where decryption fails, the seat SHALL
be reported unreadable with the reason, and no other credential SHALL be used in its place: no
`seatKey` declared, a key file that cannot be read, a key that does not match, or a ciphertext
that does not decrypt.

A seat's credential, wherever another rule compares or hashes it, such as
`stuck-conditions`' *A seat's refused credential is a condition on that seat* (#101), SHALL be the
plaintext token and never the ciphertext. age encryption is randomized, so one token encrypted
twice yields two ciphertexts, and a hash of the new ciphertext would read as a new credential and
clear a condition the provider would only refuse again.

`seatKey` is optional. A configuration with no `encrypted_token` needs none.

The private key is the whole of the token's protection: a seat file is readable by everyone who
can read the lore repository, which may be anyone.

#### Scenario: Ciphertext is decrypted

- **WHEN** `seats/bob.yaml`'s `encrypted_token` was encrypted to the server's public key, and
  `seatKey` names the matching private key
- **THEN** the seat's token is the decrypted plaintext

#### Scenario: A plain token in a seat file is refused

- **WHEN** a seat file's `encrypted_token` is a `setup-token` beginning `sk-ant-`
- **THEN** it is refused at load, naming the file
- **AND** the refusal says to revoke that token at Anthropic and replace it with ciphertext

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

#### Scenario: The plaintext is kept nowhere

- **WHEN** a seat's token has been decrypted and a run has used it
- **THEN** the plaintext is in no file the Igor wrote, no argument list and no record

#### Scenario: Re-encrypting a token is the same credential

- **WHEN** a holder encrypts the same token a second time and the new ciphertext merges
- **THEN** the seat's credential is unchanged

### Requirement: A role's seats are the seats whose files list it

A role SHALL draw on the seats whose files list it in `roles`, and on no other. A role MAY name a
single seat with `seat:`, and then SHALL draw on that seat alone. A role SHALL be refused at load,
where seats are declared:

- where it names a seat with no seat file, naming the seat and the seats declared;
- where it names a seat whose file does not list it, naming the seat file and saying its holder
  lists the role there;
- where it names no seat and no seat file lists it, saying a seat file must list it.

Which roles a seat serves is decided in the seat's own file and nowhere else. A `seat:` that could
point a role at a seat whose file does not list it would be a second link the holder cannot see,
and that link is what this requirement exists to remove.

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

- **WHEN** seats are declared and no seat file lists `docs`, and `docs` names no seat
- **THEN** the role is refused at load, saying a seat file must list it

#### Scenario: Taking a role off a seat takes effect on the next load

- **WHEN** a merged change removes `generalist` from a seat file's `roles`
- **THEN** `generalist` no longer draws on that seat once the configuration is next loaded

### Requirement: A role draws on the seat with the most headroom

Among the seats that serve a role and on which every other rule lets that role spend now, the gate
SHALL choose the one with the most headroom. A seat's headroom for the role SHALL be the smaller,
over its two windows, of the role's line on that seat minus the seat's reading, in percentage
points. A window with no unreset reading, on a seat eligible without one because the line's
reserve is 0, SHALL count as 0% used. Where two seats have equal headroom, the gate SHALL choose
the one whose week window resets soonest; a seat with no known week reset SHALL come after every
seat with one. Seats still tied SHALL be taken in id order.

Which seats a role may spend on now is decided by the other rules, and this one only orders what
they admit. Those rules are *The reserve is untouchable* and *A seat nothing has read is probed on
the Igor server with its own token* (the line, and the probe made when the line rises past a seat's
last reading), *A seat spending extra usage has no headroom*, *A missing reading closes a reserved
seat and changes nothing else*, *`budget_share` is a ceiling, not a reservation*, and the
seat-scoped conditions of `stuck-conditions` (#101): a refused credential (*A seat's refused
credential is a condition on that seat*) and a token that cannot be read or decrypted, which
`stuck-conditions`' *A condition's scope is its cure's scope* makes a condition on the seat. A seat
under such a condition SHALL be passed over, and the role SHALL keep working on its other eligible
seats. Where every seat that serves the role is under such a condition, the role SHALL stop, as
`stuck-conditions` says. Where no seat that serves the role is eligible and not every one is under
such a condition, such as when every seat is at its line, or some are under a condition and the
rest are at their lines, the Igor SHALL hand off the item instead of stopping the role. A handoff
where some seats are under a condition SHALL name each such condition.

The tie-break spends the capacity a reset is about to destroy: leftover capacity in a week is lost
at its reset, while a session refills within hours.

#### Scenario: A seat at reserve 0 is drawn on before a lent one

- **WHEN** a role that declares no reserve is served by a seat at reserve 0 and a lent seat at
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

#### Scenario: An unread seat at reserve 0 is drawn on

- **WHEN** a new seat at reserve 0 has no reading, another seat serving the role is read
  at 50%, and the role declares no reserve
- **THEN** the new seat is chosen, with its headroom counted from 0% used

#### Scenario: A seat without headroom is passed over, not waited on

- **WHEN** the seat with the most headroom yesterday has reached its line
- **THEN** another eligible seat is chosen
- **AND** the Igor does not stop while any seat serving the role is eligible

#### Scenario: A reserved seat nothing has read is not drawn on

- **WHEN** every seat at reserve 0 serving a role is at its line, and the only other seat declares
  a reserve and has no unreset reading of a window
- **THEN** no seat is chosen, and the reserved seat is not spent from on a guess

#### Scenario: An undecryptable seat is passed over, not stopped on

- **WHEN** a role is served by two seats, and one has an open condition because its token cannot
  be decrypted
- **THEN** the role draws on the other seat
- **AND** the role does not stop for the first seat's condition

#### Scenario: A role whose only seat is undecryptable stops

- **WHEN** the only seat serving a role has an open condition because its token cannot be
  decrypted
- **THEN** the role stops, as `stuck-conditions` says, and does not hand off

#### Scenario: Seats under a condition and seats at their lines are a handoff

- **WHEN** a role is served by two seats, one with an open condition because its token cannot be
  decrypted and the other at its line
- **THEN** the Igor hands off, and does not stop
- **AND** the handoff names the first seat's condition

#### Scenario: Exhausting every seat that serves a role is a handoff

- **WHEN** no seat that serves a role is eligible, and not every one is under an open condition
- **THEN** the Igor hands off rather than stopping silently

### Requirement: A pull request that changes a seat file mentions that seat's owner

The lore repository SHALL carry a workflow, shipped as `templates/seat-notice.yml` and installed
by `igor init`, that comments on every pull request changing, renaming or deleting a file at
`seats/<id>.yaml`, @-mentioning that seat's owner. The owner SHALL be read from the default
branch's copy of the file. An owner SHALL be mentioned at most once per pull request, SHALL NOT be
mentioned on a pull request they opened, and SHALL NOT be mentioned where `owner` is not a GitHub
login.

The same workflow SHALL also run on every push to the default branch that changes, renames or
deletes a seat file, and SHALL comment on the pushed commit, @-mentioning each changed seat's
owner, read from the file as it was before the push. A change merged through a pull request
mentions them again on its commit. Whether a commit a workflow pushes with the repository's
automatic token triggers this run is not measured (task 10.6): GitHub documents that such a push
starts no workflow.

The workflow SHALL run on GitHub-hosted runners, triggered by `pull_request_target` so that it can
comment on pull requests from forks, and by `push`. It SHALL read nothing from a pull request's
head: no
checkout and no file contents, only the list of changed paths, each matched against
`^seats/[a-z0-9][a-z0-9-]*\.yaml$` before use. Its token SHALL be limited to reading contents and
writing pull requests; a comment on a commit needs only reading contents.

A mention SHALL be recognised as already made only from a comment the workflow itself posted.

The lore repository's default branch SHALL require a pull request before merging, because only
a pull request's notice reaches the lender before the change lands; a push notice comes after. `igor doctor`
reports a default branch that does not require one, through `check-a-lore-repository`'s check
that direct pushes are prevented (#113).

`pull_request_target` runs with a token that can write to the repository. A workflow on it that
read the pull request's head would hand a fork's code or data that token, so reading nothing from
the head is part of this requirement, not a detail of the template.

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

#### Scenario: A deleted seat file mentions its owner

- **WHEN** a pull request deletes `seats/bob.yaml`
- **THEN** `@bob` is mentioned

#### Scenario: A new seat file mentions nobody

- **WHEN** a pull request adds `seats/carol.yaml`, which the default branch does not have
- **THEN** no one is mentioned for it

#### Scenario: The lender's own pull request does not mention them

- **WHEN** `bob` opens a pull request rotating the token in `seats/bob.yaml`
- **THEN** no one is mentioned for it

#### Scenario: A later push does not repeat a mention

- **WHEN** a pull request already mentioned `@bob`, and a later push to it also changes
  `seats/dana.yaml`
- **THEN** a new comment mentions `@dana` only

#### Scenario: A mention someone else wrote does not count

- **WHEN** the pull request's author posts a comment shaped like the workflow's notice that
  mentions `@bob`, then changes `seats/bob.yaml`
- **THEN** the workflow still mentions `@bob`

#### Scenario: The workflow holds no more than it needs

- **WHEN** the shipped workflow is read
- **THEN** it runs on a GitHub-hosted runner, checks nothing out, and its token can only read
  contents and write pull requests

#### Scenario: A branch that accepts direct pushes is reported

- **WHEN** the lore repository has seat files and its default branch does not require a pull
  request before merging
- **THEN** `igor doctor` reports it, by `check-a-lore-repository`'s check of direct pushes

#### Scenario: A push to the default branch mentions the owner on the commit

- **WHEN** a commit that changes `seats/bob.yaml`, whose `owner` before the push is `bob`, is
  pushed to the default branch with no pull request
- **THEN** a comment on that commit mentions `@bob`

#### Scenario: A push to another branch mentions nobody

- **WHEN** a commit changing `seats/bob.yaml` is pushed to a branch other than the default branch
- **THEN** no comment is posted for that push

#### Scenario: A path that is not a seat file is ignored

- **WHEN** a pull request changes `seats/recipient.txt`, or a file whose name does not match the
  seat-file pattern
- **THEN** no one is mentioned for it, and its contents are not read

### Requirement: `igor seat add` lends a seat in one step

`igor seat add <id>` SHALL be run by a holder, as `npx igor-agent seat add <id>` where Igor is not
installed, and SHALL:

1. Read the public key from `seats/recipient.txt` on the lore repository's default branch on
   GitHub, not from the working tree.
2. Read the token from the terminal without echoing it, and refuse an empty one.
3. Encrypt it to that key, and base64-encode the result on one line.
4. Where `seats/<id>.yaml` does not exist on the default branch, write it with the holder's GitHub
   login as `owner`, the `reserve` and `roles` given as options, and the ciphertext as
   `encrypted_token`. Before writing, check with `gh api users/<owner>` that `owner` is a GitHub
   login, and refuse where it is not.
5. Where `seats/<id>.yaml` already exists on the default branch and names `encrypted_token`,
   replace its `encrypted_token` and change nothing else. This is how a token is rotated. Where it
   names `token_env`, refuse before reading the token, saying the seat's token is set on the
   server by its operator.
6. Commit on a new branch, push it to the lore repository where the holder may and otherwise to
   their fork, and open a pull request against the default branch with `gh`.

The command SHALL require `gh`, installed and signed in, and SHALL refuse before reading the token
where it is missing or signed out. Igor SHALL NOT hold the holder's GitHub credentials: `gh` keeps
its own login. Which lore repository the command uses outside a clone, and how it commits there,
is an open question in the proposal.

The token SHALL NOT be written to disk, to an argument list, or to any process's environment. The
command SHALL refuse, before reading the token, where `seats/recipient.txt` is absent on the
default branch, or `<id>` is not a valid seat id.

`igor seat add` runs as no role (its `--roles` only fills in the seat file), so it has no App
identity, and where it uses `gh` it acts with the holder's own `gh` login.
`surface-adapter`'s *On GitHub, every call an Igor makes acts as its App* covers only `igor run` and
`igor serve`, and says a command that takes no role keeps the person's own login.

The key is read from the default branch because a pull request can change the working tree's
copy, and whoever replaces `recipient.txt` receives every token encrypted to it afterwards.

#### Scenario: A first seat is lent

- **WHEN** a holder runs `igor seat add bob --reserve 0.5 --roles generalist` and `seats/bob.yaml`
  does not exist
- **THEN** a pull request adds `seats/bob.yaml`, carrying ciphertext only the server's key
  decrypts

#### Scenario: A holder without write access lends from a fork

- **WHEN** `gh` is signed in and the holder cannot push to the lore repository
- **THEN** the branch is pushed to their fork and the pull request opened from there

#### Scenario: A holder without `gh` is refused

- **WHEN** `gh` is not installed, or not signed in
- **THEN** the command refuses before asking for the token, saying it needs `gh` signed in
- **AND** it writes and pushes nothing

#### Scenario: An owner that is not a GitHub login is refused

- **WHEN** `gh api users/<owner>` finds no such user
- **THEN** the command refuses before writing the seat file, naming the login

#### Scenario: Running it again rotates the token

- **WHEN** a holder runs `igor seat add bob` and `seats/bob.yaml` exists on the default branch
- **THEN** the pull request changes only that file's `encrypted_token`

#### Scenario: The key comes from the default branch

- **WHEN** the holder's working tree has a `seats/recipient.txt` different from the default
  branch's
- **THEN** the token is encrypted to the default branch's key

#### Scenario: The token is not echoed or kept

- **WHEN** the holder pastes the token
- **THEN** it is not shown on the terminal, and it is in no file, argument list or child
  environment

#### Scenario: An operator's seat is not rotated this way

- **WHEN** a holder runs `igor seat add adam` and the default branch's `seats/adam.yaml` names
  `token_env`
- **THEN** the command refuses before asking for the token, saying that seat's token is set on the
  server by its operator

#### Scenario: An empty token or an invalid id is refused

- **WHEN** the holder enters an empty token, or runs `igor seat add Bob_1`
- **THEN** the command refuses, and opens no pull request

#### Scenario: No public key, no token read

- **WHEN** the default branch has no `seats/recipient.txt`
- **THEN** the command refuses before asking for the token, saying the operator commits the
  server's public key there

### Requirement: A lent seat is decrypted only where the worker has a user of its own

Where no worker user is configured, so that the worker runs as the Igor's own user (#175's
`igor run`, and `igor serve --same-user`), Igor SHALL NOT decrypt any seat's `encrypted_token`,
and SHALL NOT draw on that seat. Only seats naming `token_env` SHALL run there. Igor SHALL say so
when it starts, naming each seat it leaves undecrypted. A worker running as the Igor's own user
can read the key `seatKey` names, and with it every lent token.

#### Scenario: Same-user mode leaves a lent seat undecrypted

- **WHEN** `igor run` starts with no worker user configured, and the seats serving its role are
  one naming `encrypted_token` and one naming `token_env`
- **THEN** the seat naming `encrypted_token` is not decrypted and not drawn on
- **AND** the seat naming `token_env` is drawn on
- **AND** Igor says, when it starts, that it leaves the lent seat undecrypted because workers run
  as its own user

### Requirement: A spend with no seat behind it is not made

Where seats are declared, every model call Igor makes on its own behalf SHALL be charged to the
seat the gate chose for the role, and SHALL be made with that seat's credential. A seat probe is
the one exception to the gate choosing: it is charged to the seat it reads and made with that
seat's own credential.
Where the gate names no seat, the call SHALL NOT be made, and no ambient credential SHALL be
substituted for the seat the gate did not name. Where an organization declares no seats, budget is
not enforced and this requirement places no condition on anything.

The condition is whether the gate named a seat. Every seat file names its token (*A seat file
names its token only by ciphertext or its own variable*), so a seat the gate names always has a
credential of its own. What has no seat behind it is a call the gate refused to choose one for.

This is the spending-side counterpart of the rule for reading a seat's token (*A seat's token
travels as ciphertext in its file*): a seat naming a token that is not available is reported
unreadable, and no other credential is used in its place. The same principle
governs spending: a seat the gate did not name cannot be charged, and a credential no seat names
cannot be attributed. It matters most for a model call that does not go through a worker, such as
triage's model stage, which would otherwise fall back to the ambient login with nothing in the
record naming what paid.

Attributing that spend instead of refusing it was considered and rejected. A record saying an
unnamed login paid is honest about a call that should not have been made, leaves the ceiling
unenforced, and does nothing at all on a host where no ambient login exists: there the call
fails with a message about not being logged in, which describes a machine whose credentials are
configured correctly and whose seats the gate is simply holding back.

The exemption for an organization with no seats is not an oversight to be tightened later. A
deployment that declares no seats has asked for no ceiling and made no promise about which
credential pays, and the fallback is what it runs on.

#### Scenario: No seat, no spend

- **WHEN** the gate names no seat for a role, because every seat that serves it is spent or none
  can be used
- **THEN** no model call is made on that role's behalf
- **AND** no credential is substituted for the seat's

#### Scenario: A spend nothing can attribute is refused rather than recorded as ambient

- **WHEN** a call could only be made on a credential no seat names
- **THEN** it is refused
- **AND** it is not made and recorded against the ambient login instead

#### Scenario: An unenforced budget is untouched

- **WHEN** an organization declares no seats
- **THEN** calls run on whatever login is ambient, as they did before
- **AND** nothing is refused for want of a seat

#### Scenario: A call that runs names the seat that paid

- **WHEN** the gate names a seat and the call is made
- **THEN** the call uses that seat's credential
- **AND** the record names that seat as having paid

## MODIFIED Requirements

### Requirement: Seats are named configuration entities with an owner and a reserve

Seats SHALL be declared by seat files (*A seat is a file under `seats/`, and its filename is its
id*), each with an identifier, an `owner` — the holder, the person whose subscription the seat is
and who can read its usage — and a `reserve`: the share of the remaining window held back from
Igors, as *The reserve is untouchable* defines it. A seat's file SHALL list the roles it serves,
and a role SHALL spend only from seats that list it (*A role's seats are the seats whose files
list it*).

A reserve SHALL be a fraction from 0 to 1, both included. On a seat a person lends, it is held
back for that person. On a seat nobody works on, it is held back for work that arrives later in
the window, which spreads Igor's use across the window rather than spending it as work comes; such
a seat declares none by default, because spending early is not waste when the work is there. At 1
nothing is held back at the reset and the window is spent evenly across its length. A reserve is
the same setting on every seat, and the same rule reads it. A role MAY hold back more of a seat
than the seat does, never less (*A role may hold back more of a seat than the seat does*).

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

A role MAY declare a `reserve`, a fraction from 0 to 1, both included. It SHALL apply to every seat
the role draws on, and it is not set per seat. The line that role's Igor checks on a seat SHALL use
the larger of the seat's reserve and the role's (*The reserve is untouchable*). So a role can hold
back more than a seat does and never less: a lender's reserve stays in force whatever a role
declares. On a seat declaring reserve 0, the role's reserve alone sets that role's line. A role
reserve is valid whatever seats the role draws on, a seat at reserve 0 included. The scenario title
*A role reserve with a dedicated seat is valid* uses "dedicated seat" as plain English for a seat no
person uses; a seat file has no `dedicated` key.

How a role's reserve is inherited is role-config's *A role's reserve is raised by inheritance and
never lowered*.

It gives roles sharing a seat a priority without coordinating them. Every Igor compares the same
whole-seat reading against its own line, so once the reading passes a higher-reserve role's line,
only roles with a lower one take items there. With `frontend` at 0.3 and `generalist` at none on
one seat, `frontend`'s line is 70% just after a reset and rises to 100% at the next reset, and
`generalist` takes what lies above that line.

It is a priority, not a guaranteed share. A lower-reserve role that always has work can hold the
seat at a higher-reserve role's line for most of a window and so crowd it out. No mechanism is
added against that. Two remedies exist: choosing which roles a seat serves, so a seat that does
not serve the greedy role is kept from it; and more seats, so that the lower-reserve role is fully
served elsewhere.

#### Scenario: A higher-reserve role yields to a lower one

- **WHEN** `frontend` declares a reserve of 0.3 and `generalist` declares none, both draw on one seat
  declaring reserve 0, half its week remains, and its week reading is 88%
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

A role's `budget_share` SHALL bound what that role may consume of each seat it draws on. It MUST
NOT reserve capacity for that role, and shares across roles MUST NOT be required to sum to one —
several roles may each declare the same ceiling.

A role's consumption of a seat SHALL be measured against the seat's reading: the role's share of
recorded Igor spend on the seat, times the fraction of the window the seat's latest unreset
reading reports used. It SHALL NOT be measured by dividing recorded spend by a capacity figure. No
figure in dollars is an input to any gate (*The reserve is untouchable*), and this is the same
measure a seat read live already uses. The reading counts the owner's use too, so on a shared seat
a role reaches its ceiling sooner than its own spend alone would carry it; that errs toward
holding the role back. A seat with no unreset reading of a window gives the ceiling nothing to
measure there, and is decided for the role as *A seat with no reading is drawn on only where its
line is the whole window* says.

Reservations were rejected: they would idle capacity a quiet role is not using, and adding a
role would require editing every other role to make room. A ceiling composes, inherits
monotonically like every other permission, and needs no coordination when the fleet changes.

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

## REMOVED Requirements

### Requirement: A pool is an ordered list of seats, and order is the allocation mechanism

**Reason**: Pools are dropped (Adam, 2026-09-28; #148). A pool grouped seats for a role and
ordered them, and both jobs move to the seats. A seat's own file lists the roles it serves, so its
lender states which roles draw on it, and the gate orders eligible seats by headroom rather than
by a list an operator edits without the lender seeing.

**Migration**: Grouping is *A role's seats are the seats whose files list it*; ordering is *A role
draws on the seat with the most headroom*, which carries the rules this requirement stated that do
not depend on pools: a seat without headroom is passed over, a reserved seat nothing has read is
not the fallback, and exhausting every seat is a handoff.

### Requirement: A seat names its token through exactly one mechanism

**Reason**: Every seat is a seat file, and a seat file may not name `token_command` or
`token_file` (Adam, 2026-10-04). `token_command` runs on the Igor server with every other seat's
token in its environment, and `token_file` reads a path the seat file chooses, so neither may
appear in a file a lender contributes. The scenarios about files and commands are false.

**Migration**: *A seat file names its token only by ciphertext or its own variable*, and *A
seat's token travels as ciphertext in its file*.

### Requirement: A budget refuses a key nobody reads, and a list that is not a list

**Reason**: The `budget` mapping, its `seats` and `pools` lists, and each seat and pool entry
no longer exist. Seats are files under `seats/`, and pools are dropped.

**Migration**: A seat file refuses a key nobody reads (*A seat is a file under `seats/`, and its
filename is its id*).

### Requirement: A spend with no seat behind it does not happen

**Reason**: Its scenario *A seat naming no token is still a seat* is false: a seat file naming no
token is refused (Adam, 2026-10-17). openspec will not apply a `MODIFIED` block that drops an
in-force scenario, so the requirement is removed and re-added under a new name.

**Migration**: *A spend with no seat behind it is not made*, which keeps every other rule and
scenario.
