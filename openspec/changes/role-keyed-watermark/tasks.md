## 1. Spec

- [x] 1.1 One modified `work-discovery` requirement, *Watermarks reduce reconsideration without
      governing it*: a watermark records how far one role has considered a source, keyed by role
      as well as source (#104)
- [x] 1.2 Modified rather than added beside it (Adam, 2026-10-11): the block carries the in-force
      text, since `MODIFIED` replaces the whole body on archive. `condition-backoff` (#101) also
      modifies the requirement, which task 1.6 settles
- [x] 1.3 The three consequences settled in the requirement rather than left to the code: every
      source cold-starts once, the role is its name so a rename cold-starts, and an unresolvable
      mark is left in place
- [x] 1.4 Checked for a name collision against the nine in-force `work-discovery` requirements,
      `concurrent-instances`' two, `preview-persists-nothing`'s two, `structured-failure-record`'s
      two (PR #99), `triage-needs-a-seat`'s four (PR #70) and `guard-silent-reverts`' one (PR
      #103), plus every other requirement outside `openspec/changes/archive/`, on 2026-10-11.
      Since then #70 and #103 have merged, and #179's four added `work-discovery` requirements
      were checked on 2026-10-18; none shares this requirement's title
- [x] 1.5 Each rank of a role may keep its own mark per source, and discovery combines them by
      `concurrent-instances`' (#179) rule; no mark is kept per run (Adam, 2026-10-18)
- [ ] 1.6 At archive, after `condition-backoff` (#101) has archived: rewrite this change's block
      of *Watermarks reduce reconsideration without governing it* by hand to carry the rest of
      #101's text, its paragraphs on an item chosen and never taken and on a claim the tracker
      refused, with their scenarios. This change's wording survives: one mark per role, rank and
      source, never one per run, so #101's "one timestamp per source" becomes one per role, rank
      and source (Adam, 2026-10-18). #179 archives before this change and carries a `MODIFIED`
      block on the same requirement, adding a stand-down to the reasons a cycle does not take an
      item, and so holds its mark back: "or its process stood down for missed heartbeats (`work-claiming`'s *A retired rank
      does not hold its items forever*, #179)", with a scenario. The block rewritten here carries
      that reason and scenario too, as #179 left them
- [ ] 1.7 Archive after `concurrent-instances` (#179), whose *Processes saving one source keep the
      lower watermark* this change's requirement cites (Adam, 2026-10-18)

## 2. Documentation

- [x] 2.1 `docs/architecture.md` §5.0.2 says what holds once this merges: each role keeps its own
      mark for a source, so one role's lane rejection leaves an item fresh to another (`b08becd`)

## 3. The key

- [ ] 3.1 `sourceKey` takes the role's name and carries it in the key, so `discovery.json` holds
      one mark per role, rank and source; every process is rank 1 until #179's implementation
      lands. Once it has, `discovery.json` is a log of mark lines, each naming its role and rank,
      and #179's fold, the read that collapses those lines into one mark per role and source,
      keys its result by this key, which carries the role but not the rank (#179's task 5.11)
- [ ] 3.2 `discoverSource` and `discover` take the role's name and pass it through; `planCycle`
      already holds `role.name`
- [ ] 3.3 Nothing prunes an entry the running role's sources do not resolve to: `advance`, or
      #179's fold where #179's implementation has landed, keeps every stored mark rather than rebuilding from the
      running role's sources
- [ ] 3.4 The watermark block left alone — it maps `result.key` to a watermark and does not read
      what the key is made of (`src/loop.ts:1104-1119`)

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
- [ ] 4.8 Where #179's implementation has landed: two ranks of one role each save a mark for one
      source, neither write replaces the other's, and the process running a cycle reads one mark
      combined by #179's rule; a restarted rank continues its own rank's mark
