## 0. Order and dependencies

- [ ] 0.1 Build on `main` as it stands at gate two, when the implementation is pushed after this
      specification is approved. The start-up probe covers every credential path the
      configuration has by then: `GITHUB_APP_PRIVATE_KEY_FILE`, `seatKey` if #171 has merged,
      and seat `token_file` paths while they exist. If #171 has not merged, file an issue asking
      #171 to add `seatKey` to this probe, and link it here.
- [ ] 0.2 Run measurements 6.1 to 6.5 before building sections 2 to 4; 6.6 informs the docs, and
      6.7 runs before 8.2 ships. Record each result in
      `design.md`, including any that contradicts it, and change the design before the code where
      one does.
- [ ] 0.3 If #101 (`condition-backoff`) has merged, record a `sudo` spawn failure of the worker
      under a cure key scoped to the whole Igor, #101's name for the key a recurring failure is
      grouped under. A key of that scope stops the Igor taking new items, where an item-scoped one
      would fail every item in turn. The Igor does not exit on it (#82).
- [ ] 0.4 If #137 (`carry-what-a-tree-holds`) has archived, build 3.3's publishing of a changed
      link as a link, and 3.1's publishing of a changed gitlink as a pointer. If not, build both
      stops, file an issue asking whichever of #137 and this change archives second to replace
      those two stops with the publishing and drop the conditions on #137 from *The Igor reads no file on
      the worker's behalf through a link* and *Nothing the worker writes is executed by the
      Igor*, and link it here.
- [ ] 0.5 If #153 (`signed-publishing`) has merged, its model steps go through 1.4, and the Igor
      makes its trailers as 2.5 says. If not, file an issue asking #153 to run its steps through
      this change's spawn, to have them edit without signing and report their pass results, and
      to have the Igor make both trailers against the tree 2.5 stages, and link it here.
- [ ] 0.6 If #174 (`pinned-skills`) has merged, add `skills_dir` to the probe in 5.1. If not,
      file an issue asking #174 to add it, and link it here.
- [ ] 0.7 If #189 (`loop-verifies-commands`) has merged, its checks go through 1.4's spawn and
      run after 3.2 records the tree, and what they write is discarded. If not, file an issue
      asking #189 to run its checks on the tree the Igor recorded and to publish that tree, as
      *The Igor reads no file on the worker's behalf through a link* requires, and link it
      here.

- [ ] 0.8 1.1 and 8.2 need instances named `<role>-<rank>`, with the rank always written, so
      that `igor-worker-%i` is the worker user's name (Adam, 2026-10-17). #179
      (`concurrent-instances`) specifies that naming, and the load-time check on role names that
      keeps `igor-worker-<role>-<rank>` within 32 characters (Adam, 2026-10-18), in its
      requirement *A process is named by its role and rank*. If #179 has merged, build on it.
      Otherwise, file an issue asking whichever of #179 and this change is built second to name
      instances that way and check role names, and link it here.
- [ ] 0.9 The exit status in 5.1 and the restart lines in 8.2 come from #82
      (`stopped-scope-visible`): 78 for a refused start, in *A process that refuses to start
      exits with status 78*, with `Restart=on-failure` and `RestartPreventExitStatus=78`. If #82
      has not merged, file an issue asking whichever of #82 and this change is built second to
      exit 78 on a refused start and set those lines, and link it here.
- [ ] 0.10 Whichever of this change and #174 is built second makes the `sudo` spawn of 1.1 run
      #174's kill of the worker user's processes and its reset of the worker's home before each
      model step, as `design.md` (*The worker is started through `sudo`*) says. If #174 has
      not merged, file an issue saying so, and link it here.

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
      exists; a model step in the tree after the worker, and #153's `prose start`, spawned
      through `sudo` as the worker user.
- [ ] 1.6 #153's `prose start` goes through 1.2's spawn as the worker user, after the reset of
      the worker's home that #174 builds, so the session mark is the worker's and sits in its
      home. If #153 has not merged, the issue 0.5 files asks for this too; if #174 has not, the
      issue 0.6 files does.
- [ ] 1.7 Every `claude -p` the Igor starts takes its prompt on stdin and its system prompt from
      `--system-prompt-file`: `claudeWorker` (`src/execute.ts`), `runClaude` (`src/triage.ts`),
      `runUsage` (`src/budget.ts`), #143's seat probe and #174's startup check where those are
      built. The Igor writes the system prompt file before the spawn and removes it after the
      process exits. For a process running as the worker user, it goes in a directory the Igor
      owns, beside the tree, mode `2750` with the worker's group; never in the tree or the
      outbox. For a process running as the Igor, it goes in a directory only the Igor can read. Build after 6.9. Tests: each call's argv holds no prompt and no `--system-prompt`;
      the prompt arrives on stdin; the file exists during the call and not after it, also when
      the call fails.

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
- [ ] 2.4 The sweep's name rule takes `<tree>-git` as it takes `<tree>-outbox`.
- [ ] 2.4a Under `serve`, provision every tree, outbox and `<tree>-git` under
      `/var/lib/igor/trees`, never under the instance's `/tmp`, with 2.1's groups and modes
      (Adam, 2026-10-17). A sibling rank's sweep of a gone rank's trees (#179) runs the first
      removal pass of 4.2 (release and sweep), the `rm -rf` as the worker user, as the gone
      rank's worker user, `sudo -n -u igor-worker-<role>-<k>`, under the sudoers
      line already written for that rank (Adam, 2026-10-18).
- [ ] 2.5 Where a role runs #153's steps: bug-hunter runs, then the prose pass, and each edits
      the tree, neither stages nor signs, and each ends by reporting its pass result, the prose
      pass's being its pass token. Bug-hunter's triage then runs on the prose pass's diff,
      skipping a diff that touches only comments or docs and giving anything else one more
      bug-hunter iteration. After the last model step exits, the Igor's code stages the changed
      paths once, in the git directory's own index, never the copy. The Igor then runs, as the
      service user and from `skills_dir`, the second `prose check` call with the prose pass's
      token and bug-hunter's minting script, both against that index's tree, the tree 3.2
      records and publishes.
- [ ] 2.6 Tests on a real clone, run as one user: the modes and group after provisioning; status
      read against the git directory's index reports a `git rm` and a `git mv` made with
      `GIT_INDEX_FILE` set to the copy; a file marked skip-worktree or assume-unchanged in the
      copy is still read as changed; a `.git` file in the tree pointing elsewhere does not change what the
      Igor reads; the sweep removes a stranded `-git` directory; a file marked unchanged in the
      copy is in the tree 2.5 stages; edits by both #153 steps are in that tree, and nothing is
      staged before the last step exits; a comments-only prose diff runs no second bug-hunter
      iteration, and a prose diff that changes code runs one; both signing calls run as the
      service user from `skills_dir`, never from the tree.

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
- [ ] 3.2 Before reading changes, the Igor waits for the worker, and then each later model step,
      to exit, killing each one's process group as it does; a group is already gone when its
      process exited by itself. It then stages the changed paths in its own index, writes that
      tree with `git write-tree` into its own git directory, runs #189's checks where they exist,
      and publishes that tree object, discarding what the checks wrote.
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
      other special file, then opened with `O_NOFOLLOW` and read only if it is a regular file
      whose link count is 1. For the declaration file, the run otherwise stops with one of these
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
      not, with no git command run inside the submodule either way; a file and a link a check
      wrote are not in the artifact; a file with a link count of 2 stops the run; a declaration
      file with a link count of 2 is not read and stops the run; a declaration file that is a
      FIFO is never opened and stops the run; a declaration file that does not
      parse appears in no reason, record or log; a path holding a backtick is escaped in the
      reason.
- [ ] 3.6 The Igor's git calls in a tree run with `GIT_CONFIG_NOSYSTEM=1` and
      `GIT_CONFIG_GLOBAL=/dev/null`, so no filter a worker's `.gitattributes` names is defined
      for them, unless Adam answers the proposal's open question otherwise.

## 4. Kill, release, sweep

- [ ] 4.1 Under `serve`, `killTree` and `killLiveWorkers` run
      `sudo -n -u <worker> -- kill -KILL -- -<pgid>`, synchronously in the `exit` handler. A
      group already gone is not an error.
- [ ] 4.2 `ClonedTree.release()` and the startup sweep first run
      `sudo -n -u <worker> -- rm -rf -- <tree> <outbox>`, then the Igor's own removal of the
      tree, the outbox and the git directory. Both are attempted whatever the first does. Under
      `run`, which #179 makes rank 0, the release and the startup sweep remove only trees named
      `<role>-0-<id>` for its own role, as the Igor's own user with no `sudo`, and leave a tree
      another rank or another role left (proposal, decision 25).
- [ ] 4.3 Tests with an injected runner: `run`'s sweep leaves another rank's tree; the kill and the removal argv; a failed first removal
      still leads to the second.

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
      home directory`, `holds this Igor's App identity` (for `/etc/igor/<role>.env`, once 0.8's
      #179 has the Igor read it itself).

      ```
      the worker user "<worker>" can read a file only <igor-user> should be able to read (<path>), so it can read this Igor's credentials too. Check that "<worker>" holds no capability or group that reads other users' files.
      ```

      ```
      the worker user "<worker>" can write <path>, which <is the lore checkout | holds this Igor's installation | is the node this Igor runs on>. Make it writable only by <igor-user>.
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

      Each refusal above exits with status 78 (0.9), which the unit's
      `RestartPreventExitStatus=` keeps from restarting.

- [ ] 5.2 The check sets `safe.directory=*` in the worker user's global git configuration, as the
      worker, where it is missing.
- [ ] 5.3 `serve` has no `--same-user` flag, and refuses a missing worker user with 5.1's first
      refusal. `run` always runs the worker as the Igor's own user, whether or not a user named
      `igor-worker-<role>-<rank>` exists on the host.
- [ ] 5.4 `run` prints this first, before discovery (verbatim; Adam may reword):

      ```
      ! workers run as <igor-user>, the same user as this Igor, so a worker can read every credential this Igor holds. igor serve runs them as a separate worker user: docs/deployment.md, "A separate user for the worker".
      ```

- [ ] 5.5 Tests with an injected probe: each refusal, in order, the `claude` and `skills_dir`
      checks among them; `fs.protected_hardlinks` at `0` refuses; the file the `skills_dir`
      probe created is deleted; the first failure
      stops the check; every refusal exits with status 78; `serve` refuses with no worker user, and refuses `--same-user` as an
      unknown flag; `run` runs as the same user and prints the notice; `serve` never prints
      it.

## 6. Measurements

On a Linux host running the shipped unit, with a real `igor-worker-<role>-<rank>`, Claude Code's
current release and the worker's real flags. Canary files sit at the real paths with the real owners and
modes: `/etc/igor/env`, `/etc/igor/<role>.env`, `/etc/igor/<role>.pem`, the `seatKey` path, and a
file in the service user's home. Each holds a random string and nothing else. Never a real secret.

- [ ] 6.1 Repeat #163's table with the worker running as `igor-worker-<role>-<rank>`: the Read tool,
      `head`, `tail`, and a test file run by `npm test` that reads each canary and
      `/proc/<igor pid>/environ`, and writes into the lore checkout and the git directory's `hooks/`.
      Every read and write is refused, and no canary string appears in the stream, the
      transcript or the published artifact.
- [ ] 6.2 Under `sudo` in the unit: the stream parses as it does now; `kill -KILL -- -<pgid>` as
      the worker ends a running `npm test`; `sudo` works with `ProtectSystem=strict`,
      `PrivateTmp=true` and no `NoNewPrivileges`; the exit status reaches the Igor.
- [ ] 6.3 `git rm` of a top-level file, `git mv`, `git log` and `git show`, run by the worker
      with the git directory read-only and outside the tree and `GIT_INDEX_FILE` in the outbox,
      all succeed, and the Igor's `changes()` reads them back. Claude Code's Edit and Write tools
      change a file the Igor owns.
- [ ] 6.4 Record which of `claude`'s environment variables reach a command it runs, the seat token
      above all.
- [ ] 6.5 Record what `sudo` writes to the auth log per worker start. With 1.7 built it should
      hold no prompt text. If it holds any, add `Defaults:igor !syslog` (or what the
      measurement shows works) to `deploy/sudoers.example`, with a comment saying why.
- [ ] 6.6 Run two Igor units with one worker user and a worker in each, since whether the `/proc`
      reach holds between units is unmeasured. Record in `design.md`, *Each instance has its own
      worker user*, and in 8.4's section of `docs/deployment.md`, whether either worker can read
      the other's `/proc/<pid>/environ`, or list and write the other's tree through
      `/proc/<pid>/cwd`. Section 8 does not wait for it (Adam, 2026-10-17).
- [ ] 6.7 Before 8.2 ships, confirm that under the unit, with `User=` and `Group=` the service
      user, the Igor is in the worker's group through
      `SupplementaryGroups=igor-worker-%i`, can write its home through
      `ReadWritePaths=/var/lib/igor-worker-%i`, and sudoes to `igor-worker-%i`.
      Sections 2 to 4 do not wait for this.
- [ ] 6.8 Before 8.2 ships, confirm that under the unit with `ProtectProc=invisible`, a worker
      user listing `/proc` sees no process of the service user and none of another worker user
      on the same host, and record the kernel version. Where the kernel lacks per-mount
      `hidepid`, record that the setting had no effect.
- [ ] 6.9 Before 1.7 is built, on the Claude Code version the server runs: `claude -p` with
      `--output-format stream-json --verbose` and no prompt argument reads its prompt from
      stdin, and `--system-prompt-file <file>` sets the system prompt, as `claude --help`
      lists it. Also: the usage read's `/usage`, passed on stdin under `--output-format json`, runs
      as it does as an argument; and triage's `claude -p` under `--output-format json` reads its prompt from stdin. If any
      fails, the means of keeping prompts out of the arguments goes back to Adam; the rule
      stands.
- [ ] 6.10 Under the unit, as the worker user through the `sudo` spawn: the modes of a file and a
      directory created by the Edit and Write tools, by `npm install` and by `git`, and whether
      the Igor can read each through the group. Record the umask in effect.

## 7. An automated end-to-end test

- [ ] 7.1 `test/worker-user.test.ts`, skipped with a stated reason unless `IGOR_TEST_WORKER_USER`
      names a user the test runner can `sudo -n` to. It runs `claudeWorker` with a fake `claude`,
      a short node script, as that user. The script tries to read a canary file `0600` in a
      `0700` directory of the runner's, read the runner's `/proc/<pid>/environ` where `/proc`
      exists, and write into a directory standing in for the lore checkout. It reports each
      result as a stream event. The test asserts every attempt was refused and no canary
      appears.
- [ ] 7.2 The same file checks that a kill ends the fake worker and a child it started, and that
      release removes a `0700` directory the fake worker created.

## 8. Deployment

- [ ] 8.1 New `deploy/sudoers.example`, verbatim except where 6.5 adds a line. 8.4's commands
      copy its comment and write one line per instance in the form it shows:

      ```
      # /etc/sudoers.d/igor, written by the commands in docs/deployment.md,
      # "A separate user for the worker".
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
      and `ExecStart=` passes `%i` to `igor serve` (1.1). Put `/usr/local/bin` first on `PATH` and change the `PATH` comment to say `claude` must
      live where the worker can run it. Replace `NoNewPrivileges=true` with this comment (may be
      reworded):

      ```
      # No NoNewPrivileges=: it stops sudo from changing user, and sudo is how a worker runs as
      # this instance's worker user, which cannot read /etc/igor. See docs/deployment.md, "A
      # separate user for the worker".
      ```

      Add these lines, with this comment (may be reworded; the restart lines come from 0.9 and
      replace `Restart=always`):

      ```
      # A process sees only its own user's processes, so no worker can read another's command
      # line or environment through /proc.
      ProtectProc=invisible
      # A crash is restarted; a clean exit (status 0) is not. A process that refuses to start,
      # such as on a missing worker user, exits 78 (EX_CONFIG) and is not restarted: fix what
      # the journal names, then start it again.
      Restart=on-failure
      RestartPreventExitStatus=78
      ```

- [ ] 8.3 #192's (`deploy-image`) container image and compose file, after #192 merges as it is
      (proposal, decision 20). This is how a Mac runs `serve`.
      - `Dockerfile`, `runtime` stage: install `sudo` from Debian at a pinned version, as the
        image pins its other packages. Create the worker user for each instance the compose
        file runs, `igor-worker-<role>-1`, with its home at `/var/lib/igor-worker-<role>-1`,
        and write each instance's sudoers line to `/etc/sudoers.d/igor` in the form 8.1 shows,
        naming `node`, the user #192's image runs Igor as, where 8.1's line names `igor`. Create
        `/var/lib/igor/trees`, owned by that user, and put `claude` where the worker user can
        run it.
      - `deploy/docker-compose.yml`: each service runs `igor serve <role>-1`, since the compose
        file runs one container per role, as rank 1, so each container's worker user is
        `igor-worker-<role>-1`. The trees volume mounts at `/var/lib/igor/trees` instead of
        `/tmp` (the proposal's decision 19). The header comment says the image holds `sudo`,
        the worker users and their sudoers lines. A mounted key is owned by the uid the image
        runs Igor as, with mode `0600`, as #192's comment already says. `ProtectProc=` is a
        unit setting, and the container has no systemd unit, so it does not apply there. 1.7
        leaves no prompt in any argument list, so neither the worker nor anything else in the
        container can read the Igor's or the worker's prompt from `/proc`. Add `node` to each
        worker user's group, which the unit's `SupplementaryGroups=` does on a host; without it
        start check 3 refuses every start.
      - Run 5.1's start check in the container, on Linux and under Docker Desktop on macOS, and
        record the result in `design.md`.
- [ ] 8.4 `docs/deployment.md`: add this section after *Before it can run*, and make it the
      fourth thing in that list. May be reworded; the commands may not change without
      re-measuring them. The loop that creates each instance's user, home and sudoers line is
      unmeasured: run it on section 6's host before this ships, and record the result in
      `design.md`.

      ````markdown
      ## A separate user for the worker

      A worker runs the commands its role allows, such as `npm test`, and those run code the
      worker wrote. Claude Code's permission checks don't reach that code, so a worker running
      as the service user can read whatever the service user can: the env files, the App's key,
      the seat tokens. An issue anyone can file can ask it to. So the worker runs as a second
      user, which can read none of them, and `igor serve` refuses to start without one.

      Each Igor instance, `igor@<role>-<rank>`, gets its own worker user,
      `igor-worker-<role>-<rank>`, with its own home and sudoers line. Workers sharing one user
      could read each other's seat tokens through `/proc`.

      List your instances, each with its rank, such as `maintenance-1`. Then create each one's
      user and home, and write its sudoers line. Run it again, listing every instance, whenever
      you add one. Keep a rank you retire in the list. Another rank of the same role removes the
      retired rank's working trees by acting as the retired rank's worker user, and only that
      user's sudoers line allows it:

      ```bash
      instances="maintenance-1 generalist-1 generalist-2"
      { grep '^#' deploy/sudoers.example
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

      **Neither user logs in to Claude.** Igor never uses a stored login: every seat has a
      token, and each worker gets its seat's token in its environment. [Lending a
      seat to an Igor](seats.md) shows how to create a token.

      **On your own machine**, `igor run` runs the worker as you and says so when it starts.
      `igor serve` never does: it needs its worker user.
      ````

- [ ] 8.5 `docs/deployment.md`, *What the machine needs*: the paragraph on `PATH` says `claude`
      goes in `/usr/local/bin`, with a link to the new section, instead of telling the reader
      to check the service user's `~/.local/bin`.
- [ ] 8.6 `docs/deployment.md`, *Keeping the token out of your shells*: replace "and the service
      user running nothing else is what stands in for the isolation there" with "and the worker
      runs as a user that cannot read the file:
      [A separate user for the worker](#a-separate-user-for-the-worker)".
- [ ] 8.7 `docs/deployment.md`, *When something is wrong*: one row per refusal in 5.1,
      each naming its cure in a phrase, as the existing rows do.

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
