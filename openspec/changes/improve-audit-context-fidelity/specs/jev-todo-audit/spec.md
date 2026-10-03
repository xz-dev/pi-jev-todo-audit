## ADDED Requirements

### Requirement: Source-backed current factual material

An audit SHALL distinguish current reported facts, applicable user decisions, JEV opinions and processing progress. Necessary facts such as task goals, acceptance conditions, design decisions, reported outcomes and blockers SHALL remain available with their object scope, source identities and original authority level after their input range is processed. An unchanged classification or completed receipt SHALL NOT substitute for those facts or establish that they survived compression.

Current factual material SHALL come from permitted public task state or main-agent-authored reports/briefs, not model-generated reconstruction of missing history. A supplied current brief SHALL be optional; existing task descriptions and public reports SHALL remain usable without a mandatory new metadata field. Explicit replacement or coverage declarations SHALL be checked against the allowed active history. Uncertain relevance, missing lineage and contradictory material SHALL be disclosed for the affected finding rather than silently treated as absence or success.

A main-agent brief SHALL remain reported data, not new user permission or independently verified execution. It SHALL NOT authorize removal of user constraints, restore excluded execution payloads, promote JEV advice into evidence, or change another object's facts. Later user decisions SHALL retain precedence. Needed uncovered report material SHALL NOT be dropped solely by age, a compact-report character budget, or a changed JEV opinion; if it cannot be admitted safely, the affected scope SHALL request a concise current account or remain uncertain.

#### Scenario: Different old facts remain distinguishable
- **WHEN** two task histories differ in a needed earlier format decision, later routine reports fill the compact report budget, and their previous JEV classifications are identical
- **THEN** each next decision receives the still-applicable fact through its source-labelled report or current brief, so the factual inputs remain distinguishable
- **AND** processing completeness alone is not presented as factual preservation

#### Scenario: A current brief replaces declared reports
- **WHEN** a main agent supplies a current account with valid scope and coverage references to earlier public reports
- **THEN** that account can carry the reported facts with explicit lineage and reported-versus-verified status, but covered reports remain supplied and selectable when their primary eligibility is needed or uncertain
- **AND** unrelated reports and user-authority records are not removed by that declaration; supporting references are not an exclusive evidence allowlist

#### Scenario: Legacy task has no brief
- **WHEN** a task has no new current-brief field but its necessary facts are available in permitted descriptions or public reports
- **THEN** those materials remain usable instead of requiring a schema migration or withholding every audit

#### Scenario: Required report cannot be retained
- **WHEN** necessary uncovered factual material cannot fit even after the existing progressing capacity recovery
- **THEN** the affected scope requests a concise account or reports uncertainty, retains completed work, and does not silently discard the fact or traverse repeated sibling combinations

#### Scenario: A later decision supersedes a report
- **WHEN** a later user decision or explicit applicable report update withdraws an earlier plan or changes a needed fact
- **THEN** the current account exposes that change and an older classification, report or coverage declaration cannot restore the superseded authority

#### Scenario: Claimed provenance is unavailable
- **WHEN** a brief names a missing, redacted, abandoned-branch or unsupported source
- **THEN** the gap remains explicit and the claimed reference grants neither execution permission nor independent completion evidence

### Requirement: Provider-compatible Choice candidate sets

Every actual outbound Choice SHALL contain no more than Jev's documented 255 options, counting uncertainty, not-on-board and other fallback options. This structural contract SHALL be checked before provider work and SHALL remain separate from token-window prediction, context rejection and transport retry policy. An invalid local candidate set SHALL NOT be submitted as an admission probe or recorded as an actual rejected envelope.

Evidence candidates SHALL represent applicable supplied facts or public sources for the specific finding, using explicit object/source associations and coverage. The extension SHALL NOT indiscriminately equate every historical source with relevance, guess relevance from keyword/title similarity, truncate to the first or newest 254 sources, silently omit required tasks, or treat excluded evidence as nonexistent. When a necessary set cannot be bounded without unverified loss, the affected finding SHALL remain incomplete with a bounded request for scoped factual material. Independent valid findings and previously completed evaluations SHALL remain reusable under the existing safety rules; no receipt SHALL claim that a locally withheld required question was answered.

Candidate definitions, factual material and provenance changes SHALL participate in evaluation identity and current-input freshness. Unchanged canonical material SHALL remain reusable; modified options or a changed fact/reference SHALL NOT borrow an answer to a different definition. Local withholding SHALL count as zero provider attempts and SHALL NOT manufacture usage, confidence or a model judgment.

#### Scenario: Boundary includes fallback options
- **WHEN** a question has 254 applicable candidates plus one uncertainty option
- **THEN** its 255-option definition is eligible for normal batching and token admission

#### Scenario: Required candidates exceed the limit
- **WHEN** a finding still needs 255 candidates plus an uncertainty option and no verified scoping can reduce that set
- **THEN** that question makes no provider request, remains incomplete and requests scoped material without deleting a candidate or recording a context rejection

#### Scenario: Cold or full review has many historical records
- **WHEN** a cold or full review encounters more than 255 historical source candidates
- **THEN** it uses established applicability to form complete bounded candidate sets or reports the unresolved scope without submitting an oversized Choice; a structurally valid brief and coverage list alone do not bound potentially needed primary reports
- **AND** full mode neither bypasses the option guard nor restores raw execution payloads
- **AND** repeating the same brief is not promised to resolve the limitation and does not repeat an unchanged clarification

#### Scenario: Another Choice is oversized
- **WHEN** a board-matching or other non-evidence Choice exceeds the documented option limit
- **THEN** the same outbound guard withholds its affected finding without silently removing task identities

#### Scenario: One scope is unresolved
- **WHEN** one task's required evidence set cannot be bounded but another task has valid independent findings
- **THEN** the unresolved task gets no unsupported correction, compatible completed work is retained, and the other findings remain eligible under existing authority and freshness rules

#### Scenario: A fact or source definition changes
- **WHEN** an applicable brief, coverage reference or option definition changes while older Choice labels happen to remain the same
- **THEN** the changed material invalidates the old evaluated-pair identity and stale delivery is suppressed

## MODIFIED Requirements

### Requirement: Resumable rolling conclusions

The audit SHALL carry forward the latest structured conclusions and relevant task state rather than repeatedly submit previously processed raw context. A rolling result SHALL replace the previous cumulative result for its scope; the request SHALL NOT grow by concatenating every earlier summary or result. Stored conclusions are revisable findings, not independent user authority or a guarantee of lossless prose summarization.

Reported work, JEV opinions and processing progress SHALL remain distinguishable. Required macro facts—task goal, reported stage outcomes, blockers and open questions—SHALL come from permitted task state or main-agent reports, not be invented from a classification or completed-range marker. A newer opinion or cursor SHALL NOT silently erase a still-applicable supplied report. Source-backed current factual material SHALL carry needed facts independently of optional recent-report retention; uncovered necessary report material SHALL not be removed merely because a compact report budget is full. When a necessary compact account is unavailable, the leader SHALL request clarification through the normal main-agent feedback path or retain uncertainty, not pretend that a previous answer contains the missing facts.

A processing range SHALL be marked complete only after its required questions have valid answers and its cumulative result is durably recorded for the captured inputs. An unchanged result SHALL still advance that range. Missing answers, a locally withheld over-limit Choice or a failed chunk SHALL NOT advance its range, but SHALL NOT discard valid question answers or completed earlier ranges. Compatible reload/compaction SHALL restore recorded progress and applicable factual material rather than replay already processed raw history solely because volatile memory was lost. Unverifiable or abandoned-branch records SHALL not be promoted into current findings.

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
- **AND** any missing original factual source is disclosed rather than reconstructed from a classification

#### Scenario: Later evidence contradicts an intermediate result
- **WHEN** an early chunk suggests completion but a later required chunk contains a contrary user decision or report
- **THEN** no completion instruction is issued from the intermediate result, and the final review accounts for the later information

#### Scenario: Routine reports do not crowd out a needed fact
- **WHEN** many newer routine reports exhaust the recent-report allowance but an older reported decision is still required
- **THEN** the current factual account or necessary uncovered report preserves that decision, or the affected finding remains explicitly uncertain rather than pretending its historical Choice label preserved it
