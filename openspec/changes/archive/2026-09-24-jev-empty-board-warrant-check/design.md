## Context

Two coupled fixes:

1. **Warrant gate on empty board.** `verdict.ts:44` injects "create task" unconditionally on `no_in_progress_task`. Agent chatting / answering trivial questions gets nagged. User wants jev to classify the work first, but only when the board is empty (a non-empty board implies someone wanted it).
2. **Config path.** Currently `~/.config/jev-todo-audit/config.json` (XDG). Pi convention is `~/.pi/agent/<ext>.json` global + `<cwd>/.pi/<ext>.json` project override. `PI_CODING_AGENT_DIR` env var overrides the agent dir; `CONFIG_DIR_NAME` is the project-side `.pi` segment.

`ctx.isProjectTrusted()` is only reachable inside event handlers, so the extension entry must defer project-layer resolution until first event rather than doing all of it at module load.

## Goals / Non-Goals

**Goals:**
- jev decides whether board-less work warrants a board; trivial/idle → silent.
- Global config at `~/.pi/agent/jev-todo-audit.json`; project override at `.pi/jev-todo-audit.json` (trusted only).
- `apiKey`/`apiKeyEnvVar` never come from project layer.

**Non-Goals:**
- No schema validation / JSONC / TOML. Keep plain JSON.
- No migration shim that reads the old XDG path — user moves the file once, README documents the new path.
- No keyring/secret-store integration.

## Decisions

**D1: `board_warranted` is conditional on `visibleTasks(board).length === 0`.** Board with any tasks implies the board was already created for a reason — asking "was it worth creating" is noise. The `no_in_progress_task` alignment verdict on a non-empty board keeps existing inject behavior unchanged.

Alternatives: (a) always ask — extra noise on every audit where board is populated; (b) extend `alignment.criteria` with `no_in_progress_warranted`/`trivial` — couples two axes in one field, muddles `stale_status` gating.

**D2: Missing `board_warranted` (non-empty board) → skip the gate.** Spec says "no_in_progress_task + missing board_warranted → keep current inject behavior" so the verdict code doesn't need a "was question asked" flag — the gate is `board_warranted` field presence, not a side-channel boolean.

**D3: `idle` is one of the warrant options.** Same prompt-side classification, no extra code. Cheaper than an activity-heuristic counter that would need `lastToolCallAt` tracking in `counter.ts`.

**D4: Layered config merge.** `loadConfig(inputs)` where `inputs = { globalPath, projectPath?, projectTrusted }`. Read global always → merge project iff trusted → env-var key override last. Return type stays `AuditConfig`; `apiKey`/`apiKeyEnvVar` filtered from project layer at parse time (whitelist `PROJECT_ALLOWED_KEYS`), not by dropping later — defense in depth, and the filter is auditable in one place.

**D5: `PI_CODING_AGENT_DIR` honored.** Same env var pi uses; no new env var introduced. Path helper: `agentDir() = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent")`. Project path: `join(ctx.cwd, CONFIG_DIR_NAME, "jev-todo-audit.json")` using the `CONFIG_DIR_NAME` constant from `@earendil-works/pi-coding-agent`.

**D6: Lazy project resolution.** `loadConfig` can't know `ctx.cwd`/`isProjectTrusted()` at module init. `index.ts` builds the global layer at factory call; project merge happens on first `session_start` (which also carries ctx). Config object stored on the extension closure; subsequent events reuse it.

## Risks / Trade-offs

- **jev still misclassifies trivial work** → confidence threshold catches it; user sees notify instead of silent inject. No worse than today.
- **Project file leaks an `apiKey`** → filter at parse time; also document the restriction in README.
- **Config moved, existing users' `~/.config/jev-todo-audit/config.json` silently ignored** → README explicitly says move file; log one warning at session start when the old path exists.
- **Untrusted project can still ship a `.pi/jev-todo-audit.json`** → ignored by `isProjectTrusted()` gate, per pi convention.

## Migration Plan

1. User moves `~/.config/jev-todo-audit/config.json` → `~/.pi/agent/jev-todo-audit.json`.
2. On session start, if old path exists, warn: `[jev-todo-audit] config moved — copy ~/.config/jev-todo-audit/config.json to ~/.pi/agent/jev-todo-audit.json`.
3. Old path is never read for values; warning is advisory only.

## Open Questions

None — D2/D4 resolved with user.
