## 1. Being addressed

- [ ] 1.1 A `mentions:` source, so a mention reaches triage through the existing machinery
- [ ] 1.2 Carry provenance on a candidate: requested by whom, and their words, truncated the
      way a stop receipt is
- [ ] 1.2a Read the mention from the comments the cycle already fetched rather than fetching
      again — `dropStopped` pulls them for every survivor — and fall back to a fetch only when
      the mention predates that window
- [ ] 1.3 Requests are their own source and are considered first
- [ ] 1.4 Tests: mentioned outside the query reaches triage; a request is screened like any
      other candidate

## 2. Authority

- [ ] 2.1 Read write access from `user.permissions.push`, never from the coarse `permission`
      string — it reports `admin` for an admin and `write` for a maintainer, so a string
      comparison excludes the people with the most authority
- [ ] 2.2 Cache per requester for the cycle, so one person asking twice costs one request
- [ ] 2.3 A mention without write access is no signal: no reply, no checkout, no worker run,
      and the item unaffected either way
- [ ] 2.4 Tests for each, including that an item a stranger mentioned is still eligible on its
      own merits

## 3. Read-only replies

- [ ] 3.1 A mention narrows the action space to what may be said and claims nothing
- [ ] 3.2 The worker is told it may not publish and that its answer should carry the change
- [ ] 3.3 Reply on the item; no assignment, no settle interval, no marker
- [ ] 3.4 Tests: the holder keeps the item; a mention cannot widen permissions; the answer
      contains the change rather than describing it

## 4. Asking rather than guessing

- [ ] 4.1 An item that cannot be acted on as written produces a question, not a guess
- [ ] 4.2 Confirm the deferral record already holds it until someone replies, and test that it
      does rather than assuming it

## 5. Budget

- [ ] 5.1 A declared fraction of cycle budget for conversation
- [ ] 5.2 Conversation stops before work does when the fraction is spent
- [ ] 5.3 Test that a fourth question on one item is answered, budget permitting

## 6. The record

- [ ] 6.1 The decision record carries the requester and their words for a requested item
- [ ] 6.2 Test that discovered items are unchanged

## 7. Documentation

- [ ] 7.1 `README.md`: how to ask an Igor for something, and who it listens to
- [ ] 7.2 Record in `docs/architecture.md` that a runaway exchange is the venue's to moderate,
      and that GitHub is the weakest surface for it — an Igor holds write access, so locking a
      conversation does not reach it
