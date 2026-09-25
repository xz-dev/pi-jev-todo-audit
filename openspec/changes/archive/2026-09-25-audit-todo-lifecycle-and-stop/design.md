## Context

The current extension reconstructs the latest `rpiv-todo` snapshot from the session branch, tracks `in_progress` age, sends one aggregate TypeSafe Choice request, and injects a corrective steer when the aggregate verdict is misaligned. It already has the right persistence seam and failure isolation, but `stale_status` and `current_match` are singular even when several tasks are active.

`pi-continue-watchdog` already publishes a neutral `user-ready` envelope on `pi:semantic-hook:v1` for terminal automatic idle outcomes. The envelope carries explicit stop metadata but no hidden reasoning. The todo audit can consume that optional event without importing watchdog internals.

See `proposal.md` and `specs/jev-todo-audit/spec.md` for motivation and observable behavior.

## Goals / Non-Goals

**Goals:**

- Reconcile task lifecycle state per visible task, especially per `in_progress` task.
- Preserve legitimate parallel work without treating multiple `in_progress` rows as drift.
- Run one bounded final board check when the agent reaches an autonomous terminal stop.
- Use only visible activity, board snapshots, tool names, and explicit watchdog stop metadata as jev evidence.
- Keep cancellation advisory and agent-mediated; the extension remains read-only toward `rpiv-todo`.
- Change the default cooldown to 10 loops while retaining explicit configuration.

**Non-Goals:**

- Do not add a new `rpiv-todo` status such as `cancelled`, `skipped`, or `deferred`.
- Do not auto-delete, auto-complete, or directly mutate TODO tasks from the extension.
- Do not expose, collect, summarize, or depend on hidden model chain-of-thought.
- Do not replace `pi-continue-watchdog` idle detection or add a second wall-clock watchdog.
- Do not require `pi-continue-watchdog` to be installed; periodic audits remain standalone.
- Do not force a single active task or reject multiple parallel `in_progress` tasks.

## Decisions

### D1: Reuse branch replay and add lightweight per-task history

Keep the branch replay seam in `board.ts`. Extend the replay result with only the bounded metadata needed for candidate selection and explanations: status transition loop, first observed loop, last observed loop, and existing `inProgressSince` data. Do not retain a second full event log or read `rpiv-todo` internals.

A task first observed as `in_progress` receives a conservative starting point. Missing history never becomes evidence for deletion. Completed and deleted tasks remain excluded from active lifecycle correction.

**Alternative rejected:** infer expiration from wall-clock time or import the todo plugin's store. Wall-clock time is not stable across reloads, and importing internals breaks the existing persistence boundary.

### D2: Replace aggregate stale state with dynamic per-task Choice questions

Build one lifecycle question for each visible non-terminal task included in the audit. Active tasks receive choices that distinguish ongoing, completed, cancelled, deferred, and unclear. Pending tasks can be classified as actionable/future, blocked, deferred, obsolete, or unclear when terminal-stop or activity evidence warrants it.

Keep one global/current-match question for the primary work mapping and not-on-board detection, but never use that one answer to resolve every active task. `AuditAnswers` and verdict mapping become keyed by task ID for lifecycle actions.

**Alternative rejected:** encode all active-task combinations in one Choice question. That creates combinatorial options and still loses independent confidence. Dynamic per-task questions are linear in the number of visible candidates and fit the existing batched-request model.

### D3: Apply confidence per task and preserve unrelated work

Use the configured confidence threshold independently for each lifecycle result. High-confidence results produce task-specific corrective steps; low-confidence or missing results produce a notification for that task only. An ongoing or unclear task contributes no destructive action.

The correction builder groups steps by task ID and retains existing drift/granularity wording. It must never render a joined `inProgressLabel` as the target of one lifecycle action when task answers differ.

**Alternative rejected:** retain one global confidence gate. One uncertain task would suppress safe reconciliation for every other task, while one confident task could incorrectly authorize a mutation for its siblings.

### D4: Consume `user-ready` as an optional terminal-stop trigger

Register a listener on `pi.events` for `pi:semantic-hook:v1`. Validate plain-data envelope shape and filter `name === "user-ready"`. On a valid event, use the latest session context and branch snapshot, skip work when no visible task is unfinished, and otherwise call the same audit/verdict pipeline with a `terminal-stop` trigger label.

The event bus is the neutral integration seam. No import from `pi-continue-watchdog` is needed. The hook is producer-agnostic and absent-producer behavior remains unchanged. A process-local identity/in-flight guard coalesces duplicate delivery and prevents the periodic trigger and terminal-stop trigger from running concurrent audits.

Only watchdog terminal automatic outcomes arrive through this hook. Human unlock and user abort do not publish `user-ready`; the todo extension therefore does not need to infer intent from a generic idle event.

**Alternative rejected:** duplicate `agent_settled`/aggregate-idle state-machine logic in this extension. That would create competing definitions of autonomous stop and duplicate the already-tested watchdog lifecycle.

### D5: Pass explicit stop metadata, not hidden reasoning

Extend the audit request state with a small terminal-stop block containing `STOP_KIND`, `REASON_TYPE` when present, and `REASON` when present. Keep `recentActivity()` limited to visible text and tool-call names; thinking blocks stay excluded.

The stop reason is evidence, not an instruction. `AI_UNLOCK/JOB_DONE` plus unfinished tasks is a mismatch candidate, but unfinished board rows alone never authorize continuation. Jev must still determine whether work is actionable now, user-blocked, externally waiting, future work, or intentionally deferred.

### D6: Keep stop-triggered correction on the existing steer path

A terminal-stop correction uses the existing custom `jev-todo-audit` message with `deliverAs: "steer"`. If the agent starts another turn, the continue watchdog's normal `agent_start` lock semantics can re-arm its cycle; this extension does not call watchdog APIs or fabricate a continuation state.

The terminal-stop audit bypasses periodic interval/cooldown because it is a distinct terminal boundary, but it shares `inFlight` protection and bounded API failure handling. It must not continuously re-trigger itself from its own corrective message.

### D7: Make cooldown default one normal cycle

Change `DEFAULT_CONFIG.cooldownLoops` from 5 to 10. Keep the configuration key and periodic trigger algorithm unchanged: a trigger at exactly the cooldown boundary is skipped because eligibility remains `loopsSinceUserMsg > cooldownLoops`. Explicit project/global configuration can still tune the value independently.

This records the requested default semantic without making `interval` and cooldown an inseparable API, preserving existing configuration compatibility.

## Risks / Trade-offs

- [Large boards create many dynamic questions] -> Bound lifecycle questions to visible non-terminal tasks and reuse the existing activity budget; do not enumerate subset combinations.
- [A pending task can be future work rather than forgotten work] -> Require explicit lifecycle choices and confidence; never delete from age alone.
- [Terminal-stop correction can cause an unexpected new turn] -> Continue only when jev identifies concrete authorized work; blocked, future, deferred, and uncertain states do not auto-continue.
- [Semantic hook delivery is best-effort and current-listener-only] -> Keep periodic audits independent, validate envelopes, coalesce duplicate event objects, and treat missing/failed hook delivery as no-op.
- [Watchdog reason may be wrong or stale] -> Treat `REASON_TYPE`/`REASON` as evidence, not authority; board and visible activity remain part of the same request.
- [Task-specific results increase request size] -> Use one batched TypeSafe request and bounded visible activity rather than separate network calls per task.
- [Multiple active tasks can still share ambiguous current work] -> Preserve primary `current_match` for concise mapping, but never let it resolve unrelated lifecycle answers; uncertain tasks remain untouched.

## Migration Plan

1. Ship code and tests with the default cooldown changed from 5 to 10; existing explicit configuration values remain valid.
2. Deploy the optional semantic-hook listener. Installs without `pi-continue-watchdog` retain periodic behavior unchanged.
3. Verify periodic audits, per-task parallel verdicts, terminal-stop checks, and API/hook failure isolation in focused tests and the existing integration test suite.
4. Roll back by removing the new terminal-stop listener and per-task verdict path; the persisted todo snapshot format and existing config files remain compatible.
