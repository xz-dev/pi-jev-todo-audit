# Design: jev-todo-audit

## Context

Greenfield repo. Target host: Pi Agent extension API (types from `@earendil-works/pi-coding-agent`). Two external systems: `rpiv-todo` (todo board; source studied at `~/.pi/agent/npm/node_modules/@juicesharp/rpiv-todo/`) and TypeSafe API (`https://api.typesafe.ai/v1/systemone`, Choice primitive, model `jev-latest`). Pi's built-in `turnIndex` resets to 0 on every `agent_start`, so it cannot provide a session-lifetime loop count — counting must be reconstructed from the persisted branch, the same technique rpiv-todo itself uses to survive reload/compaction.

## Goals / Non-Goals

**Goals:**
- Correct, restart-surviving loop counting with zero disk writes
- One TypeSafe request per audit carrying all questions (cost discipline)
- Corrective injection through documented Pi extension seams only
- Full failure isolation: audit problems can never disturb the agent loop

**Non-Goals:**
- Modifying, patching, or configuring rpiv-todo (read-only relationship via session data)
- Enforcing board order by force (abort user work); correction is advisory injection only
- Auditing child/detached sessions (foreground session only, v1)

## Decisions

### D1: Passive read of todo state — branch replay, no imports
Walk `ctx.sessionManager.getBranch()`, take the last toolResult with `toolName === "todo"` whose `details` matches the `{tasks: [...], nextId: number}` shape (last-write-wins), mirroring rpiv-todo's own `replayFromBranch`. ~30 lines, shape-compatible across versions.
*Alternative*: import rpiv-todo's `store.js` — rejected: jiti module-cache sharing across extension bundles is not guaranteed; internal layout is not SemVer'd. Branch replay is the author's own persistence contract.

### D2: Loop counter — branch replay + in-memory increment
`turn_end` increments a counter; `session_start` / `session_compact` / `session_tree` recompute it from the branch (count finalized `role === "assistant"` messages, excluding `excludeFromContext` ones is unnecessary — assistant messages are never excluded). Aborted half-turns never reach the branch, so they never count. Steering messages are user messages on the branch, so cooldown math works for free.
*Alternative*: persist a counter via `pi.appendEntry()` — rejected: extra entries pollute every branch and compaction; derived state shouldn't be persisted when the source of truth (the branch) already contains it.

### D3: Trigger — `totalLoops % interval === 0`, skip not defer
Check at `turn_end` after increment. Cooldown check: locate last user message in the branch (maintained incrementally as `loopsSinceLastUserMsg`, reset on `message_end` of a user message); if `<= cooldownLoops` (5), the trigger point is consumed with no audit. No re-aiming at a later loop — the next multiple of 10 is the next chance. First audit can therefore land at loop 10.

### D4: TypeSafe call — single request, 4 Choice questions
`POST /v1/systemone` with `state` = todo snapshot (rendered task lines `[status] #id subject (activeForm) ⛓ deps`) + activity summary (assistant message texts since last user message or last audit, truncated to a token budget ~4k), `model` = `jev`, `questions` = `alignment`, `stale_status` (speculative), `current_match` (options generated from visible tasks + `not_on_board`), `drift`. Timeout 30s via `AbortSignal.timeout`, API key from configured env var. Response read: `answers.<id>.choice`, `.probabilities`, `.confidence`.
*Alternative*: several Noul (yes/no) calls — rejected: TypeSafe docs recommend batching all questions into one call; parallel evaluation, one round trip.

### D5: Verdict → action mapping
- `alignment = aligned` (confidence ≥ threshold) → no-op (optionally `ctx.ui.notify` a one-line health note — default off to avoid spam)
- `alignment = not_aligned` + confidence ≥ threshold → compose corrective message, inject
- any relevant answer confidence < threshold (0.5) → notify user, no injection
- Corrective message content: verdict facts + explicit `todo` tool calls to make (`update {id, status}`, `create`, etc.) + drift instruction when `drift = drifted`. Model receives it as a custom message; the `turn_end` continuation (`continue: true`) forces exactly one follow-up model request.

### D6: Injection seam — `pi.sendMessage(..., {deliverAs: "steer"})` at `turn_end`
The audit runs inside the `turn_end` handler (the loop is still streaming). `deliverAs: "steer"` routes the custom message through `agent.steer()`, which lands at the next turn boundary of the running loop — the fastest non-abort path. (`followUp` waits for the run to settle; `triggerTurn` only fires a new turn when not streaming.) The custom message is converted to a user-role message in the next model request, forcing the agent to act on it.
*Alternative*: `pi.sendUserMessage(..., {deliverAs: "steer"})` — rejected: impersonates the user in the transcript; a `custom` message is honestly attributable to the audit.

### D7: Async audit without blocking the turn
The TypeSafe fetch is awaited inside the `turn_end` handler only up to its timeout (30s worst case). This delays the next model request of the same run by at most the audit duration — acceptable for a 10-loop cadence; the agent is otherwise idle between turns. All fetch errors are caught: skip + one `notify` + return without `continue`.

### D8: Config — JSON file next to the package, env-var key
`~/.config/jev-todo-audit/config.json` (`interval`, `cooldownLoops`, `confidenceThreshold`, `model`, `apiKeyEnvVar`, `apiKey`, `enabled`, `notifyOnAligned`), read at extension load, malformed → defaults. Key resolution order: env var named by `apiKeyEnvVar` (trimmed) first, then `apiKey` in the file — matching pi-agent convention that secrets may live in config.

### D9: Package layout
Single extension entry `index.ts` (default export factory) + modules: `counter.ts` (D2/D3), `board.ts` (todo snapshot from branch, D1), `typesafe.ts` (client, D4), `verdict.ts` (D5 mapping + message composition), `config.ts` (D8). Plain `fetch`, no runtime deps; `@earendil-works/pi-coding-agent` as dev-only type dependency.

## Risks / Trade-offs

- [Branch entry shape drift in rpiv-todo (e.g. tool renamed)] → `isTaskDetails`-style defensive shape check degrades to empty board; audit still runs (empty-board scenario is specified)
- [jev misjudges and injects a wrong correction] → injection is advisory; agent can reason; cooldown avoids auditing mid-turn transitions; confidence gate stops low-certainty injections
- [Audit latency (≤30s) stalls the turn boundary] → acceptable at 10-loop cadence; timeout bounded; failures skip entirely
- [Very long runs inflate activity summary] → hard token budget with truncation marker; summary starts from last audit/user message
- [Compaction removes original messages] → after compaction the branch has a summary entry; counter recomputes from surviving assistant messages — count may drop but multiples-of-10 cadence self-heals; cooldown uses post-compaction branch state

## Migration Plan

New extension; install = enable, uninstall/disable = off. No data to migrate. Rollback: set `enabled: false` or remove the package.

## Open Questions

- Exact activity-summary prompt wording for jev (tune during implementation testing with the real API key)
- Whether `notifyOnAligned` should default on (currently off) — decide after living with the noise level
