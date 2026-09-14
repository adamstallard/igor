## 1. Tell a stop from a loss

- [x] 1.1 The mid-execution check reports the claim's status rather than a boolean
- [x] 1.2 A stop keeps today's behaviour, and names the stop in the refusal
- [x] 1.3 A loss publishes a draft with no reviewers, carrying the artifact back to the loop
- [x] 1.4 The action space is consulted first, so a role that may not publish still does not

## 2. Say what exists

- [x] 2.1 A message on the item naming the artifact and the new holder
- [x] 2.2 The loop reports `spoke` truthfully on the path, since it now leaves a message

## 3. Tests

- [x] 3.1 A stop publishes nothing; a loss publishes a draft
- [x] 3.2 No reviewers are requested on the draft
- [x] 3.3 The completion action is not performed
- [x] 3.4 A role permitting no pull request publishes nothing on a loss
