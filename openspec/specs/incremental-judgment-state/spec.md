# incremental-judgment-state Specification

## Purpose
Per-question business judgment state for the TODO audit: change-question answers are persisted as task and session state with confirmed loop cursors, so previously judged history is never re-submitted and only new complete loops are judged.

## Requirements

### Requirement: Questions judge change against stored state

Every audit question SHALL be asked as a change question: the stored state for its scope (one task or the session) plus the new complete loops after that scope's cursor, answered with a finite transition option. The core subject of each question (task lifecycle, evidence anchor, granularity, board representation, interaction, work evidence, current work and matched task, authorized scope and drift, board warrant) SHALL be preserved. Questions SHALL NOT require the model to re-derive a conclusion from history already represented in the stored state.

#### Scenario: Segment without relevant change
- **WHEN** the new loops contain no event affecting a task's lifecycle
- **THEN** the lifecycle answer is `no_change` and the stored status is kept verbatim

#### Scenario: Segment with a transition
- **WHEN** the new loops contain a main-agent report that the task's remaining acceptance item is done
- **THEN** the lifecycle answer is `completion_reported` and the stored state records the report source id with `verified: false`

### Requirement: Partial completion and uncertainty are distinct state

Stored task state SHALL distinguish confirmed partial progress (which acceptance items are evidenced), confirmed absence of progress, and uncertainty. An `unclear_in_segment` answer SHALL be persisted as uncertainty for that segment and SHALL NOT be recorded as "confirmed not completed".

#### Scenario: A done, B open
- **WHEN** a segment evidences acceptance item A as completed while B remains open
- **THEN** the state records A as confirmed with its source id, B as open, and the cursor advances past the segment

#### Scenario: Uncertain segment
- **WHEN** a segment yields `unclear_in_segment` for a task
- **THEN** the task cursor does not advance past that segment and the next audit starts from it

### Requirement: Cursor advancement

A task or session cursor SHALL advance past a segment only when every question for that scope returned a non-uncertain answer and the resulting state was durably appended under the current branch and judgment model identity. Cursors SHALL be independent per task and for the session; uncertainty in one task SHALL NOT force other tasks to re-judge the segment. Loops before a cursor SHALL NOT be sent again for that scope unless the user requests a full re-judgment.

#### Scenario: Persistence fails
- **WHEN** the state append is not acknowledged
- **THEN** the cursor stays, the answers are not treated as confirmed, and the next audit re-judges the segment

#### Scenario: One task uncertain
- **WHEN** task #3 is `unclear_in_segment` and task #4 is `no_change` on the same segment
- **THEN** task #4's cursor advances and task #3's does not

### Requirement: Invalidation of stored judgments

Stored judgments SHALL be invalidated only for the scope affected: a task scope change or reopen resets that task's cursor to its first-active loop; a withdrawn permission voids the session authorization anchor without resetting cursors; a judgment model identity change retains state as reference and re-judges only segments after the cursor; a branch change reconciles cursors against loop ids present on the active branch. Stored state SHALL NOT be treated as user authority; anchors are source ids into the session history.

#### Scenario: Permission withdrawn
- **WHEN** a new user message withdraws the earlier permission that anchored `work_evidence`
- **THEN** the anchor is voided, the interaction state becomes waiting, and no execution advice is produced from the old anchor

#### Scenario: Branch switch
- **WHEN** the active branch no longer contains the loop at a task's cursor
- **THEN** the cursor resets to the latest loop id still present and later state derived from missing loops is discarded

### Requirement: Evidence scope of a segment

Only historical conversation and tool events of the active branch within the segment, plus stored state and source text reloaded by anchor id, SHALL be supplied. Ambient instructions, tool definitions, hidden reasoning, private payloads and audit bookkeeping SHALL NOT be evidence. A cache hit, successful service call or stored state SHALL NOT authorize execution or TODO mutation by itself.

#### Scenario: Anchor text reload
- **WHEN** a question needs the authorization source behind a stored anchor
- **THEN** the audit reloads that source text by id from the session branch rather than from a stored copy

### Requirement: Complete-loop segmentation within selected capacity

A segment SHALL consist of consecutive complete loops (assistant message with all its tool results or explicit failures) after the scope cursor, packed within the selected judgment model's declared capacity including state, question definitions and backend envelope. A loop SHALL never be split. Overflow recovery SHALL drop trailing whole loops; a single loop that cannot fit with required state SHALL be reported as oversize and SHALL NOT be sliced, and the cursor SHALL NOT move past it.

#### Scenario: Incomplete trailing loop
- **WHEN** the newest assistant message has a tool call without a recorded result
- **THEN** that loop is excluded from the segment and remains the next unjudged loop

#### Scenario: Missing capacity metadata
- **WHEN** the service reports no declared limit for the selected model
- **THEN** the audit applies its configured safety ceiling, reports the missing metadata, and does not infer a limit
