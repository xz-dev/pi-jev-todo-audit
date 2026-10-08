> **SUPERSEDED (2026-10-08)** by `incremental-todo-state-judgment`. Unchecked tasks below are abandoned, not pending. Checked items and the evidence section stay as history.

## 1. Freeze the corrected ownership contract

- [ ] 1.1 Reconcile the [companion service change](../../../../pi-llm-as-jev/openspec/changes/manage-review-context-and-runtime/design.md) with consumer-owned stage semantics/session cache and service-owned execution identity/timeout; verify no required service business-memory API or ignored audit timeout remains in the joint contract.
- [ ] 1.2 Define the first finite-question cache/reload fixture and the same-question XML/CSV, withdrawal and irreducible controls; verify each has a real public observation and none substitutes labels for facts or requires generated summaries (J04, J06, J07).
- [ ] 1.3 Record focused pre-change source/test evidence for old checkpoint coupling and timeout forwarding; verify exact commands, revisions and offline transport boundaries are reproducible without installed-package changes (J01, J02).

## 2. Model cache and delivery invariants

- [ ] 2.1 Create/check an authoritative Lean model of exact cache membership, branch ownership, persistence acknowledgement, bookkeeping exclusion and guarded progress; verify the theorem scope does not claim arbitrary-text sufficiency or implementation equivalence.
- [ ] 2.2 Complete the two-pass annotation/check/run/axiom process and neutral fresh-context semantic round trip for affected models; verify exact file hashes and accepted assumptions, leaving this gate open if the independent reader is unavailable.

## 3. Persist and reuse finite judgment results

- [ ] 3.1 Synchronize the canonical consumer-cache/execution client after the service slice is available; verify legacy clients remain callable, new required capabilities are discovered honestly and keys come from the admitted actual execution identity (J10, J12).
- [ ] 3.2 Add versioned raw evaluation records and a guarded session-cache lookup/store port to `ledger.ts`; verify JSONL replay, independent cache lifetime, malformed/legacy record rejection, copy isolation, failed append and stale branch behavior without a service checkpoint (J04, J08).
- [x] 3.3 Connect the business cache to `shared-review.ts` and captured session guards in `index.ts`; verify a fresh service instance with no old service ledger reuses the same finite judgment with zero actual provider attempts (J04).
- [ ] 3.4 Verify the real service-computed identity against model/transport/thinking, full question meaning and required-fact mutations; prove misses for changed judgments and preserve native acceptance-policy rechecks without pretending a configured model name is sufficient (J01, J05, J11).

## 4. Supply business-directed stages and preserve facts

- [ ] 4.1 Define audit's explicit stage purposes, factual/source obligations and safe accumulation rules using actual task/event data; verify XML/CSV, whole acceptance scope, first-active trajectory and user constraints remain distinguishable without a summary generator (J06, J07).
- [ ] 4.2 Bind the canonical finite business-stage callback to the shared execution engine; verify stable completed prefixes, eligible partial tails, strict progress on overflow and one native whole-call budget across internal stages (J04, J11).
- [ ] 4.3 Replace required service-checkpoint coupling with consumer-owned progress referencing acknowledged evaluations and source coverage; verify old history stays readable, invalid identities rebuild at most once and repeated rejected service seeds are not resubmitted (J01, J05, J08).
- [x] 4.4 Keep explicit full-review identity/resumption in the consumer session; verify unfinished full retries reuse compatible durable work and a new full intent after completion starts a distinct reassessment (J09).

## 5. Preserve historical evidence, cancellation and advice safety

- [ ] 5.1 Enforce the actual-event projection and separate judgment rules/identity from evidence; verify AGENTS/system prompts/tool definitions and cache/diagnostic records do not alter business freshness, while real user/assistant/tool events and permitted labelled summaries retain provenance (J06, J07).
- [ ] 5.2 Keep passing `timeoutMs` and `AbortSignal` with no consumer mode selection or extra LLM-total timer; verify long active LLM work, real idle expiry, native total deadline, currentness cancellation and latest relevant pending-trigger behavior (J02, J03, J11).
- [ ] 5.3 Keep business finality distinct from engine-stage finality and durability; verify incomplete/failed/stale scopes cannot deliver advice, valid non-durable results do not claim resumability and cached opinions never grant execution authority (J05, J07, J08).
- [ ] 5.4 Preserve delivered correction keys and consume structured attempts/usage/incidents; verify no duplicate old advice or unchanged failure notice and no conversion of missing usage/HTTP 200 into free work or successful acceptance (J14).

## 6. Preserve independent service delivery

- [ ] 6.1 Align runtime discovery and `judgment-service.ts` status/provisioning with the canonical callback/cache requirements; verify load order, late availability, filters, ownership/provenance and suppressed children without paid probes or duplicate activation (J10).
- [ ] 6.2 Preserve independent native updates and legacy service consumers; verify missing capability produces an explicit limitation without downgrade, pinning, direct HTTP or silent return to checkpoint-coupled behavior (J10).
- [ ] 6.3 Update README and command/configuration guidance with business-owned JSONL cache, finite stage contracts, actual-event evidence and backend-specific timeout interpretation; verify examples against handlers and source.

## 7. Verify the combined behavior

- [ ] 7.1 Run J01-J14 through both actual candidate sources, including one real-clock active stream exceeding 30 seconds; verify J13 links old-session recovery, finite business stages, healthy long streaming and independent consumer-cache reload rather than separate mocked successes.
- [ ] 7.2 Measure eligible declared accumulation and conservative/irreducible controls across the whole outbound packet; verify exact-repeat hits and append savings are reported separately, no factual obligation is silently removed and no unsupported generic compression claim survives (J06, J07).
- [ ] 7.3 Run `bun run typecheck`, `bun test`, companion `npm run check` and applicable existing integration/delivery gates; verify exact revisions/commands and distinguish offline bytes from live provider tokens or charges.
- [ ] 7.4 Reconcile final code with all delta specs and the shared acceptance matrix, rerun affected Lean checks and obtain independent source/evidence review; verify partial slices and unresolved gates remain visibly incomplete.
- [ ] 7.5 Present the joint evidence and service-first migration/rollback for human acceptance; verify no unrequested commit, publishing, installed-package update, paid inference or archive operation occurred.

## Current repair evidence — not joint acceptance

- Original audit findings F1–F4 were closed by the original reviewer against `/var/tmp/jev-postfix-candidate-wm4Uju/`. Service's three findings were independently closed in the same focused re-review (`9b82c27d-dce4-462a-96d0-c4f05e25aed3`). This is step review, not full-change approval.
- New R1: failed full-baseline acknowledgement on a cache-only retry was misreported as `unchanged`. Regression fails at `/var/tmp/jev-r1-red-khSq8n/test.log`; failure/incompleteness now precede reuse in diagnostics. `/var/tmp/jev-r1-green-2omo8z/`: boundary 36 pass/1 skip/0 fail, typecheck pass. Independent R1 re-review remains pending.
- `/var/tmp/jev-r1-close-92IUfM/`: default 374 pass/101 skip/0 fail; exact annotated audit model check/run pass, foundations `propext`, `Quot.sound`, SHA-256 `659ce46add77424cabd3014459fb934f00608795c08868c22e291b69ae1d317d`. Neutral semantic reading remains pending.
- Macro append: 124703 → 90921 whole outbound bytes with nine hits. Free-text control: eight ~6.8KB originals, append 71143 bytes/one request/zero hits; exact repeat nine hits/zero requests. Under a controlled **32000-byte transport state ceiling** (not a production 32k-token limit), append sends 57067 bytes across two requests then fails incomplete, without a final judgment. Source: `/var/tmp/jev-r1-green-2omo8z/boundary.log`.
- Required free-text append efficiency/operating scale remains **OPEN**. Conservative refusal is safety evidence, not fulfillment of the long-session incremental-cost goal. No user acceptance or scope reduction has been recorded.
- Actual-session identity repair: known private/session metadata no longer creates omissions; cache-path tool gaps are reconstructed from each actual range, not copied from the current global tail. Cross-range tests prove an earlier stage cannot borrow a future result, a pending tail does not change the earlier range, and the final range observes its real missing/resolved result. Projection revision is now `audit-source-projection/3`. Red: `/var/tmp/jev-omissions-red-JueWPZ/test.log` (3 failures). Green: `/var/tmp/jev-omissions-close-eXDsQ6/` (consumer boundary 29 pass/1 skip; default 374 pass/104 skip; typecheck and existing scoped model check/run pass). This is not independent re-review or current long-J13 evidence.
- User-selected actual-session replay: active-path cutoff `401be9ca`, path SHA-256 `ede7cd765b7672fd391c170212a4602a1ea7e4780e3de5b7cf0cf95f9f16cf6d`; prefixes `370fbf7b`, `90429fca`, `401be9ca`. Actual Pi compaction-aware context and actual replayed TODO snapshots, isolated journal, trapped network, controlled conservative labels and wide fixture capacity. No original transcript/request bodies exported. `/var/tmp/jev-real-session-probe-nDsKbB/`: `identity-differences.log` is the broken-stage baseline; `fixed-staged.json`, `fixed-direct.json`, `comparison-source-hashes.json` bind the comparison. Final decoded fact, question and omission hashes match between repaired staged/direct paths at each prefix.

| First processing plus two actual appends | Requests | Judgments sent | Whole outbound bytes |
| --- | ---: | ---: | ---: |
| Broken staged baseline | 15 | 600 | 3,181,412 |
| Repaired staged path | 7 | 280 | 1,653,963 |
| Same facts/questions, no preplanned stages | 3 | 120 | 1,046,267 |

The repaired staged path costs **58.08% more cumulative bytes** than direct review over these prefixes, despite 160 cached intermediate judgments on each append. Warm per-append judgment counts remain 40 on both paths. All current final scopes still reconsider the necessary historical facts; intermediate judgments do not replace a discharged final obligation. Exact repeats send zero packets (staged: 200 hits; direct: 40). This disproves net incremental benefit on the selected sequence; it does not justify accepting conservative full resends or removing necessary originals. The next slice must define a truly reusable finite business obligation and its invalidation controls, rather than merely adding stages. No production capacity, live-model accuracy, token billing or human acceptance is established.
