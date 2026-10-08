import { expect, test } from "bun:test";
import type { BoardSnapshot } from "../board.js";
import { collectContext } from "../context.js";
import { answersFromState } from "../state-verdict.js";
import { emptyState, emptyTask, type JudgmentState } from "../state.js";
import { decide } from "../verdict.js";

const board: BoardSnapshot = { tasks: [
	{ id: 5, subject: "Add repository layer", status: "in_progress" },
	{ id: 7, subject: "Wire endpoint", status: "pending" },
], nextId: 8 };
const context = collectContext([
	{ id: "user", type: "message", message: { role: "user", content: "Implement #5 and #7." } },
	{ id: "check5", type: "message", message: { role: "assistant", content: "Report: #5 entire acceptance suite passed." } },
	{ id: "tip", type: "message", message: { role: "assistant", content: "Continuing." } },
]);

function judged(): JudgmentState {
	const s = emptyState();
	s.tasks["5"] = { ...emptyTask(), status: "completion_reported", completionReport: { sourceId: "check5", verified: false }, anchors: { status: "check5" },
		granularity: { last: "appropriate" }, boardCheck: { last: "accurate", snapshotHash: "h" }, cursor: "tip" };
	s.tasks["7"] = { ...emptyTask(), status: "still_ongoing", anchors: { status: "user" }, boardCheck: { last: "accurate", snapshotHash: "h" }, cursor: "tip" };
	s.session = { interaction: { state: "working", anchor: "user" }, currentWork: { target: 5, anchor: "check5" }, authorizedScope: { anchor: "user" }, lastDrift: "on_track", cursor: "tip" };
	return s;
}

test("stored completion report yields the existing 'reported, not independently verified' correction", () => {
	const answers = answersFromState(judged(), board, "tip");
	expect(answers.lifecycle?.task_status_5?.choice).toBe("actually_completed");
	expect(answers.evidence?.task_evidence_5?.choice).toBe("check5");
	expect(answers.alignment?.choice).toBe("aligned");
	const action = decide(answers, board, 0.5, 80, [], { serviceAccepted: true, context });
	expect(action.kind).toBe("inject");
	if (action.kind === "inject") {
		expect(action.text).toContain('mark #5 "Add repository layer" completed');
		expect(action.text).toContain("reported, not independently verified");
		expect(action.text).not.toContain("#7");
	}
});

test("an open (uncertain) task yields no answer and the verdict fails closed for it", () => {
	const s = judged();
	s.tasks["5"].open = "check5";
	const answers = answersFromState(s, board, "tip");
	expect(answers.lifecycle?.task_status_5).toBeUndefined();
	const action = decide(answers, board, 0.5, 80, [], { serviceAccepted: true, context });
	expect(action.kind).toBe("notify");
	if (action.kind === "notify") expect(action.text).toContain("#5");
});

test("a scope whose cursor is behind the branch tip is not current", () => {
	const s = judged();
	s.tasks["5"].cursor = "check5";
	expect(answersFromState(s, board, "tip").lifecycle?.task_status_5).toBeUndefined();
	expect(answersFromState(s, board, "tip").lifecycle?.task_status_7?.choice).toBe("still_ongoing");
});

test("voided authorization anchor blocks execution advice; in_progress task without granularity never wakes", () => {
	const s = judged();
	s.tasks["5"] = { ...emptyTask(), status: "actionable_now", anchors: { status: "check5" }, cursor: "tip" }; // no granularity verdict
	s.session = { interaction: { state: "waiting_user" }, currentWork: { target: 5 }, authorizedScope: {}, cursor: "tip" };
	const answers = answersFromState(s, board, "tip");
	expect(answers.work_evidence).toBeUndefined();
	expect(answers.interaction?.choice).toBe("waiting_user");
	const action = decide(answers, board, 0.5, 80, [], { serviceAccepted: true, context, terminalStop: true });
	expect(action.kind).not.toBe("inject");
	// Even with authorization restored, a missing granularity verdict keeps #5 uncertain at terminal stop.
	s.session = { interaction: { state: "working", anchor: "user" }, currentWork: { target: 5 }, authorizedScope: { anchor: "user" }, cursor: "tip" };
	const again = decide(answersFromState(s, board, "tip"), board, 0.5, 80, [], { serviceAccepted: true, context, terminalStop: true });
	expect(again.kind).toBe("notify");
});

test("off-board current work with drift yields a return/create advisory through the unchanged gates", () => {
	const s = judged();
	s.tasks["5"].status = "still_ongoing"; s.tasks["5"].completionReport = undefined;
	s.session = { interaction: { state: "working", anchor: "user" }, currentWork: { target: "off_board", anchor: "tip" }, authorizedScope: { anchor: "user" }, lastDrift: "drifted", cursor: "tip" };
	const answers = answersFromState(s, board, "tip");
	expect(answers.current_match?.choice).toBe("not_on_board");
	expect(answers.alignment?.choice).toBe("not_aligned");
	const action = decide(answers, board, 0.5, 80, [], { serviceAccepted: true, context });
	expect(action.kind).toBe("inject");
	if (action.kind === "inject") expect(action.text).toContain("create and claim a task");
});

test("a tool/current-work anchor cannot replace absent execution authority", () => {
	const s = judged(); s.tasks["5"].status = "actionable_now"; s.tasks["5"].completionReport = undefined;
	s.session.authorizedScope = {};
	s.session.interaction = { state: "working", anchor: "tool" };
	const withTool = { ...context, records: [...context.records, { id: "tool", kind: "tool_result", text: '{"tool":"probe","status":"returned"}', group: "tool", view: "recent" as const, complete: true, protected: false }] };
	expect(answersFromState(s, board, "tip").work_evidence).toBeUndefined();
	const no = decide(answersFromState(s, board, "tip"), board, 0.5, 80, [], { serviceAccepted: true, context: withTool, terminalStop: true });
	expect(no.kind).not.toBe("inject");
	s.session.authorizedScope = { anchor: "user" };
	expect(answersFromState(s, board, "tip").work_evidence?.choice).toBe("user");
});
