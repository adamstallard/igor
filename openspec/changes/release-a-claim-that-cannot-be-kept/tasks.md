## 1. The requirement

- [x] 1.1 One added `work-claiming` requirement covering the run that holds a claim and cannot
      continue: release and say so, say something else where the release did not take, and
      distinguish a surface failure from a refusal about the item
- [x] 1.2 Added rather than modifying: `work-claiming`'s existing requirements are about taking,
      verifying, standing down and stopping, and none of them is wrong

## 2. The claim's own window

- [x] 2.1 The guard opens at the assignment call, not after it — that call can apply on the
      surface and throw on the way home
- [x] 2.2 A throw inside the window releases and refuses rather than propagating
- [x] 2.3 The announcement is withdrawn where it may have landed, and not where it cannot have
- [x] 2.4 Where the release does not take, what is posted says so. **Wording carried verbatim,
      approved by the reviewer; may be reworded only with their agreement:**

      ```
      **<role>** could not finish taking this and could not release it either, so it is still
      assigned. Nothing was done. Unassign it to let another run pick it up.
      ```

## 3. The run around it

- [x] 3.1 Everything after the claim is held runs inside one handler
- [x] 3.2 The claim is handed back by the ordinary handoff, not a second vocabulary
- [x] 3.3 Reported as `refused`, so no deferral is created for a cause that was not the item's
- [x] 3.4 The body extracted rather than indented, so the diff is readable

## 4. The cycle

- [x] 4.1 A run says whether its cause was the surface
- [x] 4.2 `serve` counts it, emits `cycle-failed`, and abandons the cycle — **on the second
      consecutive one, not the first.** Whether a failure is the surface's or the item's cannot
      be read off the error or off what the run holds; how many items it affects can
- [x] 4.3 A refusal about the item does not stop the cycle

## 5. Saying so wherever a release does not take

- [x] 5a.1 The stand-down appends the correction where the holder did not clear, and speaks at
      all on a `lost` claim it could not give up — which said nothing before
- [x] 5a.2 `handOff` reads the answer rather than assuming it, and corrects the handoff on the
      item rather than only in the flags it returns
- [x] 5a.3 `complete()`'s unassign does the same, so a published run cannot report `produced`
      while the item stays assigned with nobody told
- [x] 5a.4 **Wording carried verbatim, approved by the reviewer.** Appended where something was
      already said:

      ```
      This is still assigned — releasing it did not take. Unassign it to free it.
      ```

      Standalone, for a lost claim that could not be released:

      ```
      **<role>** stood down here, and could not clear its own name from it. Unassign it to free it.
      ```

## 6. The write contract

- [x] 5.1 `report` answers the posted comment's identity, or `undefined` where the surface will
      not say
- [x] 5.2 `release` answers whether the holder field is clear
- [x] 5.3 An answer that does not carry the assignees reads as not clear, argued in `design.md`

## 7. Tests

- [x] 6.1 Each failure path observed red before its fix
- [x] 6.2 Every added test mutation-checked, including a negative pole for each
- [x] 6.3 A tree that cannot be provisioned hands the claim back
- [x] 6.4 An ordinary refusal is not flagged as a surface failure
- [x] 6.5 A cycle abandons on a surface failure, and does not on an item refusal

## 8. What is left

- [ ] 8.1 [#132](https://github.com/adamstallard/igor/issues/132) — the stop receipt still writes
      `spoke: true` whatever the report did. Same requirement, a site this change does not reach
- [ ] 8.2 File the third escape found while fixing #129 as its own issue if it is not closed here
- [ ] 8.3 **A deterministic item fault still re-spends.** The counter stops a wedged item from
      ending every cycle, but the claim is released rather than held, so the item returns next
      cycle and the worker runs on it again. Before this change the held claim screened it out.
      Needs a decision: defer such an item, or screen it some other way
