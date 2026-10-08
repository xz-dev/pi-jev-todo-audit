## Context

See proposal.md - Why. Relevant current facts:

- `typesafe.ts` builds ten question families as conclusions over the full projected history: `alignment`, `current_match`, `drift`, `board_warranted`, `interaction`, `work_evidence`, and per task `task_status_<id>`, `task_evidence_<id>`, `task_board_<id>`, `task_granularity_<id>`.
- `verdict.ts` consumes those answers with deterministic gates (non-assistant authorization source, completion is "reported", fail-closed granularity, board-only vs execution corrections).
- `shared-review.ts` `projectStage` re-adds completed records to every later stage; `history-stages.ts` plans stages by ~32KiB of macro-record bytes. Neither groups by Pi loops nor by the selected model's token capacity.
- Pi emits `turn_end` after each assistant message and its tool results; error/abort paths also emit it. A loop is complete only when every tool call in the assistant message has a recorded result (or an explicit failure) on the active branch.
- `pi-llm-as-jev` resolves the backend, applies caller `timeoutMs` as LLM per-request inactivity or native whole-call deadline, and predicts overflow from `contextLimits`/`model.contextWindow`. It does not yet expose the selected limit to callers.
- Only historical conversation and tool events are evidence. AGENTS/system prompts, tool definitions, hidden thinking, private payloads and cache bookkeeping are not.

## Goals / Non-Goals

**Goals:**
- Every question answers "what did this segment change" against stored state; a segment judged `no_change` is never judged again for that question.
- Partial completion (A done, B open) is persisted as state, not flattened into "not completed".
- Uncertainty is persisted as uncertainty and keeps its segment open.
- Segments are complete loops packed within the selected judgment model's capacity.
- Service stays stateless; audit owns state and cursors in its session JSONL.

**Non-Goals:**
- Summarizer model or free-text memory.
- Generic conversation history database or exact-repeat request cache.
- LLM-only features (tool use beyond structured answers, long reasoning dependencies).
- Final whole-history re-review as a correctness guarantee.
- Repairing historical timing-sensitive test failures (backoff ratio, J11) — tracked separately.

## Decisions

### D1. Change questions, not conclusion questions

Each question is phrased as: stored state for its scope + new loops -> which transition, if any. Alternatives: keep conclusion questions and cache by request identity (current; forces history replay); ask the model to summarize (LLM-only, lossy, not permitted). Change questions keep Jev-compatible finite options and make `no_change` a durable breakpoint.

Per-question shapes (criteria names indicative; final wording in implementation):

| question | scope | state carried | answer options | writes |
|---|---|---|---|---|
| `task_status_<id>` | task | status, scope note, confirmed progress, blocker, completion report | `no_change`, `progress_evidenced`, `completion_reported`, `cancelled_by_user`, `blocked_now`, `unblocked_now`, `deferred`, `scope_changed`, `unclear_in_segment` | status fields; cursor advances except on `unclear_in_segment` |
| `task_evidence_<id>` | task | anchor ids bound to specific conclusions | source id from the segment, `keep_prior`, `none_in_segment`, `insufficient_evidence` | anchor map; an anchor supports exactly the conclusion it was chosen for |
| `task_granularity_<id>` | task (in_progress, no unfinished dependency) | first-active purpose, tracked children, last verdict | `unchanged`, `now_needs_split_outcomes`, `now_needs_split_checkpoints`, `now_needs_done_criteria`, `now_needs_next_action`, `blocked_now`, `appropriate_now` (initial positive finding, own source required), `resolved`, `unclear_in_segment` | last verdict; age never counts as change |
| `task_board_<id>` | task | last verdict + task snapshot hash | `accurate`, `needs_reconciliation`, `unclear` | re-asked only when snapshot hash or blocker/deferral state changes; no history |
| `interaction` | session | state, wait condition, anchor | `unchanged`, `user_responded`, `permission_granted`, `permission_withdrawn`, `now_waiting_user`, `now_waiting_external`, `work_resumed`, `idle_now`, `unclear_in_segment` | interaction state and wait condition |
| `work_evidence` | session | authorization anchor, current-work anchor | source id, `keep_prior`, `none_in_segment`, `insufficient_evidence` | anchors; withdrawn permission voids the anchor |
| `current_work` (replaces `alignment` + `current_match`) | session | current work object, matched task | `same_work`, `switched_to_<taskId>`, `switched_off_board`, `waiting`, `unclear_in_segment` | current work; `alignment` is derived by comparing with the in_progress set |
| `scope_update` + `drift` | session | authorized scope anchor + note | step 1 `scope_updated` / `no_scope_change`; step 2 `on_track`, `drifted`, `blocked`, `unclear` | scope anchor replaces old scope; earlier behavior is not re-judged |
| `board_warranted` | session, only when no in_progress task | last verdict + activity description | `warranted`, `trivial`, `idle` | re-asked only when current work changes |

### D2. State lives in the audit session JSONL

Shape (draft):

```
task[id]: { status, scopeNote, confirmedProgress[], blocker?, deferral?,
            completionReport?: { sourceId, verified: false },
            anchors: { [conclusion]: sourceId }, granularity: { last, anchor },
            boardCheck: { last, snapshotHash }, cursor: loopId, open?: loopId }
session:  { interaction: { state, waitingFor?, anchor }, currentWork: { taskId | off_board | none, anchor },
            authorizedScope: { anchor, note }, boardWarrant?: { last, activity },
            cursor: loopId, open?: loopId }
```

Every field is a finite answer or a source id into the session branch; source text is reloaded by id when a question needs it. Alternative: keep state in the service ledger (rejected: service becomes business memory).

### D3. Cursor semantics

- `cursor` = last loop id whose segment produced a non-uncertain answer and was durably appended (acknowledged write) under the current branch and model identity.
- `open` = earliest loop in a segment still answered `unclear_in_segment`; the next request starts there, not after it.
- Partial progress (`progress_evidenced`) advances `cursor` and records which acceptance items are confirmed.
- Per task and per session, independently. One uncertain task never forces other tasks to re-read.
- Invalidation (one `resetTask` contract): evidenced task scope change, reopen, or a changed task contract (subject/description/metadata hash) without new history -> that task's findings are cleared and it re-judges from its first-active loop when known, otherwise from the current segment (evidenced change) or the earliest known loop (contract change); authorization withdrawn -> session anchors voided, cursors kept; branch change/compaction -> a scope is kept only when every cursor/anchor/first-active/source reference is still on the active branch, otherwise the latest valid earlier snapshot of that scope is used; judgment model identity change -> state retained as reference, cursors kept, only loops after each cursor are judged by the new model, nothing before is replayed unless the user requests full mode.

### D4. Loop segmentation and capacity packing

- A loop = assistant message + its tool result messages on the active branch, ordered by branch position. A loop is complete when every `toolCall` id has a matching result or explicit failure. Incomplete trailing loop is excluded, never split.
- Segment = consecutive complete loops after the relevant cursor, packed until estimated input (state + question definitions + loops + backend envelope + output reserve) reaches the selected backend's declared capacity. Capacity comes from the service's exposed limit for the selected backend/model (tokens, with the service's bytes->tokens prior) and never from the main chat model.
- Recovery on overflow: drop trailing whole loops and retry; a single loop that cannot fit with required state is reported as `oversize_loop` and the cursor does not move past it.
- Pi fallback when the model carries no limit: ask the service; if it reports no limit, the audit treats the loop count as unbounded only up to a configured safety ceiling and surfaces the missing metadata. Not inferred from provider web pages.

### D5. Service contract

The audit calls `service.judge(state, questions, { timeoutMs, signal })` with the new-loop text embedded in state (loops as ordered records). No `cache`, `checkpoint`, `planStages`, `projectStage`, `onProgress`. The service reports selected backend/model, capacity limits, attempt diagnostics and overflow. Timeout stays caller-supplied and backend-interpreted inside the service.

### D6. Verdict gates unchanged

`verdict.ts` reads judgment state instead of per-run answers. Gates kept verbatim: authorization requires a complete non-assistant, non-supplement source; `completion_reported` yields "mark completed — reported, not independently verified"; in_progress task without a granularity verdict never wakes execution; terminal-stop board-only mode; no correction from suppressed keys; single-active audit; cooldown/currentness/source gates.

## Risks / Trade-offs

- **State drift**: stored state can become wrong if an earlier answer was wrong. Mitigation: anchors are source ids; `scope_changed`/reopen reset the task cursor; user can request full re-judgment.
- **Option set growth**: change questions have more options than conclusion questions. Source-evidence questions grow with the segment, so packing stops before any question exceeds 255 choices; a single complete loop with more than 255 candidate sources is reported `oversize` and never sent (fail closed, cursor parked before it). The audit does not withhold sources inside a loop.
- **Loop boundary edge cases**: aborted/errored turns, compaction summaries, id-less entries. Rule: only loops fully present on the active branch count; summaries are evidence records inside a loop, never loop boundaries.
- **Capacity metadata gaps**: OpenRouter Jev 1.13 page states 32,000 tokens; TypeSafe direct limit not verified in docs read so far; service hardcodes per-channel constants. The audit relies on the service's reported limit and surfaces missing data instead of guessing.
- **Migration**: existing dirty code (projection/5, review cache namespaces, rolling receipts) is replaced, not patched. Old session ledgers are ignored by the new state reader; nothing is deleted.
- **Timeout default**: the audit sends no default; the service applies native 60 s / LLM Pi `httpIdleTimeoutMs` (user decision). A configured audit value still reaches the service unchanged.
