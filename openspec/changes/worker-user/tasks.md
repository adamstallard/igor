## 0. Order and dependencies

- [ ] 0.1 Build on `main` as it stands at gate two, when the implementation is pushed after this
      specification is approved, and after #171's seat code has merged (0.12). The start-up
      probe covers every credential path the configuration has by then:
      `GITHUB_APP_PRIVATE_KEY_FILE` and #171's `seatKey`. #171 removes `token_file`, so no seat
      token file is left to probe.
- [x] 0.2 Run measurements 6.1 to 6.5 before building sections 2 to 4; 6.6 informs the docs, and
      6.7 runs before 8.2 ships. Record each result in
      `design.md`, including any that contradicts it, and change the design before the code where
      one does. Done on 2026-10-18: `design.md`, *Measurements*. 6.2 changed the kill (proposal,
      decision 27) and 6.5 the sudoers file (decision 28).
- [ ] 0.3 Record a `sudo` spawn failure of the worker, and a refused check of 5.8's or 4.1's
      (the token-free `sudo -n -u <worker> true` before a spawn or a kill), under a cure key
      scoped to the instance, `igor@<role>-<rank>`; a cure key is the key `condition-backoff`
      (#101) records a failure under. #101's code on `main` has scopes for a role, a seat and an
      Igor; add the instance scope. A condition it opens stops only that instance taking new
      items, and the instance's next spawn that succeeds, the probe's, clears the condition. The
      Igor does not exit on it (#82). Test: one refused spawn stops nothing; a second stops that
      instance and no other rank of the role; the probe's successful spawn clears it (proposal,
      decisions 31 and 53; Adam, 2026-10-24)
- [ ] 0.4 If #137 (`carry-what-a-tree-holds`) has archived, build 3.3's publishing of a changed
      link as a link, and 3.1's publishing of a changed gitlink as a pointer. If not, build both
      stops, file an issue asking whichever of #137 and this change archives second to replace
      those two stops with the publishing and drop the conditions on #137 from *The Igor reads no file on
      the worker's behalf through a link* and *Nothing the worker writes is executed by the
      Igor*, and link it here.
- [ ] 0.5 If #153 (`signed-publishing`) has merged, its model steps go through 1.4, and the Igor
      runs prose's first call and makes its trailers as 2.5 says. If not, file an issue asking
      #153 to run its steps through this change's spawn, to have them edit and run no signing
      script, to have the Igor run prose's first call and both signing calls, and to have the
      trailers made against the tree 2.5 stages, and link it here.
- [ ] 0.6 If #174 (`pinned-skills`) has merged, add `skills_dir` to the probe in 5.1. If not,
      file an issue asking #174 to add it, and link it here.
- [ ] 0.7 If #189 (`loop-verifies-commands`) has merged, its checks go through 1.4's spawn and
      run after 3.2 records the tree, and the Igor publishes that recorded tree. If not, file an issue
      asking #189 to run its checks on the tree the Igor recorded and to publish that tree, as
      *The Igor publishes the tree it recorded before the checks* requires, and link it here.

- [ ] 0.8 1.1 and 8.2 need instances named `<role>-<rank>`, with the rank always written, so
      that `igor-worker-%i` is the worker user's name (Adam, 2026-10-17). #179
      (`concurrent-instances`) specifies that naming, and the load-time check on role names that
      keeps `igor-worker-<role>-<rank>` within 32 characters (Adam, 2026-10-18), in its
      requirement *A process is named by its role and rank*. If #179 has merged, build on it.
      Otherwise, file an issue asking whichever of #179 and this change is built second to name
      instances that way and check role names, and link it here.
- [ ] 0.9 The exit status in 5.1 and the restart lines in 8.2 come from #82
      (`stopped-scope-visible`): 78 for a refused start, in *A process that refuses to start
      exits with status 78*, with `Restart=on-failure`, `RestartPreventExitStatus=78` and
      `RestartSec=30s`. If #82 has not merged, file an issue asking whichever of #82 and this
      change is built second to exit 78 on a refused start and set those lines, and link it here.
- [ ] 0.10 Whichever of this change and #174 is built second makes the `sudo` spawn of 1.1 run
      #174's kill of the worker user's processes and its reset of the worker's home before each
      model step, as `design.md` (*The worker is started through `sudo`*) says. If #174 has
      not merged, file an issue saying so, and link it here.
- [ ] 0.11 Decision 24's `IGOR_RUN_TOKEN` is #171's implicit local seat, which #171's code,
      built first (0.12), gives `run`. Build 1.3 on that seat.
- [ ] 0.12 Build order (Adam, 2026-10-21; proposal, decision 46; issue #204): build this
      change's code only after #171's seat code and #217's code have merged, although #171
      archives after this change. On `main` a seat names its token by `token_env`, `token_file`
      or `token_command`, any of them free, so a lore commit could route the App's key to a
      worker as its seat token; #171 fixes each seat's source. #217 adds `rememberSecret`, which
      1.9 calls. If either has not merged when gate two starts, stop and ask Adam.

## 1. Starting the worker as another user

- [ ] 1.1 `serve <instance>` runs its worker as `igor-worker-<instance>`, where `<instance>` is
      the argument the unit passes as `%i`, joined as given, without splitting it into a role
      and a rank; `run` never runs the worker as a worker user. `igor.config.yaml` gains no key for it.
      A sibling rank acting for a gone rank (2.4a) builds that rank's name the same way, as
      `igor-worker-<role>-<rank>` from its role and the gone rank's number. Build the Igor's own
      name and the sibling's behind one function. Tests: `serve generalist-2` gives `igor-worker-generalist-2`; `serve
      code-review-1` gives `igor-worker-code-review-1`.
- [ ] 1.2 Under `serve`, `claudeWorker` spawns
      `sudo --non-interactive --user=<worker> --preserve-env=<names> -- /usr/bin/env PATH=<path> <claude> …`.
      `<names>` is every variable `workerEnv` built except `PATH` and `HOME`, and `<claude>` is
      the absolute path the Igor resolves on its own `PATH`. The worker's own flags are
      unchanged, and so are `detached` and the stdio pipes, except that the prompt and the
      system prompt leave the arguments (1.7).
- [ ] 1.3 Under `run`, the spawn is what it is today, as the Igor's own user, with the token in
      `IGOR_RUN_TOKEN` as the seat's token in the worker's environment (proposal, decision 24;
      #171 defines the seat).
- [ ] 1.4 Every other `claude -p` the Igor starts with a tree as its working directory goes
      through 1.2's spawn, with the same environment rules. Triage and usage reads, which run
      outside any tree, do not; they run as the Igor with a seat's token in their environment
      (proposal, decision 21) and take their prompt as 1.7 says.
- [ ] 1.5 Tests (with an injected command, no real `sudo`): the argv for each mode; the seat token
      in no argv element; `--preserve-env` naming exactly `workerEnv`'s keys less `PATH` and
      `HOME`; no prompt text in any argv element; `run` spawning without `sudo` even where a user named `igor-worker-<role>-<rank>`
      exists; a model step in the tree after the worker spawned through `sudo` as the worker
      user.
- [ ] 1.6 No prose or bug-hunter script goes through 1.2's spawn: the Igor runs them as the
      service user (2.5; proposal, decision 15). If #153 has not merged, the issue 0.5 files
      asks for this too.
- [ ] 1.7 Every `claude -p` the Igor starts takes its prompt on stdin, its system prompt from
      `--system-prompt-file`, and any text appended to it from `--append-system-prompt-file`: `claudeWorker` (`src/execute.ts`), `runClaude` (`src/triage.ts`),
      #143's seat probe and #174's startup check where those are built. `runUsage` is not among
      them: task 1.10 removes it. The Igor writes the system prompt file before the spawn and removes it after the
      process exits. For a process running as the worker user, it goes in a directory the Igor
      owns beside the tree, `<tree>-prompt`, mode `2750`, group the worker user's primary group, so the worker user can
      read it and not write it; never in the tree or the
      outbox. For a process running as the Igor, it goes in a directory only the Igor can read. Build after measurement 6.9, which confirmed that `claude -p` reads its prompt from stdin. Tests: each call's argv holds no prompt, no `--system-prompt` and
      no `--append-system-prompt`;
      the prompt arrives on stdin; the file exists during the call and not after it, also when
      the call fails.
- [ ] 1.8 Every temporary file the Igor creates under `/tmp` goes in a `0700` directory only it
      can read, never directly in `/tmp`, which the workers share with it under the unit. Test: each
      temporary file's directory has mode `0700` and the Igor's owner.
- [ ] 1.9 Every secret a process running as the worker user gets is registered with
      `rememberSecret` (#217) before the spawn. Under `serve` those are the seat's token, which
      #217's `resolveToken` already registers, and a forwarded proxy URL's user info, which
      #217 registers in `workerEnv`, so only a test is owed for each; #189's checks get no
      secret except that user info, with the proxy settings (proposal, decisions 41 and 47). Keep `SSH_AUTH_SOCK`, `GPG_AGENT_INFO` and any
      other agent socket variable out of every environment the Igor builds for a worker, a
      model step or a check; `workerEnv` on `main` already passes neither of those two. A secret shorter than 8 characters fails the run, naming its source, and nothing is
      spawned. If #217 has not merged, stop and ask Adam: this task calls its code. Tests: with
      `SSH_AUTH_SOCK` and `GPG_AGENT_INFO` set in the Igor's environment, neither is in the
      environment of a worker, a model step or a check, in either mode; a seat token quoted in
      the worker's output is `[redacted]` in the stored transcript; a 7-character seat token
      starts no worker.
- [ ] 1.10 Remove the live `/usage` read (proposal, decision 40; #143's decision 37):
      `readUsage`, `runUsage`, `hasSubscription` and `parseUsage` in `src/budget.ts`, and the
      paths of `chooseSeat`, `budgetGate` and `renderBudget` that take a live reading through
      them. The gate and `igor budget` then read a seat only from #143's stream and probe, which #204
      builds before this change. Remove the
      tests of the removed functions, and test that no `claude -p` runs `/usage`.

## 2. The tree and the outbox

- [ ] 2.1 Under `serve`, `CloneProvider.provision` clones under umask `007` with
      `--separate-git-dir=<tree>-git`. It gives the tree directory and the outbox the worker's
      primary group and mode `2770`, and removes group write from the git directory and
      everything under it.
- [ ] 2.2 Before the worker starts, the Igor copies the git directory's index into the outbox
      and sets `GIT_INDEX_FILE` to that copy in the worker's environment, as the modified
      worker-environment requirement allows. After the worker exits, every git command the Igor
      runs to read changes uses the git directory's own index, never the copy.
- [ ] 2.3 Every git command the Igor runs in a tree, in both modes, names the git directory and
      the tree with `--git-dir` and `--work-tree`, so a `.git` the worker replaced is never read
      by the Igor. Under `run`, the git directory stays inside the tree and the
      index is not copied.
- [ ] 2.4 The sweep's name rule, which decides which sibling paths belong to a tree, takes `<tree>-git` and `<tree>-prompt` as it takes `<tree>-outbox`, and the startup
      sweep removes every system prompt file 1.7 left, beside a tree or in 1.7's directory only the Igor can
      read. Test: a system prompt file left by a crash is gone after the next start.
- [ ] 2.4a Under `serve`, provision every tree, outbox and `<tree>-git` under
      `/var/lib/igor/trees`, never under the instance's `/tmp`, with 2.1's groups and modes
      (Adam, 2026-10-17). A sibling rank's sweep of a gone rank's trees (#179) runs the first
      removal pass of 4.2 (release and sweep), the `rm -rf` as the worker user, as the gone
      rank's worker user, `sudo -n -u igor-worker-<role>-<k>`, under the sudoers
      line already written for that rank (Adam, 2026-10-18).
- [ ] 2.5 Where a role runs #153's steps: bug-hunter runs, edits the tree and reports its
      `Bug-hunter:` value, without running `caller-result.sh`. The Igor then runs prose's first
      call as the service user, from `skills_dir`, and gives the rules and the pass token it
      prints to the prose pass in its prompt; the prose pass edits the tree and writes the
      message. Neither step stages or signs. Bug-hunter's triage, on the model #153 pins, then
      runs on the prose pass's diff; a diff it skips gets no further iteration, and any other
      gets one more. The Igor's code may stage more than once, such as before prose's first call
      and after the answers to #153's cold read, always in the git directory's own index, never
      the copy. Before every staging, every model step started so far has exited, the Igor has
      killed every process the worker user owns (4.1), and 3.3's checks have passed (proposal, decision 32). After the last
      staging, the Igor runs, as the service user and from `skills_dir`, prose's second call
      with that token and bug-hunter's minting script, both against that staging's tree, the
      tree 3.2 records and publishes. The Igor runs all three calls, prose's two and bug-hunter's minting script, with `GIT_DIR`,
      `GIT_WORK_TREE` and `GIT_INDEX_FILE` naming its own git directory, the tree and its own
      index.
- [ ] 2.6 Tests on a real clone, run as one user: the modes and group after provisioning; status
      read against the git directory's index reports a `git rm` and a `git mv` made with
      `GIT_INDEX_FILE` set to the copy; a file marked skip-worktree or assume-unchanged in the
      copy is still read as changed; a `.git` file in the tree pointing elsewhere does not change what the
      Igor reads; the sweep removes a stranded `-git` directory; a file marked unchanged in the
      copy is in the tree 2.5 stages; edits by both #153 steps are in the last staged tree, and
      nothing is staged while a model step runs; a staging before prose's first call and one
      after the cold read's answers each follow a kill of every process the worker user owns and 3.3's checks, and a hard link
      made between them stops the run at the second; a prose diff the triage skips runs no second
      bug-hunter iteration, and one it does not skip runs one; prose's first call and both
      signing calls run as the service user from `skills_dir`, never from the tree; with a
      `.git` directory the worker made in the tree, holding a hook and a `core.fsmonitor`
      setting, the signing calls run neither and write no token into it.
- [ ] 2.7 Test on a real clone that fetches through `gitEnv` with a token: after the clone and a
      later fetch, `<tree>-git/config` holds no credential helper and no token, and no remote
      URL in it holds user information (proposal, decision 41).

## 3. Nothing run, nothing followed

- [ ] 3.1 Every git command the Igor runs in a tree passes
      `-c core.hooksPath=/dev/null -c core.fsmonitor=false -c submodule.recurse=false`, and
      `--ignore-submodules=all` where the command takes it, in both modes. A changed path that
      holds its own `.git` with working content stops the run before publishing (verbatim;
      Adam may reword):

      ```
      `<path>` is a nested repository, and Igor reads none a worker made, so nothing was published
      ```

      A changed gitlink is published as the commit it names, with no git command run inside the
      submodule's directory, where 0.4 builds that. Where it does not, the run stops before
      publishing (verbatim; Adam may reword):

      ```
      `<path>` is a submodule whose commit changed, and this Igor publishes no submodule pointer, so nothing was published
      ```
- [ ] 3.2 Before every read or staging of the tree, the Igor waits for every model step started
      so far to exit, and then kills every process the worker user owns (4.1). It then runs
      3.3's checks and stages the changed paths in its own index. After the last model step and
      the last staging, it writes that tree with `git write-tree` into its own git directory,
      makes 2.5's trailers against it, runs #189's checks where they exist, kills every process the worker user owns again,
      and publishes that tree object.
- [ ] 3.3 `changes()` refuses a path that has a link among its directories, checking each
      component with `lstat`. A changed path that is itself a link is read with `readlink` and
      published as a link where 0.4 builds that, and is refused where it does not. `changes()`
      opens files with `O_NOFOLLOW` and checks the opened file's real path is inside the tree's
      real path. A file it cannot open is reported rather than skipped. Execution stops on any
      of these, before publishing, with these reasons (verbatim; Adam may reword at review). A
      path beneath a link:

      ```
      `<path>` lies under a symbolic link, and Igor reads no file a worker changed through a link, so nothing was published
      ```

      A changed link, where links are not published as links:

      ```
      `<path>` is a symbolic link, and this Igor publishes no link, so nothing was published
      ```

      A file the Igor cannot open:

      ```
      `<path>` could not be read by this Igor, and an artifact without it would be incomplete, so nothing was published
      ```

      A changed file whose link count is above 1:

      ```
      `<path>` has more than one hard link, and Igor publishes no file a worker could have linked to another, so nothing was published
      ```

      For more than one path, the paths are listed separated by commas, "is" becomes "are" and
      "lies" becomes "lie", as the existing stop for a path that is not text does
      (`src/execute.ts`). Every
      `<path>` in these reasons, and in 3.1's, is escaped for a code span with `quoteName`'s
      escaping (`src/worktree.ts`): the worker chooses the names, and a backtick in one would
      otherwise end the span.
- [ ] 3.4 Every file the Igor reads from the tree or the outbox, the declaration file
      `reverts.json` included, is checked with `lstat` first, never opened if it is a FIFO or
      other special file, then opened with `O_NOFOLLOW | O_NONBLOCK` and read only if `fstat` on
      the opened descriptor shows a regular file whose link count is 1. For the declaration file, the run otherwise stops with one of these
      (verbatim; Adam may reword):

      ```
      the worker's declaration file is not a regular file, so it was not read and nothing was published
      ```

      ```
      the worker's declaration file has more than one hard link, so it was not read and nothing was published
      ```

      An error parsing a file read from the worker names the file and never quotes its content.
      Node's `JSON.parse` error message quotes the start of the text, so it is never passed on.

- [ ] 3.5 Tests, in both modes: a hook and a `core.fsmonitor` setting in the tree do not run; a
      link to a file outside the tree is published as a link to that path where 0.4 builds
      that, and stops the run where it does not, and either way that file's content is in no
      `ChangedFile`, reason or record; a file under a linked directory stops the run; a link a
      model step made after the worker is seen; a file with mode `000` stops the run; a linked declaration file is not read; a nested repository
      whose configuration defines a filter stops the run and its filter does not run; a moved
      gitlink is published as a pointer where 0.4 builds that, and stops the run where it does
      not, with no git command run inside the submodule either way; a check that rewrites a changed
      file and tries to write the git directory leaves the recorded tree object unchanged, and
      that tree is published; a file with a link count of 2 stops the run; a declaration
      file with a link count of 2 is not read and stops the run; a declaration file that is a
      FIFO is never opened and stops the run; one swapped for a FIFO between the `lstat` and the
      open does not block and stops the run; a declaration file that does not
      parse appears in no reason, record or log; a path holding a backtick is escaped in the
      reason.
- [ ] 3.6 Every git call the Igor makes for a tree, the clone and checkout in
      `CloneProvider.provision` included, and every prose and bug-hunter script it runs (2.5),
      runs with `GIT_CONFIG_NOSYSTEM=1` and `GIT_CONFIG_GLOBAL=/dev/null`, so no filter a
      worker's `.gitattributes` names is defined for them (Adam, 2026-10-19; proposal, decision
      33). A Git LFS file is then checked out, read and published as its pointer. A call that
      needs a committer identity, such as `ClonedTree.merge()`'s `git merge`, passes the
      Igor's with `-c user.name=… -c user.email=…`, since neither the system nor the global
      configuration supplies one. Before building, measure that `prose check`, `prose sign`
      and bug-hunter's `mint-trailer.sh` work under both variables, and record it in
      `design.md`; a script that fails under them goes back to Adam. Tests: with
      `filter.lfs` defined in the global configuration and named in the tree's
      `.gitattributes`, neither the checkout, the status read nor the staging runs it, and the
      published file is what the tree holds.

- [ ] 3.7 `ghEnv` (`src/gh.ts`) and `gitEnv` and `networkEnv` (`src/worktree.ts`) build their
      environments from a list, as `workerEnv` does, never from `process.env` (proposal,
      decision 44). Share the `PATH`, `HOME` and `FORWARDED` part with `workerEnv`. `gh` adds
      `GH_TOKEN`. `git` adds the helper's `GIT_CONFIG_*` entries, numbered from 0, the token
      variable and `GIT_TERMINAL_PROMPT=0` where it reaches a remote, and in every call 3.6's
      variables, `GIT_SSL_CAINFO` and `GIT_SSL_CAPATH` where set, and the `GIT_DIR`,
      `GIT_WORK_TREE` and `GIT_INDEX_FILE` the call names. A git call with no token, which
      inherits `process.env` on `main`, gets all of that but no token, helper entries or
      `GIT_TERMINAL_PROMPT`. A `gh` call as a person's own login
      (`actAs(undefined)` on `main`) gets the list and `GH_TOKEN`, `GITHUB_TOKEN`, `GH_HOST`,
      `GH_CONFIG_DIR` and `XDG_CONFIG_HOME` where set. Build after 6.17. Tests:
      with `IGOR_SEAT_ADAM`, `GITHUB_APP_PRIVATE_KEY` and an operator's `GIT_CONFIG_COUNT=1`
      in the Igor's environment, no `gh` or `git` child gets any of them; each gets
      `HTTPS_PROXY` where set; `gh` gets `GH_TOKEN`, and a fetch still authenticates.

## 4. Kill, release, sweep

- [ ] 4.1 Under `serve`, `killTree` and `killLiveWorkers` run
      `sudo -n -u <worker> -- pkill -KILL -u <worker>`, synchronously in the `exit` handler, and
      the Igor runs the same kill before each reset of the worker's home, once the last model
      step exits, after #189's checks and before a release (proposal, decision 27). Each kill
      also runs the check that 5.8 runs before a spawn, `sudo -n -u <worker> true`, though a kill
      passes no secret: a refused `sudo` exits 1, as `pkill` does when no process is left to
      kill, so the check is how the two are told apart. No process left is not an error; a
      refused check fails the run before anything is read or staged and is recorded under the
      instance's cure key (0.3); in the `exit` handler the
      check runs synchronously too, and a refusal is written to standard error only. Under `run` the kill stays a kill of the
      worker's process group.
- [ ] 4.2 `ClonedTree.release()` and the startup sweep first run
      `sudo -n -u <worker> -- rm -rf -- <tree> <outbox>`, then the Igor's own removal of the
      tree, the outbox and the git directory. The second runs even when the first fails. Under
      `run`, which #179 makes rank 0, each run's trees carry the run id #179's *The sweep removes
      trees by rank, never by age* gives it, and each run holds a lock on
      `<role>-0-<run id>.lock`; #179's tasks build both. `run` removes its own trees and, at its
      start, the trees, the #174 worker home and the #174 plugin directory of an earlier run of
      its role whose lock it can take, as the Igor's own user with no `sudo`. It leaves a tree of a run whose lock it cannot
      take, and any other rank's or role's (this change's decisions 25, 39 and 50).
- [ ] 4.3 Tests with an injected runner: `run`'s sweep leaves a live run's rank-0 tree and
      another rank's tree, and removes a gone run's tree, home and plugin directory; two runs of one role at once make trees with different names; the kill and
      the removal argv; the kill by user before the tree is read and after the checks; a failed
      first removal still leads to the second.

## 5. The start-up check, and `run` as the same user

- [ ] 5.1 A new module runs the checks in `design.md`, *What each start checks*, before `wire` in
      `serve`. The probe is one `sudo` call as the worker, with the paths in its
      argv, which are not secret. The refusals, verbatim; Adam may reword at review:

      ```
      this Igor's worker user "<worker>" is not a user on this host
      ```

      ```
      this Igor's worker user "<worker>" is <root | the user this Igor runs as>. A worker must run as a separate unprivileged user.
      ```

      ```
      this Igor cannot start a process as "<worker>" without a password (sudo said: <first line of its stderr>). Install deploy/sudoers.example as /etc/sudoers.d/igor.
      ```

      ```
      this Igor is not in "<group>", the group of its worker user "<worker>", so it cannot read what the worker writes. Add it to that group, then restart.
      ```

      ```
      the worker user "<worker>" cannot run <path>, the claude this Igor uses. Install claude where both users can run it: docs/deployment.md, "A separate user for the worker".
      ```

      ```
      the worker user "<worker>" can read <path>, which <what>. Make it readable only by <igor-user>.
      ```

      where `<what>` is one of: `is this Igor's process environment`, `is this Igor's GitHub App
      key`, `is the key that decrypts seat files`, `holds seat <id>'s token`, `is this Igor's
      home directory`, `is an environment file this Igor's unit loads` (each path in
      `IGOR_ENV_FILES`, a `:`-separated list the unit sets, 8.2), `holds this Igor's App
      identity` (for `/etc/igor/<role>.env`, once #179, as task 0.8 describes, has the Igor read
      it itself).

      ```
      the worker user "<worker>" can enter <path>, which is this Igor's home directory. Make it accessible only by <igor-user>.
      ```

      ```
      the worker user "<worker>" can read a file only <igor-user> should be able to read (<path>), so it can read this Igor's credentials too. Check that "<worker>" holds no capability or group that reads other users' files.
      ```

      ```
      the worker user "<worker>" can write <path>, which <is the lore checkout | is the lore worktree this Igor reads its configuration from | holds this Igor's installation | is the node this Igor runs on | is part of the home template every call in the worker's home starts from | is a script this Igor runs from skills_dir>. Make it writable only by <igor-user>.
      ```

      The template is probed file by file and directory by directory, and so is every script
      the Igor runs from `skills_dir`, prose's and bug-hunter's among them (Adam, 2026-10-19;
      proposal, decision 37). Every path the probe is given must exist; one that does not
      refuses the start:

      ```
      this Igor was told to check <path>, which <what>, but it does not exist, so the check would prove nothing. Fix the path in <where it was named: the variable, seat file or configuration key that gave it>, or create the file.
      ```

      A file the check has no path for, such as the environment files where `IGOR_ENV_FILES` is
      unset, is reported on its own line and never as passed:

      ```
      not checked: <what>, because <reason>
      ```

      As the service user, `sudo -n -l` must list `!log_allowed` among the `Defaults` that apply
      to it (proposal, decision 38). Otherwise:

      ```
      sudo logs the commands this Igor runs as "<worker>", seat token included, because /etc/sudoers.d/igor lacks "Defaults:<igor-user> !log_allowed". Add the line from deploy/sudoers.example, then restart.
      ```

      The probe also creates a file in `skills_dir` as the worker and deletes it. A create that
      succeeds refuses the start with:

      ```
      the worker user "<worker>" can write <path>, which is skills_dir, and a worker never needs to write there. Make it writable only by <igor-user>.
      ```

      Where `/proc/sys/fs/protected_hardlinks` does not read `1`, or cannot be read:

      ```
      fs.protected_hardlinks is not 1 on this host, so a worker could hard-link a file only this Igor can read into its tree. Set it with `sysctl fs.protected_hardlinks=1` and in /etc/sysctl.d, then restart.
      ```

      As the worker, an HTTP request to port 80 of `169.254.169.254` or `[fd00:ec2::254]`, made
      directly and through the worker's proxy where it has one, that gets an HTTP response
      within 2 seconds (proposal, decision 41). `<through>` is empty for a direct response, and
      `, through the proxy in <variable>` for one that came through the proxy, where
      `<variable>` is the variable that holds the proxy URL, such as `HTTPS_PROXY`. The message
      never holds the proxy URL, whose user info is a secret. The probe, a process the start
      check runs as the worker user, reads the proxy URL from its own environment, never from its
      command line, where `/proc/<pid>/cmdline` would show the password to any local user. Each
      address and route that got a response gets its own line:

      ```
      the worker user "<worker>" can reach <address>, the cloud metadata endpoint<through>, which hands any caller this host's cloud credentials. Block it: the unit's IPAddressDeny= line does on a host; in a container, block it on the host the container runs on; a proxy must refuse it.
      ```

      The worker user in `docker`, `lxd`, `incus` or `disk`, able to write
      `/run/docker.sock`, `/var/run/docker.sock`, `/run/podman/podman.sock` or
      `/run/containerd/containerd.sock` where it exists, or holding a sudo right; a missing
      socket passes:

      ```
      the worker user "<worker>" <is in the <group> group | can write <path>, a container engine's socket | may run commands through sudo>, so it can act as root and read every credential this Igor holds. <Remove "<worker>" from the group | Make the socket unwritable to it | Remove its sudoers lines>.
      ```

      The Igor's own process still dumpable after 5.6's call, the call failed, or
      `fs.suid_dumpable` not 0:

      ```
      this Igor could not make itself undumpable (<why>), so a crash could write its memory, seat tokens included, to disk. See docs/deployment.md, "A separate user for the worker".
      ```

      Each refusal above exits with status 78 (0.9), which the unit's
      `RestartPreventExitStatus=` keeps from restarting.

- [ ] 5.2 The check sets `safe.directory=*` in the worker user's global git configuration, as the
      worker, where it is missing.
- [ ] 5.3 `serve` has no `--same-user` flag, and refuses a missing worker user with 5.1's first
      refusal. `run` always runs the worker as the Igor's own user, whether or not a user named
      `igor-worker-<role>-<rank>` exists on the host.
- [ ] 5.4 `run` prints this first, before discovery (verbatim; Adam may reword):

      ```
      ! workers run as <igor-user>, the same user as this Igor, so a worker can read every credential this Igor holds, and use whatever <igor-user> can: an SSH agent, Docker, a cloud's metadata endpoint, credentials in its home. igor serve runs them as a separate worker user: docs/deployment.md, "A separate user for the worker".
      ```

- [ ] 5.5 Tests with an injected probe: each refusal, in order, the `claude`, `skills_dir`,
      template, script, missing-path, `!log_allowed`, metadata, `docker` and dumpable checks
      among them; a missing Docker socket passes; `IGOR_ENV_FILES`
      unset is reported as not checked, and its files are never reported as passed; `fs.protected_hardlinks` at `0` refuses; the file the `skills_dir`
      probe created is deleted; the first failure
      stops the check; every refusal exits with status 78; `serve` refuses with no worker user, and refuses `--same-user` as an
      unknown flag; `run` runs as the same user and prints the notice; `serve` never prints
      it.
- [ ] 5.6 A native addon makes the Igor not dumpable (proposal, decision 43; design, *The Igor
      cannot be dumped*). It exports one function that calls `prctl(PR_SET_DUMPABLE, 0)` and
      `setrlimit(RLIMIT_CORE, 0)`, then returns what `prctl(PR_GET_DUMPABLE)` reads. Build it in
      Rust through `napi-rs` (Adam, 2026-10-21; proposal, decision 43), with prebuilt binaries
      for Linux on x64 and arm64 in the package. `serve` and `run` call it
      first in `src/cli.ts`, before anything reads a credential. Under `serve`, an addon that
      will not load, a call that fails or a read-back other than 0 is 5.1's dumpable refusal.
      Under `run` on a platform the addon has no binary for, such as macOS, Igor starts without
      it and says nothing. Build after 6.16. Tests: the read-back is 0 after the call on Linux;
      `serve` refuses, with status 78, where an injected addon fails to load, or where
      `fs.suid_dumpable` reads 2; `run` on a platform with no binary starts, and `run` on
      Linux x64 or arm64 makes the call and reads back 0.
- [ ] 5.7 `serve` and `run` refuse to start, exiting 78, where a proxy URL the Igor would pass on
      from its own environment holds a password of 1 to 7 characters, counted after
      percent-decoding (proposal, decisions 48 and 49). The message names each variable that holds such
      a URL. The message, which may be reworded so long as it names the variable and never the
      password or the URL:

      ```text
      <variable> holds a proxy URL whose password is shorter than 8 characters. Igor cannot redact a secret that short, so it will not hand it to a worker. Use a password of at least 8 characters, or a proxy that authenticates by network address.
      ```

      A proxy URL with a user name and no password, or an empty one (`alice:@host`), is not
      refused: #217 registers the name with its host. Tests: under both `serve` and `run`,
      `HTTPS_PROXY=http://alice:pw12@proxy.internal:3128` refuses with status 78, and the output
      holds `HTTPS_PROXY` but neither `pw12` nor the URL; `http://alice@proxy.internal:3128` and
      `http://alice:@proxy.internal:3128` start, with the name registered with its host and never
      as `alice` alone
- [ ] 5.8 Before each `sudo` that passes the worker a secret, the worker's spawn and each later
      `claude -p` in its tree, the Igor runs
      `sudo -n -u <worker user> true`, and where that is refused, fails the run without the spawn
      (proposal, decision 52). #189's checks and the start check's probe through a proxy run the
      same check. A refusal before the probe refuses the start with status 78 and records
      nothing; any other refusal fails the run and is recorded under the instance's cure key
      (0.3).
      Test: with the worker's sudoers line removed after the start
      check, the run fails, no worker is spawned, and the token appears in no journal line

## 6. Measurements

On a Linux host running the shipped unit, with a real `igor-worker-<role>-<rank>`, Claude Code's
current release and the worker's real flags. Canary files sit at the real paths with the real owners and
modes: `/etc/igor/env`, `/etc/igor/<role>.env`, `/etc/igor/<role>.pem`, the `seatKey` path, and a
file in the service user's home. Each holds a random string and nothing else. Never a real secret.

- [x] 6.1 Repeat #163's table with the worker running as `igor-worker-<role>-<rank>`: the Read tool,
      `head`, `tail`, and a test file run by `npm test` that reads each canary and
      `/proc/<igor pid>/environ`, and writes into the lore checkout and the git directory's `hooks/`.
      Every read and write is refused, and no canary string appears in the stream or the
      transcript. The published artifact is 6.14's, since nothing publishes before section 3.
      Done 2026-10-18; every read and write refused, and no canary in the stream, the transcript, the tree or the journal (`design.md`, *Measurements*). It also found that a command the worker runs can read the seat token from the environment of its own `claude` process, at `/proc/$CLAUDE_PID/environ` (6.4), so whatever the worker runs can spend or leak its seat.
- [x] 6.2 Under `sudo` in the unit: the stream parses as it does now; `kill -KILL -- -<pgid>` as
      the worker ends a running `npm test`; `sudo` works with `ProtectSystem=strict`,
      `PrivateTmp=true` and no `NoNewPrivileges`; the exit status reaches the Igor.
      Done 2026-10-18. The stream, `sudo` under the unit and the exit status confirm; the kill of the group does not end `npm test`, so every kill is by user (proposal, decision 27; `design.md`, *Measurements*).
- [x] 6.3 `git rm` of a top-level file, `git mv`, `git log` and `git show`, run by the worker
      with the git directory read-only and outside the tree and `GIT_INDEX_FILE` in the outbox,
      all succeed, and the Igor's `changes()` reads them back. Claude Code's Edit and Write tools
      change a file the Igor owns.
      Done 2026-10-18; all succeed, and Edit replaces a file, making it the worker's (`design.md`, *Measurements*).
- [x] 6.4 Record which of `claude`'s environment variables reach a command it runs, the seat token
      above all.
      Done 2026-10-18; the token is not passed, but `CLAUDE_PID` leads to it (`design.md`, *Risks* and *Measurements*).
- [x] 6.5 Record what `sudo` writes to the auth log per worker start. With 1.7 built it should
      hold no prompt text. If it holds any, add `Defaults:igor !syslog` (or what the
      measurement shows works) to `deploy/sudoers.example`, with a comment saying why.
      Done 2026-10-18; no prompt text, but the seat token in full, so 8.1 gains `Defaults:igor !log_allowed` (proposal, decision 28; `design.md`, *Measurements*).
- [x] 6.6 Run two Igor units with one worker user and a worker in each, since whether the `/proc`
      reach holds between units is unmeasured. Record in `design.md`, *Each instance has its own
      worker user*, and in 8.4's section of `docs/deployment.md`, whether either worker can read
      the other's `/proc/<pid>/environ`, or list and write the other's tree through
      `/proc/<pid>/cwd`. Section 8 does not wait for it (Adam, 2026-10-17).
      Done 2026-10-18; the reach holds between units with one user, and not with a user per instance (`design.md`, *Each instance has its own worker user*; 8.4's text).
- [x] 6.7 Before 8.2 ships, confirm that under the unit, with `User=` and `Group=` the service
      user, the Igor is in the worker's group through
      `SupplementaryGroups=igor-worker-%i`, can write its home through
      `ReadWritePaths=/var/lib/igor-worker-%i`, and sudoes to `igor-worker-%i`.
      Sections 2 to 4 do not wait for this.
      Done 2026-10-18; confirms (`design.md`, *Measurements*).
- [x] 6.8 Before 8.2 ships, confirm that under the unit with `ProtectProc=invisible`, a worker
      user listing `/proc` sees no process of the service user and none of another worker user
      on the same host, and record the kernel version. Where the kernel lacks per-mount
      `hidepid`, record that the setting had no effect.
      Done 2026-10-18 on Linux 6.12.76-linuxkit, Docker Desktop's kernel: confirms. Task 6.11 repeats it on a server's kernel.
- [x] 6.9 Before 1.7 is built, on the Claude Code version the server runs: `claude -p` with
      `--output-format stream-json --verbose` and no prompt argument reads its prompt from
      stdin, and `--system-prompt-file <file>` sets the system prompt, as `claude --help`
      lists it. Also: the usage read's `/usage`, passed on stdin under `--output-format json`, runs
      as it does as an argument; and triage's `claude -p` under `--output-format json` reads its prompt from stdin. If any
      fails, the means of keeping prompts out of the arguments goes back to Adam; the rule
      stands.
      Done 2026-10-18; every stdin form works (`design.md`, *Measurements*).
- [x] 6.10 Under the unit, as the worker user through the `sudo` spawn: the modes of a file and a
      directory created by the Edit and Write tools, by `npm install` and by `git`, and whether
      the Igor can read each through the group. Record the umask in effect.
      Done 2026-10-18; umask `0022`, and the Igor reads all of it (`design.md`, the table and *Measurements*).
- [ ] 6.11 Before 8.2 ships, repeat 6.8 on the kernel of the Linux server distribution
      `docs/deployment.md` targets, and record the kernel version and the result in `design.md`.
- [ ] 6.12 Before 8.4 ships, run 8.4's commands with 8.1's `Defaults` line on section 6's host:
      `visudo -cf` accepts the file, and a worker start writes no `ENV=` line, and so no seat
      token, to the journal. Count the `ENV=` lines and never print them, since such a line
      holds the token. Then check that a command sudo refuses the service user still writes a
      journal line, counting those lines the same way, and count the refused lines that hold
      `ENV=` too, never printing them. Also record whether `sudo -n -l`, run as the service user
      without a password, lists `!log_allowed` among its `Defaults`, which 5.1's check reads; if
      it does not, the means of that check goes back to Adam, and the rule stands. Record the
      result in `design.md`.
- [ ] 6.13 For information only; nothing waits on it. Record what `CLAUDE_CODE_MESSAGING_TOKEN`,
      which Claude Code passes to the commands it runs (6.4), lets a holder do beyond the
      worker's own session. Adam decided on 2026-10-21 that it gets no rule, since the Igor
      never holds it (proposal, decision 41). Record the result in `design.md`.
- [ ] 6.14 Once section 3 is built, repeat 6.1's attack through Igor's own code and check that
      no canary string is in the published artifact. Record the result in `design.md`.
- [ ] 6.15 Before 8.2 ships, on a cloud virtual machine (such as EC2) whose metadata endpoint
      answers, with the shipped unit and 8.2's `IPAddressDeny=` line, on Debian and on each other
      distribution `docs/deployment.md` targets: read `/proc/<pid>/cgroup` of the worker `sudo`
      started and of a command it runs, and record whether both name the unit's group or a user
      slice; then, as the worker through that `sudo`, connect to port 80 of `169.254.169.254` and
      `[fd00:ec2::254]`, and record that each fails. Repeat without the line and record that
      start check 9 then refuses. Time check 9 on a host with no endpoint, and run it under Docker
      Desktop and behind an intercepting proxy, recording that neither is taken for the endpoint.
      On Google Compute Engine, with Debian and with Ubuntu images, record what
      `/etc/resolv.conf` names and whether DNS still works in the unit under the line. Never print a
      credential the endpoint returns: record only whether a reply came. If either process is in
      a user slice, or a connection succeeds under the line, the mechanism goes back to Adam,
      with the uid firewall rule as the fallback (proposal, decision 42). Record the result in
      `design.md`.
- [ ] 6.16 Before 5.6 is built, on section 6's host under the shipped unit with 8.2's
      `LimitCORE=0`, using a throwaway C or Rust program, or a prototype of 5.6's addon loaded
      into `node`, that makes 5.6's two calls: with the call made, `prctl(PR_GET_DUMPABLE)` reads 0, the owner of
      `/proc/<igor pid>/status` and `/proc/<igor pid>/environ` is root, `gdb -p <igor pid>` or any
      other `ptrace` attach run as the service user is refused, and `kill -SEGV <igor pid>` leaves
      no core in `coredumpctl list` or the working directory. Without the call, record what
      `coredumpctl list` shows, to confirm the measurement can tell the two apart. Also record
      whether the call changes anything the Igor reads in its own `/proc/self`. Repeat with
      `fs.suid_dumpable=2` and a pipe `core_pattern`, such as apport's or systemd-coredump's,
      and record whether a core is written and whether `LimitCORE=0` stops it. Record the result
      in `design.md`.
- [ ] 6.17 Before 3.7 is built, on Debian's git and on each other distribution
      `docs/deployment.md` targets: with a private CA, record which of `SSL_CERT_FILE`,
      `SSL_CERT_DIR`, `GIT_SSL_CAINFO` and `GIT_SSL_CAPATH` lets a fetch through an
      intercepting proxy succeed. If git needs one 3.7's list lacks, the list goes back to Adam.
      Record the result in `design.md`.

## 7. An automated end-to-end test

- [ ] 7.1 `test/worker-user.test.ts`, skipped with a stated reason unless `IGOR_TEST_WORKER_USER`
      names a user the test runner can `sudo -n` to. It runs `claudeWorker` with a fake `claude`,
      a short node script, as that user. The script tries to read a canary file `0600` in a
      `0700` directory of the runner's, read the runner's `/proc/<pid>/environ` where `/proc`
      exists, and write into a directory standing in for the lore checkout. It reports each
      result as a stream event. The test asserts every attempt was refused and no canary
      appears.
- [ ] 7.2 The same file checks that a kill ends the fake worker, a child it started, and a child
      that started its own session with `setsid`, and that release removes a `0700` directory
      the fake worker created.

## 8. Deployment

- [ ] 8.1 New `deploy/sudoers.example`, verbatim, except that the comment above the `Defaults`
      line may be reworded. 8.4's commands copy its comments and its `Defaults` line, and write
      one line per instance in the form it shows:

      ```
      # /etc/sudoers.d/igor, written by the commands in docs/deployment.md,
      # "A separate user for the worker".
      #
      # sudo logs every variable it passes with --preserve-env, value included, and the Igor
      # passes the worker its seat token that way. So sudo logs no command it allows the
      # service user, and the token stays out of the journal. A refused command is still logged.
      Defaults:igor !log_allowed
      #
      # The Igor's service user may run commands as each instance's worker user, and as nobody
      # else: that is how a worker is started, killed and cleaned up after. It grants nothing
      # toward root. Anything the service user runs as a worker user, it could already do as
      # itself. One line per instance <role>-<rank>, naming igor-worker-<role>-<rank>:
      igor ALL=(igor-worker-maintenance-1) NOPASSWD: ALL
      ```

- [ ] 8.2 `deploy/igor.service`: set `SupplementaryGroups=igor-worker-%i` and
      `ReadWritePaths=/var/lib/igor-worker-%i`, and
      keep `/var/lib/igor/trees`, under #179's `StateDirectory=`, writable; `PrivateTmp=true`
      stays for everything else. No
      drop-in per instance and no `/etc/group` step. `User=` stays the service user, and the unit
      gains `Group=igor`, the service user's group, which the unit on `main` does not set,
      and `ExecStart=` passes `%i` to `igor serve` (1.1). Beside the unit's
      `EnvironmentFile=/etc/igor/env` line, set `Environment=IGOR_ENV_FILES=/etc/igor/env`, with
      this comment (may be reworded). #179 removes the unit's other line,
      `EnvironmentFile=/etc/igor/%i.env`, because the Igor reads `/etc/igor/<role>.env` itself,
      so `/etc/igor/env` is the one file the unit loads:

      ```
      # The Igor never sees the paths systemd loads its environment from, so the unit names
      # them here, and the start check proves the worker user cannot read them.
      ```

      `/etc/igor/<role>.env` is probed as a file the Igor's configuration names, not through
      `IGOR_ENV_FILES`.

      Put `/usr/local/bin` first on `PATH` and change the `PATH` comment to say `claude` must
      live where the worker can run it. Replace `NoNewPrivileges=true` with this comment (may be
      reworded):

      ```
      # No NoNewPrivileges=: it stops sudo from changing user, and sudo is how a worker runs as
      # this instance's worker user, which cannot read /etc/igor. See docs/deployment.md, "A
      # separate user for the worker".
      ```

      Add these lines, with this comment (may be reworded; the restart lines come from 0.9 and
      replace `Restart=always`, and `RestartSec=30` becomes `RestartSec=30s`, the same interval as
      #82 writes it; where #82's task 1.5 has already added the three restart lines, keep #82's
      lines as they are and add only `ProtectProc=`, `IPAddressDeny=` and `LimitCORE=`):

      ```
      # A process sees only its own user's processes, so no worker can read another's command
      # line or environment through /proc.
      ProtectProc=invisible
      # No process in the unit, a worker's included, can reach the cloud metadata endpoint,
      # which hands any caller this host's cloud credentials.
      IPAddressDeny=169.254.169.254 fd00:ec2::254
      # No crash writes a process's memory, seat tokens included, to disk.
      LimitCORE=0
      # A crash is restarted; a clean exit (status 0) is not. A process that refuses to start,
      # such as on a missing worker user, exits 78 (EX_CONFIG) and is not restarted: fix what
      # the journal names, then start it again. A start GitHub or the model provider did not
      # answer, or where GitHub refused the App's credential, exits 1 and is retried every 30
      # seconds, slowly enough that systemd's start-rate limit does not trip.
      Restart=on-failure
      RestartSec=30s
      RestartPreventExitStatus=78
      ```

- [ ] 8.3 #192's (`deploy-image`) container image and compose file, after #192 merges as it is
      (proposal, decision 20). This is how a Mac runs `serve`.
      - `Dockerfile`, `runtime` stage: install `sudo` from Debian at a pinned version, as the
        image pins its other packages. Create the worker user for each instance the compose
        file runs, `igor-worker-<role>-1`, with its home at `/var/lib/igor-worker-<role>-1`,
        and write 8.1's `Defaults` line and each instance's sudoers line to
        `/etc/sudoers.d/igor` in the form 8.1 shows, naming `node`, the user #192's image runs
        Igor as, where 8.1's lines name `igor`. Create
        `/var/lib/igor/trees`, owned by `node`, and put `claude` where the worker user can
        run it.
      - `deploy/docker-compose.yml`: each service runs `igor serve <role>-1`, since the compose
        file runs one container per role, as rank 1, so each container's worker user is
        `igor-worker-<role>-1`. The trees volume mounts at `/var/lib/igor/trees` instead of
        `/tmp` (the proposal's decision 19). The header comment says the image holds `sudo`,
        the worker users and their sudoers lines. A mounted key is owned by the uid the image
        runs Igor as, with mode `0600`, as #192's comment already says. `ProtectProc=` is a
        unit setting, and the container has no systemd unit, so it does not apply there. 1.7
        leaves no prompt in any argument list, so neither the worker nor anything else in the
        container can read the Igor's or the worker's prompt from `/proc`. The container loads
        no environment file and sets no `IGOR_ENV_FILES`, so the start check reports the
        environment files as not checked. The container has no `IPAddressDeny=`, so the header
        comment says that on a cloud host the host must block the metadata endpoint, and that
        start check 9 refuses until it does. Add `node` to each
        worker user's group, which the unit's `SupplementaryGroups=` does on a host; without it
        start check 3 refuses every start.
      - Run 5.1's start check in the container, on Linux and under Docker Desktop on macOS, and
        record the result in `design.md`. On the Claude Code version the image pins, repeat 6.2's
        kill of a running `npm test` and 6.9's stdin forms, since both were measured on
        2.1.303.
- [ ] 8.4 `docs/deployment.md`: add this section after *Before it can run*, add a fourth item
      to *Before it can run*'s numbered list that points to it, and change that list's opening
      line to say four things. May be reworded; the commands may not change without
      re-measuring them. Section 6's host ran them as written on 2026-10-18, before they copied
      the `Defaults` line, and they made each user, home and sudoers line (`design.md`,
      *Measurements*); 6.12 re-runs them as they stand.

      ````markdown
      ## A separate user for the worker

      A worker runs the commands its role allows, such as `npm test`, and those run code the
      worker wrote. Claude Code's permission checks don't reach that code, so a worker running
      as the service user can read whatever the service user can: the env files, the App's key,
      the seat tokens. An issue anyone can file can ask it to. So the worker runs as a second
      user, which can read none of them, and `igor serve` refuses to start without one.

      Each Igor instance, `igor@<role>-<rank>`, gets its own worker user,
      `igor-worker-<role>-<rank>`, with its own home and sudoers line. Two workers sharing one
      user can read each other's seat tokens and write into each other's trees through
      `/proc`, even from separate units.

      List your instances, each with its rank, such as `maintenance-1`. Then create each one's
      user and home, and write its sudoers line. Run it again, listing every instance, whenever
      you add one. Keep a rank you retire in the list. Another rank of the same role removes the
      retired rank's working trees by acting as the retired rank's worker user, and only that
      user's sudoers line allows it:

      ```bash
      instances="maintenance-1 generalist-1 generalist-2"
      { grep -E '^(#|Defaults)' deploy/sudoers.example
      for i in $instances; do
        u="igor-worker-$i"
        id "$u" >/dev/null 2>&1 || sudo useradd --system --create-home \
          --home-dir "/var/lib/$u" --shell /usr/sbin/nologin "$u"
        sudo chmod 700 "/var/lib/$u"
        echo "igor ALL=($u) NOPASSWD: ALL"
      done; } > igor.sudoers
      sudo visudo -cf igor.sudoers && sudo install -m 440 igor.sudoers /etc/sudoers.d/igor
      sudo chown -R igor:igor /etc/igor && sudo chmod 700 /etc/igor /home/igor
      ```

      **`claude` has to be somewhere both users can run it.** The worker cannot enter
      `/home/igor`, so `~/.local/bin/claude` is out of its reach. Copy the binary out, and do
      it again after every `claude update`:

      ```bash
      sudo install -m 755 "$(sudo readlink -f /home/igor/.local/bin/claude)" /usr/local/bin/claude
      ```

      Then restart the Igors. Each one checks the arrangement as it starts and refuses, naming
      the path, if the worker can read a credential or write the lore checkout. To see it for
      yourself, `sudo -u igor-worker-maintenance-1 cat /etc/igor/env` must say `Permission denied`.

      **Put no credential in a worker user's home, and add it to no `docker` group.** A
      registry token in `~/.npmrc` or a key under `~/.ssh` there reaches whatever the worker
      runs, and Igor never learns of it, so it cannot redact it. Igor gives a repository's
      checks no credential except a password in the proxy URL (*A proxy*, below): a check that
      needs a secret is marked CI-only in the repository's
      entry in the `repos` map of `roles/org.yaml`, and the repository's own CI runs it. The `docker` group lets the
      worker start a container as root, so the start check refuses it. The check also refuses
      the `lxd`, `incus` and `disk` groups, and any sudo right for the worker user. On a cloud host, the
      unit blocks the metadata endpoint; the start check refuses where it is reachable anyway.

      **Neither user logs in to Claude.** Igor never uses a stored login: every seat has a
      token, and each worker gets its seat's token in its environment. [Lending a
      seat to an Igor](seats.md) shows how to create a token.

      **On your own machine**, `igor run` runs the worker as you and says so when it starts.
      `igor serve` never does: it needs its worker user.
      ````

- [ ] 8.4b `docs/deployment.md`, in the section of 8.4, after its paragraph that begins **Put no
      credential in a worker user's home**: add this
      subsection (proposal, decision 47). It may be reworded, as long as it still says that a
      check gets the proxy URL whole and advises a proxy that authenticates by network address.

      ```markdown
      ### A proxy

      The worker, and every check Igor runs as the worker user, gets this host's proxy settings,
      such as `HTTPS_PROXY`, so that tests needing the network can reach it. A proxy URL that
      holds a user and password gives that password to code the worker wrote. Igor redacts it
      wherever it records or posts text, but the code can still use it. Use a proxy that
      authenticates by network address, accepting connections from this host only, and put no
      user or password in its URL.
      ```
- [ ] 8.5 `docs/deployment.md`, *What the machine needs*: the paragraph on `PATH` says `claude`
      goes in `/usr/local/bin`, with a link to the new section, instead of telling the reader
      to check the service user's `~/.local/bin`.
- [ ] 8.6 `docs/deployment.md`, *Keeping the token out of your shells*: replace "and the service
      user running nothing else is what stands in for the isolation there" with "and the worker
      runs as a user that cannot read the file:
      [A separate user for the worker](#a-separate-user-for-the-worker)".
- [ ] 8.7 `docs/deployment.md`, *When something is wrong*: one row per refusal in 5.1,
      each naming its cure in a phrase, as the existing rows do.
- [ ] 8.8 `docs/deployment.md`, *macOS*: say that `serve` under `launchd` refuses to start, since
      the start check that `/proc/sys/fs/protected_hardlinks` reads `1` (5.1) cannot pass on
      macOS, which has no `/proc`, and that a Mac runs `serve` in #192's
      container image and `run` on the host.

## 9. Architecture

- [ ] 9.1 `docs/architecture.md` §6.3.2 gains this paragraph after its second (may be reworded):

      ```markdown
      The environment is not the only barrier. A worker runs as a separate Unix user,
      `igor-worker-<role>-<rank>`, which cannot read the Igor's env files, keys or `/proc/<pid>/environ`:
      an allowed `npm test` runs whatever the worker wrote, and Claude Code's path checks do not
      reach it (#163). The Igor reads the worker's changes without following links, and runs no
      hook in its tree.
      ```

## 10. Closing

- [ ] 10.1 Every requirement in `specs/task-execution/spec.md` met. Section 6's results are in
      `design.md`. #163 is closed by the gate-two pull request.
