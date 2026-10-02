## 1. Establish acceptance and offline baselines

- [x] 1.1 Review the design's O1–O5, C1–C3, A1–A4, R1, and D1 acceptance matrix with the user at apply start; verify the approved scope remains main-only ownership, capacity correction, and non-amplifying recovery, with no live model requests or deployment authorized implicitly.
- [x] 1.2 Preserve a privacy-safe baseline harness in the existing test structure for the retained-prefix amplification; verify the unchanged implementation reproduces multiple requests for an admissible 12-question workload (including the six-record 72-request case), and record the expected request-count failure without relying on a syntax/import failure.
- [x] 1.3 Record the existing focused-suite and typecheck baseline with `bun test "test/presplit.test.ts" "test/rolling.test.ts" "test/capacity.test.ts"` and `bun run typecheck`; verify all failures are classified before modifying production code and no test performs a live fetch.

## 2. Restrict JEV to owning main processes

- [x] 2.1 Add ownership acceptance tests in `test/ownership.test.ts` using the real extension entry point and registration/key/request/ledger spies; demonstrate O1–O4 fail on missing ownership behavior, including inherited children attempting periodic, stop, ordinary manual, and full review paths.
- [x] 2.2 Add the tiny `PI_JEV_TODO_AUDIT_OWNER_PID` gate at factory entry in `index.ts` (extract only a minimal production helper if Node process tests require it); verify unset/empty claims current PID, same-PID reload stays eligible, and different/malformed nonempty markers suppress before configuration/key lookup without overwriting the owner.
- [x] 2.3 Verify lifetime and isolation with O1–O4: main session shutdown does not clear the process marker, independent unmarked parents each own themselves, nested descendants remain disabled, headless main sessions and in-process main forks remain enabled, and tests do not leak environment changes into each other.
- [x] 2.4 Check same-process child integration using an offline launch/resource-selection check; verify the existing foreground child path does not load JEV and leaves the main session enabled, and document explicitly injected unmarked/same-process children as unsupported rather than pretending a PID comparison identifies them.

## 3. Make channel calibration respond to successful admissions

- [x] 3.1 Add a C1 request-level regression where a high-density success precedes a lower-density success, including diagnostic replay on reload; verify the current maximum-only learner fails the intended prediction/request assertion before changing it.
- [x] 3.2 Replace maximum-only learning in `capacity.ts` with the latest valid successful density; verify C1 passes in memory and after replay, while invalid/missing usage preserves the prior usable estimate and does not become zero.
- [x] 3.3 Add and satisfy C2 for retiring a size rejection hint contradicted by a later successful equal/larger envelope; verify an unchanged exact rejected envelope still causes zero retransmission and different-content success does not erase that exact rejection identity.
- [x] 3.4 Expose the constrained dimension/prediction source through the existing capacity module and update its callers without creating a new policy layer; verify C3, active-branch replay, legacy diagnostics, and TypeSafe/OpenRouter limit tests with `bun test "test/presplit.test.ts" "test/openrouter.test.ts"` and `bun run typecheck`.

## 4. Prevent prediction-only record-by-question amplification

- [x] 4.1 Add A1 to `test/amplification.test.ts` with a large required retained prefix, inflated historical estimate, 12 unresolved questions, and 1/6/69 small new-record variants; verify each fixture's full candidate is admissible under the declared fake provider contract and the pre-fix implementation fails the one-request-and-complete-coverage assertion.
- [x] 4.2 Separate required fixed state from divisible new evidence in `rolling.ts` sizing and allow a useful full unanswered batch to bypass only the disputed prediction when that floor defeats subdivision; verify A1 performs exactly one provider request, includes all required evidence, caches all valid answers, and advances only a complete durable receipt.
- [x] 4.3 Keep the exact-rejected-envelope guard ahead of any prediction override in `typesafe.ts`, then preserve actual-overflow recovery on failed admission; verify A2 with typed context failures, no unchanged rejected retries, no extra validation-only request, and no subdivision for auth/quota/validation failures.
- [x] 4.4 Make subdivision progress depend on the constrained dimension rather than raw record count or total question/state byte dominance; verify A3 stops before traversing sibling record/question combinations after confirmed irreducibility, retaining prior completed results and emitting no definitive advice from incomplete coverage.
- [x] 4.5 Verify A4 with genuinely question-dominated overflow and a later batch failure; completed same-state question answers must be reused, all required questions must eventually be covered or reported incomplete, and answers from different states must never be merged as one completed evaluation.

## 5. Protect integration behavior and truthful accounting

- [x] 5.1 Exercise R1 through existing host fixtures: ordinary unchanged review, forced full review, partial answers, failed receipt writes, user invalidation, abort, reload/compaction, and branch changes; verify no stale injection, false completion, repeated completed pair, or child-policy bypass.
- [x] 5.2 Verify D1 using the existing diagnostic fields: presplits are not requests, admission checks are requests, genuine retries remain counted, and partial/missing token and charge data remain honest; run the usage and integration suites and avoid a ledger schema change unless an acceptance observation cannot otherwise be represented.
- [x] 5.3 Compare the same sanitized short-context, tool-heavy, text-heavy, retained-prefix, and actual-overflow workloads before/after; deliver a table of attempts, presplits, bytes, coverage, and receipts, labeling all simulated counts and refusing to convert mock bytes/tokens into claimed dollar savings.
- [x] 5.4 Re-run the optional private incident replay locally if the source trace is available, without committing its contents; verify exact historical response replay only for unchanged identities/shapes, use an explicitly separate synthetic oracle for changed requests, and report unavailable provider/semantic comparisons rather than fabricating a post-fix bill.

## 6. Execute real cross-platform checks

- [x] 6.1 Add a native Node parent-child-grandchild smoke fixture that executes the actual ownership gate, uses `node:child_process` with executable paths/argument arrays and no shell, and includes spaced paths and canonicalized Windows environment keys; verify O5 locally and record the real Node executable/version rather than substituting Bun.
- [ ] 6.2 Add or extend the repository's test CI matrix for Linux and Windows using the supported Node/Bun toolchain; verify installation, full `bun test`, `bun run typecheck`, and the native Node inheritance fixture on each OS, leaving unavailable or unexecuted Windows evidence explicitly pending.

## 7. Review and hand off without implicit release

- [x] 7.1 Update the affected README sections for owner-marker semantics, independent/manual launches, reload/child inheritance, same-process and environment-scrubbing boundaries, corrected calibration, and real-overflow behavior; verify every claim against source and the acceptance evidence.
- [x] 7.2 Obtain an independent read-only review of functional changes and regression quality, including Windows assumptions, fixed-state progress, cache/receipt safety, and accidental scope growth; verify any findings are fixed and rechecked before reporting implementation ready.
- [ ] 7.3 Run `bun test`, `bun run typecheck`, and `openspec validate "prevent-audit-request-amplification" --strict`; verify the implementation/evidence covers every acceptance ID, with user acceptance, automated results, and any pending platform/live checks reported separately. Do not deploy, change installed settings, commit, push, publish, synchronize/archive specs, or run a paid live comparison without its required separate authorization.
