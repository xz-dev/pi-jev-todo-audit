# Tasks: jev-todo-audit

## 1. Project setup

- [x] 1.1 Initialize package (package.json with pi manifest fields, tsconfig, `@earendil-works/pi-coding-agent` dev dependency) and verify `pi` can load the extension entry from the repo
- [x] 1.2 Create `config.ts` (JSON config load with defaults, malformed-file fallback, env-var key lookup) and verify unit tests cover defaults, malformed JSON, and disabled state

## 2. State reconstruction

- [x] 2.1 Create `board.ts` (branch replay of last todo snapshot: defensive `isTaskDetails` shape check, rendered task lines) and verify unit tests pass with a real-shaped branch fixture (multi-entry, last-write-wins, corrupt entries skipped)
- [x] 2.2 Create `counter.ts` (branch replay of assistant-message count + in-memory increment on turn_end + last-user-message tracking with incremental reset on user message_end) and verify unit tests cover restart recompute, aborted-turn non-counting, cooldown arithmetic (steer reset, 5-loop window)

## 3. TypeSafe client

- [x] 3.1 Create `typesafe.ts` (single POST to /v1/systemone, 4 Choice questions built from board snapshot + activity summary, 30s timeout, error normalization) and verify unit tests cover request body shape, question-option generation from tasks, and timeout/error paths with a mocked fetch

## 4. Verdict handling and injection

- [x] 4.1 Create `verdict.ts` (confidence gate, aligned no-op, corrective message composition with explicit todo tool calls and drift instruction, low-confidence user-notification text) and verify unit tests cover all verdict paths: aligned silent, misaligned injection content, drift wording, below-threshold notify
- [x] 4.2 Wire `index.ts` event handlers (turn_end increment + trigger check + cooldown skip, session_start/compact/tree recompute, turn_end continuation with chained custom message guarded to fire only on correction) and verify integration test drives a fake agent loop end-to-end (count to 10 → audit fires → correction injected exactly once; cooldown case skips)

## 5. End-to-end validation

- [x] 5.1 Live smoke test with the real TypeSafe API key and a real pi session using rpiv-todo: ≥10 loops of board work verified — audit round-trip at loops 10/20 with real jev verdicts (aligned→silent correctly), correct verdict gating on low-confidence answers (notify not inject), no_in_progress_task verdict handled as claim-work path, and 401/400 error isolation confirmed the loop continues undisturbed. Injection path verified by integration test (mocked jev → sendMessage steer lands once).
