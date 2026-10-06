## What a claim is for

**Claims coordinate Igors with each other.** That is the property this change protects, and it
is why an organization's Igors claim on one tracker: an Igor cannot see a claim held on a
tracker it does not read.

Three facts bound what a claim has to do:

- **Igors do not hold items for long.** A claim needs no expiry or lease.
- **A stalled Igor is taken over by a person.** The person stops it, or takes the item.
- **Duplicate human work is acceptable.** A person working an item that an Igor or another
  person also works costs some effort and breaks nothing. No rule here is designed to prevent
  it.

So a claim must be reliable between Igors and visible to people. It need not sit in the
assignee field, which is why a GitHub App's label claim is enough.

## One role per Igor

**Decided by the owner: an Igor holds exactly one role, and its identity is that role.** The
Igor's GitHub App or Linear app user names the role, so a person sees which role
took an issue and hands work to a role by naming it, by delegating on Linear or labelling on
GitHub. An Igor that does two jobs is two Igors, which may share a seat.

Multi-role Igors exist today only as a role whose `extends` names two sibling roles. Its lane,
`allow` and `commands` are then the union of both, and its `budget_share` the lower of the two.

**Decided by the owner: a role that names more than one base is refused.** That removes the
union and nothing else; a chain of single bases, such as a role extending a frontend base that extends the org
base, still works.

**Rejected: keep several bases but conjoin them.** A role would be the intersection of its
bases, which no one has asked for. Siblings rarely overlap, so it would match almost nothing,
and a role wanting a narrower lane can extend one base and narrow it.

## On GitHub, an Igor is a GitHub App

**Decided by the owner, 2026-10-04: Igors are GitHub Apps only at launch.** Machine-user Igors
are not supported. An App's bot user cannot be an issue assignee or a requested reviewer
(`docs/machine-accounts.md`), and an Igor that has to be either is out of scope: nothing needs
it yet, and perhaps nothing ever will. On GitHub an Igor claims by its `igor:<role>` label, and
the adapter has no assignee path.

## The App's label mirrors Linear's delegate

**Decided by the owner: on GitHub the `igor:<role>` label is the Igor's holder field, separate
from the assignee, which stays the person's.** The GitHub adapter declares its `igor:` labels a
list, distinct from the assignee. The rules then match Linear's case for case:

- An App Igor skips an issue assigned to a person unless it carries that Igor's label, as a
  Linear Igor skips an issue assigned to a person unless it is delegated to that Igor.
- A person adding `igor:<role>` directs that Igor, which starts without the settle interval, as
  a person's delegation does.
- After a stop the Igor removes its own label, as a Linear Igor clears itself as delegate. A
  person who then assigns themselves keeps the item, and a person who adds the label again
  hands it back.

## Who added a label, and who removed it, come from the issue's events

GitHub records the actor of every `labeled` and `unlabeled` event. The adapter reads them, as
a Linear adapter reads who set the delegate. Who added a label tells a person's label from the
Igor's own, which matters because an Igor that wrote its label and failed before posting the claim comment
also finds its label with no comment.

**Decided by the owner, 2026-10-04: removal is how an Igor detects a stop by label.** When the
Igor's `igor:<role>` label is gone, it reads the latest `unlabeled` event for that label. If the
actor is the Igor's own bot account, the removal was its own release. If the actor is anyone
else, a person stopped it: the Igor halts, and the stop receipt names them. A lost race never
removes this Igor's label, because a losing Igor removes only its own, so the two cases are
exhaustive. Comparing the actor with the Igor's own account works because every Igor is an App
with an account of its own.

**Measured 2026-10-04** with the App `adam-personal-agent` on `igor-throwaway-tests` (issue #9):
an add and a removal by the App, then a removal and an add by Adam, all read back from
`/issues/{n}/events` and `/timeline`, including by the App itself:

| event | actor | type |
|---|---|---|
| `labeled` | `adam-personal-agent[bot]` (id 337660608) | `Bot` |
| `unlabeled` | `adamstallard` (id 205792) | `User` |
| `labeled` | `adamstallard` | `User` |
| `unlabeled` | `adam-personal-agent[bot]` | `Bot` |

Three things the adapter must do that the rule alone doesn't say:

- **Match the actor by the bot's numeric `actor.id`**, with `actor.type == "Bot"`.
  `performed_via_github_app` was `null` even for the App's own actions, so it can't be the
  signal.
- **Order events by id, never by `created_at`.** Two of the four events shared a second, and
  ids rose strictly in the order of the actions.
- **Read every page.** The events list is paginated oldest first, so the latest `unlabeled` on a
  busy issue is on the last page.

All four events appeared in the first read, 0.5 s after the last action.

## A person reassigns by removing the holding Igor's label first

**Decided by the owner: an Igor never claims an issue that carries another Igor's `igor:`
label, even one a person labelled for it.** To move an issue to a different Igor, a person
removes the holding Igor's label, then adds the new one. That is Linear's single step of
replacing a delegate, done in two. A newly labelled Igor that finds another Igor's label
comments once to say so, so a label added without removing the first doesn't sit unnoticed.
Work that needs two roles is split into two issues.

**Rejected: a second label hands the issue over.** The first Igor would stop as soon as a
person labelled another, which makes adding a label a stop, and that is easy to do by
mistake.

A label a person added never makes the holding Igor lose its claim. A label another Igor
added itself, while claiming, is resolved by the settle interval as before. The adapter tells
the two apart by who added the label, from the issue's events.

## The App's label names the role, and nothing else

**`igor:<role>`, such as `igor:reviewer`.** The `igor:` prefix marks a label as a claim, and the
role names the Igor. A prefix naming the organization, or the word "agent", says nothing the
repository and `igor:` do not already say. No GitHub Projects field is used.

**Adding a label the repository doesn't have yet creates it.** Adam said so on 2026-10-04, and
it was measured the same day: the App adding a missing label through REST
`POST /repos/{owner}/{repo}/issues/{n}/labels` created it (colour `ededed`, no description), so
the first claim by a new role needs no label set up beforehand. The adapter uses that call; the
gh CLI's add-label path was not tried with a missing label. The adapter still reads its labels
back after writing them, rather than trusting the response.

## Two processes of one Igor claiming the same issue

Both add the same `igor:<role>` label, so the label can't separate them. `concurrent-instances`
does: each claim comment carries the process rank, and the earliest claim comment by comment id
holds the item. Its mechanism keys on comments, so it covers labels unchanged.

## Built together with `app-identity` (#158)

**Decided by Adam, 2026-10-04: gate two of this change also implements `app-identity`, and the
two changes are archived together.** An App cannot be assigned, so the label claim needs the
App's credentials, and task 3.6 removes the assignee claim in the same build. Gate two lands
on this branch, `one-claiming-surface`; `app-identity` is merged into it at that point, and #158
is closed in favour of this pull request. `app-identity` answers task 5.2, App credentials for
`gh` and git, and carries task 5.4.

## Archiving alongside `concurrent-instances`

`concurrent-instances` and this change both MODIFY *Assignment expresses a claim; ordering
resolves it* in `work-claiming`. Whichever is archived second must first rebase its MODIFIED
block on the text the first one archived, or the second archive overwrites the first's
changes.

## Releasing under `release-a-claim-that-cannot-be-kept` (#146)

#146's release checks whether the holder field cleared, through an adapter contract that
returns what the surface recorded. For an App Igor the question becomes "is my `igor:<role>`
label gone": the label adapter's release answers by reading the issue's labels back after
removing its own (task 3.6).

## A person approves every Igor pull request

Every Igor is a GitHub App, so a person approves every Igor pull request, and an Igor's
approval is recognisable: the review's author is a `Bot` account. A review from a `Bot` author
never counts as a person's approval, whatever branch protection accepts.

## Discord directs work and never holds claims

**Decided by the owner, 2026-10-04.** A claiming tracker is one with a holder field, as GitHub
and Linear have. Discord has none, so a claim there would be a bare message with nothing to
verify. Discord is a direction surface: a person asks in a channel, the Igor opens an issue on
the claiming tracker that links the chat message, claims it there, and posts the issue's link
back.

**Refused (owner, 2026-10-05): a configuration that claims on Discord.** Validation fails with
an error saying Discord directs work and cannot hold claims (*An organization's Igors claim on
one tracker*, task 2.1).

`docs/architecture.md` §5.1, which said Discord "forces the convention path", and
`docs/machine-accounts.md`, which said a Discord claim is a message, now say this.

## Discord is polled, not a socket

**Decided by the owner, 2026-10-04: the Discord bot polls.** It reads new channel messages
through Discord's REST API on Igor's normal cycle, and neither holds a gateway socket nor runs
as a service. Stop happens on the claiming tracker, which Igors already poll, so nothing about
stop depends on Discord. Discord is where a person asks for work, and a few minutes' latency is
acceptable there, as it is on the tracker.

- Polling is Igor's model on every surface.
- One role may run as several interchangeable processes. A socket per process would deliver
  every message to each of them, so one process would have to own it; polling needs no owner.
- No heartbeat or reconnect to maintain.

**How the bot finds new messages (owner, 2026-10-04).** Each poll asks Discord for a channel's
messages after the newest one already handled, then moves that marker to the newest message it
has now handled. The marker, one per channel, is kept with Igor's other state, so any process
of the role, or a restarted one, carries on where the last poll stopped.

**The marker lives on the state branch (owner, 2026-10-06).** Like the discovery watermark, it
is keyed by role and channel id, shared by every process of the role, and survives restarts and
new servers. It stays only a cache, as the next paragraph explains.

**The link, not the marker, prevents a duplicate issue (owner, 2026-10-05).** Every issue an
Igor creates from a chat message links that message. Before creating one, the Igor looks on
the claiming tracker for an issue that already links the message, and creates nothing if one
exists (*An issue created from chat points back to the chat*). So the marker only saves
work: a lost or stale marker makes the Igor re-read messages and look them up, and never makes
a second issue. This keeps the rule of `docs/architecture.md` §5.0.2 that correctness never
depends on saved state. How the tracker is searched for the link is the adapter's choice.

**An issue created from chat links the message (owner, 2026-10-05).** It may also quote it.
A quote alone is not enough: the duplicate check finds an issue only by its link to the
message.

**A found issue's link is posted unless the chat already has it (owner, 2026-10-05).** When
the check finds an issue that already links the message, the Igor posts that issue's link in
the chat if the chat has no reply with that link yet, and otherwise does nothing. An Igor that
stopped between creating the issue and posting its link therefore posts it on the next read,
and reading the message again never posts it twice. How the adapter tells whether the chat
already has the link is decided when the Discord adapter is built.

**Rejected: a gateway socket.** It is outbound, so it would not break *nothing may require
inbound reachability*. It buys latency Igor does not need.

To verify when the Discord adapter is built, not measured here: whether reading ordinary
message text needs the Message Content Intent, and whether a bot must connect to the gateway
once before it can send through REST.

## Measured against Linear, 2026-10-03

Against the Aura workspace, as the app user `aura-agent-adam`, whose token was minted with
`read,write,app:assignable,app:mentionable`. The app had no webhook and subscribed to no agent
events. Issues AUR-336 and AUR-337, cancelled afterwards.

- **An app user can make itself delegate.** On AUR-337, which had no assignee and no delegate,
  the app set itself as delegate through the API. Linear accepted it and added no assignee.
  Without `app:assignable` in the token's scopes it could not be delegate at all, measured
  earlier for the `linear-app` skill.
- **A person can delegate to it.** On AUR-336 a person assigned to themselves set the app as
  delegate in the web app.
- **No agent session was opened, and nothing waited on a reply.** Linear's API has agent
  sessions, with statuses including `stale`. Queried as the app, `agentSessions` was empty at
  0, 2 and 10 minutes after each delegation, and again after the app posted a claim comment
  10 minutes late. The person watching in the web app saw no change and no notification. The
  delegate and the late comment were both still in place 7 minutes later.
- **Not established:** why no session was opened. The likely reason is that Linear opens
  sessions only for apps subscribed to agent events, which this one was not. If an Igor's app
  is ever given such a webhook, re-measure, because a session may then expect a prompt reply
  that a polling Igor cannot give.

What this settles: a polling Igor can claim on Linear, and be directed there, with nothing to
acknowledge within any deadline. *Nothing may require inbound reachability* holds on Linear
without an exception.

Also not established here: the assignee field. The earlier `linear-app` measurement found an
app user cannot be assignee, and that the request reported success while changing nothing. The
adapter must read the field back rather than trust the response.

## Owed: a GitHub App's pull request linking to a Linear issue

**Not measured yet:** whether a pull request opened by a GitHub App links to its Linear issue
the way a person's does. Linear links by the issue identifier in the branch name, title or
description, not by author, so it is expected to. The measurement needs a GitHub repository
connected to Linear's GitHub integration; `aura-workroom` is not connected.

## Holder field first, then the message

**Rejected: message first.** Resolution reads one thing, and people see one thing, and those
should be the same thing. With the message first, comment order and field order can disagree
when two Igors race: the field may end up showing the Igor that lost by comment order, and
something then has to correct it. A failure between the two writes is also worse that way
round, leaving a message claiming an item whose field shows nobody.

## A losing Igor leaves a single-valued field alone

On GitHub, standing down removes the Igor's own label and leaves anyone else's.
Applied to Linear's delegate, the same "release my claim" would set the field to empty, and the
field at that moment names the **winner**. The loser therefore only replies. If its write is
somehow still in the field, it has not lost.

## Items assigned to a person, on Linear

**Chosen: off-limits unless delegated to this Igor.** Closest to GitHub, where a person in the
assignee list means the item is taken, and it makes a person's hand-over explicit.

**Rejected: only the delegate matters.** This is Linear's own model, where the accountable
person may want any agent to pick the work up. It would let an Igor take an issue a person is
actively working, with nothing on the issue telling the Igor not to. A role could opt into it
later if a team asks; nothing here prevents that.

## A person's delegation skips the settle interval

The settle interval exists so that simultaneous claims, and objections, land before work
starts. Neither applies when a person sets the holder field: other Igors do not claim an item
that names a holder, and the person has made the choice an objection would contest. Waiting
would cost up to one settle interval for nothing. Stop is unchanged, so a mistaken delegation
is undone the same way as any claim.

**Decided by the owner: a person handing an item back after a stop skips the cooldown too**,
whether by delegating it again or adding the label again. Handing it back is an explicit
go-ahead, which the accepted stop requirement already lets cut the cooldown short.
