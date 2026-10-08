/**
 * Apply finite change answers to judgment state (design D1 write column, D3
 * cursor rules). Pure: returns the next state plus which scopes advanced,
 * stayed open, or had no answer. Anchors bind to the specific conclusion
 * they were chosen for; `keep_prior`/`none_in_segment` never fabricate one.
 */
import type { BoardSnapshot } from "./board.js";
import { unfinishedTasks } from "./board.js";
import type { Loop } from "./loops.js";
import { boardKey, boardSnapshotHash, evidenceKey, granularityEvidenceKey, granularityKey, statusKey, taskScopeHash } from "./questions.js";
import { advance, emptyTask, holdOpen, resetTask, withdrawPermission, type JudgmentState, type SessionState, type TaskState } from "./state.js";

export interface Answer { choice: string }
export interface Applied {
	state: JudgmentState;
	advanced: string[];      // scope keys ("session" | "task:<id>") whose cursor moved
	open: string[];          // scopes held open (uncertain)
	unanswered: string[];    // scopes with a missing question answer (no write)
}

const UNCERTAIN = new Set(["unclear_in_segment", "insufficient_evidence", "unclear"]);
const sourceRecord = (id: string | undefined, segment: Loop[]) => segment.flatMap((l) => l.records).find((r) => r.id === id && r.complete && !r.advice && r.kind !== "tool_call");
const isSource = (choice: string | undefined, sourceIds: ReadonlySet<string>) => !!choice && sourceIds.has(choice);

function applyTask(prev: TaskState | undefined, taskId: number, answers: Record<string, Answer | undefined>, segment: Loop[], sourceIds: ReadonlySet<string>, board: BoardSnapshot, askedGranularity: boolean):
	{ task: TaskState; outcome: "advanced" | "open" | "unanswered" } {
	const first = segment[0]!.id, last = segment.at(-1)!.id;
	const status = answers[statusKey(taskId)]?.choice, evidence = answers[evidenceKey(taskId)]?.choice;
	const boardCheck = answers[boardKey(taskId)]?.choice, granularity = answers[granularityKey(taskId)]?.choice;
	const granularityEvidence = answers[granularityEvidenceKey(taskId)]?.choice;
	if (!status || !evidence || !boardCheck || (askedGranularity && (!granularity || !granularityEvidence))) return { task: prev ?? emptyTask(), outcome: "unanswered" };
	let task: TaskState = { ...(prev ?? emptyTask()), anchors: { ...(prev?.anchors ?? {}) }, progressReports: [...(prev?.progressReports ?? [])] };
	const anchor = isSource(evidence, sourceIds) ? evidence : undefined;
	const record = sourceRecord(anchor, segment);
	const granularityRecord = isSource(granularityEvidence, sourceIds) ? sourceRecord(granularityEvidence, segment) : undefined;
	const boardTask = unfinishedTasks(board).find((t) => t.id === taskId)!;
	const changed = status !== "no_change" && !UNCERTAIN.has(status);
	const granularityChanged = granularity !== undefined && granularity !== "unchanged" && !UNCERTAIN.has(granularity);
	const unsupported = (changed && !record) || (granularityChanged && !granularityRecord) ||
		(["progress_evidenced", "completion_reported"].includes(status) && (!record || record.isError || !["assistant", "user"].includes(record.kind))) ||
		(["cancelled_by_user", "scope_changed"].includes(status) && record?.kind !== "user") ||
		(status === "completion_reported" && (!record || record.isError || !["assistant", "user"].includes(record.kind)));
	const uncertain = UNCERTAIN.has(status) || UNCERTAIN.has(evidence) || UNCERTAIN.has(boardCheck) ||
		(granularityEvidence !== undefined && UNCERTAIN.has(granularityEvidence)) || (granularity !== undefined && UNCERTAIN.has(granularity));
	if (unsupported || uncertain) return { task: holdOpen(task, first), outcome: "open" };
	switch (status) {
		case "no_change": break;
		case "progress_evidenced":
			if (anchor && !task.progressReports.some((p) => p.sourceId === anchor)) task.progressReports.push({ sourceId: anchor });
			task.status = "still_ongoing";
			task.completionReport = undefined;
			if (anchor) task.anchors.status = anchor;
			break;
		case "completion_reported":
			if (anchor) { task.completionReport = { sourceId: anchor, verified: false }; task.anchors.status = anchor; task.status = "completion_reported"; }
			else task.status = "unclear";
			break;
		case "cancelled_by_user":
			if (anchor) { task.status = "cancelled"; task.anchors.status = anchor; } else task.status = "unclear";
			break;
		case "blocked_now":
			task.status = "blocked"; if (anchor) { task.blocker = { sourceId: anchor }; task.anchors.blocker = anchor; }
			break;
		case "unblocked_now":
			task.status = "still_ongoing"; task.blocker = undefined; delete task.anchors.blocker; if (anchor) task.anchors.status = anchor;
			break;
		case "deferred":
			task.status = "deliberately_deferred"; if (anchor) { task.deferral = { sourceId: anchor }; task.anchors.deferral = anchor; }
			break;
		case "actionable_now":
			task.status = "actionable_now"; if (anchor) task.anchors.status = anchor;
			break;
		case "scope_changed":
			// Re-judge from first-active when known; otherwise from this segment (one contract, D3).
			task = resetTask(task, first);
			if (anchor) task.anchors.scope = anchor;
			return { task, outcome: "open" };
		default: break; // unclear_in_segment handled below
	}
	if (granularity) {
		const map: Record<string, TaskState["granularity"]> = {
			unchanged: task.granularity, now_needs_split_outcomes: { last: "split_independent_outcomes" }, now_needs_split_checkpoints: { last: "split_verifiable_checkpoints" },
			now_needs_done_criteria: { last: "clarify_done_criteria" }, now_needs_next_action: { last: "clarify_next_action" }, blocked_now: { last: "blocked" },
			// Both positive answers need their own source (guarded above); `unchanged` never creates a finding.
			appropriate_now: { last: "appropriate" }, resolved: { last: "appropriate" },
		};
		if (granularity in map) { task.granularity = map[granularity] ?? task.granularity; if (granularityRecord && granularity !== "unchanged") task.anchors.granularity = granularityRecord.id; }
	}
	if (boardTask && (boardCheck === "accurate" || boardCheck === "needs_reconciliation" || boardCheck === "unclear"))
		task.boardCheck = { last: boardCheck, snapshotHash: boardSnapshotHash(boardTask), scopeHash: taskScopeHash(boardTask) };
	if (uncertain) return { task: holdOpen(task, first), outcome: "open" };
	return { task: advance(task, last), outcome: "advanced" };
}

function applySession(prev: SessionState, answers: Record<string, Answer | undefined>, segment: Loop[], sourceIds: ReadonlySet<string>, askedWarrant: boolean):
	{ session: SessionState; outcome: "advanced" | "open" | "unanswered" } {
	const first = segment[0]!.id, last = segment.at(-1)!.id;
	const interaction = answers.interaction?.choice, evidence = answers.work_evidence?.choice, work = answers.current_work?.choice;
	const scopeUpdate = answers.scope_update?.choice, drift = answers.drift?.choice, warrant = answers.board_warranted?.choice;
	const workEvidence = answers.current_work_evidence?.choice, scopeEvidence = answers.scope_evidence?.choice;
	if (!interaction || !evidence || !work || !scopeUpdate || !workEvidence || !scopeEvidence || !drift || (askedWarrant && !warrant)) return { session: prev, outcome: "unanswered" };
	let session: SessionState = { ...prev, interaction: { ...prev.interaction }, currentWork: { ...prev.currentWork }, authorizedScope: { ...prev.authorizedScope } };
	const anchor = isSource(evidence, sourceIds) ? evidence : undefined;
	const record = sourceRecord(anchor, segment);
	const workSource = isSource(workEvidence, sourceIds) ? sourceRecord(workEvidence, segment) : undefined;
	const scopeSource = isSource(scopeEvidence, sourceIds) ? sourceRecord(scopeEvidence, segment) : undefined;
	const userDecision = ["user_responded", "permission_granted", "permission_withdrawn"].includes(interaction);
	const unsupported = (userDecision && record?.kind !== "user") || (interaction !== "unchanged" && !record) ||
		(interaction === "work_resumed" && prev.interaction.state === "waiting_user" && record?.kind !== "user") ||
		(!["same_work", "waiting", "none"].includes(work) && !workSource) || (scopeUpdate === "scope_updated" && scopeSource?.kind !== "user");
	const uncertain = UNCERTAIN.has(interaction) || UNCERTAIN.has(work) || UNCERTAIN.has(evidence) || UNCERTAIN.has(workEvidence) || UNCERTAIN.has(scopeEvidence) || drift === "unclear";
	if (unsupported || uncertain) return { session: holdOpen(session, first), outcome: "open" };
	switch (interaction) {
		case "unchanged": break;
		// An answer to a question is not necessarily permission to execute.
		case "user_responded": session.interaction = { state: "unclear", anchor }; break;
		case "permission_granted": session.interaction = { state: "working", anchor }; if (anchor) session.authorizedScope = { anchor }; break;
		case "permission_withdrawn": session = withdrawPermission(session); if (anchor) session.interaction.anchor = anchor; break;
		case "now_waiting_user": session.interaction = { state: "waiting_user", waitingFor: anchor ? `see ${anchor}` : undefined, anchor }; break;
		case "now_waiting_external": session.interaction = { state: "waiting_external", waitingFor: anchor ? `see ${anchor}` : undefined, anchor }; break;
		case "work_resumed":
			session.interaction = { state: "working", anchor: anchor ?? session.authorizedScope.anchor };
			if (!session.authorizedScope.anchor && record?.kind === "user") session.authorizedScope = { anchor: record.id };
			break;
		case "idle_now": session.interaction = { state: "idle" }; break;
		default: break;
	}
	if (work === "switched_off_board") session.currentWork = { target: "off_board", anchor: workSource?.id };
	else if (work === "waiting" || work === "none") session.currentWork = { target: "none" };
	else if (work.startsWith("switched_to_")) { const id = Number(work.slice("switched_to_".length)); if (Number.isInteger(id)) session.currentWork = { target: id, anchor: workSource?.id }; }
	if (scopeUpdate === "scope_updated" && scopeSource && interaction !== "permission_withdrawn") session.authorizedScope = { anchor: scopeSource.id };
	if (warrant === "warranted" || warrant === "trivial" || warrant === "idle") session.boardWarrant = { last: warrant };
	if (drift === "on_track" || drift === "drifted" || drift === "blocked") session.lastDrift = drift;
	if (uncertain) return { session: holdOpen(session, first), outcome: "open" };
	return { session: advance(session, last), outcome: "advanced" };
}

/** Apply one segment's answers for the asked scopes. Scopes not in `taskIds`/`session` are untouched. */
export function applyAnswers(a: {
	state: JudgmentState; board: BoardSnapshot; segment: Loop[]; answers: Record<string, Answer | undefined>;
	sourceIds: Iterable<string>; taskIds: number[]; session: boolean; askedGranularity: ReadonlySet<number>; askedWarrant: boolean; model?: string;
}): Applied {
	if (!a.segment.length) return { state: a.state, advanced: [], open: [], unanswered: [] };
	const sourceIds = new Set(a.sourceIds);
	const next: JudgmentState = { ...a.state, model: a.model ?? a.state.model, tasks: { ...a.state.tasks } };
	const advanced: string[] = [], open: string[] = [], unanswered: string[] = [];
	for (const id of a.taskIds) {
		const { task, outcome } = applyTask(a.state.tasks[String(id)], id, a.answers, a.segment, sourceIds, a.board, a.askedGranularity.has(id));
		if (outcome !== "unanswered") next.tasks[String(id)] = task;
		({ advanced, open, unanswered })[outcome].push(`task:${id}`);
	}
	if (a.session) {
		const { session, outcome } = applySession(a.state.session, a.answers, a.segment, sourceIds, a.askedWarrant);
		if (outcome !== "unanswered") next.session = session;
		({ advanced, open, unanswered })[outcome].push("session");
	}
	return { state: next, advanced, open, unanswered };
}
