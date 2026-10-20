# A search over lore may be offered, and never shows an out-of-scope entry

## Decisions

Every decision below is Adam's, recorded in
[#215](https://github.com/adamstallard/igor/issues/215). He made decisions 1, 2 and 7 on
2026-10-19 while reviewing [shared-skills #25](https://github.com/adamstallard/shared-skills/pull/25),
and decisions 3 to 6 on 2026-10-20, answering this change's consistency read.

Terms used here:
- An *Igor* is a teammate agent that runs one role. A *worker* is the agent an Igor starts to do
  one item, and *during an Igor's run* means while an agent works for an Igor under its role.
- The *inquisitor* is a shared skill (shared-skills #25) that an agent runs before asking a
  person a question. Its first filter looks for an *answer*: something already recorded that
  settles the question, so that no person need be asked.
- *Gate one* is this specification. *Gate two* is the code, which lands on the same branch once
  Adam approves gate one.

1. **Lore still reaches the worker unbidden.** Active, in-scope entries are injected before the
   worker runs, and the worker is never required to request them.
2. **The ban on offering a search over the lore store is dropped.** The ban's only stated reason
   is that a worker needs no search. `docs/architecture.md` §3.2.1 justifies unbidden firing by
   saying that better search cannot replace it, not that search does harm; of letting a worker
   search Linear or Slack, the same section says "forbidding it buys no safety".
3. **Scope is a hard filter on a search; status is not.** During an Igor's run, a search never
   returns an entry whose scope does not cover the run's role, nor any count or mention of one,
   because scope decides what a role may see (*Status and scope are exact filters, always
   applied*). A search may return an in-scope `provisional` or `deprecated` entry, labelled as
   not lore. Only `active` entries count as lore or as answers.
4. **During an Igor's run, a search uses firing's scope rule for the run's role.** That is
   `scopeMatches` in `src/firing.ts`: `global`, `role:` naming the running role, and `project:`
   naming any repository the role works. This holds when the inquisitor skill runs inside an
   Igor, and shared-skills #25 adopts the same rule for that case. A search outside an Igor's
   run, such as the inquisitor in a person's own session, has no run's role to filter by, and
   this change sets no rule for it; the inquisitor's own spec does.
5. **A search hit is not a firing.** It is not recorded as one and gets no counter of its own.
   For deciding whether an entry is used, the event that counts is an agent citing the entry as
   the answer to a question, because then no person had to be asked. The inquisitor's question
   log records each such citation, naming the entry. A review that
   proposes pruning or promotion (`docs/architecture.md` §3.4.1, still planned, with no
   thresholds) counts those citations beside the fire count. An entry can be cited but never fire,
   for example while its role's in-scope entries exceed the firing budget, and it is then not
   proposed as unused.
6. **A search is a lookup over the store made to find lore or an answer for an agent.** A check
   that compares a candidate against the store to avoid a duplicate, as `lore-from-corrections`
   and `lore-from-reviews` do, is curation and not a search. It may compare against `provisional`
   entries, and against candidates a reviewer has already rejected (`lore-from-corrections` never
   proposes one of those again). Scope is a hard filter there too, by the role of the Igor running
   the check. A person reading the store, as `igor list` lets them, is not a search either:
   reviewing entries requires seeing the `provisional` ones.
7. **No carve-out for one caller.** *Rejected:* allowing only the inquisitor's search. The one
   harm a search could do is show a role entries it may not see, and decision 3 prevents that for
   every caller.

**Still open:**
- Whether gate two builds a search command for workers. Either way, gate two builds and tests
  the filter a search must use (tasks.md, section 2).
- Whether an Igor's worker can run the inquisitor skill at all: load it, and reach a lore clone
  and the skill's configuration from the worker's environment, which Igor writes out for each
  worker rather than letting it inherit the server's. Task 3.1 checks.
- Whether a worker can read the lore checkout's files directly. If it can, it can see entries
  outside its role's scope without any search, and the filter above does not stop that. Task 3.2
  checks.

## Why

The requirement *Lore reaches the worker unbidden* forbids offering a worker a search over the
store, because a worker needs no search: anything it would think to look up is reachable by
reading the codebase. Two cases contradict that:

- **Firing does not always deliver every entry.** When the in-scope entries exceed the token
  budget, none are injected (*Exceeding the budget is reported, never silently resolved*), and
  the relevance mechanism that the budget requirement anticipates would inject only some. A
  search lets a worker find a recorded answer that was not injected.
- **The inquisitor searches lore before an agent asks a person anything.** The shared
  `inquisitor` skill (shared-skills #25) runs filters before an agent asks a question, and the
  first looks for an answer already recorded, in lore among other places.
  [#211](https://github.com/adamstallard/igor/issues/211)'s decision 9 has an Igor run those
  filters when a question it cannot settle stops its work, so an Igor would search lore before
  asking anyone. That search avoids interrupting a person; it is not looking up how to do the
  work, which is all the ban's reason speaks to.

## What Changes

- `lore-firing`'s *Lore reaches the worker unbidden* keeps injection and drops the ban on a
  search.
- The same requirement defines a search and a search during a run, holds every search to
  firing's scope rule, lets it return in-scope entries that are not `active` with a label, keeps
  search hits out of the firing record, and says what a duplicate check may compare against.
- The scenario *No search affordance offered* is removed. Five are added: *Injection does not
  wait on a search*, *A search never shows an out-of-scope entry*, *A search labels in-scope
  entries that are not active*, *A search hit is not a firing*, and *A duplicate check is
  curation, not a search*.
- `docs/architecture.md`: §3.3 says a search may be offered and what binds it, §3.4.1 says a
  search hit is not a firing and that a review counts question-log citations, and §4.1 says the
  worker never *has* to search.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `lore-firing`: *Lore reaches the worker unbidden* allows a search over the store and says what
  a search may return.

## Impact

- `test/firing.test.ts`: the test *offers a worker no way to search the store* checks the removed
  scenario, and is deleted in gate two.
- `src/firing.ts`: its header comment gives the old reason for having no search, and is rewritten
  in gate two.
- [#196](https://github.com/adamstallard/igor/pull/196) (`spec-trace`) tags that test with
  `@scenario lore-firing: No search affordance offered`. Whichever of #196 and this change
  merges second removes the tag with the test.
- `lore-from-corrections` and `lore-from-reviews` each compare a candidate against existing
  entries, and neither limits that by scope. Where such a check runs during an Igor's run, it
  must not compare against an entry outside the role's scope (decision 6).
