## MODIFIED Requirements

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
