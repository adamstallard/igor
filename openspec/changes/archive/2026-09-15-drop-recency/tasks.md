## 1. The spec

- [x] 1.1 `list` shows support and the newest provenance date, and no decayed weight

## 2. The word

- [x] 2.1 Drop `recency` from `DERIVED_FIELDS`, and the test that asserts it is rejected
- [x] 2.2 Confirm an entry carrying an unknown field is still handled sensibly without it —
      test rather than assume, since that test was the only thing covering the path
- [x] 2.3 `docs/architecture.md` illustrates derived-not-stored with support rather than with a
      feature that was removed
