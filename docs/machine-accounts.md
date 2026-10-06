# Provisioning an Igor's GitHub identity

**An Igor acts on GitHub as a GitHub App.** Machine users, ordinary GitHub accounts that exist
to run automation, are not supported as Igor identities at launch.

**Not built yet:** App credentials for `gh` and git, and claiming by label, are specified in the
`one-claiming-surface` and `app-identity` changes and not yet implemented.

This document is the part of deployment that cannot be scripted, because it involves accepting
terms, holding credentials, and granting access.

## A GitHub App

An App does everything an Igor does on GitHub except be assigned or be requested as a
reviewer. It pushes branches, opens pull requests, comments, and creates issues. And:

- **It claims with a label.** On GitHub an App claims an issue by adding the label
  `igor:<role>`, such as `igor:reviewer`, and then posting the claim comment. Labels hold a
  list, so another Igor's `igor:` label on the issue after the settle interval means the claim
  is lost. Where the organization's Igors claim on another tracker, such as Linear, the App
  claims nothing on GitHub and only carries the work.
- **The label is the Igor's field; the assignee stays the person's.** They work like Linear's
  delegate and assignee. An App Igor leaves alone an issue assigned to a person unless it
  carries that Igor's label, and a person adding `igor:<role>` hands the issue to that Igor,
  which starts without waiting the settle interval.
- **Nothing to renew.** The App's private key mints an installation token for an hour at a
  time, so no personal access token expires on anyone.
- **Obviously not a person.** Its work shows as `<name>[bot]` with a bot badge.
- **No server.** Minting a token and calling the API are outbound. Leave the App's webhook
  inactive; the Igor polls as it would with any other identity.

Whether an App's approving review counts toward branch protection is not measured, and does
not matter: a person approves every Igor pull request (`task-execution`). An Igor's review is
recognisable, because its author is a `Bot` account.

## No assignee, no requested reviewer

**A GitHub App's bot user cannot be an issue assignee, on any plan.** Measured against a live
repository: the "can this user be assigned" endpoint returns 404 for a bot user, and the
assignment request returns 403. Nor can an App be requested as a reviewer.

An Igor that has to be an assignee or a requested reviewer is out of scope: nothing needs it
yet, and perhaps nothing ever will. That is why machine users are not supported.

## One identity per Igor

Not one per organization, and not one per running process.

**Not one shared identity.** One App per Igor keeps each Igor's work on GitHub attributable to
it, as its claims are. It also lets an Igor tell its own label removal from a person's stop: it
compares the actor of the `unlabeled` event with its own bot account, which works only if no
other Igor shares that account.

**Not one per process**, because processes of the same Igor are interchangeable. Twenty backend
workers are still one teammate as far as anyone reading the issue is concerned.

**One role per Igor, so one identity per role.** An Igor holds exactly one role, and its
identity is that role, so a person sees which role took an issue and can hand work to a role
by name. A `backend` Igor and a `frontend` Igor each have their own identity, and may draw on
the same seat.

## Other surfaces

The steps above are GitHub's. What is surface-independent is most of it — a name that reads as
a teammate, one account per Igor, a second factor nobody owns personally, and a revocation path.
What differs is how identity is expressed and what it costs, and that is worth knowing before
choosing a tracker rather than after.

**Linear** offers application identity, so an Igor need not be a seat-consuming member, and has
a `delegate` field distinct from `assignee` — which suits a team whose assignee means *who is
accountable* rather than *who is working*. Free.

**ClickUp** has no bot identity. An Igor is an ordinary member and is billed as one, so
capacity there is a per-Igor purchase rather than a configuration choice.

**Discord** identifies a bot by its application. It directs work and never holds a claim: it
has no holder field, so a claim there would be a bare message with nothing to verify. A person
asks in a channel, the Igor opens an issue on the claiming tracker, and posts the issue's link
back in the channel. The claim, and the identity it shows, are on the tracker.

Measured rather than assumed, but only from documentation and trial accounts; none has run an
Igor yet.

## Separately: which seat pays

The GitHub identity and the Claude subscription seat are different things and are configured
separately. The GitHub identity says who acts on the repository; a seat says whose allowance
pays for the reasoning (§6.5.1). An Igor may act as `acme-igor-backend[bot]` while using seats that
three people have set aside for its role, and that is the normal arrangement rather than an
edge case.

Provisioning a seat is a different conversation with a different person — the one whose
allowance it is. [`seats.md`](seats.md) is the page to send them.

## Revoking

Because the identity is per Igor, retiring one is uninstalling its App. Its history stays
attributable, which is the point of it having had a name. On today's build, revoke the machine
user's token, remove it from the organization, and leave the account dormant.
