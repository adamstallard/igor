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

The Igor SHALL instead write that question, as the run would have asked it, to a file on its
own host: `flagged-questions/<tracker>/<repo>/<item>.md` under its state directory, with the
same `<tracker>/<repo>/<item>` the item's transcript path has on the state branch. The state directory is `$STATE_DIRECTORY`
where systemd sets it, as a unit that sets `StateDirectory=igor` makes it `/var/lib/igor`,
and otherwise
`$XDG_STATE_HOME/igor`, which is `~/.local/state/igor` when `XDG_STATE_HOME` is unset. The file
SHALL be mode 0600, owned by the user the Igor runs as, and the `flagged-questions` directory
and every directory below it SHALL be mode 0700. The question of a later flagged run of the
same item that stops on a question replaces the file. What the Igor does when it cannot write
the file is not decided (the proposal's Still open). The Igor SHALL
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

#### Scenario: A flagged run's budget handoff still gives the reset time

- **WHEN** a run that counts as having met a question with a category stops because the
  budget is exhausted
- **THEN** the handoff states when capacity is expected to return
