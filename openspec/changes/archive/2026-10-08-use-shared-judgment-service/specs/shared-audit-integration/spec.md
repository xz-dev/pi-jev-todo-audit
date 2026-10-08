## Purpose

Integrate advisory TODO auditing with the shared judgment service while retaining audit-specific evidence, recovery receipts, scheduling and task-authority safety.

## ADDED Requirements

### Requirement: Service-owned judgments
Audit SHALL obtain judgments only through the discovered resumable shared-service API. It SHALL NOT resolve audit-specific credentials, dispatch direct HTTP, choose backend/model, maintain an independent judgment cache or own capacity/retry traversal. Audit SHALL retain business question construction, allowed evidence projection, scheduling, business receipts, source checks and deterministic advice policy.

#### Scenario: Consumer loads first
- **WHEN** audit loads before the service and the service later becomes available
- **THEN** a subsequent eligible audit discovers it without reloading audit or bypassing ordinary scheduling

#### Scenario: No compatible service
- **WHEN** the service is absent or lacks the review extension
- **THEN** automatic audit skips inference and advice with a bounded notice, manual audit reports the missing dependency, TODO/main-agent work continues, and the next eligible trigger checks again

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
Audit SHALL advance its processing receipt only from verifiable durable service checkpoints with valid required answers. Incomplete, failed, cancelled or stale reviews SHALL not issue definitive completion/split/continuation advice. Compatible completed stages and valid partial answers SHALL survive later failures and reloads. A receipt SHALL not imply factual completeness or permission to execute.

#### Scenario: Later stage fails and process reloads
- **WHEN** stages 1 and 2 are committed and stage 3 fails, then ordinary audit resumes on the same branch
- **THEN** only unresolved work reaches the provider and no intermediate completion advice was injected

#### Scenario: New user decision while review runs
- **WHEN** a later user decision changes captured inputs before delivery
- **THEN** no stale correction is injected, and old results cannot overwrite the new branch/input state

#### Scenario: Full review
- **WHEN** the user invokes full review
- **THEN** audit creates a new fresh-review identity, uses the same permitted macro evidence and shared recovery, and successful completion supplies the ordinary baseline without replaying excluded tool bodies

### Requirement: Service-filtered business choices
Audit SHALL supply native numerical policy to the service and consume only its accepted final answers for corrective advice. It SHALL NOT compare the compatibility confidence/probability values of LLM answers. Native dropped answers, missing evidence and incomplete scopes SHALL remain unavailable for the corresponding action; independently supported actions remain eligible. Existing deterministic lifecycle and wait-state rules SHALL apply to both backends.

#### Scenario: Native threshold changes on cached judgment
- **WHEN** a stored confidence 0.7 is reviewed under threshold 0.8
- **THEN** the service drops it without inference and audit does not act on that answer

#### Scenario: LLM selects a blocked outcome
- **WHEN** the LLM chooses blocked at a configured threshold of 0.99
- **THEN** audit respects the discrete blocked choice without a numeric re-gate or automatic continuation

### Requirement: Observations retain provenance
Audit SHALL display actual attempt observations and durable stage progress from the service, not derive request counts from question sends. Known token/charge sums and missing-field counts SHALL remain visible; catalog estimates SHALL not be described as provider billing. Cache hits and joined work SHALL not double-charge attempts. Stale/aborted work remains accounting data only, and no diagnostic SHALL include transcript bodies, credentials or raw provider extras.

#### Scenario: Malformed response with usage
- **WHEN** an attempt returns malformed answers with reported input tokens and no output tokens
- **THEN** its input remains included and its missing output counted, without claiming final judgment success

#### Scenario: Service cache hit
- **WHEN** the same complete review is reused
- **THEN** audit shows zero new attempts and does not add the original cost or tokens again
