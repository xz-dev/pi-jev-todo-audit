import { describe, expect, test } from "bun:test";
import { decide, type DecideOptions, type VerdictAction } from "../verdict.js";
import { collectContext } from "../context.js";
import type { BoardSnapshot } from "../board.js";
import type { AuditAnswers, ChoiceAnswer } from "../typesafe.js";

const board: BoardSnapshot = { tasks: [
	{ id: 5, subject: "Add repository layer", status: "in_progress" },
	{ id: 7, subject: "Wire endpoint", status: "pending" },
], nextId: 8 };
const a = (choice: string, confidence = 0.9): ChoiceAnswer => ({ choice, confidence });
const context = collectContext([
	{ id: "user", type: "message", message: { role: "user", content: "Implement #5 and #7. The separable authorized checkpoints are documented and not already tracked." } },
	// Main-agent reports carry the macro facts; tool bodies are never exported.
	{ id: "check5", type: "message", message: { role: "assistant", content: "Report: #5 entire acceptance suite passed." } },
	{ id: "check7", type: "message", message: { role: "assistant", content: "Report: #7 entire acceptance suite passed." } },
]);
function answers(patch: Partial<AuditAnswers> = {}): AuditAnswers {
	return { alignment: a("aligned"), current_match: a("5"), drift: a("on_track"), interaction: a("working"), work_evidence: a("user"),
		lifecycle: { task_status_5: a("still_ongoing"), task_status_7: a("still_ongoing") },
		evidence: { task_evidence_5: a("check5"), task_evidence_7: a("check7") }, ...patch };
}
const run = (patch: Partial<AuditAnswers> = {}, opts: DecideOptions = {}, b = board) => decide(answers(patch), b, 0.5, 80, [5], { context, ...opts });
function text(result: VerdictAction): string { expect(result.kind).toBe("inject"); return result.kind === "inject" ? result.text : ""; }

describe("evidence-grounded verdict", () => {
	test("aligned parallel work is silent, age is not a split verdict", () => { expect(run().kind).toBe("silent"); });
	test("no aggregate answer does not suppress a supported sibling correction", () => {
		const out = text(run({ alignment: undefined, lifecycle: { task_status_5: a("actually_completed"), task_status_7: a("unclear") } }));
		expect(out).toContain('mark #5 "Add repository layer" completed'); expect(out).not.toContain("mark #7"); expect(out).toContain("Evidence [check5]");
	});
	test("low-confidence aggregate does not suppress valid per-task completion", () => {
		expect(text(run({ alignment: a("not_aligned", 0.1), lifecycle: { task_status_5: a("actually_completed") } }))).toContain("mark #5");
	});
	test("blocked current match cannot also be claimed or split", () => {
		const out = text(run({ alignment: a("not_aligned"), current_match: a("5"),
			lifecycle: { task_status_5: a("blocked") }, reconciliation: { task_board_5: a("needs_reconciliation") },
			granularity: { task_granularity_5: a("split_independent_outcomes") } }));
		expect(out).toContain('set #5 "Add repository layer" pending');
		expect(out).not.toContain('set #5 "Add repository layer" in_progress'); expect(out).not.toContain("split #5"); expect(out).not.toContain("CONTINUE");
	});
	for (const life of ["actually_completed", "cancelled", "deliberately_deferred", "blocked", "future", "unclear"]) {
		test(`${life} excludes claim/continue/split for the same task`, () => {
			const out = run({ alignment: a("not_aligned"), lifecycle: { task_status_5: a(life) },
				reconciliation: { task_board_5: a("needs_reconciliation") }, granularity: { task_granularity_5: a("split_verifiable_checkpoints") } }, { terminalStop: true });
			if (out.kind === "inject") { expect(out.text).not.toContain("split #5"); expect(out.text).not.toContain("CONTINUE"); expect(out.text).not.toContain('set #5 "Add repository layer" in_progress'); }
		});
	}
	test("cancelled task is individually deleted", () => {
		const out = text(run({ lifecycle: { task_status_5: a("cancelled"), task_status_7: a("still_ongoing") }, evidence: { task_evidence_5: a("user") } }));
		expect(out).toContain("delete #5"); expect(out).not.toContain("delete #7");
	});
	test("recorded blocking/deferred/future states do not wake waiting agent", () => {
		for (const life of ["blocked", "deliberately_deferred", "future", "still_ongoing"]) {
			const out = run({ interaction: a("waiting_user"), lifecycle: { task_status_5: a(life), task_status_7: a("future") }, reconciliation: { task_board_5: a("accurate") } }, { terminalStop: true });
			expect(out.kind).toBe("silent");
		}
	});
	test("one missing blocker annotation permits only a board-only turn", () => {
		const result = run({ interaction: a("waiting_user"), lifecycle: { task_status_5: a("blocked") }, reconciliation: { task_board_5: a("needs_reconciliation") } }, { terminalStop: true });
		const out = text(result); expect(out).toContain("BOARD ONLY"); expect(out).toContain("return control"); expect(out).not.toContain("CONTINUE");
	});
	test("ongoing is not actionable even when matched and warranted", () => {
		expect(run({ board_warranted: a("warranted") }, { terminalStop: true }).kind).toBe("silent");
	});
	test("explicit authorized actionable task can wake, pending task can be claimed", () => {
		for (const status of ["pending", "in_progress"] as const) {
			// An in_progress task is asked the granularity question, so CONTINUE needs that verdict present.
			const gran = status === "in_progress" ? { granularity: { task_granularity_5: a("appropriate") } } : {};
			const result = run({ lifecycle: { task_status_5: a("actionable_now") }, board_warranted: a("warranted"), ...gran }, { terminalStop: true }, { tasks: [{ ...board.tasks[0], status }], nextId: 6 });
			expect(text(result)).toContain("CONTINUE"); if (result.kind === "inject") expect(result.mayWake).toBe(true);
		}
	});
	test("an incomplete final piece cannot wake the agent: CONTINUE requires the granularity verdict", () => {
		// task_status_5=actionable_now with task_granularity_5 missing (incomplete stage) must not send CONTINUE.
		const result = run({ lifecycle: { task_status_5: a("actionable_now") }, board_warranted: a("warranted") }, { terminalStop: true });
		expect(result.kind === "inject" ? result.text : "").not.toContain("CONTINUE");
		expect(result.kind === "inject" ? result.text : "").not.toContain('set #5 "Add repository layer" in_progress');
		// Same incomplete stage still delivers independently supported board-only corrections.
		const withBookkeeping = run({ lifecycle: { task_status_5: a("actionable_now"), task_status_7: a("blocked") },
			reconciliation: { task_board_7: a("needs_reconciliation") } }, { terminalStop: true });
		const t = text(withBookkeeping);
		expect(t).toContain('#7 "Wire endpoint" pending'); expect(t).toContain("BOARD ONLY"); expect(t).not.toContain("CONTINUE");
		// With the granularity verdict present and non-blocked, the same actionable task wakes unchanged.
		const ok = run({ lifecycle: { task_status_5: a("actionable_now") }, board_warranted: a("warranted"), granularity: { task_granularity_5: a("appropriate") } }, { terminalStop: true });
		expect(text(ok)).toContain("CONTINUE");
	});
	for (const interaction of ["waiting_user", "waiting_external", "idle", "unclear"]) {
		test(`actionable_now cannot override ${interaction}`, () => {
			expect(run({ interaction: a(interaction), lifecycle: { task_status_5: a("actionable_now") } }, { terminalStop: true }).kind).not.toBe("inject");
		});
	}
	test("unresolved or missing dependency prevents execution", () => {
		const b: BoardSnapshot = { ...board, tasks: [{ ...board.tasks[0], blockedBy: [99] }] };
		expect(run({ lifecycle: { task_status_5: a("actionable_now") } }, { terminalStop: true }, b).kind).not.toBe("inject");
	});
	test("per-active-task granularity affects only its own task", () => {
		const b = { ...board, tasks: board.tasks.map((t) => ({ ...t, status: "in_progress" as const })) };
		const out = text(run({ granularity: { task_granularity_5: a("split_independent_outcomes"), task_granularity_7: a("appropriate") }, evidence: { task_evidence_5: a("user") } }, {}, b));
		expect(out).toContain("split #5"); expect(out).not.toContain("split #7");
	});
	test("one overall goal can have supported checkpoints", () => {
		expect(text(run({ granularity: { task_granularity_5: a("split_verifiable_checkpoints") } }))).toContain("verifiable checkpoints");
	});
	for (const choice of ["appropriate", "not_applicable", "blocked", "insufficient_evidence"]) {
		test(`${choice} does not split even an old task`, () => { expect(run({ granularity: { task_granularity_5: a(choice) } }).kind).not.toBe("inject"); });
	}
	for (const choice of ["clarify_done_criteria", "clarify_next_action"]) {
		test(`${choice} asks clarification, not subdivision or terminal restart`, () => {
			const patch = { granularity: { task_granularity_5: a(choice) } };
			const out = text(run(patch)); expect(out).toContain("clarify"); expect(out).not.toContain("split #5");
			expect(run(patch, { terminalStop: true }).kind).not.toBe("inject");
		});
	}
	test("partial global context prevents splitting, not independent completion", () => {
		const partial = { ...context, globalComplete: false, reduced: true };
		expect(run({ granularity: { task_granularity_5: a("split_independent_outcomes") } }, { context: partial }).kind).not.toBe("inject");
		expect(text(run({ lifecycle: { task_status_5: a("actually_completed") } }, { context: partial }))).toContain("mark #5");
	});
	test("omitted optional history does not veto explicitly authorized current work", () => {
		const partial = collectContext([{ id: "now", type: "message", message: { role: "user", content: "For #5, permission is granted: run the parser acceptance check now. No dependency remains." } }]);
		partial.globalComplete = false;
		partial.reduced = true;
		partial.omissions.push({ id: "old-background", reason: "provider hard-limit recovery" });
		const result = run({ lifecycle: { task_status_5: a("actionable_now") },
			work_evidence: a("now"), evidence: { task_evidence_5: a("now") },
			granularity: { task_granularity_5: a("insufficient_evidence") },
		}, { context: partial, terminalStop: true });
		expect(text(result)).toContain("CONTINUE");
	});
	test("missing required authorization still prevents continuation in a partial packet", () => {
		const partial = { ...context, globalComplete: false, reduced: true,
			records: context.records.filter((r) => r.id !== "user"),
			omissions: [{ id: "user", reason: "required authorization unavailable" }],
		};
		const result = run({ lifecycle: { task_status_5: a("actionable_now") },
			work_evidence: a("user"), evidence: { task_evidence_5: a("check5") },
		}, { context: partial, terminalStop: true });
		expect(result.kind).not.toBe("inject");
	});
	test("legacy aggregate granularity is ignored", () => {
		const legacy = { granularity: a("bundles_multiple_outcomes") } as unknown as Partial<AuditAnswers>;
		expect(run(legacy).kind).toBe("silent");
	});
	for (const confidence of [NaN, Infinity, -1, 1.01, 0.2]) {
		test(`invalid/low confidence ${confidence} has no corrective authority`, () => {
			expect(run({ lifecycle: { task_status_5: a("actually_completed", confidence) } }).kind).not.toBe("inject");
		});
	}
	for (const id of ["missing", "insufficient_evidence"]) {
		test(`${id} anchor is not evidence`, () => { expect(run({ lifecycle: { task_status_5: a("actually_completed") }, evidence: { task_evidence_5: a(id) } }).kind).not.toBe("inject"); });
	}
	test("latest unavailable user evidence cannot be replaced with older authority", () => {
		const c = collectContext([{ id: "old", type: "message", message: { role: "user", content: "Task accepted" } },
			{ id: "new", type: "message", message: { role: "user", content: [{ type: "image", data: "unknown decision" }] } }]);
		expect(run({ lifecycle: { task_status_5: a("actually_completed") }, evidence: { task_evidence_5: a("old") } }, { context: c }).kind).not.toBe("inject");
	});
	test("unavailable task requirements withhold only that task's correction", () => {
		const c = { ...context, records: [...context.records, { id: "task:5", kind: "supplement", text: "[REDACTED]", group: "task:5", view: "task" as const, protected: true, complete: false }] };
		const out = text(run({ lifecycle: { task_status_5: a("actually_completed"), task_status_7: a("actually_completed") } }, { context: c }));
		expect(out).not.toContain("mark #5"); expect(out).toContain("mark #7");
	});
	test("missing context fails closed", () => { expect(run({ lifecycle: { task_status_5: a("actually_completed") } }, { context: undefined }).kind).not.toBe("inject"); });
	for (const change of [{ advice: true }, { complete: false }, { isError: true }, { kind: "tool_result" }, { kind: "shell" }, { kind: "summary" }, { kind: "supplement" }]) {
		test(`unusable completion source ${JSON.stringify(change)}`, () => {
			const altered = { ...context, records: context.records.map((r) => r.id === "check5" ? { ...r, ...change } : r) };
			expect(run({ lifecycle: { task_status_5: a("actually_completed") } }, { context: altered }).kind).not.toBe("inject");
		});
	}
	test("unknown/missing lifecycle cannot be overridden by current_match", () => {
		for (const life of [undefined, a("unexpected")]) {
			const lifecycle: Record<string, ChoiceAnswer> = life ? { task_status_5: life } : {};
			expect(run({ alignment: a("not_aligned"), lifecycle }).kind).not.toBe("inject");
		}
	});
	test("warrant gates pending/empty/all-done boards", () => {
		for (const warrant of ["idle", "trivial"]) for (const tasks of [[], [{ id: 5, subject: "done", status: "completed" as const }]]) {
			expect(run({ alignment: a("no_in_progress_task"), current_match: a(NOT_ON_BOARD), board_warranted: a(warrant) }, {}, { tasks, nextId: 6 }).kind).toBe("silent");
		}
		expect(run({ alignment: a("no_in_progress_task"), current_match: a(NOT_ON_BOARD), board_warranted: a("warranted", 0.1) }, {}, { tasks: [], nextId: 1 }).kind).not.toBe("inject");
		expect(text(run({ alignment: a("no_in_progress_task"), current_match: a(NOT_ON_BOARD), board_warranted: a("warranted") }, {}, { tasks: [], nextId: 1 }))).toContain("create and claim");
	});
	test("claim requires supported actionable matching task; drift needs its own confidence", () => {
		const patch = { alignment: a("not_aligned"), current_match: a("7"), lifecycle: { task_status_7: a("actionable_now") } };
		expect(text(run(patch))).toContain('set #7 "Wire endpoint" in_progress');
		expect(text(run({ ...patch, drift: a("drifted") }))).toContain("STOP");
		expect(text(run({ ...patch, drift: a("drifted", 0.1) }))).not.toContain("STOP");
	});
	test("unchanged issue suppressed; blocker bookkeeping does not re-arm it", () => {
		const patch = { lifecycle: { task_status_5: a("blocked") }, reconciliation: { task_board_5: a("needs_reconciliation") } };
		const first = run(patch); expect(first.kind).toBe("inject"); if (first.kind !== "inject") return;
		const suppressed = new Set(first.corrections.map((c) => c.key));
		expect(run(patch, { suppressed }).kind).toBe("silent");
		const recorded = { ...board, tasks: [{ ...board.tasks[0], status: "pending" as const, description: "Awaiting user approval" }, board.tasks[1]] };
		expect(run(patch, { suppressed }, recorded).kind).toBe("silent");
		const newDecision = { ...context, records: context.records.map((r) => r.id === "user" ? { ...r, text: "New approval decision" } : r) };
		expect(run(patch, { suppressed, context: newDecision }).kind).toBe("inject");
	});
});

// This suite supplies judgments. It does not measure live jev semantic accuracy.
import { NOT_ON_BOARD } from "../typesafe.js";

describe("leader evidence contract", () => {
	test("a main-agent report can support completion but is phrased as reported, never as verified execution", () => {
		const out = text(run({ lifecycle: { task_status_5: a("actually_completed") } }));
		expect(out).toContain("main-agent report"); expect(out).toContain("not independently verified");
		expect(out).toContain("not independent verification of execution"); expect(out).not.toMatch(/JEV verified/);
		expect(out).toContain("reply briefly with the reason"); // the main agent can correct the leader
	});
	test("a main-agent report cannot cancel scope or create execution permission", () => {
		expect(run({ lifecycle: { task_status_5: a("cancelled") } }).kind).not.toBe("inject");
		const out = run({ alignment: a("not_aligned"), current_match: a("7"), work_evidence: a("check5"), lifecycle: { task_status_7: a("actionable_now") }, evidence: { task_evidence_7: a("check7") } });
		expect(out.kind === "inject" ? out.text : "").not.toContain("in_progress");
	});
	test("a returned tool event alone never establishes completion", () => {
		const c = collectContext([
			{ id: "user", type: "message", message: { role: "user", content: "Implement #5." } },
			{ id: "call", type: "message", message: { role: "assistant", content: [{ type: "toolCall", id: "t", name: "bash", arguments: {} }] } },
			{ id: "ret", type: "message", message: { role: "toolResult", toolCallId: "t", toolName: "bash", content: "ok", isError: false } },
		]);
		expect(run({ lifecycle: { task_status_5: a("actually_completed") }, evidence: { task_evidence_5: a("ret") } }, { context: c }).kind).not.toBe("inject");
	});
});
