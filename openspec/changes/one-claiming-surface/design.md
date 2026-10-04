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
Igor's GitHub App, Linear app user or machine user names the role, so a person sees which role
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

**Not measured here:** telling a person's label from the Igor's own. An Igor that wrote its
label and failed before posting the claim comment also finds its label with no comment. GitHub
records who added each label in the issue's events; the adapter is expected to read that, as a
Linear adapter would read who set the delegate.

## A person adding a second Igor's label hands the issue over

**Decided by the owner: a person who adds one Igor's `igor:<role>` label to an issue that
another Igor holds hands the issue to the newly labelled Igor.** This mirrors Linear, where a
person setting a new delegate replaces the old one. GitHub's labels hold a list, so the first
label is not replaced; the first Igor stops and removes only its own label. The newly labelled
Igor proceeds as if a person had labelled an unclaimed issue. Work that needs two roles is split
into two issues.

This differs from two Igors racing to claim. A label another Igor added itself, while claiming,
is resolved by the settle interval as before. The adapter tells the two apart by who added the
label, from the issue's events.

## The App's label names the role, and nothing else

**`igor:<role>`, such as `igor:reviewer`.** The `igor:` prefix marks a label as a claim, and the
role names the Igor. A prefix naming the organization, or the word "agent", says nothing the
repository and `igor:` do not already say. No GitHub Projects field is used.

**Not measured here:** an App adding and removing a label. The adapter reads its labels back
after writing them, as it reads assignees back today, rather than trusting the response.

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

On GitHub, standing down removes the Igor's own assignee or label and leaves anyone else's.
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
