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
the run's question text SHALL NOT reach the item.

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

#### Scenario: A flagged run's budget handoff still gives the reset time

- **WHEN** a run that counts as having met a question with a category stops because the
  budget is exhausted
- **THEN** the handoff states when capacity is expected to return
