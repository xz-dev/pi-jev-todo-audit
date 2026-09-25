import { describe, expect, mock, test } from "bun:test";
import { buildAuditRequest, runAudit, NOT_ON_BOARD, type AuditRequest } from "../typesafe.js";
import type { BoardSnapshot } from "../board.js";

const board: BoardSnapshot = {
	tasks: [
		{ id: 3, subject: "Write parser", status: "in_progress", activeForm: "writing parser" },
		{ id: 5, subject: "Add tests", status: "pending" },
		{ id: 9, subject: "Old task", status: "deleted" },
	],
	nextId: 10,
};

describe("typesafe request", () => {
	test("non-empty board → 5 questions, no board_warranted", () => {
		const req = buildAuditRequest(board, "edited parser.ts", "jev-latest");
		expect(req.model).toBe("jev-latest");
		expect(Object.keys(req.questions).sort()).toEqual(["alignment", "current_match", "drift", "granularity", "task_status_3", "task_status_5"]);
		for (const q of Object.values(req.questions)) expect(q.type).toBe("choice");
	});

	test("all-done board → board_warranted included", () => {
		const doneBoard: BoardSnapshot = {
			tasks: [{ id: 1, subject: "done", status: "completed" }, { id: 2, subject: "also done", status: "completed" }],
			nextId: 3,
		};
		const req = buildAuditRequest(doneBoard, "x", "jev-latest");
		expect(req.questions.board_warranted).toBeDefined();
	});

	test("pending-only board → board_warranted included", () => {
		const pendingBoard: BoardSnapshot = {
			tasks: [{ id: 1, subject: "queued", status: "pending" }],
			nextId: 2,
		};
		const req = buildAuditRequest(pendingBoard, "x", "jev-latest");
		expect(req.questions.board_warranted).toBeDefined();
	});

	test("state embeds board rows + activity", () => {
		const req = buildAuditRequest(board, "edited parser.ts", "jev-latest");
		expect(req.state).toContain("[in_progress] #3 Write parser (writing parser)");
		expect(req.state).toContain("edited parser.ts");
	});

	test("current_match options = visible tasks + not_on_board (deleted excluded)", () => {
		const req = buildAuditRequest(board, "x", "jev-latest");
		const crit = req.questions.current_match.criteria as Record<string, string>;
		expect(Object.keys(crit).sort()).toEqual(["3", "5", NOT_ON_BOARD]);
		expect(crit["3"]).toContain("Write parser");
	});

	test("empty board → not_on_board only + board_warranted question present", () => {
		const req = buildAuditRequest({ tasks: [], nextId: 1 }, "x", "jev-latest");
		expect(req.state).toContain("(board is empty)");
		const crit = req.questions.current_match.criteria as Record<string, string>;
		expect(Object.keys(crit)).toEqual([NOT_ON_BOARD]);
		expect(req.questions.board_warranted).toBeDefined();
		expect(req.questions.granularity).toBeDefined();
		const bw = req.questions.board_warranted.criteria as Record<string, string>;
		expect(Object.keys(bw).sort()).toEqual(["idle", "trivial", "warranted"]);
	});

	test("per-task lifecycle question per unfinished task", () => {
		const req = buildAuditRequest(board, "x", "jev-latest");
		const q5 = req.questions.task_status_5;
		const q3 = req.questions.task_status_3;
		expect(q5).toBeDefined();
		expect(q3).toBeDefined();
		expect(q5.instructions).toContain("#5");
		expect(Object.keys(q5.criteria).sort()).toEqual([
			"actually_completed", "blocked", "cancelled", "deliberately_deferred", "future", "still_ongoing", "unclear",
		]);
		// deleted task #9 gets no question
		expect(req.questions.task_status_9).toBeUndefined();
	});

	test("terminalStop info serializes into state", () => {
		const req = buildAuditRequest(board, "x", "jev-latest", {
			stopKind: "AI_UNLOCK",
			reasonType: "JOB_DONE",
			reason: "work done",
		});
		expect(req.state).toContain("STOP_KIND: AI_UNLOCK");
		expect(req.state).toContain("REASON_TYPE: JOB_DONE");
		expect(req.state).toContain("REASON: work done");
	});

	test("no terminalStop → no stop block in state", () => {
		const req = buildAuditRequest(board, "x", "jev-latest");
		expect(req.state).not.toContain("STOP_KIND");
	});
});

describe("typesafe client", () => {
	const req: AuditRequest = buildAuditRequest(board, "x", "jev-latest");
	const opts = { apiUrl: "https://x.test/v1/systemone", apiKey: "k", timeoutMs: 1000 };

	test("ok response → parsed answers", async () => {
		const fetchFn = mock(async () => new Response(JSON.stringify({
			answers: { alignment: { choice: "aligned", confidence: 0.9, probabilities: { aligned: 0.9 } } },
		}), { status: 200 }));
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn });
		expect(res.ok).toBe(true);
		if (res.ok) expect(res.answers.alignment?.choice).toBe("aligned");
		const call = (fetchFn as any).mock.calls[0];
		expect(call[0]).toBe(opts.apiUrl);
		expect(JSON.parse(call[1].body as string).model).toBe("jev-latest");
		expect((call[1].headers as Record<string, string>).authorization).toBe("Bearer k");
	});

	test("HTTP error → ok:false, no throw", async () => {
		const fetchFn = mock(async () => new Response("nope", { status: 500 }));
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn });
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toContain("HTTP 500");
	});

	test("network failure → ok:false, no throw", async () => {
		const fetchFn = mock(async () => { throw new Error("boom"); });
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn });
		expect(res.ok).toBe(false);
		if (!res.ok) expect(res.error).toBe("boom");
	});

	test("malformed body → ok:false", async () => {
		const fetchFn = mock(async () => new Response("{}", { status: 200 }));
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn });
		expect(res.ok).toBe(false);
	});

	test("task_status_* answers fold into lifecycle map; garbage keys dropped", async () => {
		const fetchFn = mock(async () => new Response(JSON.stringify({
			answers: {
				alignment: { choice: "aligned", confidence: 0.9 },
				task_status_5: { choice: "actually_completed", confidence: 0.9 },
				task_status_7: { choice: "still_ongoing", confidence: 0.8 },
				bogus_key: { choice: "x" },
				junk: "not-an-object",
			},
		}), { status: 200 }));
		const res = await runAudit(req, { ...opts, fetchFn: fetchFn });
		expect(res.ok).toBe(true);
		if (res.ok) {
			expect(res.answers.lifecycle?.task_status_5?.choice).toBe("actually_completed");
			expect(res.answers.lifecycle?.task_status_7?.choice).toBe("still_ongoing");
			expect((res.answers as Record<string, unknown>).bogus_key).toBeUndefined();
			expect(res.answers.alignment?.choice).toBe("aligned");
		}
	});
});
