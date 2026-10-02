## MODIFIED Requirements

### Requirement: A public destination refuses privately-sourced entries

Where the destination repository is public, proposing SHALL refuse candidates whose provenance
cites a private repository. The destination's visibility MAY be declared in configuration so
the check does not require a network call.

The check SHALL read each provenance item's `source` and MUST NOT reconstruct one from its
`url`. Every citing item therefore resolves to one of three states, and proposing SHALL act on
all three:

- **Known public.** Proposed.
- **Known private.** Refused, naming the source.
- **Undeterminable** — a source of a kind Igor cannot ask about, or one it can ask about and
  could not read. Refused, naming the source and saying which of the two it was.

Refusing what cannot be established is the substance of this. A guard that lets an item through
because it learned nothing about it reports success for the one case it exists to catch, and
reports it in silence. The two undeterminable cases are distinguished in the refusal because
their remedies are different: a kind Igor cannot query is a declaration to make, and a
repository it could not read is a credential to fix — or a private repository it cannot see
well enough to say so, which is the same refusal for a better reason.

Configuration MAY declare a source public, which makes it known rather than undeterminable.
Without a way to say so, refusal is a wall in front of anyone mining where Igor cannot query
rather than a policy they can answer.

An item carrying no citation — no `url` and no `source` — is authorship rather than derivation,
and SHALL NOT be checked. It brought nothing in from anywhere, so nothing private reaches a
public store through it.

#### Scenario: Private provenance into a public store

- **WHEN** the destination is public and a candidate cites a private repository
- **THEN** proposing refuses and names the offending repository

#### Scenario: Private destination is unrestricted

- **WHEN** the destination is private
- **THEN** provenance from private repositories is accepted

#### Scenario: A source Igor cannot ask about

- **WHEN** the destination is public and a candidate cites a source that is not a repository
  Igor can query — a GitLab host, an issue tracker
- **THEN** proposing refuses, naming the source and stating that its visibility could not be
  established
- **AND** it is not proposed on the grounds that nothing was found against it

#### Scenario: A source that could not be read

- **WHEN** the destination is public and a candidate cites a GitHub repository the credential
  cannot reach
- **THEN** proposing refuses, naming the repository and saying it could not be read
- **AND** it does not report the repository as private, which is not what was observed

#### Scenario: A hand-authored candidate into a public store

- **WHEN** the destination is public and a candidate's only provenance is an authorship item of
  `{author, at}`
- **THEN** it is proposed, nothing about it citing a source whose visibility is at issue

#### Scenario: A source declared in configuration

- **WHEN** the destination is public and configuration declares a candidate's source public
- **THEN** the candidate is proposed without a network call for that source
