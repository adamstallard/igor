## 1. Being addressed

- [ ] 1.1 A `mentions:` source, so a mention reaches triage through the existing machinery
- [ ] 1.2 Carry provenance on a candidate: requested by whom, and their words, truncated the
      way a stop receipt is
- [ ] 1.2a Fetch the mentioning comment for each mention. `dropStopped` fetches only comments
      within the stop window, and stops once it has kept enough candidates, so the comments a
      cycle already holds may not include the mentioning comment; reuse them only where they do
- [ ] 1.2b Check the mention's author's write access in the mentions source, before it hands
      the item on, so a stranger's mention never brings an item to triage
- [ ] 1.2c Every answer ends with a reply from the role's bot account linking the mention. Skip a
      mention that has such a reply or a held claim for its answer; where only an issue links it,
      post the reply with the issue's link
- [ ] 1.2d Read a comment that is a stop or a go-ahead under `work-claiming` as that, never as a
      request
- [ ] 1.2e Search only the repositories the role's `sources` name, and read a mention in an
      item's body with the item's author as requester
- [ ] 1.2f Hold back answers on a stopped item until it is eligible again, without losing the
      mention
- [ ] 1.2g When no process of the role is available for a mention, reply with when the role's seats
      (its model subscriptions) reset, only if that mention has no such reply yet; that reply
      does not answer the mention
- [ ] 1.3 Requests are their own source and are considered first
- [ ] 1.4 Tests: mentioned outside the query reaches triage; a stranger's mention outside it
      does not; a request is screened like any other candidate; an answered mention is not
      answered again; "@<igor> stop" stops

## 2. Authority

- [ ] 2.1 Read write access from `user.permissions.push`, never from the coarse `permission`
      string — it reports `admin` for an admin and `write` for a maintainer, so a string
      comparison excludes the people with the most authority
- [ ] 2.2 Cache per requester for the cycle, so one person asking twice costs one request
- [ ] 2.3 A mention without write access is no signal: no reply, no checkout, no worker run,
      and the item unaffected either way
- [ ] 2.4 Treat a failed permission read as no write access
- [ ] 2.5 Tests for each, including that an item a stranger mentioned is still eligible on its
      own merits, that an organization member without write access is a stranger, and that a
      failed read grants nothing
- [ ] 2.6 Measure that a custom repository role resolves to the `permissions` booleans: give a
      test account a custom role on a repository and read the collaborator permission endpoint.
      If it does not, *Authority is `permissions.push`* in `design.md` is wrong; record what the
      endpoint returned there and stop before building 2.1
- [ ] 2.7 Ignore a mention from a bot account (on GitHub, a login ending in `[bot]`), whatever
      its permission read says
- [ ] 2.8 Before a requested action the requester's write access does not settle, read whether
      the requester could take it directly, and decline if not. No action a mention can ask for
      today is such a case; build the seam and test it with a fake rule
- [ ] 2.9 Measure, for information, how an Igor App's bot account installed with Contents write
      reads on the collaborator permission endpoint, and record it in `design.md`; 2.7 does not
      depend on it
- [ ] 2.10 Tests: a bot's mention is ignored even with `push: true`; an action a rule forbids
      the requester is declined
- [ ] 2.11 Establish whether the GitHub adapter reports an Igor's own open pull request, returned
      by the mentions source, as an item with work in flight. The in-flight exception lets a
      writer's mention through on that pull request only if it reads as in flight; otherwise
      the exception is not needed there. Record it in `design.md`

## 3. What a mention may get

- [ ] 3.1 A mention gets work done only on an open artifact the Igor authored, or an open issue
      with no work in flight that no other party holds or is assigned; elsewhere it gets an
      answer only. A role without `comment` neither answers nor acts
- [ ] 3.2 An answer-only mention passes triage's skips of held items, items with work in flight
      and closed items, and nothing else changes
- [ ] 3.3 For an answer only, the worker is told it may not publish and that its answer should
      carry the change; reply on the item with no claim, no settle interval and no marker
- [ ] 3.4 An answer that opens an issue or acts on a chosen option takes a claim on the item
      first
- [ ] 3.5 Pass a mention's and a reply's text to the worker delimited as untrusted content
- [ ] 3.6 Tests: the holder keeps the item; a mention on a person's pull request gets an answer
      only; a mention cannot widen permissions; an answer that acts claims first; a mention's
      text is delimited; the answer contains the change rather than describing it

## 4. Asking rather than guessing

- [ ] 4.1 An item that cannot be acted on as written produces a question, not a guess
- [ ] 4.2 Confirm the deferral record already holds it until something lifts it, as `work-triage`
      says in the version in force when this is built, and test that it does rather than assuming it

## 5. Budget

- [ ] 5.0 Mark each run that answered a mention in the execution log, and hold the mentions
      source's watermark back before a mention left unanswered because the share was spent
- [ ] 5.1 A `conversation_share` key in the role file, merged monotonically: the fraction of
      the role's budget, what its `budget_share` lets it spend from its seats in their current
      window, that answering mentions may spend
- [ ] 5.2 Conversation stops before work does when the fraction is spent
- [ ] 5.3 Test that a fourth question on one item is answered, budget permitting

## 6. The record

- [ ] 6.1 The run's entry in the execution log carries the requester and their words for a
      requested item
- [ ] 6.2 Test that discovered items are unchanged

## 7. Documentation

- [ ] 7.1 `README.md`: how to ask an Igor for something, and who it listens to
- [ ] 7.2 Record in `docs/architecture.md` that a runaway exchange is the venue's to moderate,
      and that GitHub is the weakest surface for it — an Igor holds write access, so locking a
      conversation does not reach it

## 8. Filing an issue, and answering an Igor's own question

- [ ] 8.1 A new role action, `issue`, for opening an issue, added to `ACTIONS` in `src/role.ts`
      and granted nowhere by default
- [ ] 8.2 Asked by someone with write access where a mention may get work done, claim the item,
      look for an issue that already links the mention, and file one only if none does: in the
      claiming tracker (on GitHub, the item's repository), naming what was asked, where, and by
      whom. Neutralize every copied `@` on its own, such as `&#64;`, since a code span around the
      quote ends at a backtick or blank line. Do not work the issue
- [ ] 8.3 Decline where the role does not grant the action, and do nothing for a requester
      without write access
- [ ] 8.4 Where an Igor posts numbered questions with lettered options, write the questions and
      options to the execution log on the state branch when it posts them
- [ ] 8.5 Act on a reply that mentions the asking Igor and names a recorded option, such as
      `2b`, matched against that record and never against the artifact's text
- [ ] 8.6 A reply naming a question or option that was not recorded has no effect — including one
      edited into the description
- [ ] 8.7 A reply mentioning a different Igor gets that Igor's answer only
- [ ] 8.7a Measure against live GitHub that a copied `@` written as `&#64;` notifies nobody
- [ ] 8.8 Tests for each, including an edited-in question, a reply from someone without write
      access, a second request for the same issue, a copied `@`, and a filed issue that a
      role's query finds
- [ ] 8.9 Before building the mentions source, measure with a real Igor App how a comment
      addressed to it can be found: whether `@<app-slug>` is searchable or notifies the App.
      `mentions:<slug>[bot]` returned nothing for two Apps on 2026-10-04 (`design.md`, Open)

## 9. Archiving

- [ ] 9.1 Before archiving, carry into this change's copies the text added by changes that
      archived before it: `role-config`'s *Merge semantics differ by field kind* and *A role
      declares its sources, lane, behaviour, permissions, and reviewers* (from
      `lore-from-corrections`, #143, #153 and #216), and `work-triage`'s *An item held by another
      party is never a candidate* (from #179) and *Items with work already in flight are skipped*
      (from #179 and #150). Check every sentence and key, not only scenarios:
      a dry archive refuses a dropped scenario but not dropped text. Compact each copy to stay
      under 500 characters
