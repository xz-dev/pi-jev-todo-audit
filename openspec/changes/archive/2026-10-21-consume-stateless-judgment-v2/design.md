# Design: consume-stateless-judgment-v2

## Context

Audit-side lane of the root cross-repository change `simplify-stateless-judgment-ecosystem` (`/home/xz/Code/ai/pi-llm-as-jev/openspec/changes/simplify-stateless-judgment-ecosystem/`). The root proposal, all seven delta specs, `design.md`, `tasks.md` and `execution.md` are authoritative; root integration requirements remain controlling. This file records audit-local decisions within that contract, not new product behavior.

Current audit source is already closer to v2 than its specs: `incremental.ts` calls `judge()` with packed `{ state: { audit: req.state }, questions }`, `describeSelection({ path: "judge" })`, and consumer-owned cursors/packing. What is stale: the `version === 1` / `capacityVersion === 1` predicates (`index.ts`, `judgment-service.ts`, `incremental.ts`), the `timeoutMs` config/call plumbing, `reuse` counters in `SegmentReport`/ledger diagnostics, the v1 copied client (including review/checkpoint/cache/observation types and `evidence`/`fresh`/`timeoutMs` request fields), spec prose encoding service learning/caching/attempt accounting, and fixtures/tests built on the v1 envelope.

## Goals / Non-Goals

**Goals**

- Every compatibility surface agrees on `version: 2` + `judge()` and `capacityVersion: 2`, checked at each eligible call without probe inference.
- Copied `judgment-client.ts` is byte-equivalent (modulo header comment) to the canonical v2 client published by root task 1.3.
- Audit-owned packing estimates remain explicit consumer estimates; only actual provider admission decides fit.
- Actual-candidate-service tests execute (not skip) through `PI_JUDGMENT_SOURCE`.

**Non-Goals**

- No service implementation work (service lane owns it), no watchdog edits (watchdog lane, currently owned by a peer for a CI-only change).
- No audit-side judgment cache, retry framework, timing wizard or settings rewrite.
- No Git writes, installation/activation, live credentials or paid inference in this change.
- No changes to `.serena/project.yml` or unrelated historical session entries.

## Decisions

### 1. Compatibility predicate is version-two-only

`index.ts` (audit path), `judgment-service.ts` (`/jev-audit-service` status + post-install check) and `incremental.ts` (capacity query gate) all test `service?.version === 2 && typeof service.judge === "function"` and `service.capacityVersion === 2 && typeof service.describeSelection === "function"` respectively. A v1 handle or missing service produces the existing bounded `[jev audit] requires pi-llm-as-jev` diagnostic; provisioning reports version-one output as incompatible without downgrading or repinning. Dependency checks are per-call (`getJudgmentService()` at each eligible audit), so a service registered after audit load is discovered without reload — preserving the existing load-order requirement.

### 2. Timing: explicit option fields, migration diagnostic for legacy

`AuditConfig` gains optional `idleTimeoutMs`/`modelTimeoutMs` (both layers, same validation shape: positive finite integers). `timeoutMs` stays loadable but joins the migration-notice semantics with a dedicated diagnostic: while set, `auditNow` skips inference-dependent work after the dependency check and reports the required replacement (remove it for defaults, or set the explicit fields). It is added to `legacyFields`-style naming only for the notice; it is not passed to the service and not silently mapped to either new field. `runIncremental` forwards `idleTimeoutMs`/`modelTimeoutMs` instead of `timeoutMs` in both `judge()` call sites (segment + drift rejudge).

### 3. Remove observation/cache accounting; keep honest scoped reporting

- `JudgeResult.reuse`, `inputDimensions` and the whole review block are deleted from the copied client; `SegmentReport.reuse` and the `reuse?.sent` reduction in `index.ts` go away.
- `writeLedger`/`diagnose` inputs are reworked to record segments (scopes, loop ids, outcome, model/backend, overflow flag, optional scoped usage) without HTTP-attempt framing. Missing usage stays absent (`{ input?: undefined }` is not zero). Historical `llm-as-jev-ledger` entries are left alone; `withoutBookkeeping` still filters them from evidence.
- `filterAnswers` keeps the native-confidence gate; LLM answers still bypass numeric comparison.

### 4. Packing uses v2 capacity shape with consumer priors

`CapacityDisclosure` v2 drops `tokensPerByte`, `prior`, `envelopeOverheadBytes`, `channel` and the `path` selector. `runIncremental` computes `PackLimits` with declared `limits.*` when present, `limitSource: "override" | "model" | "none"`, and local priors `1/1.75` tokens-per-byte and `2048` envelope bytes. `missingCapacityMetadata` stays keyed on all three declared limits absent. Overflow recovery (halve trailing whole loops, stop at one irreducible loop, no non-overflow retries) is unchanged — it already matches the v2 stateless result contract including the terminal `contextOverflow` flag.

### 5. Fixtures and tests

- `test/actual-service-fixture.ts` updated to launch the real candidate under `PI_JUDGMENT_SOURCE` and to assert v2 discovery.
- Fake-service fixtures (`shared-llm-fixture.ts`, `shared-native-fixture.ts`, `service-delivery-native.ts`) updated to the v2 shape: `version: 2`, `capacityVersion: 2`, no `reuse`, v2 capacity fields.
- Integration tests keep coverage: `incremental.test.ts`, `incremental-safety.test.ts`, `incremental-lifecycle.integration.test.ts`, `judgment-service-entry.test.ts`, `service-delivery.test.ts`, `shared-service*` suites, plus a config test asserting the `timeoutMs` migration diagnostic blocks inference and the explicit fields forward.
- Verification commands: `npm run typecheck` (or `bun`/`tsx` equivalent in package.json scripts) and `PI_JUDGMENT_SOURCE="/home/xz/Code/ai/pi-llm-as-jev" bun test`. Actual-service tests must execute, not skip.

### 6. Docs and models

README v1/review/cache/attempt-accounting prose is reconciled to stateless v2 + consumer-owned progress. Any process models under `docs/` that encode service checkpoints, learned capacity or observation completeness are updated to the packed-state/declared-capacity model, or their stale clauses removed when the behavior no longer exists. No service-side recovery requirements are reintroduced.

## Risks / Trade-offs

- **Copied client drift**: mitigated by copying the canonical file from the service repo verbatim during implementation; a diff check in the local test suite or CI can flag divergence.
- **Independent service update races**: a v1 service installed after audit v2 deploys reports incompatibility per spec; consumer-first publication order (root task 7.2/7.3) minimizes the window.
- **Legacy `timeoutMs` users**: audit inference pauses until migrated — intentional per root decision 6; TODO/main-agent work is unaffected.
- **Actual-service tests skipping**: `PI_JUDGMENT_SOURCE` absence still skips locally by design, but acceptance requires a run where they execute; report executed counts explicitly.

## Migration notes for operators

- Remove `timeoutMs` from `jev-todo-audit.json` (both layers) to use service defaults (10 s native idle / 15 s LLM idle, no hard cap), or set `idleTimeoutMs` / `modelTimeoutMs` explicitly.
- No settings or session data is rewritten by this change.
