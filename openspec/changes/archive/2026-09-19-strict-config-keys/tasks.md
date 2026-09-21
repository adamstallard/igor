## 1. One rule

- [x] 1.1 `keyCheck` in `src/keys.ts`: a refusal naming the offending key and the accepted ones,
      raised with the caller's own error type
- [x] 1.2 Every level uses it — no second wording for the same refusal

## 2. The budget

- [x] 2.1 `budget` refuses a key that is neither `seats` nor `pools`
- [x] 2.2 `seats` and `pools` declared as anything but a list are refused, not read as empty
- [x] 2.3 A pool refuses a key that is neither `id` nor `seats`, and a pool's `seats` must be a
      list
- [x] 2.4 Keys are checked before the id is required, so a misspelt `id` reads as the typo; the
      subject is positional until there is an id to quote
- [x] 2.5 Absent stays empty: no `budget`, an empty one, or one with no `pools` all still mean
      unenforced
- [x] 2.6 Tests at each of those, including the discrimination in 2.5

## 3. The config file

- [x] 3.1 `resolveConfig` refuses a key outside `destination`, `reviewers`, `experts`,
      `publicStore`, `budget`
- [x] 3.2 Checked before the required-key check, so a misspelt `destination` reads as the typo
- [x] 3.3 Tests, including that every documented key is still accepted

## 4. Role files

- [x] 4.1 `readRoleFile` refuses a key outside the thirteen a role declares, so the check covers
      a role, its org base and any parent
- [x] 4.2 `lane`, `lane.labels`, `lane.paths`, `lane.age` and each `sources` entry refuse a key
      nobody reads
- [x] 4.3 `claim` is refused with the reason it is not a role's to set, beside `name`
- [x] 4.4 Tests: an unknown key on a role, on the org base, on a named parent, in a lane, in a
      source; and every documented key still accepted

## 5. The documented configurations

- [x] 5.1 Every fenced YAML block in `README.md` and `docs/` declares the level it sits at and is
      parsed there, indented ones included, with `igor.config.example.yaml` parsed as a whole
      config
- [x] 5.4 A floor under the scan: the blocks found are counted independently, so a narrower
      matcher fails rather than silently checking fewer
- [x] 5.2 Fix the two blocks that did not parse on the rules as they already stood
- [x] 5.3 Verify the live config and roles at `/Users/adam/igor-lore` are unaffected
