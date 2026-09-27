# pi-jev-todo-audit

A [Pi](https://pi.dev) extension that checks whether the [`@juicesharp/rpiv-todo`](https://www.npmjs.com/package/@juicesharp/rpiv-todo) board matches the work visible in the conversation. It sends one batched question set per request attempt to TypeSafe's **jev** model, then proposes only supported, compatible corrections.

The extension is advisory. It replays persisted `todo` snapshots, never imports the task store or mutates tasks directly, and asks the main agent to make any justified update. Audit markers live in the host's ordinary persisted custom messages; there is no separate database or task store.

## Install

```sh
pi install git:github.com/xz-dev/pi-jev-todo-audit
```

Restart your Pi session. A TypeSafe API key is required. An already-loaded extension continues running its old code until it is reloaded/restarted.

## When it audits

- **Periodic:** every 10 completed loops by default, except when at most 10 loops have elapsed since the latest user message. A skipped audit is not deferred.
- **Manual:** `/jev-audit` bypasses interval and cooldown.
- **Optional terminal check:** consumes `user-ready` on `pi:semantic-hook:v1` when [pi-continue-watchdog](https://github.com/xz-dev/pi-continue-watchdog) publishes an autonomous stop (`AI_UNLOCK`, `ERROR_UNLOCK`, `EXHAUSTED`, `DECISION_FAILED`). An empty/all-finished board needs no terminal check. Without that producer, periodic/manual audits still work; no watchdog dependency is imported. Human-abort kinds are not accepted.

Stop metadata is evidence, not proof of completion or permission to resume. Rewording a stop reason is not new work. New user decisions, work results or board changes can permit a new audit under the same stop reason.

## What jev receives

The current board overview and full visible task records supplement the active conversation. Task descriptions, owners, dependencies, active forms, and arbitrary metadata are preserved without requiring a `blockedReason` or other special field. Other tools' private `details` and arbitrary extension state are not exported.

The collector uses Pi's public, compaction-aware `buildContextEntries()` and retains source identities and chronology:

- **Recent view:** latest user instruction, assistant exchange and tool interaction, including arguments, visible results, and call/result associations.
- **Global view:** applicable summaries and retained conversation establishing goals, authorization, acceptance criteria and scope changes. Summaries are labelled, not presented as direct execution evidence.
- **Task supplement:** current task requirements and age-review information, separate from conversation evidence.

Unknown tools require no adapter: their public calls/results work like any other tool. Relevant visible custom messages include producer identity; previous audit advice cannot serve as independent evidence. Visible shell execution records include exit/cancellation information. An absent result is not success.

Selection happens **before** capacity handling. Latest decisions and interactions are protected. Exact task/artifact references and retained user-request/call chains connect supporting records, including results with no task number or filename. Ambiguous request-chain relationships are labelled rather than asserted as proof. Failures and refusals are retained alongside positive evidence. Identical historical call/result groups are deduplicated; explicitly unlinked historical payloads are omitted with source IDs and reasons, even when there is spare capacity. This is a conservative selection policy, not perfect semantic retrieval.

If the host lacks the effective-context API, the visible branch is used with an explicit incomplete-global-context marker; global-context-dependent splitting is disabled. Abandoned branches and raw pre-compaction payloads are not appended to the effective context.

### Privacy and missing information

Hidden thinking, private custom entries, raw images/binary content, and known credential fields/forms are excluded. Recognizable authorization headers, private keys and common token forms are redacted; the configured API key is also removed if it appears in evidence or diagnostics. Unsupported content, redaction and serialization gaps are disclosed. Required missing user/task evidence prevents a correction; unrelated tasks can still receive independently supported corrections.

The extension does not read credential stores or export system prompts, skill catalogs or private agent state to enrich evidence. More relevant conversation does cross the TypeSafe boundary than the old text-only suffix. Heuristic redaction cannot discover every unknown secret embedded in arbitrary prose. Unrecorded dialogs/widgets and out-of-band decisions are unavailable evidence, never inferred approval.

## How corrections are selected

Every unfinished task has its own lifecycle, evidence-anchor and board-reconciliation questions. Every active task also has its own granularity question. Alignment, matching, drift, interaction state and current-work evidence share the same state; `board_warranted` is asked only when nothing is active.

Each used answer must have a valid requested option and finite confidence in range, meeting `confidenceThreshold` (default 0.5). An evidence anchor must reference a complete supplied non-advice source. Missing/unknown answers or sources cannot authorize an action, and uncertainty about one task does not suppress a supported sibling correction.

- **Completed/cancelled:** reconcile that task only. Assistant assertions, summaries or a failed result alone cannot prove completion.
- **Blocked/deferred:** update only a concrete missing/incorrect board representation. A description or arbitrary metadata can already represent the wait; no designated key is necessary.
- **Ongoing:** unfinished, not permission to resume.
- **Actionable now:** a supported authorized next action, with no unresolved input/dependencies. A matching task ID alone is never enough to claim or continue it.
- **Future/unclear:** do not infer that the agent should start it.

Completed, cancelled, deferred, blocked or future tasks cannot simultaneously receive claim/continue/split instructions. New user scope takes precedence over an older board plan. Drift corrections name supported actionable work rather than blindly choosing the next pending task. Empty/all-done boards with trivial or idle activity do not create busywork.

### Engineering-grounded task size

Granularity follows established practice, not a fixed size score:

1. Match the item's level and authorized purpose: feature/story, implementation/investigation task, or waiting item.
2. Identify evidence that would establish completion of its scope.
3. Check that a concrete next action is known; distinguish uncertainty from waiting for permission.
4. Look for useful progress, feedback or handoff checkpoints.
5. Split only when evidenced outcomes/checkpoints improve verification or coordination without losing coherent value or duplicating existing tasks.

A multi-file vertical slice with many tests can be one coherent outcome. One large goal can still need smaller verifiable checkpoints. Unclear completion criteria or next actions call for clarification, not automatic subdivision. Multiple simultaneous active tasks are not themselves an error.

Age beyond `staleAuditSpans × interval` is **diagnostic only**. It never forces splitting, even on an otherwise aligned board. Loop age is not task effort, an industry-standard timebox, or a calibrated service-level expectation.

Practice references: [Wake's INVEST and SMART tasks](https://xp123.com/invest-in-good-stories-and-smart-tasks/), [Humanizing Work's story-splitting guide](https://www.humanizingwork.com/the-humanizing-work-guide-to-splitting-user-stories/), [Allen's next-action guidance](https://gettingthingsdone.com/2011/02/how-is-a-next-action-list-different-from-a-to-do-list/), and [The Kanban Guide](https://kanbanguides.org/english/).

### Waiting, repetition and stale results

A supported correction includes task IDs and sanitized source excerpts, delivered through the existing custom-message steer path. Terminal execution needs explicit actionable-now evidence; merely unfinished work never wakes the agent. A concrete missing board annotation may permit **one board-only turn**, expressly instructing the agent to reconcile the board and return control without executing the blocked task. Split/clarification advice alone does not trigger a terminal restart.

Persisted correction keys suppress unchanged task/issue demands across reloads. Loop count, reworded stop reasons, previous audit messages and ordinary assistant acknowledgments do not re-arm them. Recording a requested blocker is reconciliation, not a reason to repeat it. New user/work evidence and meaningful task changes permit reconsideration.

Results invalidated by user, board, branch or session changes while a request is in flight are discarded. New stop evidence queued after invalidating an older request still receives its own check.

These gates validate supplied judgments and prevent deterministic contradictions. A real source citation does **not** prove the model interpreted that source correctly. The main agent remains responsible for acting within the user's authorization.

## Provider limits, not application quotas

The [official Models documentation](https://docs.typesafe.ai/models.md), checked 2026-09-27, maps `jev-latest` to `jev-1.13.0` and specifies two simultaneous limits:

- state + **all questions combined**: **64k tokens**;
- state + **the longest question**: **32k tokens**.

Those are provider constraints, not local character budgets. The exact integer meaning of `k`, server serialization accounting and future/custom-model limits are not inferred. No usable official preflight tokenizer/counting contract was obtained from the inspected public docs and JS SDK. Therefore the implemented route is **server admission**, not an exact local fit guarantee: the first request can be rejected.

All selected evidence and all questions are sent together without a last-20-record rule, 4,000-character suffix, fixed partition ratio or per-task quota. Spare capacity is not a reason to append irrelevant history.

Only an explicit input context/token-overflow error permits **one** smaller recovery request. It retains current decisions/interactions, summaries and task requirements, removes optional complete historical groups, discloses omissions and rebuilds source options. Global-context-dependent splits are disabled after reduction. If nothing optional can be removed, or recovery also fails, the audit fails safely rather than silently removing tasks or continuing to crop.

Ordinary validation, authentication, rate/quota, generic payload-size and unknown errors do not authorize cropping. Recognition is deliberately conservative: the inspected [HTTP API docs](https://docs.typesafe.ai/api.md) do not specify a dedicated overflow schema, so an unfamiliar spelling is an ordinary isolated failure. Tests exercise explicit example messages/codes, not a guarantee about every live provider error. Existing bounded transient-network retries remain separate.

## Configuration

Create `~/.pi/agent/jev-todo-audit.json` (or the equivalent under `PI_CODING_AGENT_DIR`):

```json
{
  "apiKey": "sk-..."
}
```

Alternatively set `TYPESAFE_API_KEY`; a nonblank environment value wins over the file key. All other fields are optional.

Configuration layers are defaults, global user configuration, then `<repo>/.pi/jev-todo-audit.json` **only for trusted projects**. Project files may set tuning fields but cannot set `apiKey` or `apiKeyEnvVar`. Missing/malformed files fall back safely. A legacy `~/.config/jev-todo-audit/config.json` produces a move notice rather than being loaded.

| Setting | Meaning | Default |
| --- | --- | --- |
| `apiKey` | Global-layer file key; environment wins | absent |
| `apiKeyEnvVar` | Global-layer environment variable name | `TYPESAFE_API_KEY` |
| `enabled` | Disable auditing when false | `true` |
| `interval` | Audit every Nth completed loop | `10` |
| `cooldownLoops` | Skip periodic audit at or below this distance from latest user message; independent of an overridden interval | `10` |
| `confidenceThreshold` | Minimum confidence for each used judgment; never replaces evidence checks | `0.5` |
| `model` | TypeSafe model | `jev-latest` |
| `apiUrl` | System One endpoint | `https://api.typesafe.ai/v1/systemone` |
| `timeoutMs` | Timeout per request attempt | `30000` |
| `activityBudgetChars` | **Deprecated and ignored**; explicit values produce one notice per extension load | no budget |
| `notifyOnAligned` | Also notify on aligned audits | `false` |
| `staleAuditSpans` | Age-review threshold in audit intervals, **not** a split threshold | `3` |

Transient retries use Pi's `settings.retry` configuration (`enabled`, `maxRetries`, `baseDelayMs`) with exponential backoff. Quota/billing failures are not retried; retries do not create new audit triggers.

A loop is a finalized assistant message on the branch. Counters are replayed on session start, compaction and tree changes; finalized user messages reset the cooldown. The extension also works headless: custom messages persist normally, while notifications require host UI support.

## Verification and limitations

```sh
bun test
npm run typecheck
openspec validate ground-audits-in-visible-context --strict
```

Tests use synthetic public Pi entries, captured requests and mocked Choice responses. They cover context fidelity/selection, sanitization, error admission/recovery, independent task decisions, waiting, repetition/reload and in-flight invalidation. They do **not** measure live jev semantic accuracy or constitute product acceptance. No live transcript replay is required by the default suite.

API/serialization/consumer failures remain isolated from the agent loop. The extension neither guarantees that the main agent obeys a steer nor provides a hard tool blocker. The current rpiv-todo persistence shape is the only private-data adapter; incompatible snapshots cannot be treated as authoritative task state.

## License

MIT — see [LICENSE](LICENSE).
