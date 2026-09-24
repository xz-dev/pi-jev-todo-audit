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
	test("single request carries all 4 choice questions", () => {
		const req = buildAuditRequest(board, "edited parser.ts", "jev-latest");
		expect(req.model).toBe("jev-latest");
		expect(Object.keys(req.questions).sort()).toEqual(["alignment", "current_match", "drift", "stale_status"]);
		for (const q of Object.values(req.questions)) expect(q.type).toBe("choice");
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

	test("empty board → not_on_board only", () => {
		const req = buildAuditRequest({ tasks: [], nextId: 1 }, "x", "jev-latest");
		expect(req.state).toContain("(board is empty)");
		const crit = req.questions.current_match.criteria as Record<string, string>;
		expect(Object.keys(crit)).toEqual([NOT_ON_BOARD]);
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
		expect(res).toEqual({ ok: false, error: "HTTP 500" });
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
});
