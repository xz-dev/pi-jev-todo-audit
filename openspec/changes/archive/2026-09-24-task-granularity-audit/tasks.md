# Tasks

## 1. Staleness tracking

- [x] 1.1 In `board.ts`: replay all todo snapshots from the branch in order; a task that transitions into `in_progress` between consecutive snapshots gets stamped with the assistant-message count at that point (approximate loop index). Expose `taskAgesInLoops(board)` or equivalent. Verify: `test/board.test.ts` cases — pending→in_progress stamp, re-entry resets age, completed tasks excluded, missing snapshot → age 0.
- [x] 1.2 Compute audit spans: an audit fires every `interval` loops, so spans = floor(age / interval). Flag task as stale when spans > `staleAuditSpans`. Expose `staleTaskIds(board, interval, staleAuditSpans)`. Verify: unit tests for boundary (exactly at vs. one past the threshold).

## 2. Granularity question

- [x] 2.1 In `typesafe.ts`: add `granularity` Choice question (always included, regardless of board state) with options `single_verifiable_outcome` / `bundles_multiple_outcomes` / `ambiguous_done_criteria` / `not_applicable`; extend `AuditAnswers`. Verify: `test/typesafe.test.ts` — present on non-empty board, empty board, all-done board.
- [x] 2.2 Plumb `staleAuditSpans` (default 3) through `config.ts` (all layers, `PROJECT_ALLOWED_KEYS`) and `index.ts`. Verify: `test/config.test.ts` — default value, project override applies, malformed falls back.

## 3. Verdict wiring

- [x] 3.1 In `verdict.ts`: `decide()` gains `staleIds: number[]` parameter; add split step when (staleIds non-empty) OR (granularity in {`bundles_multiple_outcomes`, `ambiguous_done_criteria`} with confidence ≥ threshold, and a task is in_progress). Split step lists flagged task ids + instruction to split into single-verifiable-outcome tasks. When alignment was otherwise fine, split alone still injects. Verify: `test/verdict.test.ts` — stale + aligned → inject with split; granularity bundles → inject with split; granularity single/not_applicable → no split step; low-confidence granularity → no split on that basis; split + misaligned steps coexist in one message.
- [x] 3.2 `index.ts`: call `staleTaskIds` in `auditNow`, pass to `decide`. Verify: `test/index.test.ts` — synthetic branch with long-lived in_progress task produces split nudge in injected message.

## 4. Docs and regression

- [x] 4.1 README: document `granularity` question, staleness signal, `staleAuditSpans` config field. Verify: `grep staleAuditSpans README.md`.
- [x] 4.2 `npm test` all green; `npm run typecheck` clean.
