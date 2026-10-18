## 0. Order and dependencies

- [ ] 0.1 Build on `main` as it stands at gate two, when the implementation is pushed after this
      specification is approved. The start-up probe covers every credential path the
      configuration has by then: `GITHUB_APP_PRIVATE_KEY_FILE`, `seatKey` if #171 has merged,
      and seat `token_file` paths while they exist. If #171 has not merged, file an issue asking
      #171 to add `seatKey` to this probe, and link it here.
- [ ] 0.2 Run measurements 6.1 to 6.5 before building sections 2 to 4; 6.6 informs the docs, and
      6.7 waits on the proposal's open question on `User=` and `Group=`. Record each result in
      `design.md`, including any that contradicts it, and change the design before the code where
      one does.
- [ ] 0.3 If #101 (`condition-backoff`) has merged, record a `sudo` spawn failure of the worker
      under a cure key scoped to the whole Igor, #101's name for the key a recurring failure is
      grouped under. A key of that scope stops the Igor, where an item-scoped one would fail
      every item in turn.
- [ ] 0.4 If #137 (`carry-what-a-tree-holds`) has archived, build 3.3's publishing of a changed
      link as a link, and 3.1's publishing of a changed gitlink as a pointer. If not, build both
      stops, file an issue asking whichever of #137 and this change archives second to replace
      those two stops with the publishing and drop the conditions on #137 from *The Igor reads no file on
      the worker's behalf through a link* and *Nothing the worker writes is executed by the
      Igor*, and link it here.
- [ ] 0.5 If #153 (`signed-publishing`) has merged, its model steps go through 1.4, and its
      trailers are created against the tree 2.5 stages. If not, file an issue asking #153 to run
      its steps through this change's spawn, to have them edit without signing, and to create
      both trailers against the tree 2.5 stages, and link it here. Who runs the signing calls
      against that tree waits on the proposal's open question on it.
- [ ] 0.6 If #174 (`pinned-skills`) has merged, add `skills_dir` to the probe in 5.1. If not,
      file an issue asking #174 to add it, and link it here.
- [ ] 0.7 If #189 (`loop-verifies-commands`) has merged, its checks go through 1.4's spawn and
      run after 3.2 records the tree, and what they write is discarded. If not, file an issue
      asking #189 to run its checks on the tree the Igor recorded and to publish that tree, as
      *The Igor reads no file on the worker's behalf through a link* requires, and link it
      here.

- [ ] 0.8 1.1 and 8.2 need instances named `<role>-<rank>`, with the rank always written, so
      that `igor-worker-%i` is the worker user's name (Adam, 2026-10-17). #179
      (`concurrent-instances`) is to make that naming change in its own next revision. If #179
      has merged
      with it, build on it. Otherwise, file an issue asking whichever of #179 and this change is
      built second to name instances that way, and link it here.

## 1. Starting the worker as another user

- [ ] 1.1 `serve` always runs its worker as `igor-worker-%i`, the name the unit gives it, and
      `run` never runs one as a worker user. The Igor computes no name, and `igor.config.yaml`
      gains no key for it. How the Igor learns the name waits on the proposal's open question
      on `User=` and `Group=`; build 1.2 behind one function that returns it, so only that
      function changes.
- [ ] 1.2 Under `serve`, `claudeWorker` spawns
      `sudo --non-interactive --user=<worker> --preserve-env=<names> -- /usr/bin/env PATH=<path> <claude> …`.
      `<names>` is every variable `workerEnv` built except `PATH` and `HOME`, and `<claude>` is
      the absolute path the Igor resolves on its own `PATH`. The worker's own flags are
      unchanged, and so are `detached` and the stdio pipes.
- [ ] 1.3 Under `run`, the spawn is exactly what it is today.
- [ ] 1.4 Every other `claude -p` the Igor starts with a tree as its working directory goes
      through 1.2's spawn, with the same environment rules. Triage and usage reads, which run
      outside any tree, do not.
- [ ] 1.5 Tests (with an injected command, no real `sudo`): the argv for each mode; the seat token
      in no argv element; `--preserve-env` naming exactly `workerEnv`'s keys less `PATH` and
      `HOME`; `run` spawning without `sudo` even where a user named `igor-worker-<role>-<rank>`
      exists; a model step in the tree after the worker, and #153's `prose start`, spawned
      through `sudo` as the worker user.
- [ ] 1.6 #153's `prose start` goes through 1.2's spawn as the worker user, after the reset of
      the worker's home that #174 builds, so the session mark is the worker's and sits in its
      home. If #153 has not merged, the issue 0.5 files asks for this too; if #174 has not, the
      issue 0.6 files does.

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
      (Adam, 2026-10-17). A sibling rank's sweep of a gone rank's trees (#179) runs 4.2's first
      pass as the gone rank's worker user.
- [ ] 2.5 Where a role runs #153's steps, bug-hunter runs, then the prose pass, and neither
      stages or signs. After the last model step exits, the Igor's code stages the changed paths
      once, in the git directory's own index, never the copy, and both trailers, `Bug-hunter:`
      and `Prose:`, are created against that index's tree, the tree 3.2 records and
      publishes.
- [ ] 2.6 Tests on a real clone, run as one user: the modes and group after provisioning; status
      read against the git directory's index reports a `git rm` and a `git mv` made with
      `GIT_INDEX_FILE` set to the copy; a file marked skip-worktree or assume-unchanged in the
      copy is still read as changed; a `.git` file in the tree pointing elsewhere does not change what the
      Igor reads; the sweep removes a stranded `-git` directory; a file marked unchanged in the
      copy is in the tree 2.5 stages; edits by both #153 steps are in that tree, and nothing is
      staged before the last step exits.

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

## 4. Kill, release, sweep

- [ ] 4.1 Under `serve`, `killTree` and `killLiveWorkers` run
      `sudo -n -u <worker> -- kill -KILL -- -<pgid>`, synchronously in the `exit` handler. A
      group already gone is not an error.
- [ ] 4.2 `ClonedTree.release()` and the startup sweep first run
      `sudo -n -u <worker> -- rm -rf -- <tree> <outbox>`, then the Igor's own removal of the
      tree, the outbox and the git directory. Both are attempted whatever the first does.
- [ ] 4.3 Tests with an injected runner: the kill and the removal argv; a failed first removal
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
      home directory`.

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
      stops the check; `serve` refuses with no worker user, and refuses `--same-user` as an
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
- [ ] 6.5 Record what `sudo` writes to the auth log per worker start. If it is the whole prompt,
      add `Defaults:igor !syslog` (or what the measurement shows works) to
      `deploy/sudoers.example`, with a comment saying why.
- [ ] 6.6 Run two Igor units with one worker user and a worker in each, since whether the `/proc`
      reach holds between units is unmeasured. Record in `design.md`, *Each instance has its own
      worker user*, and in 8.4's section of `docs/deployment.md`, whether either worker can read
      the other's `/proc/<pid>/environ`, or list and write the other's tree through
      `/proc/<pid>/cwd`. Section 8 does not wait for it (Adam, 2026-10-17).
- [ ] 6.7 Before 8.2 ships, once the proposal's open question on `User=` and `Group=` is
      answered: confirm that under the unit the Igor is in the worker's group through
      `SupplementaryGroups=igor-worker-%i`, can write its home through
      `ReadWritePaths=/var/lib/igor-worker-%i`, and sudoes to `igor-worker-%i`.
      Sections 2 to 4 do not wait for this.

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
      drop-in per instance and no `/etc/group` step. What `User=` and `Group=` hold, and how the
      unit gives the Igor the name (1.1), wait on the proposal's open question on them. Put `/usr/local/bin` first on `PATH` and change the `PATH` comment to say `claude` must
      live where the worker can run it. Replace `NoNewPrivileges=true` with this comment (may be
      reworded):

      ```
      # No NoNewPrivileges=: it stops sudo from changing user, and sudo is how a worker runs as
      # this instance's worker user, which cannot read /etc/igor. See docs/deployment.md, "A
      # separate user for the worker".
      ```

- [ ] 8.3 `deploy/docker-compose.yml`: `user: igor` on the service. The compose file runs one
      container per role, as rank 1, so each container's worker user is
      `igor-worker-<role>-1`. The trees volume mounts at `/var/lib/igor/trees` instead of
      `/tmp` (the proposal's decision 19). The header comment says the image also needs `sudo`, that user,
      and a sudoers line letting `igor` act as it. A mounted key is owned by
      the `igor` user's uid with mode `0600`.
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
      you add one:

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
