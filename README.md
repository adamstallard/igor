# Igor

Role-instanced AI teammates that find their own work, claim it in the open, and draw on
what the team has already learned.

An Igor is not a person. It is an instance of a role. You can run five Igors on the same
role, retire one mid-week, and lose nothing — because nothing durable lives inside an
Igor. The role is versioned in git. The knowledge belongs to the team.

## Vocabulary

- **Igor** — a running instance. Interchangeable, disposable, holds no durable state.
- **Role** — a versioned config: what to watch for, what it may claim, how to behave.
  Many Igors can run the same role.
- **Lore** — the team's curated store of learned knowledge. Shared by every Igor,
  readable and editable by humans, versioned in git.
- **Claim** — a public announcement, in the team's own tools, that an Igor has taken a
  piece of work. Humans and other Igors can see it and act accordingly.

## How it works

Igors poll rather than wait for triggers. Each cycle:

1. **Search** — deterministic queries against Slack, ClickUp, and GitHub, defined by the
   role. No model involved.
2. **Recognize** — a small local model decides whether a candidate is in this role's lane,
   and which lore entries apply to it.
3. **Claim** — before starting, the Igor posts to the relevant surface so humans and other
   Igors know it is working, and can back off or join in.
4. **Work** — a frontier model does the task, with the fired lore already in context.
5. **Report** — status updates back to the same surfaces, including a graceful handoff if
   the Igor runs out of budget mid-task.

## Lore

Lore is not a wiki and not a vector index over everything. It is a small, curated set of
lessons, each carrying the conditions under which it applies, its provenance, and how many
independent episodes support it.

Entries are promoted by a periodic **consolidation** pass that scans what actually
happened — corrections, surprises, reverts, repeated questions — drafts candidate
entries, and queues them for human review. Approval is a pull request. Entries that stop
firing are pruned. The store stays small enough for a person to read.

Two indexes are compiled from it: exact predicates over metadata (paths, labels, repos)
and learned conditions over the recognizer's internal state. Both return entries; neither
requires an Igor to think to ask.

## Status

Early. Nothing is built yet. This repo currently holds the design.
