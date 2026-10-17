## Context

The proposal says what the scribe must do. This file explains the one part that has real
alternatives: why a decision is recorded in three layers, of which the middle one is a MADR
(Markdown Architectural Decision Record), one file per decision, and what each layer may and may not
hold. It also says how the scribe sits beside rules other changes have already set, and gives
the reasons the spec's requirements leave out.

## Decisions

### Three layers, each holding what only it can

A decision is recorded once, in its MADR. Everything else points at that MADR.

| Layer | Holds | Read by | Changes when |
|---|---|---|---|
| Index (one per discussion) | What was decided, what is open and who owns it, what was dispatched | Anyone joining the discussion | Any of those changes |
| MADR (one per decision) | Context, options, the rejected alternative, outcome, consequences | Anyone asking why | Its status changes |
| OpenSpec change | The required behaviour the decision changes | Reviewers and implementers | Through the OpenSpec workflow |

**The index is a table of contents, not a summary.** It names each decision in a line and
links its MADR, so it stays short enough to pin in a channel. Reasoning written into the index
would have to be kept in step with the MADR, and the two would drift. The index lives in the
discussion's home repository; a MADR lives in the repository its decision concerns, and the
index links it there.

**A MADR is the unit of decision.** One file per decision gives each decision a stable link,
which a lore candidate's provenance, an OpenSpec change and a later MADR can all cite. A
decision that reverses an earlier one is a new MADR, and once that is accepted, the earlier
one's status becomes `superseded by NNNN`. So a reader who lands on an old decision is sent to
the current one, and never to a reversal nobody approved.

**An OpenSpec change cites its MADR and does not restate it.** The change's Decisions section
is what a reviewer approves, so it names the decision and links the MADR for the discussion
behind it. Restating the MADR there would give one decision two texts. This repository already
keeps decisions in a change's proposal and design. The MADR adds what a change has no place
for: the discussion the decision came out of, and decisions that change no required
behaviour.

**Rejected: OpenSpec changes as the only record.** Most decisions a discussion reaches change
no required behaviour: an owner chosen, an option ruled out, a question deferred. A record
that keeps only spec changes loses them.

**Rejected: MADRs as the only record.** A MADR is prose that nothing validates. Required
behaviour has to reach a spec, which `openspec validate` checks and an implementer builds
from.

### Summaries are scheduled, not answers

A scribe that posted in response to every message would spend its budget on the busiest thread
and say least where a summary helps most. So it posts on a schedule, or when asked. A
scheduled summary is not a reply to anyone, which is why `directed-interaction`'s rule that an
Igor replies only when addressed does not forbid it. That rule still governs every answer the
scribe gives a person.

### Authority comes from `directed-interaction`, through a home repository

`directed-interaction` grants authority by write access to the repository holding the artifact,
read from the code host's permission record. A Discord, Slack or Linear account has no such
record, so the scribe maps the account to a code-host login first. Issue #160, which builds the Discord adapter, decided that mapping for
Discord: a config entry keyed by the Discord user id. Without a mapping a person has no
authority, which fails closed.

A question or a request for a summary concerns no repository of its own, so each discussion
has a home repository, and authority in the discussion is authority over it. Approving a MADR
or confirming a dispatch is checked against the repository that MADR or dispatch lands in.

**How an approval is expressed is open.** Pull request #140, which extends
`directed-interaction`, matches a reply against numbered options an Igor recorded when it asked,
and never reads them back from editable text. That is the closest precedent. But #140 accepts
such a reply only on a pull request the Igor authored, and treats a reply anywhere else as an
ordinary mention, which may only be answered. Whether a question the scribe posts in a channel
can count the same way is part of the open question.

### A personal agent's post is told apart only by its marking

`directed-interaction` separates instruction from data by who wrote it, not by what it says. A
post under an authorised person's account counts as theirs, whoever drafted it. So the scribe
can refuse an approval from a personal agent only when the post says it came from one. How it
says so is open. Until then the spec treats an unmarked post as the person's own, which keeps
the rule honest: it promises nothing it cannot see. Letting a marked post approve would put one
person's agent in the place of the person.

### Filing reuses `directed-interaction` and `work-claiming`

The scribe files an issue as pull request #140 files one: it opens the issue and does not claim
it, so the issue reaches other roles through discovery. Where the work came from chat,
`work-claiming`'s *An issue created from chat points back to the chat* applies: the issue links
the message, and the scribe looks for an issue that already links it before filing.

### A private discussion stays out of a public repository

A record quotes arguments and names who made them. Written into a public repository from a
private channel, that publishes the channel. `lore-review` refuses lore whose provenance cites a
private repository, but it checks only repositories, and the record reaches a public repository
before any lore is proposed. So the scribe treats a discussion as private unless its role
declares it public, and writes nothing from a private one into a public repository.

Text from a discussion is written as data. An `@`-mention copied into a summary, a pull request
body or a filed issue notifies the person named. `lore-review` forbids mentions in the pull
request bodies it writes for that reason. Raw HTML or an image link would render as the poster
chose, so a record could show content that reads as the repository's own, or load an image
from the poster's server.

### Neutral means recording, not judging

The scribe records each option with the arguments made for and against it, and who made each
argument. It does not add arguments of its own, rank the options, or recommend one. A summary
that recommended would make the scribe one more voice in the discussion, and the team could
not tell its view from the team's.

### Lore candidates name the approvers

The people who approved a decision asserted it; the scribe only noticed it. `lore-review` sends a
candidate to its authors for review, so naming the approvers sends it to people who can confirm
what they meant, as `lore-from-corrections` names the correcting person rather than the Igor.
The candidate's provenance cites the MADR, which lives in a repository, so `lore-review`'s
refusal to put an entry citing a private repository into a public store applies unchanged.

## Open

The proposal's *Still open* list is the whole of it. Two of those questions decide most of the
build:

- **How an approval is recognised off GitHub.** Without it the scribe can draft records on
  Discord, Slack or Linear but cannot mark one `accepted` or dispatch anything there.
- **How records are written.** A pull request per record puts a person's review between the
  scribe and the repository, as lore has. A direct commit is faster, but writes to the default
  branch with no review, and needs a role action that does not exist.
