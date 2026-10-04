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

## Open: the App's label and items assigned to a person

On Linear the holder field (the delegate) is distinct from the assignee, and an issue assigned
to a person is off-limits unless delegated to this Igor. On GitHub, the `igor:<role>` label an
App claims with is also distinct from the assignee. **Not decided:** whether the GitHub adapter
declares the label distinct from the assignee, which decides whether:

- an App Igor skips an issue assigned to a person unless it carries this Igor's label;
- a person adding an `igor:<role>` label directs that Igor, starting it without the settle
  interval, as a person's delegation does on Linear.

The same answer settles a case `work-claiming` already covers, a person assigning themselves
after stopping an Igor. Under a label claim, only a "distinct" declaration keeps that Igor from
reclaiming the item.

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
