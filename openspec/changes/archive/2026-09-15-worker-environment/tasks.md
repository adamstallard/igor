## 1. The worker's environment

- [x] 1.1 Build the child environment explicitly: `PATH`, `HOME`, the proxy and TLS variables
      when set, and one seat token
- [x] 1.2 `WorkerInput` carries it, so an injected runner sees what the real one would spawn with
- [x] 1.3 `spawn` passes it, and inherits nothing
- [x] 1.4 An unset `token_env` throws naming the variable; an unnamed one forwards the ambient
      token
- [x] 1.5 Tests: no `GH_TOKEN`, no other seat's token, through the real spawn path

## 2. The seat that pays

- [x] 2.1 `Gate` carries the chosen seat's `token_env` beside its id
- [x] 2.2 `ExecuteOptions.seatTokenEnv`, assigned explicitly rather than by spread
- [x] 2.3 Tests: the token in the worker's environment is the one the gate chose

## 3. Commands

- [x] 3.1 `commands` on the role, parsed and validated
- [x] 3.2 Monotonic in `capabilitiesOf`: siblings union, a widening role is rejected
- [x] 3.3 Rendered as `--allowed-tools "Bash(…)"`, alongside the existing permission mode
- [x] 3.4 `role explain` reports it with its provenance
- [x] 3.5 Tests: narrowing, widening rejected, sibling union, and the flag that reaches the CLI

## 4. Documentation

- [x] 4.1 `README.md` — what a role declares, and why the list is not read from the worked repo
- [x] 4.2 `igor.config.example.yaml` / the org role example
