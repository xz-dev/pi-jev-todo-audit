# pi-jev-todo-audit

A [Pi](https://pi.dev) extension that checks whether the [`@juicesharp/rpiv-todo`](https://www.npmjs.com/package/@juicesharp/rpiv-todo) board matches the work visible in the conversation. It asks TypeSafe's **jev** model a batched set of Choice questions, then proposes only supported, compatible corrections.

jev acts as a **macro-level engineering lead, not a worker**: it sees goals, task definitions, reported outcomes, broad progress, user decisions and open questions, not execution detail. The extension is advisory. It replays persisted `todo` snapshots, never mutates tasks directly, and asks the main agent to make any justified update.

The design goal is **lower jev spend**: completed evaluations are reused under their exact identities, while processed tool events need not be replayed. Reported facts, JEV conclusions and review progress remain separate; necessary public reports may still need to be resent. Persistence uses Pi `appendEntry` custom entries (non-context); there is no database, summarizer model or classifier model. Neither caching nor a compact task account guarantees lower live billing.

## Install

```sh
pi install git:github.com/xz-dev/pi-jev-todo-audit
```

Restart your Pi session. A TypeSafe (or OpenRouter) API key is required; configure it in Pi (see [Configuration](#configuration)). An already-loaded extension continues running its old code until it is reloaded/restarted.

## Main processes only

The extension owns its process through `PI_JEV_TODO_AUDIT_OWNER_PID`, using Node.js `process.env` and `process.pid`:

- An unset or empty marker is set to the current PID. Independently started Pi processes each own themselves; no subagent framework flag is required.
- The same PID stays eligible on `/reload`, session replacement, and in-process main-agent forks. Session shutdown does not clear the marker.
- A different or malformed nonempty marker skips the extension before configuration, credentials, event handlers, or commands are registered. Inherited child and grandchild processes therefore have **no automatic or manual JEV audit**, including `/jev-audit full`.

Do not put this runtime marker in shell profiles, machine settings, or project config. Normal OS/Node environment inheritance passes it to descendants; the extension does not modify the launching shell. Existing children started before the owner claimed the marker are not retroactively marked.

This is an inheritance convention, not a security boundary or universal agent-role detector. Same-process SDK children, processes whose launcher strips the environment, and remote/container PID namespaces cannot be reliably classified this way. Same-process child launches must exclude JEV; explicitly loading it into such a child is not protected by a PID comparison. Headless main sessions remain eligible. The guard uses APIs shared by Windows and POSIX systems, not `/proc`, process commands, or shell parsing; platform execution is checked separately below.

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

### Reported facts and remembered conclusions

Processed input is represented by a **rolling result** that keeps three things separate:

- **Reported work:** permitted user decisions, the latest host summary and non-advice main-agent/custom reports from the processed range, re-sent as authored and labelled `retained from processed range`, plus current task records. User constraints are never silently dropped. A 4,000-character allowance, an old selected primary or a `covers` list does not establish that another report is dispensable. Reports with uncertain primary eligibility stay available, including the original permitted body after fragment processing. This can grow the required floor until admission is impossible; the diagnostic preserves completed work and discloses the incomplete scope rather than silently cropping it.
- **jev opinions:** the latest validated answers, sent as `rolling.opinions` (derived and revisable).
- **Progress:** the reviewed frontier `processedThrough`, stored as a receipt.

Here "summary" means these stored typed answers and retained reports. It is **not** a free-form prose generation call: nothing asks jev or another model to write a summary.

Every question is cached by *(rules version, endpoint, model, exact state, exact question)*. A later audit reuses a stored answer when those match and sends only the missing questions. Canonical facts, source/coverage definitions, roles, gaps and actual Choice definitions participate in freshness: a changed fact or reference cannot inherit an answer merely because the previous labels or cursor are unchanged. Cached answers, receipts and rejected-request fingerprints are appended to the branch as non-context custom entries, so they survive reload and compaction. They stay within the same session branch; nothing is shared across sessions or tasks. Missing original material after compaction remains a gap, not a fact rebuilt from opinions.

### Optional current task account

Ordinary task descriptions and public reports remain useful without a new field. To expose a current account, the main agent can include `metadata.auditBrief` in a public TODO record:

```json
{
  "metadata": {
    "auditBrief": {
      "text": "Parser acceptance checks are reported passed; rollout still awaits user approval.",
      "sources": ["acceptance-report-id", "user-decision-id"],
      "covers": ["investigation-report-id"]
    }
  }
}
```

Use actual permitted source IDs from the active history or audit feedback, not the example placeholders or invented origins. The containing task provides object scope. `sources` lists supporting references, **not an exclusive evidence allowlist**; `covers` declares earlier main-agent reports represented by the account, **not that their primary eligibility has expired**. The body is serialized once in the task supplement. Its factual index preserves original source roles and reference gaps.

The internal `factualMaterial.valid` means shape/reference validity only, not truth or semantic completeness. Missing, unsupported or unverifiable origins remain explicit. A brief is reported data, never independently verified execution or new user permission; a task supplement alone cannot anchor completion. Later user decisions and other tasks' needed facts remain protected.

A legal brief can clarify facts and relationships, but does not automatically shrink state or bound candidates. If 260 reports may still be needed as primary sources, merely listing them in `covers` cannot make that evidence Choice usable. Repeating the same account does not guarantee admission or recovery.

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

Every injected audit message identifies itself in its text as an automated `pi-jev-todo-audit` plugin advisory, not a user message, instruction or new authorization. Suggestions are for consideration at a natural checkpoint: the agent should continue its current task, respect the user's latest instructions and wait conditions, and need not send a separate reply. This wording does not change the steer delivery or terminal-wakeup gates below.

A supported correction includes task IDs and sanitized source excerpts, delivered through the existing custom-message steer path. Terminal execution needs explicit actionable-now evidence; merely unfinished work never wakes the agent. A concrete missing board annotation may permit **one board-only turn**, expressly instructing the agent to reconcile the board and return control without executing the blocked task. Split/clarification advice alone does not trigger a terminal restart.

Persisted correction keys suppress unchanged task/issue demands across reloads. Loop count, reworded stop reasons, previous audit messages and ordinary assistant acknowledgments do not re-arm them. Recording a requested blocker is reconciliation, not a reason to repeat it. New user/work evidence and meaningful task changes permit reconsideration.

Results invalidated by user, board, branch or session changes while a request is in flight are discarded. New stop evidence queued after invalidating an older request still receives its own check.

These gates validate supplied judgments and prevent deterministic contradictions. A real source citation does **not** prove the model interpreted that source correctly. The main agent remains responsible for acting within the user's authorization.

## Provider limits, not application quotas

### Choice definitions: at most 255 options

Every outbound Choice is checked at the shared unresolved-question boundary and on direct calls, including automatic, manual and `full` paths. The 255 count includes all fallback entries: **254 candidates + one fallback is eligible; 255 + one is withheld locally**. Board matching follows the same rule; no task identities are silently removed to fit it.

Per-finding manifests use supplied sources and explicit applicability. Known other-task supplements can be scoped out when there is no source/dependency relation; uncertain public report associations remain candidates. No keyword/title filtering, first/newest-254 crop, source-selection model call or probability-preserving paging is used.

An over-limit question is not sent, tested with an admission probe or recorded as a context rejection. It gets no fabricated answer, confidence, token usage or successful affected receipt. Compatible exact cached answers and valid independent corrections remain usable; if no unresolved questions can be sent, there is no empty request.

The existing steer channel reports `CHOICE CONTEXT INCOMPLETE` once for unchanged input, names the affected questions/counts and does not wake task execution. It asks for genuine scope information when available, not the deletion of necessary sources. A structurally valid account alone may be insufficient; repeating it is not promised to unlock the finding. The scope remains incomplete if a complete necessary candidate set still cannot be safely bounded.

### Token admission and recovery

The [official Models documentation](https://docs.typesafe.ai/models.md), checked 2026-09-27, maps `jev-latest` to `jev-1.13.0` and specifies two simultaneous limits:

- state + **all questions combined**: **64k tokens**;
- state + **the longest question**: **32k tokens**.

Those are provider constraints, not local budgets; there is no fixed character or "30k" payload budget in this extension. No usable official preflight token-counting contract was found, so admission is decided by the server and a first request can be rejected.

**Pre-split per channel.** A channel is one endpoint plus the requested model. Before sending, the unanswered envelope is estimated as bytes × the **latest usable** tokens/byte reported on that channel (1/1.75 until usage exists). Each provider limit is checked separately. Later successful observations can lower the estimate; a historical high-density input is not a permanent lower bound. Missing usage does not become zero. Size comparisons against actual rejections are fallible hints across different contents: a later admission at least as large in both dimensions retires a contradicted hint, without forgetting the exact rejected request. Learning is restored chronologically from the existing diagnostics. Unknown endpoints rely on learned hints or `contextLimits: { request, stateAndLongestQuestion }`.

A pre-split sends nothing and records no rejection. When retained state already defeats the prediction, splitting new records cannot solve it: the extension admits the current unanswered **batch** once instead of multiplying work by records and questions. This is useful audit work, not a separate validation query. Cached answers and exact rejected-envelope guards still apply, including a rejected single question that makes a same-state superset impossible. Success corrects learning; actual overflow still requires recovery. The estimate is not an exact token count or fit guarantee.

**OpenRouter** (supported, not used by the maintainers). Set `apiUrl` to `https://openrouter.ai/api/v1/systemone` and use an OpenRouter key (Pi's `/login openrouter` or `OPENROUTER_API_KEY`). The [System One API](https://openrouter.ai/docs/guides/community/typesafe-sdk) accepts TypeSafe's request shape and bare model ids (`jev-latest` → `~typesafe/jev-latest`). Its [Jev page](https://openrouter.ai/typesafe/jev-1.13) lists one 32K context, used for both limits. OpenRouter reports overflow as `error.metadata.error_type: "context_length_exceeded"` and the charge as `usage.cost` (USD). Support is checked against the docs and offline tests only.

Input is first reduced by the projection (tool events only) and rolling results. Subdivision requires an explicit input-context overflow or a channel prediction. It reduces the constrained dimension:

1. split unprocessed records into ordered halves when the state needs reduction;
2. split a single long text record into ordered, labelled fragments (each at least 1,000 characters; a surrogate pair is never split);
3. batch independent questions over the same frozen state when the request-wide limit is responsible or context cannot shrink. Generic rejections compare candidate reductions without pretending the provider identified a dimension.

Completed parts are cached and kept; a failure resumes only unfinished work. A mid-record fragment never advances the receipt, so resuming rebuilds identical fragments that hit the cache. Exact rejected requests are restored across reload and never resent unchanged. If fixed required state plus an irreducible fragment/question cannot be admitted, the scope stops before traversing remaining sibling combinations, keeps completed work and reports `FACTUAL CONTEXT INCOMPLETE`. A concise current account can expose decisions and gaps but cannot by itself erase retained primary obligations or guarantee recovery. User constraints are not silently dropped and incomplete reviews do not become final advice. A recovered audit notifies `context overflow recovered by subdivision` instead of a failure.

Ordinary validation, authentication, rate/quota, generic payload-size and unknown errors never subdivide. Recognition is deliberately conservative: the inspected [HTTP API docs](https://docs.typesafe.ai/api.md) do not specify a dedicated overflow schema, so an unfamiliar spelling is an ordinary isolated failure. Existing bounded transient-network retries remain separate.

## Cost diagnostics

Each audit appends one non-context ledger entry (`customType: "jev-todo-audit-ledger"`, `kind: "diag"`) with: audit id and label, questions reused vs sent, the processed range before/after, the outcome (`unchanged`/`completed`/`recovered`/`incomplete`/`failed`), and one row per actual provider attempt (retries and overflow rejections included) with status, response model, request state/question size in **bytes**, and provider-reported input/output tokens, plus the channel digest and the pre-split count. A channel that reports a charge (OpenRouter `usage.cost`) also records `costUsd` per attempt and in total. Usage the provider did not report is recorded as `"unknown"` on its attempt. The audit total sums what was reported and adds `unreported` with the number of attempts missing each figure (e.g. overflow rejections carry no usage); when `unreported` is present the total is a lower bound, not a complete cost. A cache hit records zero attempts, so its original usage is not counted again. Local Choice withholding is recorded separately as question/count/limit diagnostics, not a provider attempt, capacity-learning observation or model judgment. Diagnostics contain no transcript text and no credentials, and never trigger an evaluation. Bytes are request size, not tokens or cost.

## Configuration

**API key: use Pi auth (recommended).** For the two known endpoints the key comes from Pi's own credentials for the matching provider, in Pi's order (`auth.json`, including `!command` keys, then `models.json`, then the provider environment variable):

| `apiUrl` | Pi provider | How to configure in Pi |
| --- | --- | --- |
| `https://api.typesafe.ai/v1/systemone` (default) | `typesafe` | `TYPESAFE_API_KEY`, or a `typesafe` entry in `~/.pi/agent/auth.json` |
| `https://openrouter.ai/api/v1/systemone` | `openrouter` | `/login openrouter` or `OPENROUTER_API_KEY` |

When Pi's key is set it wins over this extension's config. **Fallback:** if Pi resolves no key (or the running Pi lacks that provider), the extension uses the env var named by `apiKeyEnvVar`, then `apiKey` in `~/.pi/agent/jev-todo-audit.json` (or the equivalent under `PI_CODING_AGENT_DIR`):

```json
{
  "apiKey": "sk-..."
}
```

A fallback key on a known endpoint still works, but session start warns once to move it into Pi. A custom `apiUrl` has no Pi provider and uses only the fallback, without that warning. All other fields are optional.

Configuration layers are defaults, global user configuration, then `<repo>/.pi/jev-todo-audit.json` **only for trusted projects**. Project files may set tuning fields but cannot set `apiKey` or `apiKeyEnvVar`. Missing/malformed files fall back safely. A legacy `~/.config/jev-todo-audit/config.json` produces a move notice rather than being loaded.

| Setting | Meaning | Default |
| --- | --- | --- |
| `apiKey` | Global-layer fallback file key; Pi auth and `apiKeyEnvVar` win | absent |
| `apiKeyEnvVar` | Global-layer fallback environment variable name | `TYPESAFE_API_KEY` |
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
bun run typecheck
node "test/fixtures/node ownership.mjs"
openspec validate prevent-audit-request-amplification --strict
openspec validate improve-audit-context-fidelity --strict
```

Tests use synthetic public Pi entries, captured requests and mocked Choice responses. They cover the tool-event projection, visible-text processing and replies, TODO segments and first-active origin, per-question reuse and reload, rolling results, overflow subdivision and resumption, manual modes, independent task decisions, repetition suppression and in-flight invalidation. Ownership tests drive the real extension registration and a native Node parent/child/grandchild fixture, without a shell. CI is configured for Linux and Windows with Node 26 and Bun 1.4.2; a Linux run or mocked Windows behavior does not substitute for executing the Windows job. The predecessor passed both jobs in Actions run `36973608562` on `ddd7f9a`. The context-fidelity source commit [`0bfc13d`](https://github.com/xz-dev/pi-jev-todo-audit/commit/0bfc13d67783b683d1923741e8b698dd39d6696d) passed actual Ubuntu and Windows execution in [Actions run `37097142774`](https://github.com/xz-dev/pi-jev-todo-audit/actions/runs/37097142774): each job installed dependencies, passed typecheck and 313 tests / 2,615 assertions, then ran the native Node v26.10.0 ownership fixture. Platform success is not live-model quality, billing improvement or installed-plugin activation.

An offline replay corpus (`test/corpus.ts`) compares request counts and bytes against a mock capacity. `bun test/compare-workloads.ts --baseline` reads committed `index`, `capacity`, `rolling` and `typesafe` modules at `HEAD`, without a checkout; other context/board/corpus helpers are current, so this is not a full historical build comparison. `bun test/compare-workloads.ts` runs the candidate against the same corpus and retained-prefix workloads. These are request-shape measurements, **not** provider tokens or dollars, and they do not measure live JEV semantic accuracy. Source presence in attempted/rejected packets is not completed review coverage; use answered fragments and durable frontiers. Preserving necessary legacy reports can increase traffic and stop a scope that an earlier crop appeared to complete. Easier admitted positive fixtures do not demonstrate recovery of that original difficult scope. Live savings require a separately authorized live replay.

API/serialization/consumer failures remain isolated from the agent loop. The extension neither guarantees that the main agent obeys a steer nor provides a hard tool blocker. The current rpiv-todo persistence shape is the only private-data adapter; incompatible snapshots cannot be treated as authoritative task state.

## License

MIT — see [LICENSE](LICENSE).
