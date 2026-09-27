## Why

Jev currently receives a lossy board summary and a short suffix of assistant/user text, omitting visible tool evidence and task details that explain waiting, completion, and task boundaries. Audits can therefore contradict what the user sees; richer recent context and a global view of the authorized work are needed before asking jev to correct the board or split tasks.

## What Changes

- Replace the ad hoc activity digest with a chronological, source-labelled view of human-visible conversation content: user and assistant text, tool calls and results, visible extension messages, and applicable conversation summaries. Handle unfamiliar tools through Pi's public message envelope rather than tool-name-specific parsers.
- Give each audit two complementary views: a faithful recent interaction window for the immediate situation, and broader effective conversation context for goals, scope changes, constraints, acceptance criteria, and task relationships. Reuse Pi's branch/compaction-aware context; do not add a second summarizing model or replay abandoned branches.
- Supplement conversation evidence with relevant persisted agent-side task information, including descriptions, ownership, dependencies, and metadata when available. Keep the existing rpiv-todo board adapter separate from general context collection; do not require other tools to adopt its schema.
- Select evidence for the decisions being made before checking capacity: preserve goals, authorization, acceptance criteria, the latest complete interaction, supporting and contradictory work evidence; omit unrelated historical payloads and duplicate records with explicit provenance/coverage. Do not fill the context window merely because space is available.
- Sanitize outbound evidence, preserve source and call/result associations, and disclose genuinely unavailable context. Send all selected recent/global/task evidence that fits the configured jev model's documented hard context limits; remove the last-20-fragments rule and application-level character budgets. `activityBudgetChars` becomes a deprecated, ignored compatibility setting rather than a hidden lower limit.
- Apply a source-backed, task-specific granularity rubric: match the item level, identify completion evidence and a concrete next action, assess useful progress/checkpoint boundaries, and consider whether subdivision improves control without losing coherent value or duplicating work. Distinguish splitting, clarification, blocking, and insufficient evidence; age is a review signal, not proof that splitting is needed.
- Prevent contradictory or repeated corrective demands on unchanged evidence. Explain corrections with the affected task and supporting context instead of treating model confidence as a substitute for evidence.

## Capabilities

### New Capabilities

None. This change strengthens the existing audit capability rather than introducing another task system.

### Modified Capabilities

- `jev-todo-audit`: Expand audit context to recent and global evidence with tool-independent collection, relevant task supplements, provider-hard-limit handling, engineering-grounded lifecycle/granularity decisions, and correction suppression when evidence is insufficient or unchanged.

## Impact

- Likely implementation areas: `index.ts` (context assembly and delivery), `board.ts` (task supplements and age as diagnostic evidence), `typesafe.ts` (model input limits, questions, and answer validation), `verdict.ts` (evidence-aware corrections), and `config.ts` (retiring the character-budget behavior). A small context module may isolate collection and serialization if this keeps the entrypoint simpler.
- Extend the existing Bun tests at request and injected-message boundaries. Update README behavior/configuration documentation during implementation; no new test framework or runtime dependency is required.
- TypeSafe will receive more of the existing conversation, including visible tool inputs/results and related task data. Redaction and explicit omission are required; hidden thinking, known credentials, raw image/binary payloads, and arbitrary private extension state are excluded. Fit is constrained by the provider's token limits, not an application cost budget.
- Preserve the existing periodic/manual/optional watchdog triggers, advisory-only TODO updates, configuration layering, and rpiv-todo persistence boundary. No hard tool blocker, new watchdog, tool-adapter registry, or changes to upstream plugins.
- Planning artifacts only in this change creation phase. Implementation and release remain separate actions after review.
