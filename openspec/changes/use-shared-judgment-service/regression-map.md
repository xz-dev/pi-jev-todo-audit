# Migration regression map

Implementation and independent offline acceptance are complete. Historical snapshots remain labelled for traceability; they are not current acceptance failures. Tasks 4.3 and 4.4 are closed by the approved R2 review and final delivery record.

## Final independent approval

- **Approved with explicit residual risk** for manifest `/var/tmp/judgment-migration-candidate-r2.json`, SHA-256 `c82e58a35ac79698cfcc9f4055cf6eae91834c3b3b3956a2da8d3cc4cb4f3566`.
- Report: `/var/tmp/judgment-migration-review-r2.md`; reviewer run `2a1ebdc7-8894-4af5-8da7-e6adc9e749df`. **F1 and F2 closed**, no remaining blocker within the bounded repair review.
- Independently repeated: service **296**, ordinary audit **311** (70 optional skips), all six enabled integration suites **70**, types/lint/diff/client equality. Original Pi **80/80** and Node ownership evidence remain attached to unchanged source. Logs `/var/tmp/r2-review-{service-test,audit-test,wire}.log`; integrity `/var/tmp/r2-review-integrity.json`.
- Additional independent promotion probe proves earlier question-half results cannot overwrite later final evidence-stage results; repeat/reload remain zero-send.
- Final inventory: `/var/tmp/judgment-migration-delivery.json`. Only approval/evidence/task bookkeeping changed after R2; implementation, tests, interfaces, READMEs and generated artifacts retain approved hashes. The receipt lists the three documentation-only differences explicitly.
- Service and audit changes each have **13/13 tasks complete**. All linked changes and both predecessors remain unarchived. No installed rollout, new live inference, publication, commit or push occurred.

Approval is offline implementation acceptance, not live quality/cost, installed activation, universal provider support or current Windows execution. The documented fragment/full-token limits, honestly incomplete difficult corpus and 56 non-blocking warnings remain.

## F1/F2 repaired candidate evidence

The independent review of initial manifest `ad3182db42fa2f4c2948efa08622ed71512caed60aafac5589b900d526b32486` requested changes for two reproduced blockers. No approval is implied by the initial green gate below.

- **F1 question-bound recovery:** service now preserves full evidence/frozen priors for question pressure, reduces evidence for state pressure, and prevents a necessary full-question evidence traversal from being replayed by ancestor question siblings. An irreducible source belongs to the admission floor. Four real native mixed-pressure scenarios and the strengthened partial-batch/reload test cover the repair; existing R16 and other source assertions remain unchanged.
- **F2 manual-full feedback:** absent/old-service tests cover ordinary/full commands before/after automatic notices, repeated manual errors, automatic deduplication, zero fallback/auth/advice/ledger activity, and later discovery.
- RED `/var/tmp/review-f1-f2-red.log`: six failures. Unchanged reviewer repros now pass at `/var/tmp/repair-final-review-{question-dimension,manual-full}.log`; the six-record question-heavy case is two requests and one stage, not twelve requests/six stages.
- Repaired full gates: service **296 pass**; ordinary audit **311 pass, 70 optional skips, 0 fail, 2,982 assertions**; all six explicit integration files **70 pass, 0 fail, 2,206 assertions**; types/build pass; 56 previously attributed warnings unchanged. Logs `/var/tmp/repair-{service,audit,audit-types,wire}.log`.
- Revised manifest: `/var/tmp/judgment-migration-candidate-r2.json`. Initial manifest/patches are retained. Only accepted F1/F2 repair, tests and associated evidence/task records changed.

The independent re-review subsequently closed both findings and approved R2 with the explicit scope limits above. Full-token and public-fragment/local-withholding boundaries received no new blocker. No deployment/live inference/publication/Git submission is performed.

## Initial candidate gate and task reconciliation (historical)

- `/var/tmp/final-service.log`: **296 pass / 0 fail**, types/build pass; 56 attributed lint warnings.
- `/var/tmp/final-audit.log`: **303 pass / 66 optional skips / 0 fail / 2,862 assertions**. Historical comparison tests are not owner evidence.
- `/var/tmp/final-wire.log`: **66 pass / 0 fail / 1,974 assertions**, all six opt-in suites explicitly source-linked.
- `/var/tmp/final-audit-types.log`, `/var/tmp/final-node-ownership.log`: typecheck and native Node parent/child/grandchild pass.
- `/var/tmp/final-pi-focused.log`: **80/80**, six files; all six Pi candidate hashes remain unchanged from independent component approval.
- Canonical client/audit copy and built/tracked JS/declarations are byte-identical. Build now maintains generated client outputs rather than leaving the old root declarations stale.
- `/var/tmp/final-audit-pack.json`: offline package dry-run lists 16 files, no test/legacy paths. No package publication.
- Exact tracked/untracked candidate and patch hashes: `/var/tmp/judgment-migration-candidate.json`.

Service task-by-task owner/evidence mapping, RED controls, warning attribution and limits: sibling service change `support-resumable-audit-reviews/acceptance.md`.

At this initial gate, implementation tasks **1.1–3.3, 4.1 and 4.2** were verified, while **4.3/4.4** awaited review/delivery. Both are now closed by the final approval section above.

| Closure item | Concrete evidence |
| --- | --- |
| Trusted-layer legacy notices, redaction-only keys, no auth fallback/rewrite | Config tests and `shared-contract` now use actual global/trusted project files and assert outside callbacks. Removing secret forwarding fails `/var/tmp/config-redaction-public-red.log`; restored full gates pass. |
| Source/coverage/role and remembered-primary changes | Actual entry suite now modifies these inputs, proves new sends then zero-send repeats, and proves a newly selected valid primary enters the next task-local question definition. `/var/tmp/entry-final-source-check.log`, then full wire gate. |
| Projection cannot silently shrink required questions | `/var/tmp/lifecycle-projection-red.log` catches omission and all-withheld rejection; required omissions must be explicit, withheld ids disjoint from dispatch, all-withheld causes no request/coverage. Descriptor mutation cannot forge evidence/bounds; throw/async failures stay isolated. |
| Independent task after local withholding | Real `reviewShared` → service → Pi test: #5 evidence has too many genuine candidates, #7 still receives the one complete-source-backed board-only correction. No #5 dispatch, no full-range receipt. |
| Abort vs legacy buffering | Real review commits first two stages, aborts third, switches branch, consumes late rejection, then restores/pays only third. Legacy judge's no-new-judgments-on-abort check is unchanged and green. |
| Unique owner attempts across reload | Frozen-clock two-service-instance RED, fixed with an instance nonce; start/end ids remain distinct. This complements, rather than replaces, audit diagnostic-id checks. |
| Full/fragment boundaries | Baseline audit full tokens were already in-memory only; actual same-load full retry and service same-token reload are separately tested. Public fragments are unscoped, not safely independent; R06 fail-closed safety and the independent locally withheld sibling case both remain green. See service acceptance for contract comparison, not a waiver. |

## Verification boundaries

- **Consumer port**: `test/index.test.ts`, `test/shared-contract.test.ts`, and `test/ownership.test.ts`. Replies/progress are explicitly scripted through `review()`. Every call is recorded. These fixtures have no answer cache, capacity policy, retry, or recovery engine. The small checkpoint-to-opinions table is scripted input for candidate-scope tests, not a judgment cache. Undeclared choices fail the fixture even if the extension catches the exception.
- **Actual wire**: `test/shared-service.integration.test.ts` activates audit, registers the actual local service, and dispatches through actual Pi native/LLM adapters with fake transport. `test/shared-service-boundary.integration.test.ts` tests the actual service/Pi boundary and `reviewShared`. `test/shared-service-llm.integration.test.ts` tests actual Pi HTTP/SSE observations. No live inference. These optional tests require explicit source roots; ordinary consumer tests do not.
- **Service**: `../pi-llm-as-jev/test/` tests the implementation that owns judgments, durability, capacity, and cache identity. A scripted consumer result is never evidence that these mechanisms work.
- Logical `review()` calls may repeat while provider sends remain zero. Neither call counts nor receipts establish source-fact coverage.

## Historical pre-recovery baseline (superseded)

Candidate manifest: `/var/tmp/fidelity-candidate-manifest.json` (43 changed/untracked files, unrelated `.serena/` excluded).

| Command / log | Result |
|---|---|
| Service `npm run check`, `/var/tmp/fidelity-service-check.log` | 293 pass; 56 lint warnings; build/typecheck pass |
| Audit `bun test`, `/var/tmp/fidelity-audit-check.log` | 300 pass, 20 optional integration skips, **16 failures** |
| Audit `npm run typecheck`, `/var/tmp/fidelity-audit-types.log` | pass |
| Explicit three-file source-linked integration gate, `/var/tmp/fidelity-wire-check.log` | 20 pass |
| Canonical `client/judgment-client.ts` vs audit copy | byte-identical |

Run audit tests as their own main process: remove an inherited `PI_JEV_TODO_AUDIT_OWNER_PID` from the test subprocess environment. Do not change production child-process suppression. The 20 skipped optional cases above were separately executed, not removed from acceptance.

## Consumer guarantees already restored

All references below identify existing test titles/prefixes, including each listed parameter variant. Provider-related portions remain subject to the explicitly named wire checks, not the consumer stub.

| Original cases | Guarantee / former blocker | Current verification and result |
|---|---|---|
| `I1: {fact,source,coverage,role}-only material change...` | Old host only mocked HTTP. Changed facts must alter the review; unchanged input remains identical. | Original port cases pass. Actual dual-backend entry test also checks same-id fact and task-requirement changes cause sends, subsequent repeats do not. Actual entry closure now expands source/coverage/role changes as well; each change pays new work and unchanged repetition sends nothing. |
| `I1: a no-op board read...` | A bookkeeping read must not create new facts or demand. | Port request/projection equality and duplicate-advice suppression pass; actual native/LLM no-op board read produces zero new sends. |
| `I1: a same-id reported fact...` | Update facts without rearming acknowledgment advice. | Original port assertions pass; raw source text is checked in `request.evidence`, not reconstructed into an old HTTP packet. |
| `I1: in-flight {fact,source,coverage,report,role,effective-history}...` | No stale advice **or business receipt** after input mutation. | Six port cases exposed a real receipt bug. `index.ts` now checks factual boundary before receipt append. RED `/var/tmp/audit-stale-receipt-red.log`; current cases pass. |
| `P1: {cold,full} ... {empty,support-only} sources`; `P1/F1: processed completion report...` | Public primary reports remain selectable and whole, including retained processed reports. | Port projection/source assertions and business receipt/advice assertions pass. Service storage/restore is tested separately. |
| `P2: {cold,full} known task-object scopes...` | Keep all tasks and genuine public sources; constrain only actual candidate scope. | Original port cases pass. |
| `P2/P3: {cold,full} 260 potential primary reports {with,without} legal brief...`; both `P3:` cases | No hidden source loss; local withholding does not advance coverage and does not block independent valid findings. | Original port assertions pass, including scoped notifications and repeat suppression. Actual service boundary checks independent final choices with unresolved scope; the final real #5/#7 task-shaped case proves withheld evidence cannot suppress the complete-source-backed sibling correction. |
| `I1/R1: changing the remembered primary...` | Opinions replace prior selections; actual candidate membership must update. | Port test exposed frozen review origin. Input identity now includes candidate definitions derived from latest advisory selections, not arbitrary opinion changes. Original assertions pass; final actual entry counterpart proves the next task-local criteria include the newly selected valid primary and then repeat for zero sends. |
| `F1: supplied current brief...`; three `F3:` cases; `F2: older ready brief...` | Qualified reported data, gaps, original roles, no erasure of user/summary/other task; newer user authority. | Original port assertions pass. Source bodies remain in the actual evidence argument; metadata projection is decoded directly. |
| cadence, manual bypass, actionable-now, incomplete terminal, blocked/coarse-task, recorded wait/ongoing, reworded stop, board-bookkeeping, new-user, queued-stop cases | Scheduling, bounded repeated advice, board-only vs execution authority. | Original port cases pass. Explicit pending-board fixture declares `board_warranted: idle`; no missing answer is auto-filled. |
| in-flight `{user,board,branch,shutdown}`; late response after branch switch | Cancel/stale delivery and no active-branch ledger contamination. | Original cases now require an actual pending review before cancellation. Late progress is also exercised. Pass. Service-owned cancellation remains covered by real wire tests. |
| effective global context, age/legacy budget, terminal/disabled/malformed-hook, opaque-secret, API failure | No cropping or tool-body leak; inert cases truly do not call review; errors isolated. | Original port cases pass. Secret test exposed missing redaction after removal of old HTTP boundary: request strings and output diagnostics now use legacy secrets locally for redaction only. |
| task trajectory; TODO revision segments | Preserve first-active origin, ordered revisions and bounded supplement; no automatic review on edits alone. | Original projection/scheduling assertions pass. Repeated projection is identical; actual paid repeat behavior is checked separately. |
| manual repeat/full/invalid arguments | Stable repeat inputs, full supplies a fresh token and whole projected history; invalid args do nothing. | Port assertions pass. same/new fresh token recovery and actual same-load manual-full failure/retry/completion/new-full lifecycle all pass at the real wire boundary. |
| main/child ownership variants | Main reaches review; inherited children do zero config/auth/HTTP/review work. | Original ownership cases pass at the service port; Node parent/child process check retained. |

## Approved expectation changes, not silent relaxations

| Old expectation | Approved owner/semantics and current evidence |
|---|---|
| Audit resolves Pi credentials and sends an Authorization header | Audit must not read Pi credentials or send HTTP. Port test asserts zero auth reads and HTTP. Actual native/LLM entry test verifies the real auth headers and removes a known Pi credential from the raw wire body. |
| Legacy audit key/endpoint fallback; no warning for custom endpoint | Legacy fields are ignored, with field-name-only notice even for a custom endpoint. New expectations check that values are not printed and no fallback is attempted. |
| No audit/Pi key means audit skips with an auth hint | Missing service yields a dependency error; otherwise the service owns auth failure. No consumer auth fallback. |
| Changing audit `apiUrl` invalidates cached work | Ignored audit fields must not affect service request identity. Port equality passes; real dual-backend reload changes ignored audit endpoint/model/key without replaying completed work. Actual service transport changes are separately verified by the ownership transport-isolation cases. |
| A missing required provider answer can emit an independent completion recommendation in a plain audit | Approved review contract is final-only on provider failure: empty final answers, no completion advice, no range receipt. Valid partial raw answers remain reusable. This differs from explicit local withholding, which may preserve independent accepted findings. The old F4 characterization must change only this unsafe advice expectation; exact partial reuse and source/receipt assertions remain required. |

## Original failure ledger and transferred evidence

Current candidate checks (after fragment safety and corpus migration):

- `/var/tmp/owner-closeout-audit.log`: **312 pass, 39 optional skips, 0 fail**. Labelled legacy-engine comparisons are included in this number but do **not** prove the new owner.
- `/var/tmp/owner-closeout-wire.log`: **39 pass, 1577 assertions**, all four opt-in files against actual development service and patched Pi.
- `/var/tmp/owner-closeout-types.log`: audit typecheck passes.
- `/var/tmp/owner-closeout-corpus-cli.log`: candidate CLI uses the real service/Pi path. Ordinary case sends are `3, 2, 1, 3, 2`, with no overflow or tool-body leakage. The difficult case correctly remains incomplete: 15 sends, 10 overflows, one injected non-context failure. All text markers appear in attempted packets; that is **not** completed factual coverage.
- `/var/tmp/owner-closeout-baseline-cli.log`: historical `HEAD` core/corpus comparison passes. Its mock HTTP and older byte measurement are not candidate evidence or a like-for-like savings claim.
- `/var/tmp/capacity-service-check.log`: service check passed after capacity diagnostics were added, with 56 warnings. Later consumer changes still need the final exact-candidate service gate.

Five obsolete host tests in capacity/presplit/rolling were retired after equivalent wire assertions passed. The old corpus HTTP runner was removed: `test/corpus.ts` now holds workload data, ordinary tests check projection, and `shared-service-corpus.integration.test.ts` owns requests/bytes/recovery. Only the CLI's explicit `--baseline` path reads the historical runner from Git. Production legacy-engine removal and comparison-test ownership closure were subsequently completed, as recorded below.

| ID | Original case / file | Guarantee and former blocker | Target verification | Status |
|---|---|---|---|---|
| R01 | index `F2: an irreducible necessary floor...` | Bounded clarification, retain facts, stop at first irreducible leaf without sibling traversal, no receipt/advice/wakeup. | Consumer port delegates all six records and retains required fixed facts; real boundary `R01` verifies only first-leaf descent and zero exact rejected-wire replay after reload. | pass, `/var/tmp/recovery-index.log`, `/var/tmp/compaction-real-green.log` |
| R02 | index `F4: reload after compaction...` | Restore frontier without reconstructing hidden origins; preserve qualified brief and id-less user authority; reuse only valid members and never forge a cursor. | Real boundary `R02` caught positional-frontier bug (RED `/var/tmp/compaction-real-red.log`). Adapter now uses active raw-branch membership, truncated to original review frontier. It only advances its local business cursor after successful receipt append. Both boundary and port verify no hidden origin, new summary/id-less facts, missing-only retry and no fabricated receipt. | pass, same GREEN logs |
| R03 | index `F4: a partial-answer failure persists completed pairs...` | Reuse valid members, only missing granularity resent after reload, no premature receipt; new contract forbids early final advice. | `classifier/missing` actual entry trace verifies only `task_granularity_5` is sent on reload and earlier stages are not replayed. Consumer port verifies no early advice/receipt, then genuine-user-backed reconciliation after complete final view. | pass, same GREEN logs |
| R04 | capacity `known-rejected envelopes are persisted...` | Do not buy an exact rejected envelope after reload. | Boundary `R01`: one durable rejection per actual rejected send, first-leaf termination and zero sends after refresh. | pass; old host test retired |
| R05 | capacity `host: a recovered overflow is reported...` | Final recovered success, not initial 400, correct notification. | Entry `classifier/none/ordinary`: actual 400 → successful recovery → recovered diagnostic/notice, not a failed notice. | pass; old host test retired |
| R06 | capacity `host: an interrupted full review...` | Reuse only work from the same full token; next full is new work. | Entry `classifier/http/full`; boundary `R06` verifies missing-only fragment retry, contiguous genuine bounds, last-fragment cursor. RED `/var/tmp/fragment-recovery-red.log` found premature whole-source retention. Additional `R06 safety` cases caught unsafe advice when the final tail lacked early constraints (RED `/var/tmp/fragment-advice-red.log`); partial views now declare omissions and cannot authorize corrections. Complete-source controls keep the constraint. | pass; old host test retired |
| R07 | ledger `answers persist as non-context custom entries...` | No transcript/secret persistence; usage gaps explicit; reload/repeat not double billed. Old assertion expects audit-owned `eval`. | Ledger port checks business formatting; all real entry traces check privacy, actual attempts, known/missing usage and zero new usage on reuse. No new audit `eval` entries. | pass |
| R08 | ledger `compaction restores stored results...` | Valid branch records survive lifecycle refresh. | Ledger port checks stable input/range; entry `classifier/none/ordinary` refreshes with zero sends. R02 separately covers changed context/gaps. | pass |
| R09 | ledger `abandoned-branch records...` | No cross-branch reuse. | Port rejects borrowed business seed/range; entry `classifier/none/ordinary` changes to identical public facts without old ledgers and requires new actual sends. | pass |
| R10 | ledger `a failed write is not reported as durable...` | Failed append cannot establish durable coverage, review remains isolated. | Ledger port and real boundary `R10`: failed append has an actual observed send but no durable callback; reload sends again, successful persistence/reload then sends nothing. RED `/var/tmp/business-ledger-red.log` caught the missing consumer `durable` guard. | pass |
| R11 | ledger `a main-agent rebuttal is new input...` | Advice alone is not new work; substantive reply is new evidence and preserves advice as advisory data. | Port preserves both source texts; entry `classifier/none/ordinary` proves advice-only zero sends, new reply causes actual sends, repeat costs none. | pass |
| R12 | ledger `recovered overflow diagnostics separate...` | Starts/ends, rejected vs successful outcomes, partial usage sums/missing counts. | Port preserves exact fields; all entry variants compare business diagnostics to physical sends and service totals. Native `none` includes successful responses with missing output usage. | pass |
| R13 | ledger `audit diagnostic ids stay unique...` | Per-load identity remains distinct even with frozen wall clock. | Original frozen-clock uniqueness assertion retained with actual audit append/reload and explicitly scripted public replies. | pass |
| R14 | corpus `representative workloads...` | All six captured workloads retain texts, exclude tool bodies, admit ordinary cases and account actual sends/bytes/partial recovery. | Six `R14 real corpus` cases use actual audit activation, service core and patched Pi; registration is independently covered by entry tests. Raw strings/results are in `/var/tmp/audit-corpus-*/wire.json`. Only omitted native members are retried; oversized necessary facts remain incomplete. | pass; old HTTP runner removed |
| R15 | presplit `host: a recorded rejection is restored...` | Learned transport-local capacity and exact rejection survive reload; avoid rebuying initial 400. | Boundary `R15`: real rejection, exact-rejection reuse after refresh, then changed full identity uses restored size prediction. Positive persisted density, returned channel, `presplits` and `rejectedReuses` are separate from actual attempts; audit copies service diagnostics. | pass; old host test retired |
| R16 | rolling `host: later audits send only new records...` | New ordered evidence plus necessary retained facts; failed stage delivers nothing; durable frontier resumes. | Both boundary `R16` variants preserve facts, exclude processed tool macros/bodies and send only missing work. Single-stage failure creates no receipt; successful retry adds one. Entry tests separately verify no intermediate advice. | pass; old host test retired |

## Remaining engine assertion ownership

The old engine comparisons are kept under test-only ownership, not used as evidence that the service behaves correctly. Production projection helpers and public-port tests remain current. Historical retry API details are not migration requirements: D4 transfers native retries to Pi and disables LLM SDK retries; a consumer `maxRetries` knob, exact backoff delays and old fetch-listener counts are superseded, not reimplemented.

| Historical assertions | Preserved responsibility / evidence | Exit decision |
|---|---|---|
| `cache.test.ts`: candidate bounds and independent withheld siblings | Business builder/withholding: existing index P1/P3 cases; real boundary `explicit local withholding` keeps independent answers and advances no receipt. Structural limits cause no provider call. | Keep business checks; old evaluate/evaluateBatched/direct variants compare the historical engine only. |
| `cache.test.ts`: all categories, A/B+C, threshold reuse, different ids, context/definition/endpoint identity | Real ownership cases `new C`, `legal own keys`, changed facts/metadata/order; real entry repeats, changed same-ID facts and board requirements; boundary missing-member and join tests. New-C RED `/var/tmp/ownership-transfer-first.log` exposed an overbroad question-set key and was repaired. | Service cache replaces the old evaluation maps. |
| `cache.test.ts`: fresh bypass, same-token retry, new token; valid partials survive but changed facts cannot borrow them | Boundary `same fresh token`, native missing member, entry `classifier/missing` and `classifier/http/full`; all failed finals empty. Old successful partial-final behavior is explicitly superseded. | Service owns raw/fresh/pending entries. |
| `presplit.test.ts`: distinct dimensions, latest density, dominated/contradicted hints, reload/channel isolation | Service `capacity.test.ts` pure estimator; ownership real `direct/router/custom/override`, lower-density reload and transport isolation; boundary R15; accounting exact-rejection-after-contradiction case. | No production audit estimator remains. Historical live numeric samples are comparison data, not new live acceptance. |
| `presplit.test.ts`: prediction is not a request; fixed floor admits; irreducible still sent | Real ownership limits/batching and boundary 1/6/69 admissions, R01 first-leaf rejection. The old low-level direct-client requirement to dispatch one question at a time is superseded by admitting the whole useful batch. | Service owns admission, not audit's evaluate variants. |
| `amplification.test.ts`: 1/6/69 × 12, missing/reported usage; no Cartesian traversal, no known-rejected superset, frozen question retry | Boundary 1/6/69, R01 and R06; ownership independent batch recovery; accounting rejected-single superset RED `/var/tmp/ownership-close-first.log`, GREEN `/var/tmp/ownership-accounting-green.log`. Native missing-usage totals remain explicit. | Service owns traversal. Different request serialization does not imply equal legacy byte totals. |
| `capacity.test.ts`: necessary XML/CSV facts, covered reports, long/user fragments, tiny primary candidates, frozen questions, later failure/recovery | Current business index F1/F2/P1 cases and unchanged source-projection assertions; actual R01/R02/R06/R16 and corpus retain facts/bounds and avoid completed dispatches. Missing early facts now withhold fragmented final advice (R06 safety), rather than mistaking traversal for final factual completeness. | Keep source/rubric helpers; remove old reviewRolling from production. |
| `rolling.test.ts`: current user authority, primary eligibility, reports versus opinions, unchanged/failed receipts, gaps, no repeated summaries, unfinished-only retry | Current index/ledger business tests and actual R02/R10/R16; actual entry missing/reload/changed-facts/full tests. A receipt is not a factual summary or new service-cache identity. | Preserve business receipt reader/projection; remove old split/retry loop. |
| `usage.test.ts`, `openrouter.test.ts`: malformed members retain model/usage; unknown vs zero; reported USD; typed overflow vs other errors | Accounting real native cases (17, negative, nonnumeric, absent), OpenRouter typed overflow and lower-bound charges; ownership HTTP error matrix; actual LLM SSE cases. | Native parsing/transport: Pi. Presence totals and catalog separation: service. |
| `limits.test.ts`: legal keys and validation versus rubric | Real ownership own-key/metadata case; Pi observation validation regressions; current builder/rubric tests stay on production functions. | Retain business rubric; legacy response parser becomes test-only. |
| `typesafe.test.ts`: request construction and lifecycle grouping | Existing business tests keep importing the current builder; response syntax/validation is Pi/service ownership, including real malformed/partial checks. | No production runAudit/runOnce remains. |
| `typesafe.test.ts`: HTTP/network errors, retries, malformed response, abort, retry budget/listeners | Real native 429/500 attempts are bounded by Pi (three observed identical wire sends), failures never subdivide; boundary deadline/join/late-result checks and Pi observation regressions. LLM retries explicitly disabled. | Retain these exact legacy API assertions as historical comparisons, not a second production retry policy. |
| `config.test.ts`: credential fallback/endpoint mapping | Approved breaking config requirement: no fallback. Current shared-contract asserts zero consumer auth/HTTP; actual entry traces verify Pi credentials and ignored legacy fields. Blank/file/project loading assertions remain. | Removed resolveApiKey/resolveAuditKey and nine superseded fallback-specific tests. |

Production ownership exit is now implemented: `typesafe.ts` contains business questions/grouping only; `rolling.ts` retains source helpers and receipt types; `capacity.ts` is a compatibility type only. `restoreLedger` validates old receipts with a local set of historical answer ids, never a live judgment/rejection cache. Old algorithms reside only in `test/legacy/`, with their historical assertions retained and labels explicit. Business builders/helpers in those comparisons still import the production implementations.

Verification after isolation:

- `/var/tmp/retirement-audit.log`: **303 pass, 59 optional skips, 0 fail** (includes historical comparisons; nine superseded credential-fallback tests removed).
- `/var/tmp/retirement-wire.log`: **59 pass, 0 fail**, six actual-service/Pi integration files, 1768 assertions on that run. The later explicit native catalog-absence assertions passed in `/var/tmp/retirement-accounting-closed.log` (6 tests / 57 assertions).
- `/var/tmp/retirement-types-closed.log`: audit types pass.
- `/var/tmp/retirement-service-final.log`: full service check **296 pass**, 56 lint warnings. The original 15-envelope predictor sample is now also checked at its current service owner, before/after learning, without a new live call.
- `/var/tmp/retirement-runtime-closure.json`: production import closure has no legacy test import, evaluator, HTTP fetch or auth fallback; canonical client matches the service copy.
- `/var/tmp/retirement-pack.json`: offline `npm pack --dry-run --ignore-scripts` contains 16 production/package files and no test/legacy files. No archive/package publication was performed.
- `/var/tmp/retirement-baseline.log`: historical CLI still works by loading the committed core, including its old config/ledger, without checkout or candidate mutation.

This historical step closed obsolete production ownership. Later configuration/source/lifecycle, documentation and independent offline approval are recorded above.

Keep all three linked changes unarchived. No installed-host rollout, new live inference, publication or commit/push occurred. Offline implementation evidence is not final independent approval.
