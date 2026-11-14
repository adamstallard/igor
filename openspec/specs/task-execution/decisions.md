# task-execution: constraints, rejected alternatives and rationale

## Rationale
- **Rationale: A shell call's exit code is read from its result's text.**
  Claude Code's output stream holds no field for a shell call's exit code. A failing call's
  result is an error whose text begins `Exit code <n>`, and a successful call's result carries
  no code, so the code can only be parsed from that prefix. Taking it only where the text begins
  exactly that way is a choice: a changed format then yields no code rather than a wrong one.
  Evidence: on Claude Code 2.1.296, on 2026-10-13, `claude -p --output-format stream-json --verbose` running `sh -c 'echo out; echo err >&2; exit 3'` gave the tool result `{"type":"tool_result","content":"Exit code 3\nout\nerr","is_error":true}`, and the event's `tool_use_result` was `"Error: Exit code 3\nout\nerr"`; a session transcript showed the same shape, measured for [adamstallard/igor#188](https://github.com/adamstallard/igor/pull/188)
- **Rationale: The action log keeps a call's output, not a file's contents.**
  The requirement keeps a shell call's output as the stream gives it, standard output and
  standard error together, because the stream merges them in one text with no marker between
  them, so the log cannot tell them apart.
  Evidence: in the same 2026-10-13 measurement on Claude Code 2.1.296, the result text was `Exit code 3\nout\nerr`, standard output first; whether that order follows the order of writing was not measured, [adamstallard/igor#188](https://github.com/adamstallard/igor/pull/188)
