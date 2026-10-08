## Why

The current rolling audit can process history without retaining facts needed by later decisions: an offline packet experiment produced identical next requests after different old facts left the report budget, despite unchanged processing receipts. Cold/full requests can also generate 263 evidence choices, exceeding Jev's documented 255-option limit; passing request-count regressions does not establish context fidelity or provider-schema compliance.

## What Changes

- Carry source-labelled current factual material separately from JEV opinions and processing progress, using existing public task state and main-agent reports rather than a new summarizer or store.
- Introduce an optional main-agent-authored current brief in permitted task metadata, with source/coverage references. Do not require it for every task; retain still-required uncovered reports or request a concise account when material cannot be supplied safely. A report budget or Choice label must not silently erase required facts.
- Organize evidence candidates by explicit object/source relationships and applicability, not every historical record indiscriminately. Preserve uncertain coverage instead of guessing relevance from keywords or titles. `sources` is not an exclusive allowlist; `covers` cannot retire potentially needed primary evidence. A valid brief alone does not guarantee a bounded large-history candidate set.
- Enforce Jev's 255-option limit on every outbound Choice, including uncertainty/not-on-board options. When a necessary candidate set cannot be bounded safely, withhold the affected finding and request scoped material instead of truncating candidates or paying for an invalid request.
- Preserve shared-state batching, exact per-question reuse, corrected capacity learning, non-amplifying recovery, main-process ownership, source authority, stale-result suppression and honest accounting.
- Add offline request/receipt/correction regressions for fact survival, supersession, option boundaries, cold/full review and independent scopes. Use GitHub Actions Linux/Windows E2E for platform evidence; an unexecuted job remains pending.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `jev-todo-audit`: Require source-backed factual continuity distinct from classification/progress, and provider-compatible, coverage-aware Choice candidate sets.

## Impact

- Expected implementation seams: `context.ts`, `rolling.ts`, `index.ts`, `typesafe.ts`, and source/uncertainty validation in `verdict.ts` only as necessary.
- Reuse existing TODO metadata and branch/session storage. No rpiv-todo internal import, database, retrieval service, extra model, tokenizer dependency or global context registry.
- Existing tasks and ledgers remain readable; the proposed brief is optional. No cadence, confidence-threshold, credential or public command change.
- Verification and user documentation: existing Bun integration seams, GitHub Actions OS matrix and README. Mocked packet fidelity is not a measured JEV accuracy improvement or billing reduction.
- This began as a separate planning-only change. The subsequent sequential implementation request and explicit example/convention confirmation authorize implementation now. `prevent-audit-request-amplification` remains the source baseline to preserve, not a change to rewrite or archive here. Installation/activation and publication still require separate authorization.
