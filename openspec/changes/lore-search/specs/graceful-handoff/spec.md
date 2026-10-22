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

The Igor SHALL instead write a file about that question on its own host: `flagged-questions/<tracker>/<repo>/<item>.md` under its state directory, with the
same `<tracker>/<repo>/<item>` the item's transcript path has on the state branch. The state directory is `$STATE_DIRECTORY`
where it is set, and otherwise `$XDG_STATE_HOME/igor`, which is `~/.local/state/igor` when
`XDG_STATE_HOME` is unset. A systemd unit that sets `StateDirectory=igor` sets
`STATE_DIRECTORY` to `/var/lib/igor`, and `deploy/docker-compose.yml` sets the variable to the
same path itself. The file
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
#189's second worker run included (the proposal's Still open). When the execution ends the Igor
SHALL move every such copy into the same directory beside the file, mode 0600, and SHALL do
so before it writes the file, so the file can name a copy whose move was refused. Where #174 made
no copy of a step's log, the file SHALL say so in place of that path. Whenever the Igor
creates, moves or deletes a file under `flagged-questions`, the question file and the session
log copies alike, it SHALL open every component of that path from its state directory down,
the state directory itself, `flagged-questions` and each directory under it to the file,
without following a link, such as with Linux's `openat2` and `RESOLVE_NO_SYMLINKS` or with
`O_NOFOLLOW` on each component, as gate two chooses (task 4.12). The source of each move,
#174's copy of a session log in the state directory, SHALL be checked the same way, every
component from the state directory down to the copy. The Igor SHALL NOT check the
directories above the state directory. The Igor SHALL refuse the action when any checked
component is a link, or when the file, the source of a move included, already exists and
either is not a regular file or has more than one hard link; this covers an existing question
file a later flagged run would replace. Checking a file SHALL NOT block on it, so a planted
pipe is refused, not waited on. A refused create counts as a file it cannot write, below. A
refused move or delete leaves the path in place, and the Igor records the refusal and the path
only in its own log on the host, adding nothing about it to the state branch. A refused move
of a session-log copy SHALL NOT count as a file it cannot write: the question file SHALL say
that copy is missing, as for a log #174 did not copy. A refused delete of an earlier
execution's session log, which a later one replaces below, leaves that log in place. What a
refused delete does to `igor release` is `work-triage`'s rule. Once workers run as users of their own (#175),
no worker run SHALL be able to reach the `flagged-questions` directory; #175 builds that, not
this change. Until then, and always under `igor run`, another worker running as the same user can
read it, its logs and categories included, and plant or delete a file in it, which Adam
accepts. Where the item is worked again after a release, or two
ranks race, the question of a later flagged run of the same item that stops on a question
replaces any file still there, and that execution's session logs replace the earlier ones. Where the Igor cannot write the file, it
SHALL still post the handoff above, the ledger row's `reason` SHALL read
`needs a person, question not kept`, as `task-execution` sets, and the Igor SHALL open a
condition for its operator on that first failed write, once `condition-backoff` defines
conditions, and a later failed write, for any item, reuses a condition already open, and write the path it could not write to its own log on the host. The condition is
a notice only and SHALL stop no work;
the failed write SHALL NOT delay or block the handoff. The condition's record on the state
branch SHALL hold only its key, which gate two names, and the path SHALL appear nowhere on the state branch or the
item. Gate two MAY ship before `condition-backoff`, the open change that defines conditions,
lands; until then the ledger row and the log line alone record the failure. The Igor SHALL
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
  `needs a person, question not kept`, and a notice condition opens where conditions exist

#### Scenario: A hard-linked file under flagged-questions is refused

- **WHEN** the item's question file under `flagged-questions` has more than one hard link
- **AND** a later flagged run of the item stops on a question
- **THEN** the Igor writes nothing to that file and counts the write as failed

#### Scenario: A pipe planted as the question file is refused without blocking

- **WHEN** a worker running as the Igor's user replaces the item's question file under
  `flagged-questions` with a named pipe
- **AND** a later flagged run of the item stops on a question
- **THEN** the Igor writes nothing to the pipe, counts the write as failed, and posts the
  handoff without waiting on the pipe

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
- **THEN** it opens a condition, where `condition-backoff` is built, on that first failure
- **AND** the role goes on taking new items

#### Scenario: A flagged run that stops on a question adds no question label

- **WHEN** a flagged run stops on a question it could not settle
- **THEN** its handoff carries no `igor:question` label, nor any other label that routes the
  item to an inquisitor role

#### Scenario: A flagged run's question is kept on the host, never pushed

- **WHEN** a flagged run of item 12 in `acme/api`, on GitHub, stops on a question it could not
  settle, under a systemd unit that sets `StateDirectory=igor`
- **THEN** the Igor writes the question to
  `/var/lib/igor/flagged-questions/github/acme/api/12.md`, mode 0600, owned by the user it
  runs as, in directories from `flagged-questions` down of mode 0700
- **AND** nothing the Igor pushes, posts or publishes holds the question's text

#### Scenario: A later flagged run's question replaces the kept one

- **WHEN** a flagged run of an item keeps its question on the host
- **AND** a later flagged run of the same item stops on another question
- **THEN** the item's file holds only the later question

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
- **AND**, where `condition-backoff` is built, it opens a condition whose record holds only its
  key

#### Scenario: A flagged run's budget handoff still gives the reset time

- **WHEN** a run that counts as having met a question with a category stops because the
  budget is exhausted
- **THEN** the handoff states when capacity is expected to return
