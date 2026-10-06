## Why

Users need to see exactly what the plugin tells the main agent without decoding repeated labels, disclaimers and delivery receipts. Audit advisories already share visible message content with the main agent; this change simplifies that existing surface rather than adding a second summary or exposing backend JEV traffic.

## What Changes

- Use one concise, persisted body for each main-agent advisory: ordinary corrections, Choice-context incompleteness and factual-context incompleteness. Show all task-specific content by default, collapse only the recognized shared advisory footer, and reveal the complete original body on expansion. Do not construct a separate human summary or alter the main-agent content.
- Present one plugin identity, the concrete suggestion or limitation, its task/source scope and the necessary authority boundary. Remove redundant headings and repeated generic disclaimers, not evidence or action-specific restrictions.
- Preserve plugin attribution in the model-facing text, including after conversion to a user-role message. Advice remains non-authoritative, does not interrupt current work solely by arriving, respects current scope/waits and requires no separate acknowledgment.
- Preserve board-only reconciliation, already-authorized continuation and incomplete-review limits as distinct cases. Shorter wording must not imply verified completion, permission, guaranteed recovery or a new task-status decision.
- Remove the extra `correction injected` notification when the advisory itself is visible. Keep operational notices separate and UI-only; do not expose internal JEV requests, answers, retries or diagnostics as conversation content.
- Render stored historical content without regenerating it from current wording or configuration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `jev-todo-audit`: Add an explicit shared-body presentation contract for main-agent advisories, concise but safety-preserving content requirements, separation from UI-only status and faithful historical rendering.

## Impact

- Expected implementation seams: `index.ts` advisory composition, delivery and message-renderer registration; `verdict.ts` correction wording; existing Bun integration/verdict tests; README behavior notes.
- Reuse Pi's custom-message and native TUI facilities. No new model call, message store, event protocol, settings surface or runtime dependency on `pi-continue-watchdog`; borrow only its same-body rendering pattern.
- Preserve `jev-todo-audit` custom type, persisted `auditKeys`, existing redaction, authority/evidence checks, repeat suppression, steer transport and terminal-wakeup decisions. Historical session data requires no migration.
- No changes to JEV request construction, shared-service selection, review/capacity recovery, task mutation authority, installation or deployment. Leave the in-progress `auto-install-judgment-service` work untouched.
- This change contains planning artifacts only. Implementation, testing of changed behavior and rollout require subsequent authorization.
