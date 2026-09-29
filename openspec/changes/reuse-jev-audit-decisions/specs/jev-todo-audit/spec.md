## ADDED Requirements

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

The extension SHALL report compact observations for cache hits/misses, actual provider attempts, projected state/question sizes, chunk progress, response model and provider-reported input/output usage when available. Retries, recovery and stale responses SHALL count as attempts; missing usage SHALL be unknown rather than zero. Cached answers SHALL not charge their original usage again. Accounting SHALL not export transcript bodies or credentials or trigger additional evaluations.

Comparisons SHALL use matching event sequences and endpoint/model settings and report per-workload and aggregate observations for tool-heavy, text-only and short-context cases. Input tokens and an applicable verified rate or provider charge SHALL be the monetary evidence; bytes SHALL not be presented as tokens. Oversized-input recovery SHALL be evaluated for successful coverage and resumption separately from cost comparisons against already successful baselines. No savings percentage or semantic-equivalence claim SHALL be inferred solely from mocked responses.

#### Scenario: A cache hit costs no new provider work
- **WHEN** an answer is reused
- **THEN** its accounting shows zero new provider attempts and does not add the original response's tokens a second time

#### Scenario: An overflow is recovered
- **WHEN** a request is rejected and subsequent smaller parts complete the review
- **THEN** diagnostics distinguish the rejected attempt, successful parts and final success instead of reporting the initial 400 as the final audit failure

#### Scenario: A failure lacks usage
- **WHEN** a provider attempt has no usable token observation
- **THEN** the report marks its cost unknown and does not claim a complete dollar total

#### Scenario: Short-context overhead is measurable
- **WHEN** rolling-state overhead makes a short-context request larger than its baseline
- **THEN** that regression appears alongside savings on other workloads rather than being omitted from the comparison

## MODIFIED Requirements

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

Only an explicit context/token-overflow rejection SHALL authorize overflow-driven subdivision. Rather than merely discard optional historical records once and abandon an otherwise processable review, the extension SHALL divide unresolved projected context into smaller ordered parts and/or divide independent unresolved questions into smaller batches. Completed context/question evaluations SHALL be reused. New substantive text SHALL NOT be silently omitted to make a request fit. Provider-limit recovery SHALL not restore excluded raw execution detail.

Subdivision SHALL make measurable structural progress toward smaller request contents, SHALL operate over finite input pieces, and SHALL not repeatedly submit an unchanged known-rejected envelope. When a text record must cross request boundaries, fragment identity/order and incomplete-record coverage SHALL remain explicit. When fixed required state or a single question cannot fit even without additional context, processing for the affected scope SHALL stop with an actionable diagnostic or request for a concise main-agent report; it SHALL not loop or claim complete coverage. Independent completed scopes SHALL remain available.

Existing bounded transient-network retries SHALL remain separate. Authentication, quota/rate, generic validation, payload-size and unrecognized errors SHALL NOT be treated as context overflow. A capacity-complete final result SHALL require all required parts, even if every individual part was valid. Known credentials and unsupported content SHALL be excluded before sending or displaying observations.

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

### Requirement: Audit request content

Each eligible periodic, manual or terminal audit SHALL use the uniform evaluation cache before provider work. Missing answers sharing the same effective context SHALL be batched when capacity permits. Context subdivision SHALL process dependent pieces sequentially with the prior piece's cumulative result; independent question batches SHALL not implicitly depend on other answers in the same request. Results from different captured contexts SHALL not be combined as if they evaluated one snapshot.

The request SHALL carry the relevant current board, original task goals as needed, latest applicable structured conclusions and unprocessed macro-level input. Full mode SHALL rebuild the relevant projected history through the same capacity path, not restore execution payloads. No separate summarizer model or paid relevance preflight SHALL be introduced. Reuse/processing status SHALL distinguish a new input from material already assessed. Complete task records and source bodies SHALL be serialized once per envelope and referenced rather than duplicated.

Every visible task SHALL remain represented by identity/status, and unfinished tasks SHALL retain independent lifecycle findings distinguishing ongoing, actionable now, actually completed, cancelled, deliberately deferred, blocked, future and unclear. A required finding can be satisfied by a compatible cached answer or an updated evaluation; it need not be sent again merely because another finding is missing. The label `actually_completed` remains a macro-level assessment of the supplied reports/state, not a claim that JEV independently reran or verified execution. Being unfinished or matched SHALL not itself grant permission to resume.

Board-work matching, drift and interaction findings SHALL remain available with a not-on-board outcome. With no active task, `board_warranted` SHALL distinguish warranted/trivial/idle; with active tasks it SHALL be omitted. Each active task SHALL retain an independent engineering granularity finding under its task-long scope. No aggregate answer SHALL justify mutating unrelated tasks.

Necessary terminal requests SHALL include the observed `STOP_KIND` and supplied reason fields without turning them into authority. A first terminal check SHALL account for its mode even after ordinary review; rewording an already assessed stop on unchanged inputs SHALL not cause another paid evaluation. Empty/all-finished terminal boards SHALL retain their no-request shortcut.

Answers SHALL be validated against the actual requested definitions and supplied record/processed-result references. Derived findings SHALL remain distinguishable from raw user decisions, assistant reports and compact tool events. Cached references SHALL retain a verifiable local lineage without requiring their raw historical bodies to be sent again. Missing or contradictory support SHALL yield an uncertain/no-correction outcome, not invented authority. Current-input freshness, independent-task confidence, compatible-action selection and suppression of unchanged demands SHALL remain in effect; an assistant report SHALL not be rejected solely because it contains no tool call, nor treated as a new user permission.

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
