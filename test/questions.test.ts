import { expect, test } from "bun:test";
import { collectContext } from "../context.js";
import { groupLoops } from "../loops.js";
import { buildChangeRequest } from "../questions.js";
import { emptyState, emptyTask } from "../state.js";
import { applyAnswers } from "../transitions.js";
import { answersFromState } from "../state-verdict.js";
import { decide } from "../verdict.js";

const user = (id: string, content: string) => ({ id, type: "message", message: { role: "user", content } });
const assistant = (id: string, content: unknown) => ({ id, type: "message", message: { role: "assistant", content } });
const call = (id: string, callId: string) => assistant(id, [{ type: "toolCall", id: callId, name: "probe", arguments: { secret: "ARG_PRIVATE" } }]);
const result = (id: string, callId: string) => ({ id, type: "message", message: { role: "toolResult", toolName: "probe", toolCallId: callId, isError: false, content: [{ type: "text", text: "BODY_PRIVATE" }] } });
const board = { tasks: [
	{ id: 5, subject: "Parser", description: "Implement A and B", status: "in_progress" as const },
	{ id: 7, subject: "Docs", status: "pending" as const, blockedBy: [5] },
	{ id: 9, subject: "Old", status: "completed" as const },
], nextId: 10 };

const history = [
	user("u0", "Please implement A and B; do not deploy without asking."),
	assistant("a0", "Starting A."),
	call("a1", "c1"), result("r1", "c1"),
	assistant("a2", "A is done and tested. Starting B."),
	user("u3", "Also: only touch src/, nothing else."),
	assistant("a4", "Understood."),
];
const records = collectContext(history).records;
const loops = groupLoops(records);

test("request carries board, stored state and ONLY the segment's loops; old loops are not re-sent", () => {
	const state = emptyState();
	state.tasks["5"] = { ...emptyTask(), status: "still_ongoing", cursor: "a1", anchors: { status: "u0" } };
	const segment = loops.filter((l) => ["a2", "u3", "a4"].includes(l.id));
	const anchors = new Map(records.map((r) => [r.id, r]));
	const req = buildChangeRequest({ board, state, segment, anchors, taskIds: [5, 7], session: true });
	expect(req.state).toContain("A is done and tested");
	expect(req.state).toContain("only touch src/");
	expect(req.state).not.toContain("Starting A.");          // before cursor, not re-sent
	expect(req.state).toContain("Please implement A and B"); // reloaded ONLY as the stored anchor u0
	expect(req.state).not.toContain("ARG_PRIVATE");
	expect(req.state).not.toContain("BODY_PRIVATE");
	const keys = Object.keys(req.questions);
	expect(keys).toEqual(expect.arrayContaining(["task_status_5", "task_evidence_5", "task_board_5", "task_granularity_5", "task_status_7", "task_evidence_7", "task_board_7", "interaction", "work_evidence", "current_work", "scope_update", "drift"]));
	expect(keys).not.toContain("task_granularity_7"); // pending
	expect(keys).not.toContain("task_status_9");      // completed
	expect(keys).not.toContain("board_warranted");    // in_progress task exists
	for (const q of Object.values(req.questions)) expect(Object.keys(q.criteria).length).toBeLessThanOrEqual(255);
	expect(req.questions.task_evidence_5.criteria).toHaveProperty("a2");
	expect(req.questions.task_evidence_5.criteria).toHaveProperty("u3");
	expect(req.questions.task_evidence_5.criteria).not.toHaveProperty("a0");
	expect(req.questions.current_work.criteria).toHaveProperty("switched_to_5");
	expect(req.scopes.task_status_5).toEqual({ kind: "task", id: 5 });
	expect(req.scopes.drift).toEqual({ kind: "session" });
});

test("board_warranted is asked only without in_progress tasks; dependency-blocked tasks skip granularity", () => {
	const idle = { tasks: [{ id: 7, subject: "Docs", status: "pending" as const }], nextId: 8 };
	const req = buildChangeRequest({ board: idle, state: emptyState(), segment: loops.slice(0, 2), anchors: new Map(), taskIds: [7], session: true });
	expect(Object.keys(req.questions)).toContain("board_warranted");
	expect(Object.keys(req.questions)).not.toContain("task_granularity_7");
});

const seg = loops.filter((l) => ["a2", "u3", "a4"].includes(l.id));
const base = () => { const s = emptyState(); s.tasks["5"] = { ...emptyTask(), status: "still_ongoing", cursor: "a1" }; s.session.cursor = "a1"; return s; };
const answer = (choices: Record<string, string>) => Object.fromEntries(Object.entries(choices).map(([k, v]) => [k, { choice: v }]));
const full = (over: Record<string, string> = {}) => answer({
	task_status_5: "no_change", task_evidence_5: "keep_prior", task_board_5: "accurate", task_granularity_5: "unchanged", task_granularity_evidence_5: "none_in_segment",
	interaction: "unchanged", work_evidence: "keep_prior", current_work_evidence: "none_in_segment", scope_evidence: "none_in_segment", current_work: "same_work", scope_update: "no_scope_change", drift: "on_track", ...over });
const apply = (answers: Record<string, { choice: string }>, state = base()) => applyAnswers({
	state, board, segment: seg, answers, sourceIds: seg.flatMap((l) => l.records.map((r) => r.id)), taskIds: [5], session: true, askedGranularity: new Set([5]), askedWarrant: false, model: "m" });

test("no_change advances cursors and keeps state verbatim", () => {
	const out = apply(full());
	expect(out.advanced.sort()).toEqual(["session", "task:5"]);
	expect(out.state.tasks["5"].cursor).toBe("a4");
	expect(out.state.tasks["5"].status).toBe("still_ongoing");
	expect(out.state.session.cursor).toBe("a4");
	expect(out.state.model).toBe("m");
});

test("partial progress is recorded with its anchor and advances; completion stays reported-not-verified", () => {
	const p = apply(full({ task_status_5: "progress_evidenced", task_evidence_5: "a2" }));
	expect(p.state.tasks["5"].progressReports).toEqual([{ sourceId: "a2" }]);
	expect(p.state.tasks["5"].status).toBe("still_ongoing");
	expect(p.advanced).toContain("task:5");
	const c = apply(full({ task_status_5: "completion_reported", task_evidence_5: "a2" }));
	expect(c.state.tasks["5"].status).toBe("completion_reported");
	expect(c.state.tasks["5"].completionReport).toEqual({ sourceId: "a2", verified: false });
	// Completion without a real source anchor cannot be recorded as completion.
	const bad = apply(full({ task_status_5: "completion_reported", task_evidence_5: "none_in_segment" }));
	expect(bad.state.tasks["5"].status).toBe("still_ongoing");
	expect(bad.state.tasks["5"].cursor).toBe("a1");
	expect(bad.open).toContain("task:5");
});

test("uncertainty holds the segment open without moving the cursor; other scopes still advance", () => {
	const out = apply(full({ task_status_5: "unclear_in_segment" }));
	expect(out.open).toEqual(["task:5"]);
	expect(out.advanced).toEqual(["session"]);
	expect(out.state.tasks["5"].cursor).toBe("a1");
	expect(out.state.tasks["5"].open).toBe("a2");
});

test("missing answer for a scope writes nothing for that scope", () => {
	const answers = full(); delete answers.task_board_5;
	const out = apply(answers);
	expect(out.unanswered).toEqual(["task:5"]);
	expect(out.state.tasks["5"].cursor).toBe("a1");
	expect(out.advanced).toEqual(["session"]);
});

test("scope_changed resets the task to its first-active loop when known, else to the current segment", () => {
	const s = base(); s.tasks["5"].firstActive = "u0"; s.tasks["5"].progressReports = [{ sourceId: "a2" }];
	const out = apply(full({ task_status_5: "scope_changed", task_evidence_5: "u3" }), s);
	expect(out.open).toEqual(["task:5"]);
	expect(out.state.tasks["5"].progressReports).toEqual([]);
	expect(out.state.tasks["5"].open).toBe("u0");
	expect(out.state.tasks["5"].anchors.scope).toBe("u3");
	const unknown = apply(full({ task_status_5: "scope_changed", task_evidence_5: "u3" }), base());
	expect(unknown.state.tasks["5"].open).toBe("a2");
});

test("session transitions: scope update and permission withdrawal write anchors; blocker binds to its conclusion", () => {
	const s = base(); s.session.authorizedScope = { anchor: "u0" }; s.session.interaction = { state: "working", anchor: "u0" };
	const upd = apply(full({ scope_update: "scope_updated", scope_evidence: "u3" }), s);
	expect(upd.state.session.authorizedScope).toEqual({ anchor: "u3" });
	const wd = apply(full({ interaction: "permission_withdrawn", work_evidence: "u3" }), s);
	expect(wd.state.session.interaction.state).toBe("waiting_user");
	expect(wd.state.session.authorizedScope).toEqual({});
	expect(wd.state.session.cursor).toBe("a4");
	const blocked = apply(full({ task_status_5: "blocked_now", task_evidence_5: "u3" }));
	expect(blocked.state.tasks["5"].blocker).toEqual({ sourceId: "u3" });
	expect(blocked.state.tasks["5"].anchors).toEqual({ blocker: "u3" });
	expect(blocked.state.tasks["5"].anchors.status).toBeUndefined();
});

for (const choice of ["cancelled_by_user", "scope_changed"]) test(`assistant cannot establish authority for ${choice}`, () => {
	const out = apply(full({ task_status_5: choice, task_evidence_5: "a2" }));
	expect(out.state.tasks["5"].cursor).toBe("a1"); expect(out.open).toContain("task:5");
	expect(out.state.tasks["5"].status).toBe("still_ongoing");
});
const sessionAuthorityCases: Record<string, string>[] = [
	{ interaction: "permission_granted" }, { interaction: "user_responded" }, { scope_update: "scope_updated" },
];
for (const choices of sessionAuthorityCases) test(`assistant is not a permission source: ${JSON.stringify(choices)}`, () => {
	const out = apply(full({ ...choices, work_evidence: "a2", scope_evidence: "a2" }));
	expect(out.state.session.cursor).toBe("a1"); expect(out.open).toContain("session");
	expect(out.state.session.authorizedScope).toEqual({});
});
const uncertainCases: Record<string, string>[] = [{ task_evidence_5: "insufficient_evidence" }, { task_board_5: "unclear" }];
for (const choices of uncertainCases) test(`uncertainty fences the whole task scope: ${JSON.stringify(choices)}`, () => {
	const out = apply(full(choices));
	expect(out.state.tasks["5"].cursor).toBe("a1"); expect(out.open).toContain("task:5");
	expect(out.advanced).toContain("session");
});
test("a user reply does not imply readiness; withdrawal wins over simultaneous scope update", () => {
	const out = apply(full({ interaction: "user_responded", work_evidence: "u3" }));
	expect(out.state.session.interaction.state).toBe("unclear");
	const revoked = apply(full({ interaction: "permission_withdrawn", scope_update: "scope_updated", work_evidence: "u3", scope_evidence: "u3" }));
	expect(revoked.state.session.authorizedScope).toEqual({});
	expect(revoked.state.session.interaction.state).toBe("waiting_user");
});

test("lifecycle, granularity, permission, work and scope retain independent sources", () => {
	const out = apply(full({ task_status_5: "progress_evidenced", task_evidence_5: "a2",
		task_granularity_5: "now_needs_next_action", task_granularity_evidence_5: "u3",
		interaction: "permission_granted", work_evidence: "u3", current_work: "switched_to_5", current_work_evidence: "a4",
		scope_update: "scope_updated", scope_evidence: "u3" }));
	expect(out.state.tasks["5"].anchors).toEqual({ status: "a2", granularity: "u3" });
	expect(out.state.session.interaction.anchor).toBe("u3");
	expect(out.state.session.currentWork.anchor).toBe("a4");
	expect(out.state.session.authorizedScope.anchor).toBe("u3");
});

test("reported actionability is not permission: it needs the independent user-authority gate before execution advice", () => {
	const evidence = collectContext(history);
	const withoutPermission = apply(full({ task_status_5: "actionable_now", task_evidence_5: "a2" }));
	expect(withoutPermission.state.tasks["5"].status).toBe("actionable_now");
	const no = decide(answersFromState(withoutPermission.state, board, "a4"), board, 0.8, 0, [], { context: evidence, serviceAccepted: true, terminalStop: true });
	expect(no.kind).not.toBe("inject");
	const permitted = base();
	permitted.session.interaction = { state: "working", anchor: "u0" };
	permitted.session.authorizedScope = { anchor: "u0" };
	permitted.tasks["5"].granularity = { last: "appropriate" };
	const withPermission = apply(full({ task_status_5: "actionable_now", task_evidence_5: "a2" }), permitted);
	const yes = decide(answersFromState(withPermission.state, board, "a4"), board, 0.8, 0, [], { context: evidence, serviceAccepted: true, terminalStop: true });
	expect(yes.kind).toBe("inject"); if (yes.kind === "inject") expect(yes.corrections.some((c) => c.execution)).toBe(true);
});

test("a reported deferral supports board-only reconciliation, never execution authority", () => {
	const out = apply(full({ task_status_5: "deferred", task_evidence_5: "a2", task_board_5: "needs_reconciliation" }));
	expect(out.state.tasks["5"].status).toBe("deliberately_deferred");
	const advice = decide(answersFromState(out.state, board, "a4"), board, 0.8, 0, [], { context: collectContext(history), serviceAccepted: true, terminalStop: true });
	expect(advice.kind).toBe("inject"); if (advice.kind === "inject") expect(advice.corrections.every((c) => c.bookkeeping && !c.execution)).toBe(true);
});

test("work activity cannot clear a stored user wait without a user-backed resumption", () => {
	const waiting = base();
	waiting.session.interaction = { state: "waiting_user", anchor: "u0" };
	waiting.session.authorizedScope = { anchor: "u0" };
	const held = apply(full({ interaction: "work_resumed", work_evidence: "a2" }), waiting);
	expect(held.state.session.interaction.state).toBe("waiting_user");
	expect(held.state.session.open).toBeDefined();
	const resumed = apply(full({ interaction: "work_resumed", work_evidence: "u3" }), waiting);
	expect(resumed.state.session.interaction.state).toBe("working");
	expect(resumed.state.session.authorizedScope.anchor).toBe("u0");
});

test("an initial granularity finding needs its own source; unchanged never creates one", () => {
	const none = apply(full());
	expect(none.state.tasks["5"].granularity).toBeUndefined();
	const unsupported = apply(full({ task_granularity_5: "appropriate_now", task_granularity_evidence_5: "none_in_segment" }));
	expect(unsupported.state.tasks["5"].granularity).toBeUndefined();
	expect(unsupported.state.tasks["5"].open).toBeDefined();
	const initial = apply(full({ task_granularity_5: "appropriate_now", task_granularity_evidence_5: "a2" }));
	expect(initial.state.tasks["5"].granularity).toEqual({ last: "appropriate" });
	expect(initial.state.tasks["5"].anchors.granularity).toBe("a2");
	expect(initial.state.tasks["5"].cursor).toBe("a4");
});
