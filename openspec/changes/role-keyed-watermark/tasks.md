## 1. Spec

- [x] 1.1 One modified `work-discovery` requirement, *Watermarks reduce reconsideration without
      governing it*: a watermark records how far one role has considered a source, keyed by role
      as well as source (#104)
- [x] 1.2 Modified rather than added beside it: the block carries the text before it, since
      `MODIFIED` replaces the whole body on archive (task 1.6)
- [x] 1.3 The three consequences settled in *A role's watermark is its own* rather than left to the code: every
      source cold-starts once, the role is its name so a rename cold-starts, and an unresolvable
      mark is left in place
- [x] 1.4 Checked for a name collision against the nine in-force `work-discovery` requirements,
      `concurrent-instances`' two, `preview-persists-nothing`'s two, `structured-failure-record`'s
      two (PR #99), `triage-needs-a-seat`'s four (PR #70) and `guard-silent-reverts`' one (PR
      #103), plus every other requirement outside `openspec/changes/archive/`, on 2026-10-11.
      #70 and #103 have since merged, which moved their requirements into force under the same
      names, so the check still holds. #242 and #173 modify *Watermarks reduce
      reconsideration without governing it*, and this block carries their copies (task 1.6)
- [x] 1.5 One mark per role and source; no mark is kept per process start or per seat
- [x] 1.6 This change's block is #173's copy of *Watermarks reduce reconsideration without
      governing it*, itself on #242's and #101's, with "per source" made "per role and source",
      and the other edits proposal decision 6 lists, every scenario of #173's copy with the seat
      case added to the slot scenario, and this change's own scenarios
- [ ] 1.7 Before archive, compare this block with the archived text of #242's and #173's copies,
      and carry any change either made to its copy after 2026-11-13
- [x] 1.8 *A role's watermark is its own* states what identifies a mark, the first run of a role
      and source with no mark, and that a cycle changes no other role's mark and keeps one no
      configured role and source resolves to

## 2. Documentation

- [x] 2.1 `docs/architecture.md` §5.0.2 says what holds once this merges: each role keeps its own
      mark for a source, so one role's lane rejection leaves an item fresh to another (`b08becd`)

## 3. The key

- [ ] 3.1 `sourceKey` takes the role's name and carries it in the key, so `discovery.json` holds
      one mark per role and source
- [ ] 3.2 `discoverSource` and `discover` take the role's name and pass it through; `planCycle`
      already holds `role.name`
- [ ] 3.3 Nothing prunes an entry the running role's sources do not resolve to: `advance` keeps every stored mark rather than rebuilding from the
      running role's sources
- [ ] 3.4 The watermark block left alone — it maps `result.key` to a watermark and does not read
      what the key is made of (`src/loop.ts:1200-1222`)

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
- [ ] 4.6 A restarted process continues the mark it wrote before the restart, and a role whose
      model calls move to another seat, the subscription that pays for them, keeps its marks
- [ ] 4.7 The existing key tests in `test/discovery.test.ts` updated rather than deleted: stable
      across runs, independent of declaration order, and different for a different query — each
      now also different for a different role
- [ ] 4.8 A destination whose stored marks predate the role key: each role and source is a first
      run bounded by the look-back window, and the record it writes shows a cold start
- [ ] 4.9 A renamed role is a first run for that role, and every other role's marks on those
      sources are unchanged
- [ ] 4.10 Each test in this section names the scenario it checks with
      `@scenario work-discovery: <Scenario name>`, as `AGENTS.md` requires
- [ ] 4.11 A role's cycle that acted, whose lane rejects an item, advances that role's mark past
      the item, as past one triage skipped (*An item a role's lane skipped is passed*)
- [ ] 4.12 A cycle that decides to work three items with three free worker slots but a seat for
      only two claims two, and the next cycle reconsiders the third (*An item left for want of a
      slot or seat is seen again*)
