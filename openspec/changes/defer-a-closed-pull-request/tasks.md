## 1. The requirement

- [x] 1.1 One added `work-triage` requirement: a pull request an Igor opened, closed without
      merging, defers its item and asks why
- [x] 1.2 The rule that only someone with write access lifts a deferral is carried in
      `condition-backoff`'s existing modification of *"An item handed back is not re-worked until
      something answers"*, not here, so that requirement has one pending modification rather than
      two

## 2. Finding the close

- [ ] 2.1 From the timeline `inFlightFrom` already walks, recognise a pull request that is closed,
      unmerged, and authored by this Igor
- [ ] 2.2 One opened by anybody else, or merged, is not this

## 3. Asking, and deferring

- [ ] 3.1 The first time a close is found, post the question on the item and record a deferral.
      **Carried verbatim; may be reworded only with the reviewer's agreement:**

      ```
      **<role>**'s pull request <ref> was closed without being merged, so it has stopped working
      on this. Should it try a different approach, or leave it? Reply here to restart it.
      ```

- [ ] 3.2 Do not ask again while the item stays deferred

## 4. Who can lift a deferral — implementing `condition-backoff`'s amended requirement

- [ ] 4.1 A reply lifts a deferral only where its author has write access to the repository,
      read as `permissions.push`
- [ ] 4.2 An edit lifts one only where the edit history names a writer as its author — from
      GraphQL's `userContentEdits`, since REST records no editor
- [ ] 4.3 Every deferral, not only one from a closed pull request

## 5. Tests

- [ ] 5.1 A closed, unmerged Igor pull request defers its item and posts the question once
- [ ] 5.2 A merged one, and a closed one opened by somebody else, do neither
- [ ] 5.3 A reply from someone without write access leaves any deferral in place; one from a
      writer lifts it
- [ ] 5.4 An edit by an item's own author without write access leaves it in place; one by a writer
      lifts it
- [ ] 5.5 Closing the item removes it from discovery, and nothing is asked

## 6. Merging

- [ ] 6.1 When merging, if `main` still says "until a reply or an edit answers it"
      (`docs/architecture.md` §5.0.2), reword it to say only someone with write access lifts a
      deferral. #101 carries the same task; whichever merges first does it
