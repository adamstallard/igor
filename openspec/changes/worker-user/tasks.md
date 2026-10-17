## 0. Order and dependencies

- [ ] 0.1 Build on `main` as it stands at gate two, when the implementation is pushed after this
      specification is approved. The start-up probe covers every credential path the
      configuration has by then: `GITHUB_APP_PRIVATE_KEY_FILE`, `seatKey` if #171 has merged,
      and seat `token_file` paths while they exist. If #171 has not merged, file an issue asking
      #171 to add `seatKey` to this probe, and link it here.
- [ ] 0.2 Run the measurements in section 6 before building sections 2 to 4. Record each result in
      `design.md`, including any that contradicts it, and change the design before the code where
      one does.
- [ ] 0.3 If #101 (`condition-backoff`) has merged, record a `sudo` spawn failure of the worker
      under a cure key scoped to the whole Igor, #101's name for the key a recurring failure is
      grouped under. A key of that scope stops the Igor, where an item-scoped one would fail
      every item in turn.

## 1. Starting the worker as another user

- [ ] 1.1 Read `IGOR_WORKER_USER` from the Igor's environment in `run` and `serve`, and nowhere
      else. An empty value is the same as unset. `igor.config.yaml` gains no key for it.
- [ ] 1.2 With a worker user, `claudeWorker` spawns
      `sudo --non-interactive --user=<worker> --preserve-env=<names> -- /usr/bin/env PATH=<path> <claude> …`.
      `<names>` is every variable `workerEnv` built except `PATH` and `HOME`, and `<claude>` is
      the absolute path the Igor resolves on its own `PATH`. The worker's own flags are
      unchanged, and so are `detached` and the stdio pipes.
- [ ] 1.3 Without a worker user, the spawn is exactly what it is today.
- [ ] 1.4 Tests (with an injected command, no real `sudo`): the argv for each mode; the seat token
      in no argv element; `--preserve-env` naming exactly `workerEnv`'s keys less `PATH` and
      `HOME`; an empty `IGOR_WORKER_USER` treated as unset.

## 2. The tree and the outbox

- [ ] 2.1 With a worker user, `CloneProvider.provision` clones under umask `007` with
      `--separate-git-dir=<tree>-git`. It gives the tree directory and the outbox the worker's
      primary group and mode `2770`, and removes group write from the git directory and
      everything under it.
- [ ] 2.2 Before the worker starts, the Igor copies the git directory's index into the outbox
      and sets `GIT_INDEX_FILE` to that copy in the worker's environment, as the modified
      worker-environment requirement allows. After the worker exits, every git command the Igor
      runs to read changes uses the git directory's own index, never the copy.
- [ ] 2.3 Every git command the Igor runs in a tree, in both modes, names the git directory and
      the tree with `--git-dir` and `--work-tree`, so a `.git` the worker replaced is never read
      by the Igor. Without a worker user, the git directory stays inside the tree and the
      index is not copied.
- [ ] 2.4 The sweep's name rule takes `<tree>-git` as it takes `<tree>-outbox`.
- [ ] 2.5 Tests on a real clone, run as one user: the modes and group after provisioning; status
      read against the git directory's index reports a `git rm` and a `git mv` made with
      `GIT_INDEX_FILE` set to the copy; a file marked skip-worktree or assume-unchanged in the
      copy is still read as changed; a `.git` file in the tree pointing elsewhere does not change what the
      Igor reads; the sweep removes a stranded `-git` directory.

## 3. Nothing run, nothing followed

- [ ] 3.1 Every git command the Igor runs in a tree passes
      `-c core.hooksPath=/dev/null -c core.fsmonitor=false -c submodule.recurse=false`, and
      `--ignore-submodules=all` where the command takes it, in both modes. A changed path that
      is a submodule entry or holds its own `.git` stops the run before publishing (verbatim;
      Adam may reword):

      ```
      `<path>` is a nested repository, and Igor reads none a worker made, so nothing was published
      ```
- [ ] 3.2 Before reading changes, the Igor kills the worker's process group, which is already gone
      when the worker exited by itself.
- [ ] 3.3 `changes()` refuses a path that is a link or has a link among its directories, checking
      each component with `lstat`. It opens files with `O_NOFOLLOW` and checks the opened file's
      real path is inside the tree's real path. A file it cannot open is reported rather than
      skipped. Execution stops on either, before publishing, with these reasons (verbatim; Adam
      may reword at review):

      ```
      `<path>`, `<path>` is a symbolic link or lies under one, and Igor reads no file a worker changed through a link, so nothing was published
      ```

      ```
      `<path>` could not be read by this Igor, and an artifact without it would be incomplete, so nothing was published
      ```

      "is" becomes "are" for more than one path, as the existing stop for a path
      that is not text does (`src/worktree.ts`). Every
      `<path>` in these reasons, and in 3.1's, is escaped for a code span with `quoteName`'s
      escaping (`src/worktree.ts`): the worker chooses the names, and a backtick in one would
      otherwise end the span.
- [ ] 3.4 The declaration file is opened with `O_NOFOLLOW` and read only if it is a regular file.
      Otherwise the run stops with (verbatim; Adam may reword):

      ```
      the worker's declaration file is not a regular file, so it was not read and nothing was published
      ```

- [ ] 3.5 Tests, in both modes: a hook and a `core.fsmonitor` setting in the tree do not run; a
      link to a file outside the tree stops the run, and that file's content is in no
      `ChangedFile`, reason or record; a file under a linked directory stops it the same way; a
      file with mode `000` stops it; a linked declaration file is not read; a nested repository
      whose configuration defines a filter stops the run and its filter does not run; a path
      holding a backtick is escaped in the reason.

## 4. Kill, release, sweep

- [ ] 4.1 With a worker user, `killTree` and `killLiveWorkers` run
      `sudo -n -u <worker> -- kill -KILL -- -<pgid>`, synchronously in the `exit` handler. A
      group already gone is not an error.
- [ ] 4.2 `ClonedTree.release()` and the startup sweep first run
      `sudo -n -u <worker> -- rm -rf -- <tree> <outbox>`, then the Igor's own removal of the
      tree, the outbox and the git directory. Both are attempted whatever the first does.
- [ ] 4.3 Tests with an injected runner: the kill and the removal argv; a failed first removal
      still leads to the second.

## 5. The start-up check and the same-user mode

- [ ] 5.1 A new module runs the checks in `design.md`, *What each start checks*, before `wire` in
      `run` and `serve`. The probe is one `sudo` call as the worker, with the paths in its
      argv, which are not secret. The refusals, verbatim; Adam may reword at review:

      ```
      IGOR_WORKER_USER names "<worker>", which is not a user on this host
      ```

      ```
      IGOR_WORKER_USER names "<worker>", which is <root | the user this Igor runs as>. A worker must run as a separate unprivileged user.
      ```

      ```
      this Igor cannot start a process as "<worker>" without a password (sudo said: <first line of its stderr>). Install deploy/sudoers.example as /etc/sudoers.d/igor.
      ```

      ```
      this Igor is not in "<group>", the group of its worker user "<worker>", so it cannot read what the worker writes. Add it with SupplementaryGroups= in the unit, then restart.
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

- [ ] 5.2 The check sets `safe.directory=*` in the worker user's global git configuration, as the
      worker, where it is missing.
- [ ] 5.3 `serve` gains `--same-user`. Without a worker user and without the flag it refuses with
      (verbatim; Adam may reword):

      ```
      igor serve takes work from issues anyone can file, and IGOR_WORKER_USER is not set, so a worker would run as <igor-user> and could read every credential this Igor holds. Set IGOR_WORKER_USER to a separate user (docs/deployment.md, "A separate user for the worker"), or pass --same-user to run workers as <igor-user> anyway.
      ```

      `--same-user` with `IGOR_WORKER_USER` set is refused as contradictory, the way
      `contradictoryRunFlags` refuses `--plan` with `--claim`.
- [ ] 5.4 Whenever workers will run as the Igor's own user, `run` and `serve` print this first,
      before discovery (verbatim; Adam may reword):

      ```
      ! workers run as <igor-user>, the same user as this Igor, so a worker can read every credential this Igor holds. Set IGOR_WORKER_USER to a separate user: docs/deployment.md, "A separate user for the worker".
      ```

- [ ] 5.5 Tests with an injected probe: each refusal, in order, the `claude` check among them; the first failure stops the check;
      `serve` refuses with no worker user and runs with `--same-user`; `run` runs and prints the
      notice; the notice is absent with a worker user.

## 6. Measurements

On a Linux host running the shipped unit, with a real `igor-worker`, Claude Code's current
release and the worker's real flags. Canary files sit at the real paths with the real owners and
modes: `/etc/igor/env`, `/etc/igor/<role>.env`, `/etc/igor/<role>.pem`, the `seatKey` path, and a
file in the service user's home. Each holds a random string and nothing else. Never a real secret.

- [ ] 6.1 Repeat #163's table with the worker running as `igor-worker`: the Read tool, `head`,
      `tail`, and a test file run by `npm test` that reads each canary and
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
- [ ] 6.6 Run two Igor units with one worker user and a worker in each. Record whether either
      worker can read the other's `/proc/<pid>/environ`, or list and write the other's tree
      through `/proc/<pid>/cwd`. The answer goes to the open question on a shared worker user.

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

- [ ] 8.1 New `deploy/sudoers.example`, verbatim except where 6.5 adds a line:

      ```
      # /etc/sudoers.d/igor. Install, then check, with:
      #   sudo install -m 440 deploy/sudoers.example /etc/sudoers.d/igor && sudo visudo -c
      #
      # The Igor's service user may run commands as its worker user, and as nobody else: that is
      # how a worker is started, killed and cleaned up after. It grants nothing toward root.
      # Anything the service user runs as igor-worker, it could already do as itself.
      igor ALL=(igor-worker) NOPASSWD: ALL
      ```

- [ ] 8.2 `deploy/igor.service`: add `Environment=IGOR_WORKER_USER=igor-worker` and
      `SupplementaryGroups=igor-worker`. Add `/var/lib/igor-worker` to `ReadWritePaths=`. Put
      `/usr/local/bin` first on `PATH` and change the `PATH` comment to say `claude` must live
      where the worker can run it. Replace `NoNewPrivileges=true` with this comment (may be
      reworded):

      ```
      # No NoNewPrivileges=: it stops sudo from changing user, and sudo is how a worker runs as
      # igor-worker, which cannot read /etc/igor. See docs/deployment.md, "A separate user for
      # the worker".
      ```

- [ ] 8.3 `deploy/docker-compose.yml`: `user: igor` and `IGOR_WORKER_USER: igor-worker` on the
      service. The header comment says the image also needs `sudo`, the `igor-worker` user, and
      `deploy/sudoers.example` installed. A mounted key is owned by the `igor` user's uid with
      mode `0600`.
- [ ] 8.4 `docs/deployment.md`: add this section after *Before it can run*, and make it the
      fourth thing in that list. May be reworded; the commands may not change without
      re-measuring them.

      ````markdown
      ## A separate user for the worker

      A worker runs the commands its role allows, such as `npm test`, and those run code the
      worker wrote. Claude Code's permission checks don't reach that code, so a worker running
      as the service user can read whatever the service user can: the env files, the App's key,
      the seat tokens. An issue anyone can file can ask it to. So the worker runs as a second
      user, `igor-worker`, which can read none of them, and `igor serve` refuses to start
      without one.

      Once per host:

      ```bash
      sudo useradd --system --create-home --home-dir /var/lib/igor-worker \
        --shell /usr/sbin/nologin igor-worker
      sudo chmod 700 /var/lib/igor-worker
      sudo install -m 440 deploy/sudoers.example /etc/sudoers.d/igor && sudo visudo -c
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
      yourself, `sudo -u igor-worker cat /etc/igor/env` must say `Permission denied`.

      One worker user serves every Igor on the host. Under systemd each instance has its own
      `/tmp`, so their trees are apart.

      **On your own machine**, `igor run` runs the worker as you and says so when it starts.
      `igor serve` does the same only when passed `--same-user`.
      ````

- [ ] 8.5 `docs/deployment.md`, *What the machine needs*: the paragraph on `PATH` says `claude`
      goes in `/usr/local/bin`, with a link to the new section, instead of telling the reader
      to check the service user's `~/.local/bin`.
- [ ] 8.6 `docs/deployment.md`, *Keeping the token out of your shells*: replace "and the service
      user running nothing else is what stands in for the isolation there" with "and the worker
      runs as a user that cannot read the file:
      [A separate user for the worker](#a-separate-user-for-the-worker)".
- [ ] 8.7 `docs/deployment.md`, *When something is wrong*: one row per refusal in 5.1 and 5.3,
      each naming its cure in a phrase, as the existing rows do.

## 9. Architecture

- [ ] 9.1 `docs/architecture.md` §6.3.2 gains this paragraph after its second (may be reworded):

      ```markdown
      The environment is not the only barrier. A worker runs as a separate Unix user,
      `IGOR_WORKER_USER`, which cannot read the Igor's env files, keys or `/proc/<pid>/environ`:
      an allowed `npm test` runs whatever the worker wrote, and Claude Code's path checks do not
      reach it (#163). The Igor reads the worker's changes without following links, and runs no
      hook in its tree.
      ```

## 10. Closing

- [ ] 10.1 Every requirement in `specs/task-execution/spec.md` met. Section 6's results are in
      `design.md`. #163 is closed by the gate-two pull request.
