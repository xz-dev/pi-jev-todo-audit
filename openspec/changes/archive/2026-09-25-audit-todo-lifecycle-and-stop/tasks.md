## 1. Board history and lifecycle candidates

- [x] 1.1 Extend branch replay with bounded per-task observation/status-transition metadata while preserving last-snapshot and `inProgressSince` behavior; verify existing board tests still pass and missing history never creates a destructive candidate.
- [x] 1.2 Add board helpers for visible unfinished tasks, per-task lifecycle candidates, and completed/deleted filtering; verify parallel `in_progress`, pending, blocked, and deleted-task cases with focused unit tests.

## 2. Observable jev audit request

- [x] 2.1 Extend audit request state to carry an optional validated terminal-stop block (`STOP_KIND`, `REASON_TYPE`, `REASON`) and keep recent activity limited to visible text and tool-call names; verify thinking blocks are excluded and stop metadata is serialized.
- [x] 2.2 Replace singular stale-state assessment with dynamic per-task lifecycle Choice questions while retaining primary current-match and not-on-board evidence; verify one batched request contains independent questions for multiple active tasks and does not create subset-combination options.
- [x] 2.3 Update TypeScript answer types and malformed/missing-answer handling for task-keyed results; verify incomplete responses remain safe and do not cause unrelated tasks to be mutated.

## 3. Per-task verdict and correction mapping

- [x] 3.1 Implement per-task lifecycle verdict mapping for ongoing, completed, cancelled, deferred, future, blocked, and unclear outcomes with independent confidence gates; verify #5 completed plus #7 ongoing only produces a #5 action.
- [x] 3.2 Preserve parallel `in_progress` as valid work and integrate existing drift/granularity messaging without applying one lifecycle answer to all active tasks; verify multiple-active aligned cases remain silent.
- [x] 3.3 Add terminal-stop correction policy: unfinished tasks trigger a check but continuation requires actionable authorized work, while blocked/future/deferred/unclear tasks do not blindly continue; verify terminal-stop scenarios and low-confidence safety behavior.

## 4. Continue-watchdog semantic-hook integration

- [x] 4.1 Subscribe to `pi:semantic-hook:v1`, validate `user-ready` envelopes, and route valid autonomous terminal events into the existing audit pipeline without importing watchdog internals; verify absent producer, malformed payload, and listener-error isolation.
- [x] 4.2 Add stop-epoch/in-flight coalescing so one terminal event cannot create concurrent or repeated audits, and ensure terminal checks bypass periodic interval/cooldown without re-triggering from their own corrective steer; verify duplicate-event and race tests.
- [x] 4.3 Wire terminal-stop board replay against the latest session branch and preserve human-unlock/user-abort exclusion; verify completed-board silence and unfinished-board audit integration tests.

## 5. Cooldown and documentation

- [x] 5.1 Change the default `cooldownLoops` from 5 to 10 while preserving explicit configuration overrides and exact-boundary skip semantics; verify config and counter tests at 10 and 11 loops.
- [x] 5.2 Update README configuration, trigger, evidence, and parallel-task behavior documentation; verify documented defaults and examples match runtime behavior.

## 6. Full validation

- [x] 6.1 Run `npm run typecheck` and `npm test`, then fix any regressions in existing periodic, manual-audit, cooldown, and failure-isolation coverage; verify both commands pass.
- [x] 6.2 Review the final diff against the delta spec and run focused terminal-stop plus multi-`in_progress` integration scenarios; verify no direct dependency on `pi-continue-watchdog` or hidden thinking content was introduced.
