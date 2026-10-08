## MODIFIED Requirements

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
