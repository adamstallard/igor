# signed-publishing: constraints, rejected alternatives and rationale

## Rationale
- **Rationale: No model step runs a prose script or posts.**
  Prose keeps its pass tokens as plain files in a token store, so a step that can write the store can forge a token without running prose's first call. A worker granted `prose.py check` and `prose.py sign` could run them only with a store it can write: run as the worker user, the first call cannot write Igor's git directory and issues no token. A token directory the worker's group can write makes the scripts work, and so lets the worker forge a token. A model step does not post for the same reason: Igor's code posts only text it verified against a token Igor issued.
  Evidence: measurement 0.9 in the change's design, [signed-publishing design.md, *Measurements*](https://github.com/adamstallard/igor/blob/cdb5091c89f65e1f6aca4042cffb659219c56eaf/openspec/changes/signed-publishing/design.md)
