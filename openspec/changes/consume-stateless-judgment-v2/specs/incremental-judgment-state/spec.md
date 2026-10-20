## MODIFIED Requirements

### Requirement: Complete-loop segmentation within selected capacity

A segment SHALL consist of consecutive complete loops (assistant message with all its tool results or explicit failures) after the scope cursor, packed within the selected judgment model's declared capacity including state, question definitions and backend envelope. The stateless service declares at most `request`, `stateAndLongestQuestion` and `contextWindow` limits with source `override`, `model` or `none`; it supplies no learned ratios, channel profiles or envelope calibration. Audit SHALL therefore apply its own documented packing estimates (a `1/1.75` tokens-per-byte prior and a 2,048-byte service envelope allowance) as consumer estimates, never as provider facts. A loop SHALL never be split. On a reported context overflow with more than one loop, recovery SHALL retain the leading half of the loops, rounded down, within the existing per-run call budget. A single loop that cannot fit with required state SHALL be reported as oversize and SHALL NOT be sliced, and the cursor SHALL NOT move past it. Non-context errors SHALL NOT trigger this recovery.

#### Scenario: Incomplete trailing loop
- **WHEN** the newest assistant message has a tool call without a recorded result
- **THEN** that loop is excluded from the segment and remains the next unjudged loop

#### Scenario: Missing capacity metadata
- **WHEN** the service reports no declared limit for the selected model
- **THEN** the audit applies its configured safety ceiling, reports the missing metadata, and does not infer a limit

#### Scenario: Optimistic estimate exceeds the recovery budget
- **GIVEN** packing selects 41 complete loops, the provider accepts at most two loops per segment, all admitted answers satisfy the existing confidence/evidence rules, and persistence succeeds
- **WHEN** the audit runs with its 32-call budget
- **THEN** it reaches and durably judges an admissible prefix before exhausting the budget
- **AND** later runs resume after the saved cursor and eventually cover the remaining suffix

#### Scenario: Irreducible single loop
- **WHEN** the service reports context overflow for one complete loop with required state
- **THEN** the audit reports oversize and leaves the scope cursor unchanged

#### Scenario: Ordinary failure
- **WHEN** the service reports an error without a context-overflow classification
- **THEN** the audit stops without subdividing that request

#### Scenario: Estimates do not decide fit
- **WHEN** a packed segment is predicted too large but the provider actually admits or rejects it
- **THEN** the actual terminal result governs retry with fewer trailing loops or an oversize report; the byte/density estimate is never presented as proof of fit or as a provider-reported limit
