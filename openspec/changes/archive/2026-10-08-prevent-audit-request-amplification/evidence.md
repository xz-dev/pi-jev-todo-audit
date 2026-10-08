# Implementation evidence: prevent-audit-request-amplification

## Candidate and baseline

- Baseline: `4109aefe2d3ba80768efa4f4cd2049f6e63ff11f`.
- Candidate source: `f273312fe1a3fcb532805843d7a3c221258f8d49` on the independently authorized `ci/prevent-audit-request-amplification` branch; later CI/documentation commits leave those production sources unchanged.
- CI workflow commit: `98669ef4126f37af37abe64c7397f6074726a699`. Actual successful Linux/Windows execution is bound to candidate `ddd7f9aae8eca52cea7d08fc27911370ffffa681` and run [36973608562](https://github.com/xz-dev/pi-jev-todo-audit/actions/runs/36973608562); see the OS matrix below.
- Publication is authorized for this CI branch only. No master merge, installation update, live model request, release, or deployment was performed.
- Synthetic measurements below establish request routing/coverage, not live semantic equivalence or a monetary savings percentage.

## Red-to-green evidence

- `bun test test/amplification.test.ts` on the unchanged implementation: admissible 1/6/69-record cases failed the one-request assertion with **12/72/828** requests.
- `bun test test/ownership.test.ts` before the gate: seven expected ownership/suppression failures, one existing same-PID case passed.
- Capacity regression before correction: a lower-density admission still left a later batch predicted too large; a successful larger envelope did not retire its contradicted rejection hint. Both passed after correction.
- After the initial repairs: all eight original amplification cases and nine ownership cases passed. Actual-overflow recovery, incomplete-scope stopping, and same-state question resumption are tested separately from admissible batching. See the independent-review repair below for the later counterexample and its 30-case amplification suite.

## Full local checks

- `bun test`: **272 passed, 0 failed**, 1,851 assertions across 18 test files, after the review repair.
- `bun run typecheck`: passed. The first final run exposed a widened `type: string` in the new test fixture; it was annotated with the existing `AuditRequest` question type and the full checks were rerun successfully.
- `node "test/fixtures/node ownership.mjs"`: passed under real **Node v26.10.0 on Linux**. Independent parents claim their own PID; child and grandchild inherit the original owner and remain suppressed; same-process repeated registration remains eligible. The fixture path contains a space and no shell is launched.
- Foreground integration boundary: installed `pi-subagents/src/runs/shared/child-launch.ts:314` derives ambient extensions only for `input.host === "runner"`; same-process foreground launches exclude ambient JEV. This is an inspected launcher boundary, not universal detection of all same-process SDK children.

## Paired offline corpus

Commands: `bun test/compare-workloads.ts --baseline` and `bun test/compare-workloads.ts`. The baseline loader reads committed core modules into memory without checking out files. Both executions use the same corpus, settings, synthetic admissions, and event sequence.

Values are **baseline → candidate**. State/question columns sum serialized UTF-8 projected bytes, not tokens; corpus markers indicate visibility in attempted requests, not independent proof of model understanding. Acceptance tests separately check complete admitted coverage and durable progress.

| Workload | Requests | Pre-splits | Receipts | State bytes | Question bytes | Observed coverage |
| --- | --- | --- | --- | --- | --- | --- |
| tool-heavy | 3 → 3 | 0 → 0 | 3 → 3 | 22,759 → 22,759 | 10,640 → 10,640 | 3/3 text markers; no tool-body leak |
| text-only + reply | 2 → 2 | 0 → 0 | 2 → 2 | 19,510 → 19,510 | 6,888 → 6,888 | 8/8 markers |
| short | 1 → 1 | 0 → 0 | 1 → 1 | 4,250 → 4,250 | 3,264 → 3,264 | 1/1 marker; repeat costs no request |
| TODO revisions | 3 → 3 | 0 → 0 | 3 → 3 | 15,689 → 15,689 | 9,803 → 9,803 | 4/4 markers |
| mixed cached | 2 → 2 | 0 → 0 | 1 → 1 | 9,104 → 9,104 | 5,513 → 5,513 | missing answers obtained without repaying valid pairs |
| failed later chunk | 7 → 7 | 1 → 1 | 4 → 4 | 154,475 → 154,475 | 23,825 → 23,825 | 12/12 markers; two real mock overflows and one validation failure in each run |
| retained prefix + 1 record | 12 → 1 | 12 → 0 | 1 → 1 | 807,720 → 67,310 | 4,393 → 4,382 | complete; frontier `t0` |
| retained prefix + 6 records | 72 → 1 | 77 → 0 | 6 → 1 | 4,888,140 → 67,910 | 26,358 → 4,382 | complete; frontier `t5` |
| retained prefix + 69 records | 828 → 1 | 896 → 0 | 69 → 1 | 56,304,252 → 75,647 | 303,117 → 4,382 | complete; frontier `t68` |

## Private incident replay

The private source trace remains outside the repository, referenced locally by diagnostic `d65434a5`. No transcript or credential payload was written here.

| Check | Historical replay | Candidate synthetic admission oracle |
| --- | --- | --- |
| Actual network requests | 0 | 0 |
| Requests in the adapter | 819 | 2 |
| Pre-splits | 889 | 1 |
| Completed receipts | 69 | 2 |
| Final frontier | `9b805c54` | `9b805c54` |
| State bytes summed | 56,080,395 | 172,144 |
| Question bytes summed | 522,056 | 17,934 |
| Outcome | completed | completed |

Historical replay matched **all 819** exact evaluation identities and request sizes before returning their recorded responses. Those original responses reported **19,674,931 input tokens**. Changed envelopes were evaluated by a separately labeled synthetic oracle (0.347 tokens/byte with the declared 32K/64K limits), not by reusing old responses or usage under different identities. The two candidate requests are therefore not a measured post-fix provider bill, and no live accuracy/savings claim follows from this comparison.

## Independent-review repair

- Original review run `2e78ef7a-9e1c-4ef6-9b44-da59814ce4c0` timed out after 720,000ms. Before termination, it saved a **changes required** report outside this repository; the local run ID is the retained receipt reference. A saved finding is evidence, not approval of the candidate or a successful run.
- P1: the useful-batch exception excluded an irreducible **request-wide** fixed floor. A configured request-only channel with missing usage still made 828 admitted single-question requests for 69 new records, although the full envelope fit the declared synthetic contract.
- Producer independently reproduced the defect by expanding the existing public provider/receipt seam, before changing production: **12 failing cases**. Request-only and request-stricter limits made 5/8/12 requests with usage, or 12/72/828 without usage, for 1/6/69 new records.
- Repair: `typesafe.ts` now checks fixed state plus the longest unanswered single question against the request-wide limit, in addition to the existing state/hint floor. Aggregate-only question predictions remain pre-splits; no global prediction bypass, capacity-store change, or `rolling.ts` redesign was added.
- Green: the 24 admissible variants (TypeSafe, request-only, request-stricter, OpenRouter × reported/missing usage × 1/6/69 records) each send one 12-question request with all required records and a complete frontier. The suite also checks real overflow, irreducible stopping, and question-batch resumption.
- Added explicit guard: successful larger different content retires a size hint, but the known-rejected single question still blocks its unchanged same-state superset before the new request-floor admission path.
- Focused five-file run: **60 passed**. Final full run: **272 passed**; typecheck, native Linux Node smoke, strict validation, and diff check passed. The existing ordinary paired corpus and default retained-prefix metrics above were rerun unchanged after repair.
- Repaired source hashes: `typesafe.ts` SHA-256 `f1c4d96add805a2c5b74f7d85c3ee03dc2ecc233138301d06ce3d710a9b08e80`; `test/amplification.test.ts` SHA-256 `0eaafb0b40f9d0c31e72fdc4dc00e6c264369f292c4dc1af58968e24731668c1`.
- Independent closure review completed in resumed run `7473d782-2cdb-48f8-9c3a-b8226103f85a`; the original report was preserved and a closure section appended. The reviewer independently matched both repaired source hashes, passed 60 focused tests, and reran the original missing-usage request-only reproducer: **1 request, 12 questions, all 70 records covered, frontier `t68`**. Decision: **P1 closed; approved with explicit residual risk for the local source candidate**, not Windows, rollout, semantic-equivalence, or final user acceptance. Producer verified the saved report against the unchanged current hashes.
- Publication preparation reran all 272 tests, typecheck, native Linux Node smoke, strict validation and both offline comparisons with the same results. The only subsequent test-file change removed one extra EOF newline to pass the staged whitespace check: current SHA-256 `4d328248b21c7176d33f2654c89133555e76ced60d825ddd5f968b1d20f9a4bb`. Appending exactly one newline reproduces the original reviewed test hash above; 30 amplification tests/864 assertions and typecheck passed again. `typesafe.ts` remains at its reviewed hash. This is formatting-only, not a new functional repair.
- Original private incident figures above describe the initial repair candidate; the unchanged public corpus was rerun, not the private historical trace. No new historical/semantic/billing claim is made for this targeted follow-up.

## Actual GitHub Actions OS matrix

- First published candidate `acad83729ddd8eb956509702700ae75f8fa79584`, run [36972243121](https://github.com/xz-dev/pi-jev-todo-audit/actions/runs/36972243121): Ubuntu succeeded; Windows installation/typecheck succeeded, but two config-path tests expected POSIX `/` instead of native Windows `\`. Windows had 270 passing / 2 failing tests and the separate Node step was skipped; this run did not satisfy O5 or task 6.2.
- Test-only correction `ddd7f9a`: use `tmpdir()` / `node:path.join` for override/project paths and the default suffix; restore `PI_CODING_AGENT_DIR` in `finally`. `config.ts` and all production audit modules were unchanged. The focused 20 config tests, full 272 tests, typecheck and native Linux fixture passed locally.
- Successful candidate: `ddd7f9aae8eca52cea7d08fc27911370ffffa681`, run [36973608562](https://github.com/xz-dev/pi-jev-todo-audit/actions/runs/36973608562).

| Actual runner | Installation | Typecheck | Full Bun suite | Native Node fixture |
| --- | --- | --- | --- | --- |
| `ubuntu-latest` | passed | passed | 272 passed / 0 failed; 1,851 assertions | passed, Node v26.10.0 |
| `windows-latest` | passed | passed | 272 passed / 0 failed; 1,851 assertions | passed, Node v26.10.0 |

The captured native output on each OS identifies `runtime: node`: parent `allowed: true` / `reload: true`; child and grandchild retain the parent's owner marker with `allowed: false` / `reload: false`. The actual spaced-path fixture and full ownership suite, not merely workflow configuration or Linux simulation, establish the selected O5 execution boundary. These runs use fake model transports; they do not establish real-model accuracy, semantic equivalence, live token savings, installation or deployment.

## Acceptance status and operational boundaries

- O1–O4, C1–C3, A1–A4, R1, D1: local and full CI implementation/test evidence above. On 2026-10-02 the user explicitly delegated final acceptance with “ok 那你验收并继续”; the agent accepted this reviewed source candidate against the agreed matrix and successful platform checks, with no acceptance of live model accuracy, billing reduction or deployment implied.
- O5: actual native Linux and Windows checks passed on run 36973608562. The configured Node 26 / Bun 1.4.2 OS matrix successfully executed installation, typecheck, full tests and native Node inheritance. Task 6.2 is satisfied; first-run Windows failure remains recorded rather than hidden.
- Independent code review: P1 independently closed on the repaired production hash; only the documented EOF and config-test portability corrections followed. Automated platform verification and the delegated source-candidate acceptance/handoff are complete. Live checks and deployment remain separate; `improve-audit-context-fidelity` is the separately authorized next change, not an unreviewed extension of this repair.
- Installed plugin and already-running Pi processes still use the existing installation until an explicitly authorized update/reload. Already-started descendants do not receive retroactive environment changes.
- The PID marker only covers inherited process environments. Same-process child sessions, intentionally scrubbed environments, worker threads, remote/container PID namespaces, and PID reuse are not reliable agent-role detection. Same-process children must exclude JEV.
- Live rollout and fee trend: pending separate approval; use the existing ledger after activation instead of buying new model requests just to demonstrate savings.
