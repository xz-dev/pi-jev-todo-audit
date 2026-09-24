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
			stale_status: ans("actually_completed", 0.9),
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
			stale_status: ans("still_ongoing", 0.9),
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
			stale_status: ans("deliberately_deferred", 0.9),
			current_match: ans("7", 0.9),
			drift: ans("drifted", 0.9),
		};
		const r = decide(a, board, 0.5, 10);
		if (r.kind === "inject") {
			expect(r.text).toContain("drifted");
			expect(r.text).toContain("STOP");
		} else expect.unreachable();
	});

	test("low confidence on any used answer → notify, no inject", () => {
		const a: AuditAnswers = {
			alignment: ans("not_aligned", 0.9),
			stale_status: ans("actually_completed", 0.3),
			current_match: ans("7", 0.9),
			drift: ans("on_track", 0.9),
		};
		const r = decide(a, board, 0.5, 10);
		expect(r.kind).toBe("notify");
	});

	test("low-confidence drift does NOT block injection (gating only applies to driving answers)", () => {
		const a: AuditAnswers = {
			alignment: ans("not_aligned", 0.9),
			stale_status: ans("actually_completed", 0.9),
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
			stale_status: ans("actually_completed", 0.9),
			current_match: ans("7", 0.9),
			drift: ans("drifted", 0.9),
		};
		const r = decide(a, board, 0.5, 10);
		if (r.kind === "inject") expect(r.text).toContain("STOP");
		else expect.unreachable();
	});
});
