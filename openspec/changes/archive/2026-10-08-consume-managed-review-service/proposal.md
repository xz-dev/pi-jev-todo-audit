> **SUPERSEDED (2026-10-08)** by `incremental-todo-state-judgment`. The user redirected the design: questions become change questions over persisted per-task/session judgment state, history is segmented by complete Pi loops within the selected model's capacity, and only the suffix after a confirmed cursor is judged. The accumulated-source staging, exact-repeat cache objective and consumer/service checkpoint protocol described below are no longer pursued. Repair evidence recorded here remains historical; remaining tasks are not to be executed.

## Why

Audit knows which facts its finite business questions need and when an earlier result can be reused; the judgment service cannot infer that from a choice label or processed cursor. The current adapter nevertheless couples audit progress to a service checkpoint and resends retained reports in fixed state. A backend change can repeatedly reject that checkpoint before inference, while the shared whole-call deadline can truncate an active LLM stream.

This revision follows the confirmed ownership correction: business-directed stages and session-local result caching in audit, generic judgment execution and backend-specific timeout handling in `pi-llm-as-jev`. It replaces the earlier proposal to put business history and generic semantic compression inside a managed service.

## What Changes

- Keep audit responsible for its finite questions, explicit factual dependencies, safe accumulation rules and the callback/function object defining staged evaluation. The service executes those stages and handles capacity; it does not decide which business facts may disappear.
- Cache validated question results and completed business-stage receipts in this session's JSONL through Pi custom entries. Reuse compatible processed history across repeats/reload, with cache identity covering actual judgment identity, question/rule meaning, effective business inputs and source lineage. Do not turn an old result into an answer to a changed question or changed factual obligation.
- Stop treating a service-owned checkpoint as audit's durable business frontier. Obtain the actual execution identity before accepting cached work, invalidate incompatible business reuse, and recover at most once per eligible operation without repeatedly submitting the same rejected seed.
- Project actual historical user/assistant conversation, permitted public reports, macro tool-call/result events and derived TODO state. Do not include ambient AGENTS/system prompts, tool-definition lists or other nonhistorical request scaffolding. Audit cache/diagnostic entries are bookkeeping, not new evidence or freshness changes.
- Supply explicit question/fact/accumulation contracts. Retain required original facts and user authority; where safe accumulation is not declared or cannot be established, retain/reconstruct the required evidence or report the scope incomplete. No generated summaries, new factual inference product or LLM-only result fields.
- Keep passing the caller-configured `timeoutMs`. The shared service interprets it as LLM stream inactivity or native Jev whole-call deadline according to the actual selected backend; audit does not select a timeout mode or silently ignore the setting. Cancellation, scheduling, freshness and final advice checks remain audit responsibilities.
- Reuse the existing public review/projection/progress seam wherever sufficient. Any necessary addition is a small, discoverable, backend-neutral execution contract, not a new service-owned business memory engine. Preserve legacy consumers, independent service updates, source selection and no automatic downgrade/pinning.
- Verify business-owned raw-history reuse, fact-preserving stage accumulation, backend-change recovery, healthy long streaming and reload persistence together. Measure historical text across the whole outgoing packet, not only the evidence array; unchanged-input cache hits are not proof of append savings.

## Capabilities

### New Capabilities

- `managed-audit-integration`: audit-managed finite-question stages and session JSONL cache using shared judgment execution, including safe source handling and joint acceptance.

### Modified Capabilities

- `jev-todo-audit`: business-owned rolling results, explicit factual/accumulation contracts and compatible historical reuse behind existing advisory-only authority.
- `judgment-service-delivery`: readiness for the actual generic review/callback contract required by this consumer, without private bundling, automatic downgrade or a pinned service.

## Impact

Primary seams: `index.ts`, `shared-review.ts`, `rolling.ts`, `ledger.ts`, `judgment-client.ts`, `judgment-service.ts`, `context.ts`, `typesafe.ts`, existing tests and README. Preserve `verdict.ts` safety rather than replacing it with cached model opinions. Keep the existing Pi session store; do not add a database, generic event framework or separate prompt cache.

Companion: `pi-llm-as-jev/openspec/changes/manage-review-context-and-runtime/`. The service owns generic admission/execution, actual backend identity, capacity, cancellation, timeout and observations. Audit owns business history, step semantics, JSONL result caching, authority and delivery. Previously completed changes remain unedited; only the responsibilities explicitly revised here are superseded.

The user has authorized joint implementation. Publishing, installation, paid inference, Git commits/pushes and archiving remain outside that authorization. Neither a timeout-only fix nor a cached-repeat-only demonstration completes the joint change. Design/spec/task reconciliation for this ownership revision must precede completion claims.
