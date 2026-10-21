## MODIFIED Requirements

### Requirement: Provider context limits without artificial quotas

Segment packing SHALL use the selected judgment model's declared capacity as reported by the version-two judgment service, counting stored state, question definitions, loops, backend envelope and output reserve. The service declares only `request`, `stateAndLongestQuestion` and `contextWindow` limits with source `override`, `model` or `none`; absent limits SHALL remain absent and unknown. Character/byte counts SHALL NOT be asserted as token counts; audit-owned packing estimates (`1/1.75` tokens per byte, 2,048-byte envelope allowance) SHALL remain labelled consumer estimates, not provider facts, and actual provider admission SHALL remain the fit authority. A predicted or reported overflow SHALL be recovered by dropping trailing whole loops; a single loop with required state that cannot be admitted SHALL stop that scope with an actionable diagnostic and SHALL NOT be sliced or silently truncated. Authentication, quota, payload-size and validation errors SHALL NOT be treated as overflow. Capacity for the audit SHALL never be derived from the main chat model.

#### Scenario: Overflow with several loops
- **WHEN** a segment of five loops is rejected for input size
- **THEN** the audit retries with fewer trailing loops and the remaining loops stay unjudged

#### Scenario: Oversize single loop
- **WHEN** one loop plus required state exceeds the declared capacity
- **THEN** the scope reports an oversize loop, keeps its cursor, and does not claim coverage

#### Scenario: OpenRouter reports a context overflow
- **WHEN** the OpenRouter endpoint rejects a request with `error.metadata.error_type` `context_length_exceeded`
- **THEN** the terminal result classifies it as explicit overflow and the segment is retried with fewer trailing loops, while other typed errors fail through the ordinary isolated error path

#### Scenario: OpenRouter's published window is applied to both dimensions
- **WHEN** the selected model publishes a single context window as its declared limit
- **THEN** segment packing bounds both the request-wide and state-plus-longest-question dimensions by that window as disclosed by the service

#### Scenario: Questions cause a request overflow
- **WHEN** state and loops fit but all questions together exceed the request-wide limit
- **THEN** the terminal overflow result drives the existing whole-loop reduction; audit does not ask the stateless service to split question batches and does not crop required state

#### Scenario: Fallback changes the model's capacity
- **WHEN** a judgment succeeds through an automatic alternate with different declared limits
- **THEN** the disclosed capacity belongs to that terminal model and does not imply learned prediction or guaranteed fit

#### Scenario: Relevant context exceeds the old application budget
- **WHEN** the new complete loops exceed any old character or fragment cutoff
- **THEN** no cutoff silently removes them; capacity packing decides how many whole loops are sent now and the rest stay unjudged

#### Scenario: State exceeds its own limit while total request fits
- **WHEN** stored state plus the longest question exceeds its limit before any loop is added
- **THEN** the scope stops with a diagnostic naming the oversized state; no loop is dropped to hide it

#### Scenario: Reduction removes evidence needed to split a task
- **WHEN** a task's segment is still partly unjudged or oversize
- **THEN** no definitive split instruction is issued from that task's incomplete state

#### Scenario: Token accounting is unverified
- **WHEN** no authoritative tokenizer/counting contract is available
- **THEN** packing uses audit's disclosed bytes-to-tokens prior with server admission as the authority and does not claim that a byte estimate proves fit

#### Scenario: A predictably oversized envelope is split before sending
- **WHEN** the consumer estimate of state plus loops exceeds the disclosed limit
- **THEN** trailing whole loops are removed before any provider request and no rejection is recorded for it

#### Scenario: Channel capacity is used rather than a stricter guess
- **WHEN** state plus the longest question and state plus all questions both fit the declared limits for the selected backend
- **THEN** the segment is sent whole even if its total exceeds a smaller per-question limit; no built-in channel constants remain to tighten the guess

#### Scenario: Declared window is used rather than a stricter guess
- **WHEN** state plus the longest question and state plus all questions both fit the disclosed limits
- **THEN** the segment is sent whole even if its total exceeds a smaller per-question limit

#### Scenario: Learning survives reload
- **WHEN** the extension reloads on the same branch after admitted and rejected judgments
- **THEN** only audit's own documented packing priors and durable business state are reused; no learned service ratios or recorded service rejections exist to restore, and no envelope is re-sent merely because a prediction once rejected it

#### Scenario: A prediction does not declare a unit irreducible
- **WHEN** one loop with required state is still predicted too large
- **THEN** it is sent once and only an actual rejection marks it oversize

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
- **GIVEN** audit's byte-based packing prior previously overestimated a segment's size
- **WHEN** a later segment packs low-density input
- **THEN** each new estimate applies the same prior independently without any learned correction, and actual admission remains the fit authority for every segment
- **AND** results from a different backend or requested model do not alter this consumer estimate

#### Scenario: Fixed-state prediction would multiply an admissible batch
- **GIVEN** retained state is predicted to exceed the state-related limit, many new records remain, several questions are unresolved, and the provider can admit their complete batch
- **WHEN** an eligible audit runs without transport failure
- **THEN** one service call evaluates the complete unanswered batch, every new record remains represented, and all required valid answers permit the range to advance
- **AND** the extension does not make many groups of single-question requests or introduce an extra validation-only call

#### Scenario: One call answers the complete batch
- **GIVEN** retained state fits its declared limit, many new records remain, all questions are required, and the provider can admit the complete batch
- **WHEN** an eligible audit runs without transport failure
- **THEN** one service call evaluates the complete batch, every new record remains represented, and all required valid answers permit the range to advance
- **AND** the extension does not split into per-question calls or introduce an extra validation-only call

#### Scenario: The admission check actually rejects the full batch
- **WHEN** the complete batch is sent and the provider rejects it with an explicit context overflow
- **THEN** existing complete-coverage recovery applies to reducible trailing loops
- **AND** no success is inferred from the prediction check and no unchanged rejected envelope is resent

#### Scenario: Confirmed fixed-state failure stops the affected scope
- **GIVEN** required retained state remains too large with the smallest reducible segment and required questions
- **WHEN** provider admission confirms the context overflow
- **THEN** the audit stops that scope with a concise shortening/clarification diagnostic
- **AND** it retains user constraints and prior durable progress without injecting definitive completion or continuation advice

#### Scenario: A successful smaller-density envelope contradicts a size heuristic
- **GIVEN** an earlier segment of similar measured dimensions was rejected for context size
- **WHEN** a later segment of equal or larger estimated size is admitted successfully
- **THEN** the successful admission controls that call's outcome without any service-side rejection memory suppressing the attempt
- **AND** audit still does not resend an unchanged envelope it already knows was rejected

### Requirement: Observable cost and capacity outcomes

The extension SHALL report compact observations for judged segments, response backend/model identity, confirmed overflow and failure dispositions, and provider-reported usage fields when the service returns them under their stated scope. Missing usage on a judgment SHALL be unknown rather than zero; a usage figure SHALL NOT be presented as a complete-operation total when it only names one terminal attempt's reported scope. Logical judgment or question counts SHALL retain their accurate labels and SHALL NOT be renamed as HTTP-attempt counts, cache hits or joins. There is no service observation contract: no requirement to count transport attempts, no fabricated observation completeness, and no charge totals when none were reported. Accounting SHALL not export transcript bodies or credentials or trigger additional evaluations.

Comparisons SHALL use matching event sequences and endpoint/model settings and report per-workload and aggregate observations for tool-heavy, text-only and short-context cases. Input tokens and an applicable verified rate or provider charge SHALL be the monetary evidence; bytes SHALL not be presented as tokens. Oversized-input recovery SHALL be evaluated for successful coverage and resumption separately from cost comparisons against already successful baselines. No savings percentage or semantic-equivalence claim SHALL be inferred solely from mocked responses.

#### Scenario: An overflow is recovered
- **WHEN** a request is rejected and subsequent smaller segments complete the audit
- **THEN** diagnostics distinguish the rejected judgment, successful segments and final success instead of reporting the initial overflow as the final audit failure

#### Scenario: A cache hit costs no new provider work
- **WHEN** audit's own stored state already covers a segment
- **THEN** no service call is made for it; this is consumer scheduling, not a claimed service cache hit, and no usage is attributed

#### Scenario: A split is predicted rather than rejected
- **WHEN** an envelope is subdivided before sending under audit's packing estimates
- **THEN** diagnostics count the pre-split separately from actual judgments and overflow rejections, and attribute no usage to it

#### Scenario: A failure lacks usage
- **WHEN** a failed judgment reports no usage
- **THEN** the report marks that usage unknown, totals only what was actually reported elsewhere, counts the judgment's outcome accurately, and does not claim a complete total or zero charge

#### Scenario: A successful judgment lacks usage
- **WHEN** a successful terminal judgment reports no usage
- **THEN** the report marks that usage unknown, totals only what was actually reported elsewhere, and does not claim a complete total or a zero charge

#### Scenario: Short-context overhead is measurable
- **WHEN** rolling-state overhead makes a short-context request larger than its baseline
- **THEN** that regression appears alongside savings on other workloads rather than being omitted from the comparison

#### Scenario: A provider reports the charge
- **WHEN** a terminal judgment result includes a provider-reported charge under its stated scope
- **THEN** diagnostics record it with that scope, and results without a reported charge show none rather than zero

#### Scenario: A judgment reports no usage
- **WHEN** a terminal judgment carries no usage fields
- **THEN** diagnostics omit token/charge claims for that call rather than recording zero or inventing usage

#### Scenario: A judgment reports scoped usage
- **WHEN** a terminal judgment reports usage for its model only
- **THEN** diagnostics keep that scope instead of claiming coverage of preceding failed or alternate calls

#### Scenario: Historical service records remain history
- **WHEN** a session contains `llm-as-jev-ledger` entries from earlier service versions
- **THEN** upgrade leaves them intact as history and never counts their recorded usage toward current calls

### Requirement: Configuration

The extension SHALL retain configurable audit interval (default 10), user-message cooldown (default 10), native confidence threshold (default 0.5), enable/disable switch, notifications and `staleAuditSpans` (default 3). The age threshold SHALL control diagnostic review, not an unconditional splitting rule. Backend/model selection, timing defaults and capacity configuration SHALL belong to the shared judgment service; provider endpoints and credentials SHALL belong to Pi.

Audit MAY accept optional `idleTimeoutMs` and `modelTimeoutMs` fields as per-call overrides forwarded to each model attempt independently; omission SHALL delegate to service defaults. The legacy audit `timeoutMs` field has incompatible old meanings and SHALL be recognized as requiring migration: while configured, audit SHALL emit a clear affected-feature diagnostic naming the field and the required explicit replacement (`idleTimeoutMs`, `modelTimeoutMs`, or removal for defaults) and SHALL skip inference-dependent audit work until it is removed or replaced. The migration diagnostic SHALL NOT interrupt TODO/main-agent work, rewrite the user's configuration, silently map the old value to one new field, or disable unrelated audit behavior.

The deprecated `activityBudgetChars` field SHALL remain load-compatible but SHALL NOT constrain evidence below verified provider hard limits. An explicitly configured legacy value SHALL produce a one-time deprecation notice instead of silently restoring a character budget. No replacement cost-saving character cap, fixed record count, or context-allocation ratio SHALL be imposed.

Configuration SHALL retain its layered precedence: built-in defaults, global user configuration at `<PI_CODING_AGENT_DIR>/jev-todo-audit.json` (default `~/.pi/agent/jev-todo-audit.json`), then trusted-project configuration at `<cwd>/.pi/jev-todo-audit.json`. Project configuration SHALL be read only when the project is trusted.

Legacy `model`, `apiUrl`, `apiKey`, `apiKeyEnvVar` and `contextLimits` fields SHALL remain load-compatible but SHALL NOT select a backend, endpoint, credential or capacity limit. Explicit presence in a read configuration layer SHALL produce a bounded migration notice naming deprecated fields, without their values. The extension SHALL NOT resolve, copy, transmit or automatically migrate those secrets, alter shared configuration, or retain a direct-HTTP fallback. Defaults that formerly supplied these fields SHALL NOT themselves produce a notice. Known legacy secret values SHALL remain excluded from outgoing evidence and diagnostics even though they are no longer used for authentication.

The service SHALL use Pi's own authentication and credential behavior. When the service is missing, incompatible or has no usable configured backend, the audit SHALL fail in isolation with an actionable dependency/configuration diagnostic, not consult legacy credential fallbacks. Suppressed children SHALL remain inert before configuration notices and credential work. Missing or malformed configuration SHALL fall back safely without failing extension load. The default cooldown SHALL remain one normal default audit cycle and explicit overrides SHALL remain independent of interval.

#### Scenario: Defaults apply when unconfigured
- **WHEN** the extension loads without configuration
- **THEN** interval 10, cooldown 10, native threshold 0.5 and age-review threshold 3 apply, without an application character cap, calls carry no timing overrides, and the service applies its own defaults

#### Scenario: Explicit timing overrides
- **WHEN** audit configuration sets `idleTimeoutMs: 5000` and `modelTimeoutMs: 20000`
- **THEN** each judgment call forwards both options and the service applies them independently to each attempted backend

#### Scenario: Legacy timeout requires migration
- **WHEN** configuration contains `timeoutMs`
- **THEN** audit emits a bounded migration diagnostic naming the field and skips inference-dependent audit work until it is removed or replaced, without interrupting TODO/main-agent work or rewriting the file

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
- **WHEN** project configuration contains an API key and Pi has none
- **THEN** the project value is not used as a credential or copied into Pi

#### Scenario: Legacy timeout blocks inference but not TODO work
- **WHEN** a read configuration layer contains `timeoutMs`
- **THEN** a bounded diagnostic names the required replacement `idleTimeoutMs`, `modelTimeoutMs` or removal, audit inference is skipped until resolved, and TODO/main-agent work continues

#### Scenario: Explicit timing fields pass through
- **WHEN** `idleTimeoutMs` and/or `modelTimeoutMs` are configured without `timeoutMs`
- **THEN** each value is forwarded to the judgment call and unset fields keep the service defaults

#### Scenario: No timing configured
- **WHEN** none of `idleTimeoutMs`, `modelTimeoutMs` or `timeoutMs` are configured
- **THEN** each judgment call runs under service defaults (10,000 ms native / 15,000 ms LLM generation-progress idle, no model hard cap, no combined fallback deadline)

#### Scenario: Pi key wins for TypeSafe direct
- **WHEN** the shared service selects TypeSafe direct, Pi resolves its key, and the global audit config also has `apiKey`
- **THEN** Pi's credential is used and a bounded notice explains that the legacy audit field is ignored

#### Scenario: Pi key used for OpenRouter
- **WHEN** the shared service selects an OpenRouter classifier and the user signed in to `openrouter` through Pi
- **THEN** classification authenticates through Pi rather than audit's old endpoint mapping

#### Scenario: Fallback key with migration warning
- **WHEN** Pi has no usable credential and the global audit config has `apiKey`
- **THEN** audit does not use that fallback, reports the required Pi configuration and reveals no key value

#### Scenario: Provider not registered in this Pi
- **WHEN** legacy audit configuration names TypeSafe but Pi has no usable matching provider
- **THEN** those old settings do not create a provider or direct request, and only shared-service selection determines availability

#### Scenario: Custom endpoint uses extension config only
- **WHEN** an old config contains a custom `apiUrl` and `apiKey`
- **THEN** neither controls dispatch, a migration notice directs endpoint/auth configuration to Pi, and no files are rewritten automatically

#### Scenario: Pi lookup failure degrades to fallback
- **WHEN** Pi's key lookup fails during shared-service evaluation
- **THEN** audit receives an isolated service failure without reviving its former fallback path or changing backend after dispatch

#### Scenario: No key anywhere
- **WHEN** the shared service cannot resolve credentials for a required backend
- **THEN** audit reports the service/Pi configuration failure and does not inject a correction or create an uncontrolled retry loop

#### Scenario: Cooldown can be overridden
- **WHEN** trusted configuration explicitly changes cooldown
- **THEN** the override is honored without changing the default elsewhere

#### Scenario: Disabled extension is inert
- **WHEN** the extension is disabled
- **THEN** periodic and terminal-stop auditing remain inactive and no counter state is maintained

## REMOVED Requirements

### Requirement: Uniform reuse of identical JEV evaluations
**Reason**: The version-two service removed exact-match caching and cross-call joining; service `reuse` counters no longer exist, and audit reuse already operates through its own stored judgment state and cursors.
**Migration**: The cursor/state mechanism that requirement describes remains in force (segments before a cursor are never re-judged; `no_change` and uncertain answers persist without strengthening). Audit adds no replacement cache; identical calls perform new inference, and repeated audit scheduling still prevents duplicate concurrent work.

## ADDED Requirements

### Requirement: Audit calls the stateless service with packed state

Every service call SHALL submit audit-owned packed `state` plus the segment's questions through version-two `judge()`, including stored scope state, applicable anchors and the complete-loop segment; the service `evidence` array, `fresh` tokens, checkpoints, stage projections and removed option fields SHALL NOT be sent. Calls SHALL respect caller cancellation and produce a terminal `stop`/`error`/`aborted` result; audit SHALL treat only a `stop` result with valid required answers as a judgment. Dependent-drift rejudgment, per-run segment budgets and whole-loop overflow recovery SHALL remain audit-owned against this stateless result contract.

#### Scenario: Stateless segment judgment
- **WHEN** an eligible segment is packed and judged
- **THEN** the request carries the complete stored state and loops in `state` plus the segment's questions, with no legacy envelope fields

#### Scenario: Removed option is never sent
- **WHEN** audit builds call options
- **THEN** it supplies only `signal`, native threshold policy and optional `idleTimeoutMs`/`modelTimeoutMs`; no `timeoutMs`, `fresh`, checkpoint or cache fields are forwarded

#### Scenario: Dependent drift rejudgment
- **WHEN** a `scope_updated` answer requires rejudging drift against the newly selected user scope
- **THEN** audit issues one additional bounded `judge()` call for only the drift question and tolerates its independent failure without discarding the segment's other valid answers

#### Scenario: Failed judgment advances nothing
- **WHEN** a `judge()` call resolves `error`, `aborted` or is cancelled
- **THEN** no transition is written, no cursor advances for that segment, and audit continues or stops under its existing isolation rules
