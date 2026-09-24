# jev-todo-audit Specification

## Purpose
Periodically audits the agent's todo board (rpiv-todo) against actual conversation activity using the jev model (TypeSafe Choice primitive), and nudges the agent back on track when the two disagree.

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

The extension SHALL skip the audit for a trigger point when 5 or fewer loops have completed since the most recent user message on the branch (including steering messages). The skip is final for that trigger point.

#### Scenario: Recent user message skips audit
- **WHEN** the loop count hits a multiple of 10 and the last user message was 3 loops ago
- **THEN** no audit runs for that trigger point and the next audit waits for the next multiple of 10

#### Scenario: Older user message does not skip
- **WHEN** the loop count hits a multiple of 10 and the last user message was 7 loops ago
- **THEN** the audit runs

#### Scenario: Steering counts as a user message
- **WHEN** the user steers mid-run and the 10th loop lands 2 loops after the steer
- **THEN** the audit for that trigger point is skipped

### Requirement: Audit request content

Each audit SHALL send one request to the TypeSafe API (`POST /v1/systemone`, model `jev-latest`) containing: (a) the current todo snapshot as rendered task lines with status, and (b) a summary of recent conversation activity since the last user message or last audit (whichever is later). The request SHALL ask, in a single call, the jev Choice questions for: (1) whether current work matches the task(s) shown in_progress, (2) the true state of the displayed in_progress task(s) when misaligned (completed / still ongoing / cancelled / deliberately deferred / other), (3) which board task the current work matches, or none, and (4) whether the agent has drifted from the board's plan. Question 3's options SHALL be generated dynamically from the current board snapshot and always include a not-on-board option.

#### Scenario: One request carries all questions
- **WHEN** an audit fires
- **THEN** all audit questions are sent in a single TypeSafe request with the todo snapshot and activity summary as state

#### Scenario: Board options reflect current snapshot
- **WHEN** the board contains tasks #3 and #5 and the audit fires
- **THEN** the match question's options include #3 and #5 (with subject and status) plus a not-on-board option

#### Scenario: Empty board still audited
- **WHEN** an audit fires and no visible tasks exist
- **THEN** the request is sent with an empty board, and the match question offers only the not-on-board option

### Requirement: Verdict handling and corrective injection

When the verdict says work is aligned with the board, the extension SHALL take no conversational action. When the verdict says misaligned, the extension SHALL inject a corrective message into the conversation (a `custom` context message delivered via `steer` so it lands at the next turn boundary of the running loop) that instructs the agent to reconcile the board: resolve the stale in_progress task per the verdict (complete, keep, cancel, or defer), add or set in_progress the task matching actual work, and resume board order if the verdict says the work drifted. The injected message SHALL state the audit evidence (verdict, affected task ids) so the agent can act on the todo tool directly. When any verdict's confidence is below the configured threshold (default 0.5), the extension SHALL NOT inject a corrective message and SHALL notify the user instead.

#### Scenario: Aligned verdict is silent
- **WHEN** jev answers that current work matches the in_progress task
- **THEN** no message is injected into the conversation

#### Scenario: Misaligned verdict injects correction
- **WHEN** jev answers that the displayed in_progress task is actually completed and the current work matches no board task
- **THEN** a corrective message is injected naming the affected task id and the required board updates, and it reaches the agent at the next turn boundary

#### Scenario: No in_progress task while agent works
- **WHEN** jev answers `no_in_progress_task` (board has none marked) and the agent is actively working
- **THEN** a corrective message is injected telling the agent to claim the current work (set the matching task in_progress, or create it when nothing matches)

#### Scenario: Drift verdict orders return to board
- **WHEN** jev answers that the agent drifted from the plan
- **THEN** the injected message instructs the agent to stop the off-plan work and resume the next board task

#### Scenario: Low confidence defers to the user
- **WHEN** the alignment verdict's confidence is below the threshold
- **THEN** no corrective message is injected and a user notification describes the uncertain verdict

### Requirement: Audit failure isolation

Audit execution SHALL never block, abort, or corrupt the agent loop. An audit network error, timeout, or malformed response SHALL be skipped with at most one user notification, and the next trigger point proceeds normally. The extension SHALL read todo state only from persisted session branch data and SHALL NOT import or call into rpiv-todo's internal modules.

#### Scenario: API failure does not disturb the run
- **WHEN** the TypeSafe API call fails or times out during an audit
- **THEN** the agent loop continues unaffected, the failed audit is not retried at an arbitrary time, and the next audit waits for the next trigger point

#### Scenario: No coupling to rpiv-todo internals
- **WHEN** the audit reads todo state
- **THEN** it reconstructs the snapshot from the session branch's todo tool results, without importing rpiv-todo modules

### Requirement: Configuration

The extension SHALL be configurable with: audit interval (default 10), user-message cooldown loops (default 5), confidence threshold (default 0.5), model name (default `jev-latest`), API key source, and an enable/disable switch. The API key MAY come from a configured environment variable (checked first) or a literal `apiKey` field in the config file (pi-style convenience); a value that is empty or all-whitespace counts as absent. At session start the extension SHALL warn once when no key resolves from either source. Missing or malformed configuration SHALL fall back to defaults without failing extension load.

#### Scenario: Defaults apply when unconfigured
- **WHEN** the extension loads with no configuration file
- **THEN** auditing runs with interval 10, cooldown 5, threshold 0.5, model `jev-latest`

#### Scenario: Disabled extension is inert
- **WHEN** configuration sets the extension to disabled
- **THEN** no audits fire and no counter state is maintained
