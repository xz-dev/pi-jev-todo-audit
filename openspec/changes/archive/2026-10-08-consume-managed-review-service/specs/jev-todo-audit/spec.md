## MODIFIED Requirements

### Requirement: Resumable rolling conclusions
Audit SHALL own finite business-stage definitions, factual obligations, cumulative judgments and durable session JSONL result reuse. The shared service SHALL execute the supplied stage/projection contract, handle capacity and actual backend identity, validate reusable raw answers and apply the backend-specific timeout. Audit SHALL not require a service-owned business-history checkpoint to restore its new cache.

A rolling conclusion SHALL replace the prior cumulative conclusion for its declared scope instead of concatenating every earlier result. Reported facts, model opinions and processing coverage SHALL remain distinct. Task goals, outcomes, blockers and user constraints SHALL come from actual permitted task/event data or source-backed declared facts, not from an unchanged choice label. No new summary model, prose-generation request or LLM-only factual result SHALL be required. Unsupported factual dependencies SHALL retain/reconstruct originals or keep the affected scope uncertain.

A business range SHALL become durably complete only after its required validated evaluations and progress receipt are acknowledged in the captured active session/branch. Missing answers, failed persistence or an incomplete chunk SHALL not advance that range. Independently completed evaluations and prior committed ranges SHALL remain reusable after a later failure where their full identity remains compatible. Own ledger/diagnostic entries SHALL not become evidence or change business freshness.

Intermediate engine results SHALL not become final task completion/split/continuation advice while required business stages remain unprocessed. Audit SHALL validate currentness, source eligibility and authority before final delivery. Actual model/rule/input changes SHALL invalidate incompatible reuse; at most one eligible rebuild may establish a new baseline without repeatedly submitting the same invalid service checkpoint. Ordinary cache reuse SHALL not authorize execution or TODO mutation.

#### Scenario: An unchanged chunk advances progress
- **WHEN** events 101 through 120 have valid required judgments and acknowledged business persistence, although the conclusions stay unchanged
- **THEN** the consumer records their completed stage and does not pay for the same compatible evaluation again

#### Scenario: Reported progress survives an opinion update
- **WHEN** a report states that investigation is complete but rollout awaits approval, and only the granularity opinion changes
- **THEN** the outcome and approval requirement remain available as actual facts rather than being replaced by the new opinion or processed cursor

#### Scenario: A later chunk fails
- **WHEN** stages 1 and 2 have persisted compatible evaluations and stage 3 fails
- **THEN** consumer-session resumption reuses acknowledged prior work while the failed business review produces no final advice

#### Scenario: No chain of duplicate summaries
- **WHEN** a declared safe cumulative rule processes stage 3 after two completed stages
- **THEN** the next evaluation uses the latest applicable cumulative result and required source facts rather than a growing chain of prior results; undeclared facts are not silently discarded

#### Scenario: Compaction preserves a valid review receipt
- **WHEN** host context compaction leaves consumer progress, answer references and source lineage verifiable
- **THEN** compatible processed work remains reusable while genuinely missing required material stays explicit

#### Scenario: Later evidence contradicts an intermediate result
- **WHEN** an early stage suggests completion but a later required stage contains a contrary user decision or report
- **THEN** no final completion instruction is delivered from that intermediate result

#### Scenario: Model identity changes
- **WHEN** a later review uses an incompatible actual judgment identity
- **THEN** audit misses incompatible cached work and establishes the needed new baseline without treating old receipts as compatible merely because their question ids match
