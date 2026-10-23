**In short:** a scribe is an Igor whose role is to watch a discussion and keep the team's
record of what it decided. People brainstorm and decide together in a shared channel or
document. The scribe takes notes, writes each decision into the repository, and files the work
a decision calls for once a person with authority confirms it. Tracked in #201.

This change is gate one: the specification, reviewed alone before any code is written. Gate
two is the implementation, on the same branch. The change is provisional. Decisions 1 to 9 are
Adam's, as the project's owner (2026-10-16). Decision 5 names the team's lore repository
because Adam answered that question on 2026-10-19. Decisions 10 to 23 follow from them and are for the reviewer to confirm. The
questions under *Still open* need answers before gate two builds anything.

## Decisions

1. **Agents serve a shared process of deciding, not each person privately.** People decide
   together in a shared discussion, and agents take part there as note-takers and dispatchers.
   People keep personal agents for private thinking, and post what those agents produce to the
   discussion as proposals. The scribe folds those proposals into the record, so every
   personal agent's work reaches one shared record through the scribe.
   *Rejected:* "my agent talks to your agent", where each person's agent negotiates with the
   others' in a chat or tracker tool. Each agent carries one person's partial view, so context
   fragments. Decisions are buried in agent-to-agent traffic nobody reads. Reasoning is
   repeated, responsibility blurs, and agents instruct each other with nobody reviewing it.
   *Also rejected:* deciding in private notes, which leaves the team nothing to read.
2. **The scribe watches a discussion within a budget.** It summarises at intervals or when
   asked, never in response to each message: the open `directed-interaction` change warns that
   an Igor replying to every message in a busy thread drains its budget.
3. **The record lives in the repository, never only in chat replies.** A summary the scribe
   posts in the discussion links the record it updated.
   *Rejected:* summaries in chat alone. They scroll away, and a later reader cannot tell which
   one is current.
4. **A discussion's record is an index plus one MADR per decision, and a decision that changes
   required behaviour is also dispatched as an OpenSpec change.**
   - The **index** is one living file per discussion, also pinned in the discussion. It lists
     what was decided, each item linking its MADR; the open questions, each with an owner; and
     what was dispatched.
   - A **MADR** (Markdown Architectural Decision Record), such as
     `docs/decisions/NNNN-title.md`, records one decision. Its status is `proposed` when
     drafted, `accepted` once a person with authority approves it, or `superseded by NNNN`.
     It holds the context, the options considered including any rejected alternative, the
     outcome, the consequences, and links to the discussion and to what was dispatched.
   - An **OpenSpec change** dispatched from a decision cites the MADR in its Decisions section
     instead of repeating it.

   *Rejected:* OpenSpec changes alone, which record only decisions that change required
   behaviour and lose the rest. *Also rejected:* MADRs alone, which nothing validates and no
   implementer builds from. `design.md` gives the reasoning for each layer.
5. **Records live in the repository the decision concerns.** A decision that spans
   repositories goes in the team's lore repository. `docs/architecture.md` §6.7 makes that
   repository the home of everything specific to the team, so the scribe has one place to look,
   and so does the inquisitor (#211): an Igor that asks the team the questions it must decide,
   and searches the scribe's record before asking. A team that works in private repositories
   keeps its lore repository private. Igor refuses to start with a public lore repository when
   a role's repository is private (#212).
6. **The scribe dispatches only with approval.** It suggests issues and OpenSpec changes, and
   files one only after a person with authority confirms it. Authority follows
   `directed-interaction`: an instruction counts only from a person with write access to the
   repository it would change, here the repository the issue or change concerns (decision 16).
7. **The scribe answers from the written record**, such as "we decided X in #123, because Y", citing the
   records and lore, the store of lessons every Igor reads.
8. **The scribe stays neutral.** It represents the team, records each argument with who made
   it, and never argues a position.
9. **Decisions feed lore.** An accepted decision and its reasons become a lore candidate, which
   reaches the store only through `lore-review`: a person reviews and merges it, as with every
   other candidate.

**Following from those, for the reviewer to confirm:**

10. **A summary is the scribe's own work, not a reply.** `directed-interaction`'s scenario *A
    stranger's mention changes nothing* and its rule that a mention narrows what an Igor may do
    govern the scribe's answers, not the summaries its role posts on a schedule. *Rejected:*
    summaries only when asked, which would drop the intervals of decision 2.
11. **Each discussion has a home repository, configured on the role, which holds its index and
    decides who has authority in the discussion.** A person on Discord, Slack or Linear has
    authority only through a configured mapping to a code-host account, as #160 decided for
    Discord.
12. **The scribe does not claim an issue it files.** The issue reaches the role that works it
    through discovery, as an issue filed on request does under pull request #140. This differs
    from `work-claiming`'s Discord scenario, where the Igor asked for the work claims the issue
    it opens: the scribe files work for others.
13. **A discussion is private unless its role declares it public, and a private discussion's
    record is never written to a public repository.** Work filed in a public repository from a
    private discussion links the discussion and quotes nothing from it. In a public discussion
    the scribe answers and summarises only from public records and a public lore store. Text
    from the discussion renders as text and notifies nobody, wherever the scribe writes it: a
    record, a summary, a filed issue or a pull request body. *Rejected:* relying on
    `lore-review`'s guard, which checks only repositories cited, so a private chat reaches a
    public repository through a MADR before any lore is proposed.
14. **A lore candidate's author is the first person who approved the MADR, in one provenance
    item citing it.** `lore-review` routes a candidate to its author, and an approver can
    confirm what was meant. One item means one decision counts as support once, however many
    approved it. *Rejected:* everyone who argued, which would ask people to vouch for an
    outcome they may have argued against. *Also rejected:* one item per approver, which would
    count one decision as support several times. The scribe proposes only where its role grants
    the action that proposes lore.
15. **A request for a summary moves the next scheduled summary earlier, and changes nothing
    else.** The summary is the role's own scheduled work, so a mention asking for it widens
    nothing, as `directed-interaction` requires of a mention. *Rejected:* answering a request
    with a summary that does not update the index, which would link an index that is out of
    date, against decision 3.
16. **Confirming filed work takes authority over the repository the work concerns, whichever
    tracker the issue is filed on.** Where it concerns no repository, authority is read on the
    discussion's home repository. The claiming tracker, where an organization's Igors take their
    claims (`work-claiming`), may be Linear, and an issue filed there lives in no repository,
    so the repository has to come from the work. *Rejected:* membership of the
    Linear team, which `directed-interaction` rejects for organizations as too coarse.
17. **The scribe works on no tracker item, so `work-claiming`'s claim-before-work rule does not
    govern its records or what it files.** That rule governs pickups of tracker items, and the
    scribe picks up none. *Rejected:* a `work-claiming` delta exempting the scribe, which would
    carve one role out of a rule `work-claiming` declares not configurable.
18. **Anyone in the discussion can stop the scribe there,** with no authority, as anyone can
    stop an Igor on an item under `work-claiming`. A stop cannot be posted on the claiming
    tracker, because the scribe holds no claim there.
19. **Only a person with authority can lift that stop early, with a go-ahead.** Otherwise the
    scribe resumes after the role's cooldown. In a channel, anyone could undo a stranger's stop
    the moment it was posted, and `work-claiming` itself holds that lifting a stop by mistake
    costs more than leaving one in place. *Rejected:* a go-ahead from anyone, as
    `work-claiming` allows on a tracker item, where only people who can comment on the item
    can post one.
20. **A post marked as a personal agent's output never approves a MADR or confirms a
    dispatch.** *Rejected:* letting it approve, which would put one person's agent in the
    place of the person (`design.md`).
21. **A reversal leaves the earlier MADR `accepted` until the reversal is accepted.** A reader
    who lands on the old decision is never sent to a reversal nobody approved.
22. **A summary names the messages it could not read,** and where the scribe cannot tell
    whether content was withheld, says that some may be missing. It never claims every message
    was read.
23. **Approving a MADR takes authority over the repository holding it,** not over the
    discussion's home repository, because the MADR is a file in that repository.

**Still open:**

- **Which surface comes first:** Discord, Slack, or Linear documents and comments. Discord
  already has an adapter issue (#160); Slack and Linear have none.
- **Whether a discussion is a new surface role.** `surface-adapter` defines two surface roles,
  tracker and code host. `work-claiming` and `docs/architecture.md` also describe Discord as a
  surface that directs work but holds no claim, which neither of those roles covers. A
  discussion may be that directing role, made explicit, or a separate one. This change leaves
  `surface-adapter` unchanged until that is decided. The answer covers more than the scribe:
  the inquisitor (#211), an Igor that asks the team the questions it must decide, and searches
  the scribe's record before asking, works in the same discussions.
- **How the index file is stored and named, and how records are written.** A record could
  reach the repository by pull request, as lore does, or by direct commit. No action in a
  role's closed `allow` list commits to a default branch, so a direct commit needs a new one.
  By pull request, a decision is approved twice, in the discussion and at merge, and which of
  the two makes a MADR `accepted` is part of this question.
- **Which `allow` actions write a record, post in a discussion, pin and propose lore.** None
  of `role-config`'s closed set names them. The set includes `send`, but `role-config` does not
  say what it sends, so it cannot be assumed to post in a discussion. Until they are named,
  a scenario that says which action the role lacks has nothing to name.
- **How a person's approval is recognised on each surface.** On GitHub, pull request #140
  matches a reply against options an Igor recorded, but only on an artifact the Igor authored,
  and a discussion is not one. #160's mapping says who a Discord user is, not how they approve.
  Slack and Linear have neither.
- **How often the scribe summarises, and what budget it draws on.** `directed-interaction`
  charges talking to a fraction of cycle budget, and `seat-budget` bounds a role by
  `budget_share`. Which of them a summary draws on is undecided. A third option, which Adam
  has not decided: a seat holding an API key paid by the monthly API credits of a Claude Max
  plan, capped by the Claude Console's spend limit. A busy channel then cannot drain the
  subscription seat the team's coding work draws on, and when the credits run out the
  scribe's calls stop until the next month.
- **How a post from a personal agent is marked as a proposal.** Until it is, the spec treats
  an unmarked post as the person's own.
- **Whose posts go into the record.** Anyone who can post in a channel can put an argument into
  a repository file, including someone with no authority.
- **Through what action the scribe proposes a lore candidate.** `lore-from-corrections`
  defines `propose-lore` for corrections, and proposes one when it recurs or contradicts what
  the store already says. The scribe proposes from one accepted decision that states a rule
  for future work, so that action needs extending, or the scribe needs its own.
- **What keeps two scribe processes from colliding.** `role-config` makes processes running one
  role interchangeable, and `concurrent-instances` coordinates them through claims, which the
  scribe never takes. Two processes could number two MADRs alike, or post the same scheduled
  summary twice. Once the mechanism is chosen, a TLA+ model beside this spec checks it.
- **How a role names the discussion it watches.** In `role-config`, a `sources` entry names a
  tracker and carries its query; a channel or a document is neither.
- **What the first surface can do, measured.** Whether Discord gives a bot the content of
  messages that do not mention it, which needs its Message Content intent (#160); whether a
  Linear document can be read incrementally, from the last position handled, and whether Linear can pin; and whether a mention
  of an Igor App on GitHub can be found at all (pull request #140, task 8.9). And on each
  surface, whether a message whose content was withheld can be told from an empty one.

## Why

In most teams using agents, collaboration runs as "my agent talks to your agent". Igor already
moves *acting* into the open: Igors take work from the team's tracker and put claims, handoffs
and pull requests where everyone can see them. *Deciding* was still done privately: before this
change, both `README.md` and `docs/architecture.md` §0 told each person to brainstorm and decide with their
own AI. A scribe gives a shared discussion what a private agent gave one person: notes, a
memory of what was decided, and someone to file the follow-up work.

## What Changes

- A new capability, `discussion-scribe`: what the scribe watches, when it summarises, the
  record it keeps and where, how it dispatches, how it answers, and how it feeds lore.
- No in-force spec changes. Whether `surface-adapter` gains a discussion role is open.
- `README.md` and `docs/architecture.md` §0 no longer tell each person to decide with their own
  AI. Each says deciding happens in a shared discussion, and that the scribe keeps its record.

## Capabilities

### New Capabilities

- `discussion-scribe`: watching a discussion within a budget; a record per discussion, held in
  repositories as an index and one MADR per decision; keeping a private discussion out of a
  public repository; filing issues and OpenSpec changes only on confirmation; answering from
  the record; neutrality; and lore candidates from accepted decisions.

### Modified Capabilities

None.

## Dependencies

- **`directed-interaction`** (open change, extended by pull request #140) supplies the
  authority rule, the mentions source through which a person asks the scribe something, and
  filing an issue without claiming it.
- **`lore-from-corrections`** (open change) adds `propose-lore`, the role action that lets an
  Igor submit a lore candidate for review. It covers corrections only today.
- **#160** builds the Discord adapter, if Discord comes first, and defines the mapping from a
  Discord account to a code-host login that this change extends to each surface.
- **Pull request #153** (`signed-publishing`) requires every post a model writes, for a role
  that lists the prose skill, to carry a valid prose footer, and sets rules for every commit
  Igor pushes. Once it lands, the scribe's summaries, filed issues and record commits must meet
  them.

`directed-interaction` states in its proposal that an Igor replies only when addressed, but no
requirement there states it. This change cites the requirements that do exist: *A mention
narrows what an Igor may do and claims nothing*, and the scenario *A stranger's mention changes
nothing*.

## Impact

- The scribe writes records into the team's repositories. Other Igors write code, specs or
  lore, so a decision record is a new kind of artifact for a person to review.
- A team gains a decision log in each repository the scribe records for. A reader learns why
  something was decided by reading a file, not by searching chat.
