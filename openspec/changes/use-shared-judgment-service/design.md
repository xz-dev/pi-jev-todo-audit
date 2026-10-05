## Context

See proposal.md. Source baselines are audit `f02aaf4`, service `905d734`, and the isolated Pi prerequisite at upstream `2003871`. The two unarchived audit predecessor changes are required contracts, not cleanup candidates. Current `typesafe.ts` mixes business questions with direct transport/cache, and `rolling.ts` mixes source projection with capacity traversal; those concerns must be separated without replacing actual facts with stored classifications.

## Goals / Non-Goals

**Goals:** a thin business consumer using one service engine and unchanged task-authority safety.

**Non-Goals:** new TODO mutation authority, changes to watchdog, auto-imported secrets or configuration, installed checkout changes, model-quality claims from synthetic tests.

## Decisions

1. **Call-time discovery, strict capability check.** Copy the canonical self-contained client. Require `version === 1`, `reviewVersion === 1` and `review` before starting work. Missing/incompatible service gets an automatic once-per-session/dependency-state notice or manual error; recheck at the next eligible trigger. No availability probe that itself dispatches inference, no old HTTP fallback, and no changes to the master enabled switch.
2. **Preserve the evidence/question builder.** Retain board/context projection and the business rubric. Refactor the request builder into Pi-shaped JSON state and string-valued Choice definitions. Preserve object/source associations, fallback options, unresolved candidates and local 255-option withholding. Put current task supplements and still-needed source-backed facts in fixed state; put new chronological evidence in the ordered evidence list. Serialize facts once, referenced by stable ids.
3. **Replace rolling traversal, not factual retention.** `rolling.ts` becomes a projection/receipt adapter. Its service stage projection carries retained applicable facts, the current framed evidence view, latest raw advisory opinions and finality into the existing business questions. The shared service owns all splitting, batching, retrying, raw cache and checkpoint validation. Audit maps whole-source completed checkpoints into its branch frontier and retains the service checkpoint id. It never advances over incomplete/withheld scopes. Mid-record fragments stay service progress, not whole-source completion.
4. **Keep business safety in `verdict.ts`.** Existing mutually exclusive actions, newer-user precedence, branch/input freshness, repeat suppression, wait-state protection and read-only board authority remain. Replace numerical re-gating with service acceptance membership; original numeric fields may exist as compatibility data but never gate an LLM choice. The service receives `confidenceThreshold` and any named-probability rules. Source evidence is still independently checked by audit.
5. **Configuration decision (confirmed).** Keep interval, cooldown, enabled, notifications, timeout, stale span and native policy threshold in audit. Detect only explicitly supplied legacy backend/credential/capacity keys and warn by name, without values; ignore them and do not rewrite either file. Untrusted project files are not read. Shared-service settings own classifier/LLM/limits; Pi owns provider endpoints/auth. The old activity-budget deprecation stays in effect. Suppressed children exit before config warnings or auth/service work.
6. **Ledger migration without invented lineage.** Keep reading old business receipts for verifiable frontier/report continuity. Old judgments do not become shared-service cache entries: they lack the new backend/transport/stage identity. An old receipt without a valid service checkpoint may preserve factual provenance but cannot claim a compatible service judgment; perform one normal eligible reassessment of unresolved judgment work, not an extra paid migration probe. Never rewrite historical entries. New receipts reference service checkpoints plus captured business input identity; only durable, active-branch records advance progress.
7. **Diagnostics are observations, not successes.** Audit keeps business diagnostics and derives usage totals from service attempt ids/presence. Preserve rejected, recovered, malformed, stale, cancelled and unsupported accounting separately. An incomplete accounting capability is an isolated review failure, not proof of zero expense. A catalog estimate is displayed separately from reported USD charge.

## Migration and verification map

| Existing seam | Retained | Transferred | Required evidence |
| --- | --- | --- | --- |
| ownership/index hooks | ownership, cadence, cooldown, terminal/manual semantics | service lookup at inference boundary | zero activity in suppressed child; later-loaded service works |
| typesafe request builder | task questions/rubric/source candidates | HTTP/auth/evaluation cache | all valid definitions reach service; oversized choice withheld |
| rolling | factual retention/projection, business frontier | splitting/partial recovery/checkpoints | stage 1/2 durable, stage 3 failure, reload sends only unresolved |
| capacity | no competing runtime predictor | limits/admission/rejection learning | 69-record/12-question admitted once; fixed facts fail honestly |
| verdict | evidence/authority/action compatibility | native numeric gates | same native threshold behavior; discrete LLM no numeric gate |
| ledger | business receipts/repeat suppression | raw judgment/attempt records | no abandoned branch reuse, bodies, credentials or duplicate charges |

## Risks / Trade-offs

- Old config can silently select a different model if ignored without notice → explicit migration notice and selected backend/model in diagnostics; user chose this behavior instead of blocking migration.
- Dynamic candidates depend on stage facts → use the service projection seam, identity exact outputs, and retain tests for 255 options and scope-local uncertainty.
- Old receipts lack service identity → preserve factual history but never relabel old evaluations as validated new service data.
- Fake provider demonstrates mechanics, not model quality or paid savings → final report distinguishes offline integration from unperformed live/deployment acceptance.

## Migration Plan

Wait for the two service-repo prerequisites' local verification. Adapt the consumer using its existing Node test style; update README migration instructions and task checkboxes only after evidence. Run a cross-repository offline harness through real audit activation, shared-service registration and patched Pi adapter with deterministic fake fetch, then the consumer's native/LLM paths. Verify repeated/reloaded calls, partial/aborted stages, ownership, late loading, old config notices, branch changes and current-task factual continuity. No deployment or publication is performed. Rollback for a future deployment is restoring the previous audit package/config with session entries untouched; it is not executed here.
