## Context

See `proposal.md` for the cost objective and macro-leader role. The user has confirmed: uniform reuse of the same context/question for every JEV decision; ordinary tools represented by name plus existing status; TODO updates as state segments; granularity spanning the first `in_progress` turn to the latest turn; main-agent replies as corrective feedback; and rolling conclusions followed by multi-request subdivision when necessary. “Summary” means remembered evaluation results, not a new prose-summary product.

Current source baseline is `master@6b5de48`. `index.ts` pays for an audit before suppressing repeated corrections. `typesafe.ts` batches all questions but keeps no per-question evaluation cache; it serializes repeated task/source material and discards response usage. `context.ts` forwards tool arguments/results and protects some very large current records. `board.ts:inProgressSince` tracks the latest active stint for age diagnostics, not the first-active origin needed here. Existing correction evidence hashes exclude assistant prose and cannot identify the new evaluation inputs.

The exact reported `400 {"detail":{"error_type":"max_tokens_exceeded"}}` is already recognized. `bun test test/limits.test.ts` passed 19 tests during planning, including this spelling, one recovery and protected-only failure. That verifies current handling, not the user's live payload or loaded runtime. The present recovery can fail with no removable records or a still-oversized reduced request. Repeated warning lines alone do not identify attempt count or duplicate extension loading.

`ground-audits-in-visible-context` is implemented but not yet synced into main specs. This delta intentionally supersedes its raw execution-payload and one-recovery-only contracts, while preserving privacy, task-specific engineering practice, advisory execution and current-input freshness. Sync/archive that predecessor before this change when separately authorized.

### Verified interfaces

- [TypeSafe Models](https://docs.typesafe.ai/models.md), checked 2026-09-29: Jev 1.13 charges input tokens, output is free, and shared state is ingested once per request. Limits are 64k for state plus all questions, and 32k for state plus the longest question. The public direct-endpoint rate is $0.042/M input tokens; it is not necessarily a custom endpoint's price.
- [Primitives](https://docs.typesafe.ai/primitives.md): Choice, Score and Noul return constrained typed answers, not free-form generated prose. Answers can be placed in a subsequent request's state; questions within a batch are independent. The current extension only needs its existing Choice questions—do not add unused primitive support merely for caching.
- [HTTP API](https://docs.typesafe.ai/api.md): responses expose `model`, `usage.input_tokens` and `usage.output_tokens`. This is post-request accounting, not a verified preflight counter. No usable authoritative counter was established by the predecessor investigation.
- Pi's extension state docs, installed `ExtensionAPI` declarations, and `examples/extensions/entry-renderer.ts` establish that `pi.appendEntry()` persists non-model-context data and `getBranch()` permits branch-local replay. Use this existing seam, not a new database or context-message cache dump.

## Goals / Non-Goals

**Goals:** stop repeated paid evaluations; shrink input to leader-level information; retain text-only work and feedback; complete recoverably oversized reviews without repeatedly restarting them; measure actual input spend where available.

**Non-Goals:** cross-object semantic similarity caches, a multi-repository cache service, arbitrary execution-log parsing, a second summarizer/relevance model, a new accuracy program, automatic task execution, tool-blocking, a pricing dashboard, or changing cadence. Partial question caching is a key/value lookup, not a dependency-graph scheduler.

## Decisions

### D1: Separate evaluation memory from current audit progress

Put a shared evaluation-cache path around provider evaluation in `typesafe.ts`, below the business-specific question builder. It must not special-case names such as lifecycle or granularity. Its identity is:

`hash(provider/model identity + judgment/projection version + normalized effective context + complete question definition)`

The complete definition includes type, instructions, criteria/options and their meaningful ordering. Normalize JSON deterministically, preserve text and chronology, and omit run IDs/retry counters/display timestamps from the actual decision payload rather than letting them defeat reuse. Object/session/source identities that affect meaning remain in context. This is exact normalized-input reuse, not a fuzzy match of titles. Endpoint/model/judgment changes that alter the evaluated contract make new keys; changing only a local confidence threshold can reuse the answer and apply the threshold locally.

For each requested question, look up its normalized answer. Return hits, join matching pending evaluations within the runtime, and send only misses sharing the same state in a batch. Remap transport question keys to the caller as needed without confusing distinct object meanings. Save each valid answer independently; an invalid sibling does not erase completed work. Well-formed low-confidence/uncertain results are legitimate cached judgments, never promoted to stronger ones. Cache hits contribute zero new usage.

Persist answer records in non-context session entries. Keep scope within this extension's approved same-object/session history. Do not clear applicable records merely on reload, TODO update or a later failure. No time-based expiry that silently rebuys an identical answer. Record requested and observed response model identities; invalidate known model/rule changes, but do not add lookups to detect an unannounced model-alias change. `/jev-audit full` is the explicit bypass for fresh reassessment.

Separately persist a **review receipt**: origin/scope, source or fragment range, predecessor result identity, required answer keys, and latest cumulative result. A receipt advances the reviewed frontier only when all required answers for that stage are available and the receipt is durably recorded. Evaluation-cache validity is about captured immutable inputs; current advice eligibility additionally depends on live session/board/user freshness. A stale response can still be a result for its old input key without authorizing current delivery. Never write an old session's receipt into a newly active session.

Alternative rejected: one whole-audit hash or only emitted `auditKeys`. Both re-buy answered siblings, aligned results and completed prefixes. Existing correction-repeat keys remain a separate concern.

### D2: Build a leader-level projection, not a transcript of execution

Before batching, caching or admission, project ordinary calls/results and visible shell executions to stable event identity, order/call association, tool name and existing envelope status. Use `returned`, `error`, `cancelled`, `pending` or `unknown` where justified. Absence of an error flag is not “tests passed.” Do not send arguments, shell commands, file contents or output bodies; do not parse logs or add adapters to recover their business meaning. The rule also applies to `full`.

The existing TODO adapter still reads persisted snapshots and supplies task identity, definition, status, ownership, dependencies and metadata. Serialize each current task record once; avoid another identical copy as both top-level requirements and evidence supplement. Task facts are the audit target, not generic execution detail.

Preserve supported new visible user/assistant text and visible conversation-level external messages in order, including analysis-only work and intermediate messages without filename/task references. Keep original roles, explicit user decisions and the question needed to interpret a short reply. Public user-decision records, when provided by the host as such, are conversation input; do not infer user authorization by interpreting an arbitrary excluded tool body. Facts visible only inside excluded execution payloads are outside this projection; JEV can ask the main agent to explain them in normal conversation.

Keep prior JEV questions/advice identifiable when needed to interpret a new main-agent reply. Advice alone is neither new work nor independent evidence; an assistant's explanation/rebuttal is new input that can revise the opinion. Do not discard all assistant acknowledgments by regex or assume “no tool call” means “nothing happened.” Emit bounded leader questions or scoped reconciliation advice through the current message path; the main agent remains responsible for execution and can answer or correct it on a later turn.

Coverage is of this explicit macro projection, not of hidden/raw execution internals. Deliberately omitted tool bodies must not automatically make every macro review incomplete. Real missing/redacted conversation, incomplete fragments or unknown task origins remain separate coverage gaps. Source options contain current projected records and labelled processed-result references, not every historical event ID. Local receipts keep lineage without retransmitting their old raw bodies.

### D3: Two time scales, no extra trigger for each board edit

Derive a TODO revision stream from actual persisted snapshot changes using the existing board replay seam. No revision for reads, failed mutations or no-ops. A revision defines a new state segment and records which tasks/fields changed. Do not immediately call JEV for every revision: existing periodic/manual/terminal eligibility still determines when to review.

Local status questions see current task facts, applicable last conclusions and new segment events. Granularity questions use the task's original definition plus its trajectory from the **first** `in_progress` turn through the current covered turn. Record that first-active source identity independently from the existing age counter, which resets on a later active stint. Ordinary description/status updates, waiting and resumption do not erase this origin. A new task identity does not inherit another item's trajectory. If an origin cannot be reconstructed, label it rather than fabricate a start.

The macro span is represented by completed rolling conclusions plus unprocessed events. Its coverage stays task-long even though raw old text is not resent. Preserve the existing engineering rubric: coherent outcome, completion boundary, next action, useful checkpoints and non-duplicative subdivision. Neither tool count nor elapsed loops determines size. A new board segment is new current state, not grounds to erase prior evaluated information.

The two views need not require two network calls. Batch uncached independent questions when they share a suitable projected state. When their context scopes differ, retain the distinction instead of padding every local question with every task's entire raw lifetime. No speculative per-question dependency graph is needed.

### D4: Rolling state is typed conclusions, not generated prose

Keep three distinct parts in the rolling state:

- **Reported work:** the task goal, reported stage outcomes, blockers and open questions, sourced from the current TODO record and concise reports actually supplied by the main agent. Keep source/role identity; these are reports, not independently verified execution facts.
- **JEV opinions:** the latest normalized lifecycle/interaction/granularity answers and confidence. They can be corrected by new information and do not replace the work report.
- **Processing progress:** the first-active origin, source/fragment ranges and completed evaluation receipts. These prove which inputs were processed, not that every needed fact survived in an answer label.

Use existing task fields and the main agent's normal reports rather than asking JEV to generate prose or inventing an extraction model. A brief can retain a concise supplied report as authored; no generic semantic parsing of arbitrary prose is promised. New task state or an explicit updated report can supersede reported facts, but an advanced cursor or a changed `appropriate`/`blocked` answer cannot silently erase them. If a usable compact report is missing or too large, the leader asks the main agent for a concise current account through the existing feedback path; until then the required facts remain unknown. This is not permission to replay identical old evaluations or claim lossless summarization.

For each unprocessed piece, give JEV the relevant latest state plus that piece and the necessary questions. Its typed answers replace superseded opinions; task updates/main-agent reports supply the factual changes, and successful processing advances the frontier. Equal answers still consume the piece. Do not append an unbounded list of old reports or summaries. Missing detail becomes a leader question whose later main-agent answer is a new delta, not a paid rereading of the same old input.

A stable processing chain looks like:

```text
origin + piece 1       --> result 1 + receipt 1
result 1 + piece 2     --> result 2 + receipt 2
result 2 + piece 3     --> result 3 + receipt 3
```

Each question evaluation passes through D1. If piece 3 fails, keep the first two receipts and any valid answers for piece 3. Resume at the first unresolved work, without replaying the raw context for pieces 1 and 2. Within one piece, independent question sub-batches share a frozen input state; merge their answers only after the needed set is available, then produce the next cumulative state. Do not treat one same-request answer as hidden context for another.

Intermediate findings do not emit completion, split or wake instructions. Mark whether the target span is fully covered; the last admitted piece can answer the final questions in that call rather than automatically adding a separate pass over all chunks. A later user/board change can invalidate delivery or require a revised continuation, but does not delete the immutable evaluated-pair records. Abandoned histories cannot become current merely because answers exist in the cache.

### D5: Recover capacity by subdivision with progress, not repeated cropping

Tool projection and old-result reuse happen first, including on a cold or forced review. This removes major raw-payload sources of the reported error before the initial request. Normally use one fitting batch. A literal “30k new text” is not a safe independent budget: cumulative state, task facts, question instructions/options and framing also consume the provider's 32k/64k limits. Prefer an authoritative counter if obtainable; otherwise server admission remains the authority, and the first request can still be rejected.

On an explicit context/token overflow, record the rejected envelope identity and subdivide only unresolved work. Prefer complete TODO/message boundaries. If a single text record must be divided, use ordered labelled fragments and retain its source/coverage identity until all fragments are processed. Never silently take only a suffix, omit early instructions or claim a partial record was fully reviewed.

Reduce the dimension causing the failure where the provider identifies it: too-large state requires smaller projected context, not repeated question splitting with identical oversized state; request-wide question overflow can use smaller independent batches with the same frozen context. With an undifferentiated `max_tokens_exceeded`, use a deterministic subdivision order and observed admission results, not a guessed tokenizer. Byte/record counts may establish structural progress and choose a split; they do not prove token fit. Cache every successfully answered pair encountered during recovery.

Every recovery edge must reduce the unresolved envelope structurally; process finite fragments/batches, stop on cancellation or irreducible required state/question, and never send the same known-rejected envelope again unchanged in an ordinary continuation. Persist enough rejection/progress identity that reload does not restart an identical failure loop. Maintain existing bounded transient retries for network failures separately; authentication, quota, ordinary validation and generic payload-size errors are not context-overflow signals. No arbitrary three-retry or one-recovery ceiling that cannot traverse a legitimate long input, and no timer that blindly retries the original oversized body.

If even fixed necessary state or one question is too large, stop that affected scope and explain what must be shortened or clarified, possibly asking the main agent for a concise task report. Retain completed scopes and cached answers. This is a real provider boundary, not a promise that an arbitrarily large indivisible question can always fit. When subdivision succeeds, report recovered success rather than repeat the initial 400 as final failure.

`full` bypasses old evaluation results once for the requested fresh review. Within that forced review, newly completed parts are still saved and are not re-bought if a later part fails. Further explicit `full` requests deliberately request another fresh review. Ordinary resumption uses the saved fresh-review progress.

### D6: Preserve advisory and freshness boundaries at the consumer

`typesafe.ts` owns uniform reuse, valid per-question answers, attempt accounting and transport admission. `context.ts` owns projection/ranges; `board.ts` owns actual revisions and first-active origins; `index.ts` restores/persists the small ledger, selects work and commits current progress/advice. Use ordinary maps and existing hashes/session entries. A small helper module is acceptable for cohesion; no generic cache framework or new service.

`verdict.ts` must consume the new macro evidence contract rather than silently retain assumptions that every useful finding has raw execution output. Assistant text can be the requested analytical deliverable or a main-agent progress report; it must not be rejected wholesale because its role is assistant. Conversely, a report or a normal tool return is not independent verification that code/tests are correct, and a main-agent claim cannot create new user permission. Phrase advice as leader questions/reconciliation based on supplied reports, not “JEV verified execution.” Preserve option/reference/confidence validation, independent-task handling, blocking/authorization distinctions and no contradictory task instructions.

Before final delivery, compare the captured active session, user/board state and branch with the current inputs. Stale or incomplete review never becomes current completion/split/continuation advice. The existing rules for terminal wakeups still apply; a granularity clarification alone does not wake a user-waiting agent. Reworded already assessed terminal metadata does not create new work, but first terminal mode and new visible replies do. Keep repeated-demand suppression separate from evaluation caching: considering a reply need not repeat the same reminder.

Append evaluation/progress/accounting records via `pi.appendEntry`, not `sendMessage`. Exclude only this extension's own bookkeeping from its observation/freshness identities so saving results does not trigger a new evaluation or invalidate its own run. Restore compatible active-branch receipts after reload/compaction; preserve uncertainty if required coverage is actually missing. A storage failure must not be reported as durably completed progress. No transcript rewrites or credential exports are required.

### D7: Make the cost result decide further investment

Retain validated `model` and token usage from every actual response, even if its answers are malformed or its delivery becomes stale. Count failure, retry and subdivision attempts; missing usage is unknown. Record compact audit/attempt identity, cache hits/misses, state/question bytes, questions, processing ranges and observed usage in non-context session observations, with concise manual diagnostics. Never count original tokens again on cache hits or send another request merely to measure them. Distinguish initial overflow, recovered success and irreducible failure; diagnose repeated warnings with captured audit/attempt identity rather than assuming they are two retries.

Use a small representative replay corpus: tool-heavy activity, long text-only analysis with main-agent replies to JEV, and short contexts where state overhead may dominate. Include a changed TODO segment, waiting/resumption, mixed cached/new questions and a later chunk failure. Compare the baseline and candidate on identical inputs/settings; report per-case and aggregate attempts, payload sizes and added rolling-state overhead.

After the first working cache/projection/rolling slice, perform the comparison before completing every lifecycle/reporting feature. If ordinary successful-baseline workloads show no reduction in repeated input, stop and simplify or revise the remaining plan with the user. Separately require oversized-input cases to demonstrate recovered coverage and cheap resumption; a successful new review cannot honestly be called cheaper than an old failure with unknown billing merely from request count.

Live token/dollar evidence requires separately authorized sanitized replay on the same endpoint and preferably a pinned model. Sum actual input tokens across attempts and apply only a contemporaneously verified applicable tariff as an estimate; the currently documented direct Jev 1.13 example is `input_tokens / 1_000_000 * 0.042 USD`. Do not hardcode that price in runtime or apply it to arbitrary gateways. Offline bytes/mock usage establish request behavior, not measured live savings or semantic equivalence. No new accuracy-evaluation program is part of this change.

## Risks / Trade-offs

- [Typed conclusions do not preserve every old detail] -> Keep original task goals and traceable local receipts, label reports/unknowns, and allow the main agent's new explanation to correct JEV. Do not claim lossless summarization or reread unchanged pairs automatically.
- [Macro projection omits facts buried in raw tool bodies] -> This is the approved leader-level boundary. Preserve available error/return signals, avoid independent execution-proof claims, and request a normal main-agent report when necessary.
- [Subdivision itself adds input overhead] -> Batch when possible, use it only for actual capacity needs, reuse completed questions/prefixes, and measure all attempts.
- [All tasks' cumulative state becomes too large] -> Scope envelopes to relevant objects/decision views; irreducible required state is reported, not retried indefinitely.
- [An alias changes without a local configuration change, or persisted state is lost] -> Record actual identities and available coverage; use explicit forced review or new keys for known changes. Do not promise exactly-once billing across lost storage, unrelated processes or duplicate extension installations.

## Migration Plan

1. Finish and validate these planning artifacts only. The earlier independent review timed out and did not approve this revised scope; do not represent it as a passed review.
2. On a later explicit apply request, establish the source/runtime and representative request baseline; implement uniform reuse and projection first, then rolling processing and recoverable subdivision at existing Bun seams.
3. Use the early economic decision point before broader completion. Preserve old custom messages and TODO snapshots; new non-context records require no task migration. Legacy correction-only markers are not invented evaluation results.
4. Run focused checks, the full suite/typecheck, strict OpenSpec validation and the offline comparison. Document observed results, unmeasured live costs and irreducible capacity cases; seek user acceptance before release/reload or paid experiments.
5. A code rollback can ignore new custom records without deleting session history. Sync/archive `ground-audits-in-visible-context` before this overlapping delta only when separately requested.
