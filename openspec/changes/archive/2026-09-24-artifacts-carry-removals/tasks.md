## 1. Establish that the artifact path can express a removal

- [x] 1.1 Check whether `produce`'s branch-creation path can carry the same tree shape as the
      resolution path's commit-onto-existing — they are different API calls, and if it cannot
      the shape of the answer changes

## 2. Carry removals through the seam

- [x] 2.1 `ArtifactRequest` gains `deletions`, mirroring `ResolutionRequest`
- [x] 2.2 The branch-creation helper writes removals as tree entries with a null sha
- [x] 2.3 The GitHub code host refuses an artifact with no changed path at all, rather than one
      with no *file* — otherwise a pure-removal change throws where it used to be refused

## 3. Remove the limit rather than bypass it

- [x] 3.1 The per-path `not supported yet` refusal is gone
- [x] 3.2 The "only changes were deletions" branch is gone; it is unreachable once removals
      publish, since the two lists partition the changes and an empty change already returns
      `nothing-to-do` upstream

## 4. What the limit falsified

- [x] 4.1 Comments saying a removal cannot be carried by the artifact path
- [x] 4.2 A handoff counts removals, so a pure-removal run does not read as a draft opened over
      no changes
- [x] 4.3 Docs: nothing in `docs/architecture.md` or `README.md` stated the limit, so nothing
      there is falsified; the requirement above is what now says a removal is carried

## 5. A path reported as both

- [x] 5.1 A removal whose path is written again is dropped: a tree carries each path once, and
      a removal beside its own blob either loses the file or loses the whole publish
- [x] 5.2 The same rule counts the handoff's removals, so what it says and what the artifact
      carries cannot disagree

## 6. Tests

- [x] 6.1 A mixed change whose removal lands
- [x] 6.2 A pure-removal change that publishes
- [x] 6.3 A rename that leaves no duplicate
- [x] 6.4 At the API boundary: the branch-creation tree payload carries the null-sha entry, and
      `produce` with no files and one removal opens an artifact
- [x] 6.5 A path reported as removed and written again reaches the artifact as a file alone,
      and is counted once in the handoff
