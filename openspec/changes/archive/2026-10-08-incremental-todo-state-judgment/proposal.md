## Why

The audit still asks every question as a conclusion over the whole history, so every stage re-carries previously processed source text (`shared-review.ts` `retained`, `history-stages.ts` 32KiB macro-byte packing). The cache that exists reuses identical requests; it does not let a confirmed "this segment did not change the task" become a breakpoint after which the segment is never judged again. The user's intent is TODO-specific: persist each question's judgment as business state, cut history by complete Pi loops within the selected judgment model's capacity, and judge only the new suffix.

## What Changes

- **BREAKING** Reshape every audit question from a whole-history conclusion into a *change question*: "given the stored state for this task/session, does this segment of new complete loops change it, and how?" Core subject of each question is unchanged (lifecycle, evidence anchor, granularity, board representation, interaction, work evidence, current work/match, drift, board warrant).
- Persist the answers as per-task and per-session judgment state in the audit's session JSONL (status, confirmed partial progress, blocker, completion report flagged *reported, not verified*, evidence anchors by source id, granularity verdict, interaction/wait condition, current work, authorized scope) with a confirmed loop cursor per task and per session.
- `no_change` on a segment advances that cursor; partial progress advances it carrying the partial result; `unclear_in_segment` keeps the segment open and never counts as "confirmed not completed".
- Segment history by complete Pi loops only (assistant message plus its tool results, never split), packed within the selected judgment model's capacity. Oversize recovery drops whole loops; a single loop that cannot fit with required state is reported, not sliced.
- Remove the audit's dependence on service cache/stage/checkpoint callbacks (`planStages`, `projectStage`, `onProgress`, review cache namespaces, projection revisions). The audit sends state + questions + the new loops; the service remains a stateless executor.
- Keep `verdict.ts` safety gates: authorization requires a non-assistant source, completion stays "reported", missing granularity fails closed, no execution from a cache hit, single-active audit scheduling, cooldown/currentness/source gates.
- No summarizer model, no free-text memory, no exact-repeat cache objective, no final whole-history re-review.
- Supersedes `consume-managed-review-service` (in-progress, 2/25). Completed changes stay as history.

## Capabilities

### New Capabilities

- `incremental-judgment-state`: per-question business state, change-question answer shapes, cursor advancement rules, invalidation and recovery.

### Modified Capabilities

- `jev-todo-audit`: `Audit request content` (state + new loops instead of accumulated history; change-question option sets), `Resumable rolling conclusions` (cursor advances on no-change/partial results; uncertainty does not advance), `TODO-defined state segments` (segments are complete loops, not TODO snapshots or byte blocks), `Provider context limits without artificial quotas` (loop packing within the selected model's declared capacity), `Uniform reuse of identical JEV evaluations` (replaced by result reuse through state; exact-repeat reuse is no longer a goal).

## Impact

- `typesafe.ts` `buildAuditRequest`: new question definitions and state projection.
- `verdict.ts`: reads judgment state; same gates.
- `shared-review.ts`, `history-stages.ts`, `rolling.ts`, `ledger.ts`: replaced by loop segmentation, state persistence and cursor logic.
- `index.ts`, `board.ts`, `context.ts`: loop grouping from the session branch, task snapshots unchanged.
- Service dependency: `pi-llm-as-jev` must expose the selected backend's capacity limits and keep timeout/backend handling; its cache/stage callback APIs become unused (see `focus-service-on-timeout-and-backend-compat` in that repository).
- Existing dirty working tree stays until the implementation change replaces it; no deletion in this proposal.
