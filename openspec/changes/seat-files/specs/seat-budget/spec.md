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

A *lent seat* is one whose file names `encrypted_token`: a person's subscription, lent to the
team's Igors.

`roles` SHALL be a list of strings, each naming a role file under `roles/` other than the org
base. A name with no role file SHALL be refused, naming the seat file, the name, and the roles
that exist. An empty list is a seat that serves nothing, which a holder may want while they decide.

Seats SHALL be read from `seats/` and from nowhere else. Where `seats/` is absent or holds no seat
file, no seats are declared, so no role has a seat to spend from: *A role's seats are the seats
whose files list it* refuses each role at load, so the configuration fails validation and `igor
serve` refuses to start. An organization with no lenders SHALL declare one seat from its own
token, by `igor seat add` or by a `token_env` seat file, to run at all. `igor run` reads no seat
file to spend: it spends its own token (*`igor run` spends its own token as an implicit local
seat*). Files
in `seats/` other than `*.yaml`, such as `recipient.txt`, are not seats.

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

#### Scenario: No seat files means no role can spend

- **WHEN** the lore repository has no `seats/` directory, or one holding no seat file, and `igor
  serve` starts
- **THEN** each role is refused at load, saying a seat file must list it
- **AND** nothing runs on a stored Claude login in a seat's place

#### Scenario: The public key is not a seat

- **WHEN** `seats/` holds `recipient.txt` beside the seat files
- **THEN** it is not read as a seat

### Requirement: A seat file names its token only by ciphertext or its own variable

A seat file SHALL name its token with exactly one of `encrypted_token` and `token_env`. These two
are the token mechanisms, and a seat *names a token source* where its file names one of them.
Every seat names one, so no seat runs on a stored Claude login (*A spend with no seat behind it is
not made*).

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
- **AND** nothing is spent on a stored Claude login in its place

### Requirement: A seat's token travels as ciphertext in its file

A seat file's `encrypted_token` SHALL be an age ciphertext, encrypted to the public key committed
as `seats/recipient.txt` and base64-encoded on one line. Igor SHALL decrypt it with the age
identity at the path `igor.config.yaml` names as `seatKey`, resolved against the config file's
directory. A `seatKey` that resolves inside the lore checkout SHALL be refused at load, naming the
path and saying the private key must live outside the repository: a key there is either
committed, and so public, or discarded when the checkout is reset to a commit.

The plaintext SHALL be the seat's id, a colon, and the token: `<id>:<token>`. Igor SHALL split it
at the first colon, which no seat id can contain, and SHALL use the part after the colon as the
seat's token. A plaintext with no colon, or whose part before the first colon is not the id of
the file it came from, SHALL fail decryption. So ciphertext copied into another seat file is
refused.

A value that does not begin with `YWdlLWVuY3J5cHRpb24ub3JnL3Yx`, the base64 of
`age-encryption.org/v1`, SHALL be refused at load, naming the file, and saying that a plain token
committed to the repository is to be revoked at Anthropic and replaced with ciphertext. A plain
token in a seat file is a credential in git history, and the refusal is the only place anybody is
told.

`igor serve` SHALL decrypt a seat's token only on a lore read, `lore-pull`'s (#208) term for an
Igor process loading its configuration, role files and seat files
from one commit: at start, and at each cycle start, where #179 rereads the configuration and,
once built, #208 makes its lore read. Until #208 pulls the checkout, the seat files change only
when someone updates the checkout by hand. `igor run` decrypts nothing (*A lent seat is decrypted
only where the worker has a user of its own*). It SHALL NOT decrypt when it starts a worker or a
probe: each is given the plaintext Igor holds from its last read, held as *A decrypted seat token
never touches the server's disk* requires. Where decryption fails, the seat SHALL be reported
unreadable with the reason, and no other credential SHALL be used in its place. Decryption fails
where no `seatKey` is declared, the key file cannot be read, the key does not match, the
ciphertext does not decrypt, or the plaintext does not name the file's own seat id. A seat whose token Igor cannot decrypt SHALL be ineligible: seat choice SHALL NOT
pick it, and #143's probe SHALL skip it. It is under a read-cleared condition
(`stuck-conditions`' *A read-cleared condition opens on a failing read and clears on a passing
one*): what is read is the seat's file, on a lore read; failing is any of the decryption failures
above; the condition is on the seat, with cure key `seat:<id>:decrypt`. What a role does when this leaves it
no eligible seat is *A role draws on the seat with the most headroom*.

Where the key is read but the seat's ciphertext does not decrypt with it, because it was
encrypted to another key or is corrupt, or decrypts to a plaintext naming another seat's id or
none, that condition's report SHALL name the seat and its
`owner`, the lender, so that someone re-lends it; where the file names no `owner`, the report
SHALL say so, and that the operator re-lends the seat or removes its file. The report SHALL show
the `owner` only where it has a GitHub login's form, letters, digits and single hyphens, and
then in a code span, so that a handoff quoting it on a public issue carries no @-mention, link
or markup from the seat file; any other `owner` SHALL be reported as not a GitHub login, with
none of its text shown. Where the plaintext
names another seat's id, or none, the report SHALL also say so. It SHALL name the id it found
only where that id has a seat id's form, and then in a code span; anyone can encrypt any text to
the public key, so any other text before the colon SHALL NOT be shown. Where no `seatKey` is
declared or the key file cannot be read, the report SHALL name the key, whose cure is the
operator's.

A command a person runs, such as `igor budget`, makes no lore read: it opens and clears no
condition and appends no condition row. It MAY decrypt the seat files in its own process, to
report them, where it can read the key file. Where it cannot, as an operator other than the
service user usually cannot, it SHALL show a lent seat as not checked, naming the path, and never
as unreadable on the strength of its own failed read. Where the execution log holds an open
`seat:<id>:decrypt`, the seat's line SHALL also name that condition, as #82
(`stopped-scope-visible`) specifies. Such a command shows each seat's credential hash where it
reports which credential a seat resolves (`stuck-conditions`' *Reporting tells a refused credential
from an unreadable one, and clears nothing*); where it cannot decrypt the seat, it SHALL say the
hash was not computed.

A seat's credential, wherever another rule compares or hashes it, such as
`stuck-conditions`' *A seat's refused credential is a condition on that seat* (#101), SHALL be the
token, the part of the plaintext after the seat's id, and never the ciphertext. age encryption is randomized, so one token encrypted
twice yields two ciphertexts, and a hash of the new ciphertext would read as a new credential and
clear a condition the provider would only refuse again.

`seatKey` is optional. A configuration with no `encrypted_token` needs none. The configuration's
validation, which reads no secret, SHALL report each seat file that carries `encrypted_token`
where no `seatKey` is declared, naming the file. The finding SHALL NOT fail the configuration:
Igor starts, and the seat is under its condition, whose report names the key. `igor doctor` shows that finding by invoking the
validation (`check-a-lore-repository`'s *Setup is reported by one command, over what
configuration alone cannot show*, #113), and checks nothing of its own for it.

The private key is the whole of the token's protection: a seat file is readable by everyone who
can read the lore repository, which may be anyone.

#### Scenario: Ciphertext is decrypted

- **WHEN** `seats/bob.yaml`'s `encrypted_token` is `bob:<token>` encrypted to the server's public
  key, and `seatKey` names the matching private key
- **THEN** the seat's token is `<token>`

#### Scenario: Ciphertext copied into another seat file is refused

- **WHEN** `seats/eve.yaml` carries the `encrypted_token` copied from `seats/bob.yaml`, which
  decrypts to `bob:<token>`
- **THEN** seat choice never picks `eve`, and #143's probe does not probe it
- **AND** the condition `seat:eve:decrypt` opens, and its report names `eve`, its owner, and the
  id `bob` that the plaintext holds
- **AND** `bob` itself is unaffected

#### Scenario: A plaintext with no seat id is refused

- **WHEN** a seat file's `encrypted_token` decrypts to a token with no `<id>:` before it
- **THEN** the seat is under the condition `seat:<id>:decrypt`, and no part of the plaintext is
  used as a token

#### Scenario: A plain token in a seat file is refused

- **WHEN** a seat file's `encrypted_token` is a `setup-token` beginning `sk-ant-`
- **THEN** it is refused at load, naming the file
- **AND** the refusal says to revoke that token at Anthropic and replace it with ciphertext

#### Scenario: A key path outside the lore checkout is read

- **WHEN** `igor.config.yaml` in `/srv/lore` names `seatKey: /etc/igor/seat.key`
- **THEN** Igor reads the private key from `/etc/igor/seat.key`

#### Scenario: A key path inside the lore checkout is refused

- **WHEN** `igor.config.yaml` in `/srv/lore` names `seatKey: keys/seat.key`
- **THEN** the configuration is refused at load, naming `/srv/lore/keys/seat.key` and saying the
  private key must live outside the repository

#### Scenario: Text before the colon that is not a seat id is not shown

- **WHEN** a seat file's `encrypted_token` decrypts to `@everyone [x](https://example.com):<token>`
- **THEN** the condition's report says the plaintext names another seat or none, and shows none
  of the text before the colon

#### Scenario: A report shows an owner only in a login's form

- **WHEN** a seat whose file names `owner: "x\n\n@everyone"` cannot be decrypted
- **THEN** the condition's report says the seat's `owner` is not a GitHub login, and shows none
  of its text

#### Scenario: A report says when a seat names no owner

- **WHEN** a seat whose file names no `owner` carries ciphertext encrypted to another key
- **THEN** the condition's report says the file names no owner, and that the operator re-lends
  the seat or removes its file

#### Scenario: A person's command that cannot read the key shows the seat not checked

- **WHEN** an operator who cannot read the file `seatKey` names runs `igor budget`, and no
  `seat:bob:decrypt` condition is open in the execution log
- **THEN** the lent seat `bob` is shown as not checked, naming the key's path, and its credential
  hash as not computed
- **AND** no condition opens and no condition row is appended

#### Scenario: Validation reports ciphertext with no key

- **WHEN** `seats/bob.yaml` carries `encrypted_token` and `igor.config.yaml` declares no `seatKey`
- **THEN** the configuration's validation reports it, naming `seats/bob.yaml`, without reading any
  key or token
- **AND** the configuration does not fail for it, and `igor serve` starts

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

#### Scenario: A worker gets the token Igor already holds

- **WHEN** Igor starts a worker on a seat whose file it decrypted when it last read the seat files
- **THEN** the worker's token is the plaintext Igor holds from that read
- **AND** Igor decrypts nothing when it starts the worker

#### Scenario: A failed decryption opens the condition, and a good read clears it

- **WHEN** Igor starts and cannot decrypt `seats/bob.yaml`
- **AND** a later read of the seat files, such as a restart after `bob` is re-lent, decrypts it
- **THEN** the condition on `bob` opens at start, and clears on that later read
- **AND** neither depends on a handoff or on #143's probe
- **AND** each of the two reads appends a condition row, and a read between them that still
  fails to decrypt `bob` appends none

#### Scenario: An owner in a condition report carries no markup

- **WHEN** `seats/bob.yaml`, whose `owner` is ``@team [x](https://example.com)``, carries
  ciphertext that does not decrypt
- **THEN** the condition's report says the seat's `owner` is not a GitHub login, and shows none of
  its text, so it mentions nobody and links nowhere

#### Scenario: A lent seat that does not decrypt is skipped, and its lender named

- **WHEN** `seats/bob.yaml`, whose `owner` is `bobsmith`, carries ciphertext that is corrupt or
  was encrypted to another key, and `seatKey` names a key Igor can read
- **THEN** seat choice never picks `bob`, and #143's probe does not probe it
- **AND** the seat's condition names the seat `bob` and its owner `bobsmith`

#### Scenario: A key file that cannot be read is unreadable, not substituted

- **WHEN** `seatKey` names a file the Igor cannot read
- **THEN** the seat is reported unreadable, naming the path and the reason
- **AND** no other credential is used in its place

#### Scenario: Re-encrypting a token is the same credential

- **WHEN** a holder encrypts the same token a second time and the new ciphertext merges
- **THEN** the seat's credential is unchanged, so its hash is unchanged and an open credential
  condition stays open

### Requirement: A role's seats are the seats whose files list it

A role SHALL draw on the seats whose files list it in `roles`, and on no other. A role MAY name a
single seat with `seat:`, and then SHALL draw on that seat alone. A role SHALL be refused at load:

- where it names a seat with no seat file, naming the seat and the seats declared;
- where it names a seat whose file does not list it, naming the seat file and saying its holder
  lists the role there;
- where it names no seat and no seat file lists it, saying a seat file must list it.

Under `igor run` none of these refusals applies: the run's one seat is its implicit local seat
(*`igor run` spends its own token as an implicit local seat*).

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

- **WHEN** no seat file lists `docs`, and `docs` names no seat
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

Which seats a role may spend on now is decided by the rules *A role has a seat it can spend when
the gate would choose one now* gathers, and by the seat-scoped conditions of `stuck-conditions`
(#101); this requirement only orders what they admit. A seat under an open condition SHALL be
passed over, and the role SHALL keep working on its other eligible seats.

Where no seat serving the role is eligible, exactly one of two things SHALL happen:

- **The role stops** (`stuck-conditions`' *A condition that recurs stops the affected scope from
  taking new work*), where every seat serving it is under an open
  condition and none of those conditions is read-cleared, such as a refused credential or an unset
  `token_env` variable on every seat.
- **Otherwise the Igor hands off the item** and the role does not stop. This covers every seat at
  its line; some seats under a condition and the rest at their lines; and any case where at least
  one seat is under a read-cleared condition, such as a seat whose file Igor could not decrypt,
  whatever the other seats' state. The handoff SHALL name each open condition on the role's
  seats. For a seat under a read-cleared condition it SHALL state no line crossing or reset, since
  the seat may have no reading, and the reason Igor records SHALL be the condition, not holding
  back at the line.

The tie-break spends the capacity a reset is about to destroy: leftover capacity in a week is lost
at its reset, while a session refills within hours.

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

#### Scenario: A role whose only seat is undecryptable waits as at its line

- **WHEN** the only seat serving a role has an open condition because its token cannot be
  decrypted
- **THEN** the role does not stop
- **AND** it hands off as a role whose seats are all at their lines does, and the handoff names
  the condition
- **AND** the handoff states no line crossing for that seat, and the reason recorded is the
  condition, not holding back at the line

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
mentioned for an event they caused on a pull request they opened, and SHALL NOT be mentioned where `owner` does not
have a GitHub login's form, letters, digits and single hyphens. The workflow checks the form
only, not that the login exists; `igor doctor` checks that.

The workflow SHALL run on GitHub-hosted runners, triggered by `pull_request_target` so that it can
comment on pull requests from forks, and by no other event. It SHALL run when a pull request is
opened, reopened, pushed to, marked ready for review, or edited, which includes a change of base
branch. The trigger SHALL have no `paths`
filter, so that it runs on every pull request: GitHub's path filter misses seat files on large
pull requests (`design.md`, *The lender hears about a change to their seat file*). The workflow SHALL find the seat files a pull request
changes by fetching the pull request's commits as git data, with no checkout and no file
contents, and comparing the trees of its base and head under `seats/`. It SHALL take nothing from
the head but those paths' names, SHALL match each against `^seats/[a-z0-9][a-z0-9-]*\.yaml$`
before use, and SHALL run nothing from the head. Its token SHALL be limited to reading contents
and writing pull requests.

Igor SHALL NOT comment on an open lore pull request about a seat file; its own notice comes only
after a seat-file change lands and Igor pulls it (`lore-pull`, #208).

A mention SHALL be recognised as already made only from a comment the workflow itself posted.

The lore repository's default branch SHALL require a pull request before merging, because only
a pull request's notice reaches the lender before the change lands. `igor doctor`
reports a default branch that does not require one, through `check-a-lore-repository`'s check
that direct pushes are prevented (#113).

`pull_request_target` runs with a token that can write to the repository. A workflow on it that
ran or read the pull request's files would hand a fork's code or data that token, so taking only
path names from the head is part of this requirement, not a detail of the template.

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

#### Scenario: A seat file in a very large pull request is still noticed

- **WHEN** a pull request changes 3,101 files, and `seats/bob.yaml` sorts after the first 3,000
- **THEN** the workflow runs, and `@bob` is mentioned

#### Scenario: A pull request with no seat file gets no comment

- **WHEN** a pull request changes only `roles/triage.yaml`
- **THEN** the workflow runs, and posts nothing

#### Scenario: A renamed seat file mentions its owner

- **WHEN** a pull request renames `seats/bob.yaml` to `seats/robert.yaml`
- **THEN** `@bob` is mentioned

#### Scenario: An owner that is not a GitHub login is not mentioned

- **WHEN** a pull request changes `seats/ops.yaml`, whose `owner` on the default branch is
  `Operations Team`, which does not have a GitHub login's form
- **THEN** no one is mentioned for it

#### Scenario: A retargeted pull request is checked again

- **WHEN** a pull request that changes `seats/bob.yaml`, opened against a branch other than the
  default branch, is edited to target the default branch
- **THEN** the workflow runs, and `@bob` is mentioned

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

#### Scenario: Igor itself does not comment on an open seat-file pull request

- **WHEN** a pull request changing `seats/bob.yaml` is open
- **THEN** no Igor comments on it; the only comment is the workflow's

#### Scenario: A push runs no notice workflow

- **WHEN** a commit that changes `seats/bob.yaml` is pushed to the default branch with no pull
  request
- **THEN** the notice workflow does not run, and nothing comments on the commit

#### Scenario: A path that is not a seat file is ignored

- **WHEN** a pull request changes `seats/recipient.txt`, or a file whose name does not match the
  seat-file pattern
- **THEN** no one is mentioned for it, and its contents are not read

### Requirement: `igor seat add` lends a seat in one step

`igor seat add <id>` SHALL be run by a holder, as `npx igor-agent seat add <id>` where Igor is not
installed, and SHALL:

1. Read the public key from `seats/recipient.txt` on the lore repository's default branch on
   GitHub, not from the working tree.
2. Walk the holder through creating the token: print the steps, which are to run
   `claude setup-token` in another terminal, signed in to the subscription being lent, and paste
   the token it prints. Then read the token from the terminal without echoing it, and refuse an
   empty one.
3. Encrypt `<id>:<token>`, the seat's id, a colon and the token, to that key, as *A seat's token
   travels as ciphertext in its file* requires, and base64-encode the result on one line.
4. Where `seats/<id>.yaml` does not exist on the default branch, write it with the holder's GitHub
   login as `owner`, the `reserve` and `roles` given as options, and the ciphertext as
   `encrypted_token`. That login comes from `gh`, so it is always a GitHub login. A hand-written
   seat file's `owner` may not be one, and `igor doctor` checks that.
5. Where `seats/<id>.yaml` already exists on the default branch and names `encrypted_token`,
   replace its `encrypted_token` and change nothing else. This is how a token is rotated. Where it
   names `token_env`, refuse before reading the token, saying the seat's token is set on the
   server by its operator.
6. Inside a clone of the lore repository, or of a fork of it, commit on a new branch, push it to
   the lore repository where the holder may and otherwise to their fork, and open a pull request
   against the default branch with `gh`. Outside a clone, make the same commit on a new branch
   through the GitHub API with `gh`, in the lore repository where the holder may push and
   otherwise in their fork, with no local clone, and open the pull request with `gh`.

The lore repository SHALL be the one `--lore <owner/repo>` names. Inside a clone, `--lore` MAY be
left out, and the lore repository SHALL be the clone's `upstream` remote, or `origin` where
there is no `upstream`. Outside a clone,
the command SHALL refuse without `--lore`, before reading the token. Before reading the token, the
command SHALL print the lore repository the token will be encrypted for and the pull request
opened against, and where it took that repository from a remote, which remote.

The command SHALL require `gh`, installed and signed in, and SHALL refuse before reading the token
where it is missing or signed out. Igor SHALL NOT hold the holder's GitHub credentials: `gh` keeps
its own login.

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
  decrypts, of `bob:` followed by the token

#### Scenario: A holder without write access lends from a fork

- **WHEN** `gh` is signed in and the holder cannot push to the lore repository
- **THEN** the branch is pushed to their fork and the pull request opened from there

#### Scenario: A seat is lent from outside a clone

- **WHEN** a holder runs `npx igor-agent seat add bob --lore acme/igor-lore --reserve 0.5 --roles
  generalist` in a directory that is no clone
- **THEN** a pull request against `acme/igor-lore` adds `seats/bob.yaml`, committed through the
  GitHub API
- **AND** nothing is cloned to the holder's disk

#### Scenario: Outside a clone, --lore is required

- **WHEN** a holder runs `igor seat add bob` in a directory that is no clone, without `--lore`
- **THEN** the command refuses before asking for the token, saying it needs `--lore <owner/repo>`

#### Scenario: Inside a clone, the lore repository is inferred

- **WHEN** a holder runs `igor seat add bob` without `--lore` in a clone of `acme/igor-lore`
- **THEN** the pull request is opened against `acme/igor-lore`

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

#### Scenario: The holder is told how to create the token

- **WHEN** `igor seat add` reaches the point of reading the token
- **THEN** it first prints the steps for creating one with `claude setup-token`
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

Under `igor run`, Igor SHALL NOT decrypt any seat's `encrypted_token`. Its worker runs as the
Igor's own user (#175's `task-execution`), and so could read the key `seatKey` names, and with it
every lent token. A lent seat left undecrypted there has no fault in its file, so it SHALL raise no
condition. `igor run` spends no seat file's seat in any case (*`igor run` spends its own token as
an implicit local seat*).

#### Scenario: `igor run` decrypts no lent seat

- **WHEN** `igor run` starts, and the seats serving its role are one naming `encrypted_token` and
  one naming `token_env`
- **THEN** no seat's `encrypted_token` is decrypted
- **AND** neither seat is drawn on or probed, and no condition is raised for either

### Requirement: `igor run` spends its own token as an implicit local seat

Under `igor run`, Igor SHALL spend from one seat and no other: an implicit local seat, whose token
is the value of the environment variable `IGOR_RUN_TOKEN` in the environment `igor run` started
in. The seat has no file. Nothing about it goes in the lore repository, and no seat file needs to
list the run's role. Under `igor run`, Igor SHALL NOT draw on any seat file's seat, whether its
file names `encrypted_token` or `token_env`.

Where `IGOR_RUN_TOKEN` is unset or empty, `igor run` SHALL refuse to start, before any model call.
The refusal SHALL name the variable and print the steps for creating a token with `claude
setup-token`. `igor run` SHALL NOT use a stored Claude login or a
seat file's seat in its place (*A spend with no seat behind it is not made*).

The implicit local seat's id SHALL be `_run`. A seat file's id holds only lowercase letters,
digits and hyphens, so no seat file can be `_run`, and a condition or spend record on the implicit
seat never shares a key with a seat file's. Its reserve SHALL be 0, and a role's own `reserve`
SHALL NOT apply to it, because `igor run` makes no probe: a reserve would hold the seat back until
a reading arrived, and none would. Wherever another rule uses the larger of a seat's reserve and a
role's, such as *A role may hold back more of a seat than the seat does* or #143's *A seat with no
reading is drawn on only where its line is the whole window*, it SHALL use 0 for this seat. Every
other rule of the gate SHALL apply to it as to any seat. `igor run` makes no seat probe (*A seat
nothing has read is probed on the Igor server with its own token*).

When `igor run` starts, Igor SHALL say that it spends the token in `IGOR_RUN_TOKEN`.

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
  steps for creating a token
- **AND** no stored Claude login and no seat file's seat is used in its place

#### Scenario: A role's reserve does not hold back the run's seat

- **WHEN** `generalist` declares `reserve: 0.3`, and a developer runs `igor run generalist` with no
  reading yet of `_run`
- **THEN** the run draws on `_run`

### Requirement: A spend with no seat behind it is not made

Every model call Igor makes on its own behalf, under `igor serve` and under `igor run`, SHALL be
charged to the seat the gate chose for the role, and SHALL be made with that seat's token. Under
`igor run` the only seat the gate can choose is the implicit local seat (*`igor run` spends its
own token as an implicit local seat*). Two calls are
exceptions to the gate choosing, each charged to the seat it reads and made with that seat's own
token: a seat probe, and #143's live `/usage` read, made only for a seat whose credential the
`/usage` endpoint reports windows for, which a `setup-token` does not. Every other call goes through the gate, #174's startup skills check
included. Where the gate names no seat, the call SHALL NOT be made. Igor SHALL NOT make a model
call on a stored Claude login (the credentials `claude` keeps in a home directory), or on any
other credential no seat names, whether in place of a seat or beside one.

Under `igor serve` the operator guide signs no `claude` in as the service user, so no stored login
is there to prefer (task 3.12 confirms it). Under `igor run`,
on a developer's own machine, Claude Code could itself prefer a stored login there over the token
Igor passes it. Where it does, the call spends the developer's own login and quota, and that is
accepted: Igor neither works around it nor refuses.

What this requirement tests is whether the gate named a seat. Every seat file names its token
(*A seat file names its token only by ciphertext or its own variable*), so a seat the gate names
always has a credential of its own. What has no seat behind it is a call the gate refused to
choose one for, such as one for a role whose every seat is at its line.

This is the spending-side counterpart of the rule for reading a seat's token (*A seat's token
travels as ciphertext in its file*): a seat naming a token that is not available is reported
unreadable, and no other credential is used in its place. The same principle governs spending:
a seat the gate did not name cannot be charged, and a credential no seat names cannot be
attributed. It matters most for a model call that does not go through a worker, such as triage's
model stage, which would otherwise reach a stored login with nothing in the record naming what
paid.

Attributing that spend instead of refusing it was considered and rejected. A record saying an
unnamed login paid is honest about a call that should not have been made, leaves the seat's
`budget_share` ceiling unenforced, and does nothing at all on a host where no stored login exists. There the call fails
with `claude`'s message about not being logged in, which misleads: the real cause is that the gate
is holding every seat back.

A deployment that declares no seats is not exempt from this rule. A stored login is whatever
account last signed in on that host, which can be a pay-per-use API key or a person's own subscription, and nothing records
whose it is. Creating a token takes one command, `claude setup-token`, so an organization with no
lenders declares one seat from its own token instead.

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

#### Scenario: Claude Code's own preference under `igor run` is accepted

- **WHEN** under `igor run` Claude Code authenticates a call with the developer's stored login in
  preference to the token Igor passed
- **THEN** the call runs on the developer's own login and quota, and Igor does not refuse it

#### Scenario: The startup skills check goes through the gate

- **WHEN** Igor makes #174's startup skills check
- **THEN** the call is charged to the seat the gate chose and made with that seat's token

#### Scenario: A call that runs names the seat that paid

- **WHEN** the gate names a seat and the call is made
- **THEN** the call uses that seat's credential
- **AND** the record names that seat as having paid

### Requirement: A decrypted seat token never touches the server's disk

A seat's decrypted token SHALL be held only in the Igor process's memory, and reaches a worker
only through that worker's environment, as #175's `task-execution` requires. Igor SHALL NOT write it to any file, to an
argument list, to a log, to the state branch, to a condition's report or record, to an error
message, or to crash output such as a stack trace or an uncaught error's message. Where Igor
reports a seat, it names the seat, never the token.

A worker that holds the token can still save or send it; this requirement covers what Igor
itself writes.

#### Scenario: A run leaves the token in nothing Igor wrote

- **WHEN** a run has used a seat whose decrypted token is a known test value
- **THEN** that value appears in no log, transcript, handoff, condition report or file on the
  state branch, and in no argument list of a process Igor started
- **AND** the worker's environment held it

#### Scenario: A failure that names a seat does not print its token

- **WHEN** a worker spawn or a seat probe fails, or Igor crashes, while a seat's token is decrypted
- **THEN** the error message and any crash output name the seat and not the token

### Requirement: A removed seat file always takes effect

When a pull of the lore checkout (`lore-pull`, #208) removes a seat file, the removal SHALL take
effect even where the rest of the pull is refused for failing the startup checks, the
configuration checks Igor makes before its first cycle, such as config validation. The removal applies at
the next cycle start's lore read. Until #208 pulls the lore checkout, a seat file leaves the
checkout only when someone updates the checkout by hand. When the removal applies, Igor SHALL
drop the seat's decrypted token from memory, give the seat to no new worker, and kill every worker using
it. Under `igor serve` that is the `claude -p` child and every process its worker user owns. Under
#175 each process has its own worker user, `igor-worker-<role>-<rank>`, which runs only that
process's worker, so this reaches no other process's worker. Under `igor run` no worker uses a
seat file's seat (*`igor run` spends its own token as an implicit local seat*), so a removal kills
nothing there. Igor SHALL hand off each item the killed workers were working. The Igor process SHALL keep
running.

Where the removal leaves a role with no seat file listing it, as when a pull removes the last
seat file, the role SHALL have no usable seat. Its process SHALL hand off each item its workers
held, SHALL take no new item, since *A spend with no seat behind it is not made* lets no model
call run, and SHALL keep running. Igor SHALL NOT fall back to a stored Claude login. A
configuration with no seat serving a role fails the startup checks (*A role's seats are the seats
whose files list it*), so the rest of such a pull is refused. The process then runs on the last
configuration that passed, with the removed seat file taken out. The startup checks would refuse
that configuration, and this is the one case where a process runs on a configuration they would
refuse: it differs from a configuration that
passed only by having less to spend, which can make the process take no work but cannot make it
spend wrongly. Unrelated changes in the refused pull are not applied, and the next pull is
checked as usual.

Igor cannot recall copies of the token. A worker that held it could have saved or sent it, and
the encrypted file stays in the lore repository's git history. Removing the file stops only
Igor's own use of the token; revoking it at Anthropic is the only withdrawal that stops every use.

#### Scenario: Removing a seat file stops Igor's use of the seat

- **WHEN** a pull removes `seats/bob.yaml` while a worker is using `bob`
- **THEN** Igor kills that worker and every process its worker user owns, and hands off its item
- **AND** no new worker is given `bob`, and the Igor process keeps running

#### Scenario: Removing the last seat file leaves the role with no seat, not on a login

- **WHEN** a pull removes `seats/bob.yaml`, the only seat file listing `generalist`, while a
  worker is using `bob`
- **THEN** Igor kills that worker and hands off its item
- **AND** the process takes no new item, keeps running, and makes no model call on a stored login

#### Scenario: A removal applies even when the rest of the pull is refused

- **WHEN** a pull removes `seats/bob.yaml` and also brings a role file that fails validation
- **THEN** the role file is refused and the last configuration that passed is kept
- **AND** the removal of `bob` still takes effect

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
the window, which spreads Igor's use across the window rather than spending it as work comes. Every
seat's reserve is 0 when its file names none, so a seat nobody works on spends early unless its
file says otherwise, because spending early is not waste when the work is there. At 1 the whole window is held back just after its reset and released evenly across its
length, so the window is spent evenly. A reserve is
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
reserve is valid whatever seats the role draws on, a seat at reserve 0 included. The role's reserve
applies to every seat but `igor run`'s implicit seat (*`igor run` spends its own token as an
implicit local seat*).

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

### Requirement: A seat nothing has read is probed on the Igor server with its own token

The server running the Igors SHALL make a seat probe of a seat that has no unexpired reading of a window: no `usage` or `stream` observation of that
window whose reset has not passed. A seat with an unexpired refusal is not probed at all (below).
The probe is one minimal `claude -p` call with that seat's own configured token, on the cheapest model, with a trivial prompt and no tools, and with `--output-format
stream-json --verbose`, run from an empty temporary directory with no `.claude` directory or
`CLAUDE.md` in any directory above it, so that no project's settings, skills, hooks or `CLAUDE.md`
load beside the seat's token. Claude Code loads these from every directory above the one it
runs in. Its environment SHALL be written out as task-execution
requires of a worker's, holding no credential but the seat's token, with `HOME` set to an empty
temporary directory, so that no user-level settings or hooks of the account running Igor load
either. It SHALL read the call's `rate_limit_event` and record
it as a `stream` reading of that seat, exactly as a worker run's event is recorded. Where the seat's
last reading of the window expired at the reset that reading stated, and a post-reset probe is due
ten minutes after that reset (*A window's length is measured, and so is whether it starts at first
use*), that post-reset probe is the probe this requirement calls for, and no other is made for it.
Where no post-reset probe is due at that reset, or the one due is excluded, the seat SHALL NOT
wait for the next reset Igor knows of: it SHALL be probed as any seat with no unexpired reading is, as soon as no
exclusion applies.

Stream readings arrive only when a run is made on a seat, which leaves two seats unread. A seat
with a non-zero reserve is drawn on only while an unreset reading shows it below its line, so
until something reads it, it never runs and never gets a reading. And a seat the fleet is not
using is never read. A probe reads both, on the machine that already holds the seat's token and
config. The post-reset probe that *A window's length is measured, and so is whether it starts at
first use* specifies is a seat probe too, and every limit and exclusion here applies to it.

A seat probe SHALL run only on the server that runs the Igors, never on a person's machine, and
nothing SHALL be installed anywhere else for it.

A seat probe is not free. Every probe SHALL be recorded on a spend row against the seat it read,
marked as a seat probe, with its cost (0 where it reported none, as after an error exit) and with
whether a `rate_limit_event` arrived. Spend attribution, capacity and reporting SHALL count that
row, and the hourly limit and the five-hour back-off below are computed from these rows, by any
Igor and after a restart. The spend row SHALL NOT count toward opening or clearing any condition on
the seat, such as its credential condition; only the check row below does. Where the probe is also recorded as a check of the seat's credential (*A probe checks the
credential too*, below), that is a second row, and the cost stays on the spend row. Its
consumption reaches the seat's next reading like any other.

A seat SHALL NOT be probed more than once an hour, counted from the most recent probe of it that
any Igor recorded, nor while a probe this process started on it is still running. Two Igors that
start a probe of one seat at the same moment may both make it. A probe that receives no
`rate_limit_event`, or one that cannot be read, SHALL record no observation, and that seat SHALL
NOT be probed again until five hours have passed. A probe that fails, whether
by an error exit, an authentication failure or receiving no event, SHALL NOT be retried at once:
it is made again only when the hourly limit, and for no event the five-hour back-off, allow.

A seat probe SHALL NOT be made on a seat the gate has found refused, while that refusal is
unexpired: an unexpired observation at 100% of a window stops probes of that seat until the reset
it states. Nor SHALL one be made on a seat whose unexpired reading reports extra usage being spent,
until the window that reading's `rateLimitType` names resets, since a probe there would spend its
owner's money. Nor SHALL one be made on a seat whose most recent unreset reading of any window is
at or past that window's line computed with the seat's own reserve (*The reserve is untouchable*):
a probe is made on no role's behalf, its consumption is Igor's, and the reading says the seat has
no headroom left for Igor. The one exception is the crossing probe below, which is made while the
gate decides for a role and checks that role's line.

Nor SHALL a probe be made on a seat whose token Igor could not decrypt (*A seat's token travels as
ciphertext in its file*). That seat is under a read-cleared condition, which only a later read of
the seat files clears, and no run may use it. And `igor run` SHALL make no seat probe at all: it
spends only its own token and decrypts no lent seat (*`igor run` spends its own token as an
implicit local seat* and *A lent seat is decrypted only where the worker has a user of its own*).

**A seat is probed at its crossing before it is drawn on again.** Where a seat's most recent
unreset reading of a window was at or past the line the gate checks for the role it is deciding
for, and that line has since risen past
the reading, the gate SHALL NOT start work on the seat on that reading alone. A seat probe SHALL be
made first, and the gate SHALL decide on the reading it records. The old reading is only a lower
bound, and the owner may have used the seat since, so starting work on it can spend the margin the
line keeps for them. Once a probe made after the crossing has recorded no observation, the gate
SHALL decide on the reading it already has, so a failed probe cannot shut a seat out. Until a probe
has been made after the crossing, the seat stays held, and that is recorded as holding back at the
line: a seat probed less than an hour before its crossing waits until the hourly limit allows the
next probe.

**A probe checks the credential too.** A probe the provider answers with an authentication failure
(HTTP 401) SHALL be recorded as a row in the execution log carrying the seat's credential key,
`seat:<id>:credential`, and a full hash of the credential it used, which opens the seat's credential
condition. A probe that succeeds SHALL be recorded as a check of that key that found the
condition not holding, which clears it. An authentication failure is not a probe that received no event, so the
five-hour back-off SHALL NOT follow it. A seat whose credential condition is open SHALL be probed only as
that clearing check, even when it holds an unexpired reading of every window, and never more than
once an hour. Every other exclusion
above still applies to it: a seat refused, spending extra usage, or at its line could not be used if
its credential were cleared, so it stays unprobed until it could be used.

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
- **THEN** no probe is made on it to read it, though a crossing or a check of its credential may
  still probe it

#### Scenario: A probe's cost is recorded

- **WHEN** a seat probe completes
- **THEN** its reported cost is recorded against the seat it read, as a seat probe
- **AND** spend attribution, capacity and reporting count it

#### Scenario: A probe loads no project's settings

- **WHEN** a seat is probed
- **THEN** the call runs from an empty temporary directory, with `HOME` set to a second empty
  temporary directory
- **AND** no directory above the first holds a `.claude` directory or a `CLAUDE.md`

#### Scenario: A probe is minimal

- **WHEN** a seat is probed
- **THEN** the call uses the cheapest model, a trivial prompt and no tools

#### Scenario: A probe's environment holds only the seat's token

- **WHEN** a seat is probed
- **THEN** the call's environment holds that seat's token and no other credential

#### Scenario: A probe that exits with an error is not retried at once

- **WHEN** a seat probe exits with an error
- **THEN** it is recorded on a spend row against the seat, with a cost of 0
- **AND** no `rate_limit_event` arrived, so the seat is probed again only once both the hourly
  limit and the five-hour back-off allow

#### Scenario: An excluded post-reset probe does not leave the seat unread

- **WHEN** a seat's session reading expires at a known reset, its post-reset probe is excluded by
  the hourly limit, and no run is made on the seat
- **THEN** the seat is probed once the hourly limit allows, without waiting for another reset

#### Scenario: An expiry at a known reset waits for the post-reset probe

- **WHEN** a seat's session reading expires at its reset and no run is made on the seat
- **THEN** the seat is probed ten minutes after that reset, once, and that probe also measures the
  window

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

#### Scenario: A crossing is checked before work starts

- **WHEN** a seat's week reading was at its line, and the line has since risen past it
- **THEN** a seat probe is made before any work starts on the seat
- **AND** the gate decides on the probe's reading

#### Scenario: A probe at the crossing that finds the seat fuller holds it

- **WHEN** the probe made at a crossing returns a reading at or past the line
- **THEN** no work starts on the seat

#### Scenario: A probe at the crossing that returns nothing does not shut the seat out

- **WHEN** the probe made at a crossing records no observation
- **THEN** the gate decides on the reading it already had

#### Scenario: A probe refused its credential opens the condition

- **WHEN** a seat probe is answered with an authentication failure
- **THEN** the seat's credential condition `seat:<id>:credential` is opened
- **AND** no observation is recorded

#### Scenario: A probe that succeeds clears the condition

- **WHEN** a seat's credential condition is open and a probe of it succeeds
- **THEN** the condition is cleared
- **AND** any reading the probe carried is recorded as usual

#### Scenario: A stopped credential is checked hourly

- **WHEN** a seat's credential condition is open and it was probed less than an hour ago
- **THEN** it is not probed again
- **AND** once an hour has passed it is probed again, with no five-hour back-off

#### Scenario: An undecryptable seat is not probed

- **WHEN** Igor could not decrypt a seat's file, and the seat has no reading of any window
- **THEN** the seat is not probed while its condition `seat:<id>:decrypt` is open

#### Scenario: `igor run` probes no seat

- **WHEN** `igor run` runs, and a seat serving its role has no reading of any window
- **THEN** no seat probe is made, of that seat or of the run's own

#### Scenario: A probe never runs on a person's machine

- **WHEN** a seat is probed
- **THEN** the call is made by the server running the Igors, with the seat's token as the server
  holds it

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

**Migration**: *A spend with no seat behind it is not made* keeps the rule that the seat the gate
chose pays with its own token, and that no call is made where the gate names none. It drops the
exemption for an organization that declares no seats, with its scenario *An unenforced budget is
untouched*, because Igor never uses a stored Claude login (proposal, decision 36), and drops *A
seat naming no token is still a seat*. *A spend nothing can attribute is refused rather than
recorded as ambient* becomes *…recorded as a stored login*.
