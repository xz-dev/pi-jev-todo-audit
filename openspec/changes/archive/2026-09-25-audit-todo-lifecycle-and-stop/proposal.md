## Why

The audit currently compares one aggregate jev verdict with the board, so it can miss TODOs that the agent forgot to complete, cancel, or revisit, and it can apply one stale-state answer to several legitimate parallel `in_progress` tasks. It also has no final board check when the agent autonomously reaches a terminal stop, even though `pi-continue-watchdog` already provides a stable `user-ready` semantic hook for that boundary.

## What Changes

- Add lifecycle auditing for visible TODOs that may be completed, cancelled, deferred, or still actionable instead of relying only on the current `in_progress` alignment path.
- Judge each active `in_progress` task independently; multiple active tasks remain valid parallel work and are not an error by themselves.
- Add a terminal-stop audit trigger that consumes `pi:semantic-hook:v1` / `user-ready` from `pi-continue-watchdog` when the agent autonomously reaches a terminal idle outcome.
- Include explicit watchdog stop information (`STOP_KIND`, optional `REASON_TYPE`, and `REASON`) as observable audit evidence.
- Keep jev input limited to observable board state, visible conversation/activity, tool-call names, and explicit stop metadata; do not read or depend on hidden model chain-of-thought.
- Change the default user-message cooldown from 5 loops to 10 loops, representing one complete normal audit cycle.
- Preserve failure isolation: missing watchdog producer, API failure, low-confidence verdicts, and uncertain task state must not corrupt or block the agent loop.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `jev-todo-audit`: change periodic lifecycle auditing, per-task verdict handling, terminal-stop checking through the watchdog semantic hook, observable evidence boundaries, and cooldown semantics.

## Impact

- Likely implementation areas: `board.ts`, `typesafe.ts`, `verdict.ts`, `index.ts`, `config.ts`, unit/integration tests, README, and the delta specification.
- Adds a soft integration with the neutral `pi:semantic-hook:v1` event bus; it does not import or depend directly on `pi-continue-watchdog` internals.
- Existing TypeSafe audit requests gain dynamic per-task state questions and terminal-stop evidence.
- Default runtime behavior changes from a 5-loop user-message cooldown to a 10-loop cooldown.
- No changes to `rpiv-todo` storage or status vocabulary are required; cancellation remains represented by the existing `deleted` tombstone, while uncertain/deferred actions remain advisory until the agent updates the board.
