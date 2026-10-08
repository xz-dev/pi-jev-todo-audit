# Candidate verification and remaining acceptance gates

Status: **partial implementation acceptance; not released or installed**. The changes are not declared complete merely because the current tests or OpenSpec validation pass.

## Source identity

- Audit final candidate recorded in `candidate.json`: `f29159b475acbcf2e53de4c7ff2cba63d8307459ed6a20de1551adf7e4f34409`. Earlier verified candidates (`1225a19b…`, `073700a6…`, `2678ef25…`, `eeea245c…`) are preserved in `candidate-before-*.json` files.
- Service candidate: `c13180a43ca0b765f28f2a59b8c2867fb254bb85d1bed4ae8fbca995a3711055` (`pi-llm-as-jev`, same change-local filename); the service `npm run check` on it recorded 357 pass, 1 skip, 0 fail.
- Both manifests identify uncommitted source, tests, configuration and relevant installed Pi adapter files. No commit, push, installed-copy activation, deployment, global dependency/configuration change or paid inference was performed.
- **Follow-up revalidated:** the four-file authority/source-reload repair, its regression tests and the previously identified provisioning seam are included in the final audit candidate. Every recorded file hash matched after the final gates. Service and annotated Lean hashes remain unchanged, so their existing checks remain valid.

## Completed gate batch

| Check | Recorded result | Artifact |
| --- | --- | --- |
| Audit `npm run typecheck` | exit 0 | `final-typecheck.log` |
| Audit `bun test` | 240 pass, 52 skip, 0 fail | `final-default.log` |
| Actual sibling service + installed Pi native adapter | 7 pass, 0 fail | `final-cross-repo.log` |
| Service `npm run check` | 357 pass, 1 skip, 0 fail; lint/typecheck/build included | service change `evidence/service-check.log` |
| Client copy | byte-identical to canonical service client | manifests and gate verification |
| Annotated Lean check and run | exit 0 for both | `lean-check.log`, `lean-run.log` |
| OpenSpec strict validation | both changes valid; structure only | `audit-spec.log`, service `service-spec.log` |
| Package dry-run, offline, scripts disabled | 22 files; required runtime/docs present; tests excluded | `final-pack.log` |

Final audit commands, exit codes and candidate identity are in `final-gates.json`; `gate-results.json` and the earlier logs retain the previous successful batch (223 pass, 52 skip). Default-suite skips did not run. The default suite is smaller than the pre-retirement suite and is **not** proof that every displaced assertion has been replaced.

The frozen batch found a genuine source-pool regression: all supplied anchor-pool records were being serialized rather than only referenced originals. The corrected implementation filters by actual state references and serializes each original once. The failed run and prior manifest are preserved as `audit-default-before-anchor-fix.log` and `candidate-before-anchor-fix.json`.

A subsequent source-role check separated an actionability/deferral report from permission: a report may establish task state, but execution still needs independent authorization. It must not be confused with user-only cancellation or scope changes. The final authority tests establish that a tool/current-work anchor cannot replace an absent user authorization anchor. A stored user wait cannot be cleared by an assistant's work report. Cold entrypoint tests admit still-valid original authorization but reject a summary claiming authorization when that original is missing.

`follow-up-red.log` records four failures before the known provisioning and stored-wait guards were repaired. The final suite passes those assertions. Readiness and installed-service admission now require `version: 1` plus `judge()`, without requiring optional capacity disclosure or retired review APIs. Existing installation scope, disabled-resource, ownership and no-downgrade tests still pass.

## Business acceptance chain

`test/partial-progress.test.ts` uses the same A-done/B-open report with:

- ordinary prose;
- an explicit list;
- changed line wrapping only;
- a no-deployment constraint.

The task definition remains intact. No line parser creates an acceptance checklist or adds completion prerequisites. Partial progress is represented by source-bound original reports, not a `segment` label or model-written summary. Cold JSONL reload preserves the concrete A/B report. Only new B history is sent as new history; whole completion remains reported, not independently verified. Uncertainty and permission withdrawal are separate outcomes.

`test/incremental-lifecycle.integration.test.ts` runs the real extension entrypoint, actual sibling service and installed Pi native adapter with local scripted HTTP. It accumulates three progress reports and a user authorization source, serializes JSONL, creates a new extension/service instance, invokes Pi compaction, then adds B completion and permission withdrawal. Old loops do not reappear as new history, and the result is a completion-reconciliation advisory, not CONTINUE.

Selected measured request components from that nonempty-memory sequence:

| Phase | State bytes | Reloaded original bytes | New-history bytes | Reloaded sources |
| --- | ---: | ---: | ---: | ---: |
| First progress | 326 | 2 (`[]`) | 590 | 0 |
| Second progress | 453 | 215 | 118 | 2 |
| Third progress | 494 | 332 | 116 | 3 |
| Post-compaction completion + withdrawal | 534 | 447 | 562 | 4 |
| Dependent drift-only call | 223 | 215 | 562 | 2 |

These are UTF-8 component sizes before service/HTTP wrapping, not tokens. Full wire sizes and call records are in `cross-repo-metrics.json`. Distinct necessary reports still accumulate; this is not a constant-size state claim. The test catches duplicate serialization but does not prove every retained report is semantically necessary on every workload.

## Fixed real-session suffix replay

Command (no live transport):

```sh
PI_JUDGMENT_SOURCE=/path/to/pi-llm-as-jev \
  bun test/replay-incremental.ts SESSION.jsonl 370fbf7b 90429fca
```

Fixture: `2026-10-07T05-55-40-571Z_01a114ee-8d9a-703f-bef4-752ac39a2d7e.jsonl`; active-branch prefixes contain 1,547 and 1,555 entries, projected to 35 and 37 loop units, with 9 unfinished tasks each. Exact effective-input hashes are in `final-replay.log`.

| Run | Actual offline HTTP requests | Serialized wire bytes | Question evaluations | Distinct new-history records |
| --- | ---: | ---: | ---: | ---: |
| First prefix | 15 | 783,784 | 576 | 193 |
| Second prefix after cold state restore | 1 | 51,421 | 48 | 19 |
| Second prefix from empty state | 16 | 835,205 | 624 | 212 |

All three runs completed their scripted scopes. The continuation has **zero** old-history record overlap. Relative to cold reprocessing of the second prefix, its transmitted bytes are 93.8% lower for this fixture/candidate. (The new `appropriate_now` option text slightly raised per-request size versus the previous candidate; the cold baseline also packed one more request.)

The replies are scripted no-change decisions. This run establishes transport/cursor reuse, not useful model judgments, factual truth, real tokenizer usage or billing savings. Tokens and provider cost are **unknown**. The separate nonempty-memory chain above addresses state/source continuity; neither test substitutes for live-model semantic review.

## Retired behavior map

The pre-retirement run had 319 pass, 109 skip and **93 failures**: index 69, ledger 8, ownership 3, shared-contract 13. Names/counts and the original log are preserved in `pre-retirement-failures.json` and `pre-retirement-full.log`. Moving tests did not resolve their failures.

| Still-relevant behavior or old protocol | Current owner/evidence | Disposition |
| --- | --- | --- |
| Process ownership, inherited child suppression, reload ownership | active `test/ownership.test.ts`, provisioning entry tests | Active; former review stub changed to judge without dropping ownership assertions |
| Disabled mode, clear manual dependency failure, no direct HTTP/auth fallback | `test/index.test.ts`, `test/judgment-service-entry.test.ts` | Active port/lifecycle coverage; installed-host opt-in cases still skipped |
| Cadence, cooldown, terminal board-only advice, suppression/cold reload | `test/index.test.ts`, `test/counter.test.ts`, `test/verdict.test.ts` | Active representative regressions; not every former pending-stop interleaving has been ported |
| Currentness, branch changes, same-id input mutation, uncooperative abort, no late writes | `test/index.test.ts`, `test/incremental-safety.test.ts` | Active |
| Tool payload exclusion, redaction, role/advice provenance | active `test/context.test.ts`, source serialization test in `test/questions.test.ts` | Active core projection; not full former brief/coverage corpus equivalence |
| Whole-loop capacity, actual-overflow recovery, missing-limit warning | `test/loops.test.ts`, `test/incremental.test.ts`, service capacity tests | Replaces fixed-byte stage/fragment ownership |
| JSONL state, branch-valid fallback, missing provenance, full invalidation before failure | `test/state.test.ts`, `test/incremental-safety.test.ts`, actual lifecycle integration | Replaces cache receipts; old entry types are ignored without deleting history |
| Concrete partial progress, uncertainty, reported completion, independent conclusion anchors | `test/questions.test.ts`, `test/partial-progress.test.ts`, `test/state-verdict.test.ts` | Active candidate behavior; script replies are not model-accuracy evidence |
| `reviewVersion`/consumer cache/checkpoint/stage callbacks, exact-repeat cache receipts | service legacy APIs remain callable; archived consumer tests in `test/legacy/retired-protocol/` | Consumer protocol deliberately retired, not counted as passing current tests |
| Historical audit transport/backoff engine comparisons | archived source/tests; old timing failure records retained | Not active runtime; no claim that historical backoff/J11 failures were repaired |
| A1/A6 renderer folding, quote handling, resize/theme/expansion permutations | old assertions retained as text; current send-body tests cover only part | **Not fully migrated** |
| I1/F/P brief lineage, non-exclusive source eligibility, large-option withholding, cold/full necessary-source cases | context/unit checks plus retained old assertions | **Not fully migrated or proven equivalent** |
| Old shared corpus, full LLM wire/accounting/installed delivery/Windows coverage | default opt-in suites skipped; native incremental port exercised separately | **Not established for this candidate** |

Known archive collision: a production rolling file overwrote the same-named historical engine file during retirement. The 9,280-byte original historical engine was recovered, verified byte-identical to `HEAD:test/legacy/rolling.ts`, and saved as `test/legacy/retired-protocol/engine/legacy-rolling.ts.txt`; the production 2,678-byte copy remains separate. This verifies that recovery, not the completeness of every historical artifact.

## Explicit remaining implementation/acceptance gates

1. **Task 2.2 — resolved:** one `resetTask(task, from)` contract now serves the evidenced `scope_changed` transition, full mode and the contract-hash change: first-active when known, otherwise the current segment (evidenced change) or the earliest known loop (contract change). Table-driven unit tests cover the four reset shapes, withdrawal keeping cursors and per-scope branch reconciliation; runner tests cover model-identity change (cursors kept, only post-cursor loops judged, state restamped by the judging model) and contract change with/without first-active. Design D3 wording updated to the implemented rule.
2. **Task 3.1 — resolved as a fail-closed boundary:** packing measures the largest option set per candidate segment and never exceeds 255 (`MAX_CHOICES`), with and without token metadata. One complete loop that alone exceeds it is reported `oversize` with an explicit error, no service call is made, and cursors stay parked before it; earlier normal loops in the same run are still judged (unit and runner tests). Limitation stated honestly: the audit does not withhold sources inside such a loop to keep judging it, so that loop blocks later loops for the affected scopes until the user runs full mode or the history moves on. Board alternatives (`switched_to_<id>` options) are bounded by visible tasks and are not separately capped.
3. **Task 6.1 — closed as a recorded limitation (user decision):** removed runtime paths are absent and cold reload works. The retired-behavior map above stays the honest inventory: rows marked "not fully migrated" are not covered by active tests. Opt-in files that still target the former review consumer are not current passing acceptance. Further migration is driven by concrete feedback.
4. **Task 5.3 — resolved by the user:** the audit no longer sends a default; the service applies native 60 s absolute / LLM Pi `httpIdleTimeoutMs` (Pi default 300 s, read via `getSettings()`, `0` = disabled). A configured audit `timeoutMs` reaches the service unchanged (index test). Note: Pi's streaming idle default is 300 s, not the 30 s the user recalled.
5. **Task 7.2 — closed by user decision:** the user selected the separate `appropriate_now` initial granularity finding and chose to release for real use and iterate on feedback rather than review every template now. `question-wording.md` records exactly what shipped. [Exact current templates, dynamic-option examples and shared rubric](question-wording.md) are extracted from the frozen source for review. No installed activation was performed.
6. **Task 4.2 — closed with amended wording:** one call per segment plus one drift-only call when that segment changes the authorized scope. The second call is measured above and documented; the user accepted the plain-language explanation and chose to release.

The former task-5.1 provisioning seam is now repaired and verified. No active production consumer (excluding the shared canonical client declarations) references the retired review/cache/stages fields.

These are open items, not silently accepted exceptions. Structural spec validation does not close them.

## Lean scope

`docs/programming-thinking/audit-session-cache.idea.lean` models current/durable/complete-loop commit guards, per-scope isolation, uncertainty, concrete source references, suffix exclusion and separation of completion from permission. The accepted foundations printed by Lean are `propext` and `Quot.sound`. There are no placeholders or unchecked escapes.

The proof does not establish classifier correctness, actual disk fsync, tokenizer accuracy or equivalence with the TypeScript program. No independent semantic-reader subagent was launched; there is no independent semantic-round-trip claim. The prior model is retained in `pre-incremental-model.lean.txt`.
