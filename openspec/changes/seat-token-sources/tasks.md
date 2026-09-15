## 1. A shared resolution

- [x] 1.1 `TokenSource` (`tokenEnv` / `tokenFile` / `tokenCommand`) and `resolveToken`, in
      `src/budget.ts`
- [x] 1.2 `resolveToken` reads a file and trims it, or runs a command and trims its stdout,
      alongside the existing environment-variable read
- [x] 1.3 Undefined return means the source names nothing; a throw carries the reason a caller
      wraps with its own subject (`seat "x"` vs `the chosen seat`)
- [x] 1.4 Tests: each of the three resolves, and each of the three fails loudly when it cannot
      (unset variable, unreadable or empty file, failing or silent command)
- [x] 1.5 `token_command` runs under a bounded, provisional timeout, killed and reported
      unreadable rather than left to hang `igor budget` or a worker spawn indefinitely

## 2. Wiring it through

- [x] 2.1 `Seat` gains `tokenFile` / `tokenCommand` alongside `tokenEnv`
- [x] 2.2 `parseOrgBudget` parses both and rejects a seat naming more than one token source
- [x] 2.3 `readUsage` resolves through `resolveToken` instead of reading `tokenEnv` directly
- [x] 2.4 `Gate.tokenEnv` becomes `Gate.token: TokenSource`, carrying whichever the chosen seat
      names
- [x] 2.5 `workerEnv` becomes async, takes a `TokenSource`, and resolves through the same
      function
- [x] 2.6 `ExecuteOptions.seatTokenEnv` becomes `seatToken: TokenSource`; `loop.ts` threads the
      gate's `token` through unchanged in shape
- [x] 2.7 Tests updated for the new shapes; `execute.ts` gains coverage for `token_file` and
      `token_command` reaching the worker

## 3. Saying so

- [x] 3.1 `renderBudget`'s "cannot pay" warning checks all three sources, not `token_env` alone
- [x] 3.2 README, `docs/deployment.md`, `docs/seats.md`, `docs/architecture.md`, and the example
      config mention the two new sources where they previously implied `token_env` was the only
      way in
- [x] 3.3 `docs/deployment.md`'s `LoadCredential=` paragraph describes the recipe instead of
      forward-referencing this issue
- [x] 3.4 `deploy/igor.service` shows the `LoadCredential=` line as a commented-out example
      beside `EnvironmentFile=`; `deploy/env.example` points to it
