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

Each periodic or terminal-stop audit SHALL send one request to the TypeSafe API (`POST /v1/systemone`, model `jev-latest`) containing the current visible todo snapshot and a bounded summary of observable recent activity. Observable activity MAY include visible assistant text, user text, tool-call names, and explicit terminal-stop metadata. The request MUST NOT depend on hidden model thinking or chain-of-thought content.

The request SHALL represent every visible task with its status and SHALL support multiple simultaneous `in_progress` tasks as independent work items. For each active `in_progress` task, the request SHALL obtain an independent lifecycle assessment covering at least: still ongoing, actually completed, cancelled, deliberately deferred, or unclear. The request MAY also assess pending tasks for obsolete, still relevant, blocked, or deferred state when evidence supports it. A single lifecycle answer SHALL NOT be applied to unrelated tasks.

The request SHALL retain a board-work matching assessment for identifying current work, including a not-on-board outcome. Matching evidence MAY identify a primary task, but it SHALL NOT invalidate other active tasks that are independently assessed as ongoing. When triggered by `pi:semantic-hook:v1` / `user-ready`, the request SHALL include the hook's explicit `STOP_KIND` and any supplied `REASON_TYPE` and `REASON` values as evidence.

When the board has no `in_progress` task — either empty or with all tasks `pending`/`completed` — the request SHALL additionally include a `board_warranted` Choice question asking whether the agent's current activity warrants tracking on a todo board, with options `warranted` / `trivial` / `idle`. When at least one task is `in_progress` this question SHALL be omitted. The `granularity` question SHALL be sent on every audit regardless of board state.

#### Scenario: One request carries all questions
- **WHEN** an audit fires
- **THEN** all audit questions are sent in a single TypeSafe request with the todo snapshot and activity summary as state

#### Scenario: Board options reflect current snapshot
- **WHEN** the board contains tasks #3 and #5 and the audit fires
- **THEN** the match question's options include #3 and #5 with subject and status plus a not-on-board option

#### Scenario: Granularity question always present
- **WHEN** an audit fires with any board state
- **THEN** the `granularity` question is present with options `single_verifiable_outcome`, `bundles_multiple_outcomes`, `ambiguous_done_criteria`, `not_applicable`

#### Scenario: Empty board still audited
- **WHEN** an audit fires and no visible tasks exist
- **THEN** the request is sent with an empty board, the match question offers only the not-on-board option, and `board_warranted` is included

#### Scenario: All-done board also asks warrant
- **WHEN** an audit fires and every visible task is `completed` or `pending` with none `in_progress`
- **THEN** `board_warranted` is included

#### Scenario: Warrant question omitted when work is claimed
- **WHEN** an audit fires and at least one task is `in_progress`
- **THEN** `board_warranted` is not present in the request

#### Scenario: Multiple active tasks receive independent assessments
- **WHEN** the board contains #5 and #7 both marked `in_progress`
- **THEN** the request can produce one lifecycle result for #5 and a separate lifecycle result for #7

#### Scenario: One active task remains ongoing
- **WHEN** jev assesses #5 as actually completed and #7 as still ongoing
- **THEN** the resulting verdict preserves #7 as active and only proposes resolving #5

#### Scenario: Terminal stop includes watchdog reason
- **WHEN** a `user-ready` event contains `STOP_KIND=AI_UNLOCK`, `REASON_TYPE=JOB_DONE`, and a reason
- **THEN** the audit state includes those explicit values and does not attempt to recover hidden watchdog reasoning

#### Scenario: Hidden thinking is unavailable
- **WHEN** provider activity contains hidden thinking blocks but no corresponding visible text or tool evidence
- **THEN** the audit proceeds from observable evidence and treats unsupported conclusions as uncertain rather than assuming the hidden reasoning

#### Scenario: Empty board still audited when work remains
- **WHEN** a terminal-stop check finds no visible tasks but observable activity indicates unfinished authorized work
- **THEN** the verdict may request a corrective task claim, subject to confidence and board-warrant rules

### Requirement: Verdict handling and corrective injection

When the verdict says work is aligned with the board, the extension SHALL take no conversational action unless a separate high-confidence lifecycle, stale, or granularity finding requires a task-specific correction. When the verdict says misaligned, the extension SHALL inject a corrective message into the conversation (a `custom` context message delivered via `steer` so it lands at the next turn boundary of the running loop) that instructs the agent to reconcile only the affected board tasks: resolve completed, cancelled, ongoing, or deferred state per the per-task verdict, add or set `in_progress` the task matching actual work, and resume board order if the verdict says the work drifted. The injected message SHALL state the audit evidence and affected task IDs. When any used per-task verdict has confidence below the configured threshold (default 0.5), the extension SHALL NOT inject a destructive or state-changing correction for that task and SHALL notify the user instead.

Multiple `in_progress` tasks SHALL be treated as valid parallel work unless evidence identifies a specific task mismatch. For a task assessed as actually completed, the corrective message SHALL ask the agent to mark only that task completed. For a task assessed as cancelled, it SHALL ask the agent to delete only that task. For a task assessed as deliberately deferred, it SHALL ask the agent to return only that task to a deferred/pending representation with the reason recorded. In a periodic audit, tasks assessed as still ongoing SHALL remain untouched; in a terminal-stop audit, a confident still-ongoing verdict SHALL instead produce a continuation step that pushes the agent to resume that task (the agent already stopped, so the injected corrective also wakes it for a new turn rather than queuing silently). Unclear or low-confidence task results SHALL produce notification rather than destructive correction or continuation.

When the alignment verdict is `no_in_progress_task` and `board_warranted` is present, the extension SHALL consult it before injecting: `trivial` or `idle` SHALL produce silence; `warranted` SHALL produce the existing corrective inject; low-confidence `board_warranted` SHALL produce a user notification rather than an inject. When the alignment verdict is absent but task lifecycle evidence is actionable, the extension SHALL use the per-task result path without inventing an aggregate alignment answer.

The extension SHALL additionally detect over-coarse `in_progress` tasks and nudge the agent to split them. A task SHALL be flagged stale when it has remained `in_progress` for more than `staleAuditSpans × interval` completed loops (default: more than 3 × interval loops, i.e. spanning over 3 audit intervals). When a task is stale, or when a task is `in_progress` and the `granularity` answer is `bundles_multiple_outcomes` or `ambiguous_done_criteria` at or above the confidence threshold, the corrective message SHALL include a step instructing the agent to split the flagged task into single-verifiable-outcome tasks. The split nudge rides the existing inject path.

When a terminal-stop check finds visible unfinished tasks, the extension SHALL audit them and SHALL NOT continue solely because a pending or `in_progress` task exists. It SHALL continue or inject a correction only when the verdict identifies actionable authorized work or a concrete board-state mismatch. A terminal-stop check SHALL not treat a human abort as an autonomous stop, and it SHALL not require the watchdog producer to be present for periodic audits.

When any corrective action is injected, the message SHALL identify affected task IDs and the evidence used. Per-task confidence SHALL gate destructive or state-changing recommendations independently, so uncertainty about one task does not force a correction or suppression decision for unrelated tasks.

#### Scenario: Aligned verdict is silent
- **WHEN** jev answers that current work matches the in_progress task and no stale, coarse, or lifecycle finding applies
- **THEN** no message is injected into the conversation

#### Scenario: Misaligned verdict injects correction
- **WHEN** jev answers that the displayed in_progress task is actually completed and the current work matches no board task
- **THEN** a corrective message is injected naming the affected task ID and the required board updates, and it reaches the agent at the next turn boundary

#### Scenario: No in_progress task while agent works
- **WHEN** jev answers `no_in_progress_task` (board has none marked) and the agent is actively working
- **THEN** a corrective message is injected telling the agent to claim the current work (set the matching task in_progress, or create it when nothing matches)

#### Scenario: Empty board and work is trivial or idle
- **WHEN** jev answers `no_in_progress_task` and `board_warranted` is `trivial` or `idle`
- **THEN** no message is injected and no notification is sent

#### Scenario: All-done board and work is trivial or idle
- **WHEN** the board's visible tasks are all `completed`/`pending` and jev answers `no_in_progress_task` + `board_warranted` is `trivial` or `idle`
- **THEN** no message is injected and no notification is sent

#### Scenario: Empty board and work is warranted
- **WHEN** jev answers `no_in_progress_task` and `board_warranted` is `warranted`
- **THEN** a corrective message is injected telling the agent to create todo task(s) and mark one in_progress

#### Scenario: Warrant answer low confidence
- **WHEN** jev answers `no_in_progress_task` and `board_warranted` is present but its confidence is below the threshold
- **THEN** a user notification describes the uncertainty and no corrective message is injected

#### Scenario: Drift verdict orders return to board
- **WHEN** jev answers that the agent drifted from the plan
- **THEN** the injected message instructs the agent to stop the off-plan work and resume the next board task

#### Scenario: Low confidence defers to the user
- **WHEN** the alignment verdict's confidence is below the threshold
- **THEN** no corrective message is injected and a user notification describes the uncertain verdict

#### Scenario: Stale in_progress task gets split nudge
- **WHEN** task #4 has been in_progress for more than 3 × interval completed loops (e.g. >30 loops at interval 10) and the alignment verdict is `aligned`
- **THEN** a corrective message is injected whose steps instruct splitting #4 into single-verifiable-outcome tasks

#### Scenario: Granularity verdict bundles outcomes
- **WHEN** the `granularity` answer is `bundles_multiple_outcomes` with confidence at or above the threshold and a task is in_progress
- **THEN** the injected corrective message contains a split instruction naming the affected task

#### Scenario: Granularity answer not applicable
- **WHEN** the `granularity` answer is `not_applicable` or `single_verifiable_outcome`
- **THEN** no split instruction is added on granularity grounds alone

#### Scenario: Parallel task correction is scoped
- **WHEN** #5 is assessed as actually completed and #7 as still ongoing
- **THEN** the injected message asks to complete #5 and does not ask to change #7

#### Scenario: Parallel tasks are not an error by themselves
- **WHEN** multiple `in_progress` tasks are active and each remains consistent with observable work
- **THEN** no correction is injected solely because more than one task is active

#### Scenario: Cancelled task is deleted individually
- **WHEN** #5 is assessed as cancelled with confidence at or above the threshold
- **THEN** the correction names #5 for deletion and does not delete other tasks

#### Scenario: Uncertain lifecycle result is safe
- **WHEN** jev cannot distinguish whether #5 is ongoing, completed, cancelled, or deferred
- **THEN** no destructive correction is injected for #5 and the user is notified of uncertainty

#### Scenario: Terminal stop with actionable unfinished task
- **WHEN** the agent reaches an autonomous terminal stop, the board contains an unfinished task, and jev identifies an authorized next action that can run without user input
- **THEN** a corrective steer may request continuation or board reconciliation for the specific task

#### Scenario: Terminal stop with blocked unfinished task
- **WHEN** the board contains unfinished tasks but jev determines that progress requires user input, approval, credentials, or an external blocker
- **THEN** the extension does not blindly continue and instead reports or injects the blocker-specific reconciliation

#### Scenario: Terminal stop with only future or intentionally deferred tasks
- **WHEN** the agent reaches an autonomous terminal stop and all unfinished board tasks are future work, blocked work, or intentionally deferred
- **THEN** the extension does not treat their existence alone as evidence that the agent must continue

#### Scenario: Watchdog producer is absent
- **WHEN** `pi-continue-watchdog` is not loaded or does not publish `user-ready`
- **THEN** periodic audits continue with existing behavior and no integration error blocks the agent loop

Audit execution SHALL never block, abort, or corrupt the agent loop. A periodic or terminal-stop audit network error, timeout, malformed response, or semantic-hook consumer error SHALL be contained. A failed terminal-stop audit SHALL not cause an arbitrary retry loop; later periodic triggers or a new terminal-stop event may perform a fresh audit.

The extension SHALL read todo state only from persisted session branch data and SHALL NOT import or call into `rpiv-todo` internals. The extension SHALL consume the neutral semantic hook as optional plain data and SHALL not require a direct dependency on `pi-continue-watchdog`.

#### Scenario: API failure does not disturb the run
- **WHEN** the TypeSafe API call fails or times out during an audit
- **THEN** the agent loop continues unaffected, the failed audit is not retried at an arbitrary time, and the next audit waits for the next trigger point

#### Scenario: Terminal-stop API failure does not disturb the run
- **WHEN** the TypeSafe request fails during a terminal-stop check
- **THEN** the agent remains stopped or continues under the watchdog's existing state, at most one bounded notification is produced, and no uncontrolled retry is started

#### Scenario: Semantic hook listener failure is isolated
- **WHEN** the `user-ready` event is malformed or the audit listener throws
- **THEN** the watchdog and agent lifecycle continue unaffected

#### Scenario: No coupling to rpiv-todo internals
- **WHEN** the audit reads todo state
- **THEN** it reconstructs the snapshot from persisted todo tool results without importing rpiv-todo modules

### Requirement: Configuration

The extension SHALL be configurable with: audit interval (default 10), user-message cooldown loops (default 10), confidence threshold (default 0.5), model name (default `jev-latest`), API key source, an enable/disable switch, and the stale-task age threshold in audit spans (`staleAuditSpans`, default 3).

The extension SHALL preserve the existing layered configuration precedence and project-secret restrictions. The default cooldown value SHALL represent one complete default audit cycle while remaining explicitly configurable.

Configuration SHALL be loaded from a layered file set, in order of increasing precedence:

1. Built-in defaults.
2. Global user file at `<PI_CODING_AGENT_DIR>/jev-todo-audit.json` (default `~/.pi/agent/jev-todo-audit.json`).
3. Project file at `<cwd>/.pi/jev-todo-audit.json`, honored only when `ctx.isProjectTrusted()` returns true.

The `apiKey` and `apiKeyEnvVar` fields SHALL be read only from the global layer; any value for them in the project layer SHALL be ignored so repository files never carry secrets. The API key MAY also come from a configured environment variable, checked last, wins over file `apiKey`. A value that is empty or all-whitespace counts as absent. At session start the extension SHALL warn once when no key resolves from either source. Missing or malformed configuration SHALL fall back to defaults without failing extension load.

#### Scenario: Defaults apply when unconfigured
- **WHEN** the extension loads with no configuration file
- **THEN** auditing runs with interval 10, cooldown 10, threshold 0.5, model `jev-latest`, and staleAuditSpans 3

#### Scenario: Project override applies when trusted
- **WHEN** the project is trusted and `.pi/jev-todo-audit.json` sets `interval: 5`
- **THEN** audits fire every 5 loops instead of 10

#### Scenario: Project override ignored when untrusted
- **WHEN** the project is not trusted and `.pi/jev-todo-audit.json` exists
- **THEN** the project file is not read and global config applies

#### Scenario: Project cannot inject apiKey
- **WHEN** `.pi/jev-todo-audit.json` sets `apiKey` and the global layer has none
- **THEN** the resolved config has no apiKey from the project file

#### Scenario: Cooldown can be overridden
- **WHEN** a trusted project configuration sets an explicit cooldown value
- **THEN** the configured value is used for periodic audits without changing the default for other projects

#### Scenario: Disabled extension is inert
- **WHEN** configuration sets the extension to disabled
- **THEN** no periodic or terminal-stop audits fire and no counter state is maintained

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
