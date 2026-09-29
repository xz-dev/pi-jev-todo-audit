## Why

JEV's current judgments are useful, but repeatedly sending the same context for the same questions wastes money, and audits have repeatedly failed with `HTTP 400: {"detail":{"error_type":"max_tokens_exceeded"}}`. JEV should act as a macro-level engineering lead: understand goals, reported results and broad progress, ask questions, and revise its conclusions from the main agent's replies—not perform the work or reread every execution detail.

## What Changes

- Put exact evaluation reuse in the shared JEV client path, not in special cases for TODO splitting or terminal stops. For the same effective context, complete question definition and model/rules, return the stored valid answer without another provider call. Cache each answered question; batch only misses and coalesce matching in-flight evaluations.
- Persist successful answers and completed processing ranges through existing session storage. Aligned, uncertain and no-correction results also count as processed. Reload, later TODO changes or a later chunk failure do not by themselves justify paying again for an identical completed evaluation.
- Treat actual TODO snapshot changes as new state segments without adding a provider trigger for every update. Local status review follows the latest state/delta; engineering granularity follows each task from its first `in_progress` turn through the latest reviewed turn, across subsequent updates and pauses.
- Replace generic tool arguments and result bodies with tool name, identity/order, and existing returned/error/cancelled/pending/unknown signals. Keep current structured TODO state separately. Apply this projection to ordinary and `full` review alike.
- Preserve new visible user and assistant text. Analysis itself can be work. A main-agent explanation or rebuttal of a JEV question is new information, not disposable chatter; prior JEV opinions remain revisable rather than becoming authority.
- Carry forward a rolling engineering state that distinguishes source-labelled task/main-agent reports, JEV opinions, and processed-range receipts. Here “summary” means stored evaluation results and supplied task facts, not a newly generated prose abstract. Replace superseded state rather than concatenate all old results or replay their raw context; missing macro facts call for a concise main-agent report, not invention from an answer label.
- Replace the one-shot crop-and-give-up overflow path with progress-bounded subdivision of unprocessed projected context or oversized question batches. Process chunks in order, persist completed work and resume only the unfinished suffix. Prefer one batch when it fits; do not hardcode a 30k body size or introduce a separate summarizer/classifier.
- Keep `/jev-audit` incremental by default and `/jev-audit full` as an explicit forced reassessment. Keep cadence, user cooldown, advisory-only TODO updates and human authorization boundaries.
- Compare actual attempts and provider input-token usage, with payload sizes as offline observations only. Validate text-only and short-context workloads as well as tool-heavy and overflowing sessions; do not claim savings solely because a cache or chunker exists.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `jev-todo-audit`: Uniform JEV result reuse, macro-level evidence projection and feedback, TODO state segments, task-long granularity, resumable rolling review, provider-limit recovery, manual review modes, and observable cost accounting.

## Impact

- Expected seams: `typesafe.ts` (per-question evaluation cache, batching, admission/recovery and usage), `context.ts` (macro projection, segments and processing ranges), `board.ts` (actual revisions and first-active task origins), `index.ts` (persistence, dispatch, feedback and freshness), and `verdict.ts` (consume macro conclusions as advisory findings, not claims of independently verified execution).
- Reuse Bun tests and existing captured-request/message seams. Add representative replay comparisons and mocked provider-limit cases; no new runtime dependency, database, semantic-search service or default live API test is required.
- The completed `ground-audits-in-visible-context` change is implemented but not yet synced to the main spec. This change deliberately replaces its raw tool-payload and single-overflow-recovery contracts while retaining its task-specific engineering rubric, privacy, source roles and advisory safety. Sync/archive the predecessor before this delta when separately authorized.
- Uniform caching covers every question handled by this extension's client, not just one business question. Cross-object semantic matching and a service shared with other repositories/extensions remain outside the approved same-object/session scope.
- This revision changes only these four planning artifacts. Implementation, live billing experiments, extension reload, release and archive require separate requests.
