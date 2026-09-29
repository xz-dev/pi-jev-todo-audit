## ADDED Requirements

### Requirement: Relevant recent and global evidence

The audit SHALL select evidence for its current decisions before checking capacity. It SHALL provide a recent view of the latest complete user/assistant/tool interaction and a global view of applicable goals, authorization, constraints, acceptance criteria, and task relationships from the current effective conversation. It SHALL preserve chronology, source identity, and the relationship between a tool call and its result. Existing conversation summaries SHALL be identified as summaries, not direct execution evidence; abandoned branches SHALL NOT become current evidence.

The selection SHALL include relevant visible user/assistant text, tool arguments and results, error or missing-result information, visible extension messages, and related persisted task details. General conversation collection SHALL NOT require particular tool names, task metadata keys, or private tool implementations. The existing board persistence adapter SHALL remain separate from that collection.

Supporting, contradictory, and superseding evidence SHALL receive the same relevance treatment. The audit SHALL remove duplicate records and omit clearly unrelated historical payloads rather than fill available capacity. It SHALL distinguish irrelevant, duplicate, unavailable, unsupported, redacted, and capacity-truncated material in its coverage information. Uncertain relevance or absent evidence SHALL NOT be represented as proof that a fact does not exist.

#### Scenario: A visible failure contradicts an assistant completion claim
- **WHEN** the assistant says a task is complete but a relevant visible tool result reports a failed acceptance check
- **THEN** the request contains both the claim and the linked failure, identifies their sources, and does not represent the assistant claim as verified completion

#### Scenario: An unfamiliar tool supplies relevant evidence
- **WHEN** an unfamiliar tool returns a visible result relevant to a task or user decision
- **THEN** its call and result enter the audit through the public conversation representation without requiring a tool-specific parser

#### Scenario: A later user refusal changes the plan
- **WHEN** an earlier plan authorizes deployment and a later user message withdraws that permission
- **THEN** the audit preserves the later refusal and its order relative to the plan rather than treating the old plan as current authorization

#### Scenario: Blocker information is outside a special metadata key
- **WHEN** a task's blocker or acceptance condition is recorded in its description, ordinary conversation, or a relevant tool result
- **THEN** the audit can use that information without requiring a designated metadata field

#### Scenario: Compacted context retains the global goal
- **WHEN** the effective conversation includes a compaction summary of the authorized goal and later unsummarized work
- **THEN** the request includes relevant summary context and subsequent decisions, without presenting abandoned branches or duplicated pre-compaction payloads as current work

#### Scenario: A repeated audit message is not new authority
- **WHEN** a previous audit correction is visible in the recent interaction
- **THEN** it is identified as previous advice and is not treated as independent proof of completion, permission, or a need to split

#### Scenario: Spare capacity does not justify unrelated payloads
- **WHEN** relevant context fits the provider limit and the history also contains an unrelated documentation dump and repeated identical logs
- **THEN** the unrelated and duplicate payloads remain excluded even though more capacity is available

#### Scenario: Human-visible evidence is unavailable to the collector
- **WHEN** a relevant fact exists only in an unrecorded UI element or unsupported non-text content
- **THEN** the request describes the unavailable evidence instead of inventing its content or interpreting absence as approval

### Requirement: Provider context limits without artificial quotas

Selected evidence that fits the configured model's verified hard context limits SHALL NOT be shortened by an application character budget, fixed record count, fixed context-allocation ratio, or cost-saving target. The hard limit SHALL be a capacity ceiling, not a filling target.

The extension SHALL prefer an authoritative provider tokenizer/counting contract when available; otherwise it SHALL use the explicitly authorized server-admission fallback. It SHALL submit the actual state and all questions together so the provider enforces both its request-wide and state-plus-longest-question limits. It SHALL NOT substitute character counts, an unrelated tokenizer, or undocumented model metadata, or claim that the initial request is guaranteed to fit. Only an accepted valid response SHALL supply corrective verdicts.

Only an explicit server context/token-overflow response SHALL authorize capacity-driven reduction. The extension SHALL construct at most one smaller recovery request per audit, retaining decisive current instructions, complete call/result groups, applicable summaries, and current task requirements. It SHALL disclose omitted evidence and rebuild source options. Generic validation, authentication, quota, rate-limit, payload-size, and unrecognized errors SHALL NOT authorize cropping. If protected evidence cannot be reduced or the recovery attempt still fails, the audit SHALL be skipped rather than silently dropping tasks or retrying indefinitely. Actions requiring omitted evidence SHALL be withheld.

Known credentials and hidden thinking SHALL be excluded from outbound evidence regardless of capacity. Raw binary/image content SHALL NOT be exported as text evidence. Source excerpts in corrective messages SHALL use the same sanitized content as the request.

#### Scenario: Relevant context exceeds the old application budget
- **WHEN** relevant evidence exceeds 4,000 characters or twenty historical text fragments but the complete request fits both verified provider limits
- **THEN** it is not truncated merely because it exceeds either legacy cutoff

#### Scenario: State exceeds its own limit while total request fits
- **WHEN** the request fits the provider's request-wide limit but state plus its longest question exceeds the applicable second limit
- **THEN** an explicit provider rejection leads to one disclosed recovery attempt or a skipped audit; the larger total allowance is not used to disregard the state limit

#### Scenario: Questions cause a request overflow
- **WHEN** state alone fits but adding all questions and criteria exceeds the request-wide limit
- **THEN** the provider evaluates the complete request, and an explicit overflow response is handled without claiming a state-only local estimate proves fit

#### Scenario: Reduction removes evidence needed to split a task
- **WHEN** hard-limit reduction omits the global requirement or task acceptance context needed to assess a split
- **THEN** the audit marks that gap and issues no split directive based on the missing information

#### Scenario: Token accounting is unverified
- **WHEN** no usable official tokenizer or preflight counting contract has been obtained
- **THEN** the authorized server-admission fallback is used without claiming an exact local count or applying a substitute character budget

#### Scenario: A validation error is not an overflow
- **WHEN** the server rejects a malformed question or returns an unrecognized input error
- **THEN** the audit fails safely without removing evidence or treating every input error as a context-limit rejection

#### Scenario: Recovery still exceeds the provider limit
- **WHEN** the one recovery request also receives a context-overflow error, or no optional evidence can be removed
- **THEN** no further context-recovery attempt occurs and the failure is reported without task mutation

#### Scenario: Sensitive or unsupported material is present
- **WHEN** a selected record contains known credential material, hidden thinking, or raw binary/image content
- **THEN** the excluded material is not sent and any consequential evidence gap is disclosed

### Requirement: Engineering-grounded granularity assessment

Each active task's granularity assessment SHALL consider its level and authorized purpose, completion evidence, concrete next action, useful feedback or handoff boundaries, and the benefit of subdivision relative to existing tasks. It SHALL distinguish a feature/story from an engineering execution task or waiting item without requiring a new tool-specific field.

A split recommendation SHALL identify evidence of separable outcomes or verifiable checkpoints that improve tracking or coordination while preserving the authorized goal and avoiding duplicate work. One overall goal SHALL NOT automatically exempt an oversized task from subdivision. Multiple files, tools, tests, workflow steps, conjunctions, or elapsed loops SHALL NOT independently mandate subdivision.

Unclear completion criteria, an unclear next action, a known blocker, and insufficient evidence SHALL be distinct from a supported need to split. Age SHALL trigger review of progress and impediments, not a universal size verdict. The extension SHALL NOT claim that project loop thresholds are industry-standard timeboxes or calibrated task-effort estimates.

#### Scenario: A feature crosses architectural layers
- **WHEN** one coherent behavior requires UI, business logic, persistence, and multiple checks
- **THEN** those implementation parts alone do not cause the feature to be split into horizontal component tasks

#### Scenario: A technical task has a verifiable non-release outcome
- **WHEN** an investigation task has a concrete next action and a checkable outcome such as a reproducible failure and a supported root-cause finding
- **THEN** it is not considered defective merely because it does not independently ship a marketable feature

#### Scenario: One large goal needs meaningful checkpoints
- **WHEN** an item has one overall goal but evidence identifies separable, verifiable investigation or delivery checkpoints whose absence obscures progress
- **THEN** the audit can recommend scoped subdivision despite the single overall goal, provided those checkpoints are authorized and not already tracked

#### Scenario: A long-running task is making useful progress
- **WHEN** a task has exceeded the configured age-review threshold but its scope, completion condition, next action, and observable progress remain appropriate
- **THEN** age alone produces no split directive

#### Scenario: The next action is unclear rather than blocked
- **WHEN** the available context does not define a concrete executable or investigative next step
- **THEN** the audit requests clarification for that task rather than automatically demanding smaller tasks

#### Scenario: A known next action awaits approval
- **WHEN** the next action is clear but requires user approval or an unresolved dependency
- **THEN** the audit identifies the blocker instead of interpreting inability to start as evidence of excessive task size

#### Scenario: Existing tasks already cover the apparent subdivisions
- **WHEN** related board tasks already represent the independent outcomes or checkpoints of a coordinating item
- **THEN** the audit does not request duplicate child tasks solely because the coordinating description mentions those outcomes

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

## MODIFIED Requirements

### Requirement: Audit request content

Each eligible periodic, manual, or terminal-stop audit SHALL send one batched question set per request attempt to the TypeSafe API (`POST /v1/systemone`, default model `jev-latest`) containing the current visible board and selected recent/global evidence under the context, privacy, and provider-limit requirements. Existing transient retries and the single authorized overflow recovery SHALL NOT combine verdicts from different evidence snapshots. The request SHALL include relevant visible conversation and task details rather than relying on task titles and assistant narration alone. It MUST NOT depend on hidden model thinking or chain-of-thought content.

The request SHALL represent every visible task with its status and SHALL support multiple simultaneous `in_progress` tasks as independent work items. Each visible unfinished task SHALL receive an independent lifecycle assessment distinguishing at least ongoing work, work actionable now, actually completed, cancelled, deliberately deferred, blocked, future work, and unclear state. Being unfinished or queued next SHALL NOT alone imply authorization to execute now. A single lifecycle answer SHALL NOT be applied to unrelated tasks.

The request SHALL retain a board-work matching assessment, including a not-on-board outcome. A primary match SHALL identify correspondence, not override another task's lifecycle or readiness. When triggered by `pi:semantic-hook:v1` / `user-ready`, it SHALL include the explicit `STOP_KIND` and supplied `REASON_TYPE` and `REASON` as evidence rather than authority.

When the board has no `in_progress` task, the request SHALL include `board_warranted` with `warranted`, `trivial`, and `idle` outcomes. When at least one task is active, that question SHALL be omitted. Every active task SHALL receive its own engineering-grounded granularity assessment; no aggregate worst-offender answer SHALL authorize splitting all active tasks. With no active task, no task-specific granularity assessment is required.

Proposed corrective decisions SHALL carry references to evidence supplied in that request, with an explicit insufficient-evidence outcome. Invalid choices, unknown task/source references, invalid confidence values, or missing required evidence SHALL NOT become mutation or continuation authority.

#### Scenario: One request carries all questions
- **WHEN** an audit has sufficient representable evidence and fits the configured model's verified limits
- **THEN** its questions are batched into one request with the board and selected context as shared state

#### Scenario: Board options reflect current snapshot
- **WHEN** the board contains tasks #3 and #5 and an audit fires
- **THEN** the match options include #3 and #5 with subject/status and a not-on-board option

#### Scenario: Granularity question always present
- **WHEN** tasks #3 and #5 are active during an audit
- **THEN** each receives a separate granularity assessment using the shared global goal, recent evidence, and task relationships

#### Scenario: Empty board still audited
- **WHEN** a periodic or manual audit fires with no visible tasks
- **THEN** the request represents the empty board, offers only the not-on-board match, and includes `board_warranted`

#### Scenario: All-done board also asks warrant
- **WHEN** no visible task is `in_progress`
- **THEN** an eligible audit includes `board_warranted`

#### Scenario: Warrant question omitted when work is claimed
- **WHEN** at least one task is `in_progress`
- **THEN** `board_warranted` is absent from the request

#### Scenario: Multiple active tasks receive independent assessments
- **WHEN** #5 and #7 are both `in_progress`
- **THEN** the request supports separate lifecycle results and evidence for #5 and #7

#### Scenario: One active task remains ongoing
- **WHEN** supported lifecycle evidence says #5 is completed and #7 remains ongoing
- **THEN** the periodic verdict preserves #7 as active and only proposes resolving #5

#### Scenario: Terminal stop includes watchdog reason
- **WHEN** a `user-ready` event includes `AI_UNLOCK`, `JOB_DONE`, and a reason
- **THEN** those explicit values are included without attempting to recover hidden watchdog reasoning or treating the reason as completion proof

#### Scenario: Hidden thinking is unavailable
- **WHEN** relevant facts exist only in hidden thinking and no visible or permitted supplemental evidence establishes them
- **THEN** the audit treats the conclusion as unsupported rather than inferring the hidden reasoning

#### Scenario: Empty board still audited when work remains
- **WHEN** an eligible periodic or manual audit finds no visible tasks but observable evidence indicates unfinished authorized work
- **THEN** it evaluates the missing task claim subject to board-warrant and evidence rules; terminal-stop checks retain their no-unfinished-tasks short-circuit

#### Scenario: Empty board at terminal stop
- **WHEN** a terminal-stop check finds no unfinished visible tasks
- **THEN** it takes no corrective action, as required by the terminal-stop board check

#### Scenario: A model cites a source that was not supplied
- **WHEN** a corrective answer references an unknown source or task, or lacks valid confidence/evidence
- **THEN** that answer is rejected for corrective use without disturbing independent valid results

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
