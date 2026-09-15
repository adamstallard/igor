## 1. Noticing

- [ ] 1.1 The adapter reports whether an in-flight artifact is the Igor's own and whether it
      merges — `mergeable` is computed asynchronously by GitHub and may be `null` on first ask,
      so treat unknown as "not yet", never as "conflicted"
- [ ] 1.2 The in-flight skip admits only an own artifact that cannot merge
- [ ] 1.3 Tests: own and conflicting is a candidate; own and clean is skipped; another party's
      conflicting artifact is skipped; unknown mergeability is skipped

## 2. Merging without a worker

- [ ] 2.1 Ask the code host to merge the base into the artifact's branch
- [ ] 2.2 A clean merge finishes the cycle for that item, with no worker and no model call
- [ ] 2.3 Say so on the item only if something was needed — a silent, clean catch-up is not news
- [ ] 2.4 Tests, including that no worker is invoked on the clean path

## 3. Resolving with one

- [ ] 3.1 A conflict provisions a tree at the artifact's branch, with the conflict in it
- [ ] 3.2 The worker resolves files; the loop publishes to the same branch, never a new one
- [ ] 3.3 The artifact's existing history and review survive
- [ ] 3.4 An unresolvable conflict hands off, naming the artifact and the obstacle
- [ ] 3.5 Tests for each

## 4. Bounds

- [ ] 4.1 Catching up counts against the same budget gate as any other work
- [ ] 4.2 An artifact that conflicts again immediately must not loop — decide what stops it and
      test that it does

## 5. Documentation

- [ ] 5.1 `README.md`: what an Igor does with its own pull request after opening it
