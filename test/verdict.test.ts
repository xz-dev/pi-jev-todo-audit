import { describe, expect, test } from "bun:test";
import { decide } from "../verdict.js";
import type { BoardSnapshot } from "../board.js";
import type { AuditAnswers } from "../typesafe.js";

const board: BoardSnapshot = {
	tasks: [
		{ id: 5, subject: "Add repository layer", status: "in_progress" },
		{ id: 7, subject: "Wire endpoint", status: "pending" },
	],
	nextId: 8,
};

const ans = (choice: string, confidence = 0.9) => ({ choice, confidence, probabilities: { [choice]: confidence } });

describe("verdict", () => {
	test("aligned + confident → silent", () => {
		const a: AuditAnswers = { alignment: ans("aligned", 0.9) };
		expect(decide(a, board, 0.5, 10).kind).toBe("silent");
	});

	test("aligned + low confidence → notify (no inject)", () => {
		const a: AuditAnswers = { alignment: ans("aligned", 0.2) };
		const r = decide(a, board, 0.5, 10);
		expect(r.kind).toBe("notify");
	});

	test("not_aligned → inject with task ids + actions", () => {
		const a: AuditAnswers = {
			alignment: ans("not_aligned", 0.9),
			lifecycle: { task_status_5: ans("actually_completed", 0.9) },
			current_match: ans("7", 0.9),
			drift: ans("on_track", 0.9),
		};
		const r = decide(a, board, 0.5, 10);
		expect(r.kind).toBe("inject");
		if (r.kind === "inject") {
			expect(r.text).toContain("#5");
			expect(r.text).toContain("#7");
			expect(r.text).toContain("in_progress");
			expect(r.text).toContain("completed");
		}
	});

	test("not on board → create instruction", () => {
		const a: AuditAnswers = {
			alignment: ans("not_aligned", 0.9),
			lifecycle: { task_status_5: ans("still_ongoing", 0.9) },
			current_match: ans("not_on_board", 0.9),
			drift: ans("on_track", 0.9),
		};
		const r = decide(a, board, 0.5, 10);
		if (r.kind === "inject") expect(r.text).toContain("create todo task(s)");
		else expect.unreachable();
	});

	test("drifted → stop + resume order", () => {
		const a: AuditAnswers = {
			alignment: ans("not_aligned", 0.9),
			lifecycle: { task_status_5: ans("deliberately_deferred", 0.9) },
			current_match: ans("7", 0.9),
			drift: ans("drifted", 0.9),
		};
		const r = decide(a, board, 0.5, 10);
		if (r.kind === "inject") {
			expect(r.text).toContain("drifted");
			expect(r.text).toContain("STOP");
		} else expect.unreachable();
	});

	test("low-confidence lifecycle verdict is safe: notify, no inject", () => {
		const a: AuditAnswers = {
			alignment: ans("not_aligned", 0.9),
			lifecycle: { task_status_5: ans("actually_completed", 0.3) },
			current_match: ans("7", 0.9),
			drift: ans("on_track", 0.9),
		};
		const r = decide(a, board, 0.5, 10);
		// #5's lifecycle answer is below threshold → no destructive action for #5.
		// The aggregate verdict can still inject a scoped correction for #7.
		if (r.kind === "inject") {
			expect(r.text).not.toContain("mark #5");
			expect(r.text).toContain("not touched: #5");
		} else {
			expect(r.kind).toBe("notify");
		}
	});

	test("low-confidence drift does NOT block injection (gating only applies to driving answers)", () => {
		const a: AuditAnswers = {
			alignment: ans("not_aligned", 0.9),
			lifecycle: { task_status_5: ans("actually_completed", 0.9) },
			current_match: ans("7", 0.9),
			drift: ans("drifted", 0.3), // low conf — ignored entirely
		};
		const r = decide(a, board, 0.5, 10);
		expect(r.kind).toBe("inject");
		if (r.kind === "inject") expect(r.text).not.toContain("STOP");
	});

	test("confident drift adds STOP line", () => {
		const a: AuditAnswers = {
			alignment: ans("not_aligned", 0.9),
			lifecycle: { task_status_5: ans("actually_completed", 0.9) },
			current_match: ans("7", 0.9),
			drift: ans("drifted", 0.9),
		};
		const r = decide(a, board, 0.5, 10);
		if (r.kind === "inject") expect(r.text).toContain("STOP");
		else expect.unreachable();
	});

	test("no_in_progress_task + match → inject 'claim it'", () => {
		const b: BoardSnapshot = { tasks: [{ id: 1, subject: "s1", status: "pending" }], nextId: 2 };
		const a: AuditAnswers = {
			alignment: ans("no_in_progress_task", 0.99),
			current_match: ans("1", 0.9),
			drift: ans("on_track", 0.9),
		};
		const r = decide(a, b, 0.5, 10);
		expect(r.kind).toBe("inject");
		if (r.kind === "inject") expect(r.text).toContain("set #1");
	});

	test("no_in_progress_task + no match → inject 'create + claim'", () => {
		const b: BoardSnapshot = { tasks: [{ id: 1, subject: "s1", status: "pending" }], nextId: 2 };
		const a: AuditAnswers = {
			alignment: ans("no_in_progress_task", 0.99),
			current_match: ans("not_on_board", 0.9),
		};
		const r = decide(a, b, 0.5, 10);
		if (r.kind === "inject") expect(r.text).toContain("create todo task(s)");
		else expect.unreachable();
	});

	test("empty board + warranted=trivial → silent", () => {
		const empty: BoardSnapshot = { tasks: [], nextId: 1 };
		const a: AuditAnswers = {
			alignment: ans("no_in_progress_task", 0.9),
			board_warranted: ans("trivial", 0.9),
		};
		expect(decide(a, empty, 0.5, 10).kind).toBe("silent");
	});

	test("empty board + warranted=idle → silent", () => {
		const empty: BoardSnapshot = { tasks: [], nextId: 1 };
		const a: AuditAnswers = {
			alignment: ans("no_in_progress_task", 0.9),
			board_warranted: ans("idle", 0.9),
		};
		expect(decide(a, empty, 0.5, 10).kind).toBe("silent");
	});

	test("empty board + warranted=warranted → inject 'create'", () => {
		const empty: BoardSnapshot = { tasks: [], nextId: 1 };
		const a: AuditAnswers = {
			alignment: ans("no_in_progress_task", 0.9),
			board_warranted: ans("warranted", 0.9),
			current_match: ans("not_on_board", 0.9),
		};
		const r = decide(a, empty, 0.5, 10);
		expect(r.kind).toBe("inject");
		if (r.kind === "inject") expect(r.text).toContain("create todo task(s)");
	});

	test("empty board + low-confidence board_warranted → notify", () => {
		const empty: BoardSnapshot = { tasks: [], nextId: 1 };
		const a: AuditAnswers = {
			alignment: ans("no_in_progress_task", 0.9),
			board_warranted: ans("warranted", 0.2),
			current_match: ans("not_on_board", 0.9),
		};
		expect(decide(a, empty, 0.5, 10).kind).toBe("notify");
	});

	test("non-empty board + no_in_progress_task → inject even without board_warranted field", () => {
		// board_warranted omitted from request → answer missing → keep existing inject
		const b: BoardSnapshot = { tasks: [{ id: 1, subject: "s1", status: "pending" }], nextId: 2 };
		const a: AuditAnswers = {
			alignment: ans("no_in_progress_task", 0.9),
			current_match: ans("1", 0.9),
		};
		const r = decide(a, b, 0.5, 10);
		expect(r.kind).toBe("inject");
		if (r.kind === "inject") expect(r.text).toContain("set #1");
	});

	test("all-done board + trivial → silent", () => {
		const doneBoard: BoardSnapshot = {
			tasks: [{ id: 1, subject: "s1", status: "completed" }, { id: 2, subject: "s2", status: "completed" }],
			nextId: 3,
		};
		const a: AuditAnswers = {
			alignment: ans("no_in_progress_task", 0.9),
			board_warranted: ans("trivial", 0.9),
		};
		expect(decide(a, doneBoard, 0.5, 10).kind).toBe("silent");
	});

	test("all-done board + warranted → inject 'create'", () => {
		const doneBoard: BoardSnapshot = {
			tasks: [{ id: 1, subject: "s1", status: "completed" }],
			nextId: 2,
		};
		const a: AuditAnswers = {
			alignment: ans("no_in_progress_task", 0.9),
			board_warranted: ans("warranted", 0.9),
			current_match: ans("not_on_board", 0.9),
		};
		const r = decide(a, doneBoard, 0.5, 10);
		expect(r.kind).toBe("inject");
		if (r.kind === "inject") expect(r.text).toContain("create todo task(s)");
	});

	test("aligned + stale in_progress → inject with split", () => {
		const a: AuditAnswers = { alignment: ans("aligned", 0.9) };
		const r = decide(a, board, 0.5, 40, [5]);
		expect(r.kind).toBe("inject");
		if (r.kind === "inject") {
			expect(r.text).toContain("split");
			expect(r.text).toContain("#5");
			expect(r.text).toContain("single verifiable outcome");
		}
	});

	test("aligned + no stale → silent (unchanged)", () => {
		const a: AuditAnswers = { alignment: ans("aligned", 0.9) };
		expect(decide(a, board, 0.5, 40, []).kind).toBe("silent");
		expect(decide(a, board, 0.5, 40).kind).toBe("silent");
	});

	test("granularity bundles_multiple_outcomes → split in inject", () => {
		const a: AuditAnswers = {
			alignment: ans("aligned", 0.9),
			granularity: ans("bundles_multiple_outcomes", 0.9),
		};
		const r = decide(a, board, 0.5, 10, []);
		expect(r.kind).toBe("inject");
		if (r.kind === "inject") expect(r.text).toContain("split");
	});

	test("granularity ambiguous_done_criteria → split", () => {
		const a: AuditAnswers = {
			alignment: ans("aligned", 0.9),
			granularity: ans("ambiguous_done_criteria", 0.9),
		};
		expect(decide(a, board, 0.5, 10, []).kind).toBe("inject");
	});

	test("granularity single_verifiable_outcome / not_applicable → no split", () => {
		for (const c of ["single_verifiable_outcome", "not_applicable"]) {
			const a: AuditAnswers = {
				alignment: ans("aligned", 0.9),
				granularity: ans(c, 0.9),
			};
			expect(decide(a, board, 0.5, 10, []).kind).toBe("silent");
		}
	});

	test("low-confidence granularity → no split on that basis", () => {
		const a: AuditAnswers = {
			alignment: ans("aligned", 0.9),
			granularity: ans("bundles_multiple_outcomes", 0.3),
		};
		expect(decide(a, board, 0.5, 10, []).kind).toBe("silent");
	});

	test("not_aligned + stale → both alignment steps AND split step", () => {
		const a: AuditAnswers = {
			alignment: ans("not_aligned", 0.9),
			lifecycle: { task_status_5: ans("actually_completed", 0.9) },
			current_match: ans("7", 0.9),
			drift: ans("on_track", 0.9),
			granularity: ans("bundles_multiple_outcomes", 0.9),
		};
		const r = decide(a, board, 0.5, 10, [5]);
		expect(r.kind).toBe("inject");
		if (r.kind === "inject") {
			expect(r.text).toContain("mark #5");
			expect(r.text).toContain("split");
		}
	});

	test("parallel in_progress: #5 completed + #7 ongoing → only #5 action", () => {
		const parallel: BoardSnapshot = {
			tasks: [
				{ id: 5, subject: "repo layer", status: "in_progress" },
				{ id: 7, subject: "endpoint", status: "in_progress" },
			],
			nextId: 8,
		};
		const a: AuditAnswers = {
			alignment: ans("aligned", 0.9),
			lifecycle: {
				task_status_5: ans("actually_completed", 0.9),
				task_status_7: ans("still_ongoing", 0.9),
			},
		};
		const r = decide(a, parallel, 0.5, 10);
		expect(r.kind).toBe("inject");
		if (r.kind === "inject") {
			expect(r.text).toContain("mark #5");
			expect(r.text).not.toContain("mark #7");
			expect(r.text).not.toContain("delete #7");
		}
	});

	test("parallel in_progress all ongoing → silent, no error", () => {
		const parallel: BoardSnapshot = {
			tasks: [
				{ id: 5, subject: "a", status: "in_progress" },
				{ id: 7, subject: "b", status: "in_progress" },
			],
			nextId: 8,
		};
		const a: AuditAnswers = {
			alignment: ans("aligned", 0.9),
			lifecycle: {
				task_status_5: ans("still_ongoing", 0.9),
				task_status_7: ans("still_ongoing", 0.9),
			},
		};
		expect(decide(a, parallel, 0.5, 10).kind).toBe("silent");
	});

	test("cancelled task → delete step naming only that task", () => {
		const parallel: BoardSnapshot = {
			tasks: [
				{ id: 5, subject: "dead work", status: "in_progress" },
				{ id: 7, subject: "live", status: "in_progress" },
			],
			nextId: 8,
		};
		const a: AuditAnswers = {
			alignment: ans("aligned", 0.9),
			lifecycle: {
				task_status_5: ans("cancelled", 0.9),
				task_status_7: ans("still_ongoing", 0.9),
			},
		};
		const r = decide(a, parallel, 0.5, 10);
		if (r.kind === "inject") {
			expect(r.text).toContain("delete #5");
			expect(r.text).not.toContain("delete #7");
		} else expect.unreachable();
	});

	test("unclear lifecycle → no destructive step for that task", () => {
		const a: AuditAnswers = {
			alignment: ans("aligned", 0.9),
			lifecycle: { task_status_5: ans("unclear", 0.6) },
		};
		const r = decide(a, board, 0.5, 10);
		// unclear → notify mentioning #5, never a delete/complete step
		expect(r.kind).toBe("notify");
		if (r.kind === "notify") expect(r.text).toContain("#5");
	});

	test("terminal-stop: unfinished actionable task → inject names task", () => {
		const a: AuditAnswers = {
			alignment: ans("not_aligned", 0.9),
			lifecycle: { task_status_5: ans("still_ongoing", 0.9), task_status_7: ans("actually_completed", 0.9) },
			current_match: ans("not_on_board", 0.9),
		};
		const r = decide(a, board, 0.5, 10, [], { terminalStop: true });
		expect(r.kind).toBe("inject");
		if (r.kind === "inject") expect(r.text).toContain("terminal-stop");
	});

	test("terminal-stop: all tasks blocked → no blind continuation demand", () => {
		const blocked: BoardSnapshot = {
			tasks: [{ id: 5, subject: "needs creds", status: "pending" }],
			nextId: 6,
		};
		const a: AuditAnswers = {
			alignment: ans("no_in_progress_task", 0.9),
			board_warranted: ans("idle", 0.9),
			lifecycle: { task_status_5: ans("blocked", 0.9) },
		};
		const r = decide(a, blocked, 0.5, 10, [], { terminalStop: true });
		// blocked lifecycle is actionable (records reason) but must not demand new work
		if (r.kind === "inject") {
			expect(r.text).not.toContain("create todo task");
			expect(r.text).toContain("blocked");
		} else {
			expect(r.kind).toBe("silent");
		}
	});

	test("low-confidence aggregate answers contribute no steps (independent gating)", () => {
		// F2 repro: low-conf alignment + low-conf match + high-conf lifecycle
		// → only the lifecycle step; no set #7, no create.
		const a: AuditAnswers = {
			alignment: ans("not_aligned", 0.3),
			current_match: ans("7", 0.3),
			lifecycle: { task_status_5: ans("actually_completed", 0.9) },
		};
		const r = decide(a, board, 0.5, 10);
		expect(r.kind).toBe("inject");
		if (r.kind === "inject") {
			expect(r.text).toContain("mark #5");
			expect(r.text).not.toContain("set #7");
			expect(r.text).not.toContain("create todo task");
		}
	});

	test("no alignment answer + actionable lifecycle → per-task inject", () => {
		const a: AuditAnswers = {
			lifecycle: { task_status_5: ans("actually_completed", 0.9) },
		};
		const r = decide(a, board, 0.5, 10);
		expect(r.kind).toBe("inject");
		if (r.kind === "inject") expect(r.text).toContain("mark #5");
	});

	test("no alignment + only uncertain lifecycle → notify", () => {
		const a: AuditAnswers = {
			lifecycle: { task_status_5: ans("actually_completed", 0.3) },
		};
		expect(decide(a, board, 0.5, 10).kind).toBe("notify");
	});

	test("no alignment + nothing → audit skipped notify", () => {
		expect(decide({}, board, 0.5, 10).kind).toBe("notify");
	});

	test("blocked lifecycle on in_progress task → set back to pending", () => {
		const a: AuditAnswers = {
			alignment: ans("aligned", 0.9),
			lifecycle: { task_status_5: ans("blocked", 0.9) },
		};
		const r = decide(a, board, 0.5, 10);
		if (r.kind === "inject") expect(r.text).toContain("set #5");
		else expect.unreachable();
	});

	test("blocked lifecycle on pending task → leave pending", () => {
		const pb: BoardSnapshot = { tasks: [{ id: 7, subject: "queued", status: "pending" }], nextId: 8 };
		const a: AuditAnswers = {
			lifecycle: { task_status_7: ans("blocked", 0.9) },
		};
		const r = decide(a, pb, 0.5, 10);
		if (r.kind === "inject") expect(r.text).toContain("leave #7");
		else expect.unreachable();
	});
});
