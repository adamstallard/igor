## 1. The action

- [ ] 1.1 `propose-lore` in the closed `allow` set, monotonic with the rest
- [ ] 1.2 Absent from the safe default an org base ships with
- [ ] 1.3 Tests: a role may narrow it away; a role may not grant itself one it did not inherit

## 2. Recognising a correction worth keeping

- [ ] 2.1 A correction is a directed message from a party with write access — the same rule
      that governs instructions, not a second one
- [ ] 2.2 Propose only where it recurs, or contradicts an active entry; a single remark does not
- [ ] 2.3 Where it restates an entry the store already holds, add provenance rather than
      proposing a duplicate
- [ ] 2.4 Tests for each of the three outcomes

## 3. Producing the candidate

- [ ] 3.1 Build an entry whose provenance names the correcting person, `{author, at}`, with the
      item's url where one applies
- [ ] 3.2 Hand it to the existing propose path rather than writing to the store
- [ ] 3.3 Confirm the existing dominant-author grouping routes it to that person, and test that
      it does rather than assuming it
- [ ] 3.4 Test that nothing reaches a worker until a person merges it

## 4. Refusal and record

- [ ] 4.1 A role without the action produces nothing, and the refusal is recorded as any other
- [ ] 4.2 A candidate previously rejected is not proposed again
- [ ] 4.3 What was proposed, from which correction, by whom, appears in the record

## 5. Documentation

- [ ] 5.1 `README.md`: that correcting an Igor can teach the team, and who may
- [ ] 5.2 `docs/architecture.md`: why the corrector is the author and not the Igor
