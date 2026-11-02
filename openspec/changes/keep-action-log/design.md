## What the stream holds for a shell call's result

**Measured 2026-10-13, on Claude Code 2.1.296**, first from a session transcript
(`~/.claude/projects/<project>/<session>.jsonl`), then directly from `claude -p --output-format
stream-json --verbose`. In the stream, a `Bash` call running
`sh -c 'echo out; echo err >&2; exit 3'` produced:

- in the user message, the tool result
  `{"type":"tool_result","content":"Exit code 3\nout\nerr","is_error":true}`;
- at the top level of the event that carries that user message, a `tool_use_result` string
  `"Error: Exit code 3\nout\nerr"`, the stream's counterpart of the transcript's `toolUseResult`.

The transcript showed the same shape: a failing call's result has `is_error: true` and text
beginning `Exit code <n>`, and its `toolUseResult` begins `Error: Exit code <n>`.

Two facts follow:

1. **The exit code exists only as the `Exit code <n>` prefix of an error result.** No structured
   field holds it. In the transcript, a successful call's result carried no code, and the spec
   takes `is_error: false` as exit 0. So the spec reads the code from that prefix, in three cases
   (*A shell call's exit code is read from its result's text*). A code is taken only where the
   text begins exactly `Exit code <n>`, so a change to that format leaves an error with its status
   and no code, never a wrong code.
2. **Standard output and standard error arrive merged in one text,** with no marker between
   them. In this measurement standard output came first; whether the order follows the order
   they were written was not measured. The log keeps them as one output and cannot tell them
   apart.
