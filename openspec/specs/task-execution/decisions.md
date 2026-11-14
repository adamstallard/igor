# task-execution: constraints, rejected alternatives and rationale

## Rejected
- **Rejected: Keeping the seat token out of reach of what the worker runs.**
  Facing: a worker, or a test it writes, reading its own seat's token and spending or leaking that seat.
  Lost because: the token has to be in `claude`'s environment, and Claude Code hands the commands it runs `CLAUDE_PID` while `claude` runs as the same worker user, so a test reads the token from `/proc/$CLAUDE_PID/environ` whatever `ProtectProc=invisible` hides, measurements 6.1 and 6.4 (2026-10-18) recorded in design.md of the `worker-user` change, #175.
  Instead: a worker can spend or leak its own seat and no other, and the comment on `npm test` in `templates/org.yaml` says so.
  Paths: src/execute.ts, templates/org.yaml

## Rationale
- **Rationale: The worker runs as a separate, unprivileged user.**
  Claude Code's permission checks cover its own tools and the commands it recognises, not the code an allowed command runs, so a test file the worker writes and `npm test` runs reads whatever the worker's Unix user can read. File permissions hold whatever the worker runs, so the worker gets a Unix user of its own.
  Claude Code's sandbox, denying the worker reads of `/etc/igor/` and `/proc`, lost because nobody has measured whether its read limits bind a process an allowed command starts, and because its guarantee would belong to whichever Claude Code release is installed.
  `systemd-run --uid=` lost as the way to enter that user because a unit's environment, the seat token included, is readable by unprivileged clients over D-Bus.
  One worker user shared by several roles lost because processes of one user can read each other's `/proc/<pid>/environ` and follow each other's `/proc/<pid>/cwd`, across two Igor units as well.
  The worker user's name comes from the role, never from `igor.config.yaml`, because the lore repository is edited by pull request, and one pull request naming the service user would turn isolation off for every Igor reading it.
  Evidence: a test run by an allowed `npm test` printed a canary outside the tree on 2026-10-07, #163
  Evidence: systemd.exec(5), *Environment=*: "Environment variables set for a unit are exposed to unprivileged clients via D-Bus IPC", https://www.freedesktop.org/software/systemd/man/latest/systemd.exec.html#Environment=
  Evidence: measurement 6.6 (2026-10-18), two units with one worker user, where one worker read the other's seat token and wrote its tree, and with a user per unit every attempt was refused, recorded in design.md of the `worker-user` change, #175
- **Rationale: A sudo that passes a secret is preceded by a check that passes none.**
  sudo writes every variable it passes with `--preserve-env` into the log line of a command it allows, value included, and logs a command it refuses even where `!log_allowed` stops it logging the commands it allows. Whether a refused command's line also carries the preserved variables is unmeasured until task 6.12 of the `worker-user` change, #175, measures it; if it does, a refused spawn would put the seat token or a proxy password in the journal, which a check carrying no secret avoids.
  Evidence: measurement 6.5 (2026-10-18), one journal line per worker start holding the seat token in full, recorded in design.md of the `worker-user` change, #175
  Evidence: sudoers(5), `log_denied` and `log_allowed`, https://www.sudo.ws/docs/man/sudoers.man/
- **Rationale: The worker can write its tree and outbox and nothing the Igor depends on.**
  The git directory sits beside the tree because the worker can write the tree's top directory and so could replace a `.git` inside it. A sticky bit on the top directory lost because it lets only a file's owner, the directory's owner or a privileged process remove or rename an entry, so it would also stop the worker's `git rm` of a top-level file the Igor owns.
  Evidence: inode(7), *The file type and mode*, on the sticky bit of a directory, https://man7.org/linux/man-pages/man7/inode.7.html
  Evidence: measurement 6.3 (2026-10-18), `git rm`, `git mv`, `git log` and `git show` working as the worker with a read-only git directory and an index copy, recorded in design.md of the `worker-user` change, #175
- **Rationale: A kill reaches the worker's whole process tree.**
  Under `igor serve` the kill ends every process the worker user owns, not the worker's process group, because Claude Code starts each Bash command in a session of its own. A kill of the group ended `claude` and `sudo` and left `npm test` running and holding the tree.
  Evidence: measurement 6.2 (2026-10-18), Claude Code 2.1.303 under the unit, recorded in design.md of the `worker-user` change, #175
- **Rationale: A prompt reaches claude on stdin, never in its arguments.**
  Any local user can read any process's command line, and a prompt holds the item's text and the lore its scope allows. `ProtectProc=invisible` alone is not enough: it has no effect on a kernel without per-mount `hidepid`, and the arguments would still reach `sudo`'s log line.
  Evidence: proc(5), `/proc/<pid>/cmdline`, https://man7.org/linux/man-pages/man5/proc.5.html
  Evidence: measurements 6.5, 6.8 and 6.9 (2026-10-18), on the log line, the hidden processes and Claude Code reading its prompt from stdin, recorded in design.md of the `worker-user` change, #175
- **Rationale: serve always has a worker user, and run never does.**
  `igor serve` is an unattended Igor working issues anyone can file, and a server whose worker user was never created would otherwise run its worker as the service user, which can read every credential the Igor holds. So `serve` has no `--same-user` flag. Refusing `igor run` without a worker user lost because it adds a step to every development run, and warning in both modes lost because a server would then run with the exposure and only a log line to show it.
  Evidence: the exposure a worker running as the service user has, #163
- **Rationale: Isolation is proved before any work is taken.**
  The start check requires that sudo log no command it allows the service user, because sudo's line for an allowed command holds every preserved variable, the seat token included. `Defaults:igor !log_allowed` removes that line and keeps sudo's log of refusals; `Defaults:igor !syslog` also removes it but turns off every sudo log line for the service user, refusals included, so it lost.
  Evidence: measurement 6.5 (2026-10-18), where both lines removed the journal line holding the seat token, recorded in design.md of the `worker-user` change, #175
  Evidence: sudoers(5), `log_allowed`, `log_denied` and `syslog`, https://www.sudo.ws/docs/man/sudoers.man/
- **Rationale: Every file read from the worker is a regular file with one link.**
  A parse error never quotes the file, because Node's `JSON.parse` puts the start of the text it failed on in its message, so a declaration file hard-linked to a key would carry the key's text into a refusal or record.
  Evidence: V8's message template `JsonParseUnexpectedTokenShortString`, "Unexpected token '%', \"%\" is not valid JSON", https://github.com/v8/v8/blob/main/src/common/message-template.h
