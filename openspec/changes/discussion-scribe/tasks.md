## 0. Measure, and answer the open questions, before gate two

- [ ] 0.1 Choose the first surface: Discord, Slack, or Linear documents and comments
- [ ] 0.2 Decide whether a discussion is the role Discord already plays as a surface that
      directs work, or a third surface role beside `surface-adapter`'s tracker and code host.
      If a third, amend `surface-adapter`. Decide it for
      the inquisitor (#211) too, which works in the same discussions
- [ ] 0.3 Decide how the index file is stored and named, and whether records are written by
      pull request or by direct commit, which needs a new role action. If by pull request,
      decide whether approval in the discussion or the merge makes a MADR `accepted`
- [ ] 0.4 Decide how a person's approval is recognised on the first surface, building on pull
      request #140's matched answers and #160's mapping from a Discord user id to a GitHub login
- [ ] 0.5 Decide how often the scribe summarises, and whether summaries draw on
      `directed-interaction`'s fraction of cycle budget, on the role's `budget_share`, or on a
      seat paid by a Max plan's API credits
- [ ] 0.6 Decide how a personal agent's post is marked as a proposal
- [ ] 0.7 Decide whose posts go into the record
- [ ] 0.8 Decide through what action the scribe proposes a lore candidate, since
      `lore-from-corrections` defines `propose-lore` for a correction that recurs or contradicts
      the store
- [x] 0.9 Name the repository for decisions that span repositories: the team's lore
      repository, per `docs/architecture.md` §6.7 (decision 5)
- [ ] 0.9a Name the `allow` actions that write a record, post in a discussion, pin and propose
      lore, since `role-config`'s closed set names none of them
- [ ] 0.9b Decide what keeps two processes of the scribe role from numbering two MADRs alike or
      posting one scheduled summary twice, and check it with a TLA+ model beside this spec
- [ ] 0.10 Decide how a role names the discussion it watches, and its home repository, since a
      `sources` entry names a tracker
- [ ] 0.11 Measure on Discord whether a bot reads the content of messages that do not mention
      it, what its Message Content intent changes, and whether a withheld message can be told
      from an empty one
- [ ] 0.12 If Linear comes first, measure whether a document can be read incrementally, from
      the last position handled, and whether anything can be pinned
- [ ] 0.13 Before building anything that reads mentions on GitHub, take pull request #140's
      answer to its task 8.9, whether a mention of an Igor App can be found at all, and amend
      this change to match
- [ ] 0.14 Record each answer in `proposal.md` under Decisions, and amend the spec to match

## 1. A discussion surface

- [ ] 1.1 Read a discussion's messages after the last one handled, post a summary, and pin a
      message, on the first surface
- [ ] 1.2 Map a surface account to a code-host login from configuration; no mapping, no
      authority
- [ ] 1.3 Tests: an unmapped person has no authority

## 2. Watching and summarising

- [ ] 2.1 Summarise at the chosen interval, and bring the next summary forward when a person
      with authority asks
- [ ] 2.2 Post nothing about a message that does not address the scribe
- [ ] 2.3 Draw on the declared budget, and stop when it is spent
- [ ] 2.4 Name the messages whose content the surface withheld, and say content may be missing
      where that cannot be told
- [ ] 2.4a Stop on a stop posted in the discussion, from anyone, and resume after the cooldown
      or on a go-ahead from a person with authority
- [ ] 2.5 Tests: a busy discussion gets one summary; a request without authority gets none; a
      spent budget summarises nothing

## 3. The record

- [ ] 3.1 Keep one index per discussion as a file in its home repository, pin a link to it
      where the surface allows, and link it from every summary
- [ ] 3.2 Write one MADR per decision as `proposed`, with context, options, the rejected
      alternative, outcome, consequences and links, in the repository the decision concerns or
      the team's lore repository
- [ ] 3.3 Mark a MADR `accepted` only on approval by a person with authority over its
      repository, and record who approved
- [ ] 3.4 Supersede an accepted MADR once its reversal is accepted, and point the old one at it
- [ ] 3.5 Refuse to write a record from a discussion not declared public into a public
      repository, and say so in the discussion
- [ ] 3.6 Write discussion text so mentions do not notify and markup renders as text, in
      records, summaries, filed issues and pull request bodies
- [ ] 3.6a In a public discussion, answer and summarise only from public records and a public
      lore store; file work into a public repository from a private discussion with a link and
      no quotes
- [ ] 3.7 Write records, post and pin only through actions the role grants
- [ ] 3.8 Recognise the marking chosen in 0.6 on a personal agent's post, and record such a post
      as a proposal that cannot approve
- [ ] 3.9 Tests for each, including approval from someone without authority, approval from a
      marked personal agent's post, and an unmarked post counting as its person's

## 4. Dispatching

- [ ] 4.1 Suggest each issue or OpenSpec change in the discussion before filing it
- [ ] 4.2 File only after a person with authority over the repository the work concerns
      confirms, and only with an action the role grants
- [ ] 4.3 File an issue without claiming it, linking the discussion, after checking for an
      issue that already links it
- [ ] 4.4 Open a confirmed OpenSpec change whose Decisions section cites the MADR
- [ ] 4.5 Add each dispatch to the index and the MADR
- [ ] 4.6 Tests: an issue from a discussion is filed on the organization's claiming tracker
      (`work-claiming`); unconfirmed work is not filed; confirmation cannot widen the role

## 5. Answering, neutrality and lore

- [ ] 5.1 Answer from MADRs, indexes and lore, linking what is cited, and say so when nothing
      was recorded
- [ ] 5.2 Record each argument under the person who made it, and never recommend an option
- [ ] 5.3 Propose a lore candidate from an accepted MADR that states a rule for future work,
      where the role grants the action, as one provenance item citing the MADR and authored by
      its first approver
- [ ] 5.4 Tests for each

## 6. Documentation

- [x] 6.1 `README.md`: the paragraph about deciding together says the scribe keeps the record
- [ ] 6.1a `README.md`: say how to point the scribe at a discussion, once task 0.10 decides it
- [x] 6.2 `docs/architecture.md` §0: say the scribe keeps the record
- [ ] 6.3 `docs/architecture.md` §5.1: if a discussion becomes a surface role (task 0.2), add
      it beside tracker and code host
