# Proposal: jev-empty-board-warrant-check + pi-agent config path

Two coupled fixes surfaced in the same pass.

## Why

1. **False nag on empty board.** Empty board (or board with no `in_progress`) currently triggers an unconditional "create todo task" injection. That punishes the agent for chatting, answering one-off questions, or doing trivial single-step work — cases where a todo board adds noise, not signal. Let jev decide first whether the observed work warrants a board at all, before telling the agent to create one.

2. **Config lives in the wrong place.** `~/.config/jev-todo-audit/config.json` is XDG, not pi. Pi convention is `~/.pi/agent/<ext>.json` for the global layer, plus an optional `<cwd>/.pi/<ext>.json` project override gated by `ctx.isProjectTrusted()`. Move to the standard.

## What Changes

### A. Warrant check on empty board

- Add a fifth Choice question `board_warranted` — "Does the agent's current activity warrant tracking on a todo board?" — with criteria `warranted` / `trivial` / `idle`.
- **Conditional emission**: included only when the board has zero visible tasks. When the board has tasks (any status), the question is omitted — an existing board is presumed wanted.
- `decide()` update:
  - `no_in_progress_task` + `board_warranted=trivial|idle` → silent (don't nag).
  - `no_in_progress_task` + `board_warranted=warranted` → inject "create task" (current behavior).
  - `no_in_progress_task` + `board_warranted` missing (board non-empty) → keep current inject behavior.
  - `board_warranted` confidence below threshold → notify, not inject.

### B. Config path migration

- **Primary**: `~/.pi/agent/jev-todo-audit.json` (uses `PI_CODING_AGENT_DIR` when set, default `~/.pi/agent`).
- **Project override**: `<cwd>/.pi/jev-todo-audit.json` honored only when `ctx.isProjectTrusted()`. Project layer may override `interval`, `cooldownLoops`, `confidenceThreshold`, `enabled`, `notifyOnAligned`, `activityBudgetChars`, `timeoutMs`, `apiUrl`, `model` — **never `apiKey` / `apiKeyEnvVar`** (keep secrets out of repo files).
- **Legacy**: `~/.config/jev-todo-audit/config.json` no longer read. README updated to the new path.
- `loadConfig` signature changes to take `{ globalPath, projectPath?, projectTrusted }` instead of a single path; merge order is defaults → global → project → env-var API key on top.

## Capabilities

### Modified Capabilities

- `jev-todo-audit`: requirement "Audit request content" gains the conditional fifth question; requirement "Verdict handling" gains the warranted-gate on `no_in_progress_task`; requirement "Configuration" gets the new path list, the project-override merge order, and the apiKey-scope restriction.

## Impact

- `typesafe.ts`: `buildAuditRequest` conditionally adds `board_warranted`; `AuditAnswers` gains the field.
- `verdict.ts`: `decide` branches on `board_warranted` when the board is empty.
- `config.ts`: new path resolution, project-layer merge, apiKey-scope filter.
- `index.ts`: `loadConfig` called with ctx-derived inputs; signature tweak.
- `README.md`: config path updated.
- `test/config.test.ts`: new path fixtures + merge-order cases; `test/verdict.test.ts`: warranted branches.
- API: same single POST; question count 4 → 5 only when board is empty.
