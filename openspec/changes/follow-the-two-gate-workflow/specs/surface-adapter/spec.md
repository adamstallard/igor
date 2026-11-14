## MODIFIED Requirements

### Requirement: Linkage between artifact and item is adapter-supplied

Each adapter SHALL supply the convention linking an artifact to its item, because that
convention varies by tracker. The loop MUST NOT hardcode any linkage form. Each tracker adapter
SHALL also supply a non-closing reference: a form that links an artifact to its item, and still
marks the item as having work in flight, without closing it when the artifact merges.

#### Scenario: Linkage convention differs by tracker

- **WHEN** one tracker links by a reference in the artifact body and another links by branch name
- **THEN** each adapter applies its own convention
- **AND** the loop's behaviour is identical in both cases

#### Scenario: A non-closing reference closes nothing

- **WHEN** an artifact refers to its GitHub issue by the adapter's non-closing reference, and
  merges
- **THEN** the issue stays open
