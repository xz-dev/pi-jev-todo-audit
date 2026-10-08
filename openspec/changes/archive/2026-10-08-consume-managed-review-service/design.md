## Context

Companion: [shared judgment execution](../../../../pi-llm-as-jev/openspec/changes/manage-review-context-and-runtime/design.md). The original draft assigned business continuation and semantic compression to a new managed service. The user subsequently chose explicit factual/accumulation contracts and corrected that ownership: the business plugin owns stage meaning and JSONL result caching; Jev owns generic finite judgment execution. These decisions supersede the original draft, not the unaffected source, authority, branch and delivery guarantees.

The inspected baseline is audit `6aa8809`, service `d34cd61`. Audit `shared-review.ts` picks `reviewOrigin`/service checkpoints, filters a processed prefix, then puts retained historical reports back into fixed state through `rolling.ts::retainedFrom`. Thus exact-repeat hits do not demonstrate appended-history compression. The old checkpoint can fail identity validation repeatedly before inference. The approximately 30-second LLM incident matches the old timer chain, but its final error text was unavailable; it is not a fully observed timeout diagnosis.

A source-grounded counterexample exposes the compression boundary: an XML-goal report and a CSV-goal report can both produce `still_ongoing`; after the same XML-only success report, their correct lifecycle conclusions differ even though the question is unchanged. Answer labels, processing coverage and hashes do not contain the distinguishing fact.

## Goals / Non-Goals

**Goals:** consumer-owned durable reuse of finite judgments; explicit business stage/fact semantics; compatible reload and model-change recovery; useful bounded judgments over divisible history; a shared backend-neutral timeout interface; unchanged final advice safety.

**Non-Goals:** LLM-only facts or prose memory, another summarizer or model, a full-LLM-prompt cache, implicit relevance inference, silent history truncation, a new database/workflow framework, direct HTTP, automatic TODO mutation, installing/pinning/downgrading services, or watchdog changes. No universal guarantee that arbitrary free text can be compressed without a sufficient business contract.

## Decisions

### A1. Separate evidence, rules, cache identity and execution

| Concern | Owner |
| --- | --- |
| Which actual historical events are permitted evidence | Audit projection |
| Finite questions, necessary facts and safe cumulative interpretation | Audit question/step definition |
| Stable business stages, processed frontier and result reuse across calls | Audit session JSONL cache |
| Actual backend/model/thinking/transport identity | Shared service, frozen before evaluating cache compatibility |
| Source framing, capacity checks and generic overflow execution | Shared service, following the supplied business stage contract |
| Native whole-call versus LLM inactivity timeout | Shared service, selected from actual backend |
| Scheduling, currentness, authority and advice deduplication | Audit |

Do not create the earlier `managedReviewVersion: 1`/`reviewManaged` business-memory API. Preserve `version: 1` and existing `reviewVersion: 1` clients. Reuse `review`, `projectStage`, genuine source bounds, validated answer handling and diagnostics; extend only the missing generic stage/cache seam with discoverable canonical types. The old capability slug `managed-audit-integration` names audit-managed integration, not service-owned business memory.

### A2. Judge historical events, not an LLM request transcript

Use the active effective conversation and its current TODO projection: actual user/assistant reports, permitted custom text, labelled available host summaries, task events and macro tool-call/result events. Preserve chronology, user-reply association, source identity, source role, first-active trajectory and explicit omissions.

Exclude ambient AGENTS/system prompts, tool-definition lists and request scaffolding that did not occur as business events. Preserve the existing exclusion of hidden thinking, private extension state, raw ordinary tool arguments/results, shell bodies and credentials. Classify by entry provenance, not by deleting every occurrence of an `AGENTS` or tool name inside a real conversation.

Keep judgment rules separate from judged evidence. The full question/rule definition and actual judgment identity still qualify cache compatibility; this does not make the main agent's system prompt or tool inventory part of the business cache. Appending this plugin's eval/progress/diagnostic entries must not alter the business input revision or re-enter the evidence stream.

### A3. Explicit facts and accumulation are a business contract

A business question declares its fixed semantic inputs, relevant source obligations, stable purpose/revision and whether/how prior results may be accumulated. Facts come from actual supplied task/event data or exact source text/bounds, not a newly generated model summary. Retained facts keep their source id, role and content identity. An authored `auditBrief` remains optional reported material; valid references are not proof of semantic completeness or permission.

For task lifecycle, retain the actual goal/acceptance scope, relevant reports, unresolved blockers and current user decisions. For granularity, preserve the required first-active trajectory and existing tracked decomposition. Source-selection questions retain all still-eligible candidates; choosing one primary source does not prove the rest irrelevant. A callback may not declare history irrelevant solely because a cached answer label stayed equal.

Safe accumulation is explicit and versioned. Undeclared or unsupported factual dependence falls back to retaining/reconstructing required originals or marking the affected scope incomplete. An irreducible factual floor is not a compression success. The XML/CSV counterexample, including its unchanged-question form, stays in acceptance.

Consumer-supplied semantic contracts do not waive the incremental-cost objective or imply acceptance of full resends. They are not a summary generator. No component promises automatic retirement of arbitrary free-text reports. J06 distinguishes eligible declared accumulation from a conservative unsupported case; it must not be passed by silently moving missing facts into an unmeasured prompt field.

### A4. Business stages use the existing engine, not a duplicated engine

Audit defines a finite ordered stage plan and the projection/accumulation function for its questions. Stable stage purposes and source boundaries allow completed compatible stages to survive appended history; process an eligible partial tail rather than waiting for a full block. Stage meaning and state belong to audit; byte admission, real source fragments and actual provider requests belong to Jev.

Tool-result uncertainty is range-local: reconstruct pending calls from the calls and complete results actually supplied to that stage. A result in a later range cannot retrospectively close a call in an earlier sealed range; an unrelated pending tail call cannot invalidate that earlier range. The final range still reports genuine missing results. Other incomplete-source/fragment guards remain; this rule is not evidence retirement. Known private/session metadata is neither evidence nor a missing historical fact. Version the changed projection (`audit-source-projection/3`); do not rewrite service cache keys.

A cached intermediate pass is not a demonstrated cost benefit. Compare first processing plus successive appends with a direct, non-prestaged review of the same permitted facts/questions under the same execution conditions. Count whole outgoing packets and all judgments, including cold precomputation. A larger-than-model fixture can characterize orchestration but cannot certify production capacity or semantic accuracy.

Existing `projectStage` receives engine-selected frames and can project state/questions, but cannot choose evidence boundaries. Existing `onProgress` reports service-acknowledged stages, not independently restorable external answers. The canonical extension must expose the missing business-directed stage and cache semantics honestly rather than claim those existing callbacks already implement them.

At admission the service freezes actual execution identity, then invokes the business plan under that identity. A consumer plan is finite and source-bound; invalid/no-progress subdivisions produce a scoped error rather than endless retries. A single service operation retains its applicable timeout/cancellation and selected model across stages. If a first incremental slice uses multiple existing `review` calls, label it as a partial adapter slice, not completion of the single-operation staged contract or native whole-call timing gate.

Keep intermediate opinions internal to the business review. Engine-final for a submitted stage is not business-final for the entire captured audit. Only the accumulated, fully supported final scopes reach `verdict.ts`.

### A5. Session JSONL owns exact reusable results

Use existing `pi.appendEntry` custom entries and active-branch replay; no separate file or database. Introduce versioned consumer records without rewriting old entries:

- **Evaluation:** opaque versioned exact evaluation key, validated raw answer, stage purpose and source manifest.
- **Business progress:** semantic/staging revision, processed source ids/genuine bounds/content-role hashes, required evaluation references, explicit accumulated facts or exact source references and unresolved obligations.
- **Final receipt:** captured business input revision and supported final scopes; distinct from intermediate progress.

The shared service computes exact evaluation keys after actual backend selection, redaction and stage projection. An optional synchronous cache port performs `lookup(key)` and acknowledged `store(key, rawAnswer)` using audit's already loaded branch-local cache. Audit must not guess identity from a configured model name or question id. The service validates restored answers and reapplies current acceptance policy; numerical threshold changes alone need not buy the raw judgment again.

The key covers actual backend/model/transport/thinking, business scope/projection revision, effective fixed state, ordered framed evidence with roles/bounds, genuine prior inputs, full question and evaluation finality. A cache hit covers that evaluated input only, not new facts or a new final answer after append.

Persist evaluations before progress. Failed append means no durable frontier advance, though valid current final advice can remain valid. Capture active session/branch/generation/input revision for every write and delivery. Ignore abandoned-branch entries and reject late stores. Restoring a receipt requires its referenced answers and source lineage, not merely a structurally plausible cursor.

No new audit path requires a service checkpoint. Legacy receipts/evaluations remain historical bookkeeping and old delivery keys remain effective. A changed execution/semantic identity invalidates incompatible business reuse and permits at most one eligible baseline rebuild; no repeated submission of an old service seed or hidden model switch.

### A6. One timeout value, backend-specific service semantics

Audit continues passing its configured `timeoutMs` and caller cancellation signal. Do not deprecate/ignore that setting or make audit choose a timeout mode.

- Actual LLM execution: inactivity/stream waiting, including a bounded first response; healthy reasoning/tool/transport activity prevents a false total-call timeout. No shared countdown over all questions/stages.
- Actual native Jev execution: one logical-call absolute deadline, including internal stages; splitting cannot keep restarting the budget.
- Both: bounded setup, prompt caller/branch cancellation, guarded settlement and no late effects. The emulated classifier follows its actual LLM execution semantics.

Audit keeps one-active scheduling, cooldown and latest relevant pending trigger. A longer healthy stream never permits stale advice. Documentation must distinguish timeout from provider error and caller cancellation without rewriting user settings.

### A7. Compatibility, diagnostics and safe delivery

Discover the actual canonical execution capability at call time and in service status. Missing required capability is a bounded diagnostic, not permission to fall back to the old checkpoint-coupled adapter or direct HTTP. Availability is not proof of inference. Preserve independent package ownership, resource/trust filters, load-order behavior and no automatic downgrade/pinning.

Use service attempt observations and presence-aware usage; `reuse.sent`, HTTP 200 and catalog cost are not interchangeable with actual attempts, valid judgments or billed charges. Keep stable incident deduplication while manual inspection remains informative. Cached raw results, durable progress and user authority are three distinct things.

Existing per-task source, waiting, blocker, cancellation, reported-not-verified completion and split-only safeguards remain. No direct TODO mutation or execution wakeup follows solely from a successful/cached judgment.

### A8. Formal model and verification boundary

During apply maintain a small authoritative Lean model under `docs/programming-thinking/` for consumer stage/cache/delivery transitions. Model declared fact obligations and identity/durability guards; do not claim to prove factual truth, arbitrary-text sufficiency or the TypeScript implementation. Follow the two-pass check/run/axiom and fresh neutral-context semantic-reader procedure. No model is verified merely because this document names it.

```text
Historical events --> Business stage/fact contract --> Shared execution
                              ^                             |
                              |                             v
                       Session JSONL cache <---- Validated results
                                                            |
                                                            v
                                               Currentness + authority
                                                            |
                                                            v
                                                   Final-only advice
```

### A9. Joint acceptance IDs

These IDs retain their joint meanings while adopting the corrected owner and timeout contracts. Use actual candidate service/audit code with controlled transport; default canned opinions prove wiring, not semantic fidelity.

| ID | Required observation |
| --- | --- |
| J01 | Old session/model switch invalidates incompatible business reuse and completes without repeated rejected service seeds |
| J02 | Healthy LLM stream and successive questions exceed the supplied total-duration number while activity gaps remain below it |
| J03 | No first response, body stall, reasoning/tool activity and explicit cancellation have correct bounded outcomes |
| J04 | Stable business stages, append/repeat/reload; unchanged compatible repeat has zero provider attempts from consumer JSONL cache |
| J05 | A/B durably validated before C fails survive retry; failed or partial business review produces no final advice |
| J06 | Declared raw-history accumulation avoids repeated discharged material; optional authored accounts and undeclared/irreducible controls stay separate; measure the entire outbound packet |
| J07 | Same-question XML/CSV, later permission withdrawal, missing source and partial fragment preserve distinguishing facts or withhold the affected scope |
| J08 | Branch switch and failed append cannot create stale writes/advice or false durable progress |
| J09 | Consumer-owned explicit full-review intent resumes its unfinished work; a later completed full intent is new |
| J10 | Actual execution capability, both load orders, disabled/filtered resources and suppressed child remain safe |
| J11 | Native discrete answers, acceptance policy and one whole-call deadline remain correct through stages |
| J12 | Another consumer can supply its own stage/cache functions without any TODO-specific service memory or LLM-only field |
| J13 | One old-session recovery/healthy long-stream/declared business accumulation/consumer-cache reload trace succeeds end to end |
| J14 | Real attempts, missing usage, recovery and repeated failure notices are honest and bounded |

A real-clock offline stream exceeding 30 seconds supplements scaled timing tests; no paid inference is needed. Preserve the XML/CSV difference in the oracle rather than returning canned success. User acceptance, tests and formal model evidence remain separate gates.

## Risks / Trade-offs

- Consumer declarations can omit a necessary fact -> conservative fallback, exact source evidence and explicit unresolved scope; do not infer sufficiency from labels or hashes.
- An external cache port can return malformed/stale data -> service-computed full keys and answer validation plus consumer branch/input guards.
- Service-owned legacy progress and new consumer durability can be confused -> separate records/acknowledgements; never promote a service checkpoint or an audit cursor alone.
- A staged adapter can accidentally reset native budgets -> enforce one logical service operation for the final contract and retain its deadline across internal stages.
- Independent package updates can expose protocol skew -> explicit capability checks and service-first delivery, never automatic pinning/downgrade.

## Migration Plan

1. Reconcile the companion's canonical stage/cache contract and these artifacts with the confirmed ownership correction; do not implement the superseded managed-memory API.
2. Create/check the relevant process model, then add consumer-cache replay and exact-answer integration as the smallest observable slice, using existing helpers and offline fixtures.
3. Bind business stage/fact rules, eliminate required service-checkpoint coupling, retain full-review intent and pass the unchanged timeout option.
4. Verify all J01-J14 against both candidate revisions, especially native total timing across stages and whole-packet append savings under declared semantic contracts.
5. Run `bun run typecheck`, `bun test`, companion checks and required independent review; leave partial tasks/gates visibly open.
6. Present evidence for human acceptance. Activation/publication/paid validation/archive need separate authorization; service-first activation and code-only rollback must not delete historical session records.
