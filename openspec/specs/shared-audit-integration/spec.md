# shared-audit-integration Specification

## Purpose
Integrate advisory TODO auditing with the shared judgment service while retaining audit-specific evidence, scheduling and task-authority safety under the stateless version-two contract.

## Requirements

### Requirement: Service-owned judgments
Audit SHALL obtain judgments only through the discovered shared-service `judge()` entry advertised with `version: 2`. It SHALL NOT resolve audit-specific credentials, dispatch direct HTTP, choose backend/model, maintain an independent judgment cache or own capacity/retry traversal. Audit SHALL retain business question construction, allowed evidence projection, scheduling, business receipts, source checks and deterministic advice policy.

#### Scenario: Consumer loads first
- **WHEN** audit loads before the service and the service later becomes available
- **THEN** a subsequent eligible audit discovers it without reloading audit or bypassing ordinary scheduling

#### Scenario: No compatible service
- **WHEN** the service is absent, advertises version one, or lacks the `judge()` entry
- **THEN** automatic audit skips inference and advice with a bounded notice, manual audit reports the missing or incompatible dependency, TODO/main-agent work continues, and the next eligible trigger checks again

#### Scenario: Mixed-version pair
- **WHEN** either side of an audit/service pair requires a different service version
- **THEN** audit skips inference/advice with its normal dependency notice, preserves TODO/main-agent work and checks again on a later eligible trigger, without an automatic downgrade or fake review adapter

### Requirement: Preserve predecessor audit guarantees
The integration SHALL retain all unaffected requirements from the main audit specification and both completed predecessor changes `prevent-audit-request-amplification` and `improve-audit-context-fidelity`. Those changes SHALL remain unmodified and unarchived. In particular, process ownership, every trigger path, current-input freshness, task-long scopes, source-backed factual continuity, candidate bounds, independent valid findings and partial completed ranges SHALL not be weakened by changing transport ownership.

#### Scenario: Suppressed child reaches every trigger
- **WHEN** a child inherits another process's audit owner marker
- **THEN** it performs zero service lookups leading to inference, credential lookups, manual-command registrations, injected advice and audit ledger writes

#### Scenario: Required factual source was processed earlier
- **WHEN** current work still depends on an earlier report or user decision after its range completed
- **THEN** its source-labelled facts remain available or the affected finding remains explicitly uncertain; a remembered opinion does not substitute for them

#### Scenario: Choice candidate boundary
- **WHEN** a required Choice has 255 substantive candidates plus an uncertainty option
- **THEN** it is locally withheld with zero provider attempts, the affected scope remains incomplete, and no source/task is silently removed to fit

### Requirement: Durable progress is not final advice
Audit SHALL advance its processing receipt only from acknowledged writes of its own durable judgment state after valid required answers. Incomplete, failed, cancelled or stale judgments SHALL not issue definitive completion/split/continuation advice. Independently completed scopes and valid partial answers SHALL survive later failures and reloads under audit's existing persistence. A receipt SHALL not imply factual completeness or permission to execute.

#### Scenario: Later stage fails and process reloads
- **WHEN** earlier complete segments are committed and a later judgment fails, then ordinary audit resumes on the same branch
- **THEN** earlier consumer progress remains, only unresolved work reaches the provider and no incomplete result becomes definitive advice

#### Scenario: New user decision while review runs
- **WHEN** a later user decision changes captured inputs before delivery
- **THEN** no stale correction is injected, and old results cannot overwrite the new branch/input state

#### Scenario: Full review
- **WHEN** the user invokes full review
- **THEN** audit resets/reassesses its own scope state using its existing business-state mechanism, uses the same permitted macro evidence, and successful completion supplies the ordinary baseline without replaying excluded tool bodies

### Requirement: Service-filtered business choices
Audit SHALL supply native numerical policy to the service and consume only its accepted final answers for corrective advice. It SHALL NOT compare the compatibility confidence/probability values of LLM answers. Native dropped answers, missing evidence and incomplete scopes SHALL remain unavailable for the corresponding action; independently supported actions remain eligible. Existing deterministic lifecycle and wait-state rules SHALL apply to both backends.

#### Scenario: Native threshold changes on cached judgment
- **WHEN** a previously judged answer would be reconsidered under a stricter threshold
- **THEN** the stateless service runs new inference and applies the new rule to that new result rather than re-filtering a stored answer; audit's own threshold-identity rules govern whether its stored business state remains usable for advice

#### Scenario: LLM selects a blocked outcome
- **WHEN** the LLM chooses blocked at a configured threshold of 0.99
- **THEN** audit respects the discrete blocked choice without a numeric re-gate or automatic continuation

### Requirement: Diagnostics report actual scoped results
Audit SHALL report compact observations that reflect what the version-two service actually returned: segment/scope progress, response backend and model identity, confirmed context overflow and failure dispositions, and optional provider-reported usage with its stated reporting scope. Absent usage SHALL remain unknown, never zero, and a scoped result usage SHALL NOT be presented as complete-operation billing. Logical judgment/question counts SHALL NOT be renamed as measured HTTP-attempt counts. Historical business progress and audit ledger entries SHALL remain readable as history without being promoted to current runtime authority, and no diagnostic SHALL include transcript bodies, credentials or raw provider extras.

#### Scenario: Missing usage stays unknown
- **WHEN** a terminal judgment carries no usage fields
- **THEN** diagnostics omit a charge/token claim for that call instead of reporting zero or inventing totals

#### Scenario: Fallback result reports the terminal model
- **WHEN** a judgment succeeds through an automatic alternate
- **THEN** diagnostics identify the actual answering backend/model and any usage names its scope, without claiming coverage of the failed primary's work

#### Scenario: Session contains old service records
- **WHEN** a session contains historical `llm-as-jev-ledger` entries or earlier audit records
- **THEN** the upgrade leaves them intact as history and does not restore pending calls, checkpoints or execution authority from them
