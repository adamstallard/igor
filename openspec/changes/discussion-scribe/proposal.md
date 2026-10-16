**In short:** a scribe is an Igor whose role is to watch a discussion and keep the team's
record of what it decided. People brainstorm and decide together in a shared channel or
document. The scribe takes notes, writes each decision into the repository, and files the work
a decision calls for once a person with authority confirms it. Tracked in #201.

This change is gate one: the specification, reviewed alone before any code is written. Gate
two is the implementation, on the same branch. The change is provisional. Decisions 1 to 9 are
Adam's (2026-10-16). Decisions 10 to 14 follow from them and are for the reviewer to confirm.
The questions under *Still open* need answers before gate two builds anything.

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
   repositories goes in a shared specs repository.
6. **The scribe dispatches only with approval.** It suggests issues and OpenSpec changes, and
   files one only after a person with authority confirms it. Authority follows
   `directed-interaction`: an instruction counts only from a person with write access to the
   repository it would change, here the repository the issue or change would land in.
7. **The scribe answers from the written record**, such as "we decided X in #123, because Y", citing the
   records and lore, the store of lessons every Igor reads.
8. **The scribe stays neutral.** It represents the team, records each argument with who made
   it, and never argues a position.
9. **Decisions feed lore.** An accepted decision and its reasons become a lore candidate, which
   reaches the store only through `lore-review`: a person reviews and merges it, as with every
   other candidate.

**Following from those, for the reviewer to confirm:**

10. **A summary is the scribe's own work, not a reply.** `directed-interaction` has an Igor
    reply only when addressed; that governs the scribe's answers, not the summaries its role
    posts on a schedule. *Rejected:* summaries only when asked, which would drop the intervals
    of decision 2.
11. **Each discussion has a home repository, configured on the role, which holds its index and
    decides who has authority in the discussion.** A person on Discord, Slack or Linear has
    authority only through a configured mapping to a code-host account, as #160 decided for
    Discord.
12. **The scribe does not claim an issue it files.** The issue reaches the role that works it
    through discovery, as an issue filed on request does under pull request #140. This differs
    from `work-claiming`'s Discord scenario, where the Igor asked for the work claims the issue
    it opens: the scribe files work for others.
13. **A discussion is private unless its role declares it public, and a private discussion's
    record is never written to a public repository.** Text from the discussion is written into
    a record so it renders as text and notifies nobody. *Rejected:* relying on `lore-review`'s
    guard, which checks only repositories cited, so a private chat reaches a public repository
    through a MADR before any lore is proposed.
14. **A lore candidate's authors are the people who approved the MADR.** `lore-review` routes a
    candidate to its authors, and the approvers are the people who can confirm what was meant.
    *Rejected:* everyone who argued, which would ask people to vouch for an outcome they may
    have argued against.

**Still open:**

- **Which surface comes first:** Discord, Slack, or Linear documents and comments. Discord
  already has an adapter issue (#160); Slack and Linear have none.
- **Whether a discussion is a new surface role.** `surface-adapter` defines two surface roles,
  tracker and code host. `work-claiming` and `docs/architecture.md` also describe Discord as a
  surface that directs work but holds no claim, which neither of those roles covers. A
  discussion may be that directing role, made explicit, or a separate one. This change leaves
  `surface-adapter` unchanged until that is decided.
- **How the index file is stored and named, and how records are written.** A record could
  reach the repository by pull request, as lore does, or by direct commit. No action in a
  role's closed `allow` list commits to a default branch, so a direct commit needs a new one.
- **How a person's approval is recognised on each surface.** On GitHub, pull request #140
  matches a reply against options an Igor recorded, but only on an artifact the Igor authored,
  and a discussion is not one. #160's mapping says who a Discord user is, not how they approve.
  Slack and Linear have neither.
- **How often the scribe summarises, and what budget it draws on.** `directed-interaction`
  charges talking to a fraction of cycle budget, and `seat-budget` bounds a role by
  `budget_share`. Which of them a summary draws on is undecided.
- **How a post from a personal agent is marked as a proposal.** Until it is, the spec treats
  an unmarked post as the person's own.
- **Whose posts go into the record.** Anyone who can post in a channel can put an argument into
  a repository file, including someone with no authority.
- **Through what action the scribe proposes a lore candidate.** `lore-from-corrections`
  defines `propose-lore` for corrections only, and proposes only when a correction recurs. The
  scribe proposes from one accepted decision that states a rule for future work, so that action
  needs extending, or the scribe needs its own.
- **Which repository is the shared specs repository.** None is named yet.
- **How a role names the discussion it watches.** In `role-config`, a `sources` entry names a
  tracker and carries its query; a channel or a document is neither.
- **What the first surface can do, measured.** Whether Discord gives a bot the content of
  messages that do not mention it, which needs its Message Content intent (#160); whether a
  Linear document can be read incrementally, from the last position handled, and whether Linear can pin; and whether a mention
  of an Igor App on GitHub can be found at all (pull request #140, task 8.9).

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
  AI. Each says deciding happens in a shared discussion, and that the scribe is not built and
  its design is this change.

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
- **#160** builds the Discord adapter, if Discord comes first.

## Impact

- The scribe writes records into the team's repositories. Other Igors write code, specs or
  lore, so a decision record is a new kind of artifact for a person to review.
- A team gains a decision log in each repository the scribe records for. A reader learns why
  something was decided by reading a file, not by searching chat.
