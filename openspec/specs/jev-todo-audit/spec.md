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

Each eligible periodic, manual or terminal audit SHALL use the uniform evaluation cache before provider work. Missing answers sharing the same effective context SHALL be batched when capacity permits. Context subdivision SHALL process dependent pieces sequentially with the prior piece's cumulative result; independent question batches SHALL not implicitly depend on other answers in the same request. Results from different captured contexts SHALL not be combined as if they evaluated one snapshot.

The request SHALL carry the relevant current board, original task goals as needed, latest applicable structured conclusions and unprocessed macro-level input. Full mode SHALL rebuild the relevant projected history through the same capacity path, not restore execution payloads. No separate summarizer model or paid relevance preflight SHALL be introduced. Reuse/processing status SHALL distinguish a new input from material already assessed. Complete task records and source bodies SHALL be serialized once per envelope and referenced rather than duplicated. Rules shared by every per-task question SHALL be stated once per request in the shared state rather than repeated in each task question; each question SHALL keep its own task scope and complete option set, and changed question definitions SHALL not reuse answers to earlier definitions.

Every visible task SHALL remain represented by identity/status, and unfinished tasks SHALL retain independent lifecycle findings distinguishing ongoing, actionable now, actually completed, cancelled, deliberately deferred, blocked, future and unclear. A required finding can be satisfied by a compatible cached answer or an updated evaluation; it need not be sent again merely because another finding is missing. The label `actually_completed` remains a macro-level assessment of the supplied reports/state, not a claim that JEV independently reran or verified execution. Being unfinished or matched SHALL not itself grant permission to resume.

Board-work matching, drift and interaction findings SHALL remain available with a not-on-board outcome. With no active task, `board_warranted` SHALL distinguish warranted/trivial/idle; with active tasks it SHALL be omitted. Each active task SHALL retain an independent engineering granularity finding under its task-long scope. No aggregate answer SHALL justify mutating unrelated tasks.

Necessary terminal requests SHALL include the observed `STOP_KIND` and supplied reason fields without turning them into authority. A first terminal check SHALL account for its mode even after ordinary review; rewording an already assessed stop on unchanged inputs SHALL not cause another paid evaluation. Empty/all-finished terminal boards SHALL retain their no-request shortcut.

Answers SHALL be validated against the actual requested definitions and supplied record/processed-result references. Derived findings SHALL remain distinguishable from raw user decisions, assistant reports and compact tool events. Cached references SHALL retain a verifiable local lineage without requiring their raw historical bodies to be sent again. Missing or contradictory support SHALL yield an uncertain/no-correction outcome, not invented authority. Current-input freshness, independent-task confidence, compatible-action selection and suppression of unchanged demands SHALL remain in effect; an assistant report SHALL not be rejected solely because it contains no tool call, nor treated as a new user permission.

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

When work is aligned, the extension SHALL take no conversational action unless a separate supported, sufficiently confident task-specific finding requires correction. When work is misaligned, it SHALL inject only the supported corrective steps: reconcile affected tasks, claim authorized current work, or request return from evidenced drift. Corrections SHALL remain custom messages delivered through the existing steer path and SHALL identify affected task IDs and sanitized source evidence.

Confidence SHALL gate each used decision independently, with the configured threshold (default 0.5). Confidence SHALL NOT substitute for required evidence. Missing, unclear, contradictory, or below-threshold evidence SHALL withhold that action and yield at most an uncertainty notification under the repeat-suppression rule; it SHALL NOT suppress supported actions for unrelated tasks.

Parallel `in_progress` tasks SHALL remain valid unless specific evidence identifies a mismatch. Completed tasks SHALL be individually marked completed, cancelled tasks individually deleted, and deliberately deferred tasks returned to a pending/deferred representation with the reason recorded. Blocked tasks SHALL be reconciled only when the board lacks the relevant blocker representation. Tasks already accurately represented as blocked, deferred, or future work SHALL not be blindly resumed or repeatedly reconciled.

An ongoing verdict SHALL leave the task ongoing and SHALL NOT itself authorize a terminal restart. Terminal continuation SHALL require an explicit, supported, sufficiently confident actionable-now verdict establishing work that can proceed within authorization and without unresolved input or dependencies. A current-match result SHALL NOT override lifecycle, blockers, uncertainty, or a newer user decision. The same task SHALL NOT receive contradictory complete/delete/park and claim/continue/split instructions in one correction.

For `no_in_progress_task`, board warrant SHALL gate claim/create steps: trivial or idle activity produces no claim; warranted authorized activity can produce a claim; insufficient confidence/evidence produces notification. Independently supported lifecycle reconciliation remains possible without inventing aggregate alignment or active work. Missing alignment SHALL not prevent an independently supported task-specific correction.

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
- **WHEN** board warrant is below the confidence threshold
- **THEN** no claim/create step depends on it and any uncertainty notice follows repeat suppression

#### Scenario: Drift verdict orders return to board
- **WHEN** supported evidence shows off-plan work and an authorized actionable board task to resume
- **THEN** a correction requests stopping the off-plan activity and returning to that work, without treating an older board plan as superior to newer user instructions

#### Scenario: Low confidence defers to the user
- **WHEN** an aggregate alignment decision is uncertain
- **THEN** it contributes no corrective step, while independent supported task corrections remain possible

#### Scenario: Stale in_progress task gets split nudge
- **WHEN** #4 exceeds the age-review threshold and independent, sufficiently confident task-specific evidence supports splitting its authorized outcomes or checkpoints
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
- **WHEN** an unfinished task has an explicit supported actionable-now verdict and no unresolved permission or dependency
- **THEN** the correction can request continuation of that task and wake the agent through the existing terminal delivery path

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

### Requirement: Configuration

The extension SHALL retain configurable audit interval (default 10), user-message cooldown (default 10), confidence threshold (default 0.5), model (default `jev-latest`), API key source, enable/disable switch, and `staleAuditSpans` (default 3). The age threshold SHALL control diagnostic review, not an unconditional splitting rule.

The deprecated `activityBudgetChars` field SHALL remain load-compatible but SHALL NOT constrain evidence below verified provider hard limits. An explicitly configured legacy value SHALL produce a one-time deprecation notice instead of silently restoring a character budget. No replacement cost-saving character cap, fixed record count, or context-allocation ratio SHALL be imposed.

Configuration SHALL retain its layered precedence: built-in defaults, global user configuration at `<PI_CODING_AGENT_DIR>/jev-todo-audit.json` (default `~/.pi/agent/jev-todo-audit.json`), then trusted-project configuration at `<cwd>/.pi/jev-todo-audit.json`. Project configuration SHALL be read only when the project is trusted.

`apiKey` and `apiKeyEnvVar` SHALL be honored only from the global layer. A nonblank value from the configured environment variable SHALL override the file key. Blank values SHALL count as absent, and session start SHALL warn once when no key resolves. Missing or malformed configuration SHALL fall back safely without failing extension load. The default cooldown SHALL remain one normal default audit cycle and explicit overrides SHALL remain independent of interval.

#### Scenario: Defaults apply when unconfigured
- **WHEN** the extension loads without configuration
- **THEN** interval 10, cooldown 10, threshold 0.5, model `jev-latest`, and age-review threshold 3 apply, without an application character cap

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
- **WHEN** project configuration contains an API key and the global layer has none
- **THEN** the project value is not used as a credential

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

Every necessary provider attempt SHALL obey the configured model's verified state-plus-longest-question and state-plus-all-questions limits. The extension SHALL prefer an authoritative preflight counting contract when available and otherwise use server admission without claiming an exact local fit guarantee. A nominal 30k content chunk SHALL NOT be assumed safe independently of cumulative state, task information, questions, options and serialization overhead. Character/byte counts SHALL NOT be asserted as token counts.

Overflow-driven subdivision SHALL be authorized only by an explicit context/token-overflow rejection or by a per-channel predicted overflow. A predicted overflow SHALL be derived before sending from the actual unanswered envelope, using a bytes-to-tokens ratio calibrated from provider-reported usage on the same endpoint and requested model (a conservative prior until usage exists), checked separately against that channel's published or configured request-wide and state-plus-longest-question limits, or from a recorded actual rejection on the same channel that the envelope equals or exceeds in both dimensions. Predictions SHALL NOT waste admitted capacity by applying a stricter combined limit than the channel publishes. A predicted overflow SHALL NOT count as a provider attempt or be recorded as a rejected envelope, and SHALL NOT alone declare a unit irreducible: a single record/fragment with a single question SHALL still be submitted so server admission decides. Rather than merely discard optional historical records once and abandon an otherwise processable review, the extension SHALL divide unresolved projected context into smaller ordered parts and/or divide independent unresolved questions into smaller batches. Completed context/question evaluations SHALL be reused. New substantive text SHALL NOT be silently omitted to make a request fit. Provider-limit recovery SHALL not restore excluded raw execution detail.

Subdivision SHALL make measurable structural progress toward smaller request contents, SHALL operate over finite input pieces, and SHALL not repeatedly submit an unchanged known-rejected envelope. When a text record must cross request boundaries, fragment identity/order and incomplete-record coverage SHALL remain explicit. When fixed required state or a single question cannot fit even without additional context, processing for the affected scope SHALL stop with an actionable diagnostic or request for a concise main-agent report; it SHALL not loop or claim complete coverage. Independent completed scopes SHALL remain available.

Existing bounded transient-network retries SHALL remain separate. Authentication, quota/rate, generic validation, payload-size and unrecognized errors SHALL NOT be treated as context overflow. A typed provider overflow code (including OpenRouter's `error.metadata.error_type: "context_length_exceeded"`) SHALL count as an explicit overflow; typed credit-cap, per-field length, payload-size, payment, rate and validation codes SHALL NOT. The OpenRouter System One endpoint SHALL be a built-in channel whose single published context window bounds both the request-wide and state-plus-longest-question dimensions. A capacity-complete final result SHALL require all required parts, even if every individual part was valid. Known credentials and unsupported content SHALL be excluded before sending or displaying observations.

#### Scenario: OpenRouter reports a context overflow
- **WHEN** the OpenRouter endpoint rejects a request with `error.metadata.error_type` `context_length_exceeded`
- **THEN** it is treated as an explicit overflow and subdivided like a TypeSafe `max_tokens_exceeded` rejection, while its other typed errors fail through the ordinary isolated error path

#### Scenario: OpenRouter's published window is applied to both dimensions
- **WHEN** an envelope fits TypeSafe direct's 64k request-wide limit but exceeds OpenRouter's single 32K context
- **THEN** it is pre-split on the OpenRouter channel and sent whole on TypeSafe direct

#### Scenario: Relevant context exceeds the old application budget
- **WHEN** permitted macro evidence exceeds 4,000 characters or twenty fragments
- **THEN** those old cutoffs do not silently remove it; processed results and capacity-aware pieces provide the reduction

#### Scenario: State exceeds its own limit while total request fits
- **WHEN** state plus the longest question exceeds its limit
- **THEN** recovery reduces the unresolved state rather than only splitting other questions that leave the offending state unchanged

#### Scenario: Questions cause a request overflow
- **WHEN** shared state fits but all unresolved questions together exceed the request-wide limit
- **THEN** independent question batches use the same frozen state, retain answered questions in the cache, and combine only valid results from that state

#### Scenario: Reduction removes evidence needed to split a task
- **WHEN** a task's required macro span is still partly unprocessed or unavailable
- **THEN** no definitive split instruction is issued from the incomplete intermediate result

#### Scenario: Token accounting is unverified
- **WHEN** no authoritative tokenizer/counting contract is available
- **THEN** admission and strictly progressing subdivision are used without claiming that a character estimate or fixed 30k body proves fit

#### Scenario: A predictably oversized envelope is split before sending
- **WHEN** the calibrated estimate of the unanswered envelope exceeds a published limit of its channel, or the envelope is at least as large as a recorded rejection on that channel in both dimensions
- **THEN** it is subdivided through the same structural path without a provider request, and no rejection is recorded for it

#### Scenario: Channel capacity is used rather than a stricter guess
- **WHEN** state plus the longest question fits its channel limit and state plus all questions fits the request-wide limit
- **THEN** the envelope is sent whole even if its total exceeds the smaller per-question limit

#### Scenario: A prediction does not declare a unit irreducible
- **WHEN** one record or fragment with one question is still predicted too large
- **THEN** it is sent once and only an actual rejection can end processing for that scope

#### Scenario: Learning survives reload
- **WHEN** the extension reloads on the same branch after admitted and rejected attempts were recorded
- **THEN** the channel's calibrated ratio and recorded rejections are restored from the existing non-context diagnostics without re-sending anything

#### Scenario: A validation error is not an overflow
- **WHEN** a request fails for invalid question syntax or an unfamiliar error
- **THEN** it fails through the ordinary isolated error path without treating the error as permission to crop or subdivide evidence

#### Scenario: Recovery still exceeds the provider limit
- **WHEN** a smaller projected part still receives `max_tokens_exceeded`
- **THEN** it is subdivided further only if structural progress is possible, without resending completed parts or looping on the same rejected request

#### Scenario: Sensitive or unsupported material is present
- **WHEN** input contains known credentials, hidden thinking or raw binary/image data
- **THEN** that content is not exported and consequential gaps remain explicit

#### Scenario: Protected new text spans several requests
- **WHEN** the macro-projected unprocessed history is too large for one request but fits as ordered pieces
- **THEN** all pieces are processed through rolling conclusions without dropping the oldest or newest text merely because it was protected in the old collector

#### Scenario: A question is irreducibly too large
- **WHEN** required fixed state or a single question cannot fit independently of the next context piece
- **THEN** the affected scope reports what must be shortened or clarified, retains completed results and does not continue an unbounded rejection loop

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

Every JEV question handled by the extension SHALL use the same result-reuse rule, regardless of whether it concerns alignment, lifecycle, task granularity, a processing chunk, or another audit decision. Within the approved same-object/session scope, an identical effective projected context, complete question definition and model/rule identity SHALL reuse its stored valid answer without a provider call. Similar wording on different objects SHALL NOT establish identity.

Reuse SHALL operate per question, not only per whole audit or previously emitted correction. A batch SHALL request only its unresolved questions, combining independent misses that share a context when capacity permits. Identical in-flight evaluations within the runtime SHALL share work. Valid low-confidence, uncertain, aligned and no-correction answers SHALL also be stored without becoming stronger findings. Invalid or missing answers SHALL NOT be substituted with an older confident answer.

Completed evaluations SHALL be persisted through existing session storage and restored when their identity and active-history scope remain applicable. A TODO update, reload, later chunk failure or ordinary retry SHALL NOT by itself cause an identical completed evaluation to be sent again. New judgment-relevant content or a changed question is a different evaluation. Explicit forced review is the documented exception, not an automatic periodic refresh.

#### Scenario: Every decision category uses the cache
- **WHEN** identical context and question definitions are submitted again for alignment, lifecycle, granularity or chunk processing
- **THEN** each stored valid answer is returned without another provider evaluation of that pair

#### Scenario: Only one question is new
- **WHEN** questions A and B have valid cached answers for a context and C does not
- **THEN** the provider receives C only and the caller receives the combined A, B and C answers

#### Scenario: Concurrent identical work
- **WHEN** two callers within the runtime request the same unresolved context/question pair concurrently
- **THEN** they share the evaluation instead of issuing duplicate provider work for that pair

#### Scenario: No correction was emitted
- **WHEN** a previous valid result was aligned, uncertain or otherwise produced no correction
- **THEN** that result remains reusable rather than requiring a sent reminder as the cache record

#### Scenario: Question meaning changes
- **WHEN** instructions, criteria, options, model/rules or material context change
- **THEN** the changed evaluation does not receive an answer cached for the different definition

#### Scenario: A partial response has useful answers
- **WHEN** a batch returns valid A and B answers but no valid C answer
- **THEN** A and B remain stored, and a subsequent ordinary attempt does not ask them again merely to obtain C

#### Scenario: Transport failure is not a judgment
- **WHEN** an evaluation fails or its answer is invalid
- **THEN** no successful judgment is invented or cached for the unresolved pair

### Requirement: TODO-defined state segments

A successful actual change to the persisted TODO snapshot SHALL establish a new state segment. Reads, failed updates and updates with no state change SHALL NOT establish a new segment. Segmentation SHALL NOT add an immediate paid audit for each update; existing cadence, cooldown, manual and terminal eligibility rules SHALL remain the trigger policy.

Local status review SHALL consider the latest task state and unprocessed segment information together with applicable prior conclusions. A new segment SHALL NOT erase completed evaluations or restart a task's macro history. Current TODO requirements, dependencies, ownership and available state SHALL remain explicit, without requiring a designated blocker metadata field.

#### Scenario: Update followed by another update
- **WHEN** a task description changes and its status changes later
- **THEN** both state transitions remain ordered review events without requiring two immediate JEV calls

#### Scenario: Read-only TODO operation
- **WHEN** the agent lists the board or repeats an update that leaves it unchanged
- **THEN** that operation alone does not create a new TODO state segment

#### Scenario: A segment is not a new task
- **WHEN** the same task receives a blocker note or active-form update
- **THEN** local review observes the new state while its prior valid evaluations and first-active origin remain available

### Requirement: Resumable rolling conclusions

The audit SHALL carry forward the latest structured conclusions and relevant task state rather than repeatedly submit previously processed raw context. A rolling result SHALL replace the previous cumulative result for its scope; the request SHALL NOT grow by concatenating every earlier summary or result. Stored conclusions are revisable findings, not independent user authority or a guarantee of lossless prose summarization.

Reported work, JEV opinions and processing progress SHALL remain distinguishable. Required macro facts—task goal, reported stage outcomes, blockers and open questions—SHALL come from permitted task state or main-agent reports, not be invented from a classification or completed-range marker. A newer opinion or cursor SHALL NOT silently erase a still-applicable supplied report. When a necessary compact account is unavailable, the leader SHALL request clarification through the normal main-agent feedback path or retain uncertainty, not pretend that a previous answer contains the missing facts.

A processing range SHALL be marked complete only after its required questions have valid answers and its cumulative result is durably recorded for the captured inputs. An unchanged result SHALL still advance that range. Missing answers or a failed chunk SHALL NOT advance its range, but SHALL NOT discard valid question answers or completed earlier ranges. Compatible reload/compaction SHALL restore recorded progress rather than replay already processed raw history solely because volatile memory was lost. Unverifiable or abandoned-branch records SHALL not be promoted into current findings.

Intermediate chunk results SHALL remain internal review state. They SHALL NOT become final completion/split/continuation advice while required later parts of that review remain unprocessed. A result invalidated by new user/board/branch state SHALL NOT be delivered as current advice; storing an answer under its immutable historical input identity is separate from authorizing current delivery.

#### Scenario: An unchanged chunk advances progress
- **WHEN** events 101 through 120 are processed successfully and the conclusions remain unchanged
- **THEN** later review continues after event 120 rather than asking JEV to process that interval again

#### Scenario: Reported progress survives an opinion update
- **WHEN** a main-agent report states that investigation is complete and rollout awaits approval, and a later JEV answer updates only the task's granularity
- **THEN** the reported outcome and blocker remain available in the macro account; neither the new granularity label nor an advanced cursor substitutes for them

#### Scenario: A later chunk fails
- **WHEN** chunks 1 and 2 have persisted completed results and chunk 3 fails
- **THEN** an ordinary resumption reuses the first two results and processes only the unresolved work, not chunks 1 and 2 again

#### Scenario: No chain of duplicate summaries
- **WHEN** chunk 3 follows two completed chunks
- **THEN** its input carries the cumulative result after chunk 2 rather than both earlier results and their raw context

#### Scenario: Compaction preserves a valid review receipt
- **WHEN** raw context is compacted but the persisted same-history result and its covered range remain verifiable
- **THEN** the extension retains that progress without requiring the raw bodies to be resent to JEV

#### Scenario: Later evidence contradicts an intermediate result
- **WHEN** an early chunk suggests completion but a later required chunk contains a contrary user decision or report
- **THEN** no completion instruction is issued from the intermediate result, and the final review accounts for the later information

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

The extension SHALL report compact observations for cache hits/misses, actual provider attempts, projected state/question sizes, chunk progress, response model and provider-reported input/output usage when available. Retries, recovery and stale responses SHALL count as attempts; missing usage SHALL be unknown rather than zero. A provider-reported charge (such as OpenRouter `usage.cost` in USD) SHALL be recorded per attempt and totalled; a channel that reports no charge SHALL show none rather than zero, and a total with any attempt lacking a reported charge SHALL be unknown. Cached answers SHALL not charge their original usage again. Accounting SHALL not export transcript bodies or credentials or trigger additional evaluations.

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
- **THEN** the report marks its cost unknown and does not claim a complete dollar total

#### Scenario: Short-context overhead is measurable
- **WHEN** rolling-state overhead makes a short-context request larger than its baseline
- **THEN** that regression appears alongside savings on other workloads rather than being omitted from the comparison

#### Scenario: A provider reports the charge
- **WHEN** every attempt of an audit on OpenRouter reports `usage.cost`
- **THEN** diagnostics record each charge and their USD total, and a channel without reported charges shows no dollar total
