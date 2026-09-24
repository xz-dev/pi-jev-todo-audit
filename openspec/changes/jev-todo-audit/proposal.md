# Proposal: jev-todo-audit

## Why

The agent maintains a todo board (`rpiv-todo`), but the model sometimes drifts: working off-board tasks, leaving stale `in_progress` rows, or wandering from the planned sequence — and nothing notices until the user does. A cheap external judge (the `jev` model via TypeSafe's Choice primitive) can periodically audit the todo board against actual conversation activity and nudge the agent back on track automatically.

## What Changes

- New Pi extension package in this repo (`pi install`-able, or loaded from `.pi/`): a **todo-board auditor** that is fully passive toward `rpiv-todo` (reads state via session-branch replay, never imports its internals).
- Counts completed agent loops (assistant messages on the branch) from the very first loop; survives restart/compaction by replaying the branch.
- Every 10th loop, calls the TypeSafe API (`https://api.typesafe.ai/v1/systemone`, model `jev`) with one multi-question Choice request comparing the current todo snapshot against recent conversation activity.
- **Cooldown rule**: if the 10th loop lands within 5 loops of the last user message, the audit for that trigger point is skipped (not deferred) — the agent is likely turning to new instructions.
- On a verdict of misalignment, injects a corrective custom message into the conversation (via `turn_end` continuation) instructing the agent to update the todo board (complete/stale/cancel/defer the displayed task; add its current work; resume board order if drifting). Aligned verdicts are logged only, low-confidence verdicts notify the user instead of acting.
- API errors/timeouts never block the agent loop: the audit is skipped and retried at the next trigger point.
- Configurable: interval (10), cooldown (5), confidence threshold, model name, enable/disable.

## Capabilities

### New Capabilities

- `jev-todo-audit`: periodic todo-board-vs-reality audit using the jev model, including loop counting semantics, user-message cooldown, verdict handling, and corrective injection.

### Modified Capabilities

(none — `rpiv-todo` is untouched; this extension only reads persisted session state)

## Impact

- **New code**: one extension entry point (`index.ts`) plus modules for counting, replay, TypeSafe client, verdict handling, config. No changes to existing project code (greenfield repo).
- **Dependencies**: HTTP calls to `api.typesafe.ai` (needs `TYPESAFE_API_KEY`-style env var); pi extension API (`@earendil-works/pi-coding-agent` types, dev dependency).
- **Runtime**: writes nothing to disk; all derived state is replayed from the session branch. Outbound network only at audit trigger points.
- **User-visible**: occasional injected `[jev audit]` messages in the transcript when misalignment is detected; optional `ctx.ui.notify` on low confidence or audit failure.
