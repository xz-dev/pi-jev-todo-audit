/**
 * Project judgment state into the answer shape `decide()` consumes, so every
 * existing safety gate (non-assistant authorization source, completion is
 * "reported", fail-closed granularity, board-only terminal mode, suppression
 * keys) keeps working unchanged over persisted state instead of one run's raw
 * answers. Anchors are source ids, which is exactly what `decide` resolves.
 */
import type { BoardSnapshot } from "./board.js";
import { inProgressTasks, unfinishedTasks } from "./board.js";
import type { JudgmentState, TaskState } from "./state.js";
import { evidenceKey, granularityKey, lifecycleKey, NOT_ON_BOARD, reconciliationKey, type AuditAnswers, type ChoiceAnswer } from "./typesafe.js";

const sure = (choice: string): ChoiceAnswer => ({ choice, confidence: 1 });

function lifecycle(task: TaskState): string {
	switch (task.status) {
		case "completion_reported": return "actually_completed";
		default: return task.status;
	}
}

/** The anchor that supports the task's current lifecycle conclusion, if any. */
function taskAnchor(task: TaskState): string | undefined {
	switch (task.status) {
		case "completion_reported": return task.completionReport?.sourceId ?? task.anchors.status;
		case "blocked": return task.blocker?.sourceId ?? task.anchors.blocker;
		case "deliberately_deferred": return task.deferral?.sourceId ?? task.anchors.deferral;
		default: return task.anchors.status ?? task.anchors.granularity ?? task.progressReports.at(-1)?.sourceId;
	}
}

/**
 * Only scopes whose cursor covers the current branch tip are "current"; a task
 * that is still open (uncertain) or has never been judged yields no answer, so
 * `decide` treats it as uncertain and fails closed.
 */
export function answersFromState(state: JudgmentState, board: BoardSnapshot, tip: string | undefined): AuditAnswers {
	const current = (scope: { cursor?: string; open?: string }) => !scope.open && scope.cursor !== undefined && (tip === undefined || scope.cursor === tip);
	const out: AuditAnswers = { lifecycle: {}, granularity: {}, granularityEvidence: {}, evidence: {}, reconciliation: {} };
	for (const t of unfinishedTasks(board)) {
		const task = state.tasks[String(t.id)];
		if (!task || !current(task)) continue;
		out.lifecycle![lifecycleKey(t.id)] = sure(lifecycle(task));
		const anchor = taskAnchor(task);
		if (anchor) out.evidence![evidenceKey(t.id)] = sure(anchor);
		if (task.boardCheck) out.reconciliation![reconciliationKey(t.id)] = sure(task.boardCheck.last);
		if (task.granularity && t.status === "in_progress") {
			out.granularity![granularityKey(t.id)] = sure(task.granularity.last);
			if (task.anchors.granularity) out.granularityEvidence![evidenceKey(t.id)] = sure(task.anchors.granularity);
		}
	}
	const s = state.session;
	if (current(s)) {
		out.interaction = sure(s.interaction.state);
		// Observed activity is not authority. A working state needs its separate
		// user-backed authorization anchor; tool/current-work sources cannot replace it.
		const workAnchor = s.interaction.state === "working" ? s.authorizedScope.anchor : s.interaction.anchor;
		if (workAnchor) out.work_evidence = sure(workAnchor);
		const active = inProgressTasks(board).map((t) => t.id);
		if (s.currentWork.target === "off_board") { out.current_match = sure(NOT_ON_BOARD); out.alignment = sure(active.length ? "not_aligned" : "no_in_progress_task"); }
		else if (typeof s.currentWork.target === "number") {
			out.current_match = sure(String(s.currentWork.target));
			out.alignment = sure(!active.length ? "no_in_progress_task" : active.includes(s.currentWork.target) ? "aligned" : "not_aligned");
		} else out.alignment = sure(active.length ? "unclear" : "no_in_progress_task");
		if (s.boardWarrant && !active.length) out.board_warranted = sure(s.boardWarrant.last);
		if (s.lastDrift) out.drift = sure(s.lastDrift);
	}
	return out;
}
