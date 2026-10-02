## ADDED Requirements

### Requirement: A recorded decision carries both ages as numbers

Where a cycle records a decision about a candidate, the entry SHALL carry the candidate's age and
its idleness as they stood at the moment of the decision — time since the item was created, and
time since anything last happened on it — each readable as a number on its own rather than phrased
inside the reason. Both SHALL be present on every decision the cycle writes, whatever stage decided
it and whatever the outcome.

This composes with "Every decision records its reason, including skips" and does not restate it.
That requirement governs which decisions are recorded and that each says why; this one adds two
measurements to the entry that requirement already mandates. Neither relaxes the other: a decision
exempt from being recorded at all is exempt from carrying ages, and an entry carrying ages still
owes its outcome, its stage and its reason.

**Both ages, on every entry, is the operative part.** The two numbers are already carried on every
normalized candidate and are already handed to the model, and then nothing keeps them. Recording
one and not the other, or recording them only where a predicate happened to mention one, answers
nothing: a value present only on the entries an age constraint rejected cannot be compared against
the entries it let through, and a comparison across the whole population is the only thing that
distinguishes the two axes.

**A number inside a sentence is not a substitute.** An item excluded by an age constraint is
recorded with a reason that states its age in prose — `created 867 days ago, over the 90-day limit`
— and that number cannot be counted, sorted, bucketed or compared across entries without a person
reading each one, which is the work the record exists to spare them. It is also the only age any
entry holds, it holds it only on that one class of entry, and idleness appears in no sentence at
all. The reason SHALL keep saying what it says; the numbers go beside it, not into it.

The reason to keep them is that a question was deferred to this data and cannot be answered without
it — whether time since creation is the wrong axis for an age constraint, an ancient item commented
on yesterday being arguably live. The evidence decays in the direction that matters most. For an
item nobody has touched since, present idleness still approximates what it was at the decision; for
an item that **has** been commented on since — which is the case the doubt is entirely about — the
value at decision time is gone from the item's current state, recoverable only by replaying its
timeline rather than by reading it. So the cycles whose evidence would settle the question are the
cycles that lose it first, and every cycle recorded without these numbers is one that cannot be
recovered.

**This settles nothing about the axis.** It does not make idleness a constraint, does not change
what an age constraint filters on, and does not say which of the two an age constraint ought to
read. Recording a measurement is not adopting it. The question stays open and stays where it is;
this requirement only makes it answerable from the record instead of unanswerable.

#### Scenario: Both ages on every recorded decision

- **WHEN** a cycle writes its decision record
- **THEN** each decision in it carries the candidate's age and its idleness as numbers
- **AND** this holds whatever stage decided the candidate and whatever the outcome was

#### Scenario: An age-rejected item carries more than its prose

- **WHEN** a candidate is skipped by an age constraint
- **THEN** its entry carries both ages as numbers, separately from the reason
- **AND** the reason still states why it was excluded

#### Scenario: Idleness is recorded for an item the age constraint let through

- **WHEN** a candidate passes the age constraint and is decided at a later stage
- **THEN** its idleness at the moment of that decision is readable from its entry

#### Scenario: The ages are comparable across entries

- **WHEN** an operator inspects decision records over a period
- **THEN** both ages are determinable per decision without reading the reasons one at a time
- **AND** the two can be compared across every decision recorded, not only across the ones an age
  constraint rejected

#### Scenario: Recording idleness does not make it a constraint

- **WHEN** a candidate is idle enough that an idleness constraint would have treated it differently
- **THEN** whether it is skipped is unchanged by its idleness being recorded
