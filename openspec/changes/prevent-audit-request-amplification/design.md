## Context

See `proposal.md` for motivation and `specs/jev-todo-audit/spec.md` for the behavior contract. This change has three implementation slices: process ownership, correctable capacity learning, and non-amplifying subdivision. Planning does not authorize implementation, installation, live model requests, commits, or publication.

### Verified baseline

At source revision `4109aef`, a local private incident trace, diagnostic entry `d65434a5` (`@ loop 310`), was replayed entirely offline through the extension. The source transcript remains outside Git:

| Observation | Result |
| --- | --- |
| Provider attempts | 819, all successful, all single-question |
| Pre-splits | 889 |
| Distinct evaluated states / completed range receipts | 69 / 69 |
| Replayed answer keys and request sizes | All matched the original trace |
| Provider-reported input tokens in the original trace | 19,674,931 |
| Historical density used by prediction | 0.4779192204934779 tokens/byte |
| Actual median density of those accepted attempts | Approximately 0.3468 tokens/byte |
| Predicted state-plus-question size | Approximately 32,715–33,458 tokens |
| Actual reported input per attempt | 23,584–24,447 tokens |

The first leaf request carried a retained summary of 36,323 text bytes, two retained user records totaling 7,938 text bytes, prior reports, and task supplements. Splitting a new tool event did not reduce that fixed prefix. The predictor never lowered its historical maximum after successful admissions. The Cartesian amplification was not a transport retry loop.

A separate, explicitly simulated workload with six small new records and 12 questions used one request without the inflated prediction and 72 requests with it. Its simulated token counts are not a provider bill. Existing focused suites passed 27 tests; they cover conservative prediction and single-question admission, but not this combination.

### Confirmed user decisions

- Subagents must not run JEV, including manual/full review; no child re-enable toggle.
- Use a JEV-owned inherited environment marker, not `PI_SUBAGENT_CHILD` or another framework's private identity.
- Independent manually started Pi processes must work without launcher-specific setup.
- Use Node.js APIs and support Windows as well as POSIX systems.
- Preserve user constraints and the existing evidence projection. Do not hide this incident by lowering audit frequency or silently cropping required context.

## Goals / Non-Goals

**Goals:**

- Suppress inherited child processes before credentials, handlers, commands, or ledger writes become active.
- Allow admission evidence to correct both density and size-based prediction errors, including after reload.
- Make a false fixed-state prediction cost one useful ordinary request when the full unanswered batch is admissible, not one request per record/question pair.
- Retain true-overflow recovery, partial-answer reuse, ordered coverage, and stale-result suppression.
- Supply runnable offline checks and genuine Linux/Windows evidence before claiming platform support.

**Non-Goals:**

- No generic agent-role registry, PID ancestry lookup, tokenizer service, extra model, separate database, cross-session answer cache, or hard-coded content quota.
- No lossy replacement of user decisions by JEV opinions. Retention changes beyond identifying its fixed cost are excluded.
- No changes to other repositories or installed user configuration. In-process children must exclude the main-only extension at their existing launch boundary.
- No automatic paid live validation. No claim that simulated request reduction proves dollar savings or semantic equivalence.

## Decisions

### 1. Establish ownership once per process using JEV's own marker

Use the canonical name `PI_JEV_TODO_AUDIT_OWNER_PID` and compare its string value with `String(process.pid)` at extension factory entry, not at module import time.

| Marker at registration | Action |
| --- | --- |
| Unset or empty | Set it to the current PID; continue through existing configuration checks |
| Exactly the current PID | Continue; permits reload, session replacement, and separate main sessions in the same process |
| Another PID | Return without registering JEV and preserve the inherited value |
| Any other nonempty value | Suppress rather than silently claim ownership |

Claim ownership before configuration/key resolution so a child cannot re-enable itself through a project override. The marker is process metadata, not a persistent configuration value. Do not remove it on `session_shutdown`: another main session or future child may still use the same owning process. Do not mutate parent-shell, machine, or project environment settings.

Keep this as a tiny function integrated at the top of `index.ts`. A small `ownership.ts` extraction is justified only if needed to execute the actual gate under Node in process-inheritance tests; no policy class or general role abstraction.

**Alternatives rejected:** a third-party child flag misses independently spawned Pi children; an `ENABLED=1` flag is inherited and enables descendants; `process.ppid`, process commands, and PID-liveness checks add platform problems without establishing ownership; a module-scoped boolean breaks reload/multiple runtime instances.

**Detection boundary:** ordinary child processes inherit the marker through Node/OS environment inheritance, including intermediaries and grandchildren. An independently started unmarked process owns itself. Explicit environment scrubbing, remote/container PID namespaces, worker threads, and same-process SDK sessions are not identifiable as children by this marker alone. The standard foreground `pi-subagents` launcher already sets `ambientExtensions` false; verify JEV is absent rather than setting a process-global child flag. Explicitly loading JEV into an unmarked/same-process child is unsupported without a separate launch-side exclusion contract. Do not claim universal child detection or silently change another repository to add one.

### 2. Keep the implementation and inheritance checks cross-platform

Production ownership logic uses only `process.env` and `process.pid`. There is no `/proc`, `ps`, `kill -0`, Bash assignment, PID-file lock, shell-profile edit, or platform-specific parent-process discovery.

Process tests use `node:child_process` with an executable path plus an argument array and `shell: false`. A Node-driven fixture uses its own `process.execPath` to spawn child and grandchild, inheriting `process.env`. Do not launch `npm.cmd`, `.bat`, or `.cmd` scripts as if they were native executables. Use `node:path`/file URLs for fixture paths, include a directory containing spaces, and handle Windows environment keys case-insensitively when preparing a controlled test environment so alternate-cased duplicate owner keys cannot invalidate the test.

Run the fixture under a real Node executable, not merely Bun's `process.execPath`, which points to Bun. If the gate is TypeScript, emit/import the actual production module using the already installed compiler/toolchain; never duplicate the ownership algorithm inside the fixture. Reuse the existing Bun test runner for assertions and introduce no third-party test framework.

Required OS matrix: Linux and Windows, using the project's supported Node/Bun versions. MacOS can be a supplementary check. A missing Windows runner is a pending acceptance gate, not a simulated pass.

### 3. Replace the monotonic high-water estimate with correctable observations

In `capacity.ts`, retain channel identity `(endpoint, requested model)` and the two published limits. Replace `Math.max(previousRatio, observedRatio)` with the latest usable successful observation. Validate positive finite input usage and nonzero serialized size; missing/invalid usage does not become zero or erase a usable estimate.

Treat dimension-wise rejection sizes as fallible hints across different contents. When a later successful envelope is at least as large in both measured dimensions as a saved size hint, retire that contradicted hint. Keep exact rejected-envelope identities in the existing evaluation cache: successful different content must not authorize retransmitting an unchanged actual rejection.

Replay existing diagnostic attempts chronologically on the active branch through the same learning operation. No new persisted capacity store or history migration is required. Legacy entries lacking channel/size/usage remain readable and simply cannot train the missing observation. Do not invalidate all saved question answers or bump judgment identity merely to change request routing.

Expose which constraint produced a prediction (state plus longest question, request-wide total, or a historical size hint) through the existing capacity module. The recovery caller needs this information to distinguish useful reductions; a byte comparison between total questions and state is not enough.

**Alternatives rejected:** a permanent maximum recreates the incident; a moving-average/window system adds knobs without proving fit; removing prediction altogether discards useful pre-splitting and the existing user agreement. Latest observations plus bounded authoritative admission are the smallest correction, not an exact tokenizer.

### 4. Resolve a fixed-state prediction before multiplying work

Within `reviewRolling`, keep retained reports/user decisions/summary, supplements, and current opinions separate from the divisible new evidence. Compute the fixed-state envelope as a local size check only; do not send a stripped-down request and use its answers as if it had covered omitted new work.

Before recursively subdividing on a prediction:

1. Build the real unanswered candidate through the existing evaluation/reuse seam; cached questions remain excluded.
2. Determine the constrained dimension and whether reducing new evidence/questions can actually resolve it. In particular, check whether the required retained floor already causes the predicted state-related overflow.
3. If the fixed floor defeats that prediction, allow one ordinary evaluation of the full current unanswered candidate to bypass the soft prediction. The exact-known-rejected check remains first and cannot be bypassed. This is useful audit work, not an additional validation-only query.
4. On success, learn from the admission, keep all valid answers, and finish/advance only when every required answer and the durable receipt are present.
5. On actual context rejection, retain that exact rejection and follow the real-overflow recovery path. The exception must not resend the same rejected candidate or retry non-context failures as subdivisions.

The allowance is tied to a concrete captured candidate, not an unlimited global 'ignore limits' option. Existing bounded transport retries remain separate and still count as provider attempts.

For real overflow, reduce the violated dimension where known: shrink ordered new context when state is responsible; batch questions against one frozen state when their aggregate is responsible. When the provider supplies only a generic context code, do not pretend it identified the dimension; compare candidate reductions and use the existing irreducible-admission fallback to establish failure. Stop before traversing sibling work once the fixed required state plus an irreducible unit cannot be admitted. If a smallest question succeeds but another is genuinely too large, keep the useful same-state answer and report the unresolved scope without merging answers from different states.

There is no arbitrary maximum input length or blanket audit-call cap. Termination comes from finite unresolved input, actual constrained-dimension progress, remembered exact rejections, and refusal to repeat a prediction-only record-by-question expansion. Long inputs that truly need multiple admitted stages remain supported.

### 5. Preserve existing accounting and evidence boundaries

Use current `onAttempt`, `presplits`, answer caching, and durable receipt diagnostics. An admission override that sends a request is an attempt; a local predicted split is not. Unknown usage/charges stay unknown. Avoid a new ledger schema unless the existing fields cannot express an acceptance observation; any necessary field must be optional and replay-compatible.

Do not fix unrelated cancelled-audit accounting or redesign verdict injection in this change. Do not relax uncertainty, prerequisite checks, credential redaction, or stale-branch delivery guards to obtain lower request counts.

### 6. Verify through external effects, one slice at a time

Tests observe registrations, credential calls, provider requests, retained evidence, receipts, and emitted corrections. Internal ratio assertions supplement rather than replace the request-level oracle. Add each failing acceptance case before its corresponding implementation; do not implement everything and call later coverage test-driven.

| ID | Acceptance workload / boundary | Pass condition |
| --- | --- | --- |
| O1 | Unmarked independent Pi; repeat registration/reload | Marker equals own PID; main audit capability remains available |
| O2 | Inherited child and grandchild; manual/full/periodic/stop paths | Marker unchanged; zero JEV registrations, credential calls, requests, injections, and ledger writes |
| O3 | Two independent Node parents; same-process main fork; print/RPC main | Each independent parent owns itself; headless/fork metadata does not disable a main |
| O4 | Empty/malformed marker and Windows alternate-case fixture keys | Defined ownership behavior; invalid nonempty values never enable paid work |
| O5 | Linux and Windows native Node parent-child-grandchild in a spaced path | Actual OS inheritance passes without shell/platform helpers; same-process exclusion checked separately |
| C1 | High-density success followed by lower-density success | Later work no longer retains the earlier maximum; replay after reload has the same result |
| C2 | Successful envelope contradicts an old size rejection hint | Hint stops forcing subdivision; exact rejected identity remains blocked |
| C3 | Different channels; absent usage; TypeSafe 64K/32K versus OpenRouter 32K | Channel isolation, honest unknown usage, and both limits preserved |
| A1 | Admissible retained-prefix fixture; 1, 6, then 69 small new records; 12 questions | Exactly one useful provider request per fixture, full evidence/answer coverage, zero duplicate validation requests |
| A2 | Full candidate truly rejected; smaller ordered stages fit | Typed rejection retained; stages finish in order; no unchanged rejected retransmission or missing evidence |
| A3 | Required fixed state truly cannot fit; larger pending-record sets | Stop the affected scope after the first confirmed irreducible branch, not all sibling record/question combinations; no false receipt/advice |
| A4 | Question-only overflow with admitted state | Required questions covered in same-state batches; completed answers reused on failure/resume |
| R1 | Partial answers, abort/user change, reload, ordinary repeat, forced full review | No missing-answer completion, stale injection, replay of completed pairs, or child bypass |
| D1 | Presplits, real rejection, admission success, partial usage, provider charges | Existing counts distinguish paid attempts from local decisions; no fabricated token/dollar total |

**Safe replay:** keep the private original session outside Git. The baseline adapter may return a recorded answer/usage only when its exact evaluation identity and request shape match the original. Modified batching changes those identities; then use a separately labeled deterministic admission oracle and synthetic answers for coverage/request-count checks. Do not attach the old 819 responses' usage to changed envelopes. Do not require the real incident to collapse to one request without proving its complete new batch fits; the one-request invariant applies to the explicitly admissible fixtures.

Record per-workload attempts, presplits, state/question bytes, covered records/questions, completed receipts, and any genuinely reported usage. Compare identical inputs/channel settings. Keep short-context, tool-heavy, text-heavy, retained-prefix, and genuine-overflow cases separate. Mock bytes/tokens are not monetary savings.

## Risks / Trade-offs

- **A corrected recent estimate can under-predict denser later input** → provider admission remains authoritative; preserve typed-overflow recovery and exact rejected-envelope reuse guards.
- **Disputing a false prediction can buy one real rejection** → the check performs necessary audit work once per captured candidate and must not become a separate probe loop; compare this bounded cost with observed amplification.
- **Fixed context can genuinely exceed capacity** → keep user authority intact, stop with uncertainty/clarification, and preserve completed work rather than crop facts.
- **PID markers cannot identify same-process or environment-scrubbed children** → document the process-inheritance contract and verify launcher exclusion for same-process children. Do not claim broader protection.
- **Process-global environment can leak between tests** → save/restore it in isolated fixtures; never cache ownership as a module-level result or clear it on a live session shutdown.
- **Windows environment/executable conventions differ** → use native Node APIs, canonical owner key, executable paths/argument arrays, and a real Windows run.
- **Changed request grouping can change model judgments** → deterministic tests establish mechanics/coverage, not semantic equivalence; live comparisons require separate approval and a cost cap.

## Migration Plan

1. Review this proposal and acceptance matrix, then start a separate apply workflow. The confirmed main-only/env/Windows decisions remain fixed.
2. Deliver ownership, calibration, and split-progress slices separately with their red/green checks; keep the working set reviewable without automatically creating branches or commits.
3. Run the complete test/typecheck suite, safe offline replay comparisons, and Linux/Windows matrix. Add or extend CI only as part of authorized implementation; a Windows job not yet executed stays pending.
4. Obtain independent review of changed behavior and user acceptance of the evidence. Update README for marker semantics, platform support, fixed-state handling, and the detection boundary.
5. Deploy/reload only after separate authorization. Newly loaded main processes claim their marker; descendants launched afterward inherit it. Already-running children do not retroactively gain a marker and must be restarted through an owning process or excluded from loading JEV.
6. Existing ledgers replay without migration or deletion. A rollback returns to the previous code without editing historical data; it also removes these spend protections, so any temporary global disable must be an explicit operator decision. No automatic package update, push, release, or archive.

## Sources

- Local source: `index.ts`, `capacity.ts:51–80`, `rolling.ts:45–79,131–219`, `typesafe.ts:196–317`, and existing `test/presplit.test.ts`, `test/rolling.test.ts`, `test/capacity.test.ts` (line numbers refer to the investigated baseline).
- [TypeSafe models and context/pricing limits](https://docs.typesafe.ai/models).
- [Node.js process.env](https://nodejs.org/api/process.html#processenv), [process.pid](https://nodejs.org/api/process.html#processpid), and [child_process.spawn](https://nodejs.org/api/child_process.html#child_processspawncommand-args-options).
- Installed `pi-subagents` `src/runs/shared/child-launch.ts`: foreground launches exclude ambient extensions; used only to verify the existing same-process integration boundary, not as a production dependency.
