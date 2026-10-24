## MODIFIED Requirements

### Requirement: A handoff states what was done, what remains, and who could continue

A handoff SHALL report the work completed so far, the steps remaining as the Igor understands
them, and suggested parties who could pick it up.

For a *flagged* run, one that `task-execution`'s *Transcripts and outcomes are captured to the
state branch* treats as having met a question with a category, including a run that ended
without its completed report, the handoff SHALL state why the run stopped only in the fixed
words that requirement gives the run's `reason` in the execution ledger, such as `error`, or for
a worker killed for a limit the hang's kind and the limit's duration. It
SHALL quote no failure detail and no text the worker or the model provider wrote about why the
run stopped, such as a worker's account of why it declined. It SHALL point to the item's
transcript path on the state branch instead, which for such a run holds the one-line
transcript-withheld note that requirement writes in place of a transcript. Facts igor records itself, such as when a budget resets or which setting would let the
run proceed, are not text the run produced, and the handoff still states them.

A flagged run's handoff SHALL ask no question. Where the run stopped on a question it could not
settle, so that its handoff would otherwise be a handback comment (a handoff asking a person
that question, as `lore-firing` defines it), the Igor SHALL post only the handoff above, giving
as its reason the fixed words `needs a person`, which `task-execution` sets for such a run, and
the run's question text SHALL NOT reach the item. The Igor SHALL add no `igor:question` label,
or any other label that routes the item to an inquisitor role, to such a handoff.

The Igor SHALL instead write a file about that question on its own host:
`flagged-questions/<tracker>/<repo>/<item>/<name>.md` under its state directory, with the same
`<tracker>/<repo>/<item>` the item's transcript path has on the state branch and a random
`<name>` of its own, which the entry for its flagged hold in `work-triage`'s flagged-hold record names (`work-triage`
defines the flagged hold, its entry and the flagged-hold record). The state directory is `$STATE_DIRECTORY`
where it is set, and otherwise `$XDG_STATE_HOME/igor`, which is `~/.local/state/igor` when
`XDG_STATE_HOME` is unset. A systemd unit that sets `StateDirectory=igor` sets
`STATE_DIRECTORY` to `/var/lib/igor`, and `deploy/docker-compose.yml` sets the variable to the
same path itself. The question file
SHALL be mode 0600, owned by the user the Igor runs as, and the `flagged-questions` directory
and every directory below it SHALL be mode 0700. The file SHALL record every category the worker's flag listed, each at most once, with the
mark saying which belong to the question or questions the run stopped on (`task-execution`).
For the questions the run stopped on, it SHALL list each marked category, and the text, as the
run's handback would have asked it, of each such question that has no category; since the flag
gives each category once, the file does not say how many stopped questions share one. A value that is not one of #25's three words is no category (`task-execution`): where it was
marked, the file SHALL say that a stopped question's category could not be read, and an
unmarked one it SHALL leave out. It SHALL hold no text of a question that has
a category; that text is only in the session logs. It SHALL also list the path of every session
log of the execution that open pull request #174 copies: this change depends on #174 copying
each step's log before the next reset, the worker's, those of #153's later model steps and
#189's second worker run included, which #174 does. When the execution ends the Igor
SHALL move every such copy into the same directory beside the file, each named with the
question file's random `<name>` as its prefix, so that the entry naming that `<name>` names
the copies too, mode 0600, and SHALL do
so before it writes the file, so the file can name a copy whose move was refused. Where #174 made
no copy of a step's log, the file SHALL say so in place of that path. Whenever the Igor
creates, moves or deletes a file under `flagged-questions`, the question file and the session
log copies alike, it SHALL open every component of that path from its state directory down,
the state directory itself, `flagged-questions` and each directory under it to the file,
without following a link, such as with Linux's `openat2` and `RESOLVE_NO_SYMLINKS` or with
`O_NOFOLLOW` on each component, as gate two chooses (task 4.12).

The state directory SHALL also hold a *state-directory id*: a random id the Igor creates once,
the first time it uses the directory, and keeps in a file directly in it, on the same volume,
mode 0600. The Igor SHALL create and read that file by the same rule against following a link,
and SHALL treat a link, a hard-linked or non-regular file, or an unreadable one there as no
id. `work-triage` says how flagged-hold records use the id. Copying a state directory while an Igor
process uses it, as by restoring a volume snapshot beside the original, is unsupported. A copy
taken before a question file is written cannot release a flagged hold, since `work-triage`
clears an entry only by deleting the file it names; one taken after can, leaving the original's
files, which no open entry then names. Any copy shows as a mismatch, which the
operator resolves with the mismatch notice and `igor release` (`work-triage`). The source of each move,
#174's copy of a session log in the state directory, SHALL be checked by the same rule against following a link, every
component from the state directory down to the copy. The Igor SHALL NOT check the
directories above the state directory. The Igor SHALL refuse the action when any checked
component is a link, or when the file, the source of a move included, already exists and
either is not a regular file or has more than one hard link; this covers a file planted at the
path a question file is about to be written to. Checking a file SHALL NOT block on it, so a planted
pipe is refused, not waited on. A refused create counts as a file it cannot write, below. A
refused move or delete leaves the path in place, and the Igor records the refusal and the path
only in its own log on the host, adding nothing about it to the state branch. A refused move
of a session-log copy SHALL NOT count as a file it cannot write: the question file SHALL say
that copy is missing, as for a log #174 did not copy. A refused delete of a
session log leaves that log in place. What a
refused delete does to `igor release` is `work-triage`'s rule. Once workers run as users of their own (#175),
no worker run SHALL be able to reach the `flagged-questions` directory; #175 builds that, not
this change. Until then, and always under `igor run`, another worker running as the same user can
read it, its logs and categories included, and plant or delete a file in it, which Adam
accepts. A later flagged run of the same item that stops on a question, after a release or
while another flagged run of it is still running, keeps its question in a file of its own, a flagged hold of its own (`work-triage`),
with its own session logs beside it. Where the Igor cannot write the file, it
SHALL still post the handoff above, the ledger row's `reason` SHALL read
`needs a person, question not kept`, as `task-execution` sets, and the Igor SHALL open a
notice for its operator, a condition of the kind `stuck-conditions`' *A notice opens at once,
stops nothing, and stays open while an item is affected* describes, and a later failed write,
for any item, reuses a condition of that key already open; and the Igor SHALL write the path it could not write to its own log on the host. The failed write SHALL NOT delay or block the handoff. The condition's key is such as
`question not kept`, which gate two names, and the path SHALL appear nowhere on the state branch
or the item. The Igor SHALL
NOT push, post or publish the file, or its text, anywhere.

#### Scenario: Handoff content complete

- **WHEN** a handoff is posted
- **THEN** it states what was done, what remains, and who could continue

#### Scenario: Artifact referenced in the handoff

- **WHEN** partial work exists as an artifact
- **THEN** the handoff links it, so the next party resumes rather than restarts

#### Scenario: A flagged run's handoff quotes no failure detail

- **WHEN** a run that counts as having met a question with a category stops on a thrown error
  whose message names a file and a person
- **THEN** the handoff on the item gives the reason only as the ledger row's fixed words, such
  as `error`
- **AND** it quotes nothing of the error's message
- **AND** it points to the item's transcript path on the state branch

#### Scenario: A flagged run that declined quotes none of the worker's reason

- **WHEN** a run that counts as having met a question with a category ends with the worker
  declining the item, giving its reason in its final output
- **THEN** the handoff on the item quotes none of that reason
- **AND** it points to the item's transcript path on the state branch

#### Scenario: A flagged run's handoff still names the setting that would let it proceed

- **WHEN** a flagged run stops because its role's settings refused an action
- **THEN** the handoff names the setting that would let the run proceed, as igor records it
- **AND** it quotes no text the worker or the model provider wrote about why the run stopped

#### Scenario: A flagged run that stopped on a question posts no question

- **WHEN** a flagged run stops on a question it could not settle
- **THEN** its handoff on the item asks nothing and holds none of the question's text
- **AND** it gives the reason as the fixed words `needs a person`, and points to the item's
  transcript path

#### Scenario: A kept question names its category, not its text

- **WHEN** a flagged run stops on a question that #25's inquisitor gives the category `personal`
- **THEN** the question's file holds `personal`, marked as the stopped question's, and the paths
  of the execution's session logs
- **AND** it holds none of the question's text
- **AND** those session logs are beside it, mode 0600

#### Scenario: A run stopped on two questions lists both

- **WHEN** a flagged run stops on two questions, one with the category `secret` and one with
  none
- **THEN** the question's file lists `secret`, marked, and the second question's text
- **AND** it lists the path of every session log #174 copied for the execution

#### Scenario: A category met but not stopped on is recorded unmarked

- **WHEN** a flagged run meets a `secret` question it decides, then stops on a `personal` one
- **THEN** the question's file records `secret` unmarked and `personal` marked

#### Scenario: A step's log #174 did not copy is named as missing

- **WHEN** #174 made no copy of one step's session log in a flagged execution
- **THEN** the question's file says that step's log was not copied, in place of its path

#### Scenario: A link under flagged-questions is not followed

- **WHEN** the item's path under `flagged-questions` is a symbolic link a worker planted
- **THEN** the Igor writes, moves and deletes nothing through it

#### Scenario: A flagged-questions directory replaced by a link is refused

- **WHEN** a worker running as the Igor's user replaces the `flagged-questions` directory with a
  symbolic link to a working tree that a pull request is later pushed from
- **AND** a flagged run then stops on a question
- **THEN** the Igor writes nothing through the link
- **AND** it counts the write as failed: the handoff still posts, the ledger row's `reason` is
  `needs a person, question not kept`, and a notice condition opens

#### Scenario: A hard-linked file under flagged-questions is refused

- **WHEN** a flagged run of the item stops on a question
- **AND** a file with more than one hard link already exists at the path its question file is
  about to be written to
- **THEN** the Igor writes nothing to that file and counts the write as failed

#### Scenario: A pipe planted as the question file is refused without blocking

- **WHEN** a flagged run of the item stops on a question
- **AND** a worker running as the Igor's user has planted a named pipe at the path its question
  file is about to be written to
- **THEN** the Igor writes nothing to the pipe, counts the write as failed, and posts the
  handoff without waiting on the pipe

#### Scenario: The state-directory id is created once and kept

- **WHEN** the Igor first uses a state directory that holds no id
- **THEN** it creates a random id there
- **AND** every later process using that directory reads the same id

#### Scenario: An id file that is a link counts as no id

- **WHEN** the state directory's id file is a symbolic link, hard-linked, not a regular file or
  unreadable
- **THEN** the Igor treats the directory as having no id
- **AND** by `work-triage`'s rule for a run with no readable id, a flagged run there writes no
  file, adds no entry, and its execution-ledger row reads `needs a person, question not kept`
  and names no id

#### Scenario: Session-log copies carry the question file's name

- **WHEN** a flagged run keeps its question as `flagged-questions/github/acme/api/12/<name>.md`
- **THEN** each session-log copy moved beside it has a name starting with `<name>`
- **AND** the entry naming `<name>` names those copies, so a release deletes them and the
  mismatch comparison counts them as named

#### Scenario: A link below flagged-questions is refused

- **WHEN** a worker running as the Igor's user replaces `flagged-questions/github` with a
  symbolic link
- **AND** a flagged run of a GitHub item then stops on a question
- **THEN** the Igor writes nothing through the link and counts the write as failed

#### Scenario: A state directory replaced by a link is refused

- **WHEN** a worker running as the Igor's user replaces the Igor's state directory with a
  symbolic link
- **AND** a flagged run then stops on a question
- **THEN** the Igor writes nothing through the link and counts the write as failed

#### Scenario: A link above the state directory is followed

- **WHEN** the operator's `$XDG_STATE_HOME` passes through a symbolic link
- **AND** a flagged run stops on a question
- **THEN** the Igor writes the question file under its state directory as usual

#### Scenario: A refused move of a session-log copy leaves the question kept

- **WHEN** a flagged run stops on a question
- **AND** #174's copy of one of its session logs is a symbolic link
- **THEN** the Igor moves nothing through it and records the copy's path only in its own log on
  the host
- **AND** the question file it then writes says that copy is missing
- **AND** the ledger row's `reason` is `needs a person`, without `question not kept`

#### Scenario: A kept question without a category holds its text

- **WHEN** a flagged run stops on a question that has no category, reported before the run
  ended, though the run is flagged because a later worker run of it ended without its completed
  report
- **THEN** the question's file holds the question's text and the paths of the execution's
  session logs, both worker runs' included

#### Scenario: The question-not-kept condition stops no work

- **WHEN** the Igor cannot write a flagged run's question file for the first time
- **THEN** it opens a condition on that first failure
- **AND** the role goes on taking new items

#### Scenario: A flagged run that stops on a question adds no question label

- **WHEN** a flagged run stops on a question it could not settle
- **THEN** its handoff carries no `igor:question` label, nor any other label that routes the
  item to an inquisitor role

#### Scenario: A flagged run's question is kept on the host, never pushed

- **WHEN** a flagged run of item 12 in `acme/api`, on GitHub, stops on a question it could not
  settle, under a systemd unit that sets `StateDirectory=igor`
- **THEN** the Igor writes the question to
  `/var/lib/igor/flagged-questions/github/acme/api/12/<name>.md`, with a random `<name>`, mode 0600, owned by the user it
  runs as, in directories from `flagged-questions` down of mode 0700
- **AND** nothing the Igor pushes, posts or publishes holds the question's text

#### Scenario: A later flagged run's question is kept beside the first

- **WHEN** a flagged run of an item keeps its question on the host
- **AND** a later flagged run of the same item stops on another question
- **THEN** the later question is kept in a file of its own, with a random name of its own, and
  the first file stays until its own flagged hold is released

#### Scenario: Outside systemd the question goes under the XDG state directory

- **WHEN** a flagged run under `igor run` stops on a question it could not settle, and neither
  `STATE_DIRECTORY` nor `XDG_STATE_HOME` is set
- **THEN** the Igor writes the question under `~/.local/state/igor/flagged-questions/`

#### Scenario: A question that cannot be kept does not block the handoff

- **WHEN** a flagged run stops on a question it could not settle
- **AND** the Igor cannot write the question's file, because its state directory is read-only
- **THEN** the handoff posts as it would otherwise, giving the reason `needs a person`
- **AND** the ledger row's `reason` is `needs a person, question not kept`
- **AND** the Igor writes the path it could not write to its own log on the host
- **AND** it opens a notice, of which nothing is written to the state branch

#### Scenario: A flagged run's budget handoff still gives the reset time

- **WHEN** a run that counts as having met a question with a category stops because the
  budget is exhausted
- **THEN** the handoff states when capacity is expected to return
