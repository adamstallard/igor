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
GitHub. Igors of different roles may share a seat.

Multi-role Igors exist today only as a role whose `extends` names two sibling roles. Its lane,
`allow` and `commands` are then the union of both, and its `budget_share` the lower of the two.

**Decided by the owner: a role that names more than one base is refused.** That removes the
union and nothing else; a chain of single bases, such as a role extending a frontend base that extends the org
base, still works.

**Rejected: keep several bases but conjoin them.** A role would be the intersection of its
bases, which no one has asked for. Siblings rarely overlap, so it would match almost nothing,
and a role wanting a narrower lane can extend one base and narrow it.

**Rejected: a named composite with two bases** (Adam asked, 2026-10-06), such as a `fullstack`
role extending `frontend` and `backend`. A name answers the identity objection, since it can be
labelled and handed work. What remains against it:

- **Its permissions change without it changing.** It would take the union of both bases'
  `allow`, `commands` and lane. Letting `frontend` close issues would let `fullstack` close
  them too, though no one edited or reviewed `fullstack.yaml`.
- **Two bases conflict on override fields.** If one says `poll_minutes: 2` and the other
  `30`, a tie-break rule is needed for every such field, which is how inheritance becomes
  something nobody can reason about (`docs/architecture.md` §6.0).
- **Both bases' instructions apply to every item**, frontend conventions on backend work
  included. Area guidance mostly belongs in lore, which fires by path, so this matters least.

**The pattern instead:** one chain, with the broad role stating its own scope.

```
roles/engineering.yaml   extends org: what frontend, backend and fullstack share
roles/fullstack.yaml     extends engineering, with a lane over both areas and its own
                         allow and commands
```

It repeats a couple of lane paths and the commands it needs. In exchange, its own file and its
ancestors say everything it may do, and nothing in a sibling role can widen it.

## A key no role reads is refused the same way, whichever it is

**Decided by Adam, 2026-10-11: no role key gets a refusal of its own.** `name`, `claim` and
`github_app` each had a reason of their own, which said why a role may not set it. Every key a role
file sets that nobody reads is already refused as not a role key, and Igor has no users besides
Adam, so nobody would reach for these three. A table whose only effect was to reword one error is
not kept. The rules stand as they were: the filename is the name, the claim message is not a role's
to replace, and a role cannot name an App.

## A finished run releases its claim; a role does not choose

**Decided by Adam, 2026-10-11: the `completion` key is gone.** Under label claiming a finished run
always releases its claim, which is what the default `unassign` did. `close` and `assign` existed
only to be refused as not built, and `completion` had to appear in `allow` only so that naming it
could not bypass `allow`. With nothing left to choose, a role file that sets `completion` is
refused as any key that is not a role key is. The release is specified in `work-claiming`'s
*A claim that cannot be kept is given back, out loud*, and the role-config requirement that a
completion action be permitted by `allow` and task-execution's *Completion behaviour follows
configured policy* are removed.

**Decided by Adam, 2026-10-11: the role-config spec does not single out `claim`.** Nobody will
try to set it, and the strict key check refuses it as it refuses any key no role reads. That the
claim message carries the stop instruction stays where it is behaviour, in `work-claiming`.

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

## A GitHub App's pull request links to its Linear issue

**Confirmed by Adam from use, 2026-10-07:** a pull request opened by a GitHub App links to its
Linear issue as a person's does. Linear links by the issue identifier in the branch name, title or
description, not by author.

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

## What the implementation found

**Nothing in Igor merges a pull request, so *A person approves every Igor pull request* holds
with no new code (task 4.1).** The `merge` action in a role's `allow` gates nothing, and the
only merge Igor makes brings a base branch into its own artifact's branch. A guard that counted
reviews would have no caller. The first code that merges a pull request must refuse one the
Igor opened and count no `Bot` review as a person's approval.

**An item a person hands over is found wherever it is, not only where the role's query looks.**
Each cycle searches the role's repositories for open issues carrying the Igor's `igor:<role>`
label. One counts as handed over when the label's latest `labeled` event names a person and the
Igor has said nothing on the issue since, apart from a waiting notice. So a hand-over is
answered once; the Igor's own label, left behind by a crash or a release that did not take, is
not mistaken for one; and a label added again after a stop skips the cooldown. A stop posted
after the label still holds the item. A handed-over item skips the lane and the model stage, as
`igor run --claim` already does, because the person exercised the judgement those stand in for.

**A stop made by removing the label holds the item for the cooldown, through the receipt.** No
comment marks such a stop, and the cycle reads stops from comments. So the receipt for a stop
read from the holder field carries a hidden line, `<!-- igor:stopped -->`, and the cycle reads a
comment by this Igor carrying it as a stop at the receipt's time. The claim's own verification
never reads it, so an old receipt cannot stop a new claim.

**A release spends a hand-over.** The label is all that brings a handed-over item to the Igor,
and the release every failure owes removes it. So a handoff or withdrawal on a handed-over item
promises no return: it ends "To have it try again, add the `igor:<role>` label again".

**Decided by Adam, 2026-10-11: a handed-over item with work already in flight waits for it.**
The rule that a person's label starts the Igor and the universal rule that an item with an open
pull request is skipped disagreed, and no text said which wins. The gate-two build skipped such
an item and said nothing, so a person who followed a waiting notice and removed the holding
Igor's label saw nothing happen while that Igor's draft was open. Now the Igor does not claim
it, and posts one notice naming the pull request and saying it takes the item up once that
closes (*An item handed to an Igor waits for work already in flight*). The notice carries the
same hidden marker as a waiting notice, so it is posted once while that pull request is open
and does not count as answering the hand-over: when the pull request closes, the label still
directs the Igor. A handed-over run that published and then failed says, in its handoff, that
what it published stands and that handing the item over again once that pull request closes has
it try again, rather than to re-add the label at once, which would change nothing. Where the
pull request is the Igor's own and no longer merges, the cycle catches it up as for any item, and
posts no in-flight notice: on a conflict the catch-up claims and releases, which would make the
notice's promise false the moment it was posted.
A handed-over item outside the role's query whose own pull request no longer merges waits, with
its notice, until a person closes or fixes that pull request: catch-up scans only what the role's
query returns.

**Decided by Adam, 2026-10-11: a catch-up keeps a person's label.** Bringing the Igor's own pull
request up to date on a handed-over item is not a claim of the hand-over, so that run gives back
its claim without removing the `igor:<role>` label the person added, on every exit, and the
hand-over still directs the Igor once the pull request closes. The give-back requirement gains a
sentence saying so. Two mechanisms carry it:

- The catch-up gives its claim back through a tracker that first reads, at that moment, who last
  added the label: a person's label stays, and the Igor's own is removed. Reading when the claim
  is given back, rather than from what the cycle saw minutes earlier, handles a person removing
  or adding the label mid-cycle. Where who set it cannot be read, what the cycle saw decides: a
  label it did not see was put there by the catch-up's own claim and is released as any claim
  is; a label it saw is kept, because removing a person's hand-over is the mistake nothing on
  the item would explain. **Measured 2026-10-11**
  (`igor-throwaway-tests` #13): the App adding a label a person had already added recorded no
  `labeled` event, so the person stays its setter through the catch-up's own claim.
- A claim message carries a hidden line saying what it answers: `<!-- igor:claim -->`, or
  `<!-- igor:catch-up -->` for a catch-up. Only the first answers a hand-over, so the catch-up's
  comments leave it standing. Before this, any comment by the Igor after the hand-over counted as
  its answer.

**Decided by Adam, 2026-10-11: a stop is the one exit from a catch-up that removes a person's
label.** "Every exit keeps the label" and the approved stop rule, that a stop removes the Igor
from the holder field and only a new hand-over undoes it, disagreed for a stop. As built at
first, the label stayed, the receipt said "released this", and the label never directed the Igor
again, because the stop after the hand-over cancelled it. Now `standDown` tells the release that
it is giving back a stopped claim, and the catch-up's release then removes the label whoever set
it, so the receipt is true and adding the label again hands the issue over anew.

**Decided by Adam, 2026-10-11: a stop while nothing runs takes the label off.** Where somebody
stops an Igor on a handed-over item while no run of it is active there, the next cycle that sees
the stop removes the label and posts a stop receipt, so a label on an item always means it is
handed over. The cycle tells such a stop apart by the Igor having said nothing since it: a run
that met a stop answered it with a receipt.

**Decided by Adam, 2026-10-11: a lifted stop does not restore a hand-over.** A stop cancels a
hand-over, and only a new hand-over, the label removed and added again, restores it. A go-ahead
or the cooldown lifts the stop for work the Igor's own search finds, never for a hand-over.

**Decided by Adam, 2026-10-11: a stop that names an Igor stops only that Igor.** A bare "stop"
still stops every Igor on the item. A stop that names accounts right after the word, as
`stop @igor-backend`, or before it, as `@igor-backend stop`, stops only those it names, so the
frontend Igor keeps working, and keeps a label a person added, when somebody tells the backend
Igor to stop. Before this, any comment opening with "stop" stopped every Igor, and once a stop
while nothing runs took the label off, a stop meant for one Igor spent another's hand-over.
A stop counts wherever in the comment it addresses the Igor, not only at its first mention, and
never on a quoted line: a reply quoting an old "@igor-frontend stop" is not a new stop.

**Decided by Adam, 2026-10-11: a claim scans for stops from when its cycle read the item.** A
cycle works its items one after another, and a claim scanned for stops only from the claim
minus the settle interval, so a stop said on one item while the cycle worked another was never
seen, and the item was worked over it. The cycle now records when it began reading
(`CycleReport.readAt`), and every claim it makes scans from there, or, for a handed-over item,
from the hand-over. The same defect is on `main`; fixing it here was Adam's call.

**A go-ahead lifts the stop before it in the comment list, not by the clock.** The wider window
lets a claim see a stop that a go-ahead already answered, so a claim from the Igor's own search
treats the latest stop as lifted by a go-ahead after it, from anyone but the Igor. GitHub dates
comments to the second and returns them in creation order, so "after" is the position in the
list, in the claim's re-read and in the cycle's stop gate alike. The held verdict carries the
go-ahead's time, and the run's checkpoints and a catch-up's give-back scan from there, so a stop
the claim saw lifted does not end the run that the claim began. A hand-over claim's stop is never
lifted, by the decision above.

**Decided by Adam, 2026-10-11: a go-ahead that names Igors lifts a stop only for those.** A bare
go-ahead still lifts a stop for every Igor on the item, and "go ahead @igor-backend" lifts it only
for the backend Igor, mirroring the stop. Both read their names with one parser, so a stop and a
go-ahead written the same way are meant for the same Igors. Every reader of a go-ahead follows:
the cycle's cooldown gate, a claim's re-read, and through it a catch-up's give-back.

**Decided by Adam, 2026-10-11: where the names are unclear, a go-ahead errs toward lifting too
little.** One parser reads both verbs, and it reads names only straight after the verb and lets
a list run on into the next clause. For a stop that errs toward stopping, the safe side; for a
go-ahead it would err toward lifting. So a go-ahead with no Igor's name straight after the phrase
counts the mentions later on its opening line ("go ahead and pick it back up, @igor-backend" is for the
backend Igor), and a list that runs straight on into a word loses its last name ("go ahead
@igor-backend, @igor-frontend keep waiting" is for the backend Igor). Whether a go-ahead names an Igor is read before the trim, so "go ahead @alice,
@igor-frontend keep waiting" lifts the stop for no Igor rather than reading as bare. A stop reads
these comments as before. The parser stays shared; the two verbs differ only in what they make of what it read.

**Decided by Adam, 2026-10-11: a name that is no Igor's counts as no name.** "Stop — @alice is
taking over" stops every Igor on the item, and "carry on, @alice approved it" lifts every stop.
The name reading needs to know which names are Igors, and a role does not say: a role file may not
name an App (`github_app` is refused, so one role cannot point at another's credentials), and an
App's name is free (*Giving an Igor its GitHub App*). Every Igor is a GitHub App, though, and an
App's bot account is `<slug>[bot]`, which the Igor already reads for itself at startup. **Decided
by Adam, 2026-10-11: an Igor is recognised by that bot account.** So the
GitHub tracker asks `GET /users/<name>[bot]` for each name the parser reads after an opening stop
or go-ahead: a `Bot` is an Igor, a 404 is not, and anything else leaves the name
unresolved. It keeps each answer for the life of the process and returns them on the comments it
reads (`Comment.accounts`), so `isStop` and `isGoAhead` stay pure. An unresolved name counts as no
name for a stop and as an Igor for a go-ahead, the safe side of each. Any App's bot counts as an
Igor, so "stop @dependabot" stops no Igor, which is what it asks for.

**A stop is the comment as created, not as last edited.** GitHub's `since` on an issue's comments
filters on when each was last updated, so a stop said before a hand-over and edited later comes
back. Verification, the catch-up's give-back and the search for handed-over items each count a
stop only where it was created inside the window they ask about.

**A hand-over newer than a stop lets the catch-up run.** The stop gate for catch-ups reads when
each was handed over, for items carrying the Igor's label, and treats a hand-over after the stop
as the go-ahead *What follows a stop* says it is.

**Measured 2026-10-11** with the App `igor-generalist` on `igor-throwaway-tests` (issue #12):
the startup check passed, with Workflows write reported missing. Adding `igor:generalist` read
back as held; `holderSetBy` read the label's `labeled` event as the App's own by its id
(337663049); removing the label through `DELETE .../labels/igor%3Ageneralist` read back as
released, a second removal answered 404 and read as released, and verification afterwards read
the removal as the Igor's own release.

**The waiting notice is posted once per set of holders.** It carries a hidden line naming the
holders it was about, `<!-- igor:waiting igor:backend -->`, and the cycle posts no second one
while a comment by the Igor carrying that line exists since its label was added.

**Task 3.9 is built as the claiming tracker's half, with no chat surface to call it.** No chat
adapter exists yet (#160). `issueFromChat` in `src/chat.ts` holds the rule, finding an issue that
links the message before creating one and posting the link back only where the chat lacks it,
behind a `ChatSurface` interface the Discord adapter implements. The GitHub tracker finds a
linking issue by searching descriptions and keeping only those carrying the whole link, since a
link to message 3 is the start of a link to message 30. GitHub's search index lags a new issue
by seconds to a minute, so a chat surface that read the same message twice within that time
could create a second issue; the channel marker (task 5.5, built with #160) is what keeps a
message from being read twice that quickly.

**A role naming two bases is refused when it loads, and the organization's trackers are checked
there too.** `loadRole` resolves every other role only to read which tracker it claims on, and a
role that fails to resolve is skipped rather than refusing the one being loaded, so one broken
role still breaks only its own lane.
