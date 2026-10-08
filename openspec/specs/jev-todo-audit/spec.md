# jev-todo-audit Specification

## Purpose
Periodically audits the agent's todo board (rpiv-todo) against actual conversation activity using the jev model (TypeSafe Choice primitive), and nudges the agent back on track when the two disagree. It also performs a bounded board check when the agent autonomously reaches a terminal stop, reconciling lifecycle state per task rather than treating the board as one aggregate verdict.

## Requirements

### Requirement: Loop counting from session branch

The extension SHALL count completed agent loops as the number of finalized assistant messages on the current session branch, starting from the first loop of the session. The count SHALL be reconstructed from the session branch on session start, compaction, and session-tree changes, so it survives restarts, reloads, and compaction. The runtime in-memory counter SHALL be authoritative between reconstructions.

#### Scenario: Count survives restart
- **WHEN** the session is reloaded or the process restarted
- **THEN** the loop count equals the number of assistant messages on the branch, and auditing continues from that count

#### Scenario: Aborted turns do not count
- **WHEN** an assistant message is aborted before finalization (never persisted to the branch)
- **THEN** the loop count is not incremented for it

#### Scenario: Branch switch follows the branch
- **WHEN** the user switches to a different session branch
- **THEN** the loop count is recomputed from that branch's assistant messages

### Requirement: Audit every 10th loop

The extension SHALL trigger a jev audit at every loop count that is a positive multiple of the configured interval (default 10). A trigger point that is skipped by the cooldown rule SHALL NOT be deferred or retried; the next multiple is the next trigger point.

#### Scenario: Tenth loop triggers
- **WHEN** the loop count reaches 10
- **THEN** a jev audit is initiated

#### Scenario: First audit timing
- **WHEN** the session begins and the user's first prompt runs at least 6 loops
- **THEN** the first audit fires at loop 10, not earlier

### Requirement: User-message cooldown

The extension SHALL skip the periodic audit for a trigger point when 10 or fewer loops have completed since the most recent user message on the branch, including steering messages. The default cooldown SHALL therefore equal 10 loops, one complete default audit interval. The skip is final for that trigger point and SHALL NOT be retried immediately. Explicit configuration MAY override the cooldown value independently from the audit interval.

#### Scenario: Recent user message skips audit
- **WHEN** the loop count hits a multiple of 10 and 10 or fewer loops have completed since the most recent user message
- **THEN** no audit runs for that trigger point and the next audit waits for the next multiple of 10

#### Scenario: Older user message does not skip
- **WHEN** the loop count hits a periodic trigger and more than 10 loops have completed since the most recent user message
- **THEN** the periodic audit runs

#### Scenario: Steering counts as a user message
- **WHEN** the user steers mid-run and the next periodic trigger lands 10 loops or fewer after the steer
- **THEN** the audit for that trigger point is skipped

### Requirement: Audit request content

Each eligible periodic, manual or terminal audit SHALL send, per request, the relevant current board, the stored judgment state for the scopes being asked, and only the new complete loops after each scope's cursor. Previously judged loops SHALL NOT be re-sent as history. Questions SHALL be change questions over the stored state with finite transition options; each question SHALL keep its own scope and complete option set, and changed question definitions SHALL NOT reuse stored answers to earlier definitions.

No separate summarizer model, free-text memory or paid relevance preflight SHALL be introduced. Shared per-task rules SHALL be stated once per request. Complete task records and source bodies SHALL be serialized once per request and referenced by id.

Every visible task SHALL remain represented by identity/status, and unfinished tasks SHALL retain independent lifecycle state distinguishing ongoing, actionable now, completion reported, cancelled, deliberately deferred, blocked, future and unclear. `completion_reported` remains a macro-level assessment of the supplied reports, not a claim that execution was independently verified. Being unfinished or matched SHALL not itself grant permission to resume.

Current work and matched task SHALL be one session-scoped state from which alignment is derived; drift SHALL be judged against the stored authorized scope after the segment's scope updates are applied. With no active task, `board_warranted` SHALL distinguish warranted/trivial/idle and SHALL be re-asked only when current work changes; with active tasks it SHALL be omitted. Each active task without an unfinished dependency SHALL retain an independent granularity state. No aggregate answer SHALL justify mutating unrelated tasks.

#### Scenario: Second audit after a judged segment
- **WHEN** an audit runs after a previous audit advanced all cursors past loop 40
- **THEN** the request contains stored state and loops 41 onward only

#### Scenario: Completion report in the new segment
- **WHEN** the new loops contain the main agent's report that a task is finished
- **THEN** the lifecycle transition is `completion_reported` and the correction reads "reported, not independently verified"

#### Scenario: Shared task rules are sent once
- **WHEN** a request asks lifecycle, evidence, board and granularity questions for several unfinished tasks
- **THEN** their common rules appear once in the request state, each question remains scoped to its own task with its full options, and no rule is duplicated per task

#### Scenario: One request carries all questions
- **WHEN** uncached independent questions share a context and fit the limits
- **THEN** they use one batched request rather than one provider call per question

#### Scenario: Board options reflect current snapshot
- **WHEN** the current board contains #3 and #5
- **THEN** matching options reflect those identities/statuses and include not-on-board, with no incompatible old answer substituted

#### Scenario: Granularity question always present
- **WHEN** #3 and #5 are active at an eligible review
- **THEN** each required granularity finding is supplied by its compatible cached result or a task-long evaluation, not an aggregate worst-offender result

#### Scenario: Empty board still audited
- **WHEN** an ordinary eligible review has new visible work and an empty board
- **THEN** board-warrant and not-on-board matching are evaluated unless that exact input/question pair is already answered

#### Scenario: All-done board also asks warrant
- **WHEN** no task is active and review is needed
- **THEN** the applicable board-warrant finding is obtained from cache or evaluation

#### Scenario: Warrant question omitted when work is claimed
- **WHEN** at least one task is active
- **THEN** no board-warrant question is needed solely because of this audit

#### Scenario: Multiple active tasks receive independent assessments
- **WHEN** #5 and #7 are active
- **THEN** their lifecycle and granularity findings remain distinct across caching and subdivision

#### Scenario: One active task remains ongoing
- **WHEN** the final current assessment supports resolving #5 and leaves #7 ongoing
- **THEN** periodic advice is scoped to #5 rather than also resolving #7

#### Scenario: Terminal stop includes watchdog reason
- **WHEN** an eligible terminal review requires new provider work
- **THEN** its supplied stop metadata is included as observed data, not completion or authorization proof

#### Scenario: Hidden thinking is unavailable
- **WHEN** the only purported evidence is hidden thinking
- **THEN** it is not exported or treated as a finding, cached or otherwise

#### Scenario: Empty board still audited when work remains
- **WHEN** new authorized substantive conversation indicates work absent from an empty/all-done board
- **THEN** ordinary review can ask the main agent to reconcile the missing tracking, subject to warrant and authorization

#### Scenario: Empty board at terminal stop
- **WHEN** no visible task is unfinished at terminal stop
- **THEN** no provider request or corrective restart is required

#### Scenario: A model cites a source that was not supplied
- **WHEN** an answer cites neither a supplied record nor a valid supplied processed-result reference
- **THEN** it is not used as support for a correction

#### Scenario: Main-agent feedback revises a cached opinion
- **WHEN** the main agent supplies new explanation in response to a JEV question
- **THEN** the changed input can produce a revised finding while the old evaluation stays associated with its original inputs and is not rerun unchanged

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

### Requirement: Terminal-stop board check

When the optional `pi:semantic-hook:v1` channel publishes a valid `user-ready` envelope for an autonomous terminal idle outcome, the extension SHALL perform a bounded board check independently of the periodic loop interval and user-message cooldown. It SHALL use the latest persisted board snapshot and the explicit hook values as input. If no visible task is unfinished, it SHALL take no corrective action. If unfinished visible tasks exist, it SHALL run the lifecycle/verdict path described above rather than assuming the watchdog's stop reason proves the board is complete.

Human unlocks and user-initiated aborts SHALL not be treated as autonomous terminal-stop triggers by this requirement.

#### Scenario: User-ready with completed board is silent
- **WHEN** a valid autonomous `user-ready` event arrives and all visible tasks are completed or deleted
- **THEN** no TypeSafe lifecycle correction is needed and no message is injected

#### Scenario: User-ready with unfinished board starts a check
- **WHEN** a valid autonomous `user-ready` event arrives and at least one visible task is pending or in_progress
- **THEN** the extension starts one bounded lifecycle audit using the current board and explicit stop evidence, independent of the periodic cooldown

#### Scenario: Duplicate terminal events do not fan out audits
- **WHEN** the same terminal-stop epoch produces repeated equivalent `user-ready` notifications
- **THEN** the extension coalesces them so one stop epoch cannot create uncontrolled concurrent audits

#### Scenario: Human stop is not misclassified
- **WHEN** the user manually unlocks or aborts the agent while unfinished tasks remain
- **THEN** this terminal-stop requirement does not start an autonomous-stop audit

### Requirement: Relevant recent and global evidence

JEV SHALL receive a macro-level view of the current work: goals, task definitions, reported outcomes, broad progress, user decisions and unresolved questions. It SHALL act as an advisory engineering lead, not an executor or an independent re-verifier of implementation details. The recent view SHALL cover unprocessed visible interactions; the global/task view SHALL combine applicable user constraints, task origins and previously processed conclusions. Chronology, source roles, identity and call/result associations SHALL be preserved. Existing summaries and model conclusions SHALL be labelled as derived material; abandoned branches SHALL NOT become current context.

New visible user and assistant text SHALL be eligible regardless of tool use. All intervening supported text SHALL enter chronological processing rather than only the last assistant message. Analysis and explanation can themselves be deliverables. An assistant's answer to a JEV question—including an explanation, correction or rebuttal—SHALL be new review input. The relevant prior question SHALL remain identifiable so short replies are interpretable. A JEV opinion alone SHALL NOT become independent evidence that the opinion is true or that new action is authorized.

Generic tool and shell execution content SHALL be projected to name, identity/order and existing returned/error/cancelled/pending/unknown signals. Arguments, command bodies, file contents and result/log bodies SHALL NOT be exported to JEV in either ordinary or full review. The projection SHALL NOT run another model or parse arbitrary log prose to invent a success state. Current structured TODO state SHALL remain a deliberate separate supplement through the existing board adapter. A returned tool call SHALL NOT by itself establish completion of a task.

Selection and processing receipts SHALL distinguish already-reviewed ranges, execution detail deliberately excluded by this projection, duplicates, and genuinely missing/unsupported/redacted evidence. Known credentials, hidden thinking, private extension state and raw binary content SHALL remain excluded. Needed facts not exposed through the allowed public conversation or task state SHALL remain unknown, not inferred approval. The extension SHALL not bulk-export tool `details` or introduce private-state adapters for unfamiliar tools.

#### Scenario: A visible failure contradicts an assistant completion claim
- **WHEN** a supported public error/cancellation signal contradicts an assistant's completion report
- **THEN** both the report and the compact failure signal are available to JEV without sending the raw execution log or representing the report as independently verified execution

#### Scenario: An unfamiliar tool supplies relevant evidence
- **WHEN** an unfamiliar tool is called or returns
- **THEN** its name, identity and available status enter the activity trace without a business-specific payload parser

#### Scenario: A later user refusal changes the plan
- **WHEN** a later user message withdraws permission granted earlier
- **THEN** the new message can revise previous conclusions, and cached findings cannot override it

#### Scenario: Blocker information is outside a special metadata key
- **WHEN** a blocker is recorded in a task description, ordinary visible conversation or permitted task metadata
- **THEN** it remains usable without requiring a designated blocker field

#### Scenario: Compacted context retains the global goal
- **WHEN** applicable host summaries and compatible stored conclusions represent earlier work
- **THEN** the review uses their labelled macro information without appending raw pre-compaction payloads

#### Scenario: A repeated audit message is not new authority
- **WHEN** JEV's previous advice is the only new audit-generated material
- **THEN** it neither triggers an independent reevaluation nor proves its own correctness

#### Scenario: The main agent corrects the leader
- **WHEN** the main agent answers JEV's split suggestion with new explanation of a coherent outcome and already tracked checkpoints
- **THEN** that answer enters the next review and can overturn the previous split finding without replaying the old raw context

#### Scenario: Spare capacity does not justify unrelated payloads
- **WHEN** there is spare capacity alongside unrelated history or large tool logs
- **THEN** those payloads remain excluded under the macro projection rather than filling the window

#### Scenario: Human-visible evidence is unavailable to the collector
- **WHEN** a fact exists only in an unrecorded UI element or excluded/unsupported content
- **THEN** the limitation is disclosed rather than inventing the fact or interpreting absence as approval

#### Scenario: Several text-only analysis turns occur
- **WHEN** multiple assistant messages develop an analysis task without tools or task/file references
- **THEN** all new messages are processed in order as possible work, not discarded as inactivity

#### Scenario: A result arrives after its call was processed
- **WHEN** a tool's status arrives in a later segment than its call
- **THEN** its new status is linked to the earlier call without replaying the call arguments or result body

### Requirement: Provider context limits without artificial quotas

Segment packing SHALL use the selected judgment model's declared capacity as reported by the judgment service, counting stored state, question definitions, loops, backend envelope and output reserve. Character/byte counts SHALL NOT be asserted as token counts; the bytes-to-tokens prior and provider-reported usage remain the calibration source. A predicted or reported overflow SHALL be recovered by dropping trailing whole loops; a single loop with required state that cannot be admitted SHALL stop that scope with an actionable diagnostic and SHALL NOT be sliced or silently truncated. Authentication, quota, payload-size and validation errors SHALL NOT be treated as overflow. Capacity for the audit SHALL never be derived from the main chat model.

#### Scenario: Overflow with several loops
- **WHEN** a segment of five loops is rejected for input size
- **THEN** the audit retries with fewer trailing loops and the remaining loops stay unjudged

#### Scenario: Oversize single loop
- **WHEN** one loop plus required state exceeds the declared capacity
- **THEN** the scope reports an oversize loop, keeps its cursor, and does not claim coverage

#### Scenario: OpenRouter reports a context overflow
- **WHEN** the OpenRouter endpoint rejects a request with `error.metadata.error_type` `context_length_exceeded`
- **THEN** it is treated as an explicit overflow and the segment is retried with fewer trailing loops, while its other typed errors fail through the ordinary isolated error path

#### Scenario: OpenRouter's published window is applied to both dimensions
- **WHEN** the selected channel publishes a single context window
- **THEN** segment packing bounds both the request-wide and state-plus-longest-question dimensions by that window as disclosed by the service

#### Scenario: Relevant context exceeds the old application budget
- **WHEN** the new complete loops exceed any old character or fragment cutoff
- **THEN** no cutoff silently removes them; capacity packing decides how many whole loops are sent now and the rest stay unjudged

#### Scenario: State exceeds its own limit while total request fits
- **WHEN** stored state plus the longest question exceeds its limit before any loop is added
- **THEN** the scope stops with a diagnostic naming the oversized state; no loop is dropped to hide it

#### Scenario: Questions cause a request overflow
- **WHEN** state and loops fit but all questions together exceed the request-wide limit
- **THEN** the service splits independent question batches over the same frozen state and answered questions are retained

#### Scenario: Reduction removes evidence needed to split a task
- **WHEN** a task's segment is still partly unjudged or oversize
- **THEN** no definitive split instruction is issued from that task's incomplete state

#### Scenario: Token accounting is unverified
- **WHEN** no authoritative tokenizer/counting contract is available
- **THEN** packing uses the disclosed bytes-to-tokens ratio with server admission as the authority and does not claim that a byte estimate proves fit

#### Scenario: A predictably oversized envelope is split before sending
- **WHEN** the calibrated estimate of state plus loops exceeds the disclosed limit
- **THEN** trailing whole loops are removed before any provider request and no rejection is recorded for it

#### Scenario: Channel capacity is used rather than a stricter guess
- **WHEN** state plus the longest question and state plus all questions both fit the disclosed limits
- **THEN** the segment is sent whole even if its total exceeds a smaller per-question limit

#### Scenario: A prediction does not declare a unit irreducible
- **WHEN** one loop with required state is still predicted too large
- **THEN** it is sent once and only an actual rejection marks it oversize

#### Scenario: Learning survives reload
- **WHEN** the extension reloads on the same branch after admitted and rejected attempts
- **THEN** the calibrated ratio and recorded rejections disclosed by the service are reused without re-sending anything

#### Scenario: A validation error is not an overflow
- **WHEN** a request fails for invalid question syntax or an unfamiliar error
- **THEN** it fails through the ordinary isolated error path and no loop is dropped because of it

#### Scenario: Recovery still exceeds the provider limit
- **WHEN** a segment reduced to fewer loops is rejected again
- **THEN** it is reduced further only while whole loops remain; a single rejected loop ends recovery for that scope without resending

#### Scenario: Sensitive or unsupported material is present
- **WHEN** a loop contains known credentials, hidden thinking or raw binary/image data
- **THEN** that content is not exported and the resulting gaps remain explicit in the loop record

#### Scenario: Protected new text spans several requests
- **WHEN** the new complete loops do not fit one request but fit as consecutive segments
- **THEN** all segments are judged in order, each updating state and cursor, without dropping the oldest or newest loop

#### Scenario: A question is irreducibly too large
- **WHEN** required state or a single question cannot fit independently of any loop
- **THEN** the affected scope reports what must be shortened or clarified, retains stored state and does not loop on the same rejection

#### Scenario: Later low-density input corrects an earlier high estimate
- **GIVEN** the channel has previously observed approximately 0.478 input tokens per request byte
- **WHEN** later successful responses report approximately 0.347 input tokens per request byte for current work
- **THEN** subsequent prediction and same-branch reload use the corrected observations rather than treating the older maximum as a permanent lower bound
- **AND** observations from a different endpoint or requested model do not alter this channel

#### Scenario: Fixed-state prediction would multiply an admissible batch
- **GIVEN** retained state is predicted to exceed the state-related limit, 69 new records remain, 12 questions are unresolved, and the provider can admit their complete batch
- **WHEN** an eligible audit runs without transport failure
- **THEN** one provider attempt evaluates the complete unanswered batch, every new record remains represented, and all required valid answers permit the range to advance
- **AND** the extension does not make 69 groups of single-question requests or introduce an extra validation-only call

#### Scenario: The admission check actually rejects the full batch
- **WHEN** an overestimated fixed-state prediction is checked by sending the current batch and the provider rejects it with an explicit context overflow
- **THEN** the actual rejection is recorded and existing complete-coverage recovery applies to reducible evidence or questions
- **AND** no success is inferred from the prediction check, no unchanged rejected envelope is resent, and only completed stages advance progress

#### Scenario: Confirmed fixed-state failure stops the affected scope
- **GIVEN** required retained state remains too large even with an irreducible evidence fragment and the smallest applicable unanswered question
- **WHEN** provider admission confirms the context overflow
- **THEN** the audit stops that scope with a concise shortening/clarification diagnostic rather than repeating the fixed state for every remaining record and question
- **AND** it retains user constraints, cached valid answers, and prior durable progress without injecting definitive completion or continuation advice

#### Scenario: A successful smaller-density envelope contradicts a size heuristic
- **GIVEN** a different-content envelope on the channel previously failed for context size
- **WHEN** a later envelope of equal or larger measured dimensions is admitted successfully
- **THEN** that historical size comparison alone no longer forces subsequent comparable work through the contradicted prediction
- **AND** the exact historical rejected envelope remains protected against unchanged retransmission

### Requirement: Engineering-grounded granularity assessment

Each active task's granularity assessment SHALL consider its level and authorized purpose, completion boundary, concrete next action, useful feedback/handoff boundaries, and subdivision benefit relative to existing tasks. It SHALL distinguish feature/story, execution/investigation task and waiting item without requiring a new task-schema field. This is an engineering judgment with distinct keep, split, clarify, blocked and insufficient outcomes, not an activity-count or generic yes/no shortcut.

The macro span SHALL run from that task's first `in_progress` turn through its latest reviewed turn, retaining the original task definition and applicable constraints. Later TODO updates, temporary pending/waiting states and resumptions SHALL not reset the first-active origin. Processed parts of that span SHALL be represented by their rolling conclusions rather than reread raw every time. Local segment review SHALL NOT substitute for complete required macro coverage. If the origin or coverage is genuinely unavailable it SHALL be labelled, not fabricated.

A split recommendation SHALL identify reported/evidenced separable outcomes or verifiable checkpoints that improve tracking while preserving the goal and avoiding duplicate work. One overall goal SHALL NOT automatically exempt a task from subdivision. Multiple files, tools, tests, workflow steps, conjunctions or elapsed loops SHALL NOT independently mandate it. Unclear completion criteria, unclear next action, a known blocker and insufficient information SHALL remain distinct from a supported split. Age SHALL remain diagnostic, not a universal timebox or calibrated effort estimate. Main-agent replies SHALL be able to correct a mistaken granularity finding.

#### Scenario: A feature crosses architectural layers
- **WHEN** one coherent behavior involves UI, business logic, persistence and several checks
- **THEN** those reported implementation parts alone do not mandate horizontal component tasks

#### Scenario: A technical task has a verifiable non-release outcome
- **WHEN** an investigation has a clear next action and a checkable analytical result
- **THEN** it is not defective merely because it does not independently ship a marketable feature

#### Scenario: One large goal needs meaningful checkpoints
- **WHEN** the macro record identifies separable verifiable outcomes whose absence obscures progress
- **THEN** scoped subdivision can be recommended despite the single overall goal if it is authorized and not already tracked

#### Scenario: A long-running task is making useful progress
- **WHEN** age exceeds the review threshold but scope, next action and reported progress remain appropriate
- **THEN** no split is demanded on age alone

#### Scenario: The next action is unclear rather than blocked
- **WHEN** the macro view does not establish a concrete next step
- **THEN** the leader requests clarification rather than automatically demanding smaller tasks

#### Scenario: A known next action awaits approval
- **WHEN** the next action is known but awaits permission or a dependency
- **THEN** the item is treated as blocked rather than necessarily too coarse

#### Scenario: Existing tasks already cover the apparent subdivisions
- **WHEN** the board or main-agent explanation establishes that the checkpoints are already tracked
- **THEN** duplicate child tasks are not requested solely because the coordinating description mentions them

#### Scenario: TODO updates do not erase the macro span
- **WHEN** a task starts at turn 12, is updated at turns 20 and 27, and is reviewed at turn 35
- **THEN** its granularity covers the processed trajectory from turn 12 through 35, not only turns 27 through 35

#### Scenario: A resumed task retains its original start
- **WHEN** an active task waits in pending and later resumes
- **THEN** its same-task macro origin remains the first active turn rather than the most recent status transition

### Requirement: Corrections remain fresh and do not repeat themselves

The extension SHALL suppress an unchanged corrective demand for the same task or issue when no substantive new evidence supports reconsideration. A repeated stop reason, loop count, previous audit message, or acknowledgment of that message SHALL NOT alone re-arm the demand. A board update that already records the requested blocker SHALL be recognized as reconciliation rather than a reason to repeat the same instruction.

New user instructions, relevant non-audit work evidence, or meaningful task changes SHALL permit a fresh assessment even when the stop reason text is unchanged. Session/branch identity and persisted audit messages SHALL be respected so reload does not by itself make an old demand new. A result invalidated by a changed user instruction, board snapshot, or session/branch before delivery SHALL NOT be injected.

#### Scenario: Waiting is already accurately recorded
- **WHEN** the board and visible conversation already show a task waiting for user input and no substantive evidence changes
- **THEN** subsequent audits do not repeatedly wake the agent to restate the same blocker or demand execution

#### Scenario: The agent records the requested blocker
- **WHEN** an earlier correction asked for a blocker explanation and the agent records it in the task description
- **THEN** a later audit reads that explanation and does not repeat the correction as though it were absent

#### Scenario: A new decision arrives under the same stop reason
- **WHEN** the user supplies a new decision but a later terminal event reuses the previous stop-kind and reason text
- **THEN** the new evidence can be audited rather than suppressed solely by matching reason strings

#### Scenario: Reload without new work
- **WHEN** the session reloads after a recorded correction and there is no substantive new evidence
- **THEN** reload alone does not cause the same corrective demand to be sent again

#### Scenario: A user changes scope during an audit
- **WHEN** the user changes the authorized scope after the audit request was captured but before its response is delivered
- **THEN** the stale correction is discarded instead of overriding the newer instruction

### Requirement: Uniform reuse of identical JEV evaluations

Reuse SHALL operate through stored judgment state and cursors: a loop judged for a scope SHALL NOT be judged again for that scope, regardless of question category. Exact-repeat request caching is not a goal of the extension and SHALL NOT be required for correctness. Valid `no_change`, uncertain and low-confidence answers SHALL be stored without becoming stronger findings. Explicit forced full review is the documented exception.

#### Scenario: Every decision category uses stored state
- **WHEN** lifecycle, granularity, interaction and drift questions are asked on the same new segment
- **THEN** each reads its own stored state and none re-receives loops before its cursor

#### Scenario: Forced full review
- **WHEN** the user requests a full re-judgment
- **THEN** cursors reset to each task's first-active loop and the session start, and state is rebuilt from complete loops in order

#### Scenario: Only one question is new
- **WHEN** questions A and B already have state covering the new segment and C does not
- **THEN** only C is asked on that segment and the combined state is used by the verdict

#### Scenario: Concurrent identical work
- **WHEN** two audits for the same session would judge the same segment concurrently
- **THEN** single-active scheduling prevents the duplicate; the second observes the stored result

#### Scenario: No correction was emitted
- **WHEN** a previous segment produced `no_change` or an uncertain answer
- **THEN** that result is stored and reused as state rather than requiring a sent reminder as the record

#### Scenario: Question meaning changes
- **WHEN** a question's instructions, options or the judgment model change
- **THEN** stored answers to the earlier definition are kept as reference only and segments after the cursor are re-judged under the new definition

#### Scenario: A partial response has useful answers
- **WHEN** a segment returns valid answers for tasks A and B but none for C
- **THEN** A and B advance their cursors and only C is asked again on that segment

#### Scenario: Transport failure is not a judgment
- **WHEN** a service call fails or returns an invalid answer
- **THEN** no transition is written and no cursor advances for that segment

#### Scenario: Every decision category uses the cache
- **WHEN** lifecycle, granularity, interaction or drift is asked again on a segment already judged for that scope
- **THEN** the stored transition is used and no provider request repeats that segment

### Requirement: TODO-defined state segments

A segment SHALL be a run of complete Pi loops after a scope cursor. A loop (assistant message with all its tool results) SHALL never be split across segments. TODO snapshot changes, byte thresholds and compaction summaries SHALL NOT define segment boundaries; a successful TODO update is evidence within its loop. Segmentation SHALL NOT add a paid audit per update; cadence, cooldown, manual and terminal eligibility remain the trigger policy.

#### Scenario: Tool-heavy loop
- **WHEN** one assistant message issues six tool calls
- **THEN** that message and all six results are in the same segment or none of them are

#### Scenario: Read-only TODO operation
- **WHEN** the agent lists the board without changing it
- **THEN** no new judgment is triggered by that operation alone

#### Scenario: Update followed by another update
- **WHEN** a task description changes and its status changes later
- **THEN** both state transitions remain ordered review events without requiring two immediate JEV calls

#### Scenario: A segment is not a new task
- **WHEN** the same task receives a blocker note or active-form update
- **THEN** local review observes the new state while its prior valid evaluations and first-active origin remain available

### Requirement: Resumable rolling conclusions

The audit SHALL carry forward stored judgment state rather than previously processed raw context or chains of summaries. A `no_change` or partial-progress answer SHALL advance the scope cursor once durably recorded; an `unclear_in_segment` answer SHALL NOT. Stored state is a revisable finding, not user authority or lossless summarization.

Reported work, model judgments and processing progress SHALL remain distinguishable. Required macro facts SHALL come from task state or main-agent reports referenced by source id, never invented from a transition label or cursor. A newer transition SHALL NOT silently erase a still-applicable earlier anchor. Compatible reload/compaction SHALL restore cursors and state rather than replay processed loops. Unverifiable or abandoned-branch records SHALL not be promoted into current findings.

#### Scenario: An unchanged segment advances progress
- **WHEN** every question for a task answers `no_change` on a segment and the state append is acknowledged
- **THEN** the task cursor advances past that segment

#### Scenario: Reload after compaction
- **WHEN** the session is reloaded with a compacted context
- **THEN** stored state and cursors are restored from the session JSONL and loops before the cursors are not re-judged

#### Scenario: Later evidence contradicts stored state
- **WHEN** a new segment evidences that a task recorded as `completion_reported` was reopened by the user
- **THEN** the task transition is `scope_changed`, its cursor resets to the reopening loop, and the earlier completion anchor is retained as history only

#### Scenario: Model identity changes
- **WHEN** the selected judgment backend or model changes
- **THEN** stored state remains as reference, segments after each cursor are judged by the new model, and no earlier loop is replayed unless full mode is requested

#### Scenario: An unchanged chunk advances progress
- **WHEN** a segment yields `no_change` for every question of a scope and the state write is acknowledged
- **THEN** that scope's cursor advances past the segment

#### Scenario: Reported progress survives an opinion update
- **WHEN** a later segment changes a task's lifecycle transition
- **THEN** the earlier confirmed progress items and their anchors remain in state

#### Scenario: A later chunk fails
- **WHEN** the service call for a later segment fails
- **THEN** cursors advanced by earlier segments remain and no transition from the failed segment is written

#### Scenario: No chain of duplicate summaries
- **WHEN** many segments have been judged
- **THEN** the request carries the current state only, never a concatenation of earlier results

#### Scenario: Compaction preserves a valid review receipt
- **WHEN** the session is compacted after state and cursors were written
- **THEN** the next audit restores them from the session JSONL and judges only loops after the cursors

#### Scenario: Later evidence contradicts an intermediate result
- **WHEN** a new segment contradicts a stored transition
- **THEN** the new transition is written, the old one stays as history, and only the affected scope's cursor is reset if its scope changed

#### Scenario: Routine reports do not crowd out a needed fact
- **WHEN** many newer routine reports exhaust the recent-report allowance but an older reported decision is still required
- **THEN** the current factual account or necessary uncovered report preserves that decision, or the affected finding remains explicitly uncertain rather than pretending its historical Choice label preserved it

### Requirement: Manual review modes

`/jev-audit` SHALL bypass periodic cadence/cooldown while using cached results and processing only unresolved work. `/jev-audit full` SHALL explicitly bypass prior evaluation results for a fresh reassessment of the relevant macro-level history. It SHALL still use the tool projection and capacity-aware processing contract; full review SHALL NOT restore raw tool arguments or result bodies. A successful forced review SHALL supply the ordinary baseline for subsequent review. Unknown arguments SHALL return usage without a provider request. Existing enabled, credential and concurrency protections SHALL remain.

#### Scenario: Ordinary manual repeat
- **WHEN** `/jev-audit` is invoked with unchanged already assessed inputs
- **THEN** it makes no provider request and emits no duplicate correction

#### Scenario: Explicit forced review
- **WHEN** `/jev-audit full` is invoked with auditing available
- **THEN** relevant macro context is freshly assessed despite cached results, with subdivision if needed and without raw tool payloads

#### Scenario: Invalid command arguments
- **WHEN** the command receives an unsupported argument
- **THEN** usage guidance is returned without an unintended paid request

### Requirement: Observable cost and capacity outcomes

The extension SHALL report compact observations for cache hits/misses, actual provider attempts, projected state/question sizes, chunk progress, response model and provider-reported input/output usage when available. Retries, recovery and stale responses SHALL count as attempts; missing usage on an attempt SHALL be unknown rather than zero. Totals SHALL sum the usage that was reported and SHALL state how many attempts did not report each figure; a total with any unreported attempt SHALL be presented as a lower bound, never as a complete total and never as unknown when other attempts reported usage. A provider-reported charge (such as OpenRouter `usage.cost` in USD) SHALL be recorded per attempt and totalled; a channel that reports no charge SHALL show none rather than zero, and a total with any attempt lacking a reported charge SHALL follow the same lower-bound rule. Cached answers SHALL not charge their original usage again. Accounting SHALL not export transcript bodies or credentials or trigger additional evaluations.

Comparisons SHALL use matching event sequences and endpoint/model settings and report per-workload and aggregate observations for tool-heavy, text-only and short-context cases. Input tokens and an applicable verified rate or provider charge SHALL be the monetary evidence; bytes SHALL not be presented as tokens. Oversized-input recovery SHALL be evaluated for successful coverage and resumption separately from cost comparisons against already successful baselines. No savings percentage or semantic-equivalence claim SHALL be inferred solely from mocked responses.

#### Scenario: A cache hit costs no new provider work
- **WHEN** an answer is reused
- **THEN** its accounting shows zero new provider attempts and does not add the original response's tokens a second time

#### Scenario: An overflow is recovered
- **WHEN** a request is rejected and subsequent smaller parts complete the review
- **THEN** diagnostics distinguish the rejected attempt, successful parts and final success instead of reporting the initial 400 as the final audit failure

#### Scenario: A split is predicted rather than rejected
- **WHEN** an envelope is subdivided before sending
- **THEN** diagnostics count the pre-split separately from actual provider attempts and overflow rejections, and attribute no usage to it

#### Scenario: A failure lacks usage
- **WHEN** a provider attempt has no usable token observation
- **THEN** the report marks that attempt's usage unknown, still totals the usage other attempts reported, counts the unreported attempt, and does not claim a complete total

#### Scenario: Short-context overhead is measurable
- **WHEN** rolling-state overhead makes a short-context request larger than its baseline
- **THEN** that regression appears alongside savings on other workloads rather than being omitted from the comparison

#### Scenario: A provider reports the charge
- **WHEN** every attempt of an audit on OpenRouter reports `usage.cost`
- **THEN** diagnostics record each charge and their USD total, and a channel without reported charges shows no dollar total

### Requirement: One visible body for each main-agent advisory

Every ordinary correction, Choice-context clarification and factual-context clarification sent to the main agent SHALL have one canonical textual body. The default transcript view SHALL show all task-specific content and collapse only the positively recognized shared generic advisory footer. Expansion SHALL reveal the complete original body, identical to the main-agent content at the plugin delivery boundary apart from styling and wrapping. The extension SHALL NOT collapse suggestions, evidence, task/question/source scope, board-only restrictions or recovery limits; reconstruct a human summary; or modify delivered content to implement folding. Unrecognized historical wording SHALL remain fully displayed rather than being heuristically shortened. Backend JEV requests and responses SHALL remain outside this presentation contract.

#### Scenario: User reads an ordinary correction
- **WHEN** an audit sends a suggestion about task #5 to the main agent
- **THEN** one visible advisory shows the complete suggestion and evidence without requiring expansion
- **AND** only its recognized shared footer starts collapsed, with any board-only restriction still visible

#### Scenario: User reads either incomplete-context advisory
- **WHEN** the plugin sends a Choice-context or factual-context clarification to the main agent
- **THEN** its affected scope, limits and source guidance remain fully visible by default
- **AND** the display does not substitute a generic warning for the actual clarification

#### Scenario: User expands an advisory
- **WHEN** the user expands a message whose shared footer was collapsed
- **THEN** the complete stored body including that footer is displayed without regeneration
- **AND** the main-agent message content and delivery options remain unchanged

#### Scenario: Similar wording appears in task evidence
- **WHEN** an advisory quotes footer-like wording in its task-specific body
- **THEN** that evidence remains visible; only a recognized terminal shared footer can be collapsed
- **AND** an unrecognized or changed ending remains fully displayed

#### Scenario: No interactive UI is available
- **WHEN** an eligible advisory is delivered in a non-interactive session
- **THEN** its content and delivery behavior remain independent of interactive rendering
- **AND** no extra model request is made to produce presentation text

### Requirement: Concise advisories preserve source and authority

New advisories SHALL use one plugin-attributed heading, followed by the concrete suggestion or limitation and its affected task/source scope. Generic source, authority and acknowledgment guidance SHALL be stated once rather than repeated in multiple wrappers. The body SHALL identify its origin as the pi-jev-todo-audit plugin and state that it is reference feedback, not a user message, instruction or new authorization, even when transported under a user role. It SHALL preserve the user's latest scope and wait conditions, discourage interruption or task switching solely because the advisory arrived, and require no separate reply. A general statement about not granting new authorization SHALL NOT revoke existing user permission.

Corrections SHALL retain task identifiers and sanitized source evidence, distinguish reported outcomes from independent execution verification, and remain open to being disregarded if mistaken or already satisfied. Concision SHALL NOT silently truncate additional applicable findings or necessary limits. Terminal board-only reconciliation SHALL explicitly restrict work to updating the board and returning control, without executing blocked tasks or bypassing a wait. Suggestions concerning continued execution SHALL remain limited to already-authorized actionable work. Existing delivery eligibility, freshness, repeat suppression and wake conditions SHALL remain unchanged.

#### Scenario: A reported completion needs a board update
- **WHEN** a supplied main-agent report supports reconciling task #5 as completed
- **THEN** the advisory identifies #5 and the sanitized source, labels completion as reported rather than independently verified, and presents the suggestion before its generic boundary guidance
- **AND** duplicate plugin headings and repeated generic disclaimers are absent

#### Scenario: Only bookkeeping is allowed at terminal stop
- **WHEN** a supported board mismatch warrants a board-only terminal turn while task execution remains blocked
- **THEN** the advisory directs the agent to reconcile only the board if still applicable and then return control
- **AND** it grants no permission to execute the task or bypass the blocker

#### Scenario: Prior permission exists or a wait remains unresolved
- **WHEN** an advisory reaches the main agent with an existing user authorization or an unresolved wait condition
- **THEN** its wording neither resets the existing permission nor supplies the missing permission or input
- **AND** arrival of the advisory alone does not justify interrupting or switching the current task

#### Scenario: A clarification alone cannot restart work
- **WHEN** a terminal review has only a split or planning-clarification suggestion that does not qualify for a restart
- **THEN** the presentation change does not start a new work turn or promote the suggestion into execution authority

### Requirement: Incomplete-review messages retain actionable limits

Incomplete-review advisories SHALL lead with the affected scope, what prevented the finding and what genuine information can help. They SHALL preserve the distinction between local Choice withholding and factual admission failure. They SHALL NOT imply completion, continuation, new execution authority, a task-status change, guaranteed recovery from a brief, or permission to remove necessary sources. Existing completed work and independently supported findings SHALL remain qualified according to their existing scope rules.

A Choice-context message SHALL retain the affected question identifiers, actual option counts and the 255-option limit including fallback, and disclose that those questions had no model judgment or provider attempt. A factual-context message SHALL retain affected tasks, the fact that progressing recovery could not admit required material, and the permitted public report IDs available for declared coverage, or their absence. Where a task account or optional `metadata.auditBrief = { text, sources, covers }` is suggested, the message SHALL preserve that it is reported data rather than proof or permission, that `sources` is not an exclusive allowlist, that `covers` does not retire necessary primary evidence, and that repeating the account does not guarantee admission. Known credentials SHALL remain redacted before either delivery or display.

#### Scenario: A Choice has 256 options including fallback
- **WHEN** an affected evidence question is withheld locally at 256 options
- **THEN** the advisory names the question, its count and the 255 limit and states that it received no model judgment or provider attempt
- **AND** it requests genuine applicability information without suggesting candidate truncation or deletion of necessary tasks
- **AND** it does not withhold an independently supported sibling correction solely to simplify presentation

#### Scenario: Required factual material cannot fit
- **WHEN** factual recovery reaches an irreducible affected scope for #5 with public report IDs report-1 and report-2 available
- **THEN** the advisory identifies #5, the admission limitation and those report IDs
- **AND** a suggested current account preserves source obligations, user constraints and uncertainty instead of promising recovery or authorizing execution

#### Scenario: No eligible report origin exists
- **WHEN** a factual-context advisory has no permitted public report IDs
- **THEN** it states that no such origins are available rather than inventing coverage identifiers

### Requirement: Visible advisories do not produce duplicate delivery receipts

The extension SHALL NOT emit an additional notification merely to announce that an already-visible advisory was injected. Operational notifications such as dependency failures, review failures, recovery and optional aligned status SHALL remain distinct UI-only feedback, with their existing eligibility retained. They SHALL NOT be converted into agent messages to achieve presentation parity. Status wording SHALL NOT imply that advice was delivered when no advisory was sent; conversely, a failure status SHALL NOT claim that no message was sent when a clarification was delivered earlier in that audit. This requirement does not remove a distinct operational failure or recovery notice accompanying an advisory.

#### Scenario: An ordinary correction is visible
- **WHEN** the plugin delivers a visible correction, including with `notifyOnAligned` disabled
- **THEN** the transcript contains the correction without an additional `correction injected` receipt

#### Scenario: A dependency is unavailable
- **WHEN** the shared review service is unavailable and the audit is skipped
- **THEN** the user receives the existing eligible operational notice without any main-agent advisory or new work turn

#### Scenario: Failure follows a factual clarification
- **WHEN** an incomplete review delivers a factual-context clarification and reports the audit failure
- **THEN** the clarification remains the shared body and the failure notice remains UI-only
- **AND** the notice does not incorrectly claim that nothing was sent

### Requirement: Historical advisory bodies remain stable

Redraw, session reopening and later wording or configuration changes SHALL use the original stored advisory content rather than regenerate its text. Only a recognized shared footer can start collapsed; expansion SHALL show the original body in full. Earlier unrecognized verbose advisories SHALL remain fully displayed without a data migration or added new disclaimer. Presentation changes SHALL NOT turn an old advisory into fresh evidence or re-arm a previously suppressed demand.

#### Scenario: Reopen an earlier advisory after a wording update
- **WHEN** a session containing an older verbose advisory is reopened after this change
- **THEN** its original body remains visible without a new body wrapper, summary or rewrite
- **AND** reopening alone does not resend the advisory

#### Scenario: Redraw a new advisory
- **WHEN** the terminal width or theme changes after publication
- **THEN** styling or line wrapping can change while the stored and delivered body remains unchanged

### Requirement: Main-agent-only auditing

JEV SHALL run only in main-agent sessions. It SHALL establish process ownership through its own `PI_JEV_TODO_AUDIT_OWNER_PID` environment variable, without depending on a particular subagent framework's identity variables. An unset or empty marker SHALL be claimed by the current process using Node.js `process.pid`. A marker equal to the current PID SHALL preserve eligibility, including extension reload and session replacement. A nonempty marker identifying another PID SHALL suppress JEV without overwriting the inherited owner; a malformed nonempty marker SHALL also suppress rather than silently claim ownership. Descendants SHALL inherit the original owner marker unchanged.

Suppressed child processes SHALL perform no periodic, terminal-stop, ordinary manual, or forced-full audit. This restriction SHALL take precedence over enabled global/project configuration and SHALL have no child opt-in override. They SHALL produce zero JEV provider requests, audit-specific credential lookups, injected corrections, and new audit ledger entries. A suppressed extension SHALL not expose the manual audit command; an unavailable command SHALL not trigger a fallback paid evaluation.

Ownership and inheritance SHALL use Node.js APIs supported on Windows and POSIX systems, without platform process commands, `/proc`, shell parsing, or parent-PID discovery. Independently launched unmarked Pi processes SHALL each remain eligible. Identity SHALL NOT be inferred from the session name, prompt text, working directory, UI availability, a parent/fork-session reference, or the agent's self-description. Main-agent print/RPC sessions and user-created in-process forks SHALL remain eligible. The marker SHALL remain process-local, SHALL NOT be written into shell profiles or persistent global/project configuration, and SHALL NOT be removed on a single session's shutdown. Environment inheritance is an execution convention, not a security boundary: a caller that explicitly strips the marker creates an unmarked process, and a same-process child cannot be distinguished by PID alone.

#### Scenario: Independently started Pi claims its own process
- **WHEN** a Pi process loads JEV with no nonempty owner marker
- **THEN** JEV stores that process's PID in its own environment marker and preserves the main-agent audit behavior
- **AND** no third-party subagent environment variable is required

#### Scenario: A manually spawned child Pi inherits the owner
- **WHEN** the main Pi launches another Pi with inherited environment, directly or through an intermediate process
- **THEN** the descendant sees a different owner PID and JEV initialization performs no credential lookup, audit hook registration, manual-command registration, correction, or new audit ledger write
- **AND** the original marker remains unchanged for further descendants

#### Scenario: A child reaches every audit trigger
- **WHEN** a suppressed child crosses an audit interval, emits a terminal-stop event, or attempts ordinary or full manual review
- **THEN** none of those paths issues a JEV request or re-enables the extension

#### Scenario: Main agent is non-interactive
- **WHEN** an owning main-agent process runs without a TUI and has otherwise eligible work
- **THEN** absence of a UI does not disable its existing audit behavior

#### Scenario: A user forks a main-agent session
- **WHEN** a user-created main-agent fork stays in the owning process and has a parent-session reference
- **THEN** it remains eligible for JEV auditing

#### Scenario: Foreground child shares a host with the parent
- **WHEN** a launcher creates a child session in the owning process
- **THEN** that child launch excludes JEV and the main agent retains its audit capability
- **AND** explicitly loading JEV into such a child without a separate session-scoped exclusion contract is outside the PID marker's supported detection boundary and SHALL NOT be claimed as covered

#### Scenario: Reload and nested processes preserve ownership
- **WHEN** the owning process reloads JEV and an inherited child starts a grandchild process
- **THEN** the owner remains enabled while both descendant processes remain suppressed under the same original owner marker

#### Scenario: Separate main processes do not suppress each other
- **WHEN** two Pi processes are independently launched from environments without an owner marker
- **THEN** each claims its own PID without changing the other process or their launching shell's environment

#### Scenario: Ownership works on Windows without a shell
- **WHEN** the main and child processes are launched on Windows using Node.js child-process APIs with inherited environment and argument arrays
- **THEN** the same ownership and suppression rules apply without requiring POSIX commands, shell-style environment assignment, or Unix path assumptions

#### Scenario: A nonempty marker is malformed
- **WHEN** an inherited owner marker is not a canonical positive PID string
- **THEN** the extension suppresses itself rather than enabling paid auditing or replacing the marker with the current PID

### Requirement: Source-backed current factual material

An audit SHALL distinguish current reported facts, applicable user decisions, JEV opinions and processing progress. Necessary facts such as task goals, acceptance conditions, design decisions, reported outcomes and blockers SHALL remain available with their object scope, source identities and original authority level after their input range is processed. An unchanged classification or completed receipt SHALL NOT substitute for those facts or establish that they survived compression.

Current factual material SHALL come from permitted public task state or main-agent-authored reports/briefs, not model-generated reconstruction of missing history. A supplied current brief SHALL be optional; existing task descriptions and public reports SHALL remain usable without a mandatory new metadata field. Explicit replacement or coverage declarations SHALL be checked against the allowed active history. Uncertain relevance, missing lineage and contradictory material SHALL be disclosed for the affected finding rather than silently treated as absence or success.

A main-agent brief SHALL remain reported data, not new user permission or independently verified execution. It SHALL NOT authorize removal of user constraints, restore excluded execution payloads, promote JEV advice into evidence, or change another object's facts. Later user decisions SHALL retain precedence. Needed uncovered report material SHALL NOT be dropped solely by age, a compact-report character budget, or a changed JEV opinion; if it cannot be admitted safely, the affected scope SHALL request a concise current account or remain uncertain.

#### Scenario: Different old facts remain distinguishable
- **WHEN** two task histories differ in a needed earlier format decision, later routine reports fill the compact report budget, and their previous JEV classifications are identical
- **THEN** each next decision receives the still-applicable fact through its source-labelled report or current brief, so the factual inputs remain distinguishable
- **AND** processing completeness alone is not presented as factual preservation

#### Scenario: A current brief replaces declared reports
- **WHEN** a main agent supplies a current account with valid scope and coverage references to earlier public reports
- **THEN** that account can carry the reported facts with explicit lineage and reported-versus-verified status, but covered reports remain supplied and selectable when their primary eligibility is needed or uncertain
- **AND** unrelated reports and user-authority records are not removed by that declaration; supporting references are not an exclusive evidence allowlist

#### Scenario: Legacy task has no brief
- **WHEN** a task has no new current-brief field but its necessary facts are available in permitted descriptions or public reports
- **THEN** those materials remain usable instead of requiring a schema migration or withholding every audit

#### Scenario: Required report cannot be retained
- **WHEN** necessary uncovered factual material cannot fit even after the existing progressing capacity recovery
- **THEN** the affected scope requests a concise account or reports uncertainty, retains completed work, and does not silently discard the fact or traverse repeated sibling combinations

#### Scenario: A later decision supersedes a report
- **WHEN** a later user decision or explicit applicable report update withdraws an earlier plan or changes a needed fact
- **THEN** the current account exposes that change and an older classification, report or coverage declaration cannot restore the superseded authority

#### Scenario: Claimed provenance is unavailable
- **WHEN** a brief names a missing, redacted, abandoned-branch or unsupported source
- **THEN** the gap remains explicit and the claimed reference grants neither execution permission nor independent completion evidence

### Requirement: Provider-compatible Choice candidate sets

Every actual outbound Choice SHALL contain no more than Jev's documented 255 options, counting uncertainty, not-on-board and other fallback options. This structural contract SHALL be checked before provider work and SHALL remain separate from token-window prediction, context rejection and transport retry policy. An invalid local candidate set SHALL NOT be submitted as an admission probe or recorded as an actual rejected envelope.

Evidence candidates SHALL represent applicable supplied facts or public sources for the specific finding, using explicit object/source associations and coverage. The extension SHALL NOT indiscriminately equate every historical source with relevance, guess relevance from keyword/title similarity, truncate to the first or newest 254 sources, silently omit required tasks, or treat excluded evidence as nonexistent. When a necessary set cannot be bounded without unverified loss, the affected finding SHALL remain incomplete with a bounded request for scoped factual material. Independent valid findings and previously completed evaluations SHALL remain reusable under the existing safety rules; no receipt SHALL claim that a locally withheld required question was answered.

Candidate definitions, factual material and provenance changes SHALL participate in evaluation identity and current-input freshness. Unchanged canonical material SHALL remain reusable; modified options or a changed fact/reference SHALL NOT borrow an answer to a different definition. Local withholding SHALL count as zero provider attempts and SHALL NOT manufacture usage, confidence or a model judgment.

#### Scenario: Boundary includes fallback options
- **WHEN** a question has 254 applicable candidates plus one uncertainty option
- **THEN** its 255-option definition is eligible for normal batching and token admission

#### Scenario: Required candidates exceed the limit
- **WHEN** a finding still needs 255 candidates plus an uncertainty option and no verified scoping can reduce that set
- **THEN** that question makes no provider request, remains incomplete and requests scoped material without deleting a candidate or recording a context rejection

#### Scenario: Cold or full review has many historical records
- **WHEN** a cold or full review encounters more than 255 historical source candidates
- **THEN** it uses established applicability to form complete bounded candidate sets or reports the unresolved scope without submitting an oversized Choice; a structurally valid brief and coverage list alone do not bound potentially needed primary reports
- **AND** full mode neither bypasses the option guard nor restores raw execution payloads
- **AND** repeating the same brief is not promised to resolve the limitation and does not repeat an unchanged clarification

#### Scenario: Another Choice is oversized
- **WHEN** a board-matching or other non-evidence Choice exceeds the documented option limit
- **THEN** the same outbound guard withholds its affected finding without silently removing task identities

#### Scenario: One scope is unresolved
- **WHEN** one task's required evidence set cannot be bounded but another task has valid independent findings
- **THEN** the unresolved task gets no unsupported correction, compatible completed work is retained, and the other findings remain eligible under existing authority and freshness rules

#### Scenario: A fact or source definition changes
- **WHEN** an applicable brief, coverage reference or option definition changes while older Choice labels happen to remain the same
- **THEN** the changed material invalidates the old evaluated-pair identity and stale delivery is suppressed
