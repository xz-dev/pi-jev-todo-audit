# pi-jev-todo-audit

A [Pi](https://pi.dev) extension that watches [`@juicesharp/rpiv-todo`](https://www.npmjs.com/package/@juicesharp/rpiv-todo) drift. Every 10 completed agent loops it asks the **jev** model (TypeSafe's Choice primitive) one batched question set — *is the board's in_progress task what the agent is actually doing? what happened to it? which board task matches? has the agent drifted?* — and injects a corrective nudge into the running loop when the answer is no.

Read-only toward rpiv-todo: state is reconstructed from the session branch's persisted `todo` snapshots, the same seam the plugin itself uses to survive `/reload` and compaction. Nothing is written to disk.

## Install

```sh
pi install git:github.com/xz-dev/pi-jev-todo-audit
```

Restart your Pi session. Requires a TypeSafe API key for the `jev` model.

## What it does

```text
turn_end → loop count++ (replayed from branch, survives restart/compaction)
    │
    └─ every 10th loop ──> skip if ≤5 loops since last user message
                                │
                                v
                   replay board + digest recent activity
                                │
                   POST api.typesafe.ai/v1/systemone (model: jev)
                   5-6 Choice questions in one request
                                │
              ┌─────────────────┼──────────────────────┐
              v                 v                      v
          aligned         not_aligned             any used answer
           silent         confidence ok           confidence < 0.5
          (unless                                  │
          stale/coarse)                            v
                            │                notify user, no injection
                            v
              inject corrective message
              (steer → next turn boundary)
```

The injected message names the stale task id, the matching board task (or instructs the agent to create one), and — when jev reports drift — orders the agent to stop and resume board order. When the board has no `in_progress` task (empty, all pending, or all done), a sixth question `board_warranted` asks whether the work even merits a board — trivial/idle work stays silent instead of nagging the agent to create tasks.

**Granularity & staleness**: every audit also asks jev whether each in_progress task has a single verifiable outcome (`granularity`: single verifiable / bundles outcomes / ambiguous done-criteria / n/a). Separately, the extension stamps when each task entered in_progress by diffing todo snapshots on the branch; a task spanning more than `staleAuditSpans` audits (default 3) is flagged stale. Either signal — stale, or jev saying the task bundles outcomes — adds a step to the injected message telling the agent to split it. Even a perfectly aligned board gets the split nudge: coarse tasks are the audit's own blind spot.

A `/jev-audit` command fires the same audit on demand, ignoring the interval and the user-message cooldown — useful when you suspect drift and don't want to wait for the next 10-loop boundary.

## Configuration

Minimal setup — `~/.pi/agent/jev-todo-audit.json` with just the key:

```json
{
	"apiKey": "sk-..."
}
```

Or export `TYPESAFE_API_KEY` (env wins over the file). Every other field is optional; a missing or malformed file falls back to defaults.

**Project override**: `<repo>/.pi/jev-todo-audit.json` merges over the global file when the project is trusted (`ctx.isProjectTrusted()`). Project files can set tuning fields (`interval`, `cooldownLoops`, `confidenceThreshold`, `enabled`, `notifyOnAligned`, `activityBudgetChars`, `timeoutMs`, `apiUrl`, `model`, `staleAuditSpans`) but **cannot** set `apiKey` / `apiKeyEnvVar` — secrets stay out of repos.

`PI_CODING_AGENT_DIR` overrides `~/.pi/agent` when you run pi with a non-default agent dir. If the legacy `~/.config/jev-todo-audit/config.json` still exists you'll get a one-time warning at session start; move it to the new path. Full surface:

```json
{
	"apiKey": "sk-...",
	"apiKeyEnvVar": "TYPESAFE_API_KEY",
	"enabled": true,
	"interval": 10,
	"cooldownLoops": 5,
	"confidenceThreshold": 0.5,
	"model": "jev-latest",
	"apiUrl": "https://api.typesafe.ai/v1/systemone",
	"timeoutMs": 30000,
	"activityBudgetChars": 4000,
	"notifyOnAligned": false,
	"staleAuditSpans": 3
}
```

| Setting | What it does | Default |
| --- | --- | --- |
| `apiKey` | TypeSafe API key, written directly in the file. Env var wins when both are set. | — |
| `apiKeyEnvVar` | Name of the env var checked first for the key. | `"TYPESAFE_API_KEY"` |
| `enabled` | Master switch; `false` loads nothing. | `true` |
| `interval` | Audit every Nth completed loop. | `10` |
| `cooldownLoops` | Skip a trigger when this many or fewer loops passed since the last user message. Skipped means skipped — not deferred. | `5` |
| `confidenceThreshold` | Minimum jev confidence to inject a correction; below it the extension notifies instead. | `0.5` |
| `model` | TypeSafe model id. | `"jev-latest"` |
| `apiUrl` | TypeSafe System One endpoint. | `https://api.typesafe.ai/v1/systemone` |
| `timeoutMs` | Audit request timeout; failures skip quietly and retry at the next trigger. | `30000` |
| `activityBudgetChars` | Max chars of recent transcript fed to jev as state. | `4000` |
| `notifyOnAligned` | Also notify on aligned audits. | `false` |
| `staleAuditSpans` | Audits a task may sit in_progress before the split nudge fires. | `3` |

A missing or malformed file falls back to defaults. The extension reads the global file always, and the project file only when the project is trusted.

## How it counts

A *loop* is one finalized assistant message on the session branch — aborted turns never persist, so they never count. The counter and last-user-message position are replayed from the branch on `session_start`, `session_compact`, and `session_tree`, so the cadence survives `/reload`, process restarts, and branch switches. A user message (including a steer) resets the cooldown: the next 5 loops belong to the new instruction, not the old board.

## Requirements

- A Pi Agent host with [`@juicesharp/rpiv-todo`](https://www.npmjs.com/package/@juicesharp/rpiv-todo) installed (the audit is meaningless without a board).
- A TypeSafe API key (env var or `apiKey` in config).
- Works headless too — the injected correction lands in the transcript; only `ctx.ui.notify` needs a UI.

## Failure isolation

API errors, timeouts, and malformed responses never block or corrupt the agent loop. The audit is skipped, optionally surfaced as a notification, and the next trigger point proceeds normally. The extension never imports rpiv-todo internals — if the board snapshot shape ever changes, replay degrades to an empty board rather than throwing.

## License

MIT — see [LICENSE](LICENSE).
