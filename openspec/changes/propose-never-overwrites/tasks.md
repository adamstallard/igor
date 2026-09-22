## 1. The gate at proposing

- [x] 1.1 Read the ids at the sha `createBranchWithFiles` is handed, both `entries/` and
      `rejected/`, in one bounded read
- [x] 1.2 Refuse a truncated listing, and a store path that is there but is not a directory,
      rather than gating against part of a store
- [x] 1.3 Report what was skipped and why, and refuse where nothing survives
- [x] 1.4 Tests over the real `github.ts`, asserting the committed file list and that the tree
      the gate read is the tree the commit was built on

## 2. The gate at minting

- [x] 2.1 `create` mints against the ids on the default branch as well as the checkout's own
- [x] 2.2 `store.ts` stays filesystem-only: the caller reads the branch and passes the ids in
- [x] 2.3 Where the branch cannot be read, say what was not checked and mint against the
      checkout alone rather than refusing to create
- [x] 2.4 Tests over the real `github.ts`: an id upstream holds is not minted, an id only the
      checkout holds is still not minted, and the cost does not grow with the store

## 3. The guarantee

- [x] 3.1 One `lore-review` requirement: an existing entry is never overwritten by proposing,
      scoped to the id space
- [x] 3.2 Name what a behind checkout is still wrong about — configuration
      ([#91](https://github.com/adamstallard/igor/issues/91)) and a subdirectory destination
      ([#92](https://github.com/adamstallard/igor/issues/92)) — so the text is not read as
      covering them
- [x] 3.3 Record both measurements in `docs/architecture.md`: 13 → 16 requests for a proposal of
      5 candidates, 0 → 5 for a `create`, neither growing per entry
