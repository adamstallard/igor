# stuck-conditions: constraints, rejected alternatives and rationale

## Rationale
- **Rationale: A failed worker spawn is a condition on its instance.**
  A sudoers line belongs to one host and one role's `igor serve`, so the condition is keyed by both. A key scoped to an item counts each item's failures apart, so no condition opens and every item fails in turn. One scoped to the role would also stop a developer's `igor run`, which has no worker user, and would let another host's clean runs and passing checks end the broken host's count and clear its condition. One scoped to the whole Igor clears only when an App token is minted again, which fixing a sudoers line does not do.
  Evidence: `scopeOf` gives a scope only to `role`, `seat` and `app` keys, and a key of any other shape stops nothing, in `src/conditions.ts` on `main`, so the instance scope is one task 0.3 of the `worker-user` change, #175, adds, https://github.com/adamstallard/igor/blob/b4f8ac0/src/conditions.ts#L66-L77
  Evidence: an Igor-scoped condition has no cooldown and no probe and stays open until `serve` mints a token again, in `src/conditions.ts` on `main`, https://github.com/adamstallard/igor/blob/b4f8ac0/src/conditions.ts#L225-L228
