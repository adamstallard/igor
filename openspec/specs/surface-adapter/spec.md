# surface-adapter Specification

## Purpose
TBD - created by archiving change core-igor-loop. Update Purpose after archive.
## Requirements
### Requirement: A surface plays a tracker role, a code-host role, or both

The adapter interface SHALL separate two roles a surface may play: a **tracker**, where work is
discovered, claimed, verified and reported on; and a **code host**, where an artifact is
produced and linked back to the item. A single surface MAY implement both.

#### Scenario: One surface implementing both roles

- **WHEN** GitHub is configured as both tracker and code host
- **THEN** discovery, claiming and artifact production all use that adapter
- **AND** nothing above the adapter layer depends on both roles being the same surface

#### Scenario: Roles played by different surfaces

- **WHEN** a tracker holds the item and a separate code host holds the artifact
- **THEN** the item is claimed on the tracker and the artifact produced on the code host
- **AND** the artifact is linked back using the tracker's own convention

### Requirement: Linkage between artifact and item is adapter-supplied

Each adapter SHALL supply the convention linking an artifact to its item, because that
convention varies by tracker. The loop MUST NOT hardcode any linkage form.

#### Scenario: Linkage convention differs by tracker

- **WHEN** one tracker links by a reference in the artifact body and another links by branch name
- **THEN** each adapter applies its own convention
- **AND** the loop's behaviour is identical in both cases

### Requirement: Adapters normalize candidates to a specified shape

A tracker adapter SHALL return candidates carrying: `id`, `url`, `title`, `body`, `author`,
`state`, `labels`, linked `paths`, `age`, and whether work is already **in flight**. This shape
is normative rather than per-adapter, because lane predicates are only as portable as it is
consistent.

#### Scenario: Normalized candidate returned

- **WHEN** an adapter returns a candidate from a search
- **THEN** every field of the normalized shape is present
- **AND** a predicate written against those fields evaluates without adapter-specific handling

#### Scenario: Predicates portable across adapters

- **WHEN** the same lane is evaluated against candidates from two different trackers
- **THEN** the predicate logic is identical
- **AND** no tracker-specific branch is required to evaluate it

### Requirement: Claim verification also reports a stop

A tracker adapter's claim verification SHALL return one of **held**, **lost**, or **stopped**,
so that a stop directed at an Igor has a defined path in. Stop was pulled forward from the
conversational layer, and an obligation to honour it is unimplementable without an input.

Detection reuses the re-read the Igor already performs, rather than adding an operation. It
follows that **"immediately" means on detection and without further condition** — not
instantaneously. Long-running execution SHALL therefore re-check at checkpoints rather than
only once per cycle, since a cycle interval is far longer than someone watching an Igor go
wrong will tolerate.

#### Scenario: Verification reports a held claim

- **WHEN** the Igor still holds the claim and no stop is present
- **THEN** verification returns held

#### Scenario: Verification reports a stop

- **WHEN** a stop has been issued against a claimed item
- **THEN** verification returns stopped
- **AND** it does so without any permission check

#### Scenario: Stop is detected during long execution

- **WHEN** execution runs longer than one checkpoint interval
- **THEN** the stop is detected at a checkpoint rather than at the end of the task

### Requirement: Adapters report work already in flight

Work-in-flight is a field of the normalized candidate, and this operation is what populates
it. It is not a second, separately-queried fact — one source, so triage and any other reader
cannot disagree about it.

A tracker adapter SHALL answer whether a given item already has work in flight, using whatever
signal that surface provides.

#### Scenario: In-flight work detected

- **WHEN** an item already has a linked artifact open against it
- **THEN** the adapter reports work in flight for that item

#### Scenario: Detection differs while the answer does not

- **WHEN** one adapter detects in-flight work by linked pull request and another by linked branch
- **THEN** both report the same normalized fact
- **AND** the loop's response is identical

### Requirement: A GitHub adapter ships with this change

A GitHub adapter SHALL implement both the tracker and code-host roles: searching issues,
claiming, verifying a claim, reporting status, producing a draft pull request, and linking it to
the item. An Igor on GitHub is a GitHub App, so the adapter SHALL claim by the Igor's
`igor:<role>` label and SHALL NOT claim by assignment. Machine-user identities are not
supported.

#### Scenario: GitHub adapter satisfies the interface

- **WHEN** the GitHub adapter is used as the only configured surface
- **THEN** discovery, claiming, verification, reporting, artifact production and linkage all
  succeed through it

#### Scenario: Claim is a label

- **WHEN** the GitHub adapter claims for an Igor
- **THEN** it adds the Igor's `igor:<role>` label and does not attempt assignment

### Requirement: On GitHub, every call an Igor makes acts as its App

Every request to GitHub made by `igor run` or `igor serve`, through `gh` or `git`, SHALL
authenticate as the installation of the Igor's App that covers the repository. That covers
discovery, claiming, comments, label reads and writes, issue events, the Git Data API commits
that publish work, pull requests, merges, the state branch, and cloning and fetching a working
tree. No such request SHALL use an ambient `GH_TOKEN` or `GITHUB_TOKEN`, a host's `gh` login, or
a credential helper from a git config file.

A token SHALL reach only the process making the call: it is set in that child's environment and
nowhere else. It SHALL NOT be written to the Igor's own environment, to disk, or to any git
config, and a working tree SHALL hold no credential after it is cloned.

Commands that take no role (`propose`, `reconcile`, `init`, `promote`, `observe`, `budget`) are
a person's, and keep the person's own `gh` login.

#### Scenario: A gh call acts as the App

- **WHEN** an Igor claims, comments, labels or opens a pull request
- **THEN** GitHub records the action as the App's bot account

#### Scenario: An ambient token is not used

- **WHEN** `GH_TOKEN` or `GITHUB_TOKEN` is set in the environment `igor serve` starts with
- **THEN** no request the Igor makes authenticates with it

#### Scenario: A clone acts as the App and keeps nothing

- **WHEN** a working tree is cloned or fetched for an item
- **THEN** git authenticates with the App's token for that one command
- **AND** neither the tree's git config nor any global git config holds a credential or a
  credential helper afterwards

#### Scenario: A person's command is unchanged

- **WHEN** a person runs `igor propose`
- **THEN** it acts as that person's `gh` login, as before

### Requirement: An App token is minted on demand and used only in the first half of its life

The Igor SHALL mint installation tokens itself from the App ID and private key, and hold each in
memory only. It SHALL mint a new token once less than half of the current one's life remains,
and SHALL NOT start a call with a token past that point. Each process mints its own.

#### Scenario: A long-running Igor never uses an expired token

- **WHEN** an Igor has served for longer than a token's life
- **THEN** every call it makes uses a token with at least half of its life left

#### Scenario: Calls reuse a fresh token

- **WHEN** many calls run within the first half of one token's life
- **THEN** they share that token rather than each minting another

### Requirement: An Igor knows its own bot account

At startup, before discovery, an Igor SHALL read its App's bot login, `<slug>[bot]`, and that
account's numeric user id from GitHub, and hold both for the life of the process. Every
comparison of an actor or author with the Igor itself SHALL use them: who added or removed a
label, who wrote a claim comment, who opened a pull request. Where a read reports the actor's
numeric id, the comparison SHALL use the id.

The Igor SHALL NOT read its identity from `GET /user`, which describes a user and not an App.

#### Scenario: The identity is the App's bot

- **WHEN** an Igor acting as the App `acme-reviewer` starts
- **THEN** its identity is `acme-reviewer[bot]` with that account's numeric id

#### Scenario: Its own label removal is recognised by id

- **WHEN** the latest `unlabeled` event for the Igor's label has an actor whose id is the
  Igor's own
- **THEN** the Igor reads the removal as its own release, not a stop

#### Scenario: A read that spells the login differently still matches

- **WHEN** one GitHub read reports the Igor's account as `acme-reviewer[bot]` and another as
  `acme-reviewer`
- **THEN** both are recognised as the Igor itself

### Requirement: An Igor that cannot act as its App does not start

`igor run` and `igor serve` SHALL verify, before discovery, that the Igor can act as its App on
every repository the role works and on the lore repository, and SHALL refuse to start otherwise,
naming the reason:

- missing or incomplete credential variables in its environment, naming each missing variable;
- both `GITHUB_APP_PRIVATE_KEY_FILE` and `GITHUB_APP_PRIVATE_KEY` set, naming both;
- a private key that cannot sign;
- GitHub refusing the App's credentials;
- the App not installed on the account holding a repository, naming the repository;
- a repository the installation does not reach, naming it;
- repositories on more than one account, naming the accounts;
- a missing permission, naming each: Contents, Issues and Pull requests read and write.

The Igor's access SHALL be read from its installation's permissions, never from a collaborator
record, which reports an App's bot account as having no write access.

A missing Workflows write permission SHALL NOT stop the Igor. It is reported at startup, and a
publish that touches `.github/workflows/` without it SHALL fail naming the permission.

Where GitHub refuses the App's credentials while the Igor runs, the Igor SHALL take no new item
and SHALL say which identity was refused. It SHALL resume once a token mints again, without
waiting for an item to probe it.

#### Scenario: Missing credentials refuse the start

- **WHEN** `igor serve reviewer` starts with `GITHUB_APP_IDENTITY=reviewer` and no `GITHUB_APP_ID`
  in its environment
- **THEN** it refuses to start, naming the identity and `GITHUB_APP_ID` as missing
- **AND** it makes no request to GitHub as anyone else

#### Scenario: Two key variables refuse the start

- **WHEN** `igor serve reviewer` starts with both `GITHUB_APP_PRIVATE_KEY_FILE` and
  `GITHUB_APP_PRIVATE_KEY` set
- **THEN** it refuses to start, naming both variables, rather than choosing one
- **AND** it makes no request to GitHub

#### Scenario: An App not installed on a repository refuses the start

- **WHEN** the role works a repository on an account where the App is not installed
- **THEN** the Igor refuses to start, naming the repository and the App

#### Scenario: A missing permission refuses the start

- **WHEN** the App's installation lacks Issues write
- **THEN** the Igor refuses to start, naming Issues write as missing

#### Scenario: An App's collaborator record is not read as its access

- **WHEN** GitHub reports the Igor's bot account with `permissions.push` false on a repository
  its installation can write
- **THEN** the Igor treats the repository as writable

#### Scenario: A credential refused mid-run stops new work and recovers

- **WHEN** GitHub stops accepting the App's credentials while the Igor serves
- **THEN** the Igor claims nothing new and says which identity was refused
- **AND** it takes work again once a token mints, without spending an item to find out

### Requirement: An adapter declares how a claim is expressed

A tracker adapter SHALL declare its native **holder field**, a field naming who has the item.
This declaration determines how a claim is *expressed*, not how it is resolved.

Which field that is belongs to the adapter, not to the loop. Linear's is `delegate`, because an
app identity there may hold the latter and not the former. GitHub's is the `igor:<role>` label,
because an Igor on GitHub is a GitHub App, whose bot user cannot be an assignee. Naming
"assignee" above the adapter would make one surface's vocabulary into everyone's.

An adapter declaring a holder field SHALL also declare whether it holds a **single value** or a
**list**, and whether it is distinct from the item's assignee. GitHub's `igor:` labels are a
list, and are distinct from the assignee. Linear's
delegate is a single value, and is distinct from the assignee. Where the two are distinct, the
holder field names the Igor and the assignee names the person accountable. The loop reads these
declarations to resolve claims and to decide which items it may claim, and never the field's
name.

#### Scenario: Native holder field declared

- **WHEN** an adapter declares a native holder field
- **THEN** a claim sets that field
- **AND** the field's value is the signal humans read

#### Scenario: The loop does not name the field

- **WHEN** two trackers express a claim through differently-named fields
- **THEN** the loop's behaviour is identical
- **AND** nothing above the adapter refers to either field by name

#### Scenario: Single-valued and list holder fields resolve differently

- **WHEN** one adapter declares a single-valued holder field and another a list
- **THEN** on the first, the later write holds the item
- **AND** on the second, any other holder present after the settle interval means the claim is lost

#### Scenario: A holder field distinct from the assignee

- **WHEN** an adapter declares its holder field distinct from the assignee, as GitHub's `igor:`
  labels and Linear's delegate are
- **THEN** the loop does not claim an item assigned to a person unless the holder field names
  this Igor

