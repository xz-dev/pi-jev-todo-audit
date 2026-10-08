## Purpose

Reuse finite business judgments from the audit session JSONL while shared Jev execution owns backend selection, capacity, timeout and cancellation rather than business history.

## ADDED Requirements

### Requirement: Audit discovers the actual execution contract
Audit SHALL discover the canonical shared review API at the actual judgment boundary and require its consumer-cache and business-stage capabilities when using those features. It SHALL preserve legacy service clients without pretending that an old `reviewVersion: 1` handle supports newly added callbacks. Missing required capability SHALL produce bounded automatic diagnostics or an explicit manual diagnostic without paid readiness probes, direct HTTP, a competing service instance or silent checkpoint-coupled fallback.

#### Scenario: Service loads later
- **WHEN** a compatible service becomes available after audit activation
- **THEN** the next eligible trigger can use it without an audit reload or an inference-based probe

#### Scenario: Old service lacks consumer-cache support
- **WHEN** an available service lacks the canonical external-result-cache contract
- **THEN** audit reports that limitation and does not claim independent session-cache reuse or silently substitute service checkpoint persistence

### Requirement: Only actual historical events are business evidence
Audit SHALL project permitted actual user/assistant dialogue, public reports, macro tool-call/result events and derived TODO state. Ambient AGENTS/system prompts, tool-definition lists and unrelated request scaffolding SHALL NOT be evidence or part of business freshness. Judgment rules and actual execution identity SHALL remain compatibility inputs, distinct from historical evidence. Own eval/progress/diagnostic entries SHALL be excluded from evidence and input revision.

The existing privacy and source boundary SHALL remain: no hidden thinking, raw ordinary tool bodies, shell bodies or credentials. Genuine historical mentions SHALL not be deleted merely because their text includes a prompt-file or tool name. Available labelled host summaries SHALL not be presented as original execution proof.

#### Scenario: Nonhistorical context changes
- **WHEN** the actual permitted event history, question and business state are unchanged but ambient prompt files or tool definitions differ
- **THEN** audit's business input remains unchanged; it does not send those ambient values as evidence

#### Scenario: Cache append is bookkeeping
- **WHEN** audit appends a successful evaluation record to its session JSONL
- **THEN** that record does not become new work, new permission or a freshness change that invalidates its own cache

### Requirement: Business questions own factual and accumulation semantics
Audit SHALL define its finite question meanings, required factual/source obligations and safe cumulative rules. It SHALL supply the stage/projection function consumed by the shared service. It SHALL NOT require generated summaries, an extra model or LLM-only result fields. Processing coverage or an unchanged judgment label SHALL NOT establish that original facts are dispensable.

Undeclared or unsupported dependencies SHALL retain/reconstruct required originals or withhold the affected scope. Authored compact accounts remain optional reported material, not a substitute for source/authority requirements. Consumer declarations SHALL not silently narrow lifecycle acceptance, first-active trajectory or primary-source eligibility.

#### Scenario: Same question needs an older fact
- **WHEN** XML and CSV goal histories produced identical earlier judgments and the same later report proves XML-only success
- **THEN** audit's declared source obligations retain the distinguishing goal or yield uncertainty; cached labels do not make both histories equivalent

#### Scenario: No safe accumulation rule
- **WHEN** a question has no supported rule for replacing historical evidence with earlier judgments
- **THEN** audit keeps the required evidence or marks that scope incomplete, rather than silently retiring reports to satisfy a byte target

### Requirement: Exact reusable answers belong to the consumer session
Audit SHALL store versioned validated raw judgment results under service-computed exact evaluation keys using Pi session JSONL custom entries. Keys SHALL be determined after actual backend selection and effective input projection; matching only a question id, configured model name or a whole-session cursor SHALL be insufficient. Restored results SHALL be validated by the service and rechecked against current acceptance policy. No service checkpoint or service ledger SHALL be required to restore the new consumer cache.

Records SHALL contain only the declared answer/cache/progress data, not ambient prompts, credentials or a copied full transcript. Replay SHALL be from the active branch only. Legacy evaluation/receipt formats SHALL not silently become the new cache format. Malformed or unknown versions SHALL be ignored without suppressing current work.

#### Scenario: Reload with a new service instance
- **WHEN** a finite judgment was durably stored in audit's session, audit reloads, and a service instance with no old service ledger evaluates the identical effective input
- **THEN** the service obtains the validated answer from audit's cache with zero provider attempts

#### Scenario: Effective judgment changes
- **WHEN** the actual judgment identity, question meaning or a necessary input fact changes
- **THEN** the old exact evaluation is not reused as the answer to the changed judgment

### Requirement: Durability and currentness guard progress
A cache store SHALL acknowledge durability only after a successful append in the captured active session/branch. Failed persistence SHALL not advance durable business progress. Completed-stage receipts SHALL refer to their required valid evaluations and verifiable source coverage. A stale operation SHALL not publish new cache entries, progress or final advice into another generation. A valid current answer and acknowledged durable progress SHALL remain distinct.

#### Scenario: Store fails
- **WHEN** session append throws or persistence is unavailable
- **THEN** the cache store reports failure and reload cannot treat the answer or business frontier as durably saved

#### Scenario: Captured branch becomes stale
- **WHEN** a branch/session change invalidates a captured audit before cache storage or delivery
- **THEN** the late operation cannot advance the new branch's cache/frontier or issue advice

### Requirement: Business stages do not require service checkpoint repair
Audit SHALL own the stable finite business-stage plan, cumulative results, explicit full-review intent and session progress. The service SHALL execute the supplied stage contract under one admitted execution identity and applicable logical-call timeout. Existing `projectStage` projection and `onProgress` observation SHALL not be represented as independent external-cache restoration or caller-selected batching unless the canonical API actually supports those semantics.

Audit SHALL not repeatedly submit an incompatible historical service seed. A changed identity or invalid business receipt SHALL cause compatible reuse or at most one eligible baseline rebuild from permitted evidence. Intermediate stage success SHALL not become whole-audit completion.

#### Scenario: Native history followed by another judgment model
- **WHEN** an old session resumes under an incompatible actual judgment identity
- **THEN** audit misses incompatible cached work and rebuilds the necessary business baseline without repeated invalid-service-checkpoint failures or hidden model fallback

#### Scenario: Full review retry
- **WHEN** an explicit full review persists early stages and fails later
- **THEN** its consumer-owned retry intent can resume acknowledged compatible work, while a later full request after completion starts a new reassessment

### Requirement: Audit passes one backend-neutral timeout
Audit SHALL retain and pass its configured `timeoutMs` plus cancellation signal. The service SHALL interpret that value as LLM streaming inactivity or native Jev whole logical-call deadline based on the actual backend. Audit SHALL not select the mode, silently ignore the setting or impose an additional LLM review-total countdown.

#### Scenario: Healthy LLM outlasts the numerical total
- **WHEN** LLM execution remains active with gaps below the supplied timeout and takes longer overall than that number
- **THEN** audit may receive a current valid result without cancelling solely for total elapsed duration

#### Scenario: Native review spans internal stages
- **WHEN** native Jev work spans several internal stages
- **THEN** its whole-call budget is not restarted for every stage

### Requirement: Final advice retains business authority checks
Only current supported final scopes SHALL enter audit's existing source/authority and deduplication checks. Cached judgments and processing completion SHALL not authorize task execution, TODO mutation or cancellation. Assistant completion remains reported rather than independently verified. Unresolved scopes SHALL stay uncertain without hiding independently supported findings. Real attempt accounting SHALL preserve unknown usage and distinguish cache reuse, provider success and durable completion.

#### Scenario: Permission is withdrawn
- **WHEN** a later user decision requires waiting after an earlier actionable cached judgment
- **THEN** audit does not wake execution based on the old opinion

#### Scenario: Joint acceptance
- **WHEN** both candidate repositories run the agreed old-session recovery, business-cache reload, business-stage and long-stream trace through actual public seams with controlled transport
- **THEN** they demonstrate the combined behavior, including factual controls and native deadlines, rather than treating a mocked success, HTTP 200 or exact-repeat-only cache hit as full completion
