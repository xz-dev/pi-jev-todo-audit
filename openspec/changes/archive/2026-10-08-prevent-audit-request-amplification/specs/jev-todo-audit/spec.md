## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Provider context limits without artificial quotas

Every necessary provider attempt SHALL obey the configured model's verified state-plus-longest-question and state-plus-all-questions limits. The extension SHALL prefer an authoritative preflight counting contract when available and otherwise use server admission without claiming an exact local fit guarantee. A nominal 30k content chunk SHALL NOT be assumed safe independently of cumulative state, task information, questions, options and serialization overhead. Character/byte counts SHALL NOT be asserted as token counts.

Overflow-driven subdivision SHALL be authorized only by an explicit context/token-overflow rejection or by a per-channel predicted overflow. A predicted overflow SHALL be derived before sending from the actual unanswered envelope, using a bytes-to-tokens estimate calibrated from provider-reported usage on the same endpoint and requested model (a conservative prior until usage exists), checked separately against that channel's published or configured request-wide and state-plus-longest-question limits, or from recorded actual rejections on that channel. Calibration SHALL incorporate later successful observations, including lower-density observations, instead of indefinitely imposing the densest historical observation on all subsequent inputs. Size comparisons with different-content rejected envelopes SHALL remain estimates rather than proof of rejection. A later successful admission SHALL be able to correct contradictory size-based predictions; an identical actually rejected envelope SHALL remain protected against unchanged retransmission.

Predictions SHALL NOT waste admitted capacity by applying a stricter combined limit than the channel publishes. A predicted overflow SHALL NOT count as a provider attempt or be recorded as a rejected envelope. When required retained state causes the predicted overflow even before divisible new evidence is included, the extension SHALL resolve the disputed prediction by admitting the current unanswered batch before subdividing it solely on that prediction, unless that exact envelope is already known to have been rejected. This admission check SHALL count as an ordinary provider attempt; its valid answers SHALL be reusable and SHALL NOT require a separate validation-only request. An accepted batch SHALL finish that stage without requesting its questions again individually.

A predicted overflow SHALL NOT alone declare a unit irreducible: an irreducible projected unit SHALL still be submitted so server admission decides. Rather than merely discard optional historical records once and abandon an otherwise processable review, the extension SHALL divide unresolved projected context into smaller ordered parts and/or divide independent unresolved questions into smaller batches. Completed context/question evaluations SHALL be reused. New substantive text SHALL NOT be silently omitted to make a request fit. Provider-limit recovery SHALL not restore excluded raw execution detail.

Subdivision SHALL make measurable progress in the constrained request dimension, not merely reduce a record count while retaining the same limiting state. The extension SHALL distinguish required retained state from divisible new evidence and state-related limits from question-batch limits. A prediction contradicted by successful admission SHALL NOT cause each pending record to be evaluated once per individual question when the complete unanswered batch can be admitted. Subdivision SHALL operate over finite input pieces and SHALL not repeatedly submit an unchanged known-rejected envelope. When a text record must cross request boundaries, fragment identity/order and incomplete-record coverage SHALL remain explicit. When fixed required state or a single question cannot fit even without additional context, processing for the affected scope SHALL stop with an actionable diagnostic or request for a concise main-agent report; it SHALL not traverse all remaining record/question combinations, loop, silently discard user constraints, or claim complete coverage. Independent completed scopes SHALL remain available.

Existing bounded transient-network retries SHALL remain separate. Authentication, quota/rate, generic validation, payload-size and unrecognized errors SHALL NOT be treated as context overflow. A typed provider overflow code (including OpenRouter's `error.metadata.error_type: "context_length_exceeded"`) SHALL count as an explicit overflow; typed credit-cap, per-field length, payload-size, payment, rate and validation codes SHALL NOT. The OpenRouter System One endpoint SHALL be a built-in channel whose single published context window bounds both the request-wide and state-plus-longest-question dimensions. A capacity-complete final result SHALL require all required parts, even if every individual part was valid. Known credentials and unsupported content SHALL be excluded before sending or displaying observations.

#### Scenario: OpenRouter reports a context overflow
- **WHEN** the OpenRouter endpoint rejects a request with `error.metadata.error_type` `context_length_exceeded`
- **THEN** it is treated as an explicit overflow and subdivided like a TypeSafe `max_tokens_exceeded` rejection, while its other typed errors fail through the ordinary isolated error path

#### Scenario: OpenRouter's published window is applied to both dimensions
- **WHEN** an envelope fits TypeSafe direct's 64k request-wide limit but exceeds OpenRouter's single 32K context
- **THEN** it is pre-split on the OpenRouter channel and sent whole on TypeSafe direct, subject to admission correction when a prediction is contradicted

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
- **WHEN** the calibrated estimate of the unanswered envelope exceeds a published limit of its channel and subdivision can reduce the constrained dimension without being defeated by the required retained state
- **THEN** it is subdivided through the structural recovery path without a provider request, and no rejection is recorded for it

#### Scenario: Channel capacity is used rather than a stricter guess
- **WHEN** state plus the longest question fits its channel limit and state plus all questions fits the request-wide limit
- **THEN** the envelope is sent whole even if its total exceeds the smaller per-question limit

#### Scenario: A prediction does not declare a unit irreducible
- **WHEN** one record or fragment with one question is still predicted too large
- **THEN** it is sent once and only an actual rejection can end processing for that scope

#### Scenario: Learning survives reload
- **WHEN** the extension reloads on the same branch after admitted and rejected attempts were recorded
- **THEN** corrected channel calibration and applicable rejection observations are restored from existing non-context diagnostics without re-sending anything or reinstating a contradicted historical high-water estimate

#### Scenario: A validation error is not an overflow
- **WHEN** a request fails for invalid question syntax or an unfamiliar error
- **THEN** it fails through the ordinary isolated error path without treating the error as permission to crop or subdivide evidence

#### Scenario: Recovery still exceeds the provider limit
- **WHEN** a smaller projected part still receives `max_tokens_exceeded`
- **THEN** it is subdivided further only if progress in the constrained dimension is possible, without resending completed parts or looping on the same rejected request

#### Scenario: Sensitive or unsupported material is present
- **WHEN** input contains known credentials, hidden thinking or raw binary/image data
- **THEN** that content is not exported and consequential gaps remain explicit

#### Scenario: Protected new text spans several requests
- **WHEN** the macro-projected unprocessed history is too large for one request but fits as ordered pieces
- **THEN** all pieces are processed through rolling conclusions without dropping the oldest or newest text merely because it was protected in the old collector

#### Scenario: A question is irreducibly too large
- **WHEN** required fixed state or a single question cannot fit independently of the next context piece
- **THEN** the affected scope reports what must be shortened or clarified, retains completed results and does not continue an unbounded rejection loop

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
