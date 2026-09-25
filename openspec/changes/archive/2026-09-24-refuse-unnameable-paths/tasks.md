## 1. Telling a name that survived from one that did not

- [x] 1.1 `named(name: Buffer)` decodes the name and keeps the bytes beside it only where
      re-encoding the decoded name does not give them back
- [x] 1.2 `ChangedFile.rawName` carries those bytes, absent on every ordinary entry
- [x] 1.3 Applied at both decode sites in `changes()`, including the name a rename came from,
      which git writes as the record after it
- [x] 1.4 Tests at the parse seam, against byte sequences no filesystem here will hold: an
      invalid name flagged, a truncated multi-byte sequence flagged, a rename's `from` flagged
- [x] 1.5 Tests that it stays quiet — ASCII, valid multi-byte, and a file really named
      `�.md` created on disk and published end to end

## 2. The refusal

- [x] 2.1 The publishing path refuses where any changed entry carries bytes, and returns
      `failed` with a reason rather than publishing
- [x] 2.2 Placed above the region [#88](https://github.com/adamstallard/igor/pull/88) rewrites,
      reading only `changed` — never `files` or `deletions`
- [x] 2.3 `quoteName` writes the name as git wrote it: printable ASCII as itself, `\xHH`
      otherwise, backslash doubled and backtick escaped so the rendering is injective and
      cannot close the code span the refusal wraps it in
- [x] 2.4 `showName` doubles on the ordinary side too, so an escaped name and a plain one can
      never read alike, and the recorded change list uses it — the reason and the record name
      one file
- [x] 2.5 Tests, each observed red first: a modification refused, a deletion refused, the
      reason naming the file by its bytes and not by U+FFFD, the record likewise, and an
      ordinary change still published

## 3. The guarantee

- [x] 3.1 One `task-execution` requirement: a change is not published under a name that is not
      text, and the round trip — not a search for the replacement character — is what decides
- [x] 3.2 `design.md` records why the refusal is in the publishing path rather than in
      `changes()`, which is a requirement in force rather than a preference
- [x] 3.3 `design.md` records the per-entry alternative and the argument for it, so a repository
      that trips this can reopen the scope rather than rediscover it
- [x] 3.4 #97's body updated: the three costs it states as accepted are the ones this closes,
      and its "no delta" section now points at this one
