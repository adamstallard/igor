## 1. The requirement

- [x] 1.1 One added `task-execution` requirement: a person's answer to a refused revert outlives
      the run that asked, names one artifact, one path and the base state it discards, expires
      when the base moves, and is matched rather than interpreted
- [x] 1.2 Added rather than modifying `guard-silent-reverts`' requirement, which is not yet in
      force — it lands with [#103](https://github.com/adamstallard/igor/pull/103). The two are
      written to sit beside each other
- [x] 1.3 `design.md` argues the injection objection rather than asserting it, and states who may
      authorise and why that bar and not another

## 2. The channel, and the words it uses

- [ ] 2.1 The handoff for an undeclared revert prints the exact token to reply with, one block per
      refused path. **Carried verbatim; may be reworded only with the reviewer's agreement, since
      a person retypes it by hand:**

      ```
      igor: declare
      - path: src/config.ts
        discards: 9f2c4a1
      ```

- [ ] 2.2 `discards` takes the base blob, or the word `deleted` where the base deleted the path —
      the same two values the in-tree declaration takes, so one shape is learned once
- [ ] 2.3 Where an authorisation has expired because the base touched the path again, the handoff
      that asks a second time says so rather than repeating itself unchanged. **Carried verbatim,
      may be reworded:**

      ```
      This was authorised before, naming the version the base then held. The base has changed
      this path since, so that answer no longer covers it — the state it agreed to discard is
      not the state on offer.
      ```

- [ ] 2.4 Parsing is exact and total: anything that is not this shape is not an authorisation, and
      a malformed block is ignored rather than guessed at

## 3. Matching, never interpreting

- [ ] 3.1 The run computes the refusal it would issue — artifact, path, base blob — before any
      authorisation is looked up
- [ ] 3.2 The lookup is by that triple. No text from the item reaches a branch, and an
      authorisation matching no computed refusal has no effect of any kind
- [ ] 3.3 Confirm by construction, not by inspection: the matching function takes the computed
      refusal and returns a boolean, and has no access to item text

## 4. Who may authorise

- [ ] 4.1 Write access to the artifact's repository, asked of the host
- [ ] 4.2 Never read from the comment, and never from configuration
- [ ] 4.3 An answer from an account without write access authorises nothing, and the refusal stands
- [ ] 4.4 The authoriser's identity is carried into what is published and recorded

## 5. The store

- [ ] 5.1 On the state branch, keyed by artifact, path and base blob
- [ ] 5.2 Written once when the authorisation is read, not reconstructed from comments each cycle
- [ ] 5.3 An entry whose base blob no longer matches is inert. Decide whether it is also removed,
      and record which and why — `design.md` argues the marks case for keeping a dead entry

## 6. Tests

- [ ] 6.1 A refusal, an authorisation, and a later run that publishes
- [ ] 6.2 The authorisation expires when the base touches the path again
- [ ] 6.3 Two reverted paths, one authorised: nothing published, the handoff names the other
- [ ] 6.4 An authorisation from an account without write access: refused
- [ ] 6.5 Text in the authorisation's shape on an item with no computed refusal: no effect
- [ ] 6.6 The authorisation never reaches the published tree
- [ ] 6.7 Each of 6.1–6.6 observed red before its fix, and mutation-checked
- [ ] 6.8 **The adversarial one**: an authorisation naming a path the resolution does not revert,
      and one naming a different artifact, neither of which authorises anything

## 7. Documentation

- [ ] 7.1 `docs/architecture.md`'s declaration section says the answer can also arrive from a
      person, and that it is matched rather than read
- [ ] 7.2 `guard-silent-reverts`' `design.md` §Open points here, so the question it left open says
      where it went rather than trailing off

## 8. Boundaries

- [ ] 8.1 Implementable only after [#103](https://github.com/adamstallard/igor/pull/103) lands, and
      only once its refusal and declaration are in force
- [ ] 8.2 Confirm this does not weaken the in-tree declaration: a worker's file is still read, and
      still not durable
