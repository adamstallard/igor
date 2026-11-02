## ADDED Requirements

### Requirement: A tracker adapter finds the comments that mention the Igor

A tracker adapter SHALL return the items in given repositories on which the Igor's own account
is mentioned, in a comment or in the item's body, with the id, link, author, author's numeric id
and text of each comment or body that mentions it. A candidate that arrives from a mention SHALL
carry those as its requester, beside the normalized shape.

#### Scenario: A mention arrives with its requester

- **WHEN** a person comments `@acme-backend can you look at this?` on an issue
- **THEN** the adapter returns the issue, with that comment's id, link, author, author's numeric
  id and text as its requester

#### Scenario: A mention in an issue's body

- **WHEN** a person opens an issue whose body mentions `@acme-backend`
- **THEN** the adapter returns the issue, with the issue's id and link, its author and the
  author's numeric id, and its body's text as its requester

### Requirement: A tracker adapter reads whether a party may write to a repository

A tracker adapter SHALL report whether a party has write access to a repository, from the
surface's own permission record: on GitHub, `user.permissions.push` from the collaborator
permission endpoint, never the `permission` string. A read that fails SHALL report no write
access.

#### Scenario: A maintainer has write access

- **WHEN** the endpoint reports `permission: write` and `permissions.push: true` for a maintainer
- **THEN** the adapter reports write access

#### Scenario: A failed read reports no write access

- **WHEN** the permission endpoint returns an error
- **THEN** the adapter reports no write access

### Requirement: A tracker adapter opens an issue and finds one that links a comment

A tracker adapter SHALL open an issue in a given repository with a given title and body, and
SHALL find an existing issue whose body links a given comment.

#### Scenario: The issue is opened where it was asked

- **WHEN** the Igor asks the adapter to open an issue in `acme/web`
- **THEN** the issue is opened in `acme/web` and its link is returned

#### Scenario: An issue linking the comment is found

- **WHEN** an issue's body links a comment and the adapter is asked for issues linking it
- **THEN** that issue is returned
