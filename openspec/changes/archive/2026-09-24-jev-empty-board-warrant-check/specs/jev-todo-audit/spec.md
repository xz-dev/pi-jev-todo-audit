## MODIFIED Requirements

### Requirement: Audit request content

Each audit SHALL send one request to the TypeSafe API (`POST /v1/systemone`, model `jev-latest`) containing: (a) the current todo snapshot as rendered task lines with status, and (b) a summary of recent conversation activity since the last user message or last audit (whichever is later). The request SHALL ask, in a single call, the jev Choice questions for: (1) whether current work matches the task(s) shown in_progress, (2) the true state of the displayed in_progress task(s) when misaligned (completed / still ongoing / cancelled / deliberately deferred / other), (3) which board task the current work matches, or none, and (4) whether the agent has drifted from the board's plan. Question 3's options SHALL be generated dynamically from the current board snapshot and always include a not-on-board option.

When the board has no `in_progress` task — either empty or with all tasks `pending`/`completed` — the request SHALL additionally include a fifth Choice question `board_warranted` asking whether the agent's current activity warrants tracking on a todo board, with options `warranted` / `trivial` / `idle`. When at least one task is `in_progress` this question SHALL be omitted — an active board is presumed wanted.

#### Scenario: One request carries all questions
- **WHEN** an audit fires
- **THEN** all audit questions are sent in a single TypeSafe request with the todo snapshot and activity summary as state

#### Scenario: Board options reflect current snapshot
- **WHEN** the board contains tasks #3 and #5 and the audit fires
- **THEN** the match question's options include #3 and #5 (with subject and status) plus a not-on-board option

#### Scenario: Empty board still audited
- **WHEN** an audit fires and no visible tasks exist
- **THEN** the request is sent with an empty board, the match question offers only the not-on-board option, and `board_warranted` is included

#### Scenario: All-done board also asks warrant
- **WHEN** an audit fires and every visible task is `completed` or `pending` (none `in_progress`)
- **THEN** `board_warranted` is included

#### Scenario: Warrant question omitted when work is claimed
- **WHEN** an audit fires and at least one task is `in_progress`
- **THEN** `board_warranted` is not present in the request

### Requirement: Verdict handling and corrective injection

When the verdict says work is aligned with the board, the extension SHALL take no conversational action. When the verdict says misaligned, the extension SHALL inject a corrective message into the conversation (a `custom` context message delivered via `steer` so it lands at the next turn boundary of the running loop) that instructs the agent to reconcile the board: resolve the stale in_progress task per the verdict (complete, keep, cancel, or defer), add or set in_progress the task matching actual work, and resume board order if the verdict says the work drifted. The injected message SHALL state the audit evidence (verdict, affected task ids) so the agent can act on the todo tool directly. When any verdict's confidence is below the configured threshold (default 0.5), the extension SHALL NOT inject a corrective message and SHALL notify the user instead.

When the alignment verdict is `no_in_progress_task` and `board_warranted` is present, the extension SHALL consult it before injecting: `trivial` or `idle` SHALL produce silence; `warranted` SHALL produce the existing corrective inject; low-confidence `board_warranted` SHALL produce a user notification rather than an inject. When `board_warranted` is absent (board has `in_progress`), the existing inject logic applies.

#### Scenario: Aligned verdict is silent
- **WHEN** jev answers that current work matches the in_progress task
- **THEN** no message is injected into the conversation

#### Scenario: Misaligned verdict injects correction
- **WHEN** jev answers that the displayed in_progress task is actually completed and the current work matches no board task
- **THEN** a corrective message is injected naming the affected task id and the required board updates, and it reaches the agent at the next turn boundary

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

### Requirement: Configuration

The extension SHALL be configurable with: audit interval (default 10), user-message cooldown loops (default 5), confidence threshold (default 0.5), model name (default `jev-latest`), API key source, and an enable/disable switch.

Configuration SHALL be loaded from a layered file set, in order of increasing precedence:

1. Built-in defaults.
2. Global user file at `<PI_CODING_AGENT_DIR>/jev-todo-audit.json` (default `~/.pi/agent/jev-todo-audit.json`).
3. Project file at `<cwd>/.pi/jev-todo-audit.json`, honored only when `ctx.isProjectTrusted()` returns true.

The `apiKey` and `apiKeyEnvVar` fields SHALL be read only from the global layer; any value for them in the project layer SHALL be ignored so repository files never carry secrets. The API key MAY also come from a configured environment variable (checked last, wins over file `apiKey`). A value that is empty or all-whitespace counts as absent. At session start the extension SHALL warn once when no key resolves from either source. Missing or malformed configuration SHALL fall back to defaults without failing extension load.

#### Scenario: Defaults apply when unconfigured
- **WHEN** the extension loads with no configuration file
- **THEN** auditing runs with interval 10, cooldown 5, threshold 0.5, model `jev-latest`

#### Scenario: Project override applies when trusted
- **WHEN** the project is trusted and `.pi/jev-todo-audit.json` sets `interval: 5`
- **THEN** audits fire every 5 loops instead of 10

#### Scenario: Project override ignored when untrusted
- **WHEN** the project is not trusted and `.pi/jev-todo-audit.json` exists
- **THEN** the project file is not read and global config applies

#### Scenario: Project cannot inject apiKey
- **WHEN** `.pi/jev-todo-audit.json` sets `apiKey` and the global layer has none
- **THEN** the resolved config has no apiKey from the project file

#### Scenario: Disabled extension is inert
- **WHEN** configuration sets the extension to disabled
- **THEN** no audits fire and no counter state is maintained
