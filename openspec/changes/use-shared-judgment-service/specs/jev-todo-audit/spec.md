## MODIFIED Requirements

### Requirement: Configuration

The extension SHALL retain configurable audit interval (default 10), user-message cooldown (default 10), native confidence threshold (default 0.5), enable/disable switch, notifications, timeout and `staleAuditSpans` (default 3). The age threshold SHALL control diagnostic review, not an unconditional splitting rule. Backend/model selection and capacity configuration SHALL belong to the shared judgment service; provider endpoints and credentials SHALL belong to Pi.

The deprecated `activityBudgetChars` field SHALL remain load-compatible but SHALL NOT constrain evidence below verified provider hard limits. An explicitly configured legacy value SHALL produce a one-time deprecation notice instead of silently restoring a character budget. No replacement cost-saving character cap, fixed record count, or context-allocation ratio SHALL be imposed.

Configuration SHALL retain its layered precedence: built-in defaults, global user configuration at `<PI_CODING_AGENT_DIR>/jev-todo-audit.json` (default `~/.pi/agent/jev-todo-audit.json`), then trusted-project configuration at `<cwd>/.pi/jev-todo-audit.json`. Project configuration SHALL be read only when the project is trusted.

Legacy `model`, `apiUrl`, `apiKey`, `apiKeyEnvVar` and `contextLimits` fields SHALL remain load-compatible but SHALL NOT select a backend, endpoint, credential or capacity limit. Explicit presence in a read configuration layer SHALL produce a bounded migration notice naming deprecated fields, without their values. The extension SHALL NOT resolve, copy, transmit or automatically migrate those secrets, alter shared configuration, or retain a direct-HTTP fallback. Defaults that formerly supplied these fields SHALL NOT themselves produce a notice. Known legacy secret values SHALL remain excluded from outgoing evidence and diagnostics even though they are no longer used for authentication.

The service SHALL use Pi's own authentication and credential behavior. When the service is missing, incompatible or has no usable configured backend, the audit SHALL fail in isolation with an actionable dependency/configuration diagnostic, not consult legacy credential fallbacks. Suppressed children SHALL remain inert before configuration notices and credential work. Missing or malformed configuration SHALL fall back safely without failing extension load. The default cooldown SHALL remain one normal default audit cycle and explicit overrides SHALL remain independent of interval.

#### Scenario: Defaults apply when unconfigured
- **WHEN** the extension loads without configuration
- **THEN** interval 10, cooldown 10, native threshold 0.5 and age-review threshold 3 apply, without an application character cap, and the service selects the model

#### Scenario: Legacy budget configuration remains loadable
- **WHEN** an existing configuration contains `activityBudgetChars: 4000`
- **THEN** it loads with a one-time deprecation notice and does not truncate otherwise relevant, provider-compliant evidence at 4,000 characters

#### Scenario: Project override applies when trusted
- **WHEN** a trusted project's configuration sets `interval: 5`
- **THEN** the audit interval is five loops

#### Scenario: Project override ignored when untrusted
- **WHEN** an untrusted project contains audit configuration
- **THEN** that file is not read and global/default configuration applies

#### Scenario: Project cannot inject apiKey
- **WHEN** project configuration contains an API key and Pi has none
- **THEN** the project value is not used as a credential or copied into Pi

#### Scenario: Pi key wins for TypeSafe direct
- **WHEN** the shared service selects TypeSafe direct, Pi resolves its key, and the global audit config also has `apiKey`
- **THEN** Pi's credential is used and a bounded notice explains that the legacy audit field is ignored

#### Scenario: Pi key used for OpenRouter
- **WHEN** the shared service selects an OpenRouter classifier and the user signed in to `openrouter` through Pi
- **THEN** classification authenticates through Pi rather than audit's old endpoint mapping

#### Scenario: Fallback key with migration warning
- **WHEN** Pi has no usable credential and the global audit config has `apiKey`
- **THEN** audit does not use that fallback, reports the required Pi configuration and reveals no key value

#### Scenario: Provider not registered in this Pi
- **WHEN** legacy audit configuration names TypeSafe but Pi has no usable matching provider
- **THEN** those old settings do not create a provider or direct request, and only shared-service selection determines availability

#### Scenario: Custom endpoint uses extension config only
- **WHEN** an old config contains a custom `apiUrl` and `apiKey`
- **THEN** neither controls dispatch, a migration notice directs endpoint/auth configuration to Pi, and no files are rewritten automatically

#### Scenario: Pi lookup failure degrades to fallback
- **WHEN** Pi's key lookup fails during shared-service evaluation
- **THEN** audit receives an isolated service failure without reviving its former fallback path or changing backend after dispatch

#### Scenario: No key anywhere
- **WHEN** the shared service cannot resolve credentials for a required backend
- **THEN** audit reports the service/Pi configuration failure and does not inject a correction or create an uncontrolled retry loop

#### Scenario: Cooldown can be overridden
- **WHEN** trusted configuration explicitly changes cooldown
- **THEN** the override is honored without changing the default elsewhere

#### Scenario: Disabled extension is inert
- **WHEN** the extension is disabled
- **THEN** periodic and terminal-stop auditing remain inactive and no counter state is maintained

### Requirement: Verdict handling and corrective injection

When work is aligned, the extension SHALL take no conversational action unless a separate supported, accepted task-specific finding requires correction. When work is misaligned, it SHALL inject only the supported corrective steps: reconcile affected tasks, claim authorized current work, or request return from evidenced drift. Corrections SHALL remain custom messages delivered through the existing steer path and SHALL identify affected task IDs and sanitized source evidence.

For native classifiers, the shared judgment service SHALL gate each used decision independently using the configured threshold (default 0.5). Audit SHALL supply this policy and consume the service's accepted final view rather than repeating numerical gates. For LLM judgments the service SHALL ignore numerical thresholds and audit SHALL consume the discrete business choice, never using compatibility confidence/probability encodings as numerical evidence. Accepted choices SHALL NOT substitute for required evidence. Missing, unclear, contradictory, or native-policy-dropped evidence SHALL withhold that action and yield at most an uncertainty notification under the repeat-suppression rule; it SHALL NOT suppress supported actions for unrelated tasks.

Parallel `in_progress` tasks SHALL remain valid unless specific evidence identifies a mismatch. Completed tasks SHALL be individually marked completed, cancelled tasks individually deleted, and deliberately deferred tasks returned to a pending/deferred representation with the reason recorded. Blocked tasks SHALL be reconciled only when the board lacks the relevant blocker representation. Tasks already accurately represented as blocked, deferred, or future work SHALL not be blindly resumed or repeatedly reconciled.

An ongoing verdict SHALL leave the task ongoing and SHALL NOT itself authorize a terminal restart. Terminal continuation SHALL require an explicit, supported, service-accepted actionable-now verdict establishing work that can proceed within authorization and without unresolved input or dependencies. A current-match result SHALL NOT override lifecycle, blockers, uncertainty, or a newer user decision. The same task SHALL NOT receive contradictory complete/delete/park and claim/continue/split instructions in one correction.

For `no_in_progress_task`, board warrant SHALL gate claim/create steps: trivial or idle activity produces no claim; warranted authorized activity can produce a claim; insufficient acceptance/evidence produces notification. Independently supported lifecycle reconciliation remains possible without inventing aggregate alignment or active work. Missing alignment SHALL not prevent an independently supported task-specific correction.

The extension SHALL assess granularity under the engineering-grounded requirement. Age beyond `staleAuditSpans × interval` (default more than 3 × interval loops) SHALL be a review signal only. Splitting SHALL require a supported per-task need for separable outcomes or verifiable checkpoints, sufficient relevant global evidence, and no conflicting lifecycle or wait condition. Unclear completion criteria or next actions SHALL produce scoped clarification rather than forced splitting. Splitting or clarification advice alone SHALL NOT wake an agent waiting for a user decision.

When a terminal-stop check finds unfinished tasks, their existence SHALL NOT by itself authorize continuation. A concrete board mismatch can be reconciled once without authorizing task execution; a terminal reconciliation message SHALL explicitly limit any new turn to that bookkeeping and returning control when the blocker remains. Human aborts SHALL not be treated as autonomous terminal stops, and periodic audits SHALL not depend on the watchdog producer.

Audit failures SHALL remain isolated. Network errors, timeouts, malformed answers, context-limit/accounting failures, and semantic-hook consumer errors SHALL not abort or corrupt the agent loop or create uncontrolled retries. TODO state SHALL be read only from persisted session data; the extension SHALL not call rpiv-todo internals or directly mutate the board. The optional neutral hook SHALL not introduce a direct watchdog dependency.

#### Scenario: Aligned verdict is silent
- **WHEN** work is aligned and no supported task-specific correction applies
- **THEN** no conversational correction is injected

#### Scenario: Misaligned verdict injects correction
- **WHEN** supported evidence shows one task completed and current authorized work unclaimed
- **THEN** the correction names only the affected tasks and justified updates, with source evidence, at the next turn boundary

#### Scenario: No in_progress task while agent works
- **WHEN** substantive authorized work is warranted, no task is active, and a valid match is actionable
- **THEN** the correction requests claiming that task or creating the missing task without overriding blockers

#### Scenario: Empty board and work is trivial or idle
- **WHEN** the board is empty and the warranted assessment is trivial or idle
- **THEN** no task-creation correction or uncertainty notification is generated solely for the empty board

#### Scenario: All-done board and work is trivial or idle
- **WHEN** no task is active and work is trivial or idle with no independent lifecycle mismatch
- **THEN** the audit remains silent

#### Scenario: Empty board and work is warranted
- **WHEN** supported evidence identifies substantive authorized current work not represented by any task
- **THEN** an eligible periodic or manual correction requests creating and claiming that work

#### Scenario: Warrant answer low confidence
- **WHEN** the native board-warrant answer is dropped by the service's confidence policy
- **THEN** no claim/create step depends on it and any uncertainty notice follows repeat suppression

#### Scenario: Drift verdict orders return to board
- **WHEN** supported evidence shows off-plan work and an authorized actionable board task to resume
- **THEN** a correction requests stopping the off-plan activity and returning to that work, without treating an older board plan as superior to newer user instructions

#### Scenario: Low confidence defers to the user
- **WHEN** an aggregate alignment decision is uncertain or dropped by native policy
- **THEN** it contributes no corrective step, while independent supported task corrections remain possible

#### Scenario: Stale in_progress task gets split nudge
- **WHEN** #4 exceeds the age-review threshold and independent, service-accepted task-specific evidence supports splitting its authorized outcomes or checkpoints
- **THEN** the correction requests splitting #4 and cites that evidence, not age alone

#### Scenario: Stale in_progress task does not automatically split
- **WHEN** #4 exceeds the age-review threshold but no supported granularity problem is identified
- **THEN** the audit adds no split instruction on age alone

#### Scenario: Granularity verdict bundles outcomes
- **WHEN** #5 has supported separable outcomes or verifiable checkpoints and #7 has appropriate granularity
- **THEN** the split instruction names #5 only and includes its supporting evidence

#### Scenario: Granularity answer not applicable
- **WHEN** a task's granularity is appropriate or not applicable
- **THEN** no split instruction is added for it

#### Scenario: Parallel task correction is scoped
- **WHEN** #5 is supported as completed and #7 remains ongoing during periodic work
- **THEN** the correction completes #5 without changing #7

#### Scenario: Parallel tasks are not an error by themselves
- **WHEN** multiple tasks are active and consistent with the observable work
- **THEN** their simultaneous status alone produces no correction

#### Scenario: Cancelled task is deleted individually
- **WHEN** supported evidence establishes cancellation of #5
- **THEN** the deletion request names #5 only and does not also claim or split it

#### Scenario: Uncertain lifecycle result is safe
- **WHEN** a task's real lifecycle cannot be established from the supplied evidence
- **THEN** the audit withholds state-changing or continuation instructions for that task

#### Scenario: Terminal stop with actionable unfinished task
- **WHEN** an unfinished task has an explicit supported service-accepted actionable-now verdict and no unresolved permission or dependency
- **THEN** a correction can request continuation of that task and wake the agent through the existing terminal delivery path

#### Scenario: Terminal stop with only ongoing evidence
- **WHEN** a task is known to be unfinished but authorization and readiness to resume are not established
- **THEN** the task is not automatically resumed

#### Scenario: Terminal stop with blocked unfinished task
- **WHEN** progress requires user input, approval, credentials, or an external dependency
- **THEN** the audit does not demand execution and only corrects a concrete missing blocker representation, without repeated wakeups after reconciliation

#### Scenario: A blocked task is also the current match
- **WHEN** the current-match answer names #5 but its supported lifecycle is blocked
- **THEN** the correction does not set #5 `in_progress` or instruct execution merely because it matches

#### Scenario: Terminal stop with only future or intentionally deferred tasks
- **WHEN** all unfinished tasks are future, blocked, or deliberately deferred and accurately represented
- **THEN** the audit does not continue solely because those tasks exist

#### Scenario: Watchdog producer is absent
- **WHEN** the watchdog is not loaded or does not publish `user-ready`
- **THEN** periodic auditing remains available without an integration error

#### Scenario: API failure does not disturb the run
- **WHEN** a periodic request fails or times out
- **THEN** failure is isolated and does not create an arbitrary additional audit trigger

#### Scenario: Terminal-stop API failure does not disturb the run
- **WHEN** a terminal-stop request fails
- **THEN** the agent's existing lifecycle is preserved, with at most a bounded diagnostic and no uncontrolled retry loop

#### Scenario: Semantic hook listener failure is isolated
- **WHEN** a semantic-hook payload is malformed or its consumer fails
- **THEN** the watchdog and agent lifecycle remain unaffected

#### Scenario: No coupling to rpiv-todo internals
- **WHEN** the audit reads task state or sends a correction
- **THEN** it uses persisted snapshots and an agent-mediated message without importing or calling the todo plugin's internal store

#### Scenario: LLM confidence encoding cannot re-gate choices
- **WHEN** the service returns a discrete LLM choice under a native threshold of 0.99
- **THEN** audit applies its evidence and action-safety rules without comparing that answer's compatibility numerical fields
