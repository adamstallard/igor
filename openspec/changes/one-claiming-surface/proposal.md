## Why

**An organization's Igors claim in one place.** Today a role's `sources` may name any tracker,
so one organization can have Igors claiming on GitHub and on Linear at once. A person then has
to know which surface holds which claim before they can tell who is working on what, and a stop
has to be issued wherever that claim happens to live. Claims belong on one tracker, ideally the
issue tracker the team already plans in. Other surfaces still direct an Igor (a mention, a
message) or carry its work (the code host), but do not hold claims.

**That makes a GitHub App a valid identity, where it was not.** `docs/machine-accounts.md`
rejects an App because its bot user cannot be an issue assignee, measured against a live
repository, and a claim on GitHub has to sit in the assignee field. When claims live on another
tracker, GitHub only carries the work: branches, pushes, pull requests, comments. An App does
all of that, takes no seat, needs no personal token renewed, and shows a `[bot]` badge. The
measurement still stands; it now governs only the case where GitHub is the claiming surface.

**Linear is the tracker this was measured against, and its holder field behaves differently
from GitHub's.** `surface-adapter` already names Linear's holder field as `delegate`, but the
claiming rules were written against GitHub's assignee list, and three of them do not carry over:

- The delegate holds **one** value, so the later of two writes stands. On GitHub any second
  assignee costs both claimants the item.
- Standing down "releases the Igor's own claim". On Linear the losing Igor's write has already
  been replaced by the winner's, so clearing the field would remove the **winner's** claim.
- On Linear the assignee means *who is accountable*, not *who is working*. GitHub's rule that
  any other assignee means the claim is lost would make every assigned Linear issue
  unclaimable, and ignoring the assignee would let an Igor take an issue a person is working.

**A person can hand an issue to an Igor.** Setting the delegate is how Linear expects a person
to give work to an agent. An Igor that waits its settle interval after a person chose it delays
the work and protects nothing: no other Igor competes for an item already delegated to someone.

**A person reviews every Igor pull request.** Nothing in the specs says so, and it is the
reason an App's approving review does not need to count toward branch protection.

## What Changes

- **`work-claiming`:** an organization's Igors hold claims on one tracker. The holder field is
  written before the claim message. Where the field holds one value, the later write holds the
  item, and a losing Igor never clears it. An item someone else holds is not claimed, and an
  item assigned to a person is not claimed unless they handed it to this Igor through the
  holder field. A person handing an item to an Igor directs it: the Igor acknowledges with the
  claim message and starts without waiting the settle interval.
- **`surface-adapter`:** an adapter declares whether its holder field holds one value or a list,
  because resolution differs between the two.
- **`task-execution`:** an Igor never merges a pull request it opened, and no Igor's approval
  stands in for a person's.
- **`docs/machine-accounts.md`:** "Why not a GitHub App" is narrowed to the case where GitHub
  is the claiming surface, and a section says when an App is the better identity.

Nothing under `src/` changes in this pull request. No Linear adapter exists yet; this change
specifies how one claims.

## Capabilities

### Added Capabilities

None.

### Modified Capabilities

- `work-claiming`: two modified requirements (how a claim is expressed and resolved; settle and
  stand-down), three added (one tracker per organization, items held by others, a person
  directing an Igor).
- `surface-adapter`: one modified requirement (the holder-field declaration says whether the
  field holds one value or a list).
- `task-execution`: one added requirement (a person approves every Igor pull request).

## Impact

- An organization configured with sources on two trackers stops loading until it picks one.
  The GitHub adapter is the only one that exists, so a configuration that loads today claims on
  one tracker already.
- The GitHub adapter keeps claiming by assignee where GitHub is the claiming surface; its
  behaviour does not change.
- A Linear adapter, when written, follows the rules here rather than GitHub's.
- An Igor whose claims live on Linear may use a GitHub App on GitHub. Supporting App
  credentials in `gh` and git is implementation work, tracked in `tasks.md`.
- Polling is unchanged. Webhooks are not specific to Apps, and *Nothing may require inbound
  reachability* stands; the Linear measurement in `design.md` confirms a polling Igor is not
  penalised for answering a delegation late.
