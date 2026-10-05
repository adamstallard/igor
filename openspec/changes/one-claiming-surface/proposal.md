## Why

**An Igor holds one role, and its identity is that role.** A person reading a claim should see
which role took the issue, and should be able to hand work to a role by name: by delegating on
Linear, or by adding a label on GitHub. An Igor holding several roles makes its name say nothing
about the work. Narrow Igors also keep trust separate (one role may open pull requests, another
only comment) and keep a bad role config from breaking every lane. The old case for multi-role
Igors, absorbing the idle capacity of a seat dedicated to one Igor, does not apply now that
several Igors share a seat. Today a role whose `extends` names two sibling roles makes one Igor
do both jobs.

**An organization's Igors claim work on one tracker.** Claims exist so that Igors do not work
the same item. An Igor claiming on GitHub cannot see a claim another Igor holds on Linear, so
an organization whose Igors claim on two trackers has no coordination between them. Today a
role's `sources` may name any tracker, which allows exactly that. Other surfaces still direct
an Igor (a mention, a chat message) or carry its work (the code host), but hold no claims.

**Claims coordinate Igors, not people.** An Igor holds an item for a short time. If one
stalls, a person takes the item over. A person duplicating work is acceptable, and nothing
here is designed to prevent it. So a claim needs to be reliable between Igors and visible to
people, and it does not need the assignee field.

**So on GitHub every Igor is a GitHub App.** An App's bot user cannot be an issue assignee
(404 and 403, measured, on any plan; see `docs/machine-accounts.md`). On GitHub an App
therefore claims with a label naming its role, `igor:<role>`, plus the claim comment. Labels
hold a list, so they resolve as the assignee list does: another Igor's `igor:` label present
after the settle interval means the claim is lost. An App needs no personal token renewed,
shows a `[bot]` badge, and needs no server. Machine-user Igors are not supported at launch. An
Igor that must be an assignee or a requested reviewer is out of scope: nothing needs it yet,
and perhaps nothing ever will.

**The label is the Igor's field, and the assignee stays the person's.** That is how Linear
separates its delegate from its assignee, so the GitHub label follows Linear's rules case for
case: an App Igor skips an issue assigned to a person unless it carries that Igor's label, and a
person adding `igor:<role>` hands the issue to that Igor.

**Linear's holder field behaves differently from GitHub's assignee.** `surface-adapter`
already names Linear's holder field as `delegate`, but the claiming rules were written against
GitHub's assignee list, and three of them do not carry over:

- The delegate holds **one** value, so the later of two writes stands. On a GitHub list, any
  second holder costs both claimants the item.
- Standing down "releases the Igor's own claim". On Linear the losing Igor's write has already
  been replaced by the winner's, so clearing the field would remove the **winner's** claim.
- On Linear the assignee means *who is accountable*, not *who is working*. GitHub's rule that
  any other assignee means the claim is lost would make every assigned Linear issue
  unclaimable, and ignoring the assignee would let an Igor take an issue a person is working.

**A person can hand an issue to an Igor.** Setting the delegate is how Linear expects a person
to give work to an agent. Waiting the settle interval after a person chose an Igor delays the
work and protects nothing: no other Igor competes for an item already delegated.

**Work asked for in chat needs an issue that points back to the chat.** An Igor can be
instructed in chat but claims only on the tracker, so it creates the issue itself. The issue
has to say where the request came from, and the chat has to learn where the work went.

**A person approves every Igor pull request.** Nothing in the specs says so. It is also why an
App's approving review does not need to count toward branch protection. Because every Igor is
an App, an Igor's approval is recognisable: its author is a `Bot` account.

## What Changes

- **`role-config`:** an Igor holds exactly one role, and its identity on every surface is that
  role. An Igor that does two jobs is two Igors, which may share a seat. A role naming more than
  one base in `extends` is refused, which removes the only way an Igor holds several roles today.
- **`work-claiming`:**
  - An organization's Igors hold claims on one tracker. A configuration claiming on two is
    refused.
  - On GitHub, an Igor is a GitHub App and claims with its `igor:<role>` label and the claim
    comment. Machine-user Igors are not supported.
  - Every claiming tracker has a holder field, so a claim is always the holder field plus the
    claim message. The message-only claim is removed.
  - The holder field is written before the claim message. On a single-valued field the later
    write holds the item, and a losing Igor never clears it.
  - An item someone else holds is not claimed. An item assigned to a person is not claimed
    unless they handed it to this Igor through the holder field. A person handing an item to an
    Igor directs it: the Igor posts the claim message and starts without the settle interval.
    On GitHub the `igor:<role>` label follows these rules exactly as Linear's delegate does.
  - An Igor never claims an issue carrying another Igor's `igor:` label. To reassign it, a
    person removes the holding Igor's label first. A newly labelled Igor that finds another
    Igor's label comments once to say so.
  - A stop removes this Igor from the holder field, so a person who then assigns themselves
    keeps the item, and a person who hands it back directs the Igor again, without the
    cooldown.
  - An Igor whose `igor:<role>` label disappears while it works reads who removed it from the
    issue's events. Its own bot account means its own release; anyone else means a stop by
    that person, and the stop receipt names them.
  - An issue an Igor creates because it was instructed in chat links that chat message, and
    the Igor posts the issue's link back in the chat. Before creating one, the Igor looks on
    the claiming tracker for an issue that already links the message, and creates nothing if
    one exists; it posts that issue's link in the chat only if the chat has no reply with it
    yet.
- **`surface-adapter`:** every tracker adapter declares a holder field; the message-only
  declaration is removed. An adapter declares whether its holder field holds one value or a list,
  and whether it is distinct from the assignee. The GitHub adapter's holder field is the
  `igor:<role>` label, declared a list and distinct from the assignee. It never claims by
  assignment.
- **`task-execution`:** a person approves every Igor pull request. An Igor never merges a pull
  request it opened, and no Igor's approval stands in for a person's.
- **`docs/machine-accounts.md`:** rewritten around the GitHub App as the only Igor identity on
  GitHub, one per role. Machine users are not supported at launch.
- **`docs/architecture.md`:** §2.1 says an Igor holds one role, and why. §6.9, which said an
  Igor must be a machine user, is marked superseded by this change.
- **`README.md`:** no longer describes an Igor defined by several roles.

Nothing under `src/` changes in this pull request.

## Capabilities

### Added Capabilities

None.

### Modified Capabilities

- `role-config`: one modified requirement (`extends` names at most one base) and one added (an
  Igor holds exactly one role).
- `work-claiming`: three modified requirements (how a claim is expressed and resolved; settle
  and stand-down; what follows a stop) and six added (one tracker per organization, the App's
  label claim on GitHub, items held by others, a person directing an Igor, a person
  reassigning an issue by removing the holding Igor's label first, issues created from chat).
- `surface-adapter`: two modified requirements (the holder-field declaration; the GitHub
  adapter claims by label).
- `task-execution`: one added requirement (a person approves every Igor pull request).

## Impact

- A role whose `extends` names two roles stops loading. The organization replaces it with one
  Igor per role.
- An organization configured with sources on two trackers stops loading until it picks one.
  The GitHub adapter is the only one that exists, so a configuration that loads today already
  claims on one tracker.
- An Igor on GitHub runs as a GitHub App and claims by label. App credentials in `gh` and git,
  and the label claim, are implementation work tracked in `tasks.md`.
- Igor runs only as a machine user today, claiming by assignee. Once App support ships, that
  path is no longer supported.
- A Linear adapter, when written, follows the rules here rather than GitHub's.
- Polling is unchanged. *Nothing may require inbound reachability* stands: an App's webhook is
  optional, and the Linear measurement in `design.md` shows a polling Igor is not penalised for
  answering a delegation late.
