## Why

Audit should own task questions, permitted evidence, scheduling and safe advice, not duplicate model selection, authentication, transport, caching or capacity recovery. Integrating the extended shared judgment service removes those competing implementations without sacrificing the existing partial-stage recovery, factual continuity and per-attempt accounting contracts.

## What Changes

- Replace audit's direct System One transport, credential resolution and judgment recovery/cache with the discoverable shared service's resumable-review API; do not retain a direct-HTTP fallback.
- Preserve main-process ownership suppression, cadence/cooldown/manual/full/terminal behavior, independent task scopes, evidence/source authority, repeat suppression and deterministic TODO safety.
- Pass numeric gates to the service for native answers only; consume discrete LLM choices without treating compatibility confidence numbers as policy evidence.
- Retain audit business receipts and display diagnostics from actual service attempts and durable progress. Incomplete stages never become final completion, split or continuation advice.
- **BREAKING**: Explicit old audit `model`, `apiUrl`, `apiKey`, `apiKeyEnvVar` and `contextLimits` fields are load-compatible but ignored with a bounded migration notice listing field names only. Backend/model/capacity settings move to the shared service, credentials and provider endpoints to Pi. Do not copy values or rewrite files automatically.
- When the service is absent or lacks the resumable extension, skip inference and advice, provide a bounded automatic notice or a clear manual error, and look up the service again on the next eligible trigger. Main-agent/TODO operation continues.

## Capabilities

### New Capabilities
- `shared-audit-integration`: Service discovery, migration behavior, policy boundary and predecessor-preserving integration.

### Modified Capabilities
- `jev-todo-audit`: Replace audit-owned transport configuration and confidence evaluation with the shared ownership model; preserve unaffected business and safety requirements.

## Impact

Development target: `/home/xz/Code/ai/pi-jev-todo-audit` (baseline `f02aaf4`). Depends on the service change `support-resumable-audit-reviews` and its Pi prerequisite `expose-classifier-attempt-observations`, both planned in `/home/xz/Code/ai/pi-llm-as-jev`.

Principal seams are `index.ts`, `typesafe.ts`, `rolling.ts`, `capacity.ts`, `ledger.ts`, `config.ts`, `verdict.ts`, a copied service client, existing tests and README. Existing completed-but-unarchived changes `prevent-audit-request-amplification` and `improve-audit-context-fidelity` remain predecessor contracts. The installed checkout, unrelated `.serena/`, watchdog, live provider calls and publication are outside scope.
