## ADDED Requirements

### Requirement: Published text is signed by the model step that wrote it

Every text a model step writes for an Igor to publish SHALL be signed by that step. That
covers pull request descriptions, replies, questions, and any other model-written post to
GitHub, Discord or Linear. The step SHALL sign with the prose skill's `prose sign`, which
appends a `prose ✓ <hash>` footer computed over the text above it. No model step SHALL post.

Running the check is what puts the prose rules in front of the model while it writes, and a
footer can only come from running it.

Text the code assembles from recorded state is not signed: handoffs, stop receipts and claim
messages. The code's authors wrote it, and it is reviewed as code. A handoff is needed exactly
when a model call may be impossible, so it cannot depend on one, and `graceful-handoff` stays
as it is.

#### Scenario: A reply is signed where it is written

- **WHEN** a model step composes a reply to a mention
- **THEN** it returns the reply with a `prose ✓` footer from `prose sign`

#### Scenario: The rule holds on every surface

- **WHEN** an Igor posts model-written text to GitHub, Discord or Linear
- **THEN** the text carries a footer from the model step that wrote it

#### Scenario: A handoff needs no model call

- **WHEN** an Igor hands off an item after its budget is exhausted, so no model call is possible
- **THEN** the code posts the handoff it assembled from recorded state, without a signature

### Requirement: The code verifies text before it publishes it

The code that publishes a model-written text SHALL run `prose verify-post` on the exact text it is about to
send, and MUST NOT publish text that fails. The code verifies because the model's word is not
proof.

#### Scenario: Signed text is published unchanged

- **WHEN** a model step returns text whose footer verifies
- **THEN** the code publishes exactly that text

#### Scenario: Text edited after signing is not published

- **WHEN** the text differs from what its footer was computed over
- **THEN** the code does not publish it

#### Scenario: Unsigned text is not published

- **WHEN** the text has no `prose ✓` footer
- **THEN** the code does not publish it

### Requirement: A failed check goes back to the model step, a bounded number of times

When a check fails, the code SHALL return the text to the model step that wrote it, with the
reason, and that step SHALL redo its check and sign again. After two failed
attempts the code SHALL publish nothing and SHALL record the failure, with each reason, to the
state branch.

#### Scenario: A failure is sent back with its reason

- **WHEN** a text fails verification
- **THEN** the model step receives it back with the reason it failed
- **AND** returns it checked and signed again

#### Scenario: Repeated failure publishes nothing

- **WHEN** a text fails its second attempt
- **THEN** nothing is published
- **AND** the failure and its reasons are recorded to the state branch
