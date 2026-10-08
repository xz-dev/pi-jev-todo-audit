## Why

The current capacity predictor and subdivision loop amplify a cheap audit into hundreds of paid requests: an October 1 trace replay reproduced 819 successful single-question requests carrying 19,674,931 reported input tokens. A historical maximum token/byte ratio keeps predicting overflow for later admitted inputs, while splitting new records leaves the dominant retained state unchanged and repeats it for every question.

## What Changes

- **BREAKING (inherited child runtimes only):** Make JEV main-agent-only using its own `PI_JEV_TODO_AUDIT_OWNER_PID` environment marker: an unmarked Pi process claims ownership with Node.js `process.pid`, reload in that process stays enabled, and descendants inheriting a different owner PID skip JEV entirely. This does not depend on a subagent framework's private environment variables.
- Keep the ownership check portable through Node.js APIs on Windows and POSIX systems. Children perform no automatic/manual audit, credential lookup, correction injection, or audit bookkeeping; no child override switch is added.
- Make capacity learning correctable by later successful admissions, preserving endpoint/model isolation and the provider's separate request-wide and state-plus-longest-question limits.
- Distinguish the constrained dimension and fixed retained state from divisible new evidence; do not recursively split a dimension that cannot resolve the predicted or observed overflow.
- Allow bounded provider admission to resolve a disputed prediction before multiplying work; reuse any valid answers and never resend an identical known-rejected envelope.
- Stop an actually irreducible fixed-state scope with a concise diagnostic instead of buying the same prefix for every new record/question; retain user constraints, completed answers, and durable progress.
- Add deterministic offline regressions and privacy-safe replay evidence for request amplification, reload behavior, true overflow, and complete coverage. Keep measured tokens/charges separate from simulated workload measurements.
- Keep main-agent cadence, cooldown, normal/full review semantics, credential handling, verdict policy, and required-evidence retention unchanged. No new model, tokenizer dependency, database, cross-session cache, or arbitrary character quota.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `jev-todo-audit`: Restrict auditing to main agents and require admission-correctable capacity prediction and fixed-state-aware subdivision that avoids record-by-question request multiplication, while preserving complete evidence coverage, reuse, and truthful cost diagnostics.

## Impact

- Primary implementation surfaces: `index.ts`, `capacity.ts`, `typesafe.ts`, and `rolling.ts`.
- Integration and accounting surfaces: `ledger.ts` only where needed for corrected profile replay and compact diagnostic outcomes. Process ownership uses Node.js primitives, not a dependency on `pi-subagents` internals; same-process child sessions must continue excluding this main-only extension at launch.
- Verification: existing Bun suites under `test/`, Node.js child-process inheritance tests, Linux/Windows execution, a small sanitized amplification fixture, and an optional local-only replay of the incident session. Raw session contents and credentials must not enter the repository.
- Documentation: affected capacity/recovery behavior in `README.md`; the main capability spec is synchronized in the later implementation/archive workflow, not by this proposal.
- Compatibility: no configuration migration or main-agent public command change. Subagents intentionally stop exposing/performing JEV audits. Existing diagnostic and answer records remain readable; corrected learning is reconstructed from observed attempts rather than persisting another state store.
