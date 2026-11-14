# stuck-conditions: constraints, rejected alternatives and rationale

## Rationale
- **Rationale: A seat's refused credential is a condition on that seat.**
  Nothing on the machine separates a revoked credential from a working one, so the record of runs
  the provider refused is the only account of a refused credential, and the seat's own reading
  cannot overrule it.
  Evidence: `claude -p '/usage'` exits zero whatever the token is, and `claude auth status` reports the same fields for a valid `setup-token` and for the string `garbage`, measured in adamstallard/igor#56
- **Rationale: A credential refusal is the provider's verdict on a run that did not finish.**
  A run that exited non-zero did not finish. A run that exited zero may have published a pull
  request, so it counts as unfinished only where its envelope, the JSON result the worker prints
  as it exits, says it errored. A looser test, which also counts a zero exit whose envelope says
  nothing either way, suits deciding whether to save a run's envelope as a possible refusal,
  where a wrong call only saves one envelope too many. Deciding to stop a seat, a wrong call takes a
  working seat out of use, and does so again each time a finished run repeats an old
  authentication error in its output.
  Evidence: a run that finished while repeating a stale 401 stopped a working seat, and the loose guard copied from the usage-limit check was wrong for this decision, bug-hunter findings 3 and 5 on adamstallard/igor#65
- **Rationale: Reporting tells a refused credential from an unreadable one, and clears nothing.**
  The two are fixed by different people in different places: a token this machine could not read
  is fixed on the machine, by whoever runs the Igor; a token the provider read and refused is
  fixed with the provider, by whoever owns the seat. A report that merges them sends somebody to
  check a path or a variable that is correct. Reading the report clears nothing, and no command
  clears the condition, because a clear on request would serve an operator who believes they
  fixed the credential and has not, and the seat would go straight back to failing items.
  Evidence: budget reporting showed a stopped seat as having an unreadable credential when its usage reading failed, bug-hunter finding 1 on adamstallard/igor#65
