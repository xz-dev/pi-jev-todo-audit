## 1. Confirm implementation prerequisites and acceptance

- [x] 1.1 Verify published model limits and seek an authoritative official tokenizer/counting method; if none is obtained, record the user-approved server-admission fallback and its limits in `design.md`. Verified public docs, official JS SDK v0.6.0 and official skill; no usable counter obtained, no private/API inference probe sent. Server enforces both published limits; exact local preflight is not claimed.
- [x] 1.2 Review the source-backed rubric and delta scenarios with the user before changing behavior, distinguishing accepted requirements from unverified provider capabilities. User confirmed the engineering rubric, relevance-before-capacity, no arbitrary budget, explicit apply request, and tokenizer-first/server-admission-fallback route; product acceptance remains pending until delivery.

## 2. Deliver a faithful recent and global evidence view

- [x] 2.1 Replace the assistant/user-only digest with public Pi message/entry collection and source/call-result identities, reusing effective branch/compaction context. First show the existing request omits a real-shaped tool call/result or summary, then verify the corrected outbound request includes it without hidden thinking or abandoned-branch content.
- [x] 2.2 Add current task records as a separate supplement without coupling general collection to rpiv-todo or private tool schemas. Verify request fixtures retain description-based blockers, acceptance conditions, owners, dependencies, and nonstandard metadata while an unfamiliar tool's relevant visible result works without an adapter.
- [x] 2.3 Apply the D1 relevance policy and deduplicate records without semantic cherry-picking. Verify that a later user refusal and relevant failure survive a long earlier plan, unrelated historical documentation/repeated logs stay excluded even with spare capacity, and uncertain/unsupported evidence has an explicit coverage marker.

## 3. Enforce only verified provider hard limits

- [x] 3.1 Implement the authorized server-admission path for the complete state/question request, without an invented local token estimator. Verify conservative recognition of explicit context/token-overflow input errors and rejection of generic validation, payload-size, authentication, quota, rate-limit, and unfamiliar errors as cropping triggers; mocked cases do not establish every live provider error spelling.
- [x] 3.2 Remove last-N-text and application character-budget truncation; keep explicit legacy `activityBudgetChars` loadable but ignored with one deprecation notice. Verify relevant provider-compliant evidence beyond twenty fragments/4,000 characters remains present, no fixed section quotas are introduced, and trusted/untrusted config layering is unchanged.
- [x] 3.3 On explicit overflow only, construct one recovery packet preserving decisive user/interaction evidence, complete call/result groups, applicable summaries, and current task requirements; rebuild source options and disclose removals. Verify no second context retry, no retry when nothing optional can be removed, no split after global evidence loss, and an isolated diagnostic if the protected packet is still rejected.
- [x] 3.4 Apply outbound sanitization and unsupported-content handling before sending or quoting evidence. Verify known credentials, private state, thinking, and raw binary/image payloads are not exported, while redaction/serialization gaps cannot masquerade as successful work or authorization.

## 4. Ground task decisions in engineering criteria

- [x] 4.1 Replace aggregate granularity with per-active-task assessments using D0's rubric and explicit keep/split-outcomes/split-checkpoints/clarify-criteria/clarify-next-action/blocked/insufficient outcomes. Verify independent questions and evidence for parallel tasks; update existing tests that encode global worst-offender splitting instead of retaining those expectations.
- [x] 4.2 Separate unfinished lifecycle state from `actionable_now`, add checkable source anchors for corrective decisions, and validate returned options/task references/confidence against the request. Verify missing, unknown, truncated-required, or contradictory evidence cannot authorize a correction, and uncertainty about one task does not suppress an independently supported sibling correction.
- [x] 4.3 Implement scoped granularity action selection with age as diagnostic evidence only. Verify counterexamples: a multi-file vertical slice is not mechanically split; one large goal can merit verifiable checkpoints; a long-running task with useful progress stays intact; ambiguous criteria/next action invite clarification; existing task coverage prevents duplicate subdivisions. These tests verify local handling of supplied judgments, not the live model's reasoning quality.

## 5. Keep lifecycle corrections compatible and non-repeating

- [x] 5.1 Reconcile actions per task before rendering messages so current-match cannot override blocked/completed/cancelled/deferred/future state, and stale/split findings cannot contradict lifecycle. Verify blocked-plus-match, completed-plus-split, low-confidence aggregate with valid lifecycle, and mixed parallel-task cases at the injected-message boundary.
- [x] 5.2 Restrict terminal wakeups to supported actionable work or a concrete missing board reconciliation; waiting accurately recorded is silent and split/clarification alone never resumes a waiting agent. Verify unchanged waiting stays idle and any one-time bookkeeping correction explicitly returns control without execution authority.
- [x] 5.3 Suppress repeated corrections for unchanged task/issue evidence using existing session/custom-message persistence, and reject responses invalidated by newer user/board/branch state. Verify repeated/reworded stop reasons, assistant acknowledgments, recorded blocker completion, reload, a new user decision with the same stop reason, and user scope changes while the request is in flight.

## 6. Document and verify the complete behavior

- [x] 6.1 Update README with source-backed granularity criteria, relevance selection and two context views, supplement/privacy boundaries, verified provider limits, legacy-budget deprecation, and advisory-only limitations. Verify documentation against the actual request/delivery code and keep server-admission and counting limitations tied to the evidence from 1.1.
- [x] 6.2 Run the focused acceptance checks, `bun test`, `npm run typecheck`, and strict OpenSpec validation; verify that periodic cooldown/manual/optional terminal triggers, failure isolation, and config precedence remain intact. Record relevant red/green evidence and any unexecuted live-model checks without treating mocked decisions as semantic accuracy proof.
- [ ] 6.3 Present the acceptance evidence and remaining limits for user review. Verify that context fidelity, engineering decisions, wait/no-repeat cases, and provider-limit admission each have an observable demonstration; do not enable live-model replay, publish, or declare product acceptance without the appropriate user decision. Evidence is recorded below; final user acceptance is pending.

## Verification record — 2026-09-27

Final automated checks after the scoped partial-context readiness correction:

- `bun test`: **154 passed, 0 failed**, across 8 files.
- `npm run typecheck`: passed.
- `git diff --check`: passed.
- `openspec validate ground-audits-in-visible-context --strict`: passed.

| Acceptance area | Observable evidence |
| --- | --- |
| Recent/global/task fidelity | `test/context.test.ts` and the captured-request tests in `test/index.test.ts`: public calls/results, summaries, task metadata, later refusal, latest custom notification, no abandoned/raw pre-compaction payload; 35 relevant fragments exceeding 16,000 characters survive intact. |
| Relevance and privacy | Earlier failure without a task number/path survives its retained request chain; unrelated historical docs and duplicate call/result groups are omitted. Quoted JSON/log credentials, known opaque API key, hidden thinking and typed binary/image data are excluded; gaps are explicit. |
| Engineering decisions | `test/verdict.test.ts` and rubric/request assertions in `test/limits.test.ts`: per-task scope, checkpoints versus independent outcomes, clarify versus split, independent uncertainty, no age-only/global worst-offender split. Supplied judgments are mocked, not live model conclusions. |
| Provider admission | `test/limits.test.ts`: explicit state/request overflow gets at most one recovery with rebuilt source options; generic 422, authentication, quota/rate, payload-size and unknown errors do not crop. Protected-only packets and repeated overflow fail without further reduction. No local tokenizer fit claim. |
| Waiting and freshness | `test/index.test.ts`: board-only reconciliation, accurate waiting silence, actionable-now execution, persisted reload suppression, reworded stops, acknowledgments, recorded blocker updates, and user/board/tree/shutdown invalidation. A fresh queued stop survives cancellation of an older audit. |
| Scoped missing evidence | Optional history loss does not veto an independently supported current next action; missing required authorization does. Global context loss still prevents subdivision. |

Observed red-to-green regressions included the original missing-context and blocked/match/split contradictions, loss of an unnamed earlier failure, quota-as-overflow misclassification, malformed inherited answer keys suppressing valid siblings, cancellation swallowing a newer stop, bookkeeping changing the selected-context hash and rearming a blocker, quoted-credential leakage, and omission of the latest unreferenced custom notification.

A temporary `/tmp` ENOSPC failure affected eight configuration tests; the user cleared space and all tests subsequently passed. No failure was counted as a pass. Final tests use synthetic session entries and mocked provider replies. No additional live jev semantic evaluation, private transcript replay, publishing, installation or runtime reload was performed. Existing loaded instances may still emit old behavior. Citation existence/completeness checks cannot prove semantic support, and heuristic selection/redaction is not a guarantee of perfect relevance or secret detection. These limits remain part of the user acceptance decision.
