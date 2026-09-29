## MODIFIED Requirements

### Requirement: Provider context limits without artificial quotas

Every necessary provider attempt SHALL obey the configured model's verified state-plus-longest-question and state-plus-all-questions limits. The extension SHALL prefer an authoritative preflight counting contract when available and otherwise use server admission without claiming an exact local fit guarantee. A nominal 30k content chunk SHALL NOT be assumed safe independently of cumulative state, task information, questions, options and serialization overhead. Character/byte counts SHALL NOT be asserted as token counts.

Overflow-driven subdivision SHALL be authorized only by an explicit context/token-overflow rejection or by a per-channel predicted overflow. A predicted overflow SHALL be derived before sending from the actual unanswered envelope, using a bytes-to-tokens ratio calibrated from provider-reported usage on the same endpoint and requested model (a conservative prior until usage exists), checked separately against that channel's published or configured request-wide and state-plus-longest-question limits, or from a recorded actual rejection on the same channel that the envelope equals or exceeds in both dimensions. Predictions SHALL NOT waste admitted capacity by applying a stricter combined limit than the channel publishes. A predicted overflow SHALL NOT count as a provider attempt or be recorded as a rejected envelope, and SHALL NOT alone declare a unit irreducible: a single record/fragment with a single question SHALL still be submitted so server admission decides. Rather than merely discard optional historical records once and abandon an otherwise processable review, the extension SHALL divide unresolved projected context into smaller ordered parts and/or divide independent unresolved questions into smaller batches. Completed context/question evaluations SHALL be reused. New substantive text SHALL NOT be silently omitted to make a request fit. Provider-limit recovery SHALL not restore excluded raw execution detail.

Subdivision SHALL make measurable structural progress toward smaller request contents, SHALL operate over finite input pieces, and SHALL not repeatedly submit an unchanged known-rejected envelope. When a text record must cross request boundaries, fragment identity/order and incomplete-record coverage SHALL remain explicit. When fixed required state or a single question cannot fit even without additional context, processing for the affected scope SHALL stop with an actionable diagnostic or request for a concise main-agent report; it SHALL not loop or claim complete coverage. Independent completed scopes SHALL remain available.

Existing bounded transient-network retries SHALL remain separate. Authentication, quota/rate, generic validation, payload-size and unrecognized errors SHALL NOT be treated as context overflow. A typed provider overflow code (including OpenRouter's `error.metadata.error_type: "context_length_exceeded"`) SHALL count as an explicit overflow; typed credit-cap, per-field length, payload-size, payment, rate and validation codes SHALL NOT. The OpenRouter System One endpoint SHALL be a built-in channel whose single published context window bounds both the request-wide and state-plus-longest-question dimensions. A capacity-complete final result SHALL require all required parts, even if every individual part was valid. Known credentials and unsupported content SHALL be excluded before sending or displaying observations.

#### Scenario: OpenRouter reports a context overflow
- **WHEN** the OpenRouter endpoint rejects a request with `error.metadata.error_type` `context_length_exceeded`
- **THEN** it is treated as an explicit overflow and subdivided like a TypeSafe `max_tokens_exceeded` rejection, while its other typed errors fail through the ordinary isolated error path

#### Scenario: OpenRouter's published window is applied to both dimensions
- **WHEN** an envelope fits TypeSafe direct's 64k request-wide limit but exceeds OpenRouter's single 32K context
- **THEN** it is pre-split on the OpenRouter channel and sent whole on TypeSafe direct

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
- **WHEN** the calibrated estimate of the unanswered envelope exceeds a published limit of its channel, or the envelope is at least as large as a recorded rejection on that channel in both dimensions
- **THEN** it is subdivided through the same structural path without a provider request, and no rejection is recorded for it

#### Scenario: Channel capacity is used rather than a stricter guess
- **WHEN** state plus the longest question fits its channel limit and state plus all questions fits the request-wide limit
- **THEN** the envelope is sent whole even if its total exceeds the smaller per-question limit

#### Scenario: A prediction does not declare a unit irreducible
- **WHEN** one record or fragment with one question is still predicted too large
- **THEN** it is sent once and only an actual rejection can end processing for that scope

#### Scenario: Learning survives reload
- **WHEN** the extension reloads on the same branch after admitted and rejected attempts were recorded
- **THEN** the channel's calibrated ratio and recorded rejections are restored from the existing non-context diagnostics without re-sending anything

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

### Requirement: Observable cost and capacity outcomes

The extension SHALL report compact observations for cache hits/misses, actual provider attempts, projected state/question sizes, chunk progress, response model and provider-reported input/output usage when available. Retries, recovery and stale responses SHALL count as attempts; missing usage SHALL be unknown rather than zero. A provider-reported charge (such as OpenRouter `usage.cost` in USD) SHALL be recorded per attempt and totalled; a channel that reports no charge SHALL show none rather than zero, and a total with any attempt lacking a reported charge SHALL be unknown. Cached answers SHALL not charge their original usage again. Accounting SHALL not export transcript bodies or credentials or trigger additional evaluations.

Comparisons SHALL use matching event sequences and endpoint/model settings and report per-workload and aggregate observations for tool-heavy, text-only and short-context cases. Input tokens and an applicable verified rate or provider charge SHALL be the monetary evidence; bytes SHALL not be presented as tokens. Oversized-input recovery SHALL be evaluated for successful coverage and resumption separately from cost comparisons against already successful baselines. No savings percentage or semantic-equivalence claim SHALL be inferred solely from mocked responses.

#### Scenario: A cache hit costs no new provider work
- **WHEN** an answer is reused
- **THEN** its accounting shows zero new provider attempts and does not add the original response's tokens a second time

#### Scenario: An overflow is recovered
- **WHEN** a request is rejected and subsequent smaller parts complete the review
- **THEN** diagnostics distinguish the rejected attempt, successful parts and final success instead of reporting the initial 400 as the final audit failure

#### Scenario: A split is predicted rather than rejected
- **WHEN** an envelope is subdivided before sending
- **THEN** diagnostics count the pre-split separately from actual provider attempts and overflow rejections, and attribute no usage to it

#### Scenario: A failure lacks usage
- **WHEN** a provider attempt has no usable token observation
- **THEN** the report marks its cost unknown and does not claim a complete dollar total

#### Scenario: Short-context overhead is measurable
- **WHEN** rolling-state overhead makes a short-context request larger than its baseline
- **THEN** that regression appears alongside savings on other workloads rather than being omitted from the comparison

#### Scenario: A provider reports the charge
- **WHEN** every attempt of an audit on OpenRouter reports `usage.cost`
- **THEN** diagnostics record each charge and their USD total, and a channel without reported charges shows no dollar total
