# Proposal: task-granularity-audit

## Why

Coarse-grained board tasks degrade the audit's core sensor. When a task like "implement feature X" sits in_progress for 30+ loops, every piece of work looks aligned (false negatives for drift), `stale_status` boundaries blur, and `current_match` matches everything. Industry sources agree on what "too coarse" means — INVEST's vertical slice, GTD's next-action (physical/visible/next), Kanban's item-size heuristics — and the IEEE TSE 2021 TDD experiment showed finer task granularity measurably improves output quality. Our extension should detect over-coarse tasks and nudge the agent to split them, because that directly restores the audit's own resolution.

## What Changes

- **Staleness signal (pure code)**: track when each task entered `in_progress` by diffing consecutive todo snapshots replayed from the branch (pending→in_progress transitions get a loop stamp). A task in_progress across more than `staleAuditSpans` audits (default 3) is flagged stale.
- **Granularity question (jev, always asked)**: new Choice question `granularity` — "Can this task's completion be verified by a single observable result?" with options `single_verifiable_outcome` / `bundles_multiple_outcomes` / `ambiguous_done_criteria` / `not_applicable`.
- **Verdict wiring**: nudge to split when (task is stale) OR (task is in_progress AND granularity in {`bundles_multiple_outcomes`, `ambiguous_done_criteria`} with confidence ≥ threshold). The split nudge rides the existing inject path — no separate message type.
- Config: `staleAuditSpans` (default 3) added to all config layers.

## Capabilities

### Modified Capabilities

- `jev-todo-audit`: requirement "Audit request content" gains the always-on granularity question; requirement "Verdict handling" gains the split-nudge branch; requirement "Configuration" gains `staleAuditSpans`.

## Impact

- `board.ts`: snapshot-diff to stamp in_progress entry loops; new `staleTaskIds(board, spans)` helper.
- `counter.ts`: no change (loop counting reused).
- `typesafe.ts`: `granularity` question always included; `AuditAnswers` gains field.
- `verdict.ts`: split-nudge branch.
- `config.ts` + `index.ts`: `staleAuditSpans` plumbed.
- `test/`: staleness diffing, question presence, verdict branches.
