# Provisioning machine accounts

An Igor acts on GitHub as a **machine account**: an ordinary GitHub user account that exists to
run automation. This document is the part of deployment that cannot be scripted, because it
involves accepting terms, holding credentials, and granting access.

## Why not a GitHub App

An App is the tidier-looking answer — scoped permissions, no seat, obviously not a person — and
it is the wrong one here.

**A GitHub App's bot user cannot be an issue assignee.** Measured against a live repository: the
"can this user be assigned" endpoint returns 404 for a bot user, and the assignment request
returns 403. Since a claim's whole purpose is to be visible in the assignee field where people
already look, an App would silently reduce GitHub to a message-only surface while appearing to
be the more correct choice.

Use an App for things that are genuinely app-shaped — checks, webhooks, status. Not for holding
work.

## One account per Igor

Not one per organization, and not one per running process.

**Not one shared account**, because it breaks claiming rather than merely blurring it. An Igor
verifies its claim by asking "am I among the assignees?". If every Igor posts as `acme-igor`,
each one reads back its own name and concludes it holds the item — so two Igors work the same
issue and the settle-interval protocol fails silently.

**Not one per process**, because processes of the same Igor are interchangeable. Twenty backend
workers are still one teammate as far as anyone reading the issue is concerned.

An Igor is a named set of capabilities, so an Igor that does two jobs is one account. If
`milton` handles both backend and frontend work, that is one machine account named `milton`,
not two.

## Creating one

1. **Pick a name that reads as a teammate, not as infrastructure.** It appears in the assignee
   field, in PR authorship, and in review threads. `acme-igor-backend` or `milton-acme` both
   work; `svc-bot-01` does not.

2. **Use a distinct email you control.** Plus-addressing works and keeps them in one inbox:
   `engineering+milton@acme.com`. Do not reuse a personal address — GitHub allows one account
   per address, and you will need the inbox later for recovery.

3. **Register the account.** GitHub's Terms of Service permit machine accounts explicitly: a
   person or entity may maintain one free personal account plus machine accounts, provided each
   machine account is used only for running a machine. Do not create them by automated
   registration, which the same terms forbid.

4. **Enable two-factor authentication with a shared TOTP secret**, stored in the organization's
   password manager. Never a personal phone: an account whose second factor lives on one
   employee's device becomes unrecoverable when they leave.

5. **Add it to the organization, or as an outside collaborator with write access.** It must have
   write access to be assignable at all — this is the step people forget, and the symptom is
   confusing, because GitHub accepts an assignment request naming a non-collaborator and then
   silently drops them. Igor reads assignments back for exactly this reason and will tell you.

6. **Issue a fine-grained personal access token**, scoped to the specific repositories that
   Igor works, with:
   - Issues: read and write
   - Pull requests: read and write
   - Contents: read and write
   - Metadata: read

   Not admin, not organization-level permissions, not classic tokens with `repo` scope. An Igor
   that cannot administer a repository cannot be tricked into administering one.

7. **Put the token in `GH_TOKEN`, in this Igor's own environment.** Igor shells out to `gh`,
   and `gh` takes its identity from that variable — so `GH_TOKEN` *is* who the Igor is. One
   per Igor: a shared token reintroduces the identification problem from the other direction,
   because the audit trail can no longer say which Igor acted.

   Under the systemd template that means `/etc/igor/<role>.env`, not the shared
   `/etc/igor/env`. Seat tokens go in the shared file, because a seat is a subscription
   several Igors may draw from; identity does not.

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

**Discord** identifies a bot by its application, and a claim there is a message rather than a
field — so identity has to be textual, and the claim message carries it. Identity must be
structural where the claim primitive is structural, and textual where the claim is a message.

Measured rather than assumed, but only from documentation and trial accounts; none has run an
Igor yet.

## What this costs

On paid GitHub plans a machine account consumes a seat like any member. For a handful of Igors
this is small next to the model subscription, and it is the reason accounts are per Igor rather
than per process — processes are free, accounts are not.

## Separately: which seat pays

The GitHub account and the Claude subscription seat are different things and are configured
separately. A machine account says who acts on the repository; a seat says whose allowance pays
for the reasoning (§6.5.1). An Igor may act as `milton` while spending from a pool that includes
three people's spare capacity, and that is the normal arrangement rather than an edge case.

Provisioning a seat is a different conversation with a different person — the one whose
allowance it is. [`seats.md`](seats.md) is the page to send them.

## Revoking

Because the account is per Igor, retiring one is: revoke its token, remove it from the
organization, and leave the account dormant. Its history stays attributable, which is the point
of it having had a name.
