# Incremental TODO judgment

The audit asks what new complete loops change about stored business state. It does not ask the service to summarize history, persist business memory or authorize execution.

## Input and state

Each request contains:

1. The current board and the full task definition for each asked task.
2. Its prior finite findings and report/source references.
3. Original public records reloaded by those references, serialized once per id.
4. Only the new complete loops needed by those task/session scopes.

Tool activity remains name/call/status only. Arguments, command/output bodies, hidden thinking, ambient instructions and bookkeeping are excluded. Source records retain role, completeness, advice and producer identity. Summaries are derived evidence, never user permission.

A partial report such as “A passed; B remains open” is stored as a reference to that exact report and reloaded when needed. It is not replaced with a generic segment label or a model-generated summary. The task description remains the acceptance scope: bullets, wrapping and prose do not create different completion contracts. A whole-task completion finding remains **reported, not independently verified**; it does not turn every line of metadata into a separate prerequisite.

Current state entries use `customType: "jev-todo-audit-state"`, version 3. Earlier cache/receipt entries and earlier experimental state versions are ignored, not deleted. Each task and the session has its own cursor/open range. Source text is not copied into the state ledger.

## Finite judgments

- Task lifecycle: no change, partial report, whole completion report, user cancellation, blocker, unblock, deferral, scope change, actionable now, uncertainty.
- Task evidence and granularity evidence: independent source choices; a lifecycle source is not automatically the granularity source.
- Task board representation: accurate, needs reconciliation, uncertain.
- Interaction/readiness, current work and authorized scope each have an independent evidence choice. Scope changes and permission decisions require user sources.
- Current work yields board match/alignment deterministically; being matched or unfinished does not grant permission.
- When scope changes, a simultaneous drift opinion is discarded. A dependent **drift-only** call sees the selected new user scope. Other tasks retain their own progress if that call fails.
- Board warrant is omitted while a task is in progress.

A `no_change` result preserves the earlier finding verbatim; it cannot manufacture a positive initial judgment. Relevant uncertainty, missing answers or unsupported source choices cannot advance a scope. Other scopes can advance independently.

## Persistence and currentness

State is adopted only after a synchronous Pi `appendEntry` returns without throwing. The appended value is cloned so later changes cannot mutate a checkpoint. This is the host append contract, not a filesystem `fsync` claim.

Reload chooses the latest branch-valid checkpoint for each scope. If a cursor or supporting source is absent, the derived scope is not kept with its provenance stripped: replay falls back to an earlier valid checkpoint or an empty scope. A compaction summary cannot substitute for a missing original report.

Pi's effective context initializes a cold audit. Across compaction, active-branch originals locate already-stored cursors and reload referenced public sources; old loops are not resubmitted as new history. The entrypoint fences publication and persistence on session, branch, effective-input currentness and cancellation. An uncooperative service may continue running internally after cancellation, but its late result cannot write state or publish advice and does not hold the audit slot indefinitely.

`full` invalidates old state durably before judging. If it fails later, ordinary audits may continue the saved progress, but cannot resurrect an earlier completion. A changed native acceptance threshold requires an explicit full reassessment before reusing old state for advice.

## Capacity and timeouts

Choice questions admit at most 255 options. Source-evidence options grow with the segment, so packing stops before any question would exceed that; a single complete loop with more than 255 candidate sources is reported as oversize and never sent (the cursor stays before it).

The audit queries `describeSelection({path: "judge"})`. Review-path channel constants are not silently substituted for judge-path model metadata. Limits are declared tokens, not measured provider acceptance.

Packing measures serialized state and question/source-choice growth. Request-wide and state-plus-longest-question dimensions are checked separately with the disclosed bytes-to-tokens ratio, envelope overhead and output reserve. Prediction chooses whole-loop boundaries; a single loop predicted oversized still gets one admission attempt. Only a reported overflow ends a single-loop scope as oversize. Recovery drops trailing whole loops, never tool-result pieces.

An incomplete tool group fences the suffix. Interleaved summaries, user steering and nonempty error messages do not separate a call from its results. Missing model limits use a bounded loop count and an explicit warning; this is **not** a discovered Pi token fallback. No provider window is inferred from examples or web-page guesses.

One `timeoutMs` is passed to each service call. The service applies it as bounded setup plus native logical-call deadline, or LLM per-request transport inactivity. No outer audit timer substitutes a total timeout for streaming inactivity. The audit passes no value unless `timeoutMs` is configured; the service then applies its backend default (native classifier 60 s absolute deadline; LLM Pi's `httpIdleTimeoutMs` inactivity window, Pi default 300 s).

## Cost and limitations

One original source is serialized once per request even if progress, lifecycle and permission state all refer to it. Distinct partial reports may accumulate because silently discarding an older still-needed fact would change the judgment. This design does **not** promise constant-size factual state or token savings under every workload.

The nonempty-memory integration fixture measures state, reloaded source and new-history UTF-8 bytes separately through the real entrypoint, sibling service and Pi adapter. A separate real-session replay compares suffix continuation with a cold baseline. Both use scripted responses and no live network; tokens and billing remain unknown unless a real provider reports them. These tests prove transport/state behavior, not classifier truth or wording equivalence on live models.

Remaining acceptance gates and unported historical assertions are listed in the [verification record](../openspec/changes/incremental-todo-state-judgment/evidence/verification.md). No installed-copy reload, deployment, paid inference, commit or push is included in this change's local validation.
