## Why

The shared judgment service (`pi-llm-as-jev`) is breaking to version two: `review()`, service checkpoints, stage/cache callbacks, result caching, cross-call joins, persistent ledgers, learned capacity and transport-attempt observations are removed; ambiguous `timeoutMs` is replaced by explicit `idleTimeoutMs`/`modelTimeoutMs`. Audit must consume the stateless contract explicitly rather than silently fail or pretend v1 semantics remain. This change is the audit-side lane of the root cross-repository change `simplify-stateless-judgment-ecosystem` (`/home/xz/Code/ai/pi-llm-as-jev/openspec/changes/simplify-stateless-judgment-ecosystem/`); its approved scenarios and acceptance matrix control the behavior.

## What Changes

- **BREAKING**: require judgment service `version: 2` at every compatibility check (`index.ts`, `judgment-service.ts`, `incremental.ts`) and `capacityVersion: 2` for declared capacity. Version-one services, missing services and v1-only consumers produce the existing bounded dependency diagnostic; no downgrade, direct HTTP fallback or fake review adapter.
- Refresh the copied client `judgment-client.ts` to the canonical v2 contract: state+questions request; result with accepted `answers`, `dropped`, terminal `backend`/`model`, `stopReason`, bounded `errorMessage`, `contextOverflow`, optional scoped `usage`, optional terminal `capacity`. Remove `reuse`, `inputDimensions`, `fresh`, `evidence` array, review/checkpoint/stage/cache/observation types and `timeoutMs`. Removed request/options fields are rejected, not ignored.
- Replace audit `timeoutMs` config/call plumbing with optional `idleTimeoutMs`/`modelTimeoutMs` pass-through; omission delegates to service defaults (10 s native idle, 15 s LLM idle, no hard cap). A configured legacy `timeoutMs` produces a clear affected-feature migration diagnostic and skips audit inference until resolved, without disabling TODO/main-agent work or rewriting settings.
- Keep consumer-owned progress: scope cursors, source anchors, whole-loop packing, dependent-drift rejudgment, full-audit reset, acknowledged persistence and local capacity priors (`1/1.75` tokens per byte, 2048-byte envelope) as explicit audit estimates. Pack required facts into `state`; reduce only whole trailing loops on confirmed context overflow. No audit-side cache replaces removed service reuse.
- Remove `reuse`-dependent reporting and obsolete cache/HTTP-attempt accounting from reports, `index.ts`, `ledger.ts` and related types/UI. Optional usage stays unknown when missing; locally counted quantities get accurate labels; historical business progress stays readable.
- Update `judgment-service.ts` startup/status/post-install compatibility to v2 while preserving independent unpinned delivery, trust/offline/resource/ownership gates, user pins/filters and no automatic downgrade.
- Update `test/actual-service-fixture.ts` and actual-service corpus/integration tests to packed state, v2 timing and no ledger hooks; require `PI_JUDGMENT_SOURCE`-pointed real-service tests to execute rather than skip.
- Update README, affected local specs and existing process models; reconcile stale resumable-review prose with consumer-owned incremental state.

## Capabilities

### New Capabilities

(None — this change modifies existing audit capabilities only.)

### Modified Capabilities

- `shared-audit-integration`: version-two discovery/compatibility, consumer-owned durable progress replacing service checkpoints, native threshold semantics on fresh inference, and honest diagnostics without attempt observations or cache counters.
- `judgment-service-delivery`: compatibility predicate becomes `version: 2` with `judge()`; incompatible (including pinned v1) services report explicit diagnostics without replacement or downgrade.
- `incremental-judgment-state`: segment packing uses the v2 declared-capacity shape; consumer-owned envelope/density estimates replace service learning.
- `jev-todo-audit`: replace service-learning/cache/attempt-accounting scenarios with stateless v2 behavior; add explicit timing-option and legacy `timeoutMs` migration semantics.

## Impact

- Code: `judgment-client.ts` (copied client), `index.ts`, `incremental.ts`, `config.ts`, `judgment-service.ts`, `ledger.ts`, `capacity.ts` and dependent types/UI.
- Tests: `incremental.test.ts`, `incremental-safety.test.ts`, `incremental-lifecycle.integration.test.ts`, `judgment-service-entry.test.ts`, `service-delivery.test.ts`, `service-delivery-native.ts`, `actual-service-fixture.ts`, `shared-service*` fixtures/tests and config tests.
- Docs/models: `README.md`, `docs/` process models that encode review/checkpoint/cache semantics.
- External coordination: depends on root task 1.3 (v2 client contract) and a service candidate from root section 2 for actual-service checks. Watchdog and service repositories are out of scope here.
- Preserved: `.serena/project.yml` modifications, user config files/pins, historical session/ledger entries, neutral `pi:semantic-hook:v1` consumer behavior, rpiv-todo independence.
- No new runtime dependency, no Git writes, no installation/activation, no live/paid inference.
