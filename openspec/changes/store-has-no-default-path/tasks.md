## 1. The requirement

- [ ] 1.1 Modify `lore-store`'s "Entry files are markdown with frontmatter, named by id" so the
      store lives under the configured `destination`, required and with no default, keeping
      `entries/` beneath it, the `id` + `.md` filename, and locatability from a supersession
      pointer or provenance reference
- [ ] 1.2 Carry both scenarios unchanged in name — "Entry written to disk" and "Entry located by
      id" — since a `MODIFIED` block that drops one is refused at archive; reword the first to
      `<destination>/entries/<id>.md`, which is what `store.ts` produces
- [ ] 1.3 Say in the proposal that a nested destination stays supported, so the text is not read
      as forbidding what the code allows

## 2. Checks

- [ ] 2.1 `openspec validate --changes --strict`
- [ ] 2.2 `npm test` unchanged from the base, this being a specification-only change
- [ ] 2.3 Confirm no other in-force requirement names a default store path
