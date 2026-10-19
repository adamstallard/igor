## MODIFIED Requirements

### Requirement: A budget handoff states when capacity returns

Where the reason for stopping is budget, the handoff SHALL state when capacity is expected to
return rather than reporting the Igor as unavailable without qualification: the window's reset,
or, for a window a seat's reserve line shut, the hour seat-budget's *A handoff for a window the
line shut states its crossing, marked approximate* gives.

#### Scenario: Reset time included

- **WHEN** an Igor hands off because its budget is exhausted
- **THEN** the handoff states when capacity is expected to return

#### Scenario: A window the line shut states its crossing

- **WHEN** an Igor hands off because a seat's reserve line shut a window whose reading is below
  100%
- **THEN** the handoff states the instant the line rises past the reading, not the window's reset

#### Scenario: Busy is not a reason

- **WHEN** an Igor has capacity but many items in progress
- **THEN** it does not defer on the grounds of being busy
- **AND** budget remains its only reason to defer
