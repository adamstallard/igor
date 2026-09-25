## 1. Spec

- [x] 1.1 One added `work-discovery` requirement: a watermark records how far one role has
      considered a source, keyed by role as well as source (#104)
- [x] 1.2 Added rather than modifying *Watermarks reduce reconsideration without governing it*,
      since `preview-persists-nothing` holds an open `MODIFIED` block on it and `MODIFIED`
      replaces the whole body on archive
- [x] 1.3 The three consequences settled in the requirement rather than left to the code: every
      source cold-starts once, the role is its name so a rename cold-starts, and an unresolvable
      mark is left in place
- [x] 1.4 Checked for a name collision against the nine in-force `work-discovery` requirements,
      `concurrent-instances`' two, `preview-persists-nothing`'s two, `structured-failure-record`'s
      two (PR #99), `triage-needs-a-seat`'s four (PR #70) and `guard-silent-reverts`' one (PR
      #103), plus every other requirement outside `openspec/changes/archive/`

## 2. Interim guidance, while the key is still shared

- [x] 2.1 `docs/architecture.md` §5.0.2 says the mark is keyed by source and not by role, what
      that costs a second role, and to scope roles by query until this lands
- [ ] 2.2 That paragraph deleted by whoever implements this, in the same change

## 3. The key

- [ ] 3.1 `sourceKey` takes the role's name and carries it in the key, so `discovery.json` holds
      one entry per role per source
- [ ] 3.2 `discoverSource` and `discover` take the role's name and pass it through; `planCycle`
      already holds `role.name`
- [ ] 3.3 Nothing prunes an entry the running role's sources do not resolve to, and `advance`
      keeps copying the stored map rather than rebuilding it
- [ ] 3.4 The watermark block left alone — it maps `result.key` to a watermark and does not read
      what the key is made of, on `main` and on `origin/triage-gate` alike

## 4. Tests

- [ ] 4.1 Two roles differing only by lane against one source: the narrow role's lane rejection
      leaves the item fresh to the other, with nothing about the item changed
- [ ] 4.2 Asserted in the other direction — one role's own second cycle does not re-triage what
      it already considered — so the fix cannot be satisfied by never advancing the mark
- [ ] 4.3 A role added to a source another role has been polling is a cold start bounded by the
      look-back window, not a role that sees nothing
- [ ] 4.4 Two roles' marks in one `discovery.json`: writing one leaves the other byte-identical,
      asserted after both were set so it distinguishes "unchanged" from "never written"
- [ ] 4.5 An entry no configured source resolves to survives a cycle
- [ ] 4.6 The existing key tests in `test/discovery.test.ts` updated rather than deleted: stable
      across runs, independent of declaration order, and different for a different query — each
      now also different for a different role
