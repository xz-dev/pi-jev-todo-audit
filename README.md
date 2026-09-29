# pi-jev-todo-audit

A [Pi](https://pi.dev) extension that checks whether the [`@juicesharp/rpiv-todo`](https://www.npmjs.com/package/@juicesharp/rpiv-todo) board matches the work visible in the conversation. It asks TypeSafe's **jev** model a batched set of Choice questions, then proposes only supported, compatible corrections.

jev acts as a **macro-level engineering lead, not a worker**: it sees goals, task definitions, reported outcomes, broad progress, user decisions and open questions, not execution detail. The extension is advisory. It replays persisted `todo` snapshots, never mutates tasks directly, and asks the main agent to make any justified update.

The design goal is **lower jev spend**: the same context and question is never paid for twice, and input already reviewed is carried forward as remembered structured conclusions instead of being resent. Persistence uses Pi `appendEntry` custom entries (non-context); there is no database, summarizer model or classifier model.

## Install

```sh
pi install git:github.com/xz-dev/pi-jev-todo-audit
```

Restart your Pi session. A TypeSafe API key is required. An already-loaded extension continues running its old code until it is reloaded/restarted.

## When it audits

- **Periodic:** every 10 completed loops by default, except when at most 10 loops have elapsed since the latest user message. A skipped audit is not deferred.
- **Manual:** `/jev-audit` bypasses interval and cooldown but still reuses stored results and reviews only new input; an unchanged repeat makes no request. `/jev-audit full` forces a fresh reassessment of the whole projected history (still without tool arguments or bodies). If a forced review fails partway, retrying `full` reuses the parts it already completed; after it succeeds it becomes the ordinary baseline. Any other argument prints usage and sends nothing.
- **Optional terminal check:** consumes `user-ready` on `pi:semantic-hook:v1` when [pi-continue-watchdog](https://github.com/xz-dev/pi-continue-watchdog) publishes an autonomous stop (`AI_UNLOCK`, `ERROR_UNLOCK`, `EXHAUSTED`, `DECISION_FAILED`). An empty/all-finished board needs no terminal check. Without that producer, periodic/manual audits still work; no watchdog dependency is imported. Human-abort kinds are not accepted.

Stop metadata is evidence, not proof of completion or permission to resume. Rewording a stop reason is not new work. New user decisions, work results or board changes can permit a new audit under the same stop reason.

A TODO snapshot change starts a new state segment for review, but **does not trigger a paid call by itself**; cadence and cooldown are unchanged.

If recording a receipt or answer fails (`appendEntry` unavailable or throws), the audit's supported correction is still delivered — the answers are valid; only progress does not advance, and the next audit reuses the cached answers.

## What jev receives

The collector uses Pi's public, compaction-aware `buildContextEntries()` and keeps chronology and source identities:

- **Visible text:** every user, assistant and visible custom message, in order. Text-only analysis counts as possible work, not inactivity. When the main agent answers or rebuts earlier jev advice, the reply and the advice it answers are both sent, so the reply can revise jev's conclusion. jev advice with no later reply is dropped from the input and never becomes evidence.
- **Tools and shell as events:** only `{tool, call, status}` with status `returned`/`error`/`cancelled`/`pending`/`unknown`. Arguments, commands, file contents and result/log bodies are **never** sent, in ordinary or `full` review. Unknown tools need no adapter. A returned call does not establish that a task is complete.
- **Task supplement:** the current board and full visible task records (description, owner, dependencies, metadata), plus each task's trajectory: `firstActive` (the turn it first became `in_progress`), `revisionCount`, and the latest five revision turns (derived from the branch alone, so an unchanged repeat stays a cache hit). Every revision still appears in order as a projected `todo` tool event. Updates, pauses and resumptions do not reset `firstActive`; granularity is judged from that origin to the latest turn.
- **Summaries:** host compaction/branch summaries are labelled derived material, not execution evidence.

If the host lacks the effective-context API, the visible branch is used with an explicit incomplete-global-context marker; global-context-dependent splitting is disabled. Abandoned branches are not replayed.

### Remembered conclusions instead of resent context

Processed input is represented by a **rolling result** that keeps three things separate:

- **Reported work:** user decisions, the latest host summary and the most recent main-agent reports from the processed range, re-sent as authored and labelled `retained from processed range`. All processed user messages are always retained — user constraints/authority are never silently dropped; in a very long uncompacted session they can eventually hit the provider limit, where the irreducible-scope diagnostic asks the main agent for a concise report. Reports are kept newest-first within a 4,000-byte serialized-record budget (metadata counts — tiny reports still cost envelope bytes), so a short reply does not push out an earlier one; a report that alone exceeds the budget is not repeated and jev is told to ask the main agent for a concise account; any record that could only be reviewed in fragments is never repeated whole, because that would recreate the overflow. Plus current task records.
- **jev opinions:** the latest validated answers, sent as `rolling.opinions` (derived and revisable).
- **Progress:** the reviewed frontier `processedThrough`, stored as a receipt.

Here "summary" means these stored typed answers and retained reports. It is **not** a free-form prose generation call: nothing asks jev or another model to write a summary.

Every question is cached by *(rules version, endpoint, model, exact state, exact question)*. A later audit reuses a stored answer when those match and sends only the missing questions. Cached answers, receipts and rejected-request fingerprints are appended to the branch as non-context custom entries, so they survive reload and compaction. They stay within the same session branch; nothing is shared across sessions or tasks.

### Privacy and missing information

Hidden thinking, private custom entries, raw images/binary content, and known credential fields/forms are excluded. Recognizable authorization headers, private keys and common token forms are redacted; the configured API key is also removed if it appears in evidence or diagnostics. Unsupported content, redaction and serialization gaps are disclosed. Required missing user/task evidence prevents a correction; unrelated tasks can still receive independently supported corrections.

The extension does not read credential stores or export system prompts, skill catalogs or private agent state to enrich evidence. Visible conversation text crosses the TypeSafe boundary; tool arguments and result bodies do not. Heuristic redaction cannot discover every unknown secret embedded in arbitrary prose. Unrecorded dialogs/widgets and out-of-band decisions are unavailable evidence, never inferred approval.

## How corrections are selected

Every unfinished task has its own lifecycle, evidence-anchor and board-reconciliation questions. Every active task also has its own granularity question. Alignment, matching, drift, interaction state and current-work evidence share the same state; `board_warranted` is asked only when nothing is active.

Each used answer must have a valid requested option and finite confidence in range, meeting `confidenceThreshold` (default 0.5). An evidence anchor must reference a complete supplied non-advice source. Missing/unknown answers or sources cannot authorize an action, and uncertainty about one task does not suppress a supported sibling correction.

- **Completed:** reconcile that task only. A user decision or a main-agent report can anchor it; a report is described as *reported, not independently verified*. A tool/shell event, a summary, a task record, an error result or jev's own advice cannot.
- **Cancelled:** needs a non-assistant decision (e.g. the user); a main-agent report alone cannot cancel scope.
- **Blocked/deferred:** update only a concrete missing/incorrect board representation. A description or arbitrary metadata can already represent the wait; no designated key is necessary.
- **Ongoing:** unfinished, not permission to resume.
- **Actionable now:** a supported authorized next action, with no unresolved input/dependencies. A matching task ID alone is never enough to claim or continue it, and an assistant report is never new user permission.
- **Future/unclear:** do not infer that the agent should start it.

Completed, cancelled, deferred, blocked or future tasks cannot simultaneously receive claim/continue/split instructions. New user scope takes precedence over an older board plan. Drift corrections name supported actionable work rather than blindly choosing the next pending task. Empty/all-done boards with trivial or idle activity do not create busywork.

Advice is framed as a leader review of the supplied reports and board, not independent verification of execution, and ends by inviting the main agent to reply with a reason if a point is mistaken; that reply is new input to the next review.

### Engineering-grounded task size

Granularity follows established practice, not a fixed size score:

1. Match the item's level and authorized purpose: feature/story, implementation/investigation task, or waiting item.
2. Identify evidence that would establish completion of its scope.
3. Check that a concrete next action is known; distinguish uncertainty from waiting for permission.
4. Look for useful progress, feedback or handoff checkpoints.
5. Split only when evidenced outcomes/checkpoints improve verification or coordination without losing coherent value or duplicating existing tasks.

A multi-file vertical slice with many tests can be one coherent outcome. One large goal can still need smaller verifiable checkpoints. Unclear completion criteria or next actions call for clarification, not automatic subdivision. Multiple simultaneous active tasks are not themselves an error. The granularity question covers the task from its first `in_progress` turn to the latest turn.

Age beyond `staleAuditSpans × interval` is **diagnostic only** (a boolean flag). It never forces splitting, even on an otherwise aligned board. Loop age is not task effort, an industry-standard timebox, or a calibrated service-level expectation.

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

Those are provider constraints, not local budgets; there is no fixed character or "30k" payload budget in this extension. No usable official preflight token-counting contract was found, so admission is decided by the server and a first request can be rejected.

**Pre-split per channel.** A channel is one endpoint plus the requested model. Before sending, the unanswered part of a request is estimated as bytes × the densest tokens/byte seen in that channel's provider-reported usage (1/1.75 until usage exists). The estimate is checked against each of the channel's limits separately, so the 64k request-wide allowance is not wasted by a stricter combined guess. The request is also pre-split if it is at least as large as a request the same channel actually rejected, in both dimensions. A pre-split sends nothing and is not recorded as a rejection. It never ends a scope on its own: one record or fragment with one question is still sent, and the server decides. Learning is restored from the diagnostics below. Unknown endpoints rely on learned rejections, or on `contextLimits: { request, stateAndLongestQuestion }` in the config. The estimate errs toward splitting: it pays a little repeated state overhead to avoid a rejection.

**OpenRouter** (supported, not used by the maintainers). Set `apiUrl` to `https://openrouter.ai/api/v1/systemone` and use an OpenRouter key. The [System One API](https://openrouter.ai/docs/guides/community/typesafe-sdk) accepts TypeSafe's request shape and bare model ids (`jev-latest` → `~typesafe/jev-latest`). Its [Jev page](https://openrouter.ai/typesafe/jev-1.13) lists one 32K context, used for both limits. OpenRouter reports overflow as `error.metadata.error_type: "context_length_exceeded"` and the charge as `usage.cost` (USD). Support is checked against the docs and offline tests only.

Input is first made small by the projection (tool events only) and the rolling result (processed input not resent). Only an explicit input context/token-overflow error then triggers **subdivision**, in order:

1. split the unprocessed records into ordered halves at record boundaries;
2. split a single long text record into ordered, labelled fragments (each at least 1,000 characters; a surrogate pair is never split);
3. when the questions dominate the request or the context cannot shrink, split the independent questions into batches over the same state.

Completed parts are cached and kept; a failure resumes only the unfinished part. A mid-record fragment never advances the receipt, so resuming rebuilds identical fragments that hit the cache. The exact rejected request is remembered (also across reload) and never resent unchanged. If one record/fragment plus one question still cannot fit, the audit stops with a diagnostic asking the main agent for a concise current report, keeping what was completed. A recovered audit notifies `context overflow recovered by subdivision` instead of a failure.

Ordinary validation, authentication, rate/quota, generic payload-size and unknown errors never subdivide. Recognition is deliberately conservative: the inspected [HTTP API docs](https://docs.typesafe.ai/api.md) do not specify a dedicated overflow schema, so an unfamiliar spelling is an ordinary isolated failure. Existing bounded transient-network retries remain separate.

## Cost diagnostics

Each audit appends one non-context ledger entry (`customType: "jev-todo-audit-ledger"`, `kind: "diag"`) with: audit id and label, questions reused vs sent, the processed range before/after, the outcome (`unchanged`/`completed`/`recovered`/`incomplete`/`failed`), and one row per actual provider attempt (retries and overflow rejections included) with status, response model, request state/question size in **bytes**, and provider-reported input/output tokens, plus the channel digest and the pre-split count. A channel that reports a charge (OpenRouter `usage.cost`) also records `costUsd` per attempt and in total. Usage the provider did not report is recorded as `"unknown"`, and so is any total that includes it. A cache hit records zero attempts, so its original usage is not counted again. Diagnostics contain no transcript text and no credentials, and never trigger an evaluation. Bytes are request size, not tokens or cost.

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
openspec validate reuse-jev-audit-decisions --strict
```

Tests use synthetic public Pi entries, captured requests and mocked Choice responses. They cover the tool-event projection, visible-text processing and replies, TODO segments and first-active origin, per-question reuse and reload, rolling results, overflow subdivision and resumption, manual modes, independent task decisions, repetition suppression and in-flight invalidation. An offline replay corpus (`test/corpus.ts`) compares request counts and bytes against a mock capacity. Those are request-shape measurements, **not** provider tokens or dollars, and they do not measure live jev semantic accuracy. Live savings require a separately authorized live replay.

API/serialization/consumer failures remain isolated from the agent loop. The extension neither guarantees that the main agent obeys a steer nor provides a hard tool blocker. The current rpiv-todo persistence shape is the only private-data adapter; incompatible snapshots cannot be treated as authoritative task state.

## License

MIT — see [LICENSE](LICENSE).
