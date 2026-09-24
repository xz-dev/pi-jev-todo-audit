# Design: task-granularity-audit

## Context

The audit's sensor resolution degrades on coarse tasks. Two orthogonal signals fix this: (1) a pure-code staleness signal — how long a task has been in_progress, measured in audit spans; (2) a jev `granularity` question — whether the task's completion is a single verifiable outcome. See proposal.md for the industry grounding (INVEST, GTD next-action, Kanban item size, IEEE TSE 2021).

Existing seam: `replayBoard(branch)` walks the branch and takes the last todo snapshot. The branch also carries every intermediate snapshot in order — we can diff consecutive ones for free.

## Goals / Non-Goals

**Goals:**
- Stamp each task's in_progress entry with an approximate loop index, derived from branch replay.
- Flag tasks that have been in_progress for more than `staleAuditSpans` audits.
- Always ask `granularity`; use the answer to add a split instruction.

**Non-Goals:**
- No auto-splitting (the agent splits tasks itself; we only nudge).
- No per-task confidence bookkeeping history — age is stateless from the branch.
- No change to drift/alignment logic paths.

## Decisions

**D1: Staleness is measured in audit spans, not loops.** `interval` is configurable; "3 audits" is the semantically stable unit ("we've looked at this task 3 times and it's still going"). spans = age_in_loops / interval, stale when > staleAuditSpans. Exposes one knob, `staleAuditSpans` (default 3).

**D2: Entry stamping via snapshot diff during branch replay.** Walk all todo snapshots in order; when a task id's status changes (from anything) to `in_progress`, stamp the current assistant-message count. `replayBoard` currently keeps only the last snapshot — extend it (or add `replayBoardWithAges`) to return `{ board, ages: Map<taskId, loopsAtEntry> }`. Age now = `totalLoops - entryStamp`. Alternatives: wall-clock time (breaks across /reload gaps; loops are the work unit) — rejected.

**D3: Age is approximate; re-entry resets.** A task that goes pending → in_progress again is a new claim; the stamp updates on every transition into in_progress. Completion/deletion removes the stamp. Missing history (task born in_progress in the first snapshot) → stamp at that snapshot's position (conservative: age counts from earliest evidence).

**D4: `granularity` asked always, cheap.** One more Choice on every audit per the fan-out pattern (a few tokens; questions are parallel). The question targets the in_progress task(s) as a set; when several are in_progress the answer describes the worst offender — acceptable for a nudge, and multiple in_progress tasks is itself drift the alignment path already handles.

**D5: Split nudge rides the inject path.** `decide()` signature gains `staleIds: number[]`. Split step is appended to the steps list; when alignment is fine but stale/granularity fires, we still inject (a coarse-but-aligned board is exactly the silent failure we're fixing). Low-confidence granularity answer → no split step on that basis (granularity is advisory, not a driving answer like alignment).

**D6: `not_applicable` means "no in_progress task to evaluate"** — so granularity alone never triggers anything when the board has no active task.

## Risks / Trade-offs

- [Snapshot gaps] Branch replay only sees persisted snapshots — a task claimed and completed between two todo writes leaves no stamp. Harmless: completed tasks are never flagged.
- [Long-but-fine tasks] A genuinely 30-loop task (big refactor) gets nagged. Mitigation: nudge says "split or note why it stays", agent can ignore; `staleAuditSpans` is configurable.
- [granularity targets plural tasks] Worst-offender ambiguity when several in_progress. Acceptable — multiple in_progress is rare and itself flagged by alignment.
- [decide() signature grows] One array param; keeps verdict logic testable without ctx.

## Migration Plan

Additive: new question, new config key (default 3), new helper. No behavior change for aligned boards with fine-grained tasks — nothing fires. Rollback = revert.
