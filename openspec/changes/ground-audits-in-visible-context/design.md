## Context

See `proposal.md` for motivation. The current audit has useful boundaries worth retaining: branch-replayed TODO state, one batched TypeSafe Choice request, independent task lifecycle answers, and advisory messages rather than direct board mutation.

The evidence projection is the weak point. `recentActivity()` reads a nonstandard top-level `toolCalls` field instead of Pi's `content` tool-call blocks, excludes tool results and custom/summary entries, and takes the last 20 extracted text fragments before cutting to 4,000 characters. `renderBoardLines()` drops descriptions, metadata, and owners. Recorded blocker explanations consequently disappear from later requests. The global granularity answer is applied to every active task, while task age can force splitting even when jev finds a single outcome.

The installed Pi peer exposes `ReadonlySessionManager.buildContextEntries()`, `getBranch()`, and entry identities. The former supplies the active, compaction-aware conversation; the latter remains appropriate for reconstructing persisted board state. Neither requires importing a tool implementation.

## Goals / Non-Goals

**Goals:**

- Preserve the difference between global intent, recent events, and supplemental task state within one audit input.
- Let unfamiliar tools contribute through their visible messages without teaching the collector their private schema.
- Make unavailable, truncated, summarized, and redacted information explicit before deriving corrections.
- Make a correction understandable from its task, evidence source, and proposed change.

**Non-Goals:**

- Pixel-perfect reconstruction of the terminal, transient UI content absent from session records, or unbounded history export.
- Another summarizer model, retrieval service, watchdog, plugin registry, or replacement task store.
- Reading arbitrary extension memory/configuration, bulk forwarding the system prompt or skill catalog, or collecting hidden thinking.
- Hard-blocking tools or guaranteeing the primary agent obeys a steer. The extension remains advisory.
- Reworking loop cadence, unrelated configuration bugs, or upstream plugin internals.

## Decisions

### D0: Preserve engineering practice and distinguish its level of authority

The earlier `2026-09-24-task-granularity-audit` research identified four useful dimensions: age/stalled flow, completion evidence, coherent outcomes, and a concrete next action. Preserve these dimensions; do not preserve shortcuts that turned any one warning into a mandatory split. The following primary sources ground the rubric (checked 2026-09-27):

| Source | Supported principle | Application and boundary here |
| --- | --- | --- |
| [Bill Wake: INVEST in Good Stories, and SMART Tasks](https://xp123.com/invest-in-good-stories-and-smart-tasks/) | Stories use INVEST; tasks use Specific, Measurable, Achievable, Relevant, Time-boxed. Time-boxing establishes an expectation for when to seek help, not one universal duration. | Distinguish a feature/story from an engineering task. Check scope, measurable completion, feasibility, relevance, and feedback expectations. Do not require every technical TODO to be an independently marketable feature. |
| [Humanizing Work: Guide to Splitting User Stories](https://www.humanizingwork.com/the-humanizing-work-guide-to-splitting-user-stories/) | Preserve thin slices of useful behavior. Splitting by component or blindly by sequential workflow step can destroy the value boundary; some fragments should first be combined. | For feature-level items, prefer coherent behavior slices. For engineering tasks, use verifiable investigative or delivery checkpoints. Multiple files, tools, or test cases alone do not imply multiple tasks. |
| [David Allen: Next Action List versus To Do List](https://gettingthingsdone.com/2011/02/how-is-a-next-action-list-different-from-a-to-do-list/) | Clarify what the next physical, visible action is instead of leaving an unclear inventory of goals. | Ask whether the next action is known. Distinguish an unclear plan from a known action awaiting permission or an external dependency. Do not invent a literal ten-second rule. |
| [The Kanban Guide, May 2025](https://kanbanguides.org/english/) | Make work units, start/finish policies, WIP, and flow visible. Service-level expectations are contextual forecasts informed by cycle-time history. | Treat age as a signal to inspect progress, blocking, size, and help needs. Session loop age is only a local proxy, not task effort or a calibrated SLE. Thirty loops is not an industry splitting threshold. |

These are established practice references, not a claim of compliance with an ISO/IEEE task-decomposition standard. The prior [Karac, Turhan and Juristo TDD experiment](https://doi.org/10.1109/TSE.2019.2920377) concerns novice developers and task-description granularity. Bibliographic identity was verified, but the full paper was unavailable in this investigation; do not use it to assert a universal effect size, a mandatory one-test-per-task rule, or a numerical cutoff.

Apply the sources as a rubric, not an invented weighted score:

1. **Level and relevance:** What authorized goal does this item serve, and is it a feature, an execution task, or a waiting item? Infer from the conversation; do not require a new task-schema field. If the level cannot be determined, abstain rather than apply the wrong standard.
2. **Done boundary:** Is there evidence that would establish completion of that stated scope? A suite of checks can verify one result; one passing command does not prove a whole feature is done.
3. **Next action:** Is the next executable or investigative step clear? If not, request clarification. If the step is clear but needs approval or a dependency, classify the blocker rather than call the item too coarse.
4. **Feedback granularity:** Can meaningful progress, failure, or handoff be observed? A single overall goal can still need smaller verifiable checkpoints; useful ongoing progress can justify keeping a long-running item intact.
5. **Net benefit of subdivision:** Are concrete separable outcomes/checkpoints evidenced, still within scope, and not already covered by other tasks? Split only when subdivision improves verification or coordination without discarding coherent value or manufacturing bookkeeping.

Map the outcome to keep, split, clarify completion criteria, clarify the next action, blocked, or insufficient evidence. Age raises the question; it does not answer it. Preserve the old `staleAuditSpans` setting as a diagnostic trigger only.

### D1: Use one public conversation source, with global and recent views

Collect candidate effective entries using `buildContextEntries()`. Preserve entry IDs, chronological order, role/type, and tool-call IDs. Select decision-relevant evidence from that source before applying any capacity limit. Organize it into two views, not two competing summaries:

- **Recent view:** newest visible interactions through the current leaf, including the latest user instruction and latest assistant/tool exchange. Keep calls and available results associated; distinguish an absent result from a successful one. This view highlights recency; it is not a last-N-message gate that discards older effective context.
- **Global view:** applicable compaction/branch summaries and earlier retained conversation that establishes the audited work's goals, scope, constraints, decisions, acceptance criteria, or relationships. If there is no compaction summary, use the relevant original conversation rather than inventing one. This is not the entire historical transcript.

Do not independently infer which old instructions remain valid with keyword matching. Give jev chronology and source labels, instruct it to interpret later user decisions as updates to earlier plans, and identify omitted ranges. A record is serialized once; views refer to its ID when they overlap. A compaction summary is labelled as a summary, not as direct execution evidence. Abandoned branches are excluded.

**Relevance policy before capacity checks:**

- Keep the latest user instruction and complete latest interaction even when a subject-name match would miss them. Include applicable user decisions and constraints, active-task requirements, and the current board overview.
- Expand with supporting records when their conversation/call chain or explicit task/artifact references connect them to completion, current work, a blocker, a scope change, or a proposed split. Include failures, denials, and superseding instructions with the same priority as confirming evidence. Do not interpret a successful call flag alone as proof of task completion.
- Prefer the current task snapshot over replaying every identical snapshot. A historical snapshot is relevant when its change explains a decision; an identical duplicate is not new evidence. Use summaries for genuinely summarized background instead of appending both the summary and all old raw output.
- Omit clearly unrelated historical tool payloads, repeated unchanged logs, unrelated documentation dumps, and superseded duplicated data. Do not suppress the latest visible result merely because its tool is unfamiliar, and do not use tool-name allowlists or a title-similarity score as the eligibility gate.
- Preserve a compact source manifest with inclusion/omission reasons such as current interaction, applicable decision, task requirement, linked outcome, duplicate, unrelated background, unsupported content, redacted, or hard-limit truncation. Relevance exclusion is distinct from capacity loss. If relationship/coverage is genuinely uncertain, label it; do not silently assert that omitted evidence does not exist. Abstain when the decision needs that missing evidence.

Use the existing public message associations and task boundary, not a new semantic-search service or relevance model. This policy is deliberately conservative: it promises traceable selection and explicit uncertainty, not perfect automatic relevance inference. The hard limit is a ceiling, never an invitation to pad an otherwise sufficient packet.

Fallback when the effective-context API is unavailable: collect the visible branch conservatively, label the global view as unavailable/incomplete, and prohibit global-context-dependent splitting. Do not silently claim parity with the effective context or require an upstream change.

**Alternative rejected:** collect a larger raw suffix or write a new LLM summary. A suffix still loses the original goal; a second summarizer adds cost and another interpretation boundary before the audit.

### D2: Normalize public message types, not tool-specific business schemas

A small pure collector/serializer, likely `context.ts`, is sufficient. It handles Pi's public entry/message shapes:

- User and assistant visible text; assistant `content` blocks with `type: "toolCall"`, name, arguments, and ID.
- Tool-result visible content, tool name, call ID, and `isError`.
- Visible custom messages, with their producer/custom type. Prior audit messages remain visible as prior advice, not independent evidence that the advice is correct.
- Visible user shell executions, with exit/cancellation information; explicitly context-excluded shell output stays excluded.
- Applicable compaction and branch summaries, labelled separately.

Unknown tools need no registration: their names, sanitized arguments, and visible results survive unchanged in meaning whenever the complete request fits the model limit. Unknown entry types with no supported visible content are reported as omitted, not interpreted as success or inactivity. Images/binary data get an unavailable-content marker rather than raw/base64 export or invented descriptions.

Keep this collector independent of `BoardTask`, task IDs, and rpiv-todo. Use ordinary functions and a small record shape, not interfaces for hypothetical providers.

**Alternative rejected:** an allowlist of question/subagent/test tools and adapters for each result schema. It would recreate the architecture binding the user wants to avoid.

### D3: Add related supplements at the existing board boundary

Retain `getBranch()` replay for the current board and ages. Alongside compact identity/status rows, include available current task records as sanitized plain data, preserving descriptions, active forms, dependencies, owners, and metadata without requiring particular metadata keys. Avoid duplicating identical snapshots already included as conversation evidence; refer to their source IDs. Do not impose a separate per-task character cap.

Only the existing board reader knows how a persisted rpiv-todo snapshot becomes the audit target. General conversation collection works independently. A blocker in prose, an unfamiliar tool's visible result, or a task description can all be evidence; none requires a designated `blockedReason` field. The audit does not infer a remote worker's completion merely from an owner label.

Other agent-side data is included only when already exposed as relevant, persisted public session material. Do not traverse private stores or bulk-send every tool-result `details` object. The current board snapshot is the initial deliberate supplement; adding another private-state adapter is not part of this change.

**Alternative rejected:** copy only a few new TODO keys into the old summary. This would fix one omission but leave the primary conversation evidence tool-dependent and incomplete.

### D4: Respect provider hard limits, not an invented application budget

The user explicitly prioritizes context completeness over cost. Remove the last-20-fragments cutoff, the 4,000-character cap, the proposed 16,000-character replacement, fixed view-allocation ratios, and independent record/task truncation limits. The global/recent/supplement split is logical organization, not three quotas. Parse legacy `activityBudgetChars` without breaking configuration loading, but ignore its value with a one-time deprecation notice when explicitly configured.

[TypeSafe's Models documentation](https://docs.typesafe.ai/models.md), checked 2026-09-27, states that `jev-latest` currently resolves to `jev-1.13.0` with two simultaneous limits:

- `tokens(state) + tokens(all questions combined)` must fit **64k tokens per request**.
- `tokens(state) + tokens(the longest question)` must fit **32k tokens**.

These are provider limits, not application defaults. Include instructions, Choice criteria/labels, source options, and any provider-required serialization overhead in the verified counting contract. JSON character count is not a token count, and the request-wide 64k allowance does not make a 60k-token state valid. Do not presume another model, endpoint, or a future alias has the same limits.

**Chosen route (user decision, 2026-09-27):** Prefer an official tokenizer/counting contract if obtainable; otherwise use server admission as the authority for model limits. Public model/API documentation, the documented official JS SDK `v0.6.0`, and the official TypeSafe skill were checked without finding a usable official preflight counter. A public repository enumeration was rate-limited and was not bypassed, so this is not a claim that no private capability exists. No arbitrary token/character estimator will be substituted. Exact integer interpretation of the published `k` limits and server serialization accounting remain the provider's responsibility on this route.

**Provider evidence:** [`client.ts`](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/client.ts) submits System One requests (line 321) and serializes their bodies (line 362); [`types.ts`](https://github.com/typesafe-ai/typesafe-sdk-js/blob/v0.6.0/src/types.ts) exposes response token usage and a ModelCard containing name/description/release date, not a preflight counter. The [HTTP API](https://docs.typesafe.ai/api.md) documents status codes and JSON error bodies, but not a dedicated context-overflow schema. Recognize only explicit context/token-limit codes or messages on input-error responses; an unfamiliar error remains an ordinary isolated failure. Do not claim the initial request is guaranteed to fit, or that every future server error spelling will be recognized. No private transcript or synthetic inference request was sent during research.

Server-admission path:

1. Assemble evidence selected under D1, sanitize, label sources, and deduplicate. Submit the complete relevant packet without an application budget or unrelated padding. Only an accepted valid response can supply verdicts.
2. Only an explicit context/token-overflow error authorizes a smaller packet. Generic validation/HTTP 413 errors, authentication failures, quota/rate limits, and unknown failures do not authorize evidence removal.
3. Construct one recovery packet retaining the latest user decision, latest complete interaction, applicable summaries, and current task requirements/board identities. Remove optional historical evidence as complete groups and mark its sources unavailable due to the provider limit. Never silently remove tasks/questions or break a call/result group. Do not impose a character cap on protected records.
4. Rebuild evidence options for the actual retained records and ask the server again. Permit at most one context-recovery retry per audit, separately from existing transient-network retry policy. If the protected packet is unchanged or the recovery request is still too large, skip with a diagnostic rather than loop, guess a tokenizer, or progressively erase required evidence.
5. Missing evidence withholds affected actions, and any capacity reduction withholds splitting based on incomplete global context. A partial packet is never described as complete. Response token usage is observational data, not a preflight guarantee.

Apply sanitization before sending or quoting evidence. Exclude hidden thinking, raw binary/image data, private custom state, known credential fields and recognizable credential forms such as authorization headers/private keys. Do not read credential stores or configuration to enrich context. Serialization failures are isolated and disclosed, not treated as evidence of inactivity.

The official [Jev 1.13 limitations](https://docs.typesafe.ai/model-jaggedness/jev-1.13.md) warn that unrelated context can reduce accuracy. Address this through relevant source selection, clear organization, and evidence-scoped questions, not by reintroducing a lower arbitrary cap. Do not promise perfect semantic judgments merely because the input fits.

**Alternatives rejected:** larger character suffixes, constant token/character ratios, fixed percentages for recent/global context, or treating the models endpoint as a capability API it does not document.

### D5: Keep Choice, but scope answers and their evidence to the action

Keep one batched request and existing alignment, current-match, drift, board-warrant and per-task lifecycle roles. Change the evidence contract:

- Lifecycle retains `still_ongoing` as unfinished, not permission to resume. Add an explicit `actionable_now` outcome requiring evidence of an authorized next action with no unresolved user/external dependency. Blocked, future, deferred, and unclear remain distinct.
- Replace the aggregate granularity question with `task_granularity_<id>` for each active task, applying D0's rubric to that item and the shared global/recent context. Choices distinguish `appropriate`, `split_independent_outcomes`, `split_verifiable_checkpoints`, `clarify_done_criteria`, `clarify_next_action`, `blocked`, `insufficient_evidence`, and `not_applicable`. Neither having one overall goal nor having many implementation steps decides the outcome on its own.
- Obtain a source anchor for a task's proposed correction with a companion Choice over the provided record IDs plus `insufficient_evidence`. Include a corresponding work-evidence anchor for aggregate claim/drift actions. A primary source anchor is a checkable explanation, not a formal proof or a replacement for the rest of the context; all questions see the complete packed state. No split is permitted when the evidence cannot distinguish a useful smaller scope/checkpoint from arbitrary fragmentation.
- Instruct jev that tool output and quoted text are evidence, not new authority, and that old assistant assertions or prior audit messages cannot substitute for current user authorization or execution results.

Validate answer choices against the actual request options, task IDs against the current audit board, and confidence as a finite number in range. Missing/invalid evidence anchors, contradictory answers, and anchors to materially truncated required evidence do not authorize a correction. Do not add arbitrary free-form model output or a second request merely to invent a rationale.

**Alternative rejected:** keep one global granularity result and rely on a higher confidence threshold. Confidence in incomplete input does not identify which task to split or establish permission to act.

### D6: Reconcile compatible actions only, then apply an evidence-based repeat guard

Build a small per-task action set rather than concatenating unrelated sentences:

- Completed/cancelled/deferred/blocked/future verdicts cannot also produce a claim, continuation, or split for the same task in the same audit.
- A primary current-match identifies correspondence, not readiness. It cannot override a blocker, cancellation, completion, uncertainty, or a newer scope decision.
- `still_ongoing` alone does not wake a stopped agent. A terminal continuation needs the supported `actionable_now` verdict and no conflicting wait evidence.
- Waiting with an already accurate board is a no-op. A concrete missing blocker annotation can be reconciled once without instructing task execution. Where the host API only offers wake-and-steer, such a message must explicitly limit the turn to board reconciliation and returning control to the user; it must not present waiting itself as unfinished authorized execution.
- Age is diagnostic context only. A long-running task with appropriate scope and observable progress stays intact; a single overall goal can still merit verifiable checkpoints when D0's rubric and evidence support them. Unclear completion criteria or next actions lead to scoped clarification, not automatic subdivision. A completed/cancelled task is not split. Split/clarification advice by itself does not wake an agent that is waiting for a user decision.
- Low confidence or missing evidence for one task does not suppress independent supported corrections for other tasks.

Include task IDs, a concise proposed change, and sanitized supporting source excerpts in injected corrections. Keep prior audit messages identifiable so they cannot validate themselves.

Retain a small session/branch-local record of the last emitted correction per task/issue. Suppress the same instruction while its substantive evidence is unchanged. New user input, non-audit work results, or meaningful task changes allow reconsideration; a repeated stop reason, loop count, or the audit's own message is not new evidence. Board bookkeeping that merely records the requested blocker is recognized as reconciliation rather than a new need to repeat it. Ordinary assistant acknowledgments alone do not re-arm an unchanged demand. Reconstruct the latest audit marker from persisted custom messages when possible so reload does not automatically resurrect it; store the marker in the existing message details rather than a new file or database.

Before delivery, compare the board/user evidence boundary with the captured request snapshot. Discard a result invalidated by new user input, changed board state, or branch/session changes. This is a freshness guard, not a redesign of lifecycle scheduling.

**Alternative rejected:** deduplicate only by stop-kind/reason strings or add a cooldown timer. Equal reasons can describe different work; differently worded reasons can still repeat the same stale demand.

### D7: Verify at the existing request/message seams, one behavior slice at a time

Use existing Bun tests and fake ExtensionAPI/fetch seams. Fixtures use real Pi message shapes, including tool calls inside content blocks, non-message summary/custom entries, and persisted board results. Observe outbound request state and injected messages, not collector implementation details.

Acceptance slices are evidence selection/fidelity, provider-limit enforcement, global task interpretation, safe correction selection, and unchanged-evidence suppression. For each slice, first demonstrate the missing behavior, then implement and re-run the focused check. A mocked Choice answer proves local handling, not jev's semantic accuracy; keep that distinction in the report. A sanitized live-model evaluation can be proposed separately, but no API-key-dependent test is required for the default suite.

Selection checks must include counterexamples: a short later user refusal must survive a long earlier plan; an unfamiliar tool's relevant failure must survive an unrelated documentation dump; a blocker outside task metadata must still be usable; available capacity must not cause unrelated historical output to be appended.

Planning examples are ready for user review, not evidence that implementation has been accepted. Final acceptance stays with the user.

## Risks / Trade-offs

- [More conversation crosses the TypeSafe boundary] -> Restrict input to declared sources, sanitize known secrets, bound payloads, and document the increase. No heuristic can guarantee discovery of every secret embedded in arbitrary prose.
- [No usable official tokenizer was obtained] -> Use the user-approved server-admission route, acknowledge that the initial request can be rejected, and never replace it with a guessed character budget. Unknown error forms fail safely without cropping.
- [Effective context exceeds the verified provider limit] -> Reduce only at that boundary, retain source/coverage markers, reuse host summaries, and withhold conclusions requiring omitted evidence rather than adding a second summarizer.
- [Compaction summaries omit or misstate evidence] -> Label summaries and distinguish them from direct tool outcomes; do not interpret a missing fact as a negative fact.
- [Model-selected source references are semantically wrong] -> Validate their existence/completeness, reject contradictory actions, show the actual excerpts, and retain advisory-only execution. Citation validation cannot prove the model's interpretation.
- [More per-task questions increase request size] -> Keep one batched question set per attempt; use source IDs rather than transcript bodies in options, and let server admission enforce both published limits including all questions.
- [Repeat suppression hides a newly relevant issue] -> Reconsider on new user/work evidence and meaningful task changes, retain branch identity, and avoid stop-reason-only identity.
- [Visible context is not the complete UI state] -> Document the persisted-session boundary. Unrecorded dialogs/widgets and out-of-band human decisions are unavailable evidence, never inferred authorization.

## Migration Plan

1. Record the official-tokenizer search and user-approved server-admission fallback; no local counting claim is permitted without an authoritative contract.
2. Deliver context collection and serialization using existing public session/board seams, with request-fidelity checks first.
3. Update questions and verdict handling together so old aggregate granularity or missing new evidence answers cannot silently retain broad mutation behavior.
4. Add compatible-action, repeat, and freshness guards while preserving existing triggers and failure isolation.
5. Update README with the source-backed rubric, two context views, supplementation/privacy boundary, verified provider limits, ignored legacy character-budget setting, and advisory-only guarantees.
6. Run focused acceptance checks, the full existing test suite, and typecheck. Present supported scenarios and limitations for review before enabling any live-model evaluation.
7. Rollback can disable the extension using existing configuration; no TODO snapshot migration or upstream plugin change is required. Avoid reverting only the questions while leaving a more permissive verdict path active.
