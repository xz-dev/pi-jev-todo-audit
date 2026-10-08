## 1. Loop segmentation

- [x] 1.1 Group the active session branch into complete loops (assistant message + all tool results; exclude an incomplete trailing loop; aborted/error turns count only with their recorded results). Verify: unit test over a fixture branch with tool calls, a missing result, an aborted turn and a compaction summary yields the expected loop ids.
- [x] 1.2 Pack loops after a cursor into one segment within a given capacity using the service-reported limit and bytes-to-tokens prior; drop trailing whole loops on overflow; report `oversize_loop` for a single non-fitting loop. Verify: unit tests for fit, drop-trailing, oversize and missing-limit (safety ceiling + reported metadata).

## 2. Judgment state

- [x] 2.1 Define task and session state records (D2) and their JSONL entry type; reader rebuilds state from the active branch, ignoring entries whose loop ids are absent. Verify: round-trip test, branch-switch reconciliation test, old-ledger entries ignored.
- [x] 2.2 Cursor rules (D3): advance on non-uncertain acknowledged writes, keep `open` for `unclear_in_segment`, per-task and session independence, reset rules for scope change/reopen, permission withdrawal, model identity change. Verify: table-driven unit tests per rule.

## 3. Change questions

- [x] 3.1 Replace `buildAuditRequest` question definitions with change questions and state projection per D1 (`task_status`, `task_evidence`, `task_granularity`, `task_board`, `interaction`, `work_evidence`, `current_work`, `scope_update`+`drift`, `board_warranted`). Verify: snapshot test of the request for a fixture state + segment; every option set <= 255; no loop before the cursor appears in state.
- [x] 3.2 Map answers back into state transitions, binding `task_evidence`/`work_evidence` anchors to the specific conclusion they support; `keep_prior`/`none_in_segment` semantics. Verify: unit tests per transition, including partial progress and uncertainty.

## 4. Verdict integration

- [x] 4.1 `decide` reads judgment state instead of per-run answers; all existing gates preserved (non-assistant authorization source, "reported, not independently verified", fail-closed granularity, terminal-stop board-only, suppression keys). Verify: existing verdict tests pass against state inputs; new tests for voided anchor and uncertain task.
- [x] 4.2 Audit entry point (`auditNow`) sequences: load state -> build segments per scope -> one service call per segment (plus one drift-only call when a segment changes the authorized scope) -> write transitions -> advance cursors; single-active audit, cooldown and currentness gates unchanged. Verify: integration test with a stub service over a real-session fixture shows loops sent once per scope across two audits.

## 5. Service consumption

- [x] 5.1 Call the service with state + questions + `{ timeoutMs, signal }` only; remove `cache`, `checkpoint`, `planStages`, `projectStage`, `onProgress`, projection revisions and review-cache namespaces from the audit. Verify: typecheck passes; grep shows no reference to removed client fields.
- [x] 5.2 Read the service-reported capacity limit for the selected backend/model (depends on the service change `focus-service-on-timeout-and-backend-compat`); surface missing metadata in the audit status line. Verify: test with a stub service reporting a limit and one reporting none.
- [x] 5.3 Decide and record the audit `timeoutMs` default (currently 30s vs service 120s); keep passing one value, interpreted by the service. Verify: config test and one integration test showing the value reaches the service.

## 6. Retirement of replaced code

- [x] 6.1 Remove `shared-review.ts` staging, `history-stages.ts`, rolling receipts and consumer cache code paths once 4.2 passes; keep JSONL readers tolerant of old entry types. Verify: typecheck, full test suite, cold-reload test with an old-format session file.
- [x] 6.2 Update `docs/programming-thinking/*.idea.lean` to the new state/cursor model and validate. Verify: `lean` check passes for the updated file.

## 7. Acceptance

- [x] 7.1 Replay the user-selected real session fixture through two consecutive audits and record bytes/tokens sent per audit; second audit sends only post-cursor loops. Verify: recorded comparison file in the change directory.
- [x] 7.2 Human review of the question wording and option sets against the design table before enabling by default.

## Candidate disposition

Evidence and exact limits: [verification](evidence/verification.md). Checked tasks refer to the stated bounded checks, not deployment, classifier accuracy or complete replacement of the old suite.

| Tasks | Disposition |
| --- | --- |
| 1.1, 1.2, 2.1 | Supported by frozen loop/packing/state unit tests and offline cold reload. No fsync guarantee. |
| 2.2 | One `resetTask` contract (first-active, else segment/earliest loop) now serves evidenced scope change, full mode and contract-hash change; table-driven unit tests plus runner tests for model-identity change and contract change; withdrawal keeps cursors; branch reconciliation per scope. |
| 3.1 | Request snapshot, source-only evidence options and `appropriate_now` initial finding implemented. Packing now enforces the 255-choice ceiling (`MAX_CHOICES`): loops are packed only while every question stays within it; one complete loop that alone exceeds it is reported `oversize` (fail closed, no call, cursor parked before it) rather than sliced or sent to be rejected. Not implemented: withholding sources inside a loop to keep judging it. |
| 3.2, 4.1 | Exact final candidate passed 227 active default tests and seven actual-service/Pi offline tests. Added authority, stored-wait and original-versus-summary regressions pass. |
| 4.2 | Sequencing/currentness/suffix checks pass. Task wording amended to the implemented rule: one call per segment plus one drift-only call when that segment changes the authorized scope (plain-language explanation delivered; user chose to release and iterate). |
| 5.1 | Main audit and provisioning/readiness now require only judge v1. Canonical deprecated client declarations are retained for compatibility; no production consumer references to the retired review fields remain. |
| 5.2 | Actual sibling-service/native-adapter fixture reads judge-path capacity; unknown metadata is surfaced. |
| 5.3 | Decided by the user: the audit sends no default; the service applies native 60 s / LLM Pi `httpIdleTimeoutMs`. A configured audit value reaches the service unchanged (index test). |
| 6.1 | Replaced runtime removed; old JSONL entry types tolerated (cold-reload tests). Retirement closed by user decision as a recorded limitation: the behavior-level map in verification.md names what moved to active tests and what stayed only in `test/legacy/retired-protocol`; further old-assertion migration happens on concrete feedback, not as an open-ended equivalence campaign. |
| 6.2 | Exact annotated Lean check/run passed; proof scope is explicit and no independent semantic-reader claim is made. |
| 7.1 | Fixed-prefix offline replay measured bytes and no old-history overlap. Tokens, billing and model accuracy remain unknown, not zero. |
| 7.2 | User reviewed the granularity wording (chose `appropriate_now`) and chose to release and gather real-use feedback instead of a line-by-line review now; `evidence/question-wording.md` records the exact shipped templates. |

