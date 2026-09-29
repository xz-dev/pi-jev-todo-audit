## MODIFIED Requirements

### Requirement: Observable cost and capacity outcomes

The extension SHALL report compact observations for cache hits/misses, actual provider attempts, projected state/question sizes, chunk progress, response model and provider-reported input/output usage when available. Retries, recovery and stale responses SHALL count as attempts; missing usage on an attempt SHALL be unknown rather than zero. Totals SHALL sum the usage that was reported and SHALL state how many attempts did not report each figure; a total with any unreported attempt SHALL be presented as a lower bound, never as a complete total and never as unknown when other attempts reported usage. A provider-reported charge (such as OpenRouter `usage.cost` in USD) SHALL be recorded per attempt and totalled; a channel that reports no charge SHALL show none rather than zero, and a total with any attempt lacking a reported charge SHALL follow the same lower-bound rule. Cached answers SHALL not charge their original usage again. Accounting SHALL not export transcript bodies or credentials or trigger additional evaluations.

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
- **THEN** the report marks that attempt's usage unknown, still totals the usage other attempts reported, counts the unreported attempt, and does not claim a complete total

#### Scenario: Short-context overhead is measurable
- **WHEN** rolling-state overhead makes a short-context request larger than its baseline
- **THEN** that regression appears alongside savings on other workloads rather than being omitted from the comparison

#### Scenario: A provider reports the charge
- **WHEN** every attempt of an audit on OpenRouter reports `usage.cost`
- **THEN** diagnostics record each charge and their USD total, and a channel without reported charges shows no dollar total
