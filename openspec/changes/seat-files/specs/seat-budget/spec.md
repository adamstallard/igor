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
| `dedicated` | no | `true` for a seat nobody works on |
| `roles` | yes | a list of the role names this seat serves; it MAY be empty |
| `encrypted_token` | no | the seat's token, encrypted to the server's public key, as *A seat's token travels as ciphertext in its file* defines it |
| `token_env` | no | the environment variable holding the seat's token, as *A seat file names its token only by ciphertext or its own variable* constrains it |

`roles` SHALL be a list of strings, each naming a role file under `roles/` other than the org
base. A name with no role file SHALL be refused, naming the seat file, the name, and the roles
that exist. An empty list is a seat that serves nothing, which a holder may want while they decide.

Seats SHALL be read from `seats/` and from nowhere else. Where `seats/` is absent or holds no seat
file, no seats are declared and budget is not enforced. Files in `seats/` other than `*.yaml`,
such as `recipient.txt`, are not seats.

One file per seat is what makes a holder's approval possible: CODEOWNERS matches paths, not
lines, so an entry inside a shared file cannot have an owner of its own.

#### Scenario: A seat file declares a seat

- **WHEN** `seats/bob.yaml` declares an owner, a reserve of 0.5, `roles: [generalist]` and an
  `encrypted_token`
- **THEN** a seat `bob` is declared with that owner, reserve, role and token

#### Scenario: A redundant id is refused

- **WHEN** a seat file declares an `id` field
- **THEN** it is refused, naming the file and saying the filename is the seat's id

#### Scenario: A key nobody reads is refused

- **WHEN** a seat file declares `reserv: 0.5`
- **THEN** it is refused, naming the file, the key `reserv` and the accepted keys

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

A seat file SHALL name its token, where it names one, with exactly one of `encrypted_token` and
`token_env`. A seat file naming both SHALL be refused, naming the file and both keys. A seat file
naming `token_command` or `token_file` SHALL be refused, naming the file and the key, and saying a
seat file names its token only with `encrypted_token` or `token_env`.

`token_env` SHALL be `IGOR_SEAT_` followed by the seat's id uppercased, with every character other
than a letter or digit replaced by `_`. A seat file whose `token_env` is any other name SHALL be
refused, naming the file, the name it gave and the name it must give. An id holds only lowercase
letters, digits and hyphens, so no two ids yield the same variable. The variable holds a plain
token the operator put in the server's environment.

A seat file naming neither reads through whatever login is ambient, as a seat naming no token did
before seat files existed.

Neither form runs or reads anything on the server beyond the seat's own token, so nothing depends
on telling an operator's seat file from a lender's. `token_command` is run by Igor's own process
with that process's environment, which holds every other seat's token and the GitHub token, so
whoever could merge one could run code on the server. That is acceptable while every
configuration change gets careful review, and a hole once seats are contributed permissively.

The variable's name is fixed because a free choice is the same hole by other means. A seat file
naming `GH_TOKEN` would hand the GitHub token to `claude` as a seat credential. A seat file naming
another seat's variable would spend that seat under a different id, with a reserve and roles its
holder never approved.

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

#### Scenario: A seat naming no token reads the ambient login

- **WHEN** a seat file names neither `encrypted_token` nor `token_env`
- **THEN** the seat reads through whatever login is ambient

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

A seat's credential, wherever another rule compares or digests it, SHALL be the plaintext token.
age encryption is randomized, so one token encrypted twice yields two ciphertexts, and comparing
ciphertexts would read a re-encrypted token as a new credential.

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

- **WHEN** a holder's approved change removes `generalist` from their seat file's `roles`
- **THEN** `generalist` no longer draws on that seat once the configuration is next loaded

### Requirement: A role draws on the seat with the most headroom

Among the seats that serve a role and on which every other rule lets that role spend now, the gate
SHALL choose the one with the most headroom. A seat's headroom for the role SHALL be the smaller,
over its two windows, of the role's line on that seat minus the seat's reading, in percentage
points. A window with no unreset reading, on a seat eligible without one because the line's
reserve is 0, SHALL count as 0% used. Where two seats have equal headroom, the gate SHALL choose
the one whose week window resets soonest; a seat with no known week reset SHALL come after every
seat with one. Seats still tied SHALL be taken in id order.

The other rules decide eligibility, and this one only orders what they admit: a seat with an open
credential condition, a seat at or past its line in either window, a reserved seat with no reading,
and a seat where the role is at its `budget_share` ceiling are passed over before headroom is
compared. Where no seat that serves the role is eligible, the Igor SHALL hand off rather than stop
silently.

Most headroom puts dedicated seats ahead of lent ones without anybody ordering them: a lent seat
declares a reserve, so its line is lower and it has less headroom at the same reading. It spreads
load across seats rather than draining one before the next. The tie-break spends the capacity a
reset is about to destroy; the week is the window whose leftover capacity is actually lost, since
a session refills within hours.

#### Scenario: A dedicated seat is drawn on before a lent one

- **WHEN** a role is served by a dedicated seat at reserve 0 and a lent seat at reserve 0.5, both
  read at 40% in both windows, early in their weeks
- **THEN** the dedicated seat is chosen, because its line is higher

#### Scenario: Load spreads across dedicated seats

- **WHEN** two dedicated seats serve a role, one read at 70% and one at 30%
- **THEN** the seat at 30% is chosen

#### Scenario: The tighter window decides a seat's headroom

- **WHEN** a seat has 60 points of headroom in its week and 10 in its session
- **THEN** its headroom is 10

#### Scenario: The sooner reset breaks a tie

- **WHEN** two seats have equal headroom and one's week resets tomorrow and the other's in five
  days
- **THEN** the seat whose week resets tomorrow is chosen

#### Scenario: An unread dedicated seat is drawn on

- **WHEN** a new dedicated seat at reserve 0 has no reading, and another seat serving the role is
  read at 50%
- **THEN** the new seat is chosen, with its headroom counted from 0% used

#### Scenario: A seat without headroom is passed over, not waited on

- **WHEN** the seat with the most headroom yesterday has reached its line
- **THEN** another eligible seat is chosen
- **AND** the Igor does not stop while any seat serving the role is eligible

#### Scenario: A reserved seat nothing has read is not drawn on

- **WHEN** every dedicated seat serving a role is at its line, and the only other seat declares a
  reserve and has no unreset reading of a window
- **THEN** no seat is chosen, and the reserved seat is not spent from on a guess

#### Scenario: Exhausting every seat that serves a role is a handoff

- **WHEN** no seat that serves a role is eligible
- **THEN** the Igor hands off rather than stopping silently

### Requirement: Igor warns, and does not refuse, when a holder's approval is not enforced

When Igor loads the seat files it SHALL warn, once per process and on stderr, for each seat file
that has no code owner, and once where code-owner review is not required on the lore repository's
default branch. It SHALL NOT refuse to start, or decline any work, on either ground.

A seat file's code owner SHALL be read from the lore checkout's CODEOWNERS file, the first of
`.github/CODEOWNERS`, `CODEOWNERS` and `docs/CODEOWNERS` that exists, by GitHub's rule that the
last matching line wins. A seat file no line matches, or whose last matching line names nobody,
has no code owner.

Whether code-owner review is required SHALL be read first from the rules GitHub reports as active
on the default branch, which any credential that can read the repository may read. Where none
requires code-owner review, it SHALL be read from classic branch protection. Where that cannot be
read, Igor SHALL warn that it cannot tell whether the rule is in force, naming the permission the
read needs, and SHALL NOT report the rule as either in force or not.

GitHub enforces the holder's approval, and an administrator can turn it off. A refusal would make
GitHub's settings a kill switch over the fleet, stopping every Igor over a setting nobody on the
fleet changed; a warning tells the operator and keeps working.

#### Scenario: A seat file with no code owner is a warning

- **WHEN** no CODEOWNERS line matches `seats/bob.yaml`
- **THEN** Igor warns, naming `seats/bob.yaml`
- **AND** it loads and works as it otherwise would

#### Scenario: The last matching line decides the owner

- **WHEN** CODEOWNERS has `/seats/ @operator` and, after it, `/seats/bob.yaml @bob`
- **THEN** `seats/bob.yaml`'s code owner is `@bob`, and no warning is given for it

#### Scenario: The review rule off is a warning

- **WHEN** no ruleset on the default branch requires code-owner review, and classic branch
  protection reports it off
- **THEN** Igor warns that code-owner review is not required on that branch
- **AND** it loads and works as it otherwise would

#### Scenario: A ruleset requiring code-owner review answers the question

- **WHEN** a ruleset active on the default branch has a pull-request rule requiring code-owner
  review
- **THEN** no warning about the rule is given, and classic branch protection is not read

#### Scenario: A rule Igor cannot read is reported as unknown

- **WHEN** no ruleset requires code-owner review and reading classic branch protection is refused
  for want of permission
- **THEN** Igor warns that it cannot tell whether the rule is in force, naming Administration read
  as the permission needed and `igor doctor` as the check to run
- **AND** it does not report the rule as off

#### Scenario: Each warning is given once

- **WHEN** an Igor loads its seat files on every cycle of a long-running process
- **THEN** each warning is printed once for that process

### Requirement: `igor seat add` lends a seat in one step

`igor seat add <id>` SHALL be run by a holder in a clone of the lore repository, or of their fork
of it, and SHALL:

1. Read the public key from `seats/recipient.txt` on the lore repository's default branch on
   GitHub, not from the working tree.
2. Read the token from the terminal without echoing it, and refuse an empty one.
3. Encrypt it to that key, and base64-encode the result on one line.
4. Where `seats/<id>.yaml` does not exist on the default branch, write it with the holder's GitHub
   login as `owner`, the `reserve` and `roles` given as options, and the ciphertext as
   `encrypted_token`, and add a CODEOWNERS line making the holder its code owner.
5. Where `seats/<id>.yaml` already exists on the default branch, replace its `encrypted_token` and
   change nothing else. This is how a token is rotated.
6. Commit on a new branch, push it to the lore repository where the holder may, and otherwise to
   their fork, and open a pull request against the default branch.

The token SHALL NOT be written to disk, to an argument list, or to any process's environment. The
command SHALL refuse, before reading the token, where `seats/recipient.txt` is absent on the
default branch, or `<id>` is not a valid seat id.

The key is read from the default branch because a pull request can change the working tree's
copy. Whoever replaces `recipient.txt` receives every token encrypted to it afterwards.

#### Scenario: A first seat is lent

- **WHEN** a holder runs `igor seat add bob --reserve 0.5 --roles generalist` and `seats/bob.yaml`
  does not exist
- **THEN** a pull request adds `seats/bob.yaml`, carrying ciphertext only the server's key
  decrypts, and a CODEOWNERS line naming the holder

#### Scenario: A holder without write access lends from a fork

- **WHEN** the holder cannot push to the lore repository
- **THEN** the branch is pushed to their fork and the pull request opened from there

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

#### Scenario: No public key, no token read

- **WHEN** the default branch has no `seats/recipient.txt`
- **THEN** the command refuses before asking for the token, saying the operator commits the
  server's public key there

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

- **WHEN** a seat declared as dedicated declares a reserve of 0.5
- **THEN** configuration is valid
- **AND** the seat is held to its line as any other seat is

#### Scenario: A reserve of 1 is accepted

- **WHEN** a seat declares a reserve of 1
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

### Requirement: A spend with no seat behind it does not happen

Where seats are declared, every model call Igor makes on its own behalf SHALL be charged to the
seat the gate chose for the role, and SHALL be made with that seat's credential where the seat
names one. A seat probe is the one exception to the gate choosing: it is charged to the seat it
reads and made with that seat's own credential, and it is made only on a seat that names one.
Where the gate names no seat, the call SHALL NOT be made, and no ambient credential SHALL be
substituted for the seat the gate did not name. Where an organization declares no seats, budget is
not enforced and this requirement places no condition on anything.

The condition is whether the gate named a seat, not whether a credential was found. A seat naming
no token is already unaffected by the rule that governs token names — it runs on whatever login is
ambient — and it is still a seat the gate chose, still bounded by its reserve, still named in the
record as having paid. What has no seat behind it is a call the gate refused to choose one for.

This is the spending-side counterpart of the reading rule already in force: a seat naming a
token that is not available is reported unreadable and no other credential is used in its place.
The same principle governs spending — a seat the gate did not name cannot be charged, and a
credential no seat names cannot be attributed — but it was written only of readings, so the one
spend in the cycle that does not go through a worker reached an ambient fallback with no seat
behind it and nothing in the record naming what paid.

Attributing that spend instead of refusing it was considered and rejected. A record saying an
unnamed login paid is honest about a call that should not have been made, leaves the ceiling
unenforced, and does nothing at all on a host where no ambient login exists: there the call
fails with a message about not being logged in, which describes a machine whose credentials are
configured correctly and whose seats are simply held.

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
- **THEN** the call uses that seat's credential where the seat names one
- **AND** the record names that seat as having paid, whether or not it named a token

#### Scenario: A seat naming no token is still a seat

- **WHEN** the gate chooses a seat whose file names neither `encrypted_token` nor `token_env`
- **THEN** the call is made, on the ambient login, as that configuration already permits
- **AND** the seat is recorded as having paid

## REMOVED Requirements

### Requirement: A pool is an ordered list of seats, and order is the allocation mechanism

**Reason**: Pools are dropped (Adam, 2026-09-28; #148). A pool grouped seats for a role and
ordered them, and both jobs move to the seats. A seat's own file lists the roles it serves, so its
holder approves which roles draw on it, and the gate orders eligible seats by headroom rather than
by a list an operator edits without the holder seeing.

**Migration**: Grouping is *A role's seats are the seats whose files list it*; ordering is *A role
draws on the seat with the most headroom*, which carries the rules this requirement stated that do
not depend on pools: a seat without headroom is passed over, a reserved seat nothing has read is
not the fallback, and exhausting every seat is a handoff. A config declaring `pools` is refused by
the config's unknown-key refusal, because `budget` is no longer a config key.

### Requirement: A seat names its token through exactly one mechanism

**Reason**: Every seat is a seat file, and a seat file may not name `token_command` or
`token_file` (Adam, 2026-10-04). `token_command` runs on the Igor server with every other seat's
token in its environment, and `token_file` reads a path the seat file chooses, so neither may
appear in a file whose review is permissive. The scenarios about files and commands are false.

**Migration**: *A seat file names its token only by ciphertext or its own variable*, and *A
seat's token travels as ciphertext in its file*. An operator who used `token_command` or
`LoadCredential=` with `token_file` writes the token, or a secret store's output, into the
server's env file under `IGOR_SEAT_<ID>`, or encrypts it into the seat file.

### Requirement: A budget refuses a key nobody reads, and a list that is not a list

**Reason**: The `budget` mapping, its `seats` and `pools` lists, and each seat and pool entry
no longer exist. Seats are files under `seats/`, and pools are dropped.

**Migration**: A seat file refuses a key nobody reads (*A seat is a file under `seats/`, and its
filename is its id*). A config still declaring `budget` is refused by the config's existing
unknown-key refusal, with no dedicated message (Adam, 2026-10-11). The one config that had seats,
`adamstallard/igor-lore`'s, is migrated by hand.
